import { describe, expect, it, vi } from 'vitest';

import { TrendsService } from './trends.service';

import type { CanonicalTagResolver } from './canonical-tag-resolver';
import type { CallerContext } from '../common/caller-context';
import type { PrismaService } from '../prisma/prisma.service';
import type { CanonicalTag } from '@prisma/client';

/**
 * Mocked-Prisma unit tests for TrendsService (F4.4F).
 *
 * Replaces the previously-quarantined F1 spec (which inserted into the
 * `telemetry` hypertable to exercise raw + 1m/15m/1h continuous-aggregate
 * paths). F4.4F covers a single raw range scan against `telemetry_readings`;
 * the spec asserts the Prisma `where` / `orderBy` / `take` / `select` shape,
 * the resolver indirection, the tenant scoping seam, and the empty-result
 * pass-through.
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
  const prisma = { telemetryReading: { findMany } } as unknown as PrismaService;
  const resolve = vi.fn<(lookup: { id?: string; name?: string }) => Promise<CanonicalTag>>(() =>
    Promise.resolve(tagFixture()),
  );
  const resolver = { resolve } as unknown as CanonicalTagResolver;
  return { prisma, resolver, mocks: { findMany, resolve } };
}

const UNIT_ID = '00000000-0000-0000-0000-000000004411';
const FROM = new Date('2026-05-24T00:00:00.000Z');
const TO = new Date('2026-05-25T00:00:00.000Z');

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
});
