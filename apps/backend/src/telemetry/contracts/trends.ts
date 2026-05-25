import { z } from 'zod';

/**
 * Trends — query + response contracts (F4.4F).
 *
 * F4 stores telemetry in `telemetry_readings` (canonical, append-only, plain
 * PostgreSQL — no TimescaleDB). The reactivated trends endpoint is read-only
 * and intentionally simple: it returns the raw rows in the stored engineering
 * unit (no conversion at read time). F4.6 will design any downstream
 * aggregate / bucketed views; F4.4F covers only the raw range scan against
 * `(unit_id, canonical_tag_id, timestamp)`.
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

/** Max points the read endpoint will return per request (defends server memory). */
export const TRENDS_LIMIT_MAX = 5_000;
/** Default points per request when the caller does not provide `limit`. */
export const TRENDS_LIMIT_DEFAULT = 1_000;

/**
 * Trend-query schema for the controller's Zod pipe. UUIDs are required at the
 * call boundary; date strings (`from`, `to`) are coerced; one of
 * `canonicalTagId` / `canonicalTagName` is required and supplying both is
 * rejected as ambiguous (clearer than precedence rules).
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
  });
export type TrendsQuery = z.infer<typeof TrendsQuerySchema>;

/** Single point on the trend series. `value` is a Prisma `Decimal` that
 *  JSON-serializes to a string via `Decimal.toJSON`; consumers parse to
 *  `Number` if they need numeric math (F4.4F does no conversion at read
 *  time). */
export interface TrendPoint {
  timestamp: Date;
  value: unknown;
  engineeringUnit: string;
  quality: string;
  source: string;
}

/** Full trends response shape. `canonicalTag` is hydrated with the F4
 *  dictionary metadata so the response is self-describing. */
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
}
