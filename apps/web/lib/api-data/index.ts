/**
 * F3 data adapter — flat module.
 *
 * Per F3 §15 ("Adapter, not abstraction tower"): a flat module with
 * named functions returning Promises, NOT a class hierarchy or DI
 * container. The Promise signatures here are the seam — when the real
 * database arrives (PostgreSQL for catalog, TimescaleDB for telemetry)
 * the function bodies become `await db.query(...)`; route handlers,
 * types and tests stay put.
 *
 * Today the bodies are synchronous in-memory lookups, so we use
 * `Promise.resolve(...)` to expose the promised signature without the
 * unnecessary `async` keyword (no `await` to perform yet). When the DB
 * arrives the keyword comes back along with the real awaits.
 *
 * Validation happens at the API route boundary BEFORE adapter calls.
 * Adapters trust their inputs.
 */
import { MOCK_ALARMS } from './mockAlarms';
import { MOCK_SENSORS } from './mockSensors';
import { INGESTED, MOCK_TELEMETRY_SEED, _resetIngested } from './mockTelemetry';
import { MOCK_UNITS } from './mockUnits';

import type {
  AlarmConfiguration,
  MeasurementUnit,
  Sensor,
  TelemetryPayload,
  TelemetryRecord,
} from '@/types/api';

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export const getUnits = (): Promise<MeasurementUnit[]> => Promise.resolve([...MOCK_UNITS]);

export const getUnitById = (id: string): Promise<MeasurementUnit | null> =>
  Promise.resolve(MOCK_UNITS.find((u) => u.id === id) ?? null);

// ---------------------------------------------------------------------------
// Sensors
// ---------------------------------------------------------------------------

export const getSensors = (): Promise<Sensor[]> => Promise.resolve([...MOCK_SENSORS]);

export const getSensorsByUnitId = (unitId: string): Promise<Sensor[]> =>
  Promise.resolve(MOCK_SENSORS.filter((s) => s.unitId === unitId));

export const getSensorById = (id: string): Promise<Sensor | null> =>
  Promise.resolve(MOCK_SENSORS.find((s) => s.id === id) ?? null);

// ---------------------------------------------------------------------------
// Alarm configurations
// ---------------------------------------------------------------------------

export const getAlarms = (): Promise<AlarmConfiguration[]> => Promise.resolve([...MOCK_ALARMS]);

export const getAlarmsByUnitId = (unitId: string): Promise<AlarmConfiguration[]> =>
  Promise.resolve(MOCK_ALARMS.filter((a) => a.unitId === unitId));

export const getAlarmById = (id: string): Promise<AlarmConfiguration | null> =>
  Promise.resolve(MOCK_ALARMS.find((a) => a.id === id) ?? null);

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

/**
 * Ingest a validated payload. The route handler MUST have already
 * verified (a) the unit exists, (b) every sensor exists, (c) every
 * sensor.unitId matches `payload.unitId`. This function just stores.
 *
 * Returns the count of records accepted. Provenance defaults to:
 *   - quality = 'good'   (the route layer rejects bad/non-finite values)
 *   - source  = 'mock'   (F3 has no real upstream channel yet)
 */
export const ingestTelemetry = (payload: TelemetryPayload): Promise<{ accepted: number }> => {
  const baseId = `tel-${String(Date.now())}-${String(INGESTED.length)}`;
  payload.readings.forEach((r, i) => {
    INGESTED.push({
      id: `${baseId}-${String(i)}`,
      unitId: payload.unitId,
      sensorId: r.sensorId,
      timestamp: payload.timestamp,
      value: r.value,
      unit: r.unit,
      quality: 'good',
      source: 'mock',
    });
  });
  return Promise.resolve({ accepted: payload.readings.length });
};

/** Seed + ingested, in arrival order. The seed comes first. */
const allTelemetry = (): TelemetryRecord[] => [...MOCK_TELEMETRY_SEED, ...INGESTED];

export const getTelemetry = (): Promise<TelemetryRecord[]> => Promise.resolve(allTelemetry());

export const getTelemetryByUnitId = (unitId: string): Promise<TelemetryRecord[]> =>
  Promise.resolve(allTelemetry().filter((r) => r.unitId === unitId));

/**
 * Latest record per sensor for a given unit. The "latest" is the most
 * recent `timestamp` per `sensorId`. Returns an empty array if the unit
 * has no telemetry at all. The route handler is responsible for the
 * 404 case (unit doesn't exist).
 */
export const getLatestTelemetryByUnitId = (unitId: string): Promise<TelemetryRecord[]> => {
  const records = allTelemetry().filter((r) => r.unitId === unitId);
  const latestBySensor = new Map<string, TelemetryRecord>();
  for (const r of records) {
    const prev = latestBySensor.get(r.sensorId);
    if (!prev || Date.parse(r.timestamp) > Date.parse(prev.timestamp)) {
      latestBySensor.set(r.sensorId, r);
    }
  }
  return Promise.resolve([...latestBySensor.values()]);
};

/** Test-only reset for the ingestion buffer. */
export const _resetTelemetryBuffer = (): void => {
  _resetIngested();
};
