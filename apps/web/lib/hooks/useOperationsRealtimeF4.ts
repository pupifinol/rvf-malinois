/**
 * useOperationsRealtimeF4 — F4.5G.2.1.
 *
 * Narrow F4-aware realtime hook for the Operations screen. Composes the
 * existing Socket.IO client from `RealtimeProvider` (already mounted at the
 * app root by `apps/web/components/providers/Providers.tsx`), narrows
 * inbound payloads on the F4.6E.1 envelope (`schema === 'rvf.realtime.v1'`),
 * filters by tracked `(unitId, canonicalTagId)` slots, and invalidates the
 * F4.5G.1 trend cache key on reconnect.
 *
 * Per F4.5G.2-0 §8 event-consumption policy:
 *
 *   - `live_reading.updated` is the primary kind; updates the per-slot
 *     view-model. Ignored when the payload's `(unitId, canonicalTagId)`
 *     does not match a tracked slot, the `tenantId` does not match the
 *     subscribed tenant, or the timestamp is older than the slot's last.
 *   - `telemetry.reading.accepted` is intentionally ignored to avoid
 *     double-counting against the `good_only` policy backing `live_readings`.
 *   - `alarm.event.created` is consumed only for a small "events seen since
 *     mount" counter. No browser-side threshold comparison — ADR-005.
 *
 * Per F4.5G.2-0 §9 UUID guardrail:
 *
 *   - The hook only opens the F4 subscription when `isApiSource()` AND the
 *     `tenantId` matches a UUID shape. Otherwise it stays disabled and the
 *     view-model reports `source: 'mock'`.
 *   - Tracked slots whose `unitId` is non-UUID (simulator strings like
 *     `EMMAD-01` from `OPERATIONS_JOBS`) are accepted as keys, but the hook
 *     will never receive events for them (the backend only emits UUIDs).
 *     The hook never embeds the slot's `unitId` in any backend-bound call.
 *
 * On reconnect (`'connected'` after `'reconnecting'`):
 *
 *   - `queryClient.invalidateQueries({ queryKey: ['f4-trends'] })` so the
 *     F4.5G.1 chart cache refetches once the link is back. Cache key shape
 *     is the one F4.5G.1 already ships.
 *
 * The hook does NOT modify `socket.ts`, `RealtimeProvider.tsx`, or the F2
 * `TelemetryStore`. It does NOT push F4 envelopes into the F2 ring buffer
 * (keys would not align: F2 indexes by `(jobId, tag)`, F4 by
 * `(unitId, canonicalTagId)`).
 */
'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import type {
  AlarmEventCreatedPayload,
  LiveReadingUpdatedPayload,
  SubscribeF4Request,
  UnsubscribeF4Request,
} from '@rvf/types';

import { isApiSource } from '@/lib/api/f4';
import { useRealtime } from '@/lib/realtime/RealtimeProvider';

/**
 * Stable default tenant id — mirrors the F4.3 reference seed
 * (`apps/backend/prisma/seed.f4.ts` → `apps/web/lib/api-data/f4/mock-fixtures.ts`
 * → `RVF_INTERNAL_TENANT_ID`). Hardcoded here to avoid a module-load
 * dependency on the fixtures barrel; if the seed value ever moves, both
 * places must update in lockstep.
 */
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

/** UUID-shape predicate; lower-case hex with dashes. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuidShaped = (value: string): boolean => UUID_RE.test(value);

/** Identifier for a tile / chart slot in the hook's view-model. */
export interface TrackedSlot {
  unitId: string;
  canonicalTagId: string;
  /** Optional human-readable label so callers can build a quick UI without re-lookup. */
  canonicalTagName?: string;
}

const slotKey = (s: { unitId: string; canonicalTagId: string }): string =>
  `${s.unitId}::${s.canonicalTagId}`;

export interface SlotLiveValue {
  /** Decimal-serialized value from the F4.6E.1 envelope. */
  value: string;
  engineeringUnit: string;
  /** Reading's own timestamp (ISO-8601). */
  timestamp: string;
  /** ISO-8601 — backend acceptance timestamp from the projection event. */
  ingestionTimestamp: string;
  /** ISO-8601 — when this hook received the event. */
  receivedAt: string;
}

export type OperationsRealtimeSource = 'mock' | 'rest' | 'rest+realtime';

export type OperationsRealtimeConnection =
  | { kind: 'disabled' }
  | { kind: 'connecting' }
  | { kind: 'connected'; since: string }
  | { kind: 'reconnecting'; attempt: number; lastDataAt: string | null }
  | { kind: 'disconnected'; lastDataAt: string | null };

export interface UseOperationsRealtimeF4Result {
  /** Whether the F4 subscription is active. False in mock mode or when tenantId is non-UUID. */
  enabled: boolean;
  /** Normalized connection state for UI consumption. */
  connection: OperationsRealtimeConnection;
  /** Honest source label per ADR-005 freshness contract. */
  source: OperationsRealtimeSource;
  /** ISO-8601 of the most recent F4 event the hook accepted, or null. */
  lastEventReceivedAt: string | null;
  /** Per-tracked-slot latest value (only populated for UUID-shaped slots). */
  slots: ReadonlyMap<string, SlotLiveValue>;
  /** Count of `alarm.event.created` envelopes seen since mount (no browser eval). */
  alarmEventsSeen: number;
  /** Helper used by tests / debug consoles to look up a slot value. */
  getSlotValue: (unitId: string, canonicalTagId: string) => SlotLiveValue | undefined;
}

export interface UseOperationsRealtimeF4Input {
  /** Tenant UUID to subscribe to. Defaults to the F4.3 seed tenant. */
  tenantId?: string;
  /** Slots the caller wants per-slot view-model updates for. */
  trackedSlots?: readonly TrackedSlot[];
  /** Force-disable the F4 subscription (useful for tests / staged rollout). */
  enabled?: boolean;
}

interface F4Envelope {
  schema: 'rvf.realtime.v1';
  kind: 'telemetry.reading.accepted' | 'live_reading.updated' | 'alarm.event.created';
  emittedAt: string;
  payload: unknown;
}

const isF4Envelope = (value: unknown): value is F4Envelope => {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.schema === 'rvf.realtime.v1' &&
    typeof v.kind === 'string' &&
    typeof v.emittedAt === 'string' &&
    'payload' in v
  );
};

const isLiveReadingUpdated = (
  e: F4Envelope,
): e is F4Envelope & { kind: 'live_reading.updated'; payload: LiveReadingUpdatedPayload } =>
  e.kind === 'live_reading.updated';

const isAlarmEventCreated = (
  e: F4Envelope,
): e is F4Envelope & { kind: 'alarm.event.created'; payload: AlarmEventCreatedPayload } =>
  e.kind === 'alarm.event.created';

export const useOperationsRealtimeF4 = (
  input: UseOperationsRealtimeF4Input = {},
): UseOperationsRealtimeF4Result => {
  const { tenantId = DEFAULT_TENANT_ID, trackedSlots, enabled: forceEnabled } = input;

  const queryClient = useQueryClient();
  const realtime = useRealtime();
  const client = realtime.client;
  const providerState = realtime.state;

  // The subscription is allowed only when api mode is active AND the tenant is
  // a backend UUID. The §9 guardrail: never embed a non-UUID identifier in a
  // backend-bound emit.
  const allowed = (forceEnabled ?? true) && isApiSource() && isUuidShaped(tenantId);

  // Slot index by `${unitId}::${canonicalTagId}` — the F4.6E.1 envelope keys.
  // We only insert UUID-shaped pairs so the slot map stays honest about what
  // the backend can actually deliver.
  const slotIndex = useMemo<ReadonlySet<string>>(() => {
    if (!trackedSlots) return new Set<string>();
    const set = new Set<string>();
    for (const s of trackedSlots) {
      if (!isUuidShaped(s.unitId) || !isUuidShaped(s.canonicalTagId)) continue;
      set.add(slotKey(s));
    }
    return set;
  }, [trackedSlots]);

  const [slots, setSlots] = useState<ReadonlyMap<string, SlotLiveValue>>(new Map());
  const [lastEventReceivedAt, setLastEventReceivedAt] = useState<string | null>(null);
  const [alarmEventsSeen, setAlarmEventsSeen] = useState<number>(0);

  // Connection state derived from the provider plus a sticky "was reconnecting"
  // bit so we can fire the trend-invalidation on the next 'connected'.
  const wasReconnectingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!allowed) return;
    if (!client) return;

    // Subscribe once on mount; unsubscribe on unmount.
    const subPayload: SubscribeF4Request = { tenantId };
    client.socket.emit('subscribe', subPayload);

    const handleLiveReading = (payload: unknown): void => {
      const envelope: F4Envelope = {
        schema: 'rvf.realtime.v1',
        kind: 'live_reading.updated',
        emittedAt: new Date().toISOString(),
        payload,
      };
      if (!isLiveReadingUpdated(envelope)) return;
      const p = envelope.payload;
      if (p.tenantId !== tenantId) return;
      const key = slotKey({ unitId: p.unitId, canonicalTagId: p.canonicalTagId });
      if (!slotIndex.has(key)) return;
      setSlots((prev) => {
        const existing = prev.get(key);
        if (existing && Date.parse(existing.timestamp) >= Date.parse(p.timestamp)) {
          return prev;
        }
        const next = new Map(prev);
        next.set(key, {
          value: p.value,
          engineeringUnit: p.engineeringUnit,
          timestamp: p.timestamp,
          ingestionTimestamp: p.ingestionTimestamp,
          receivedAt: new Date().toISOString(),
        });
        return next;
      });
      setLastEventReceivedAt(new Date().toISOString());
    };

    const handleAlarmCreated = (payload: unknown): void => {
      const envelope: F4Envelope = {
        schema: 'rvf.realtime.v1',
        kind: 'alarm.event.created',
        emittedAt: new Date().toISOString(),
        payload,
      };
      if (!isAlarmEventCreated(envelope)) return;
      if (envelope.payload.tenantId !== tenantId) return;
      // Browser does NOT evaluate alarms (ADR-005). We only count server-evaluated events.
      setAlarmEventsSeen((n) => n + 1);
      setLastEventReceivedAt(new Date().toISOString());
    };

    // Fallback path: some backends emit a generic envelope through `onAny`. We
    // listen for both named events AND any inbound F4 envelope, narrowing with
    // the discriminator. `telemetry.reading.accepted` is intentionally not
    // wired — per the policy in F4.5G.2-0 §8.1.
    const liveReadingEventName = 'live_reading.updated';
    const alarmCreatedEventName = 'alarm.event.created';
    client.socket.on(liveReadingEventName, handleLiveReading);
    client.socket.on(alarmCreatedEventName, handleAlarmCreated);

    const onAnyHandler = (event: string, ...args: unknown[]): void => {
      if (event !== liveReadingEventName && event !== alarmCreatedEventName) {
        const [first] = args;
        if (isF4Envelope(first)) {
          if (first.kind === 'live_reading.updated') handleLiveReading(first.payload);
          else if (first.kind === 'alarm.event.created') handleAlarmCreated(first.payload);
          // 'telemetry.reading.accepted' is dropped on the floor by design.
        }
      }
    };
    client.socket.onAny(onAnyHandler);

    return () => {
      client.socket.off(liveReadingEventName, handleLiveReading);
      client.socket.off(alarmCreatedEventName, handleAlarmCreated);
      client.socket.offAny(onAnyHandler);
      const unsubPayload: UnsubscribeF4Request = { tenantId };
      client.socket.emit('unsubscribe', unsubPayload);
    };
  }, [allowed, client, tenantId, slotIndex]);

  // On `'connected'` following `'reconnecting'`, invalidate the F4.5G.1 trend
  // cache so the chart refetches from REST as the canonical resync.
  useEffect(() => {
    if (!allowed) return;
    if (providerState.status === 'reconnecting') {
      wasReconnectingRef.current = true;
      return;
    }
    if (providerState.status === 'connected' && wasReconnectingRef.current) {
      wasReconnectingRef.current = false;
      void queryClient.invalidateQueries({ queryKey: ['f4-trends'] });
    }
  }, [providerState, allowed, queryClient]);

  const connection: OperationsRealtimeConnection = !allowed
    ? { kind: 'disabled' }
    : providerState.status === 'connecting'
      ? { kind: 'connecting' }
      : providerState.status === 'connected'
        ? { kind: 'connected', since: providerState.since }
        : providerState.status === 'reconnecting'
          ? {
              kind: 'reconnecting',
              attempt: providerState.attempt,
              lastDataAt: providerState.lastDataAt,
            }
          : { kind: 'disconnected', lastDataAt: providerState.lastDataAt };

  const source: OperationsRealtimeSource = !allowed
    ? 'mock'
    : connection.kind === 'connected'
      ? 'rest+realtime'
      : 'rest';

  const getSlotValue = (unitId: string, canonicalTagId: string): SlotLiveValue | undefined =>
    slots.get(slotKey({ unitId, canonicalTagId }));

  return {
    enabled: allowed,
    connection,
    source,
    lastEventReceivedAt,
    slots,
    alarmEventsSeen,
    getSlotValue,
  };
};
