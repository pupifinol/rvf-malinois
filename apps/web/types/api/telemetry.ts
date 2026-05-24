/**
 * Telemetry — F3 canonical API types.
 *
 * Three shapes per F3 §11, deliberately split:
 *
 *   TelemetryPayload  — inbound: one POST = one unit + many readings.
 *   TelemetryReading  — one reading inside a payload.
 *   TelemetryRecord   — stored: carries provenance (quality + source).
 *
 * The split exists so the wire payload stays narrow (no provenance the
 * caller would have to make up) and the stored record stays explicit
 * (quality + source from day one, so the future real ingest doesn't
 * require a schema change).
 */
export type TelemetryQuality = 'good' | 'uncertain' | 'bad';

/**
 * Where a stored record came from. F3 default is `mock` (the canonical
 * adapter); future bridges that POST through `/api/telemetry` set the
 * appropriate source. `plc` and `historian` are anticipated future
 * channels — never connected directly from the browser.
 */
export type TelemetrySource = 'mock' | 'manual' | 'field_gateway' | 'historian' | 'plc';

export interface TelemetryReading {
  sensorId: string;
  value: number;
  /** Engineering unit of the reading, e.g. `psi`, `degC`, `bpd`. */
  unit: string;
}

export interface TelemetryPayload {
  unitId: string;
  /** Edge-side timestamp; ISO UTC. Source of truth — never cloud-arrival. */
  timestamp: string;
  /** Non-empty array; one reading per (sensor) for this `timestamp`. */
  readings: TelemetryReading[];
}

export interface TelemetryRecord {
  id: string;
  unitId: string;
  sensorId: string;
  /** ISO UTC. */
  timestamp: string;
  value: number;
  unit: string;
  quality: TelemetryQuality;
  source: TelemetrySource;
}

/**
 * Successful response shape for POST /api/telemetry.
 *
 * Stable JSON contract — clients (the future WebSocket bridge, the field
 * gateway, contract tests) depend on this shape; do not extend without
 * versioning.
 */
export interface TelemetryAcceptedResponse {
  status: 'accepted';
  unitId: string;
  readingsReceived: number;
  timestamp: string;
}
