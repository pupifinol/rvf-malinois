/**
 * useUnitTelemetrySnapshot — F2A (snapshot-identity-hardened in F2B).
 *
 * Returns the rolled-up "current view" of a unit's live status — every
 * canonical tag with its latest reading, evaluated alarm state, and
 * stale/offline status — as a single object. Useful for cards that show
 * all variables of a unit at once.
 *
 * Snapshot identity discipline:
 *
 *   - `selectUnitTelemetrySnapshot` always allocates a fresh
 *     UnitTelemetrySnapshot. We keep the previous one in `useRef` and
 *     return it whenever the per-tag entries are structurally unchanged.
 *   - `nowMs` is captured ONCE at the top of the hook body so multiple
 *     getSnapshot invocations within the same render see the same value.
 *     Without this, `generatedAt` and `stale.status` could differ between
 *     calls in the same render and bust the cache.
 *   - `getServerSnapshot` returns a module-level stable empty snapshot
 *     (no readings ever served from SSR — the runtime is client-only).
 *
 * F2B: accepts an optional `snapshot` so Operations can render multiple
 * jobs at once, each with its own thresholds.
 */
'use client';

import { useMemo, useRef, useSyncExternalStore } from 'react';

import { selectUnitTelemetrySnapshot } from '../realtime/telemetrySelectors';

import { useActiveJobSnapshot } from './useActiveJobSnapshot';
import { useTelemetryStore } from './useTelemetryStore';

import type { CommissioningSnapshot } from '../jobs/types';
import type { UnitTelemetrySnapshot } from '../telemetry/models';
import type { JobId } from '@rvf/types';

export interface UseUnitTelemetrySnapshotOptions {
  jobId?: JobId;
  snapshot?: CommissioningSnapshot;
  nowMs?: number;
}

const EMPTY_BYTAG = Object.freeze({}) as UnitTelemetrySnapshot['byTag'];

/**
 * Server-side stable empty snapshot. The runtime is client-only, so the
 * server view of any job has no readings yet. Module-level + frozen so the
 * reference is constant — required by React 19's getServerSnapshot.
 */
export const EMPTY_UNIT_TELEMETRY_SNAPSHOT: UnitTelemetrySnapshot = Object.freeze({
  jobId: '__server__' as unknown as JobId,
  generatedAt: '',
  byTag: EMPTY_BYTAG,
});

const getServerSnapshot = (): UnitTelemetrySnapshot => EMPTY_UNIT_TELEMETRY_SNAPSHOT;

const byTagEntriesEqual = (a: UnitTelemetrySnapshot, b: UnitTelemetrySnapshot): boolean => {
  const prev = a.byTag as Record<string, { reading?: unknown; alarm: unknown; stale: unknown }>;
  const cur = b.byTag as Record<string, { reading?: unknown; alarm: unknown; stale: unknown }>;
  const prevKeys = Object.keys(prev);
  const curKeys = Object.keys(cur);
  if (prevKeys.length !== curKeys.length) return false;
  for (const k of curKeys) {
    const x = prev[k];
    const y = cur[k];
    if (!x || !y) return false;
    if (x.reading !== y.reading || x.alarm !== y.alarm || x.stale !== y.stale) return false;
  }
  return true;
};

export const useUnitTelemetrySnapshot = (
  options: UseUnitTelemetrySnapshotOptions = {},
): UnitTelemetrySnapshot => {
  const active = useActiveJobSnapshot();
  const store = useTelemetryStore();
  const snapshot = options.snapshot ?? active.snapshot;
  const jobId = options.jobId ?? snapshot.jobId;
  // Capture nowMs ONCE per render so every getSnapshot call within this
  // render observes the same value — otherwise generatedAt and stale.status
  // can churn between React's verification calls.
  const nowMs = options.nowMs ?? Date.now();
  const cacheRef = useRef<UnitTelemetrySnapshot>(EMPTY_UNIT_TELEMETRY_SNAPSHOT);

  const subscribe = useMemo(
    () => (listener: () => void) => store.subscribeJob(jobId, listener),
    [store, jobId],
  );

  const getSnapshot = (): UnitTelemetrySnapshot => {
    const next = selectUnitTelemetrySnapshot(store, snapshot, jobId, nowMs);
    const prev = cacheRef.current;
    if (prev.jobId === next.jobId && byTagEntriesEqual(prev, next)) return prev;
    cacheRef.current = next;
    return next;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
};
