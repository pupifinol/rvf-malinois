/**
 * useAlarmCenter — F2C (snapshot-identity-hardened).
 *
 * Threads the pure `deriveAlarmCenterSnapshot` through React, subscribed
 * to the telemetry store (readings), the ack store (local acknowledges),
 * and a `useNowTick` (so age-based states — stale / offline — surface
 * even when no readings arrive).
 *
 * ### React 19 snapshot-identity discipline
 *
 * `deriveAlarmCenterSnapshot` is a pure fold over (store, prev, ackedIds,
 * nowMs). It always returns a *fresh* outer object (new `events` array,
 * new `summary`) even when every logical field is unchanged — that is the
 * cheap, testable shape we want from a pure function. But
 * `useSyncExternalStore` calls `getSnapshot()` multiple times per render
 * to check for tearing and will throw "The result of getSnapshot should
 * be cached to avoid an infinite loop" if two consecutive calls produce
 * different references for the same logical state.
 *
 * Defence: structural equality at the hook boundary. After deriving, we
 * compare to `cacheRef.current` field by field; if logically equal, we
 * return the cached reference instead of the freshly derived one. The
 * hook therefore returns a new object reference if and only if the
 * snapshot the operator can actually perceive has changed.
 *
 * ### Fields included in equality
 *
 *   - `summary`: every numeric field (the cards / chips read from these).
 *   - `events.length`: structural cheap-out.
 *   - per-event: id, lifecycle, severity, source, evaluatedState, value,
 *     thresholdValue, thresholdHit, quality, telemetryStatus, firstSeenAt,
 *     ackedAt, ackedBy, clearedAt.
 *
 * Deliberately excluded:
 *
 *   - `lastUpdatedAt`: a per-event timestamp that the merge fast-path
 *     leaves alone unless something else changed, so excluding it is
 *     safe and avoids reference churn on the rare path where the merge
 *     bumps it without other observable changes.
 *   - `generatedAt`: snapshot-level timestamp; never user-visible as an
 *     identity-bearing piece of state.
 *
 * ### Subscribe stability
 *
 * `subscribe` is memoized so React does not unsubscribe/resubscribe on
 * every render. We key the memo on the store + the jobs' joined ids so
 * the same `jobs` array (stable at module scope in the page) maps to the
 * same subscribe function.
 */
'use client';

import { useMemo, useRef, useSyncExternalStore } from 'react';

import {
  deriveAlarmCenterSnapshot,
  EMPTY_ALARM_CENTER_SNAPSHOT,
  getAcknowledgedIds,
  subscribeAckedIds,
  type AlarmCenterSnapshot,
  type AlarmCenterSummary,
  type LiveAlarmEvent,
  type TagLabeller,
} from '../alarms/center';

import { useNowTick } from './useNowTick';
import { useTelemetryStore } from './useTelemetryStore';

import type { ActiveJobSnapshot } from '../jobs/types';

const getServerSnapshot = (): AlarmCenterSnapshot => EMPTY_ALARM_CENTER_SNAPSHOT;

const summariesEqual = (a: AlarmCenterSummary, b: AlarmCenterSummary): boolean =>
  a.urgent === b.urgent &&
  a.high === b.high &&
  a.medium === b.medium &&
  a.low === b.low &&
  a.acked === b.acked &&
  a.cleared === b.cleared &&
  a.totalEvents === b.totalEvents &&
  a.dataQualityActive === b.dataQualityActive &&
  a.communicationActive === b.communicationActive &&
  a.activeUnacked === b.activeUnacked &&
  a.activeTotal === b.activeTotal &&
  a.ackPct === b.ackPct;

const eventsEqual = (a: LiveAlarmEvent, b: LiveAlarmEvent): boolean =>
  a.id === b.id &&
  a.lifecycle === b.lifecycle &&
  a.severity === b.severity &&
  a.source === b.source &&
  a.evaluatedState === b.evaluatedState &&
  a.value === b.value &&
  a.thresholdValue === b.thresholdValue &&
  a.thresholdHit === b.thresholdHit &&
  a.quality === b.quality &&
  a.telemetryStatus === b.telemetryStatus &&
  a.firstSeenAt === b.firstSeenAt &&
  a.ackedAt === b.ackedAt &&
  a.ackedBy === b.ackedBy &&
  a.clearedAt === b.clearedAt;

const snapshotsEqual = (a: AlarmCenterSnapshot, b: AlarmCenterSnapshot): boolean => {
  if (a === b) return true;
  if (a.events.length !== b.events.length) return false;
  if (!summariesEqual(a.summary, b.summary)) return false;
  for (let i = 0; i < a.events.length; i += 1) {
    const ea = a.events[i];
    const eb = b.events[i];
    if (!ea || !eb) return false;
    if (ea === eb) continue;
    if (!eventsEqual(ea, eb)) return false;
  }
  return true;
};

export interface UseAlarmCenterOptions {
  /** Tick cadence in ms; defaults to 5000 — same as the Operations summary. */
  intervalMs?: number;
}

export const useAlarmCenter = (
  jobs: readonly ActiveJobSnapshot[],
  tagLabeller: TagLabeller,
  options: UseAlarmCenterOptions = {},
): AlarmCenterSnapshot => {
  const store = useTelemetryStore();
  const now = useNowTick(options.intervalMs ?? 5000);
  const cacheRef = useRef<AlarmCenterSnapshot>(EMPTY_ALARM_CENTER_SNAPSHOT);

  // Stable subscribe — keyed on the joined job ids so a stable `jobs`
  // array (the page hoists ALARM_JOBS to module scope) maps to a single
  // subscribe function across the lifetime of the hook. Without this,
  // useSyncExternalStore would unsubscribe + resubscribe to every job +
  // the ack store on every render.
  const subscribeKey = jobs.map((j) => String(j.jobId)).join('|');
  const subscribe = useMemo(
    () => (listener: () => void) => {
      const unsubs: (() => void)[] = [];
      for (const j of jobs) {
        unsubs.push(store.subscribeJob(j.jobId, listener));
      }
      unsubs.push(subscribeAckedIds(listener));
      return () => {
        for (const u of unsubs) u();
      };
    },
    // jobs is captured by closure; subscribeKey is the cache-busting input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, subscribeKey],
  );

  const getSnapshot = (): AlarmCenterSnapshot => {
    // useNowTick returns 0 before the first browser tick — keep the
    // stable empty snapshot until the real clock arrives. Without this,
    // the first server-vs-client render would disagree.
    if (now === 0) return cacheRef.current;
    const next = deriveAlarmCenterSnapshot({
      store,
      jobs,
      prev: cacheRef.current,
      ackedIds: getAcknowledgedIds(),
      nowMs: now,
      tagLabeller,
    });
    if (snapshotsEqual(cacheRef.current, next)) return cacheRef.current;
    cacheRef.current = next;
    return next;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
};
