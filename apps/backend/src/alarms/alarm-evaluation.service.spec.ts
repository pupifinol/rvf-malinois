import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AlarmEvaluationService,
  type AcceptedTelemetryAlarmInput,
} from './alarm-evaluation.service';

import type { PrismaService } from '../prisma/prisma.service';
import type { AlarmRule } from '@prisma/client';

/**
 * Mocked-Prisma unit tests for AlarmEvaluationService (F4.6D.1).
 *
 * Implements the F4.6D-0 §9.5 test plan. Convention: strict-inequality
 * boundary (value at the threshold is NOT a violation; only crossing it is).
 *
 * Mock pattern mirrors `live-readings-projection.service.spec.ts` and
 * `trends.service.spec.ts`: typed `vi.fn()` per Prisma model method, cast as
 * PrismaService, construct the service directly. No live DB.
 */

const TENANT_ID = '00000000-0000-0000-0000-000000000a01';
const UNIT_ID = '00000000-0000-0000-0000-000000000d04';
const SENSOR_ID = '00000000-0000-0000-0000-000000000e05';
const CANONICAL_TAG_ID = '00000000-0000-0000-0000-000000000f06';
const READING_ID = '00000000-0000-0000-0000-000000002008';
const RULE_WARNING_ID = '00000000-0000-0000-0000-000000005001';
const RULE_CRITICAL_ID = '00000000-0000-0000-0000-000000005002';
const EVENT_ID = '00000000-0000-0000-0000-000000006001';
const EVENT_ID_OTHER = '00000000-0000-0000-0000-000000006002';
const EXISTING_EVENT_ID = '00000000-0000-0000-0000-000000007001';

const READING_TS = new Date('2026-05-27T12:00:00.000Z');

// --------------------------------------------------------------------------
// Typed call-shape helpers
// --------------------------------------------------------------------------

interface AlarmRuleFindManyArg {
  where: {
    unitId?: string;
    canonicalTagId?: string;
    isCurrent?: boolean;
    enabled?: boolean;
  };
  orderBy?: unknown;
}

interface AlarmEventFindFirstArg {
  where: {
    unitId?: string;
    canonicalTagId?: string;
    alarmRuleId?: string;
    state?: string;
  };
  select?: { id: true };
}

interface AlarmEventCreateArg {
  data: {
    tenantId: string;
    unitId: string;
    canonicalTagId: string;
    alarmRuleId: string;
    severity: string;
    triggeredValue: Prisma.Decimal;
    thresholdViolated: string;
    state: string;
    firstTriggeredAt: Date;
    ruleSnapshot: unknown;
    jobId: string | null;
  };
  select?: { id: true };
}

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------

function ruleFixture(overrides: Partial<AlarmRule> = {}): AlarmRule {
  return {
    id: RULE_WARNING_ID,
    tenantId: TENANT_ID,
    unitId: UNIT_ID,
    canonicalTagId: CANONICAL_TAG_ID,
    severity: 'warning',
    enabled: true,
    lowLowThreshold: null,
    lowThreshold: null,
    highThreshold: new Prisma.Decimal('4500'),
    highHighThreshold: null,
    deadband: null,
    delaySeconds: null,
    messageTemplate: 'HP-001 inlet pressure approaching design limit (warning).',
    version: 1,
    isCurrent: true,
    createdBy: null,
    createdAt: new Date('2026-05-25T00:00:00.000Z'),
    ...overrides,
  };
}

function inputFixture(
  overrides: Partial<AcceptedTelemetryAlarmInput> = {},
): AcceptedTelemetryAlarmInput {
  return {
    telemetryReadingId: READING_ID,
    tenantId: TENANT_ID,
    unitId: UNIT_ID,
    sensorId: SENSOR_ID,
    canonicalTagId: CANONICAL_TAG_ID,
    value: new Prisma.Decimal('4123.4'),
    engineeringUnit: 'psi',
    quality: 'good',
    timestamp: READING_TS,
    source: 'manual',
    ...overrides,
  };
}

// --------------------------------------------------------------------------
// Typed mock harness
// --------------------------------------------------------------------------

function makeMocks() {
  const alarmRuleFindMany = vi.fn<(args: AlarmRuleFindManyArg) => Promise<AlarmRule[]>>(() =>
    Promise.resolve([]),
  );
  const alarmEventFindFirst = vi.fn<
    (args: AlarmEventFindFirstArg) => Promise<{ id: string } | null>
  >(() => Promise.resolve(null));
  const alarmEventCreate = vi.fn<(args: AlarmEventCreateArg) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: EVENT_ID }),
  );

  // Isolation guards — the evaluator must NEVER touch these surfaces.
  const telemetryReadingFindFirst = vi.fn<(args: unknown) => Promise<unknown>>();
  const telemetryReadingCreate = vi.fn<(args: unknown) => Promise<unknown>>();
  const liveReadingFindUnique = vi.fn<(args: unknown) => Promise<unknown>>();
  const liveReadingCreate = vi.fn<(args: unknown) => Promise<unknown>>();
  const liveReadingUpdateMany = vi.fn<(args: unknown) => Promise<unknown>>();
  const jobFindFirst = vi.fn<(args: unknown) => Promise<unknown>>();
  const jobFindUnique = vi.fn<(args: unknown) => Promise<unknown>>();

  const prismaShape = {
    alarmRule: { findMany: alarmRuleFindMany },
    alarmEvent: { findFirst: alarmEventFindFirst, create: alarmEventCreate },
    telemetryReading: {
      findFirst: telemetryReadingFindFirst,
      create: telemetryReadingCreate,
    },
    liveReading: {
      findUnique: liveReadingFindUnique,
      create: liveReadingCreate,
      updateMany: liveReadingUpdateMany,
    },
    job: { findFirst: jobFindFirst, findUnique: jobFindUnique },
  };

  const client = prismaShape as unknown as Prisma.TransactionClient;
  const prisma = prismaShape as unknown as PrismaService;

  return {
    client,
    prisma,
    mocks: {
      alarmRuleFindMany,
      alarmEventFindFirst,
      alarmEventCreate,
      telemetryReadingFindFirst,
      telemetryReadingCreate,
      liveReadingFindUnique,
      liveReadingCreate,
      liveReadingUpdateMany,
      jobFindFirst,
      jobFindUnique,
    },
  };
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('AlarmEvaluationService.evaluate', () => {
  let service: AlarmEvaluationService;
  let prisma: PrismaService;
  let client: Prisma.TransactionClient;
  let mocks: ReturnType<typeof makeMocks>['mocks'];

  beforeEach(() => {
    const made = makeMocks();
    prisma = made.prisma;
    client = made.client;
    mocks = made.mocks;
    service = new AlarmEvaluationService(prisma);
  });

  // --- F4.6D-0 §9.5 #1: high not triggered at boundary --------------------
  it('1. high not triggered when value == highThreshold (strict inequality)', async () => {
    mocks.alarmRuleFindMany.mockResolvedValueOnce([
      ruleFixture({ highThreshold: new Prisma.Decimal('4500') }),
    ]);

    const result = await service.evaluate(
      inputFixture({ value: new Prisma.Decimal('4500') }),
      client,
    );

    expect(result).toMatchObject({
      outcome: 'evaluated',
      perRule: [{ ruleId: RULE_WARNING_ID, severity: 'warning', status: 'no_threshold_violated' }],
    });
    expect(mocks.alarmEventCreate).not.toHaveBeenCalled();
  });

  // --- F4.6D-0 §9.5 #2: high triggered above boundary ---------------------
  it('2. high triggered when value > highThreshold', async () => {
    mocks.alarmRuleFindMany.mockResolvedValueOnce([
      ruleFixture({ highThreshold: new Prisma.Decimal('4500') }),
    ]);
    mocks.alarmEventCreate.mockResolvedValueOnce({ id: EVENT_ID });

    const result = await service.evaluate(
      inputFixture({ value: new Prisma.Decimal('4500.01') }),
      client,
    );

    expect(result).toEqual({
      outcome: 'evaluated',
      perRule: [
        {
          ruleId: RULE_WARNING_ID,
          severity: 'warning',
          status: 'triggered',
          alarmEventId: EVENT_ID,
          thresholdViolated: 'high',
        },
      ],
    });
    expect(mocks.alarmEventCreate).toHaveBeenCalledTimes(1);
  });

  // --- F4.6D-0 §9.5 #3: high not triggered when value below ---------------
  it('3. high not triggered when value < highThreshold', async () => {
    mocks.alarmRuleFindMany.mockResolvedValueOnce([
      ruleFixture({ highThreshold: new Prisma.Decimal('4500') }),
    ]);

    const result = await service.evaluate(
      inputFixture({ value: new Prisma.Decimal('4499.99') }),
      client,
    );

    expect(result).toMatchObject({
      outcome: 'evaluated',
      perRule: [{ status: 'no_threshold_violated' }],
    });
    expect(mocks.alarmEventCreate).not.toHaveBeenCalled();
  });

  // --- F4.6D-0 §9.5 #4: high_high triggered above its boundary ------------
  it('4. high_high triggered when value > highHighThreshold (severity precedence over high)', async () => {
    mocks.alarmRuleFindMany.mockResolvedValueOnce([
      ruleFixture({
        id: RULE_CRITICAL_ID,
        severity: 'critical',
        highThreshold: new Prisma.Decimal('4500'),
        highHighThreshold: new Prisma.Decimal('5000'),
      }),
    ]);
    mocks.alarmEventCreate.mockResolvedValueOnce({ id: EVENT_ID });

    const result = await service.evaluate(
      inputFixture({ value: new Prisma.Decimal('5050') }),
      client,
    );

    expect(result).toEqual({
      outcome: 'evaluated',
      perRule: [
        {
          ruleId: RULE_CRITICAL_ID,
          severity: 'critical',
          status: 'triggered',
          alarmEventId: EVENT_ID,
          thresholdViolated: 'high_high',
        },
      ],
    });
    const createArg = mocks.alarmEventCreate.mock.calls[0]?.[0];
    expect(createArg?.data.thresholdViolated).toBe('high_high');
  });

  // --- F4.6D-0 §9.5 #5: low not triggered at boundary ---------------------
  it('5. low not triggered when value == lowThreshold (strict inequality)', async () => {
    mocks.alarmRuleFindMany.mockResolvedValueOnce([
      ruleFixture({
        highThreshold: null,
        lowThreshold: new Prisma.Decimal('100'),
      }),
    ]);

    const result = await service.evaluate(
      inputFixture({ value: new Prisma.Decimal('100') }),
      client,
    );

    expect(result).toMatchObject({
      outcome: 'evaluated',
      perRule: [{ status: 'no_threshold_violated' }],
    });
    expect(mocks.alarmEventCreate).not.toHaveBeenCalled();
  });

  // --- F4.6D-0 §9.5 #6: low triggered below ------------------------------
  it('6. low triggered when value < lowThreshold', async () => {
    mocks.alarmRuleFindMany.mockResolvedValueOnce([
      ruleFixture({
        highThreshold: null,
        lowThreshold: new Prisma.Decimal('100'),
      }),
    ]);
    mocks.alarmEventCreate.mockResolvedValueOnce({ id: EVENT_ID });

    const result = await service.evaluate(
      inputFixture({ value: new Prisma.Decimal('99.99') }),
      client,
    );

    expect(result).toMatchObject({
      outcome: 'evaluated',
      perRule: [{ status: 'triggered', thresholdViolated: 'low' }],
    });
  });

  // --- F4.6D-0 §9.5 #7: low_low not triggered at boundary -----------------
  it('7. low_low not triggered when value == lowLowThreshold (strict inequality)', async () => {
    mocks.alarmRuleFindMany.mockResolvedValueOnce([
      ruleFixture({
        highThreshold: null,
        lowLowThreshold: new Prisma.Decimal('50'),
      }),
    ]);

    const result = await service.evaluate(
      inputFixture({ value: new Prisma.Decimal('50') }),
      client,
    );

    expect(result).toMatchObject({
      outcome: 'evaluated',
      perRule: [{ status: 'no_threshold_violated' }],
    });
    expect(mocks.alarmEventCreate).not.toHaveBeenCalled();
  });

  // --- F4.6D-0 §9.5 #8: low_low triggered below --------------------------
  it('8. low_low triggered when value < lowLowThreshold (severity precedence over low)', async () => {
    mocks.alarmRuleFindMany.mockResolvedValueOnce([
      ruleFixture({
        highThreshold: null,
        lowThreshold: new Prisma.Decimal('100'),
        lowLowThreshold: new Prisma.Decimal('50'),
      }),
    ]);
    mocks.alarmEventCreate.mockResolvedValueOnce({ id: EVENT_ID });

    const result = await service.evaluate(
      inputFixture({ value: new Prisma.Decimal('40') }),
      client,
    );

    expect(result).toMatchObject({
      outcome: 'evaluated',
      perRule: [{ status: 'triggered', thresholdViolated: 'low_low' }],
    });
  });

  // --- F4.6D-0 §9.5 #9: null bands ignored --------------------------------
  it('9. null bands are ignored — a rule with only highThreshold set produces no low decision', async () => {
    mocks.alarmRuleFindMany.mockResolvedValueOnce([
      ruleFixture({
        lowLowThreshold: null,
        lowThreshold: null,
        highThreshold: new Prisma.Decimal('4500'),
        highHighThreshold: null,
      }),
    ]);

    // Value far below the (absent) low bands; would have triggered low if it
    // were configured. It must not.
    const result = await service.evaluate(
      inputFixture({ value: new Prisma.Decimal('-1000') }),
      client,
    );

    expect(result).toMatchObject({
      outcome: 'evaluated',
      perRule: [{ status: 'no_threshold_violated' }],
    });
  });

  // --- F4.6D-0 §9.5 #10/#11: disabled/non-current filtered at query -----
  it('10. query filters by isCurrent=true AND enabled=true (disabled / superseded rules never loaded)', async () => {
    mocks.alarmRuleFindMany.mockResolvedValueOnce([]);

    await service.evaluate(inputFixture(), client);

    const queryArg = mocks.alarmRuleFindMany.mock.calls[0]?.[0];
    expect(queryArg?.where).toMatchObject({
      unitId: UNIT_ID,
      canonicalTagId: CANONICAL_TAG_ID,
      isCurrent: true,
      enabled: true,
    });
  });

  // --- F4.6D-0 §9.5 #12: severity copied verbatim ------------------------
  it('12. severity is copied verbatim from the matched rule into the outcome and the event row', async () => {
    mocks.alarmRuleFindMany.mockResolvedValueOnce([
      ruleFixture({
        severity: 'critical',
        highThreshold: new Prisma.Decimal('4500'),
      }),
    ]);
    mocks.alarmEventCreate.mockResolvedValueOnce({ id: EVENT_ID });

    const result = await service.evaluate(
      inputFixture({ value: new Prisma.Decimal('4600') }),
      client,
    );

    expect(result).toMatchObject({
      outcome: 'evaluated',
      perRule: [{ severity: 'critical', status: 'triggered' }],
    });
    expect(mocks.alarmEventCreate.mock.calls[0]?.[0].data.severity).toBe('critical');
  });

  // --- F4.6D-0 §9.5 #13: thresholdViolated identifies the band ----------
  it('13. thresholdViolated correctly identifies which band crossed (high vs high_high)', async () => {
    // First call: only `high` crossed.
    mocks.alarmRuleFindMany.mockResolvedValueOnce([
      ruleFixture({
        highThreshold: new Prisma.Decimal('4500'),
        highHighThreshold: new Prisma.Decimal('5000'),
      }),
    ]);
    mocks.alarmEventCreate.mockResolvedValueOnce({ id: EVENT_ID });

    const result1 = await service.evaluate(
      inputFixture({ value: new Prisma.Decimal('4700') }),
      client,
    );
    expect(result1).toMatchObject({
      outcome: 'evaluated',
      perRule: [{ status: 'triggered', thresholdViolated: 'high' }],
    });

    // Second call: high_high crossed too — that wins within the rule.
    mocks.alarmRuleFindMany.mockResolvedValueOnce([
      ruleFixture({
        id: RULE_CRITICAL_ID,
        severity: 'critical',
        highThreshold: new Prisma.Decimal('4500'),
        highHighThreshold: new Prisma.Decimal('5000'),
      }),
    ]);
    mocks.alarmEventCreate.mockResolvedValueOnce({ id: EVENT_ID_OTHER });

    const result2 = await service.evaluate(
      inputFixture({ value: new Prisma.Decimal('5100') }),
      client,
    );
    expect(result2).toMatchObject({
      outcome: 'evaluated',
      perRule: [{ status: 'triggered', thresholdViolated: 'high_high' }],
    });
  });

  // --- F4.6D-0 §9.5 #14: precedence across rules → 2 events --------------
  it('14. precedence across rules: warning + critical both fire → one event per matched rule', async () => {
    // F4.3 seed shape: per (unit, tag) there are two rules — warning (high)
    // and critical (high_high). A reading above both must emit two events.
    mocks.alarmRuleFindMany.mockResolvedValueOnce([
      ruleFixture({
        id: RULE_WARNING_ID,
        severity: 'warning',
        highThreshold: new Prisma.Decimal('4500'),
      }),
      ruleFixture({
        id: RULE_CRITICAL_ID,
        severity: 'critical',
        highThreshold: null,
        highHighThreshold: new Prisma.Decimal('5000'),
      }),
    ]);
    mocks.alarmEventCreate
      .mockResolvedValueOnce({ id: EVENT_ID })
      .mockResolvedValueOnce({ id: EVENT_ID_OTHER });

    const result = await service.evaluate(
      inputFixture({ value: new Prisma.Decimal('5100') }),
      client,
    );

    expect(result).toMatchObject({
      outcome: 'evaluated',
      perRule: [
        {
          ruleId: RULE_WARNING_ID,
          severity: 'warning',
          status: 'triggered',
          thresholdViolated: 'high',
        },
        {
          ruleId: RULE_CRITICAL_ID,
          severity: 'critical',
          status: 'triggered',
          thresholdViolated: 'high_high',
        },
      ],
    });
    expect(mocks.alarmEventCreate).toHaveBeenCalledTimes(2);
  });

  // --- F4.6D-0 §9.5 #15: quality 'uncertain' short-circuits -------------
  it("15. quality='uncertain' short-circuits before any DB call", async () => {
    const result = await service.evaluate(inputFixture({ quality: 'uncertain' }), client);

    expect(result).toEqual({ outcome: 'skipped_quality' });
    expect(mocks.alarmRuleFindMany).not.toHaveBeenCalled();
    expect(mocks.alarmEventFindFirst).not.toHaveBeenCalled();
    expect(mocks.alarmEventCreate).not.toHaveBeenCalled();
  });

  // --- F4.6D-0 §9.5 #16: quality 'bad' short-circuits -------------------
  it("16. quality='bad' short-circuits before any DB call", async () => {
    const result = await service.evaluate(inputFixture({ quality: 'bad' }), client);

    expect(result).toEqual({ outcome: 'skipped_quality' });
    expect(mocks.alarmRuleFindMany).not.toHaveBeenCalled();
    expect(mocks.alarmEventCreate).not.toHaveBeenCalled();
  });

  // --- F4.6D-0 §9.5 #17: no rule → no_rule outcome ----------------------
  it('17. no enabled+current rule for (unit, tag) → no_rule outcome and no event', async () => {
    mocks.alarmRuleFindMany.mockResolvedValueOnce([]);

    const result = await service.evaluate(inputFixture(), client);

    expect(result).toEqual({ outcome: 'no_rule' });
    expect(mocks.alarmEventCreate).not.toHaveBeenCalled();
    expect(mocks.alarmEventFindFirst).not.toHaveBeenCalled();
  });

  // --- F4.6D-0 §9.5 #18: isolation --------------------------------------
  it('18. isolation: evaluator never touches telemetry_readings / live_readings / jobs / realtime', async () => {
    mocks.alarmRuleFindMany.mockResolvedValueOnce([
      ruleFixture({ highThreshold: new Prisma.Decimal('4500') }),
    ]);
    mocks.alarmEventCreate.mockResolvedValueOnce({ id: EVENT_ID });

    await service.evaluate(inputFixture({ value: new Prisma.Decimal('4700') }), client);

    expect(mocks.telemetryReadingFindFirst).not.toHaveBeenCalled();
    expect(mocks.telemetryReadingCreate).not.toHaveBeenCalled();
    expect(mocks.liveReadingFindUnique).not.toHaveBeenCalled();
    expect(mocks.liveReadingCreate).not.toHaveBeenCalled();
    expect(mocks.liveReadingUpdateMany).not.toHaveBeenCalled();
    expect(mocks.jobFindFirst).not.toHaveBeenCalled();
    expect(mocks.jobFindUnique).not.toHaveBeenCalled();
  });

  // --- F4.6D-0 §13: duplicate-active guard -----------------------------
  it('19. duplicate-active guard: existing active event for (unit, tag, rule) → skipped_duplicate_active', async () => {
    mocks.alarmRuleFindMany.mockResolvedValueOnce([
      ruleFixture({ highThreshold: new Prisma.Decimal('4500') }),
    ]);
    mocks.alarmEventFindFirst.mockResolvedValueOnce({ id: EXISTING_EVENT_ID });

    const result = await service.evaluate(
      inputFixture({ value: new Prisma.Decimal('4700') }),
      client,
    );

    expect(result).toMatchObject({
      outcome: 'evaluated',
      perRule: [
        {
          ruleId: RULE_WARNING_ID,
          severity: 'warning',
          status: 'skipped_duplicate_active',
          existingAlarmEventId: EXISTING_EVENT_ID,
        },
      ],
    });
    // Critical: no new event row was written while the existing one is open.
    expect(mocks.alarmEventCreate).not.toHaveBeenCalled();

    // The guard query looks for state='active' on the same composite key.
    const guardArg = mocks.alarmEventFindFirst.mock.calls[0]?.[0];
    expect(guardArg?.where).toMatchObject({
      unitId: UNIT_ID,
      canonicalTagId: CANONICAL_TAG_ID,
      alarmRuleId: RULE_WARNING_ID,
      state: 'active',
    });
  });

  // --- F4.6D-0 §6.1: rule_snapshot fidelity ----------------------------
  it('20. ruleSnapshot freezes rule fields + trigger context at write time', async () => {
    mocks.alarmRuleFindMany.mockResolvedValueOnce([
      ruleFixture({
        id: RULE_CRITICAL_ID,
        severity: 'critical',
        highThreshold: null,
        highHighThreshold: new Prisma.Decimal('5000'),
        deadband: new Prisma.Decimal('25'),
        delaySeconds: 30,
        messageTemplate: 'critical msg',
      }),
    ]);
    mocks.alarmEventCreate.mockResolvedValueOnce({ id: EVENT_ID });

    await service.evaluate(
      inputFixture({
        value: new Prisma.Decimal('5123.4'),
        engineeringUnit: 'psi',
        source: 'manual',
      }),
      client,
    );

    const createArg = mocks.alarmEventCreate.mock.calls[0]?.[0];
    const snapshot = createArg?.data.ruleSnapshot as {
      rule: Record<string, unknown>;
      trigger: Record<string, unknown>;
    };

    expect(snapshot.rule).toMatchObject({
      id: RULE_CRITICAL_ID,
      severity: 'critical',
      version: 1,
      enabled: true,
      highHighThreshold: '5000',
      deadband: '25',
      delaySeconds: 30,
      messageTemplate: 'critical msg',
    });
    expect(snapshot.trigger).toMatchObject({
      thresholdViolated: 'high_high',
      value: '5123.4',
      engineeringUnit: 'psi',
      quality: 'good',
      source: 'manual',
      telemetryReadingId: READING_ID,
    });
    expect(snapshot.trigger.timestamp).toBe(READING_TS.toISOString());

    // Per F4.6D-0 §7: deadband / delaySeconds appear in the snapshot for
    // audit (so the operator can see what was configured) but their
    // hysteresis / debounce semantics are NOT enforced in F4.6D.1. The
    // snapshot recording them does not contradict that scope; it just
    // documents the rule state at trigger time.
  });

  // --- F4.6D-0 §6.1: event row carries the resolved canonical fields ----
  it('21. event row carries tenant/unit/tag/rule/triggeredValue/state=active/firstTriggeredAt', async () => {
    mocks.alarmRuleFindMany.mockResolvedValueOnce([
      ruleFixture({ highThreshold: new Prisma.Decimal('4500') }),
    ]);
    mocks.alarmEventCreate.mockResolvedValueOnce({ id: EVENT_ID });

    await service.evaluate(inputFixture({ value: new Prisma.Decimal('4700') }), client);

    const createArg = mocks.alarmEventCreate.mock.calls[0]?.[0];
    expect(createArg?.data).toMatchObject({
      tenantId: TENANT_ID,
      unitId: UNIT_ID,
      canonicalTagId: CANONICAL_TAG_ID,
      alarmRuleId: RULE_WARNING_ID,
      severity: 'warning',
      thresholdViolated: 'high',
      state: 'active',
      jobId: null,
    });
    expect(createArg?.data.firstTriggeredAt.toISOString()).toBe(READING_TS.toISOString());
    expect(createArg?.data.triggeredValue.toString()).toBe('4700');
  });

  // --- Unexpected DB error propagates so the surrounding transaction rolls back
  it('22. unexpected DB error from alarmEvent.create propagates (lets surrounding $transaction roll back)', async () => {
    mocks.alarmRuleFindMany.mockResolvedValueOnce([
      ruleFixture({ highThreshold: new Prisma.Decimal('4500') }),
    ]);
    mocks.alarmEventCreate.mockRejectedValueOnce(new Error('database connection lost'));

    await expect(
      service.evaluate(inputFixture({ value: new Prisma.Decimal('4700') }), client),
    ).rejects.toThrow('database connection lost');
  });
});
