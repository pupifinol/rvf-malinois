import { z } from 'zod';

/**
 * Trends — query + response contracts (F4.4F + F4.6F.1).
 *
 * F4 stores telemetry in `telemetry_readings` (canonical, append-only, plain
 * PostgreSQL — no TimescaleDB). The F4.4F reactivation shipped a read-only
 * range-scan endpoint that returned raw rows in the stored engineering unit
 * (no conversion at read time). F4.6F.1 extends that same endpoint — does not
 * replace, does not parallel — with optional server-side bucketing
 * (`bucket` / `aggregate` / `qualityPolicy` query params), implemented via
 * plain-PostgreSQL `date_bin` + `generate_series` LEFT JOIN. **Raw-mode
 * behavior and response shape stay byte-identical** to F4.4F so the F4.5E
 * frontend adapter and existing service-spec tests keep working unchanged.
 *
 * The Quality / Source string literals below mirror the CHECK constraints
 * declared in `apps/backend/prisma/migrations/20260524000000_f4_2_baseline/migration.sql`:
 *   CHECK (quality IN ('good', 'uncertain', 'bad'))
 *   CHECK (source  IN ('mock','manual','field_gateway','historian','plc',
 *                      'mqtt','node_red','opc_ua','modbus','edge_gateway'))
 * Prisma does not model CHECK constraints; these tuples are the
 * application-side mirror used for query-filter validation.
 */

export const TELEMETRY_QUALITIES = ['good', 'uncertain', 'bad'] as const;
export type TelemetryQuality = (typeof TELEMETRY_QUALITIES)[number];

export const TELEMETRY_SOURCES = [
  'mock',
  'manual',
  'field_gateway',
  'historian',
  'plc',
  'mqtt',
  'node_red',
  'opc_ua',
  'modbus',
  'edge_gateway',
] as const;
export type TelemetrySource = (typeof TELEMETRY_SOURCES)[number];

/** Max points the raw-mode read endpoint will return per request (defends server memory). */
export const TRENDS_LIMIT_MAX = 5_000;
/** Default points per request when the caller does not provide `limit`. */
export const TRENDS_LIMIT_DEFAULT = 1_000;

// =============================================================================
// F4.6F.1 — bucketed mode
// =============================================================================

/**
 * Allowed `bucket` enum values. Fixed, finite set per F4.6F-0 §7.4 — keeps
 * the bucket-count cap calculation simple and resists arbitrary-interval
 * abuse. Each maps to a PostgreSQL `interval` literal used inside the
 * `date_bin` aggregation (see `trends.service.ts`).
 */
export const TRENDS_BUCKETS = ['1m', '5m', '15m', '1h', '1d'] as const;
export type TrendsBucket = (typeof TRENDS_BUCKETS)[number];

/** Bucket width in milliseconds — used by the cap-overflow refine in Zod. */
export const TRENDS_BUCKET_MS: Record<TrendsBucket, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '1d': 86_400_000,
};

/**
 * Allowed `aggregate` enum values. One aggregation per request in F4.6F.1
 * (multi-aggregation per call is deferred — candidate F4.6F.3).
 */
export const TRENDS_AGGREGATES = ['avg', 'min', 'max', 'count', 'first', 'last'] as const;
export type TrendsAggregate = (typeof TRENDS_AGGREGATES)[number];

/**
 * Allowed `qualityPolicy` enum values. Default in bucketed mode is
 * `'good_only'` — matches the F4.6C.1 projection convention ("only `good`
 * flows into derived state"). For raw mode the legacy `quality` filter
 * remains the only quality-related lever; supplying `qualityPolicy` in raw
 * mode is rejected at validation time as ambiguous.
 */
export const TRENDS_QUALITY_POLICIES = ['good_only', 'include_uncertain', 'include_all'] as const;
export type TrendsQualityPolicy = (typeof TRENDS_QUALITY_POLICIES)[number];

/**
 * Max bucket count per bucketed request. Rationale (per F4.6F-0 §10.2): a
 * typical chart is 800–1200 pixels wide; 1500 is a comfortable upper bound
 * that resists abuse without breaking the common 24h-at-1m or 5d-at-5m cases.
 * The refine below bites in the controller before any DB call, so a 10-year
 * window at `bucket='1m'` is rejected immediately.
 */
export const TRENDS_BUCKETS_MAX = 1_500;

// =============================================================================
// Request schema
// =============================================================================

/**
 * Trend-query schema for the controller's Zod pipe. UUIDs are required at the
 * call boundary; date strings (`from`, `to`) are coerced; one of
 * `canonicalTagId` / `canonicalTagName` is required and supplying both is
 * rejected as ambiguous (clearer than precedence rules).
 *
 * F4.6F.1 additions are all **optional** so the raw-mode call surface is
 * unchanged. `.refine()` chains enforce: `bucket` ↔ `aggregate` must appear
 * together; `qualityPolicy` may only appear with `bucket`; bucket-count
 * overflow is rejected before any DB call.
 */
export const TrendsQuerySchema = z
  .object({
    unitId: z.string().uuid(),
    from: z.coerce.date(),
    to: z.coerce.date(),
    canonicalTagId: z.string().uuid().optional(),
    canonicalTagName: z.string().min(1).max(64).optional(),
    jobId: z.string().uuid().optional(),
    quality: z.enum(TELEMETRY_QUALITIES).optional(),
    source: z.enum(TELEMETRY_SOURCES).optional(),
    limit: z.coerce.number().int().min(1).max(TRENDS_LIMIT_MAX).default(TRENDS_LIMIT_DEFAULT),
    bucket: z.enum(TRENDS_BUCKETS).optional(),
    aggregate: z.enum(TRENDS_AGGREGATES).optional(),
    qualityPolicy: z.enum(TRENDS_QUALITY_POLICIES).optional(),
  })
  .strict()
  .refine((q) => q.from.getTime() < q.to.getTime(), {
    message: '`from` must be strictly less than `to`',
    path: ['from'],
  })
  .refine((q) => Boolean(q.canonicalTagId) !== Boolean(q.canonicalTagName), {
    message:
      'exactly one of `canonicalTagId` or `canonicalTagName` must be provided ' +
      '(supplying both is rejected as ambiguous)',
    path: ['canonicalTagName'],
  })
  .refine((q) => Boolean(q.bucket) === Boolean(q.aggregate), {
    message:
      '`bucket` and `aggregate` must appear together: supply both for bucketed mode, ' +
      'or omit both for raw mode',
    path: ['aggregate'],
  })
  .refine((q) => !(q.qualityPolicy !== undefined && q.bucket === undefined), {
    message:
      '`qualityPolicy` is bucketed-mode only; raw mode uses `quality` for per-row filtering ' +
      '(supplying `qualityPolicy` without `bucket` is rejected as ambiguous)',
    path: ['qualityPolicy'],
  })
  .refine(
    (q) => {
      if (q.bucket === undefined) return true;
      const span = q.to.getTime() - q.from.getTime();
      const count = Math.ceil(span / TRENDS_BUCKET_MS[q.bucket]);
      return count <= TRENDS_BUCKETS_MAX;
    },
    (q) => {
      const span = q.to.getTime() - q.from.getTime();
      const count = q.bucket ? Math.ceil(span / TRENDS_BUCKET_MS[q.bucket]) : 0;
      return {
        message:
          `requested window would produce ${String(count)} buckets at bucket='${String(q.bucket)}' ` +
          `(max ${String(TRENDS_BUCKETS_MAX)}); pick a coarser bucket or a narrower window`,
        path: ['bucket'],
      };
    },
  );

export type TrendsQuery = z.infer<typeof TrendsQuerySchema>;

// =============================================================================
// Response shape
// =============================================================================

/** Single raw point on the trend series. `value` is a Prisma `Decimal` that
 *  JSON-serializes to a string via `Decimal.toJSON`; consumers parse to
 *  `Number` if they need numeric math (raw mode does no conversion at read
 *  time). */
export interface TrendPoint {
  timestamp: Date;
  value: unknown;
  engineeringUnit: string;
  quality: string;
  source: string;
}

/**
 * Single bucket on the trend series — F4.6F.1.
 *
 * `value` is a JSON number rather than a Decimal-as-string because aggregation
 * already returns a number from PostgreSQL (`AVG`, `MIN`, `MAX`, `COUNT`).
 * For `'first'` / `'last'` (Decimal-typed row values), the service coerces
 * to `Number` for consistency; callers needing full Decimal precision should
 * use raw mode.
 *
 * `value === null` AND `sampleCount === 0` whenever no rows fell into the
 * bucket (post quality / qualityPolicy filter). Empty buckets are emitted so
 * charts can render gaps explicitly (per F4.6F-0 §7.6).
 */
export interface TrendBucket {
  /** ISO-8601 — left edge (inclusive). */
  bucketStart: Date;
  /** ISO-8601 — right edge (exclusive). */
  bucketEnd: Date;
  /** Aggregated value; `null` when `sampleCount === 0`. */
  value: number | null;
  /** Rows that entered the aggregation (post quality / quality-policy filter). */
  sampleCount: number;
}

/**
 * Full trends response shape.
 *
 * Raw mode (the F4.4F path; no `bucket` supplied): `points` is populated;
 * `bucket` / `aggregate` / `qualityPolicy` / `buckets` are absent.
 *
 * Bucketed mode (F4.6F.1; `bucket` and `aggregate` supplied): `points` is
 * the empty array (kept on the wire to keep the shape stable for clients
 * that always destructure it); `bucket` / `aggregate` / `qualityPolicy` /
 * `buckets` are populated.
 */
export interface TrendsResponse {
  unitId: string;
  canonicalTag: {
    id: string;
    name: string;
    displayName: string;
    canonicalUnit: string;
    category: string;
    precision: number;
  };
  range: { from: Date; to: Date };
  points: TrendPoint[];
  /** Bucketed-mode metadata. Absent in raw mode. */
  bucket?: TrendsBucket;
  aggregate?: TrendsAggregate;
  qualityPolicy?: TrendsQualityPolicy;
  buckets?: TrendBucket[];
}
