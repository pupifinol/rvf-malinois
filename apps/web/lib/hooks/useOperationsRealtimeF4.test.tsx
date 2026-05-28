/**
 * F4.5G.2.1 — `useOperationsRealtimeF4` hook tests.
 *
 * Covers:
 *   - mock-mode (default `NEXT_PUBLIC_RVF_DATA_SOURCE` unset) → disabled, source='mock'.
 *   - api mode with UUID-shaped tenantId → enabled, emits subscribe / unsubscribe.
 *   - UUID guardrail blocks non-UUID tenant from opening the subscription.
 *   - Non-UUID slot is ignored — never tracked, never receives events.
 *   - `live_reading.updated` matching a tracked slot updates the view-model.
 *   - Mismatched tenant / slot events are ignored.
 *   - Older-timestamp events are dropped.
 *   - `telemetry.reading.accepted` is not consumed.
 *   - `alarm.event.created` increments counter; never evaluates thresholds.
 *   - Reconnect (`'connected'` after `'reconnecting'`) invalidates ['f4-trends'].
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isUuidShaped,
  useOperationsRealtimeF4,
  type UseOperationsRealtimeF4Input,
  type UseOperationsRealtimeF4Result,
} from './useOperationsRealtimeF4';

import type { ConnectionState } from '@rvf/types';

const ORIGINAL_DATA_SOURCE = process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;

const HP_001_UUID = '00000000-0000-0000-0000-000000004411';
const P_INLET_TAG_UUID = '00000000-0000-0000-0000-0000810bfdbe';
const TENANT_UUID = '00000000-0000-0000-0000-000000000001';
const OTHER_TENANT_UUID = '00000000-0000-0000-0000-000000009999';

// --- Mocks ------------------------------------------------------------------

interface FakeSocket {
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  onAny: ReturnType<typeof vi.fn>;
  offAny: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  __handlers: Map<string, (...args: unknown[]) => void>;
  __anyHandlers: Set<(event: string, ...args: unknown[]) => void>;
}

const createFakeSocket = (): FakeSocket => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const anyHandlers = new Set<(event: string, ...args: unknown[]) => void>();
  return {
    __handlers: handlers,
    __anyHandlers: anyHandlers,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
    }),
    off: vi.fn((event: string) => {
      handlers.delete(event);
    }),
    onAny: vi.fn((handler: (event: string, ...args: unknown[]) => void) => {
      anyHandlers.add(handler);
    }),
    offAny: vi.fn((handler: (event: string, ...args: unknown[]) => void) => {
      anyHandlers.delete(handler);
    }),
    emit: vi.fn(),
  };
};

const fakeRealtime = {
  state: { status: 'connected', since: '2026-05-28T10:00:00.000Z' } as ConnectionState,
  client: { socket: createFakeSocket(), onState: vi.fn(), onMessage: vi.fn(), disconnect: vi.fn() },
};

vi.mock('@/lib/realtime/RealtimeProvider', () => ({
  useRealtime: () => fakeRealtime,
}));

// --- Render harness ---------------------------------------------------------

interface Capture {
  current: UseOperationsRealtimeF4Result | null;
}

const renderHook = (props: UseOperationsRealtimeF4Input = {}) => {
  const capture: Capture = { current: null };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

  const Probe = (componentProps: UseOperationsRealtimeF4Input): null => {
    capture.current = useOperationsRealtimeF4(componentProps);
    return null;
  };
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <Probe {...props} />
    </QueryClientProvider>,
  );
  return { capture, queryClient, invalidateSpy, ...utils };
};

beforeEach(() => {
  // Reset the fake socket between tests so emit counts don't leak.
  const socket = createFakeSocket();
  fakeRealtime.client = {
    socket,
    onState: vi.fn(),
    onMessage: vi.fn(),
    disconnect: vi.fn(),
  };
  fakeRealtime.state = { status: 'connected', since: '2026-05-28T10:00:00.000Z' };
});

afterEach(() => {
  process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = ORIGINAL_DATA_SOURCE;
});

// --- isUuidShaped predicate -------------------------------------------------

describe('isUuidShaped', () => {
  it('accepts canonical UUID strings', () => {
    expect(isUuidShaped(HP_001_UUID)).toBe(true);
    expect(isUuidShaped(TENANT_UUID)).toBe(true);
  });

  it('rejects simulator string IDs', () => {
    expect(isUuidShaped('EMMAD-01')).toBe(false);
    expect(isUuidShaped('EMMAD-02')).toBe(false);
    expect(isUuidShaped('PSK-03')).toBe(false);
  });

  it('rejects partially-shaped values', () => {
    expect(isUuidShaped('not-a-uuid')).toBe(false);
    expect(isUuidShaped('')).toBe(false);
    expect(isUuidShaped('00000000-0000-0000-0000')).toBe(false);
  });
});

// --- Mock mode (default) ----------------------------------------------------

describe('useOperationsRealtimeF4 — mock mode (default)', () => {
  it('stays disabled, reports source=mock, emits no subscribe', () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;

    const { capture } = renderHook({ tenantId: TENANT_UUID });

    expect(capture.current?.enabled).toBe(false);
    expect(capture.current?.connection.kind).toBe('disabled');
    expect(capture.current?.source).toBe('mock');
    expect(fakeRealtime.client.socket.emit).not.toHaveBeenCalled();
  });
});

// --- API mode with UUID-shaped tenant --------------------------------------

describe('useOperationsRealtimeF4 — api mode', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
  });

  it('emits subscribe { tenantId } once on mount and unsubscribe on unmount', () => {
    const { unmount } = renderHook({ tenantId: TENANT_UUID });

    const emit = fakeRealtime.client.socket.emit;
    expect(emit).toHaveBeenCalledWith('subscribe', { tenantId: TENANT_UUID });
    const subscribeCalls = emit.mock.calls.filter((c) => c[0] === 'subscribe');
    expect(subscribeCalls).toHaveLength(1);

    unmount();
    expect(emit).toHaveBeenCalledWith('unsubscribe', { tenantId: TENANT_UUID });
  });

  it('reports source=rest+realtime when connected', () => {
    const { capture } = renderHook({ tenantId: TENANT_UUID });
    expect(capture.current?.source).toBe('rest+realtime');
    expect(capture.current?.connection.kind).toBe('connected');
  });

  it('UUID guardrail: non-UUID tenant blocks subscription', () => {
    const { capture } = renderHook({ tenantId: 'EMMAD-01' });
    expect(capture.current?.enabled).toBe(false);
    expect(capture.current?.connection.kind).toBe('disabled');
    expect(fakeRealtime.client.socket.emit).not.toHaveBeenCalled();
  });

  it('non-UUID slot is never tracked', () => {
    const { capture } = renderHook({
      tenantId: TENANT_UUID,
      trackedSlots: [
        { unitId: 'EMMAD-01', canonicalTagId: 'p_inlet' }, // both non-UUID
        { unitId: HP_001_UUID, canonicalTagId: 'p_inlet' }, // tag non-UUID
        { unitId: 'EMMAD-01', canonicalTagId: P_INLET_TAG_UUID }, // unit non-UUID
        { unitId: HP_001_UUID, canonicalTagId: P_INLET_TAG_UUID }, // valid
      ],
    });

    // Only the fully-UUID-shaped slot is eligible to receive events. Trigger an
    // event for each tested combination and confirm only the valid one lands.
    const socket = fakeRealtime.client.socket;
    const handler = socket.__handlers.get('live_reading.updated');
    expect(handler).toBeDefined();
    if (!handler) return;

    act(() => {
      handler({
        liveReadingId: 'lr-1',
        tenantId: TENANT_UUID,
        unitId: 'EMMAD-01',
        sensorId: 's',
        canonicalTagId: 'p_inlet',
        value: '3800',
        engineeringUnit: 'psi',
        quality: 'good',
        timestamp: '2026-05-28T10:00:00.000Z',
        source: 'mock',
        ingestionTimestamp: '2026-05-28T10:00:00.500Z',
        outcome: 'updated',
      });
      handler({
        liveReadingId: 'lr-2',
        tenantId: TENANT_UUID,
        unitId: HP_001_UUID,
        sensorId: 's',
        canonicalTagId: P_INLET_TAG_UUID,
        value: '3810',
        engineeringUnit: 'psi',
        quality: 'good',
        timestamp: '2026-05-28T10:01:00.000Z',
        source: 'mock',
        ingestionTimestamp: '2026-05-28T10:01:00.500Z',
        outcome: 'updated',
      });
    });

    expect(capture.current?.slots.size).toBe(1);
    expect(capture.current?.getSlotValue(HP_001_UUID, P_INLET_TAG_UUID)?.value).toBe('3810');
    expect(capture.current?.getSlotValue('EMMAD-01', 'p_inlet')).toBeUndefined();
  });

  it('mismatched tenant event is ignored', () => {
    const { capture } = renderHook({
      tenantId: TENANT_UUID,
      trackedSlots: [{ unitId: HP_001_UUID, canonicalTagId: P_INLET_TAG_UUID }],
    });
    const handler = fakeRealtime.client.socket.__handlers.get('live_reading.updated');
    if (!handler) throw new Error('handler not wired');

    act(() => {
      handler({
        liveReadingId: 'lr-x',
        tenantId: OTHER_TENANT_UUID,
        unitId: HP_001_UUID,
        sensorId: 's',
        canonicalTagId: P_INLET_TAG_UUID,
        value: '9999',
        engineeringUnit: 'psi',
        quality: 'good',
        timestamp: '2026-05-28T10:00:00.000Z',
        source: 'mock',
        ingestionTimestamp: '2026-05-28T10:00:00.500Z',
        outcome: 'updated',
      });
    });
    expect(capture.current?.slots.size).toBe(0);
  });

  it('older-timestamp event for a tracked slot is dropped', () => {
    const { capture } = renderHook({
      tenantId: TENANT_UUID,
      trackedSlots: [{ unitId: HP_001_UUID, canonicalTagId: P_INLET_TAG_UUID }],
    });
    const handler = fakeRealtime.client.socket.__handlers.get('live_reading.updated');
    if (!handler) throw new Error('handler not wired');

    const newer = {
      liveReadingId: 'lr-new',
      tenantId: TENANT_UUID,
      unitId: HP_001_UUID,
      sensorId: 's',
      canonicalTagId: P_INLET_TAG_UUID,
      value: '3810',
      engineeringUnit: 'psi',
      quality: 'good' as const,
      timestamp: '2026-05-28T10:01:00.000Z',
      source: 'mock',
      ingestionTimestamp: '2026-05-28T10:01:00.500Z',
      outcome: 'updated' as const,
    };
    const older = {
      ...newer,
      liveReadingId: 'lr-old',
      value: '3000',
      timestamp: '2026-05-28T10:00:00.000Z',
    };

    act(() => {
      handler(newer);
      handler(older);
    });

    expect(capture.current?.getSlotValue(HP_001_UUID, P_INLET_TAG_UUID)?.value).toBe('3810');
  });

  it('telemetry.reading.accepted is not consumed', () => {
    const { capture } = renderHook({
      tenantId: TENANT_UUID,
      trackedSlots: [{ unitId: HP_001_UUID, canonicalTagId: P_INLET_TAG_UUID }],
    });
    const socket = fakeRealtime.client.socket;
    // No named handler was registered for telemetry.reading.accepted.
    expect(socket.__handlers.has('telemetry.reading.accepted')).toBe(false);
    // The onAny fallback also drops the kind on the floor.
    const anyHandler = Array.from(socket.__anyHandlers)[0];
    if (anyHandler) {
      act(() => {
        anyHandler('telemetry.reading.accepted', {
          schema: 'rvf.realtime.v1',
          kind: 'telemetry.reading.accepted',
          emittedAt: '2026-05-28T10:00:00.000Z',
          payload: {
            telemetryReadingId: 'tr-1',
            tenantId: TENANT_UUID,
            unitId: HP_001_UUID,
            sensorId: 's',
            canonicalTagId: P_INLET_TAG_UUID,
            value: '3800',
            engineeringUnit: 'psi',
            quality: 'good',
            timestamp: '2026-05-28T10:00:00.000Z',
            source: 'mock',
            sequence: null,
          },
        });
      });
    }
    expect(capture.current?.slots.size).toBe(0);
    expect(capture.current?.lastEventReceivedAt).toBeNull();
  });

  it('alarm.event.created increments counter without browser-side evaluation', () => {
    const { capture } = renderHook({
      tenantId: TENANT_UUID,
      trackedSlots: [{ unitId: HP_001_UUID, canonicalTagId: P_INLET_TAG_UUID }],
    });
    const handler = fakeRealtime.client.socket.__handlers.get('alarm.event.created');
    if (!handler) throw new Error('alarm handler not wired');

    act(() => {
      handler({
        alarmEventId: 'ae-1',
        tenantId: TENANT_UUID,
        unitId: HP_001_UUID,
        canonicalTagId: P_INLET_TAG_UUID,
        alarmRuleId: 'rule-1',
        severity: 'critical',
        triggeredValue: '5200',
        thresholdViolated: 'high_high',
        state: 'active',
        firstTriggeredAt: '2026-05-28T10:00:00.000Z',
      });
    });

    expect(capture.current?.alarmEventsSeen).toBe(1);
    // Slot view-model is unchanged — no value comparison done in browser.
    expect(capture.current?.slots.size).toBe(0);
  });
});

// --- Reconnect invalidation -------------------------------------------------

describe('useOperationsRealtimeF4 — reconnect invalidation', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
  });

  it('invalidates ["f4-trends"] when "connected" follows "reconnecting"', async () => {
    fakeRealtime.state = { status: 'reconnecting', attempt: 1, lastDataAt: null };

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchInterval: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const Probe = ({ tick }: { tick: number }): null => {
      // `tick` forces a re-render so the effect re-evaluates the new realtime state.
      void tick;
      useOperationsRealtimeF4({ tenantId: TENANT_UUID });
      return null;
    };

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <Probe tick={0} />
      </QueryClientProvider>,
    );

    // No invalidation while still reconnecting.
    expect(invalidateSpy).not.toHaveBeenCalled();

    // Flip the mocked provider state to connected and re-render the probe.
    fakeRealtime.state = { status: 'connected', since: '2026-05-28T10:00:01.000Z' };
    rerender(
      <QueryClientProvider client={queryClient}>
        <Probe tick={1} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['f4-trends'] });
    });
  });
});
