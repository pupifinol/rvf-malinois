import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { LatestQuerySchema } from './contracts/latest';
import { LatestService } from './latest.service';

import type { CanonicalTagResolver } from './canonical-tag-resolver';
import type { CallerContext } from '../common/caller-context';
import type { PrismaService } from '../prisma/prisma.service';
import type { CanonicalTag } from '@prisma/client';

/**
 * Mocked-Prisma unit tests for LatestService (F4.6C.2.1).
 *
 * Same posture as `trends.service.spec.ts`: Prisma is mocked, the canonical
 * tag resolver is mocked, and assertions check (a) the `where` / `select` /
 * `orderBy` shape, (b) the tenant scoping seam, (c) the response envelope's
 * structural stability, and (d) the controller-level Zod refines.
 */

interface LiveReadingRow {
  sensorId: string;
  value: Prisma.Decimal;
  engineeringUnit: string;
  quality: string;
  timestamp: Date;
  ingestionTimestamp: Date | null;
  source: string | null;
  latestTelemetryReadingId: string | null;
  canonicalTag: {
    id: string;
    name: string;
    displayName: string;
    canonicalUnit: string;
    category: string;
    precision: number;
  };
}

interface FindManyArg {
  where?: Record<string, unknown>;
  select?: Record<string, unknown>;
  orderBy?: unknown;
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

function rowFixture(overrides: Partial<LiveReadingRow> = {}): LiveReadingRow {
  return {
    sensorId: '00000000-0000-0000-0000-000000005551',
    value: new Prisma.Decimal('3800.1'),
    engineeringUnit: 'psi',
    quality: 'good',
    timestamp: new Date('2026-05-24T00:00:30.000Z'),
    ingestionTimestamp: new Date('2026-05-24T00:00:30.500Z'),
    source: 'mqtt',
    latestTelemetryReadingId: '00000000-0000-0000-0000-000000006661',
    canonicalTag: {
      id: '00000000-0000-0000-0000-0000000044f1',
      name: 'p_inlet',
      displayName: 'Inlet pressure',
      canonicalUnit: 'psi',
      category: 'pressure',
      precision: 1,
    },
    ...overrides,
  };
}

function makeMocks() {
  const findMany = vi.fn<(args?: FindManyArg) => Promise<LiveReadingRow[]>>(() =>
    Promise.resolve([]),
  );
  const prisma = {
    liveReading: { findMany },
  } as unknown as PrismaService;
  const resolve = vi.fn<(lookup: { id?: string; name?: string }) => Promise<CanonicalTag>>(() =>
    Promise.resolve(tagFixture()),
  );
  const resolver = { resolve } as unknown as CanonicalTagResolver;
  return { prisma, resolver, mocks: { findMany, resolve } };
}

const UNIT_ID = '00000000-0000-0000-0000-000000004411';
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

// =============================================================================
// LatestService.query
// =============================================================================

describe('LatestService.query', () => {
  it('returns the envelope with empty values when live_readings is empty', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    const service = new LatestService(prisma, resolver);

    const result = await service.query({}, { unitId: UNIT_ID });

    expect(result.unitId).toBe(UNIT_ID);
    expect(result.source).toBe('live_readings');
    expect(result.values).toEqual([]);
    expect(result.generatedAt).toBeInstanceOf(Date);
    // Resolver is not invoked when no canonical-tag filter is supplied.
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('omitting both tag identifiers returns every row for the unit', async () => {
    const rows = [
      rowFixture(),
      rowFixture({
        sensorId: '00000000-0000-0000-0000-000000005552',
        canonicalTag: {
          id: '00000000-0000-0000-0000-0000000044f2',
          name: 'q_liquid',
          displayName: 'Total liquid flow rate',
          canonicalUnit: 'bpd',
          category: 'flow',
          precision: 1,
        },
      }),
    ];
    const { prisma, resolver, mocks } = makeMocks();
    mocks.findMany.mockResolvedValueOnce(rows);
    const service = new LatestService(prisma, resolver);

    const result = await service.query({}, { unitId: UNIT_ID });

    expect(result.values).toHaveLength(2);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { unitId: UNIT_ID },
        orderBy: { timestamp: 'desc' },
      }),
    );
  });

  it('canonicalTagId filters one tag', async () => {
    const tag = tagFixture();
    const { prisma, resolver, mocks } = makeMocks();
    mocks.resolve.mockResolvedValueOnce(tag);
    mocks.findMany.mockResolvedValueOnce([rowFixture()]);
    const service = new LatestService(prisma, resolver);

    const result = await service.query({}, { unitId: UNIT_ID, canonicalTagId: tag.id });

    expect(result.values).toHaveLength(1);
    expect(mocks.resolve).toHaveBeenCalledWith({ id: tag.id, name: undefined });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { unitId: UNIT_ID, canonicalTagId: tag.id },
      }),
    );
  });

  it('canonicalTagName filters one tag', async () => {
    const tag = tagFixture();
    const { prisma, resolver, mocks } = makeMocks();
    mocks.resolve.mockResolvedValueOnce(tag);
    mocks.findMany.mockResolvedValueOnce([rowFixture()]);
    const service = new LatestService(prisma, resolver);

    await service.query({}, { unitId: UNIT_ID, canonicalTagName: 'p_inlet' });

    expect(mocks.resolve).toHaveBeenCalledWith({ id: undefined, name: 'p_inlet' });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { unitId: UNIT_ID, canonicalTagId: tag.id },
      }),
    );
  });

  it('honors ctx.tenantId when set', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    const service = new LatestService(prisma, resolver);
    const ctx: CallerContext = { tenantId: TENANT_ID };

    await service.query(ctx, { unitId: UNIT_ID });

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID, unitId: UNIT_ID },
      }),
    );
  });

  it('cross-tenant read under SystemContext (no tenantId in where)', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    const service = new LatestService(prisma, resolver);

    await service.query({}, { unitId: UNIT_ID });

    const arg = mocks.findMany.mock.calls[0]?.[0];
    expect(arg?.where).toEqual({ unitId: UNIT_ID });
    expect(arg?.where).not.toHaveProperty('tenantId');
  });

  it('response shape does not expose tenantId / projection id / createdAt / updatedAt / status', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    mocks.findMany.mockResolvedValueOnce([rowFixture()]);
    const service = new LatestService(prisma, resolver);

    const result = await service.query({}, { unitId: UNIT_ID });

    const value = result.values[0];
    expect(value).toBeDefined();
    if (!value) return;
    expect(value).not.toHaveProperty('tenantId');
    expect(value).not.toHaveProperty('id');
    expect(value).not.toHaveProperty('createdAt');
    expect(value).not.toHaveProperty('updatedAt');
    expect(value).not.toHaveProperty('status');
    // Hide the projection's row id; expose only the forward-link to telemetry_readings.
    expect(value.latestTelemetryReadingId).toBe('00000000-0000-0000-0000-000000006661');
    expect(value.sensorId).toBe('00000000-0000-0000-0000-000000005551');
    expect(value.canonicalTag.name).toBe('p_inlet');
    expect(value.engineeringUnit).toBe('psi');
    expect(value.quality).toBe('good');
    expect(value.source).toBe('mqtt');
  });

  it('the select clause only requests the columns the response exposes', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    const service = new LatestService(prisma, resolver);

    await service.query({}, { unitId: UNIT_ID });

    const arg = mocks.findMany.mock.calls[0]?.[0];
    expect(arg?.select).toEqual({
      sensorId: true,
      value: true,
      engineeringUnit: true,
      quality: true,
      timestamp: true,
      ingestionTimestamp: true,
      source: true,
      latestTelemetryReadingId: true,
      canonicalTag: {
        select: {
          id: true,
          name: true,
          displayName: true,
          canonicalUnit: true,
          category: true,
          precision: true,
        },
      },
    });
  });

  it('Decimal value passes through unchanged (caller serializes via Decimal.toJSON)', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    const decimal = new Prisma.Decimal('3800.123456');
    mocks.findMany.mockResolvedValueOnce([rowFixture({ value: decimal })]);
    const service = new LatestService(prisma, resolver);

    const result = await service.query({}, { unitId: UNIT_ID });

    expect(result.values[0]?.value).toBe(decimal);
  });

  it('generatedAt is a fresh Date generated server-side', async () => {
    const { prisma, resolver } = makeMocks();
    const service = new LatestService(prisma, resolver);

    const before = Date.now();
    const result = await service.query({}, { unitId: UNIT_ID });
    const after = Date.now();

    expect(result.generatedAt).toBeInstanceOf(Date);
    expect(result.generatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.generatedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it('source constant is `live_readings`', async () => {
    const { prisma, resolver } = makeMocks();
    const service = new LatestService(prisma, resolver);

    const result = await service.query({}, { unitId: UNIT_ID });

    expect(result.source).toBe('live_readings');
  });

  it('reads live_readings, not telemetry_readings', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    // Attach a telemetryReading mock to detect any accidental read.
    const telemetryFindMany = vi.fn(() => Promise.resolve([]));
    (
      prisma as unknown as { telemetryReading: { findMany: typeof telemetryFindMany } }
    ).telemetryReading = { findMany: telemetryFindMany };
    const service = new LatestService(prisma, resolver);

    await service.query({}, { unitId: UNIT_ID });

    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(telemetryFindMany).not.toHaveBeenCalled();
  });

  it('narrows an unknown stored quality string to `good` (defensive)', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    mocks.findMany.mockResolvedValueOnce([rowFixture({ quality: 'something_else' })]);
    const service = new LatestService(prisma, resolver);

    const result = await service.query({}, { unitId: UNIT_ID });

    expect(result.values[0]?.quality).toBe('good');
  });
});

// =============================================================================
// Zod validation — controller-level refines
// =============================================================================

describe('LatestQuerySchema', () => {
  it('accepts unitId only (returns all latest values for the unit)', () => {
    const parsed = LatestQuerySchema.parse({ unitId: UNIT_ID });
    expect(parsed.unitId).toBe(UNIT_ID);
    expect(parsed.canonicalTagId).toBeUndefined();
    expect(parsed.canonicalTagName).toBeUndefined();
  });

  it('accepts unitId + canonicalTagId', () => {
    const parsed = LatestQuerySchema.parse({
      unitId: UNIT_ID,
      canonicalTagId: '00000000-0000-0000-0000-0000000044f1',
    });
    expect(parsed.canonicalTagId).toBe('00000000-0000-0000-0000-0000000044f1');
  });

  it('accepts unitId + canonicalTagName', () => {
    const parsed = LatestQuerySchema.parse({ unitId: UNIT_ID, canonicalTagName: 'p_inlet' });
    expect(parsed.canonicalTagName).toBe('p_inlet');
  });

  it('rejects supplying both canonicalTagId and canonicalTagName', () => {
    const result = LatestQuerySchema.safeParse({
      unitId: UNIT_ID,
      canonicalTagId: '00000000-0000-0000-0000-0000000044f1',
      canonicalTagName: 'p_inlet',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID unitId', () => {
    const result = LatestQuerySchema.safeParse({ unitId: 'EMMAD-01' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown query fields (.strict())', () => {
    const result = LatestQuerySchema.safeParse({ unitId: UNIT_ID, tenantId: TENANT_ID });
    expect(result.success).toBe(false);
  });

  it('rejects canonicalTagName length 0', () => {
    const result = LatestQuerySchema.safeParse({ unitId: UNIT_ID, canonicalTagName: '' });
    expect(result.success).toBe(false);
  });

  it('rejects canonicalTagName length > 64', () => {
    const result = LatestQuerySchema.safeParse({
      unitId: UNIT_ID,
      canonicalTagName: 'x'.repeat(65),
    });
    expect(result.success).toBe(false);
  });

  it('rejects from / to / limit / quality / source / qualityPolicy (not in this schema)', () => {
    const result = LatestQuerySchema.safeParse({
      unitId: UNIT_ID,
      from: '2026-05-24T00:00:00.000Z',
      to: '2026-05-25T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});
