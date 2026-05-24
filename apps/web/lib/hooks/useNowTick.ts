/**
 * useNowTick — F2B (hydration-safe).
 *
 * Returns `Date.now()` at a regular cadence. Used by views whose state
 * depends on the AGE of the last reading (stale / delayed / offline), so
 * the screen still transitions visually when no new readings arrive — the
 * tag-scoped subscriptions on the telemetry store only fire when a reading
 * is ingested, so the time-based state would otherwise be stuck.
 *
 * Hydration discipline:
 *
 *   - The lazy initializer of `useState(() => Date.now())` runs on BOTH
 *     server and client, and the two values inevitably differ — that's a
 *     hydration mismatch waiting to happen for any UI that renders the
 *     value. Initial state is therefore `0`; the real clock kicks in on
 *     mount via `useEffect`.
 *   - `0` is a stable, render-safe sentinel: selectors that depend on
 *     `nowMs` clamp negative ages to zero, so they behave like
 *     "just-now" until the real tick arrives. Combined with the fact
 *     that the operations runtime only starts on mount (so there are no
 *     readings to compare against pre-mount anyway), this is correct.
 *
 * The interval default of 5 seconds keeps the tick gentle for a control
 * console — the stale boundaries are seconds, not subseconds.
 */
'use client';

import { useEffect, useState } from 'react';

export const useNowTick = (intervalMs = 5000): number => {
  const [now, setNow] = useState<number>(0);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      clearInterval(id);
    };
  }, [intervalMs]);
  return now;
};
