/**
 * useLiveValue — F2A (snapshot-identity-hardened in F2B).
 *
 * Thin selector over the telemetry store + active snapshot. Re-renders only
 * when a new reading for THIS (jobId, tag) is ingested. Returns undefined
 * until the first reading arrives.
 *
 * Snapshot identity discipline (React 19 `useSyncExternalStore`):
 *
 *   - `selectLiveValue` allocates a fresh SensorReading object on every
 *     call. Naively wiring it into `useSyncExternalStore` causes the
 *     "result of getSnapshot should be cached to avoid an infinite loop"
 *     error and a Maximum-update-depth tear-down.
 *   - We cache the previous result in `useRef` and return the previous
 *     reference whenever the structural fields are unchanged.
 *   - `nowMs` is captured once at the top of the hook body so multiple
 *     getSnapshot invocations within the same render see the same value
 *     (Date.now() inside getSnapshot would churn).
 *   - `getServerSnapshot` returns the singleton `undefined` (no data on
 *     the server — the runtime is client-only), which is referentially
 *     stable for free.
 *
 * F2B: accepts an optional `snapshot`. When Operations renders multiple
 * jobs at once, each card passes its own snapshot so thresholds and
 * stale-window overrides come from the correct job rather than the
 * process-wide "active" job.
 */
'use client';

import { useMemo, useRef, useSyncExternalStore } from 'react';

import { selectLiveValue } from '../realtime/telemetrySelectors';

import { useActiveJobSnapshot } from './useActiveJobSnapshot';
import { useTelemetryStore } from './useTelemetryStore';

import type { CommissioningSnapshot } from '../jobs/types';
import type { SensorReading } from '../telemetry/models';
import type { CanonicalTag, JobId } from '@rvf/types';

export interface UseLiveValueOptions {
  /** Override the active job. Defaults to the active snapshot's jobId. */
  jobId?: JobId;
  /** Override the commissioning snapshot used for stale / quality decoration. */
  snapshot?: CommissioningSnapshot;
  /** Override "now" — useful for tests + Storybook fixtures. */
  nowMs?: number;
}

const getServerSnapshot = (): SensorReading | undefined => undefined;

const sensorReadingsEqual = (
  a: SensorReading | undefined,
  b: SensorReading | undefined,
): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.jobId === b.jobId &&
    a.tag === b.tag &&
    a.value === b.value &&
    a.unit === b.unit &&
    a.quality === b.quality &&
    a.ts === b.ts &&
    a.status === b.status
  );
};

export const useLiveValue = (
  tag: CanonicalTag,
  options: UseLiveValueOptions = {},
): SensorReading | undefined => {
  const active = useActiveJobSnapshot();
  const store = useTelemetryStore();
  const snapshot = options.snapshot ?? active.snapshot;
  const jobId = options.jobId ?? snapshot.jobId;
  // Capture nowMs ONCE per render so all getSnapshot calls within this
  // render see the same value — otherwise Date.now() drifts between
  // React's verification calls and snapshot identity churns.
  const nowMs = options.nowMs ?? Date.now();
  const cacheRef = useRef<SensorReading | undefined>(undefined);

  const subscribe = useMemo(
    () => (listener: () => void) => store.subscribeTag(jobId, tag, listener),
    [store, jobId, tag],
  );

  const getSnapshot = (): SensorReading | undefined => {
    const next = selectLiveValue(store, snapshot, jobId, tag, nowMs);
    if (sensorReadingsEqual(cacheRef.current, next)) return cacheRef.current;
    cacheRef.current = next;
    return next;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
};
