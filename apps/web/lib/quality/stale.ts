/**
 * Stale / offline detector — F2A pure logic.
 *
 * Per F2 doc §8:
 *
 *   live     edge.age < delayedAfterSec
 *   delayed  edge.age ≥ delayedAfterSec   (default 10s)
 *   stale    edge.age ≥ staleAfterSec     (default 30s)
 *   offline  edge.age ≥ offlineAfterSec   (default 120s)
 *
 * The active job's CommissioningSnapshot may override these per canonical
 * tag (`staleTimings`). If a field on the override is missing, the global
 * default for that boundary still applies.
 *
 * Anti-mentira: when a tag is stale or offline, the UI is responsible for
 * NOT showing the last value as if it were live. This module just labels
 * the timing; the display rule lives in the component.
 */
import type { CommissioningSnapshot, StaleTimingsOverride } from '../jobs/types';
import type { StaleState, TelemetryStatus } from '../telemetry/models';
import type { CanonicalTag, JobId } from '@rvf/types';

export interface StaleTimings {
  delayedAfterSec: number;
  staleAfterSec: number;
  offlineAfterSec: number;
}

export const DEFAULT_STALE_TIMINGS: StaleTimings = {
  delayedAfterSec: 10,
  staleAfterSec: 30,
  offlineAfterSec: 120,
};

/** Resolve effective timings for a given tag using snapshot overrides. */
export const resolveTimings = (
  tag: CanonicalTag,
  overrides: StaleTimingsOverride | undefined,
  defaults: StaleTimings = DEFAULT_STALE_TIMINGS,
): StaleTimings => {
  const ov = overrides?.[tag];
  if (!ov) return defaults;
  return {
    delayedAfterSec: ov.delayedAfterSec ?? defaults.delayedAfterSec,
    staleAfterSec: ov.staleAfterSec ?? defaults.staleAfterSec,
    offlineAfterSec: ov.offlineAfterSec ?? defaults.offlineAfterSec,
  };
};

const ageStatus = (ageSec: number, timings: StaleTimings): TelemetryStatus => {
  if (ageSec >= timings.offlineAfterSec) return 'offline';
  if (ageSec >= timings.staleAfterSec) return 'stale';
  if (ageSec >= timings.delayedAfterSec) return 'delayed';
  return 'live';
};

export interface ComputeStaleInput {
  jobId: JobId;
  tag: CanonicalTag;
  /** Last reading timestamp the store has, ISO string. Undefined => never seen. */
  lastTs?: string;
  /** Evaluation time, ms since epoch. */
  nowMs: number;
  /** Per-tag override block from the active snapshot, if any. */
  overrides?: StaleTimingsOverride;
  /** Global defaults — exposed for tests. */
  defaults?: StaleTimings;
}

export const computeStaleState = ({
  jobId,
  tag,
  lastTs,
  nowMs,
  overrides,
  defaults = DEFAULT_STALE_TIMINGS,
}: ComputeStaleInput): StaleState => {
  const timings = resolveTimings(tag, overrides, defaults);

  if (lastTs === undefined) {
    // We've never seen a reading for this (jobId, tag). Treat as offline so
    // the UI never shows a placeholder as if it were live.
    return { jobId, tag, status: 'offline' };
  }

  const lastMs = Date.parse(lastTs);
  if (Number.isNaN(lastMs)) {
    return { jobId, tag, status: 'offline', lastTs };
  }

  const ageSec = Math.max(0, (nowMs - lastMs) / 1000);
  return {
    jobId,
    tag,
    status: ageStatus(ageSec, timings),
    lastTs,
    ageSec,
  };
};

/** Convenience: derive status from an existing CommissioningSnapshot. */
export const computeStaleFromSnapshot = (params: {
  jobId: JobId;
  tag: CanonicalTag;
  lastTs?: string;
  nowMs: number;
  snapshot: CommissioningSnapshot;
  defaults?: StaleTimings;
}): StaleState =>
  computeStaleState({
    jobId: params.jobId,
    tag: params.tag,
    lastTs: params.lastTs,
    nowMs: params.nowMs,
    overrides: params.snapshot.staleTimings,
    defaults: params.defaults,
  });
