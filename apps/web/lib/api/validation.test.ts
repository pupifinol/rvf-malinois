import { describe, expect, it } from 'vitest';

import { validateTelemetryPayload, validateUnitIdParam } from './validation';

describe('validateTelemetryPayload — shape rules per F3 §13', () => {
  const valid = {
    unitId: 'unit-hp-001',
    timestamp: '2026-05-24T00:00:00.000Z',
    readings: [{ sensorId: 'sensor-pressure-inlet-hp-001', value: 3250, unit: 'psi' }],
  };

  it('accepts a well-formed payload', () => {
    const r = validateTelemetryPayload(valid);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(valid);
  });

  it('rejects a non-object body', () => {
    const r = validateTelemetryPayload('hello');
    expect(r.ok).toBe(false);
  });

  it('rejects a missing unitId', () => {
    const r = validateTelemetryPayload({ ...valid, unitId: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.details.join(' ')).toMatch(/unitId/);
  });

  it('rejects a non-ISO timestamp', () => {
    const r = validateTelemetryPayload({ ...valid, timestamp: 'last tuesday' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.details.join(' ')).toMatch(/timestamp/);
  });

  it('rejects an empty readings array', () => {
    const r = validateTelemetryPayload({ ...valid, readings: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.details.join(' ')).toMatch(/non-empty/);
  });

  it('rejects readings that are not an array', () => {
    const r = validateTelemetryPayload({ ...valid, readings: 'oops' });
    expect(r.ok).toBe(false);
  });

  it('rejects readings missing required fields', () => {
    const r = validateTelemetryPayload({
      ...valid,
      readings: [{ sensorId: '', value: 1, unit: 'psi' }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.details.join(' ')).toMatch(/sensorId/);
  });

  it('rejects a NaN value (not a finite number)', () => {
    const r = validateTelemetryPayload({
      ...valid,
      readings: [{ sensorId: 's1', value: Number.NaN, unit: 'psi' }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.details.join(' ')).toMatch(/finite number/);
  });

  it('rejects an Infinity value', () => {
    const r = validateTelemetryPayload({
      ...valid,
      readings: [{ sensorId: 's1', value: Number.POSITIVE_INFINITY, unit: 'psi' }],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects a non-string unit', () => {
    const r = validateTelemetryPayload({
      ...valid,
      readings: [{ sensorId: 's1', value: 1, unit: 42 }],
    });
    expect(r.ok).toBe(false);
  });
});

describe('validateUnitIdParam', () => {
  it('accepts a non-empty string', () => {
    const r = validateUnitIdParam('unit-hp-001');
    expect(r.ok).toBe(true);
  });

  it('rejects null', () => {
    const r = validateUnitIdParam(null);
    expect(r.ok).toBe(false);
  });

  it('rejects an empty string', () => {
    const r = validateUnitIdParam('');
    expect(r.ok).toBe(false);
  });

  it('rejects whitespace-only strings', () => {
    const r = validateUnitIdParam('   ');
    expect(r.ok).toBe(false);
  });
});
