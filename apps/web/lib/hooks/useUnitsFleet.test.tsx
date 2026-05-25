import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mapMeasurementUnitsToSelectorItems, useUnitsFleet } from './useUnitsFleet';

import type { UnitSelectorItem, UseUnitsFleetResult } from './useUnitsFleet';
import type { MeasurementUnitListRow } from '@/lib/api/f4';

import { twins } from '@/components/units-twin/data/twin.mock';

/**
 * F4.5F — `useUnitsFleet` hook tests.
 *
 * Repo pattern (see `useAlarmSummary.test.tsx`): probe component + render.
 * The hook surface is small (`items / isLoading / error / source`); the
 * tests cover:
 *   - Mock mode default: items derived synchronously from `twins`.
 *   - API mode happy path: items derived from a mocked `adapterListMeasurementUnits`.
 *   - API mode error path: the rejection surfaces as `error`.
 *   - The pure mapper: F4 list rows → `UnitSelectorItem[]`.
 */

const ORIGINAL_DATA_SOURCE = process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;

const { adapterListMeasurementUnitsMock } = vi.hoisted(() => ({
  adapterListMeasurementUnitsMock: vi.fn<() => Promise<MeasurementUnitListRow[]>>(() =>
    Promise.resolve([]),
  ),
}));

vi.mock('@/lib/api-data/f4', () => ({
  adapterListMeasurementUnits: adapterListMeasurementUnitsMock,
}));

interface Capture {
  current: UseUnitsFleetResult | null;
}

const renderHookProbe = (capture: Capture) => {
  const Probe = () => {
    capture.current = useUnitsFleet();
    return null;
  };
  return render(<Probe />);
};

beforeEach(() => {
  adapterListMeasurementUnitsMock.mockReset();
});

afterEach(() => {
  process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = ORIGINAL_DATA_SOURCE;
});

describe('useUnitsFleet — mock mode (default)', () => {
  it('returns items derived from the local twins synchronously', () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    const capture: Capture = { current: null };

    renderHookProbe(capture);

    expect(capture.current).not.toBeNull();
    expect(capture.current?.source).toBe('mock');
    expect(capture.current?.isLoading).toBe(false);
    expect(capture.current?.error).toBeNull();
    expect(capture.current?.items).toHaveLength(twins.length);
    expect(capture.current?.items.map((u) => u.id)).toEqual(twins.map((t) => t.id));
    expect(capture.current?.items[0]?.unitNumber).toBe(twins[0].unitNumber);
    expect(capture.current?.items[0]?.name).toBe(twins[0].name);
  });

  it('does not call the adapter in mock mode', () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    const capture: Capture = { current: null };

    renderHookProbe(capture);

    expect(adapterListMeasurementUnitsMock).not.toHaveBeenCalled();
  });
});

describe('useUnitsFleet — api mode', () => {
  const hp001Row: MeasurementUnitListRow = {
    id: '00000000-0000-0000-0000-000000004411',
    tenantId: '00000000-0000-0000-0000-000000000001',
    equipmentTypeId: '00000000-0000-0000-0000-0000000044d1',
    code: 'HP-001',
    serialNumber: 'RVF-HP-001',
    name: 'High Pressure / High Flow Test Unit',
    status: 'active',
    operatingProfile: 'high_pressure_high_flow',
    location: 'Yard / Test Bench',
    createdAt: '2026-05-24T00:00:00.000Z',
    updatedAt: '2026-05-24T00:00:00.000Z',
  };
  const lp001Row: MeasurementUnitListRow = {
    ...hp001Row,
    id: '00000000-0000-0000-0000-000000004412',
    code: 'LP-001',
    serialNumber: 'RVF-LP-001',
    name: 'Low Pressure / Medium Flow Test Unit',
    operatingProfile: 'low',
  };

  it('starts isLoading=true with empty items, then resolves to mapped F4 rows', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    adapterListMeasurementUnitsMock.mockResolvedValueOnce([hp001Row, lp001Row]);
    const capture: Capture = { current: null };

    renderHookProbe(capture);

    // First render — still loading; items empty.
    expect(capture.current?.source).toBe('api');
    expect(capture.current?.isLoading).toBe(true);
    expect(capture.current?.items).toEqual([]);

    await waitFor(() => {
      expect(capture.current?.isLoading).toBe(false);
    });

    expect(capture.current?.error).toBeNull();
    expect(capture.current?.items).toHaveLength(2);
    expect(capture.current?.items[0]?.code).toBe('HP-001');
    expect(capture.current?.items[0]?.unitNumber).toBe(1);
    expect(capture.current?.items[1]?.code).toBe('LP-001');
    expect(capture.current?.items[1]?.unitNumber).toBe(2);
    expect(adapterListMeasurementUnitsMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces a rejection as `error` and clears loading', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    adapterListMeasurementUnitsMock.mockRejectedValueOnce(new Error('boom'));
    const capture: Capture = { current: null };

    renderHookProbe(capture);

    await waitFor(() => {
      expect(capture.current?.isLoading).toBe(false);
    });

    expect(capture.current?.error?.message).toBe('boom');
    expect(capture.current?.items).toEqual([]);
  });

  it('returns empty items when the backend has no measurement units', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    adapterListMeasurementUnitsMock.mockResolvedValueOnce([]);
    const capture: Capture = { current: null };

    renderHookProbe(capture);

    await waitFor(() => {
      expect(capture.current?.isLoading).toBe(false);
    });

    expect(capture.current?.items).toEqual([]);
    expect(capture.current?.error).toBeNull();
  });
});

describe('mapMeasurementUnitsToSelectorItems', () => {
  it('maps F4 list rows to selector items with ordinal unitNumber', () => {
    const rows: MeasurementUnitListRow[] = [
      {
        id: '00000000-0000-0000-0000-000000004411',
        tenantId: '00000000-0000-0000-0000-000000000001',
        equipmentTypeId: '00000000-0000-0000-0000-0000000044d1',
        code: 'HP-001',
        serialNumber: 'RVF-HP-001',
        name: 'High Pressure / High Flow Test Unit',
        status: 'active',
        operatingProfile: 'high_pressure_high_flow',
        location: 'Yard / Test Bench',
        createdAt: '2026-05-24T00:00:00.000Z',
        updatedAt: '2026-05-24T00:00:00.000Z',
      },
      {
        id: '00000000-0000-0000-0000-000000004412',
        tenantId: '00000000-0000-0000-0000-000000000001',
        equipmentTypeId: '00000000-0000-0000-0000-0000000044d1',
        code: 'LP-001',
        serialNumber: 'RVF-LP-001',
        name: 'Low Pressure / Medium Flow Test Unit',
        status: 'active',
        operatingProfile: 'low',
        location: 'Yard / Test Bench',
        createdAt: '2026-05-24T00:00:00.000Z',
        updatedAt: '2026-05-24T00:00:00.000Z',
      },
    ];

    const items: UnitSelectorItem[] = mapMeasurementUnitsToSelectorItems(rows);
    const [hp001, lp001] = rows;
    expect(hp001).toBeDefined();
    expect(lp001).toBeDefined();
    if (!hp001 || !lp001) return;

    expect(items).toEqual([
      { id: hp001.id, unitNumber: 1, name: hp001.name, code: 'HP-001' },
      { id: lp001.id, unitNumber: 2, name: lp001.name, code: 'LP-001' },
    ]);
  });

  it('returns an empty array for an empty input', () => {
    expect(mapMeasurementUnitsToSelectorItems([])).toEqual([]);
  });
});
