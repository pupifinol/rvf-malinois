import { describe, expect, it } from 'vitest';

import { GET as GET_BY_ID } from './[id]/route';
import { GET } from './route';

import type { MeasurementUnit } from '@/types/api';

describe('GET /api/units', () => {
  it('returns the seed unit list', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const units = (await res.json()) as MeasurementUnit[];
    expect(Array.isArray(units)).toBe(true);
    expect(units.length).toBeGreaterThanOrEqual(2);
    expect(units.find((u) => u.id === 'unit-hp-001')).toBeDefined();
  });
});

describe('GET /api/units/[id]', () => {
  it('returns a single unit', async () => {
    const res = await GET_BY_ID(new Request('http://localhost/api/units/unit-hp-001'), {
      params: Promise.resolve({ id: 'unit-hp-001' }),
    });
    expect(res.status).toBe(200);
    const unit = (await res.json()) as MeasurementUnit;
    expect(unit.id).toBe('unit-hp-001');
    expect(unit.operatingProfile).toBe('high_pressure_high_flow');
  });

  it('returns UNIT_NOT_FOUND 404 for an unknown id', async () => {
    const res = await GET_BY_ID(new Request('http://localhost/api/units/zzz'), {
      params: Promise.resolve({ id: 'zzz' }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNIT_NOT_FOUND');
  });
});
