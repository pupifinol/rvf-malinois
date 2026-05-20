import { NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient, Quality } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type PrismaService } from '../prisma/prisma.service';

import { CanonicalTagResolver } from './canonical-tag-resolver';
import { TrendsService } from './trends.service';
import { UnitConverter } from './unit-converter';

/**
 * Trend-query tests. Seeds a small window of raw telemetry around a fixed
 * timestamp anchor, then exercises:
 *   - raw query with identity unit (psi → psi)
 *   - raw query with conversion (kPa → psi at query time)
 *   - aggregate query routing (empty result is a valid passing case;
 *     populated aggregates land in F1.5.4 via the generator)
 *   - error paths: unknown job, unknown canonical tag
 *
 * Test fixtures are scoped by a `seq` band so they don't collide with the
 * generator's data (which will own seq >= 1,000,000).
 */

const TEST_SEQ_BASE = 500_000;

describe('TrendsService (F1.5.3)', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const resolver = new CanonicalTagResolver(prisma);
  const converter = new UnitConverter();
  const service = new TrendsService(prisma, resolver, converter);

  // Window anchored well in the past so it doesn't drift into the
  // continuous-aggregate refresh window.
  const ANCHOR = new Date('2025-01-01T00:00:00.000Z');
  const window = (offsetSec: number): Date => new Date(ANCHOR.getTime() + offsetSec * 1000);

  let jobId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const job = await prisma.job.findUnique({ where: { code: 'JOB-2026-0001' } });
    if (!job) throw new Error('seed missing — run `pnpm prisma:seed`');
    jobId = job.id;

    // Seed: 5 rows for p_inlet (3 psi, 2 kPa), 1 bad-quality row.
    await prisma.telemetry.createMany({
      data: [
        {
          ts: window(0),
          jobId,
          canonicalTagName: 'p_inlet',
          value: 1200,
          valueUnit: 'psi',
          quality: Quality.good,
          seq: BigInt(TEST_SEQ_BASE + 1),
          unitId: 'EMMAD-01',
          sensorInstrumentTag: 'PIT-003',
          sourceAdapter: 'trends-spec',
        },
        {
          ts: window(1),
          jobId,
          canonicalTagName: 'p_inlet',
          value: 1210,
          valueUnit: 'psi',
          quality: Quality.good,
          seq: BigInt(TEST_SEQ_BASE + 2),
          unitId: 'EMMAD-01',
          sensorInstrumentTag: 'PIT-003',
          sourceAdapter: 'trends-spec',
        },
        {
          ts: window(2),
          jobId,
          canonicalTagName: 'p_inlet',
          value: 1220,
          valueUnit: 'psi',
          quality: Quality.good,
          seq: BigInt(TEST_SEQ_BASE + 3),
          unitId: 'EMMAD-01',
          sensorInstrumentTag: 'PIT-003',
          sourceAdapter: 'trends-spec',
        },
        {
          ts: window(3),
          jobId,
          canonicalTagName: 'p_inlet',
          value: 8350,
          valueUnit: 'kPa',
          quality: Quality.good,
          seq: BigInt(TEST_SEQ_BASE + 4),
          unitId: 'EMMAD-01',
          sensorInstrumentTag: 'PIT-003',
          sourceAdapter: 'trends-spec',
        },
        {
          ts: window(4),
          jobId,
          canonicalTagName: 'p_inlet',
          value: 0,
          valueUnit: 'psi',
          quality: Quality.bad,
          seq: BigInt(TEST_SEQ_BASE + 5),
          unitId: 'EMMAD-01',
          sensorInstrumentTag: 'PIT-003',
          sourceAdapter: 'trends-spec',
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM telemetry
      WHERE source_adapter = 'trends-spec'
        AND seq >= ${TEST_SEQ_BASE}
        AND seq <  ${TEST_SEQ_BASE + 1000}
    `);
    await prisma.$disconnect();
  });

  it('raw bucket returns samples in canonical unit (psi identity)', async () => {
    const result = await service.query({
      jobCode: 'JOB-2026-0001',
      canonicalTagName: 'p_inlet',
      fromTs: window(0),
      toTs: window(10),
      bucket: 'raw',
      limit: 100,
    });

    expect(result.aggregates).toHaveLength(0);
    expect(result.samples.length).toBe(5);
    expect(result.samples[0]?.canonicalUnit).toBe('psi');
    expect(result.samples[0]?.value).toBeCloseTo(1200, 6);
    expect(result.samples[0]?.storedUnit).toBe('psi');
  });

  it('raw bucket converts kPa → psi at query time without touching storage', async () => {
    const result = await service.query({
      jobCode: 'JOB-2026-0001',
      canonicalTagName: 'p_inlet',
      fromTs: window(3),
      toTs: window(4),
      bucket: 'raw',
      limit: 10,
    });

    expect(result.samples).toHaveLength(1);
    const [sample] = result.samples;
    if (!sample) throw new Error('expected one converted sample');
    // 8350 kPa * 0.1450377 ≈ 1211.06 psi
    expect(sample.value).toBeCloseTo(8350 * 0.1450377, 2);
    expect(sample.canonicalUnit).toBe('psi');
    expect(sample.storedUnit).toBe('kPa');
  });

  it('raw bucket preserves quality so the consumer can filter', async () => {
    const result = await service.query({
      jobCode: 'JOB-2026-0001',
      canonicalTagName: 'p_inlet',
      fromTs: window(0),
      toTs: window(10),
      bucket: 'raw',
      limit: 100,
    });
    const bad = result.samples.filter((s) => s.quality === 'bad');
    expect(bad).toHaveLength(1);
    expect(bad[0]?.value).toBe(0);
  });

  it('raw bucket honours the time window (exclusive on toTs)', async () => {
    const result = await service.query({
      jobCode: 'JOB-2026-0001',
      canonicalTagName: 'p_inlet',
      fromTs: window(1),
      toTs: window(3),
      bucket: 'raw',
      limit: 100,
    });
    expect(result.samples).toHaveLength(2);
    expect(result.samples[0]?.ts.toISOString()).toBe(window(1).toISOString());
    expect(result.samples[1]?.ts.toISOString()).toBe(window(2).toISOString());
  });

  it('throws NotFound when the job code does not exist', async () => {
    await expect(
      service.query({
        jobCode: 'JOB-NO-SUCH',
        canonicalTagName: 'p_inlet',
        fromTs: window(0),
        toTs: window(10),
        bucket: 'raw',
        limit: 100,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFound when the canonical tag is not in the job snapshot', async () => {
    await expect(
      service.query({
        jobCode: 'JOB-2026-0001',
        canonicalTagName: 'gor', // valid tag, but not in EMMAD-01's snapshot
        fromTs: window(0),
        toTs: window(10),
        bucket: 'raw',
        limit: 100,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('1m bucket routes to the telemetry_1m view (empty result is valid)', async () => {
    const result = await service.query({
      jobCode: 'JOB-2026-0001',
      canonicalTagName: 'p_inlet',
      fromTs: window(0),
      toTs: window(60),
      bucket: '1m',
      limit: 100,
    });
    expect(result.samples).toHaveLength(0);
    // Aggregates may be empty until the continuous-aggregate refresh has
    // run; the routing should still succeed without error.
    expect(Array.isArray(result.aggregates)).toBe(true);
  });

  it('15m and 1h buckets route without error', async () => {
    for (const bucket of ['15m', '1h'] as const) {
      const result = await service.query({
        jobCode: 'JOB-2026-0001',
        canonicalTagName: 'p_inlet',
        fromTs: window(0),
        toTs: window(24 * 60 * 60),
        bucket,
        limit: 100,
      });
      expect(Array.isArray(result.aggregates)).toBe(true);
    }
  });
});
