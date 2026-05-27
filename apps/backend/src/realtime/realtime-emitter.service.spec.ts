import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RealtimeEmitterService, type PendingRealtimeEmit } from './realtime-emitter.service';

import type { RealtimeGateway } from './realtime.gateway';
import type {
  AlarmEventCreatedPayload,
  LiveReadingUpdatedPayload,
  RealtimeF4Event,
  TelemetryReadingAcceptedPayload,
} from '@rvf/types';

/**
 * Mocked-Socket.IO unit tests for RealtimeEmitterService (F4.6E.1).
 *
 * Covers the F4.6E-0 §15.1 test plan:
 *   - emits the three F4 event types to the per-tenant room
 *   - skips emit when RVF_REALTIME_EMIT_ENABLED is not "true"
 *   - is best-effort (a per-event throw does not block subsequent emits)
 *   - never touches Prisma / live_readings / alarm_events / telemetry_readings
 *   - payload shapes carry the resolved canonical fields with Decimal-as-string
 *     and ISO-8601 timestamps
 *   - tenant room naming does not allow obvious cross-tenant leakage
 */

const TENANT_A = '00000000-0000-0000-0000-000000000a01';
const TENANT_B = '00000000-0000-0000-0000-000000000b02';
const UNIT_ID = '00000000-0000-0000-0000-000000000d04';
const SENSOR_ID = '00000000-0000-0000-0000-000000000e05';
const CANONICAL_TAG_ID = '00000000-0000-0000-0000-000000000f06';
const READING_ID = '00000000-0000-0000-0000-000000002008';
const LIVE_READING_ID = '00000000-0000-0000-0000-000000004001';
const ALARM_EVENT_ID = '00000000-0000-0000-0000-000000006001';
const ALARM_RULE_ID = '00000000-0000-0000-0000-000000005001';

const READING_TS = '2026-05-27T12:00:00.000Z';

function telemetryEmit(
  overrides: Partial<TelemetryReadingAcceptedPayload> = {},
): PendingRealtimeEmit {
  return {
    kind: 'telemetry.reading.accepted',
    payload: {
      telemetryReadingId: READING_ID,
      tenantId: TENANT_A,
      unitId: UNIT_ID,
      sensorId: SENSOR_ID,
      canonicalTagId: CANONICAL_TAG_ID,
      value: '4123.4',
      engineeringUnit: 'psi',
      quality: 'good',
      timestamp: READING_TS,
      source: 'manual',
      sequence: '1001',
      ...overrides,
    },
  };
}

function liveReadingEmit(overrides: Partial<LiveReadingUpdatedPayload> = {}): PendingRealtimeEmit {
  return {
    kind: 'live_reading.updated',
    payload: {
      liveReadingId: LIVE_READING_ID,
      tenantId: TENANT_A,
      unitId: UNIT_ID,
      sensorId: SENSOR_ID,
      canonicalTagId: CANONICAL_TAG_ID,
      value: '4123.4',
      engineeringUnit: 'psi',
      quality: 'good',
      timestamp: READING_TS,
      source: 'manual',
      ingestionTimestamp: '2026-05-27T12:00:01.000Z',
      outcome: 'created',
      ...overrides,
    },
  };
}

function alarmEmit(overrides: Partial<AlarmEventCreatedPayload> = {}): PendingRealtimeEmit {
  return {
    kind: 'alarm.event.created',
    payload: {
      alarmEventId: ALARM_EVENT_ID,
      tenantId: TENANT_A,
      unitId: UNIT_ID,
      canonicalTagId: CANONICAL_TAG_ID,
      alarmRuleId: ALARM_RULE_ID,
      severity: 'critical',
      triggeredValue: '5123.4',
      thresholdViolated: 'high_high',
      state: 'active',
      firstTriggeredAt: READING_TS,
      ...overrides,
    },
  };
}

/**
 * Build a gateway-shaped mock whose `server.to(room).emit(kind, envelope)`
 * call chain records every invocation. Returns the recorder plus a way to
 * inject a throw from a specific room for the best-effort test.
 */
function makeGatewayMock(): {
  gateway: RealtimeGateway;
  calls: { room: string; kind: string; envelope: RealtimeF4Event }[];
  throwOnRoom: (room: string, err: Error) => void;
} {
  const calls: { room: string; kind: string; envelope: RealtimeF4Event }[] = [];
  const throwRooms = new Map<string, Error>();

  const makeRoom = (room: string) => ({
    emit: (kind: string, envelope: RealtimeF4Event): boolean => {
      const planned = throwRooms.get(room);
      if (planned) {
        throwRooms.delete(room);
        throw planned;
      }
      calls.push({ room, kind, envelope });
      return true;
    },
  });

  const server = {
    to: (room: string) => makeRoom(room),
  };

  const gateway = { server } as unknown as RealtimeGateway;

  return {
    gateway,
    calls,
    throwOnRoom: (room, err) => {
      throwRooms.set(room, err);
    },
  };
}

describe('RealtimeEmitterService.emitMany', () => {
  beforeEach(() => {
    vi.stubEnv('RVF_REALTIME_EMIT_ENABLED', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // --- 1. telemetry.reading.accepted to tenant room --------------------
  it('1. emits telemetry.reading.accepted to the per-tenant room with the F4 envelope shape', () => {
    const { gateway, calls } = makeGatewayMock();
    const service = new RealtimeEmitterService(gateway);

    service.emitMany([telemetryEmit()]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.room).toBe(`tenant:${TENANT_A}`);
    expect(calls[0]?.kind).toBe('telemetry.reading.accepted');
    expect(calls[0]?.envelope).toMatchObject({
      schema: 'rvf.realtime.v1',
      kind: 'telemetry.reading.accepted',
      payload: {
        telemetryReadingId: READING_ID,
        tenantId: TENANT_A,
        unitId: UNIT_ID,
        sensorId: SENSOR_ID,
        canonicalTagId: CANONICAL_TAG_ID,
        value: '4123.4',
        engineeringUnit: 'psi',
        quality: 'good',
        timestamp: READING_TS,
        source: 'manual',
        sequence: '1001',
      },
    });
    expect(typeof calls[0]?.envelope.emittedAt).toBe('string');
    expect(new Date(calls[0]?.envelope.emittedAt ?? '').toString()).not.toBe('Invalid Date');
  });

  // --- 2. live_reading.updated --------------------------------------
  it('2. emits live_reading.updated to the per-tenant room with the resolved liveReadingId', () => {
    const { gateway, calls } = makeGatewayMock();
    const service = new RealtimeEmitterService(gateway);

    service.emitMany([liveReadingEmit()]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.room).toBe(`tenant:${TENANT_A}`);
    expect(calls[0]?.kind).toBe('live_reading.updated');
    expect(calls[0]?.envelope.payload).toMatchObject({
      liveReadingId: LIVE_READING_ID,
      tenantId: TENANT_A,
      unitId: UNIT_ID,
      sensorId: SENSOR_ID,
      canonicalTagId: CANONICAL_TAG_ID,
      value: '4123.4',
      engineeringUnit: 'psi',
      quality: 'good',
      outcome: 'created',
    });
  });

  // --- 3. alarm.event.created --------------------------------------
  it('3. emits alarm.event.created to the per-tenant room with the resolved alarmEventId / severity', () => {
    const { gateway, calls } = makeGatewayMock();
    const service = new RealtimeEmitterService(gateway);

    service.emitMany([alarmEmit()]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.room).toBe(`tenant:${TENANT_A}`);
    expect(calls[0]?.kind).toBe('alarm.event.created');
    expect(calls[0]?.envelope.payload).toMatchObject({
      alarmEventId: ALARM_EVENT_ID,
      tenantId: TENANT_A,
      unitId: UNIT_ID,
      canonicalTagId: CANONICAL_TAG_ID,
      alarmRuleId: ALARM_RULE_ID,
      severity: 'critical',
      triggeredValue: '5123.4',
      thresholdViolated: 'high_high',
      state: 'active',
      firstTriggeredAt: READING_TS,
    });
  });

  // --- 4. RVF_REALTIME_EMIT_ENABLED missing → no emit -----------------
  it('4. emits nothing when RVF_REALTIME_EMIT_ENABLED is not set', () => {
    vi.stubEnv('RVF_REALTIME_EMIT_ENABLED', '');
    const { gateway, calls } = makeGatewayMock();
    const service = new RealtimeEmitterService(gateway);

    service.emitMany([telemetryEmit(), liveReadingEmit(), alarmEmit()]);

    expect(calls).toHaveLength(0);
  });

  // --- 5. RVF_REALTIME_EMIT_ENABLED=false → no emit -------------------
  it('5. emits nothing when RVF_REALTIME_EMIT_ENABLED is not the literal string "true"', () => {
    vi.stubEnv('RVF_REALTIME_EMIT_ENABLED', 'false');
    const { gateway, calls } = makeGatewayMock();
    const service = new RealtimeEmitterService(gateway);

    service.emitMany([telemetryEmit()]);

    expect(calls).toHaveLength(0);

    // Flip to true mid-test to prove the gate is read at emit time, not
    // construct time. The same service instance now emits.
    vi.stubEnv('RVF_REALTIME_EMIT_ENABLED', 'true');
    service.emitMany([telemetryEmit()]);
    expect(calls).toHaveLength(1);
  });

  // --- 6. best-effort: per-event throw does not block the rest ---------
  it('6. is best-effort: an emit throw on event N does not prevent event N+1 from emitting', () => {
    const { gateway, calls, throwOnRoom } = makeGatewayMock();
    const service = new RealtimeEmitterService(gateway);

    throwOnRoom(`tenant:${TENANT_A}`, new Error('simulated socket failure'));

    expect(() =>
      service.emitMany([
        telemetryEmit({ tenantId: TENANT_A }),
        telemetryEmit({ tenantId: TENANT_B }),
      ]),
    ).not.toThrow();

    // First call threw and was caught; second call landed.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.room).toBe(`tenant:${TENANT_B}`);
  });

  // --- 7. tenant room isolation --------------------------------------
  it('7. tenant room naming routes per-tenant events to per-tenant rooms only (no cross-tenant leakage)', () => {
    const { gateway, calls } = makeGatewayMock();
    const service = new RealtimeEmitterService(gateway);

    service.emitMany([telemetryEmit({ tenantId: TENANT_A }), alarmEmit({ tenantId: TENANT_B })]);

    expect(calls).toHaveLength(2);
    expect(calls[0]?.room).toBe(`tenant:${TENANT_A}`);
    expect(calls[1]?.room).toBe(`tenant:${TENANT_B}`);

    // Neither room is the other; nothing emitted to a shared 'broadcast' room.
    expect(calls.every((c) => c.room.startsWith('tenant:'))).toBe(true);
    expect(calls.every((c) => c.room !== 'tenant:')).toBe(true);
  });

  // --- 8. empty batch is a safe no-op ---------------------------------
  it('8. empty batch makes zero gateway calls and does not throw', () => {
    const { gateway, calls } = makeGatewayMock();
    const service = new RealtimeEmitterService(gateway);

    service.emitMany([]);

    expect(calls).toHaveLength(0);
  });

  // --- 9. mixed-batch ordering --------------------------------------
  it('9. mixed batch emits each descriptor exactly once, in input order, with correct kind discrimination', () => {
    const { gateway, calls } = makeGatewayMock();
    const service = new RealtimeEmitterService(gateway);

    service.emitMany([telemetryEmit(), liveReadingEmit(), alarmEmit()]);

    expect(calls.map((c) => c.kind)).toEqual([
      'telemetry.reading.accepted',
      'live_reading.updated',
      'alarm.event.created',
    ]);
  });

  // --- 10. schema version locked --------------------------------------
  it('10. every wire envelope carries schema=rvf.realtime.v1', () => {
    const { gateway, calls } = makeGatewayMock();
    const service = new RealtimeEmitterService(gateway);

    service.emitMany([telemetryEmit(), liveReadingEmit(), alarmEmit()]);

    expect(calls.every((c) => c.envelope.schema === 'rvf.realtime.v1')).toBe(true);
  });
});
