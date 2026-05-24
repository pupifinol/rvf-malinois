/**
 * AlarmConfiguration — F3 canonical API type.
 *
 * Per F3 §10 and ADR-005 / ADR-006: alarm thresholds are PER-UNIT and
 * PER-SENSOR. Every record references both `unitId` and `sensorId`.
 * Two units may monitor "pressure" and have radically different
 * thresholds — the same software, the same API, different rules.
 *
 * Example (verbatim from F3 §10):
 *   Unit HP-001 high alarm  → 4 500 psi
 *   Unit LP-001 high alarm  →   600 psi
 *
 * There is intentionally NO "default" or "global" alarm threshold
 * anywhere in this model. The API must reject any attempt to introduce
 * one.
 */
export type AlarmType =
  | 'pressure'
  | 'temperature'
  | 'flow'
  | 'vibration'
  | 'volume'
  | 'level'
  | 'composition'
  | 'digital';

export type AlarmSeverity = 'info' | 'warning' | 'critical';

export interface AlarmConfiguration {
  id: string;
  /** Mandatory FK; the unit this alarm belongs to. */
  unitId: string;
  /** Mandatory FK; the sensor this alarm watches. Sensor.unitId === this.unitId. */
  sensorId: string;
  alarmType: AlarmType;
  severity: AlarmSeverity;
  enabled: boolean;
  /** Numeric "low-low" cutoff, or null when this band is not used. */
  lowLowThreshold: number | null;
  /** Numeric "low" cutoff, or null when this band is not used. */
  lowThreshold: number | null;
  /** Numeric "high" cutoff, or null when this band is not used. */
  highThreshold: number | null;
  /** Numeric "high-high" cutoff, or null when this band is not used. */
  highHighThreshold: number | null;
  /** Hysteresis to prevent flapping near a threshold. */
  deadband: number;
  /** Debounce in seconds before the alarm is raised. */
  delaySeconds: number;
  /** Human-readable description shown to operators. */
  message: string;
  createdAt: string;
  updatedAt: string;
}
