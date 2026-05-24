import { describe, expect, it } from 'vitest';

import { GET as GET_BY_ID } from './[id]/route';
import { GET } from './route';

import type { Sensor } from '@/types/api';

describe('GET /api/sensors', () => {
  it('returns all sensors when no filter', async () => {
    const res = await GET(new Request('http://localhost/api/sensors'));
    expect(res.status).toBe(200);
    const sensors = (await res.json()) as Sensor[];
    expect(sensors.length).toBeGreaterThan(0);
  });

  it('filters by unitId', async () => {
    const res = await GET(new Request('http://localhost/api/sensors?unitId=unit-hp-001'));
    expect(res.status).toBe(200);
    const sensors = (await res.json()) as Sensor[];
    for (const s of sensors) expect(s.unitId).toBe('unit-hp-001');
  });

  it('returns UNIT_NOT_FOUND when unitId is unknown', async () => {
    const res = await GET(new Request('http://localhost/api/sensors?unitId=ghost'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNIT_NOT_FOUND');
  });

  it('rejects an empty unitId param with INVALID_PAYLOAD', async () => {
    const res = await GET(new Request('http://localhost/api/sensors?unitId='));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_PAYLOAD');
  });
});

describe('GET /api/sensors/[id]', () => {
  it('returns the sensor when found', async () => {
    const res = await GET_BY_ID(
      new Request('http://localhost/api/sensors/sensor-pressure-inlet-hp-001'),
      { params: Promise.resolve({ id: 'sensor-pressure-inlet-hp-001' }) },
    );
    expect(res.status).toBe(200);
    const sensor = (await res.json()) as Sensor;
    expect(sensor.id).toBe('sensor-pressure-inlet-hp-001');
    expect(sensor.unitId).toBe('unit-hp-001');
  });

  it('returns SENSOR_NOT_FOUND for an unknown id', async () => {
    const res = await GET_BY_ID(new Request('http://localhost/api/sensors/zzz'), {
      params: Promise.resolve({ id: 'zzz' }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('SENSOR_NOT_FOUND');
  });
});
