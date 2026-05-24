/**
 * F3 adapter tests — pure (no React, no Next).
 *
 * Covers the contract the route handlers depend on:
 *   - Catalog lookups (units/sensors/alarms) return seeded shapes.
 *   - Each sensor and alarm belongs to a known unit (FK integrity).
 *   - Per-unit alarm thresholds differ between HP/LP units (F3 §10).
 *   - Telemetry ingest stores records with quality=good / source=mock.
 *   - Latest-by-unit returns one record per sensor.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  _resetTelemetryBuffer,
  getAlarmById,
  getAlarms,
  getAlarmsByUnitId,
  getLatestTelemetryByUnitId,
  getSensorById,
  getSensors,
  getSensorsByUnitId,
  getTelemetry,
  getTelemetryByUnitId,
  getUnitById,
  getUnits,
  ingestTelemetry,
} from './index';

afterEach(() => {
  _resetTelemetryBuffer();
});

describe('catalog adapters', () => {
  it('returns all units with stable ids', async () => {
    const units = await getUnits();
    expect(units.length).toBeGreaterThanOrEqual(2);
    expect(units.some((u) => u.id === 'unit-hp-001')).toBe(true);
    expect(units.some((u) => u.id === 'unit-lp-001')).toBe(true);
  });

  it('resolves a unit by id; null when missing', async () => {
    expect(await getUnitById('unit-hp-001')).toMatchObject({ id: 'unit-hp-001' });
    expect(await getUnitById('does-not-exist')).toBeNull();
  });

  it('every sensor has a unitId referencing a real unit', async () => {
    const sensors = await getSensors();
    const units = await getUnits();
    const unitIds = new Set(units.map((u) => u.id));
    for (const s of sensors) {
      expect(unitIds.has(s.unitId), `Sensor ${s.id} references unknown unit ${s.unitId}`).toBe(
        true,
      );
    }
  });

  it('sensors filter by unit', async () => {
    const hp = await getSensorsByUnitId('unit-hp-001');
    expect(hp.length).toBeGreaterThan(0);
    for (const s of hp) expect(s.unitId).toBe('unit-hp-001');
  });

  it('getSensorById returns null for unknown id', async () => {
    expect(await getSensorById('nope')).toBeNull();
  });
});

describe('alarm configuration adapters — per-unit thresholds (F3 §10)', () => {
  it('each alarm references both a real unit and a real sensor on that unit', async () => {
    const alarms = await getAlarms();
    for (const a of alarms) {
      const unit = await getUnitById(a.unitId);
      expect(unit, `Alarm ${a.id} references unknown unit ${a.unitId}`).not.toBeNull();
      const sensor = await getSensorById(a.sensorId);
      expect(sensor, `Alarm ${a.id} references unknown sensor ${a.sensorId}`).not.toBeNull();
      expect(sensor?.unitId).toBe(a.unitId);
    }
  });

  it('HP-001 and LP-001 pressure alarms have radically different thresholds', async () => {
    const hp = await getAlarmById('alarm-pressure-inlet-hp-001');
    const lp = await getAlarmById('alarm-pressure-inlet-lp-001');
    expect(hp).not.toBeNull();
    expect(lp).not.toBeNull();
    if (!hp || !lp) throw new Error('unreachable');
    // The whole point of F3 §10: same instrument type, different units,
    // different alarm rules. Asserting the threshold ratio in case anyone
    // ever tries to "harmonize" the seed.
    expect(hp.highThreshold).toBe(4500);
    expect(lp.highThreshold).toBe(600);
    expect(hp.highHighThreshold).toBe(5000);
    expect(lp.highHighThreshold).toBe(750);
    expect(hp.highThreshold).toBeGreaterThan((lp.highThreshold ?? 0) * 5);
  });

  it('alarms filter by unit', async () => {
    const hpAlarms = await getAlarmsByUnitId('unit-hp-001');
    expect(hpAlarms.length).toBeGreaterThan(0);
    for (const a of hpAlarms) expect(a.unitId).toBe('unit-hp-001');
  });
});

describe('telemetry adapter', () => {
  it('seed contains at least one record', async () => {
    const all = await getTelemetry();
    expect(all.length).toBeGreaterThan(0);
  });

  it('filters telemetry by unit', async () => {
    const hp = await getTelemetryByUnitId('unit-hp-001');
    expect(hp.length).toBeGreaterThan(0);
    for (const r of hp) expect(r.unitId).toBe('unit-hp-001');
  });

  it('ingestTelemetry appends records tagged with quality=good and source=mock', async () => {
    const before = (await getTelemetry()).length;
    const result = await ingestTelemetry({
      unitId: 'unit-hp-001',
      timestamp: '2026-05-24T00:30:00.000Z',
      readings: [
        { sensorId: 'sensor-pressure-inlet-hp-001', value: 3260, unit: 'psi' },
        { sensorId: 'sensor-flow-main-hp-001', value: 1875, unit: 'bpd' },
      ],
    });
    expect(result.accepted).toBe(2);
    const after = await getTelemetry();
    expect(after.length).toBe(before + 2);
    const ingested = after.slice(-2);
    for (const r of ingested) {
      expect(r.quality).toBe('good');
      expect(r.source).toBe('mock');
      expect(r.unitId).toBe('unit-hp-001');
    }
  });

  it('getLatestTelemetryByUnitId returns one record per sensor (most recent)', async () => {
    await ingestTelemetry({
      unitId: 'unit-hp-001',
      timestamp: '2026-05-24T00:30:00.000Z',
      readings: [{ sensorId: 'sensor-pressure-inlet-hp-001', value: 9999, unit: 'psi' }],
    });
    const latest = await getLatestTelemetryByUnitId('unit-hp-001');
    const pinlet = latest.find((r) => r.sensorId === 'sensor-pressure-inlet-hp-001');
    expect(pinlet?.value).toBe(9999);
    // One row per sensor in the unit.
    const sensorIds = new Set(latest.map((r) => r.sensorId));
    expect(sensorIds.size).toBe(latest.length);
  });

  it('latest of an unknown unit (after reset) is an empty list', async () => {
    const latest = await getLatestTelemetryByUnitId('unit-does-not-exist');
    expect(latest).toEqual([]);
  });
});
