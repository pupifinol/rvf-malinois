/**
 * useLiveValue — F2A.
 *
 * Thin selector over the telemetry store + active snapshot. Re-renders only
 * when a new reading for THIS (jobId, tag) is ingested. Returns undefined
 * until the first reading arrives.
 */
'use client';

import { useMemo, useSyncExternalStore } from 'react';

import { selectLiveValue } from '../realtime/telemetrySelectors';

import { useActiveJobSnapshot } from './useActiveJobSnapshot';
import { useTelemetryStore } from './useTelemetryStore';

import type { SensorReading } from '../telemetry/models';
import type { CanonicalTag, JobId } from '@rvf/types';

export interface UseLiveValueOptions {
  /** Override the active job. Defaults to useActiveJobSnapshot().jobId. */
  jobId?: JobId;
  /** Override "now" — useful for tests + Storybook fixtures. */
  nowMs?: number;
}

export const useLiveValue = (
  tag: CanonicalTag,
  options: UseLiveValueOptions = {},
): SensorReading | undefined => {
  const active = useActiveJobSnapshot();
  const store = useTelemetryStore();
  const jobId = options.jobId ?? active.jobId;

  const subscribe = useMemo(
    () => (listener: () => void) => store.subscribeTag(jobId, tag, listener),
    [store, jobId, tag],
  );

  const getSnapshot = (): SensorReading | undefined =>
    selectLiveValue(store, active.snapshot, jobId, tag, options.nowMs ?? Date.now());

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
