import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { AlarmEventsReadService } from './alarm-events-read.service';
import { AlarmEventsQuerySchema } from './contracts/events';

import type { CallerContext } from '../common/caller-context';
import type { PrismaService } from '../prisma/prisma.service';
import type { CanonicalTagResolver } from '../telemetry/canonical-tag-resolver';
import type { CanonicalTag } from '@prisma/client';

/**
 * Mocked-Prisma unit tests for AlarmEventsReadService (F4.6D.2.1).
 *
 * Same posture as `latest.service.spec.ts` / `trends.service.spec.ts`:
 * Prisma is mocked, the canonical-tag resolver is mocked, and assertions
 * check (a) the `where` / `select` / `orderBy` / `take` shape, (b) the
 * tenant scoping seam, (c) the response envelope's structural stability,
 * (d) the controller-level Zod refines, and (e) the write-isolation
 * invariant (read service performs no writes).
 */

interface AlarmEventDbRow {
  id: string;
  unitId: string;
  alarmRuleId: string | null;
  severity: string;
  state: string;
  triggeredValue: Prisma.Decimal;
  thresholdViolated: string;
  firstTriggeredAt: Date;
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
  clearedAt: Date | null;
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

function rowFixture(overrides: Partial<AlarmEventDbRow> = {}): AlarmEventDbRow {
  return {
    id: '00000000-0000-0000-0000-000000007001',
    unitId: '00000000-0000-0000-0000-000000004411',
    alarmRuleId: '00000000-0000-0000-0000-000000005001',
    severity: 'warning',
    state: 'active',
    triggeredValue: new Prisma.Decimal('4600.0'),
    thresholdViolated: 'high',
    firstTriggeredAt: new Date('2026-05-29T13:55:00.000Z'),
    acknowledgedAt: null,
    acknowledgedBy: null,
    clearedAt: null,
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
  const findMany = vi.fn<(args?: FindManyArg) => Promise<AlarmEventDbRow[]>>(() =>
    Promise.resolve([]),
  );
  const create = vi.fn<(args: unknown) => Promise<unknown>>();
  const update = vi.fn<(args: unknown) => Promise<unknown>>();
  const updateMany = vi.fn<(args: unknown) => Promise<unknown>>();
  const upsert = vi.fn<(args: unknown) => Promise<unknown>>();
  const deleteFn = vi.fn<(args: unknown) => Promise<unknown>>();
  const findFirst = vi.fn<(args: unknown) => Promise<unknown>>();
  const prisma = {
    alarmEvent: {
      findMany,
      create,
      update,
      updateMany,
      upsert,
      delete: deleteFn,
      findFirst,
    },
  } as unknown as PrismaService;
  const resolve = vi.fn<(lookup: { id?: string; name?: string }) => Promise<CanonicalTag>>(() =>
    Promise.resolve(tagFixture()),
  );
  const resolver = { resolve } as unknown as CanonicalTagResolver;
  return {
    prisma,
    resolver,
    mocks: { findMany, create, update, updateMany, upsert, delete: deleteFn, findFirst, resolve },
  };
}

const UNIT_ID = '00000000-0000-0000-0000-000000004411';
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const CANONICAL_TAG_ID = '00000000-0000-0000-0000-0000000044f1';
const ALARM_RULE_ID = '00000000-0000-0000-0000-000000005001';

const parse = (raw: Record<string, unknown>) => AlarmEventsQuerySchema.parse(raw);

// =============================================================================
// AlarmEventsReadService.query
// =============================================================================

describe('AlarmEventsReadService.query', () => {
  it('returns the envelope with empty events when alarm_events is empty', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    const service = new AlarmEventsReadService(prisma, resolver);

    const result = await service.query({}, parse({}));

    expect(result.source).toBe('alarm_events');
    expect(result.state).toBe('active');
    expect(result.events).toEqual([]);
    expect(result.generatedAt).toBeInstanceOf(Date);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('applies the default state=`active` when none supplied', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    const service = new AlarmEventsReadService(prisma, resolver);

    await service.query({}, parse({}));

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { state: 'active' } }),
    );
  });

  it("explicit state='cleared' is forwarded to the where clause", async () => {
    const { prisma, resolver, mocks } = makeMocks();
    const service = new AlarmEventsReadService(prisma, resolver);

    await service.query({}, parse({ state: 'cleared' }));

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { state: 'cleared' } }),
    );
  });

  it('unitId filter is forwarded', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    const service = new AlarmEventsReadService(prisma, resolver);

    await service.query({}, parse({ unitId: UNIT_ID }));

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { unitId: UNIT_ID, state: 'active' } }),
    );
  });

  it('canonicalTagId filter is forwarded', async () => {
    const tag = tagFixture();
    const { prisma, resolver, mocks } = makeMocks();
    mocks.resolve.mockResolvedValueOnce(tag);
    const service = new AlarmEventsReadService(prisma, resolver);

    await service.query({}, parse({ canonicalTagId: tag.id }));

    expect(mocks.resolve).toHaveBeenCalledWith({ id: tag.id, name: undefined });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { canonicalTagId: tag.id, state: 'active' },
      }),
    );
  });

  it('canonicalTagName resolves via CanonicalTagResolver and forwards the id', async () => {
    const tag = tagFixture();
    const { prisma, resolver, mocks } = makeMocks();
    mocks.resolve.mockResolvedValueOnce(tag);
    const service = new AlarmEventsReadService(prisma, resolver);

    await service.query({}, parse({ canonicalTagName: 'p_inlet' }));

    expect(mocks.resolve).toHaveBeenCalledWith({ id: undefined, name: 'p_inlet' });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { canonicalTagId: tag.id, state: 'active' },
      }),
    );
  });

  it('severity filter is forwarded', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    const service = new AlarmEventsReadService(prisma, resolver);

    await service.query({}, parse({ severity: 'critical' }));

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { severity: 'critical', state: 'active' },
      }),
    );
  });

  it('time-window filter is forwarded as `firstTriggeredAt: { gte, lt }`', async () => {
    const from = '2026-05-29T12:00:00.000Z';
    const to = '2026-05-29T13:00:00.000Z';
    const { prisma, resolver, mocks } = makeMocks();
    const service = new AlarmEventsReadService(prisma, resolver);

    await service.query({}, parse({ from, to }));

    const call = mocks.findMany.mock.calls[0]?.[0];
    const window = (call?.where as { firstTriggeredAt?: { gte: Date; lt: Date } } | undefined)
      ?.firstTriggeredAt;
    expect(window).toBeDefined();
    expect(window?.gte).toBeInstanceOf(Date);
    expect(window?.lt).toBeInstanceOf(Date);
    expect(window?.gte.toISOString()).toBe(from);
    expect(window?.lt.toISOString()).toBe(to);
  });

  it('limit is applied as Prisma `take`', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    const service = new AlarmEventsReadService(prisma, resolver);

    await service.query({}, parse({ limit: 25 }));

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 25 }));
  });

  it('default limit of 100 is applied when not supplied', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    const service = new AlarmEventsReadService(prisma, resolver);

    await service.query({}, parse({}));

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  });

  it('orders by firstTriggeredAt DESC', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    const service = new AlarmEventsReadService(prisma, resolver);

    await service.query({}, parse({}));

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { firstTriggeredAt: 'desc' } }),
    );
  });

  it('honors ctx.tenantId when set', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    const service = new AlarmEventsReadService(prisma, resolver);
    const ctx: CallerContext = { tenantId: TENANT_ID };

    await service.query(ctx, parse({ unitId: UNIT_ID }));

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID, unitId: UNIT_ID, state: 'active' },
      }),
    );
  });

  it('cross-tenant read under SystemContext (no tenantId in where)', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    const service = new AlarmEventsReadService(prisma, resolver);

    await service.query({}, parse({ unitId: UNIT_ID }));

    const arg = mocks.findMany.mock.calls[0]?.[0];
    expect(arg?.where).toEqual({ unitId: UNIT_ID, state: 'active' });
    expect(arg?.where).not.toHaveProperty('tenantId');
  });

  it('select clause only requests the columns the response exposes (no tenantId / ruleSnapshot / createdAt / updatedAt / jobId)', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    const service = new AlarmEventsReadService(prisma, resolver);

    await service.query({}, parse({}));

    const arg = mocks.findMany.mock.calls[0]?.[0];
    expect(arg?.select).toEqual({
      id: true,
      unitId: true,
      alarmRuleId: true,
      severity: true,
      state: true,
      triggeredValue: true,
      thresholdViolated: true,
      firstTriggeredAt: true,
      acknowledgedAt: true,
      acknowledgedBy: true,
      clearedAt: true,
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
    const select = arg?.select;
    expect(select).not.toHaveProperty('tenantId');
    expect(select).not.toHaveProperty('ruleSnapshot');
    expect(select).not.toHaveProperty('createdAt');
    expect(select).not.toHaveProperty('updatedAt');
    expect(select).not.toHaveProperty('jobId');
  });

  it('renames row.id to alarmEventId and exposes canonicalTag nested summary', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    mocks.findMany.mockResolvedValueOnce([rowFixture()]);
    const service = new AlarmEventsReadService(prisma, resolver);

    const result = await service.query({}, parse({}));
    const event = result.events[0];

    expect(event).toBeDefined();
    if (!event) return;
    expect(event.alarmEventId).toBe('00000000-0000-0000-0000-000000007001');
    expect(event).not.toHaveProperty('id');
    expect(event.canonicalTag.id).toBe(CANONICAL_TAG_ID);
    expect(event.canonicalTag.name).toBe('p_inlet');
    expect(event.unitId).toBe(UNIT_ID);
    expect(event.alarmRuleId).toBe(ALARM_RULE_ID);
  });

  it('Decimal triggeredValue passes through unchanged (caller serializes via Decimal.toJSON)', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    const decimal = new Prisma.Decimal('4612.345678');
    mocks.findMany.mockResolvedValueOnce([rowFixture({ triggeredValue: decimal })]);
    const service = new AlarmEventsReadService(prisma, resolver);

    const result = await service.query({}, parse({}));

    expect(result.events[0]?.triggeredValue).toBe(decimal);
  });

  it('lifecycle columns are surfaced as null (F4.6D.3 reserved)', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    mocks.findMany.mockResolvedValueOnce([rowFixture()]);
    const service = new AlarmEventsReadService(prisma, resolver);

    const result = await service.query({}, parse({}));
    const event = result.events[0];

    expect(event?.acknowledgedAt).toBeNull();
    expect(event?.acknowledgedBy).toBeNull();
    expect(event?.clearedAt).toBeNull();
  });

  it('echoes the parsed (defaulted) state in the response', async () => {
    const { prisma, resolver } = makeMocks();
    const service = new AlarmEventsReadService(prisma, resolver);

    const a = await service.query({}, parse({}));
    const b = await service.query({}, parse({ state: 'cleared' }));

    expect(a.state).toBe('active');
    expect(b.state).toBe('cleared');
  });

  it('source constant is `alarm_events`', async () => {
    const { prisma, resolver } = makeMocks();
    const service = new AlarmEventsReadService(prisma, resolver);

    const result = await service.query({}, parse({}));

    expect(result.source).toBe('alarm_events');
  });

  it('generatedAt is a fresh Date generated server-side', async () => {
    const { prisma, resolver } = makeMocks();
    const service = new AlarmEventsReadService(prisma, resolver);

    const before = Date.now();
    const result = await service.query({}, parse({}));
    const after = Date.now();

    expect(result.generatedAt).toBeInstanceOf(Date);
    expect(result.generatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.generatedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it('reads alarm_events, not telemetry_readings / live_readings', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    // Attach unrelated table mocks to detect any accidental read.
    const telemetryFindMany = vi.fn(() => Promise.resolve([]));
    const liveReadingFindMany = vi.fn(() => Promise.resolve([]));
    (
      prisma as unknown as { telemetryReading: { findMany: typeof telemetryFindMany } }
    ).telemetryReading = { findMany: telemetryFindMany };
    (prisma as unknown as { liveReading: { findMany: typeof liveReadingFindMany } }).liveReading = {
      findMany: liveReadingFindMany,
    };
    const service = new AlarmEventsReadService(prisma, resolver);

    await service.query({}, parse({}));

    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(telemetryFindMany).not.toHaveBeenCalled();
    expect(liveReadingFindMany).not.toHaveBeenCalled();
  });

  it('defensive narrowing: unknown stored severity falls back to `info`', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    mocks.findMany.mockResolvedValueOnce([rowFixture({ severity: 'something_else' })]);
    const service = new AlarmEventsReadService(prisma, resolver);

    const result = await service.query({}, parse({}));

    expect(result.events[0]?.severity).toBe('info');
  });

  it('defensive narrowing: unknown stored state falls back to `active`', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    mocks.findMany.mockResolvedValueOnce([rowFixture({ state: 'something_else' })]);
    const service = new AlarmEventsReadService(prisma, resolver);

    const result = await service.query({}, parse({}));

    expect(result.events[0]?.state).toBe('active');
  });

  it('defensive narrowing: unknown stored thresholdViolated falls back to `high`', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    mocks.findMany.mockResolvedValueOnce([rowFixture({ thresholdViolated: 'unknown' })]);
    const service = new AlarmEventsReadService(prisma, resolver);

    const result = await service.query({}, parse({}));

    expect(result.events[0]?.thresholdViolated).toBe('high');
  });

  it('combined filters: unitId + state + severity + window', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    const service = new AlarmEventsReadService(prisma, resolver);

    await service.query(
      { tenantId: TENANT_ID },
      parse({
        unitId: UNIT_ID,
        state: 'active',
        severity: 'critical',
        from: '2026-05-29T12:00:00.000Z',
        to: '2026-05-29T13:00:00.000Z',
        limit: 50,
      }),
    );

    const call = mocks.findMany.mock.calls[0]?.[0];
    const where = call?.where ?? {};
    expect(where.tenantId).toBe(TENANT_ID);
    expect(where.unitId).toBe(UNIT_ID);
    expect(where.state).toBe('active');
    expect(where.severity).toBe('critical');
    expect(where.firstTriggeredAt).toBeDefined();
    expect(call?.take).toBe(50);
  });

  // ---------------------------------------------------------------------------
  // Isolation invariant — F4.6D.2-0 §14.2
  // ---------------------------------------------------------------------------

  it('isolation: read service performs no writes against alarm_events', async () => {
    const { prisma, resolver, mocks } = makeMocks();
    mocks.findMany.mockResolvedValueOnce([rowFixture()]);
    const service = new AlarmEventsReadService(prisma, resolver);

    await service.query({}, parse({}));
    await service.query({ tenantId: TENANT_ID }, parse({ unitId: UNIT_ID, state: 'cleared' }));

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Zod validation — controller-level refines
// =============================================================================

describe('AlarmEventsQuerySchema', () => {
  it('accepts empty query and applies the defaults', () => {
    const parsed = AlarmEventsQuerySchema.parse({});
    expect(parsed.state).toBe('active');
    expect(parsed.limit).toBe(100);
    expect(parsed.unitId).toBeUndefined();
  });

  it('accepts unitId only', () => {
    const parsed = AlarmEventsQuerySchema.parse({ unitId: UNIT_ID });
    expect(parsed.unitId).toBe(UNIT_ID);
  });

  it("accepts state='cleared'", () => {
    const parsed = AlarmEventsQuerySchema.parse({ state: 'cleared' });
    expect(parsed.state).toBe('cleared');
  });

  it('rejects invalid state enum', () => {
    const result = AlarmEventsQuerySchema.safeParse({ state: 'not_a_state' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid severity enum', () => {
    const result = AlarmEventsQuerySchema.safeParse({ severity: 'panic' });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID unitId', () => {
    const result = AlarmEventsQuerySchema.safeParse({ unitId: 'EMMAD-01' });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID canonicalTagId', () => {
    const result = AlarmEventsQuerySchema.safeParse({ canonicalTagId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects supplying both canonicalTagId and canonicalTagName (XOR)', () => {
    const result = AlarmEventsQuerySchema.safeParse({
      canonicalTagId: CANONICAL_TAG_ID,
      canonicalTagName: 'p_inlet',
    });
    expect(result.success).toBe(false);
  });

  it('rejects canonicalTagName length 0', () => {
    const result = AlarmEventsQuerySchema.safeParse({ canonicalTagName: '' });
    expect(result.success).toBe(false);
  });

  it('rejects canonicalTagName length > 64', () => {
    const result = AlarmEventsQuerySchema.safeParse({ canonicalTagName: 'x'.repeat(65) });
    expect(result.success).toBe(false);
  });

  it('rejects `from` supplied without `to`', () => {
    const result = AlarmEventsQuerySchema.safeParse({ from: '2026-05-29T12:00:00.000Z' });
    expect(result.success).toBe(false);
  });

  it('rejects `to` supplied without `from`', () => {
    const result = AlarmEventsQuerySchema.safeParse({ to: '2026-05-29T13:00:00.000Z' });
    expect(result.success).toBe(false);
  });

  it('rejects `from >= to`', () => {
    const result = AlarmEventsQuerySchema.safeParse({
      from: '2026-05-29T13:00:00.000Z',
      to: '2026-05-29T13:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid time range', () => {
    const parsed = AlarmEventsQuerySchema.parse({
      from: '2026-05-29T12:00:00.000Z',
      to: '2026-05-29T13:00:00.000Z',
    });
    expect(parsed.from).toBeInstanceOf(Date);
    expect(parsed.to).toBeInstanceOf(Date);
  });

  it('rejects limit outside 1..500', () => {
    expect(AlarmEventsQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(AlarmEventsQuerySchema.safeParse({ limit: 501 }).success).toBe(false);
  });

  it('accepts limit boundaries (1 and 500)', () => {
    expect(AlarmEventsQuerySchema.parse({ limit: 1 }).limit).toBe(1);
    expect(AlarmEventsQuerySchema.parse({ limit: 500 }).limit).toBe(500);
  });

  it('rejects unknown query fields (.strict())', () => {
    const result = AlarmEventsQuerySchema.safeParse({ tenantId: TENANT_ID });
    expect(result.success).toBe(false);
  });
});
