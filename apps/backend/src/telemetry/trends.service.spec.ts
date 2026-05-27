import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { TRENDS_BUCKETS_MAX, TrendsQuerySchema } from './contracts/trends';
import { TrendsService } from './trends.service';

import type { CanonicalTagResolver } from './canonical-tag-resolver';
import type { CallerContext } from '../common/caller-context';
import type { PrismaService } from '../prisma/prisma.service';
import type { CanonicalTag } from '@prisma/client';

/**
 * Mocked-Prisma unit tests for TrendsService (F4.4F + F4.6F.1).
 *
 * F4.4F (raw mode) section — preserved verbatim from the F4.4F closeout. Asserts
 * the Prisma `where` / `orderBy` / `take` / `select` shape, the resolver
 * indirection, the tenant scoping seam, and the empty-result pass-through.
 *
 * F4.6F.1 (bucketed mode) section — adds:
 *   - bucketed-mode `$queryRaw` invocation (avg / min / max / count / first / last)
 *   - empty-bucket row mapping (sampleCount=0, value=null) preserved through the parser
 *   - qualityPolicy default and explicit-policy behavior
 *   - controller-level Zod validation of the new query-param refines
 *     (bucket↔aggregate XOR; qualityPolicy without bucket; bucket-count cap)
 */

interface TelemetryRow {
  timestamp: Date;
  value: unknown;
  engineeringUnit: string;
  quality: string;
  source: string;
}

interface FindManyArg {
  where?: Record<string, unknown>;
  select?: Record<string, unknown>;
  orderBy?: unknown;
  take?: number;
}

interface RawBucketRow {
  bucket_start: Date;
  bucket_end: Date;
  value: Prisma.Decimal | number | null;
  sample_count: number;
}

function tagFixture(overrides: Partial<CanonicalTag> = {}): CanonicalTag {
  return {
    id: '00000000-0000-0000-0000-0000000044f1',
    name: 'p_inlet',
    displayName: 'Inlet pressure',
    canonicalUnit: 'psi',
    category: 'pressure',
    precision: 1,
    description: 'Process pressure at the unit inlet manifold.',
    deprecated: false,
    createdAt: new Date('2026-05-24T00:00:00.000Z'),
    updatedAt: new Date('2026-05-24T00:00:00.000Z'),
    ...overrides,
  };
}

function rowFixture(overrides: Partial<TelemetryRow> = {}): TelemetryRow {
  return {
    timestamp: new Date('2026-05-24T00:00:30.000Z'),
    value: '4123.4',
    engineeringUnit: 'psi',
    quality: 'good',
    source: 'mock',
    ...overrides,
  };
}

function makeMocks() {
  const findMany = vi.fn<(args?: FindManyArg) => Promise<TelemetryRow[]>>(() =>
    Promise.resolve([]),
  );
  // F4.6F.1 — bucketed mode goes through $queryRaw. The mock returns whatever
  // the test queued via `mockResolvedValueOnce(...)`; the default is an empty
  // array so any test that forgets to queue raw rows still gets a sane result.
  const queryRaw = vi.fn<(query: Prisma.Sql) => Promise<RawBucketRow[]>>(() => Promise.resolve([]));
  const prisma = {
    telemetryReading: { findMany },
    $queryRaw: queryRaw,
  } as unknown as PrismaService;
  const resolve = vi.fn<(lookup: { id?: string; name?: string }) => Promise<CanonicalTag>>(() =>
    Promise.resolve(tagFixture()),
  );
  const resolver = { resolve } as unknown as CanonicalTagResolver;
  return { prisma, resolver, mocks: { findMany, queryRaw, resolve } };
}

const UNIT_ID = '00000000-0000-0000-0000-000000004411';
const FROM = new Date('2026-05-24T00:00:00.000Z');
const TO = new Date('2026-05-25T00:00:00.000Z');

// =============================================================================
// F4.4F — raw mode (preserved verbatim)
// =============================================================================

describe('TrendsService.query', () => {
  it('returns empty points + the canonical-tag metadata when telemetry_readings is empty', async () => {
    const tag = tagFixture();
    const { prisma, resolver, mocks } = makeMocks();
    mocks.resolve.mockResolvedValueOnce(tag);
    const service = new TrendsService(prisma, resolver);

    const result = await service.query(
      {},
      {
        unitId: UNIT_ID,
        from: FROM,
        to: TO,
        canonicalTagName: 'p_inlet',
        limit: 1000,
      },
    );

    expect(result.points).toEqual([]);
    expect(result.unitId).toBe(UNIT_ID);
    expect(result.range).toEqual({ from: FROM, to: TO });
    expect(result.canonicalTag).toEqual({
      id: tag.id,
      name: tag.name,
      displayName: tag.displayName,
      canonicalUnit: tag.canonicalUnit,
      category: tag.category,
      precision: tag.precision,
    });
    expect(mocks.resolve).toHaveBeenCalledWith({ id: undefined, name: 'p_inlet' });
    // Raw-mode response carries no bucketed-mode metadata.
    expect(result.bucket).toBeUndefined();
    expect(result.aggregate).toBeUndefined();
    expect(result.qualityPolicy).toBeUndefined();
    expect(result.buckets).toBeUndefined();
  });

  it('issues the F4 `where` / `orderBy` / `take` / `select` shape', async () => {
    const tag = tagFixture();
    const expectedRows = [
      rowFixture(),
      rowFixture({ timestamp: new Date('2026-05-24T00:01:00.000Z') }),
    ];
    const { prisma, resolver, mocks } = makeMocks();
    mocks.resolve.mockResolvedValueOnce(tag);
    mocks.findMany.mockResolvedValueOnce(expectedRows);
    const service = new TrendsService(prisma, resolver);

    const result = await service.query(
      {},
      {
        unitId: UNIT_ID,
        from: FROM,
        to: TO,
        canonicalTagId: tag.id,
        limit: 500,
      },
    );

    expect(result.points).toEqual(expectedRows);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        unitId: UNIT_ID,
        canonicalTagId: tag.id,
        timestamp: { gte: FROM, lt: TO },
      },
      select: {
        timestamp: true,
        value: true,
        engineeringUnit: true,
        quality: true,
        source: true,
      },
      orderBy: { timestamp: 'asc' },
      take: 500,
    });
    // No bucketed-mode $queryRaw call when bucket is absent.
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it('passes through optional jobId / quality / source filters', async () => {
    const tag = tagFixture();
    const { prisma, resolver, mocks } = makeMocks();
    mocks.resolve.mockResolvedValueOnce(tag);
    const service = new TrendsService(prisma, resolver);

    await service.query(
      {},
      {
        unitId: UNIT_ID,
        from: FROM,
        to: TO,
        canonicalTagId: tag.id,
        jobId: '00000000-0000-0000-0000-000000004444',
        quality: 'good',
        source: 'mqtt',
        limit: 100,
      },
    );

    const call = mocks.findMany.mock.calls[0]?.[0];
    expect(call?.where).toEqual({
      unitId: UNIT_ID,
      canonicalTagId: tag.id,
      timestamp: { gte: FROM, lt: TO },
      jobId: '00000000-0000-0000-0000-000000004444',
      quality: 'good',
      source: 'mqtt',
    });
    expect(call?.take).toBe(100);
  });

  it('adds the tenant filter when ctx.tenantId is present', async () => {
    const tag = tagFixture();
    const { prisma, resolver, mocks } = makeMocks();
    mocks.resolve.mockResolvedValueOnce(tag);
    const service = new TrendsService(prisma, resolver);
    const scoped: CallerContext = { tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' };

    await service.query(scoped, {
      unitId: UNIT_ID,
      from: FROM,
      to: TO,
      canonicalTagId: tag.id,
      limit: 100,
    });

    const call = mocks.findMany.mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({ tenantId: scoped.tenantId });
  });

  it('forwards the canonicalTagName variant to the resolver', async () => {
    const tag = tagFixture({ name: 'q_gas' });
    const { prisma, resolver, mocks } = makeMocks();
    mocks.resolve.mockResolvedValueOnce(tag);
    const service = new TrendsService(prisma, resolver);

    await service.query(
      {},
      {
        unitId: UNIT_ID,
        from: FROM,
        to: TO,
        canonicalTagName: 'q_gas',
        limit: 100,
      },
    );

    expect(mocks.resolve).toHaveBeenCalledWith({ id: undefined, name: 'q_gas' });
  });

  // ===========================================================================
  // F4.6F.1 — bucketed mode
  // ===========================================================================

  it('F4.6F.1: bucketed avg returns one row per bucket with sampleCount mapped through', async () => {
    const tag = tagFixture();
    const { prisma, resolver, mocks } = makeMocks();
    mocks.resolve.mockResolvedValueOnce(tag);
    mocks.queryRaw.mockResolvedValueOnce([
      {
        bucket_start: new Date('2026-05-24T00:00:00.000Z'),
        bucket_end: new Date('2026-05-24T00:01:00.000Z'),
        value: new Prisma.Decimal('4123.4'),
        sample_count: 7,
      },
      {
        bucket_start: new Date('2026-05-24T00:01:00.000Z'),
        bucket_end: new Date('2026-05-24T00:02:00.000Z'),
        value: new Prisma.Decimal('4250.0'),
        sample_count: 8,
      },
    ]);
    const service = new TrendsService(prisma, resolver);

    const result = await service.query(
      {},
      {
        unitId: UNIT_ID,
        from: new Date('2026-05-24T00:00:00.000Z'),
        to: new Date('2026-05-24T00:02:00.000Z'),
        canonicalTagId: tag.id,
        limit: 1000,
        bucket: '1m',
        aggregate: 'avg',
      },
    );

    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(result.points).toEqual([]);
    expect(result.bucket).toBe('1m');
    expect(result.aggregate).toBe('avg');
    expect(result.qualityPolicy).toBe('good_only'); // default
    expect(result.buckets).toEqual([
      {
        bucketStart: new Date('2026-05-24T00:00:00.000Z'),
        bucketEnd: new Date('2026-05-24T00:01:00.000Z'),
        value: 4123.4,
        sampleCount: 7,
      },
      {
        bucketStart: new Date('2026-05-24T00:01:00.000Z'),
        bucketEnd: new Date('2026-05-24T00:02:00.000Z'),
        value: 4250,
        sampleCount: 8,
      },
    ]);
  });

  it.each([
    ['min', new Prisma.Decimal('100.5'), 100.5],
    ['max', new Prisma.Decimal('999.9'), 999.9],
    ['count', 42, 42],
    ['first', new Prisma.Decimal('1.23'), 1.23],
    ['last', new Prisma.Decimal('4.56'), 4.56],
  ] as const)(
    'F4.6F.1: bucketed %s coerces the raw value to a JS number',
    async (aggregate, rawValue, expectedValue) => {
      const tag = tagFixture();
      const { prisma, resolver, mocks } = makeMocks();
      mocks.resolve.mockResolvedValueOnce(tag);
      mocks.queryRaw.mockResolvedValueOnce([
        {
          bucket_start: new Date('2026-05-24T00:00:00.000Z'),
          bucket_end: new Date('2026-05-24T01:00:00.000Z'),
          value: rawValue,
          sample_count: 10,
        },
      ]);
      const service = new TrendsService(prisma, resolver);

      const result = await service.query(
        {},
        {
          unitId: UNIT_ID,
          from: FROM,
          to: new Date('2026-05-24T01:00:00.000Z'),
          canonicalTagId: tag.id,
          limit: 1000,
          bucket: '1h',
          aggregate,
        },
      );

      expect(result.aggregate).toBe(aggregate);
      expect(result.buckets?.[0]?.value).toBe(expectedValue);
      expect(result.buckets?.[0]?.sampleCount).toBe(10);
    },
  );

  it('F4.6F.1: empty buckets are emitted with sampleCount=0 and value=null', async () => {
    const tag = tagFixture();
    const { prisma, resolver, mocks } = makeMocks();
    mocks.resolve.mockResolvedValueOnce(tag);
    mocks.queryRaw.mockResolvedValueOnce([
      {
        bucket_start: new Date('2026-05-24T00:00:00.000Z'),
        bucket_end: new Date('2026-05-24T01:00:00.000Z'),
        value: new Prisma.Decimal('500'),
        sample_count: 3,
      },
      {
        bucket_start: new Date('2026-05-24T01:00:00.000Z'),
        bucket_end: new Date('2026-05-24T02:00:00.000Z'),
        value: null, // no rows fell in this bucket (post quality filter)
        sample_count: 0,
      },
      {
        bucket_start: new Date('2026-05-24T02:00:00.000Z'),
        bucket_end: new Date('2026-05-24T03:00:00.000Z'),
        value: new Prisma.Decimal('510'),
        sample_count: 5,
      },
    ]);
    const service = new TrendsService(prisma, resolver);

    const result = await service.query(
      {},
      {
        unitId: UNIT_ID,
        from: FROM,
        to: new Date('2026-05-24T03:00:00.000Z'),
        canonicalTagId: tag.id,
        limit: 1000,
        bucket: '1h',
        aggregate: 'avg',
      },
    );

    expect(result.buckets).toHaveLength(3);
    expect(result.buckets?.[1]).toEqual({
      bucketStart: new Date('2026-05-24T01:00:00.000Z'),
      bucketEnd: new Date('2026-05-24T02:00:00.000Z'),
      value: null,
      sampleCount: 0,
    });
  });

  it.each(['good_only', 'include_uncertain', 'include_all'] as const)(
    'F4.6F.1: qualityPolicy=%s is echoed back in the response',
    async (policy) => {
      const tag = tagFixture();
      const { prisma, resolver, mocks } = makeMocks();
      mocks.resolve.mockResolvedValueOnce(tag);
      const service = new TrendsService(prisma, resolver);

      const result = await service.query(
        {},
        {
          unitId: UNIT_ID,
          from: FROM,
          to: new Date('2026-05-24T00:05:00.000Z'),
          canonicalTagId: tag.id,
          limit: 1000,
          bucket: '1m',
          aggregate: 'avg',
          qualityPolicy: policy,
        },
      );

      expect(result.qualityPolicy).toBe(policy);
      expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    },
  );

  it('F4.6F.1: bucketed-mode response shape — points is empty array, header preserved', async () => {
    const tag = tagFixture();
    const { prisma, resolver, mocks } = makeMocks();
    mocks.resolve.mockResolvedValueOnce(tag);
    const service = new TrendsService(prisma, resolver);

    const result = await service.query(
      {},
      {
        unitId: UNIT_ID,
        from: FROM,
        to: new Date('2026-05-24T00:05:00.000Z'),
        canonicalTagId: tag.id,
        limit: 1000,
        bucket: '5m',
        aggregate: 'max',
      },
    );

    expect(result.points).toEqual([]);
    expect(result.unitId).toBe(UNIT_ID);
    expect(result.range).toEqual({ from: FROM, to: new Date('2026-05-24T00:05:00.000Z') });
    expect(result.canonicalTag.id).toBe(tag.id);
    expect(result.canonicalTag.canonicalUnit).toBe(tag.canonicalUnit);
    expect(result.bucket).toBe('5m');
    expect(result.aggregate).toBe('max');
    expect(result.buckets).toEqual([]); // queryRaw mock default
  });

  it('F4.6F.1: tenant filter is preserved on the bucketed-mode path', async () => {
    const tag = tagFixture();
    const { prisma, resolver, mocks } = makeMocks();
    mocks.resolve.mockResolvedValueOnce(tag);
    const service = new TrendsService(prisma, resolver);
    const scoped: CallerContext = { tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' };

    await service.query(scoped, {
      unitId: UNIT_ID,
      from: FROM,
      to: new Date('2026-05-24T00:05:00.000Z'),
      canonicalTagId: tag.id,
      limit: 1000,
      bucket: '1m',
      aggregate: 'avg',
    });

    // The bucketed-mode SQL composition includes a `tenant_id = ${ctx.tenantId}`
    // fragment when ctx.tenantId is set. Inspect the Prisma.sql values to
    // confirm — the values list includes the tenant id as a parameter.
    const sql = mocks.queryRaw.mock.calls[0]?.[0];
    expect(sql).toBeDefined();
    expect(sql?.values).toContain(scoped.tenantId);
  });
});

// =============================================================================
// F4.6F.1 — controller-level Zod refines (validation bites before any DB call)
// =============================================================================

describe('TrendsQuerySchema (F4.6F.1 refines)', () => {
  const base = {
    unitId: UNIT_ID,
    from: FROM.toISOString(),
    to: TO.toISOString(),
    canonicalTagId: '00000000-0000-0000-0000-0000000044f1',
  };

  it('rejects bucket without aggregate', () => {
    const result = TrendsQuerySchema.safeParse({ ...base, bucket: '1m' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(' | ');
      expect(messages).toMatch(/`bucket` and `aggregate` must appear together/);
    }
  });

  it('rejects aggregate without bucket', () => {
    const result = TrendsQuerySchema.safeParse({ ...base, aggregate: 'avg' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(' | ');
      expect(messages).toMatch(/`bucket` and `aggregate` must appear together/);
    }
  });

  it('rejects qualityPolicy without bucket', () => {
    const result = TrendsQuerySchema.safeParse({ ...base, qualityPolicy: 'good_only' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(' | ');
      expect(messages).toMatch(/`qualityPolicy` is bucketed-mode only/);
    }
  });

  it('rejects invalid bucket enum values', () => {
    const result = TrendsQuerySchema.safeParse({
      ...base,
      bucket: '7m',
      aggregate: 'avg',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid aggregate enum values', () => {
    const result = TrendsQuerySchema.safeParse({
      ...base,
      bucket: '1m',
      aggregate: 'stddev',
    });
    expect(result.success).toBe(false);
  });

  it(`rejects bucket count > TRENDS_BUCKETS_MAX (${String(TRENDS_BUCKETS_MAX)}) before any DB call`, () => {
    // 10-year window at bucket='1m' would produce ~5.2M buckets — must reject.
    const result = TrendsQuerySchema.safeParse({
      ...base,
      from: '2020-01-01T00:00:00.000Z',
      to: '2030-01-01T00:00:00.000Z',
      bucket: '1m',
      aggregate: 'avg',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(' | ');
      expect(messages).toMatch(/buckets at bucket='1m'/);
      expect(messages).toMatch(/max 1500/);
    }
  });

  it('accepts the upper-bound bucket count (exactly TRENDS_BUCKETS_MAX) without rejecting', () => {
    // 1500 buckets of 1 minute = 90,000 seconds = 1500 minutes = 25 hours.
    const from = new Date('2026-05-24T00:00:00.000Z');
    const to = new Date(from.getTime() + TRENDS_BUCKETS_MAX * 60_000);
    const result = TrendsQuerySchema.safeParse({
      ...base,
      from: from.toISOString(),
      to: to.toISOString(),
      bucket: '1m',
      aggregate: 'avg',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid date range (from >= to) — F4.4F refine preserved', () => {
    const result = TrendsQuerySchema.safeParse({
      ...base,
      from: TO.toISOString(),
      to: FROM.toISOString(),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(' | ');
      expect(messages).toMatch(/strictly less than/);
    }
  });

  it('accepts a well-formed bucketed-mode query', () => {
    const result = TrendsQuerySchema.safeParse({
      ...base,
      bucket: '1h',
      aggregate: 'avg',
      qualityPolicy: 'good_only',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bucket).toBe('1h');
      expect(result.data.aggregate).toBe('avg');
      expect(result.data.qualityPolicy).toBe('good_only');
    }
  });

  it('accepts a well-formed raw-mode query (F4.4F unchanged)', () => {
    const result = TrendsQuerySchema.safeParse({
      ...base,
      quality: 'good',
      source: 'mqtt',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bucket).toBeUndefined();
      expect(result.data.aggregate).toBeUndefined();
    }
  });
});
