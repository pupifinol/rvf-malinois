/**
 * useAlarmState — F2A (snapshot-identity-hardened in F2B).
 *
 * Thin selector over the alarm evaluator (a pure function over the
 * snapshot's effective thresholds). No alarm logic lives in components; it
 * all lives in the evaluator. UIs only consume the result.
 *
 * Snapshot identity discipline: same pattern as `useLiveValue` — capture
 * `nowMs` once per render, structural cache via `useRef`, stable
 * `getServerSnapshot` returning `undefined`. See `useLiveValue.ts` for the
 * narrative; the rules of `useSyncExternalStore` are the same here.
 *
 * F2B: accepts an optional `snapshot` so Operations can render multiple
 * jobs at once, each with its own thresholds.
 */
'use client';

import { useMemo, useRef, useSyncExternalStore } from 'react';

import { selectAlarmState } from '../realtime/telemetrySelectors';

import { useActiveJobSnapshot } from './useActiveJobSnapshot';
import { useTelemetryStore } from './useTelemetryStore';

import type { AlarmEvaluationResult } from '../alarms/types';
import type { CommissioningSnapshot } from '../jobs/types';
import type { CanonicalTag, JobId } from '@rvf/types';

export interface UseAlarmStateOptions {
  jobId?: JobId;
  snapshot?: CommissioningSnapshot;
  nowMs?: number;
}

const getServerSnapshot = (): AlarmEvaluationResult | undefined => undefined;

const evaluationsEqual = (
  a: AlarmEvaluationResult | undefined,
  b: AlarmEvaluationResult | undefined,
): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.jobId === b.jobId &&
    a.tag === b.tag &&
    a.state === b.state &&
    a.value === b.value &&
    a.thresholdHit === b.thresholdHit &&
    a.quality === b.quality
    // evaluatedAt is intentionally NOT compared — it changes every call but
    // is metadata, not state. Including it would re-bust the cache.
  );
};

export const useAlarmState = (
  tag: CanonicalTag,
  options: UseAlarmStateOptions = {},
): AlarmEvaluationResult | undefined => {
  const active = useActiveJobSnapshot();
  const store = useTelemetryStore();
  const snapshot = options.snapshot ?? active.snapshot;
  const jobId = options.jobId ?? snapshot.jobId;
  const nowMs = options.nowMs ?? Date.now();
  const cacheRef = useRef<AlarmEvaluationResult | undefined>(undefined);

  const subscribe = useMemo(
    () => (listener: () => void) => store.subscribeTag(jobId, tag, listener),
    [store, jobId, tag],
  );

  const getSnapshot = (): AlarmEvaluationResult | undefined => {
    const next = selectAlarmState(store, snapshot, jobId, tag, nowMs);
    if (evaluationsEqual(cacheRef.current, next)) return cacheRef.current;
    cacheRef.current = next;
    return next;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
};
