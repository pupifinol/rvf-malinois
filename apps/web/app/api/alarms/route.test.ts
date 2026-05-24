import { describe, expect, it } from 'vitest';

import { GET as GET_BY_ID } from './[id]/route';
import { GET } from './route';

import type { AlarmConfiguration } from '@/types/api';

describe('GET /api/alarms', () => {
  it('returns the alarm list', async () => {
    const res = await GET(new Request('http://localhost/api/alarms'));
    expect(res.status).toBe(200);
    const alarms = (await res.json()) as AlarmConfiguration[];
    expect(alarms.length).toBeGreaterThan(0);
  });

  it('filters by unit and proves per-unit thresholds differ (F3 §10)', async () => {
    const hp = (await (
      await GET(new Request('http://localhost/api/alarms?unitId=unit-hp-001'))
    ).json()) as AlarmConfiguration[];
    const lp = (await (
      await GET(new Request('http://localhost/api/alarms?unitId=unit-lp-001'))
    ).json()) as AlarmConfiguration[];

    const hpPressure = hp.find((a) => a.alarmType === 'pressure');
    const lpPressure = lp.find((a) => a.alarmType === 'pressure');
    expect(hpPressure?.highThreshold).toBe(4500);
    expect(lpPressure?.highThreshold).toBe(600);
  });

  it('returns UNIT_NOT_FOUND for an unknown filter unitId', async () => {
    const res = await GET(new Request('http://localhost/api/alarms?unitId=ghost'));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/alarms/[id]', () => {
  it('returns the alarm when found', async () => {
    const res = await GET_BY_ID(
      new Request('http://localhost/api/alarms/alarm-pressure-inlet-hp-001'),
      { params: Promise.resolve({ id: 'alarm-pressure-inlet-hp-001' }) },
    );
    expect(res.status).toBe(200);
    const alarm = (await res.json()) as AlarmConfiguration;
    expect(alarm.id).toBe('alarm-pressure-inlet-hp-001');
    expect(alarm.unitId).toBe('unit-hp-001');
  });

  it('returns 404 for unknown id', async () => {
    const res = await GET_BY_ID(new Request('http://localhost/api/alarms/zzz'), {
      params: Promise.resolve({ id: 'zzz' }),
    });
    expect(res.status).toBe(404);
  });
});
