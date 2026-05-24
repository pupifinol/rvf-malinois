/**
 * /api/telemetry — F3 §13 ingestion chain.
 *
 * Exercises the full validation cascade on POST and the listing rules
 * on GET. Calls the route handlers directly (no live HTTP) so the test
 * runs entirely in pure Node under vitest.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GET as GET_LATEST } from './latest/route';
import { GET, POST } from './route';

import type { TelemetryAcceptedResponse, TelemetryRecord } from '@/types/api';

import { _resetTelemetryBuffer } from '@/lib/api-data';

const jsonReq = (url: string, body: unknown): Request =>
  new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const validPayload = {
  unitId: 'unit-hp-001',
  timestamp: '2026-05-24T00:30:00.000Z',
  readings: [{ sensorId: 'sensor-pressure-inlet-hp-001', value: 3260, unit: 'psi' }],
};

beforeEach(() => {
  _resetTelemetryBuffer();
});

afterEach(() => {
  _resetTelemetryBuffer();
});

describe('POST /api/telemetry — happy path', () => {
  it('accepts a valid payload and returns 202 with the spec-shaped body', async () => {
    const res = await POST(jsonReq('http://localhost/api/telemetry', validPayload));
    expect(res.status).toBe(202);
    const body = (await res.json()) as TelemetryAcceptedResponse;
    expect(body.status).toBe('accepted');
    expect(body.unitId).toBe('unit-hp-001');
    expect(body.readingsReceived).toBe(1);
    expect(body.timestamp).toBe('2026-05-24T00:30:00.000Z');
  });

  it('persists the reading so getLatestTelemetryByUnitId returns it', async () => {
    await POST(jsonReq('http://localhost/api/telemetry', validPayload));
    const res = await GET_LATEST(
      new Request('http://localhost/api/telemetry/latest?unitId=unit-hp-001'),
    );
    expect(res.status).toBe(200);
    const records = (await res.json()) as TelemetryRecord[];
    const p = records.find((r) => r.sensorId === 'sensor-pressure-inlet-hp-001');
    expect(p?.value).toBe(3260);
    expect(p?.quality).toBe('good');
    expect(p?.source).toBe('mock');
  });
});

describe('POST /api/telemetry — failure paths (F3 §13 + §14)', () => {
  it('400 INVALID_PAYLOAD when body is not JSON', async () => {
    const res = await POST(
      new Request('http://localhost/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_PAYLOAD');
  });

  it('400 INVALID_PAYLOAD when required fields are missing', async () => {
    const res = await POST(jsonReq('http://localhost/api/telemetry', { unitId: 'unit-hp-001' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; details?: string[] } };
    expect(body.error.code).toBe('INVALID_PAYLOAD');
    expect(body.error.details?.join(' ')).toMatch(/timestamp|readings/);
  });

  it('400 INVALID_PAYLOAD when readings is empty', async () => {
    const res = await POST(
      jsonReq('http://localhost/api/telemetry', { ...validPayload, readings: [] }),
    );
    expect(res.status).toBe(400);
  });

  it('400 INVALID_PAYLOAD when value is NaN', async () => {
    const res = await POST(
      jsonReq('http://localhost/api/telemetry', {
        ...validPayload,
        readings: [{ sensorId: 'sensor-pressure-inlet-hp-001', value: Number.NaN, unit: 'psi' }],
      }),
    );
    expect(res.status).toBe(400);
  });

  it('400 INVALID_PAYLOAD when timestamp is not ISO', async () => {
    const res = await POST(
      jsonReq('http://localhost/api/telemetry', {
        ...validPayload,
        timestamp: 'last tuesday',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('404 UNIT_NOT_FOUND when unitId does not exist', async () => {
    const res = await POST(
      jsonReq('http://localhost/api/telemetry', {
        ...validPayload,
        unitId: 'unit-ghost-999',
      }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNIT_NOT_FOUND');
  });

  it('404 SENSOR_NOT_FOUND when sensorId does not exist', async () => {
    const res = await POST(
      jsonReq('http://localhost/api/telemetry', {
        ...validPayload,
        readings: [{ sensorId: 'sensor-ghost-999', value: 1, unit: 'psi' }],
      }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('SENSOR_NOT_FOUND');
  });

  it('422 SENSOR_UNIT_MISMATCH when a sensor belongs to a different unit', async () => {
    const res = await POST(
      jsonReq('http://localhost/api/telemetry', {
        ...validPayload,
        unitId: 'unit-hp-001',
        readings: [
          // This sensor belongs to LP, not HP.
          { sensorId: 'sensor-temperature-inlet-lp-001', value: 50, unit: 'degC' },
        ],
      }),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('SENSOR_UNIT_MISMATCH');
  });
});

describe('GET /api/telemetry', () => {
  it('lists telemetry without filter', async () => {
    const res = await GET(new Request('http://localhost/api/telemetry'));
    expect(res.status).toBe(200);
    const records = (await res.json()) as TelemetryRecord[];
    expect(records.length).toBeGreaterThan(0);
  });

  it('filters by unitId', async () => {
    const res = await GET(new Request('http://localhost/api/telemetry?unitId=unit-hp-001'));
    const records = (await res.json()) as TelemetryRecord[];
    for (const r of records) expect(r.unitId).toBe('unit-hp-001');
  });

  it('returns UNIT_NOT_FOUND for unknown filter', async () => {
    const res = await GET(new Request('http://localhost/api/telemetry?unitId=ghost'));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/telemetry/latest', () => {
  it('requires unitId', async () => {
    const res = await GET_LATEST(new Request('http://localhost/api/telemetry/latest'));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_PAYLOAD');
  });

  it('404s on unknown unit', async () => {
    const res = await GET_LATEST(new Request('http://localhost/api/telemetry/latest?unitId=ghost'));
    expect(res.status).toBe(404);
  });

  it('returns latest record per sensor for the given unit', async () => {
    const res = await GET_LATEST(
      new Request('http://localhost/api/telemetry/latest?unitId=unit-hp-001'),
    );
    expect(res.status).toBe(200);
    const records = (await res.json()) as TelemetryRecord[];
    const sensorIds = new Set(records.map((r) => r.sensorId));
    expect(sensorIds.size).toBe(records.length);
  });
});
