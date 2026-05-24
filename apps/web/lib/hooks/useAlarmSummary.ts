/**
 * useAlarmSummary — F2B.
 *
 * Hook wrapper around `summarizeAlarms`. Subscribes to every job's job-
 * level change feed so the summary refreshes when any reading arrives.
 * Re-renders also fire on the periodic `nowMs` tick so the stale/offline
 * counts age correctly when no readings arrive.
 *
 * Snapshot identity discipline (React 19 `useSyncExternalStore`):
 *
 *   - `getServerSnapshot` MUST return the same reference on every call —
 *     otherwise React 19 throws "The result of getServerSnapshot should be
 *     cached to avoid an infinite loop". We satisfy that with a module-
 *     level `EMPTY_SUMMARY` constant. On the server there is no telemetry
 *     store activity, so the baseline "No active alarms" is correct, not a
 *     lie.
 *   - `getSnapshot` (client) recomputes via `summarizeAlarms`, which
 *     returns a fresh object each call. We memoize via `useRef` with a
 *     structural comparison so the returned reference is stable when
 *     nothing actually changed. Without this, `useSyncExternalStore` would
 *     observe identity churn and re-render on every tick / store event.
 *
 * Lives in `lib/hooks/` so it stays inside the lint surface; the pure
 * summarizer lives next to the Operations screen because the summary
 * concept is Operations-specific (the F2C Alarm Center will introduce its
 * own richer model).
 */
'use client';

import { useMemo, useRef, useSyncExternalStore } from 'react';

import { useNowTick } from './useNowTick';
import { useTelemetryStore } from './useTelemetryStore';

import type { ActiveJobSnapshot } from '../jobs/types';

import { summarizeAlarms, type AlarmSummary } from '@/components/operations/alarmSummary';

/**
 * Stable baseline summary used during SSR and as the initial client value.
 * Module-level so its reference never changes — required by React 19's
 * `getServerSnapshot` contract.
 */
export const EMPTY_ALARM_SUMMARY: AlarmSummary = {
  alarmCount: 0,
  warningCount: 0,
  staleCount: 0,
  headline: 'No active alarms',
  tone: 'normal',
};

const getServerSnapshot = (): AlarmSummary => EMPTY_ALARM_SUMMARY;

const summariesEqual = (a: AlarmSummary, b: AlarmSummary): boolean =>
  a.alarmCount === b.alarmCount &&
  a.warningCount === b.warningCount &&
  a.staleCount === b.staleCount &&
  a.tone === b.tone &&
  a.headline === b.headline;

export const useAlarmSummary = (jobs: readonly ActiveJobSnapshot[]): AlarmSummary => {
  const store = useTelemetryStore();
  const now = useNowTick(5000);
  const cacheRef = useRef<AlarmSummary>(EMPTY_ALARM_SUMMARY);

  // Memoize subscribe by the jobIds joined as a key — when the caller
  // passes a stable jobs array (which is the case for the production
  // HEADER_JOBS module constant) this returns the same subscribe function
  // across renders, preventing useSyncExternalStore from re-subscribing on
  // every render.
  const subscribeKey = jobs.map((j) => String(j.jobId)).join('|');
  const subscribe = useMemo(
    () => (listener: () => void) => {
      const unsubs = jobs.map((j) => store.subscribeJob(j.jobId, listener));
      return () => {
        for (const u of unsubs) u();
      };
    },
    // jobs is captured by closure; subscribeKey is the cache-busting input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, subscribeKey],
  );

  const getSnapshot = (): AlarmSummary => {
    const next = summarizeAlarms(store, jobs, now);
    if (summariesEqual(cacheRef.current, next)) return cacheRef.current;
    cacheRef.current = next;
    return next;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
};
