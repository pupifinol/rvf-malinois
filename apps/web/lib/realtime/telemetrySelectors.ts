/**
 * Selectors over TelemetryStore — F2A.
 *
 * These compose the store with the alarm evaluator and stale detector to
 * produce the view-shaped objects hooks return. Each selector is a small
 * pure function over (store, snapshot, jobId, tag, nowMs) so they can be
 * tested without React or timers.
 */
import { evaluateReading } from '../alarms/evaluator';
import { computeStaleFromSnapshot } from '../quality/stale';

import type { TelemetryStore } from './telemetryStore';
import type { AlarmEvaluationResult, AlarmState } from '../alarms/types';
import type { CommissioningSnapshot } from '../jobs/types';
import type { SensorReading, StaleState, UnitTelemetrySnapshot } from '../telemetry/models';
import type { CanonicalTag, JobId } from '@rvf/types';

export const selectLiveValue = (
  store: TelemetryStore,
  snapshot: CommissioningSnapshot,
  jobId: JobId,
  tag: CanonicalTag,
  nowMs: number,
): SensorReading | undefined => {
  const reading = store.getLatestReading(jobId, tag);
  if (!reading) return undefined;
  const stale = computeStaleFromSnapshot({ jobId, tag, lastTs: reading.ts, nowMs, snapshot });
  return {
    jobId,
    tag,
    value: reading.value,
    unit: reading.unit,
    quality: reading.quality,
    ts: reading.ts,
    status: stale.status,
  };
};

export const selectAlarmState = (
  store: TelemetryStore,
  snapshot: CommissioningSnapshot,
  jobId: JobId,
  tag: CanonicalTag,
  nowMs: number,
): AlarmEvaluationResult | undefined => {
  const reading = store.getLatestReading(jobId, tag);
  if (!reading) return undefined;

  const stale = computeStaleFromSnapshot({ jobId, tag, lastTs: reading.ts, nowMs, snapshot });
  // Anti-mentira: a stale/offline tag must not be reported as 'normal' just
  // because its last value was in-band. Override to no_data so the UI shows
  // "sin dato hace X" instead of an old green tile (F2 doc §8).
  if (stale.status === 'stale' || stale.status === 'offline') {
    return {
      jobId,
      tag,
      state: 'no_data',
      value: reading.value,
      quality: reading.quality,
      evaluatedAt: new Date(nowMs).toISOString(),
      thresholdsSource: 'commissioning_snapshot',
    };
  }
  return evaluateReading(reading, snapshot, { nowIso: new Date(nowMs).toISOString() });
};

export const selectStaleState = (
  store: TelemetryStore,
  snapshot: CommissioningSnapshot,
  jobId: JobId,
  tag: CanonicalTag,
  nowMs: number,
): StaleState => {
  const reading = store.getLatestReading(jobId, tag);
  return computeStaleFromSnapshot({
    jobId,
    tag,
    lastTs: reading?.ts,
    nowMs,
    snapshot,
  });
};

export const selectUnitTelemetrySnapshot = (
  store: TelemetryStore,
  snapshot: CommissioningSnapshot,
  jobId: JobId,
  nowMs: number,
): UnitTelemetrySnapshot => {
  const generatedAt = new Date(nowMs).toISOString();
  const byTag: UnitTelemetrySnapshot['byTag'] = {};
  for (const mapping of snapshot.sensors) {
    const tag = mapping.canonicalTag;
    const reading = store.getLatestReading(jobId, tag);
    const stale = computeStaleFromSnapshot({
      jobId,
      tag,
      lastTs: reading?.ts,
      nowMs,
      snapshot,
    });
    let alarm: AlarmState;
    if (!mapping.enabled) {
      alarm = 'disabled';
    } else if (!reading || stale.status === 'stale' || stale.status === 'offline') {
      alarm = 'no_data';
    } else {
      alarm = evaluateReading(reading, snapshot, { nowIso: generatedAt }).state;
    }
    byTag[tag] = {
      ...(reading !== undefined ? { reading } : {}),
      alarm,
      stale: stale.status,
    };
  }
  return { jobId, generatedAt, byTag };
};
