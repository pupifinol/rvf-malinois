import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { CanonicalTagResolver } from './canonical-tag-resolver';

import type {
  TrendBucket,
  TrendsAggregate,
  TrendsBucket,
  TrendsQualityPolicy,
  TrendsQuery,
  TrendsResponse,
} from './contracts/trends';
import type { CallerContext } from '../common/caller-context';

/**
 * TrendsService — F4.4F + F4.6F.1.
 *
 * Read-only range scan against `telemetry_readings`. F1's hypertable +
 * continuous-aggregate routing (`telemetry_1m / 15m / 1h` views) was retired
 * for F4. F4 stores telemetry in a plain PostgreSQL table and indexes the
 * access paths called out in F4 §F.
 *
 * **F4.4F (raw mode) — unchanged.** When the request has no `bucket`, the
 * service runs the F4.4F `findMany` and returns raw rows in their stored
 * engineering unit (no conversion at read time). Per F4 §F: every reading
 * carries `engineering_unit` so consumers can render exactly what the device
 * sent. Conversion to a canonical unit, when needed, belongs to the caller.
 * The raw-mode response shape stays byte-identical so the F4.5E frontend
 * adapter and existing service-spec tests keep working.
 *
 * **F4.6F.1 (bucketed mode) — new.** When the request has `bucket` (and
 * therefore `aggregate`, per the Zod refine), the service runs a plain-
 * PostgreSQL `$queryRaw` that bins rows with `date_bin(interval, ts,
 * '2000-01-01'::timestamp)` and LEFT JOINs the result against a
 * `generate_series` bucket grid so empty buckets are emitted with
 * `sampleCount: 0, value: null` (per F4.6F-0 §7.6). The `(unit_id,
 * canonical_tag_id, timestamp DESC)` index from F4 §F is the access path —
 * **no new index is needed**.
 *
 * Tenant scoping seam: identical posture to F4.4A → F4.4E — when
 * `ctx.tenantId` is set, the query filters by tenant; otherwise reads are
 * cross-tenant (the F1 SystemContext default). Inherited by both modes.
 */
@Injectable()
export class TrendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: CanonicalTagResolver,
  ) {}

  async query(ctx: CallerContext, input: TrendsQuery): Promise<TrendsResponse> {
    const tag = await this.resolver.resolve({
      id: input.canonicalTagId,
      name: input.canonicalTagName,
    });

    const header = {
      unitId: input.unitId,
      canonicalTag: {
        id: tag.id,
        name: tag.name,
        displayName: tag.displayName,
        canonicalUnit: tag.canonicalUnit,
        category: tag.category,
        precision: tag.precision,
      },
      range: { from: input.from, to: input.to },
    };

    // F4.4F — raw mode. Behavior preserved verbatim.
    if (input.bucket === undefined) {
      const rows = await this.prisma.telemetryReading.findMany({
        where: {
          ...(ctx.tenantId ? { tenantId: ctx.tenantId } : {}),
          unitId: input.unitId,
          canonicalTagId: tag.id,
          timestamp: { gte: input.from, lt: input.to },
          ...(input.jobId ? { jobId: input.jobId } : {}),
          ...(input.quality ? { quality: input.quality } : {}),
          ...(input.source ? { source: input.source } : {}),
        },
        select: {
          timestamp: true,
          value: true,
          engineeringUnit: true,
          quality: true,
          source: true,
        },
        orderBy: { timestamp: 'asc' },
        take: input.limit,
      });

      return { ...header, points: rows };
    }

    // F4.6F.1 — bucketed mode. The Zod refine enforces that `aggregate` is
    // defined whenever `bucket` is; the guard below narrows the type cleanly
    // without a non-null assertion (lint disallows both styles otherwise).
    if (input.aggregate === undefined) {
      // Unreachable in practice — the Zod refine rejects this earlier.
      throw new Error('aggregate is required when bucket is set');
    }
    const aggregate: TrendsAggregate = input.aggregate;
    const qualityPolicy: TrendsQualityPolicy = input.qualityPolicy ?? 'good_only';

    const buckets = await this.runBucketedQuery({
      tenantId: ctx.tenantId ?? null,
      unitId: input.unitId,
      canonicalTagId: tag.id,
      from: input.from,
      to: input.to,
      bucket: input.bucket,
      aggregate,
      qualityPolicy,
      jobId: input.jobId ?? null,
      quality: input.quality ?? null,
      source: input.source ?? null,
    });

    return {
      ...header,
      points: [],
      bucket: input.bucket,
      aggregate,
      qualityPolicy,
      buckets,
    };
  }

  private async runBucketedQuery(args: {
    tenantId: string | null;
    unitId: string;
    canonicalTagId: string;
    from: Date;
    to: Date;
    bucket: TrendsBucket;
    aggregate: TrendsAggregate;
    qualityPolicy: TrendsQualityPolicy;
    jobId: string | null;
    quality: string | null;
    source: string | null;
  }): Promise<TrendBucket[]> {
    const intervalLiteral = BUCKET_INTERVAL_LITERAL[args.bucket];
    const aggregateExpr = aggregateExpression(args.aggregate);
    const policyFilter = qualityPolicyFilter(args.qualityPolicy);
    const tenantFilter = args.tenantId
      ? Prisma.sql`AND tenant_id = ${args.tenantId}::uuid`
      : Prisma.empty;
    const jobFilter = args.jobId ? Prisma.sql`AND job_id = ${args.jobId}::uuid` : Prisma.empty;
    // Existing F4.4F `quality` filter — strict equality. When combined with
    // `qualityPolicy` it is applied as an additional row filter BEFORE the
    // policy filter (the two are independent: `quality` selects rows; the
    // policy then decides which selected rows enter the aggregator).
    const qualityFilter = args.quality ? Prisma.sql`AND quality = ${args.quality}` : Prisma.empty;
    const sourceFilter = args.source ? Prisma.sql`AND source = ${args.source}` : Prisma.empty;

    interface RawRow {
      bucket_start: Date;
      bucket_end: Date;
      value: Prisma.Decimal | number | bigint | null;
      sample_count: number | bigint;
    }

    const rows = await this.prisma.$queryRaw<RawRow[]>(Prisma.sql`
      WITH bucket_grid AS (
        SELECT generate_series(
          date_bin(${intervalLiteral}::interval, ${args.from}::timestamptz, '2000-01-01'::timestamp),
          ${args.to}::timestamptz - interval '1 microsecond',
          ${intervalLiteral}::interval
        ) AS bucket_start
      ),
      agg AS (
        SELECT
          date_bin(${intervalLiteral}::interval, "timestamp", '2000-01-01'::timestamp) AS bucket_start,
          ${aggregateExpr} AS value,
          COUNT(*)::int AS sample_count
        FROM telemetry_readings
        WHERE unit_id = ${args.unitId}::uuid
          AND canonical_tag_id = ${args.canonicalTagId}::uuid
          AND "timestamp" >= ${args.from}::timestamptz
          AND "timestamp" < ${args.to}::timestamptz
          ${tenantFilter}
          ${jobFilter}
          ${qualityFilter}
          ${policyFilter}
          ${sourceFilter}
        GROUP BY bucket_start
      )
      SELECT
        bg.bucket_start AS bucket_start,
        (bg.bucket_start + ${intervalLiteral}::interval) AS bucket_end,
        agg.value AS value,
        COALESCE(agg.sample_count, 0)::int AS sample_count
      FROM bucket_grid bg
      LEFT JOIN agg ON agg.bucket_start = bg.bucket_start
      ORDER BY bg.bucket_start ASC
    `);

    return rows.map((row) => ({
      bucketStart: row.bucket_start,
      bucketEnd: row.bucket_end,
      value: row.value === null || row.value === undefined ? null : Number(row.value),
      sampleCount:
        typeof row.sample_count === 'bigint' ? Number(row.sample_count) : row.sample_count,
    }));
  }
}

/**
 * PostgreSQL `interval` literal per allowed `bucket` enum value. Used inside
 * `Prisma.sql` as a parameter (`${literal}::interval`) — not as a SQL
 * identifier, so user input cannot reach this map and only the fixed
 * server-controlled strings below are ever passed.
 */
const BUCKET_INTERVAL_LITERAL: Record<TrendsBucket, string> = {
  '1m': '1 minute',
  '5m': '5 minutes',
  '15m': '15 minutes',
  '1h': '1 hour',
  '1d': '1 day',
};

/**
 * SQL aggregate expression for the per-bucket value. Returned as
 * `Prisma.sql` so the composition stays parameterized — the aggregate name
 * itself is from a server-controlled enum, never from user input.
 *
 * For `'first'` / `'last'` the standard array_agg + sort + [1] pattern
 * works in any PostgreSQL version. AVG / MIN / MAX / COUNT are direct.
 */
function aggregateExpression(aggregate: TrendsAggregate): Prisma.Sql {
  switch (aggregate) {
    case 'avg':
      return Prisma.sql`AVG("value")`;
    case 'min':
      return Prisma.sql`MIN("value")`;
    case 'max':
      return Prisma.sql`MAX("value")`;
    case 'count':
      return Prisma.sql`COUNT(*)::numeric`;
    case 'first':
      return Prisma.sql`(array_agg("value" ORDER BY "timestamp" ASC))[1]`;
    case 'last':
      return Prisma.sql`(array_agg("value" ORDER BY "timestamp" DESC))[1]`;
  }
}

/**
 * Quality-policy filter fragment. Default `'good_only'` matches the F4.6C.1
 * projection convention — only `good` rows flow into derived state.
 */
function qualityPolicyFilter(policy: TrendsQualityPolicy): Prisma.Sql {
  switch (policy) {
    case 'good_only':
      return Prisma.sql`AND quality = 'good'`;
    case 'include_uncertain':
      return Prisma.sql`AND quality IN ('good', 'uncertain')`;
    case 'include_all':
      return Prisma.empty;
  }
}
