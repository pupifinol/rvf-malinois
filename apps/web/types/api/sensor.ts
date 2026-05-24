/**
 * Sensor — F3 canonical API type.
 *
 * Per F3 §9: a sensor belongs to EXACTLY ONE MeasurementUnit (`unitId`).
 * The fields here describe the instrument and its last-seen snapshot;
 * alarm thresholds belong to `AlarmConfiguration`, never here.
 *
 * `minRange` / `maxRange` are the *instrument's physical capability* —
 * the manufacturer's calibrated envelope. They are NOT alarm thresholds.
 * A reading inside (`minRange`, `maxRange`) can still trip a high alarm
 * if `AlarmConfiguration.highThreshold` is tighter than `maxRange`.
 */
export type SensorType =
  | 'pressure'
  | 'temperature'
  | 'flow'
  | 'vibration'
  | 'volume'
  | 'level'
  | 'gas_composition'
  | 'digital_status';

export type SensorStatus = 'online' | 'offline' | 'fault' | 'disabled';

export interface Sensor {
  /** Stable id: `sensor-pressure-inlet-hp-001` */
  id: string;
  /** Mandatory FK to `MeasurementUnit.id`. */
  unitId: string;
  /** Canonical tag (e.g. `PT-001`). */
  tag: string;
  name: string;
  type: SensorType;
  /** Human label, e.g. "Inlet pressure". */
  measurement: string;
  /** Engineering unit, e.g. `psi`, `degC`, `bpd`. */
  unit: string;
  status: SensorStatus;
  /** Instrument's physical lower bound (NOT an alarm threshold). */
  minRange: number;
  /** Instrument's physical upper bound (NOT an alarm threshold). */
  maxRange: number;
  /** Last reading numeric value, or `null` if never reported. */
  currentValue: number | null;
  /** ISO UTC of last reading, or `null` if never reported. */
  lastReadingAt: string | null;
  createdAt: string;
  updatedAt: string;
}
