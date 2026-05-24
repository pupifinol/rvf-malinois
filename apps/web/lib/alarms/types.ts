/**
 * Alarm evaluation types — F2A.
 *
 * NOTE on naming: `@rvf/types` already exports `AlarmState` for the ISA-18.2
 * lifecycle (active / acknowledged / cleared / shelved). The F2 architecture
 * document uses the *same name* for the band classification of a reading
 * against its thresholds. They are semantically different concepts:
 *
 *   - lifecycle AlarmState (in @rvf/types): does this alarm need attention?
 *   - evaluator  AlarmState (here):         what band is the value in?
 *
 * We keep the F2 naming inside `lib/alarms`. Any file that needs both must
 * use aliased imports — TypeScript handles that cleanly. Mixing both inside a
 * single React component is exactly the smell F2A is built to avoid: UI
 * components consume one or the other through a hook, never both at once.
 */
import type { DataQuality } from '../telemetry/models';
import type { CanonicalTag, JobId } from '@rvf/types';

export type AlarmState =
  | 'normal'
  | 'warning_low'
  | 'warning_high'
  | 'alarm_low'
  | 'alarm_high'
  | 'no_data'
  | 'disabled';

export type ThresholdHit = 'warningLow' | 'warningHigh' | 'alarmLow' | 'alarmHigh';

export interface AlarmEvaluationResult {
  jobId: JobId;
  tag: CanonicalTag;
  state: AlarmState;
  /** The value that was evaluated. `null` when the input value was null/bad. */
  value: number | null;
  /** Which threshold the value tripped, when state is not normal/disabled/no_data. */
  thresholdHit?: ThresholdHit;
  quality: DataQuality;
  /** ISO-8601 UTC; populated by the evaluator at the time of the call. */
  evaluatedAt: string;
  /** Always 'commissioning_snapshot' — see ADR-005, regla 1. */
  thresholdsSource: 'commissioning_snapshot';
}
