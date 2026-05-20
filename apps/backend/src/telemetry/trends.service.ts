import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Quality } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { CanonicalTagResolver } from './canonical-tag-resolver';
import {
  type BucketAggregate,
  type BucketSize,
  type QualityMix,
  type RawSample,
  type TrendQuery,
} from './contracts/trends';
import { UnitConverter } from './unit-converter';

/**
 * TrendsService — read-only access to the hypertable + continuous aggregates.
 *
 * Routing:
 *   bucket: 'raw' → SELECT from `telemetry` (the hypertable). Returns
 *                   RawSample[] with quality preserved per row.
 *   bucket: '1m'  → SELECT from `telemetry_1m` (continuous aggregate view).
 *   bucket: '15m' → SELECT from `telemetry_15m`.
 *   bucket: '1h'  → SELECT from `telemetry_1h`.
 *
 * The aggregate views ALREADY split rows by `value_unit` (see migration);
 * this service converts each row's value to the canonical unit at read time
 * using UnitConverter. Storage is never modified (F1.5 guidance #6).
 *
 * All queries go through Prisma raw SQL because:
 *   - The continuous aggregate views aren't Prisma models.
 *   - Even the raw `telemetry` table benefits from explicit column ordering
 *     and parameterised LIMITs over the hypertable index.
 */
@Injectable()
export class TrendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: CanonicalTagResolver,
    private readonly converter: UnitConverter,
  ) {}

  async query(input: TrendQuery): Promise<{ samples: RawSample[]; aggregates: BucketAggregate[] }> {
    const job = await this.prisma.job.findUnique({
      where: { code: input.jobCode },
      select: { id: true },
    });
    if (!job) {
      throw new NotFoundException(`Job '${input.jobCode}' not found.`);
    }

    // Resolve the canonical unit from the frozen snapshot — never the live
    // catalog. The resolver matches by instrument tag, but here we have the
    // canonical tag name; look up the snapshot row directly.
    const snapshotRow = await this.prisma.jobSensorSnapshot.findFirst({
      where: {
        canonicalTagName: input.canonicalTagName,
        snapshot: { jobId: job.id },
      },
      select: { unit: true },
    });
    if (!snapshotRow) {
      throw new NotFoundException(
        `Job '${input.jobCode}' has no commissioning snapshot entry for canonical tag '${input.canonicalTagName}'.`,
      );
    }
    const canonicalUnit = snapshotRow.unit;

    if (input.bucket === 'raw') {
      const samples = await this.queryRaw(job.id, input, canonicalUnit);
      return { samples, aggregates: [] };
    }
    const aggregates = await this.queryAggregate(job.id, input, input.bucket, canonicalUnit);
    return { samples: [], aggregates };
  }

  // ─── Raw path ─────────────────────────────────────────────────────────────

  private async queryRaw(
    jobId: string,
    input: TrendQuery,
    canonicalUnit: string,
  ): Promise<RawSample[]> {
    const rows = await this.prisma.$queryRaw<
      { ts: Date; value: number; value_unit: string; quality: Quality }[]
    >(Prisma.sql`
      SELECT ts, value, value_unit, quality
      FROM telemetry
      WHERE job_id = ${jobId}
        AND canonical_tag_name = ${input.canonicalTagName}
        AND ts >= ${input.fromTs}
        AND ts <  ${input.toTs}
      ORDER BY ts ASC
      LIMIT ${input.limit}
    `);

    return rows.map((r) => ({
      ts: r.ts,
      value: this.converter.convert(r.value, r.value_unit, canonicalUnit),
      canonicalUnit,
      quality: r.quality,
      storedUnit: r.value_unit,
    }));
  }

  // ─── Bucketed path ────────────────────────────────────────────────────────

  private async queryAggregate(
    jobId: string,
    input: TrendQuery,
    bucket: Exclude<BucketSize, 'raw'>,
    canonicalUnit: string,
  ): Promise<BucketAggregate[]> {
    const view = AGGREGATE_VIEW[bucket];
    const rows = await this.prisma.$queryRaw<AggregateRow[]>(Prisma.sql`
      SELECT
        bucket,
        value_unit,
        sample_count,
        good_count,
        estimated_count,
        uncertain_count,
        bad_count,
        stale_count,
        value_min,
        value_max,
        value_avg,
        value_first,
        value_last
      FROM ${Prisma.raw(view)}
      WHERE job_id = ${jobId}
        AND canonical_tag_name = ${input.canonicalTagName}
        AND bucket >= ${input.fromTs}
        AND bucket <  ${input.toTs}
      ORDER BY bucket ASC
      LIMIT ${input.limit}
    `);

    return rows.map((r): BucketAggregate => {
      const qualityMix: QualityMix = {
        good: Number(r.good_count),
        estimated: Number(r.estimated_count),
        uncertain: Number(r.uncertain_count),
        bad: Number(r.bad_count),
        stale: Number(r.stale_count),
      };
      const convertMaybe = (n: number | null): number | null =>
        n === null ? null : this.converter.convert(n, r.value_unit, canonicalUnit);

      return {
        bucketStart: r.bucket,
        bucketSize: bucket,
        sampleCount: Number(r.sample_count),
        qualityMix,
        valueMin: convertMaybe(r.value_min),
        valueMax: convertMaybe(r.value_max),
        valueAvg: convertMaybe(r.value_avg),
        valueFirst: convertMaybe(r.value_first),
        valueLast: convertMaybe(r.value_last),
        canonicalUnit,
        storedUnit: r.value_unit,
      };
    });
  }
}

const AGGREGATE_VIEW: Record<Exclude<BucketSize, 'raw'>, string> = {
  '1m': 'telemetry_1m',
  '15m': 'telemetry_15m',
  '1h': 'telemetry_1h',
};

interface AggregateRow {
  bucket: Date;
  value_unit: string;
  sample_count: bigint;
  good_count: bigint;
  estimated_count: bigint;
  uncertain_count: bigint;
  bad_count: bigint;
  stale_count: bigint;
  value_min: number | null;
  value_max: number | null;
  value_avg: number | null;
  value_first: number | null;
  value_last: number | null;
}
