/**
 * useHistoryBuffer — F2B.
 *
 * Returns the recent reading history of a (jobId, tag) by reading from the
 * realtime store's ring buffer. Re-renders only when a new reading arrives
 * for that tag. Used by sparklines / mini-trends so they reflect the live
 * stream rather than a static mock.
 *
 * Snapshot identity discipline (React 19 `useSyncExternalStore`):
 *
 *   - `store.getHistory()` returns a fresh array on every call (the ring
 *     buffer rebuilds the array from its underlying slots). Naively using
 *     the same function for `getSnapshot` and `getServerSnapshot` triggers
 *     React 19's identity check — "The result of getSnapshot should be
 *     cached to avoid an infinite loop".
 *   - We cache via `useRef` and return the previous reference whenever the
 *     reading list hasn't changed. Per-element identity comparison is
 *     enough: the ring buffer stores reading object references and never
 *     mutates them, so unchanged contents = unchanged refs.
 *   - `getServerSnapshot` returns a module-level frozen empty array — the
 *     server has no live ingestion, so an empty history is honest and
 *     reference-stable.
 *
 * Note: the returned array reflects whatever the ring buffer currently
 * holds (capped at capacity; default 256 in F2A). The caller can `.slice()`
 * to bound it further for a tiny sparkline.
 */
'use client';

import { useMemo, useRef, useSyncExternalStore } from 'react';

import { useTelemetryStore } from './useTelemetryStore';

import type { TelemetryReading } from '../telemetry/models';
import type { CanonicalTag, JobId } from '@rvf/types';

/**
 * Stable empty history used during SSR and as the initial client value.
 * `Object.freeze` makes the immutability explicit; the reference itself is
 * what React 19 needs to stay stable.
 */
export const EMPTY_HISTORY: readonly TelemetryReading[] = Object.freeze<TelemetryReading[]>([]);

const getServerSnapshot = (): readonly TelemetryReading[] => EMPTY_HISTORY;

const historiesEqual = (
  a: readonly TelemetryReading[],
  b: readonly TelemetryReading[],
): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    // Per-element identity is sufficient: ring buffer pushes never mutate
    // stored readings, so unchanged contents ⇒ unchanged references.
    if (a[i] !== b[i]) return false;
  }
  return true;
};

export const useHistoryBuffer = (jobId: JobId, tag: CanonicalTag): readonly TelemetryReading[] => {
  const store = useTelemetryStore();
  const cacheRef = useRef<readonly TelemetryReading[]>(EMPTY_HISTORY);

  const subscribe = useMemo(
    () => (listener: () => void) => store.subscribeTag(jobId, tag, listener),
    [store, jobId, tag],
  );

  const getSnapshot = (): readonly TelemetryReading[] => {
    const raw = store.getHistory(jobId, tag);
    // Collapse "nothing here" to the singleton so two empty-history reads
    // are reference-equal even before the cache kicks in.
    const next = raw.length === 0 ? EMPTY_HISTORY : raw;
    if (historiesEqual(cacheRef.current, next)) return cacheRef.current;
    cacheRef.current = next;
    return next;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
};
