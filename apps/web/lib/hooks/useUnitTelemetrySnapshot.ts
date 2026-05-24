/**
 * useUnitTelemetrySnapshot — F2A.
 *
 * Returns the rolled-up "current view" of a unit's live status — every
 * canonical tag with its latest reading, evaluated alarm state, and
 * stale/offline status — as a single object. Useful for cards that show all
 * variables of a unit at once.
 *
 * Re-renders when ANY reading or alarm event for the job is ingested. A
 * fine-grained per-tile re-render path remains available via useLiveValue +
 * useAlarmState.
 */
'use client';

import { useMemo, useRef, useSyncExternalStore } from 'react';

import { selectUnitTelemetrySnapshot } from '../realtime/telemetrySelectors';

import { useActiveJobSnapshot } from './useActiveJobSnapshot';
import { useTelemetryStore } from './useTelemetryStore';

import type { UnitTelemetrySnapshot } from '../telemetry/models';
import type { JobId } from '@rvf/types';

export interface UseUnitTelemetrySnapshotOptions {
  jobId?: JobId;
  nowMs?: number;
}

export const useUnitTelemetrySnapshot = (
  options: UseUnitTelemetrySnapshotOptions = {},
): UnitTelemetrySnapshot => {
  const active = useActiveJobSnapshot();
  const store = useTelemetryStore();
  const jobId = options.jobId ?? active.jobId;
  // Cache a stable reference across renders until the underlying job changes.
  const lastRef = useRef<UnitTelemetrySnapshot | null>(null);

  const subscribe = useMemo(
    () => (listener: () => void) => store.subscribeJob(jobId, listener),
    [store, jobId],
  );

  const getSnapshot = (): UnitTelemetrySnapshot => {
    const next = selectUnitTelemetrySnapshot(
      store,
      active.snapshot,
      jobId,
      options.nowMs ?? Date.now(),
    );
    // Stabilize identity when no readings have actually changed: useRef +
    // structural compare on byTag keeps useSyncExternalStore happy without
    // recomputing across every render that wasn't triggered by ingestion.
    if (lastRef.current?.jobId === next.jobId) {
      const prev = lastRef.current.byTag as Record<
        string,
        { reading?: unknown; alarm: unknown; stale: unknown }
      >;
      const cur = next.byTag as Record<
        string,
        { reading?: unknown; alarm: unknown; stale: unknown }
      >;
      const prevKeys = Object.keys(prev);
      const curKeys = Object.keys(cur);
      if (prevKeys.length === curKeys.length) {
        let same = true;
        for (const k of curKeys) {
          const a = prev[k];
          const b = cur[k];
          if (!a || !b || a.reading !== b.reading || a.alarm !== b.alarm || a.stale !== b.stale) {
            same = false;
            break;
          }
        }
        if (same) return lastRef.current;
      }
    }
    lastRef.current = next;
    return next;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
