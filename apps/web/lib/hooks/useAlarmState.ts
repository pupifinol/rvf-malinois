/**
 * useAlarmState — F2A.
 *
 * Thin selector over the alarm evaluator (which is itself a pure function
 * over the snapshot's effective thresholds). No alarm logic lives in
 * components; it all lives in the evaluator. UIs only consume the result.
 */
'use client';

import { useMemo, useSyncExternalStore } from 'react';

import { selectAlarmState } from '../realtime/telemetrySelectors';

import { useActiveJobSnapshot } from './useActiveJobSnapshot';
import { useTelemetryStore } from './useTelemetryStore';

import type { AlarmEvaluationResult } from '../alarms/types';
import type { CanonicalTag, JobId } from '@rvf/types';

export interface UseAlarmStateOptions {
  jobId?: JobId;
  nowMs?: number;
}

export const useAlarmState = (
  tag: CanonicalTag,
  options: UseAlarmStateOptions = {},
): AlarmEvaluationResult | undefined => {
  const active = useActiveJobSnapshot();
  const store = useTelemetryStore();
  const jobId = options.jobId ?? active.jobId;

  const subscribe = useMemo(
    () => (listener: () => void) => store.subscribeTag(jobId, tag, listener),
    [store, jobId, tag],
  );

  const getSnapshot = (): AlarmEvaluationResult | undefined =>
    selectAlarmState(store, active.snapshot, jobId, tag, options.nowMs ?? Date.now());

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
