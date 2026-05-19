import type { CanonicalTag, JobId, Quality, SensorId, WellId } from './domain';

/**
 * Schema version. Lives in the message so we can evolve without breaking
 * already-deployed gateways. See telemetry-foundation §3 / §4.
 */
export type TelemetrySchemaVersion = 'rvf.telemetry.v1';
export type AlarmSchemaVersion = 'rvf.alarm.v1';
export type EventSchemaVersion = 'rvf.event.v1';

/**
 * A single measurement inside a telemetry message.
 *
 * Keys are deliberately short (`v`, `u`, `q`) because messages travel over
 * satellite — every byte costs. See telemetry-foundation §4.
 */
export interface TelemetryMeasurement {
  /** Numeric value, in canonical units. */
  v: number;
  /** Canonical unit string (e.g. "psi", "degC", "bbl/d"). */
  u: string;
  /** Data quality at the source. */
  q: Quality;
}

/**
 * Canonical telemetry envelope.
 *
 * This is what flows over MQTT from the gateway to ThingsBoard, what the
 * backend reads from ThingsBoard, and what is normalized before being
 * persisted in TimescaleDB or pushed over WebSocket.
 *
 * Per the domain model, every reading is anchored to a JobId — that single
 * key opens the door to the snapshot, well, customer, and equipment context.
 */
export interface TelemetryMessage {
  schema: TelemetrySchemaVersion;
  unit_id: string;
  well_id: WellId;
  job_id: JobId;
  /** ISO-8601 UTC, set at the edge — never use cloud arrival time. */
  ts: string;
  /** Monotonic counter from the gateway; gaps reveal lost packets. */
  seq: number;
  /** Tag-keyed measurements, e.g. `p_inlet: { v: 1245.7, u: 'psi', q: 'good' }`. */
  measurements: Record<CanonicalTag, TelemetryMeasurement>;
}

// ---------------------------------------------------------------------------
// Alarms
// ---------------------------------------------------------------------------

export interface AlarmMessage {
  schema: AlarmSchemaVersion;
  unit_id: string;
  well_id: WellId;
  job_id: JobId;
  /** Deterministic id: unit + source + condition + activation timestamp. */
  alarm_id: string;
  ts: string;
  state: 'active' | 'acknowledged' | 'cleared' | 'shelved';
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Canonical tag that triggered this alarm. */
  source: CanonicalTag;
  condition: 'LO_LO' | 'LO' | 'HI' | 'HI_HI' | 'RATE' | 'DEVIATION' | 'NO_DATA';
  message: string;
  value: number;
  unit: string;
  limit: number;
  seq: number;
}

// ---------------------------------------------------------------------------
// Sensor health (domain-model §16)
// ---------------------------------------------------------------------------
// Kept separate from process telemetry so a dead battery never looks like a
// dead well, and so health alarms never pollute process alarms.

export interface SensorHealthSample {
  sensor_id: SensorId;
  job_id: JobId;
  ts: string;
  battery_pct: number;
  rf_dbm: number;
  hop_count: number;
  /** Seconds since the sensor last reported. */
  seconds_since_last_report: number;
}
