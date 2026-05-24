/**
 * Alarm evaluator — F2A pure logic.
 *
 * Rules (F2 doc §7, ADR-005 regla 1):
 *
 *   1. Thresholds always come from the CommissioningSnapshot of the active
 *      job. The result always carries `thresholdsSource: 'commissioning_snapshot'`.
 *   2. Priority: alarm > warning > normal. If a value crosses both
 *      warningHigh and alarmHigh, alarmHigh wins.
 *   3. Sensors with `enabled: false` in the snapshot return 'disabled'.
 *   4. Quality 'bad' or null value returns 'no_data' — never 'normal'.
 *   5. Missing thresholds for the tag return 'disabled' (we have no contract
 *      to evaluate against, so we surface that explicitly to the UI).
 *   6. No React, no IO, no module-level state. Trivially testable.
 */
import type { AlarmEvaluationResult, AlarmState, ThresholdHit } from './types';
import type { CommissioningSnapshot, VariableThresholds } from '../jobs/types';
import type { TelemetryReading } from '../telemetry/models';

interface EvaluateOptions {
  /** Override the timestamp written into the result. Defaults to "now". */
  nowIso?: string;
}

const buildResult = (
  reading: TelemetryReading,
  state: AlarmState,
  hit: ThresholdHit | undefined,
  nowIso: string,
): AlarmEvaluationResult => ({
  jobId: reading.jobId,
  tag: reading.tag,
  state,
  value: reading.value,
  ...(hit !== undefined ? { thresholdHit: hit } : {}),
  quality: reading.quality,
  evaluatedAt: nowIso,
  thresholdsSource: 'commissioning_snapshot',
});

/**
 * Evaluate one reading against the snapshot's effective thresholds.
 *
 * Inputs are passed by value; no internal caching. Callers are expected to
 * call this on each fresh reading and store the result if they need it.
 */
export const evaluateReading = (
  reading: TelemetryReading,
  snapshot: CommissioningSnapshot,
  options: EvaluateOptions = {},
): AlarmEvaluationResult => {
  const nowIso = options.nowIso ?? new Date().toISOString();

  // Sensor mapping check — disabled sensors never evaluate.
  const mapping = snapshot.sensors.find((s) => s.canonicalTag === reading.tag);
  if (!mapping?.enabled) {
    return buildResult(reading, 'disabled', undefined, nowIso);
  }

  // Quality / value gate — no comparison is meaningful on bad/null data.
  if (reading.quality === 'bad' || reading.value === null) {
    return buildResult(reading, 'no_data', undefined, nowIso);
  }

  // Threshold lookup. The set is partial by design; a missing entry is treated
  // as "no contract" → disabled (rather than silently 'normal', which would
  // suggest we validated something we didn't).
  const thresholds: VariableThresholds | undefined = snapshot.effectiveThresholds[reading.tag];
  if (!thresholds) {
    return buildResult(reading, 'disabled', undefined, nowIso);
  }

  const v = reading.value;

  // Alarm bounds win over warning bounds (F2 doc §7 rule 2).
  if (thresholds.alarmHigh !== undefined && v >= thresholds.alarmHigh) {
    return buildResult(reading, 'alarm_high', 'alarmHigh', nowIso);
  }
  if (thresholds.alarmLow !== undefined && v <= thresholds.alarmLow) {
    return buildResult(reading, 'alarm_low', 'alarmLow', nowIso);
  }
  if (thresholds.warningHigh !== undefined && v >= thresholds.warningHigh) {
    return buildResult(reading, 'warning_high', 'warningHigh', nowIso);
  }
  if (thresholds.warningLow !== undefined && v <= thresholds.warningLow) {
    return buildResult(reading, 'warning_low', 'warningLow', nowIso);
  }

  return buildResult(reading, 'normal', undefined, nowIso);
};
