import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MOCK_F4_EQUIPMENT_TYPES,
  MOCK_F4_MEASUREMENT_UNITS,
  MOCK_F4_MEASUREMENT_UNIT_DETAILS,
  adapterGetEquipmentType,
  adapterGetMeasurementUnit,
  adapterListEquipmentTypes,
  adapterListMeasurementUnits,
  deriveAlarmsCount,
  deriveFlowUnit,
  deriveGasUnit,
  derivePressureUnit,
  deriveSensorsCount,
  toMeasurementUnitSummaryViewModel,
} from './index';

import { RvfApiError } from '@/lib/api/f4';

/**
 * F4.5C — Equipment / Units adapter + view-model helper tests.
 *
 * Mirrors the F4.5B `adapter.test.ts` posture:
 *   - Mock-mode tests stub `fetch` with a throwing function (guard: any call
 *     fails the test) and clear `NEXT_PUBLIC_RVF_DATA_SOURCE`.
 *   - API-mode tests set `NEXT_PUBLIC_RVF_DATA_SOURCE=api` and stub `fetch`
 *     with a deterministic response; assertions verify the composed URL and
 *     payload pass-through.
 *   - View-model helper tests run against the in-memory detail fixtures.
 */

const ORIGINAL_DATA_SOURCE = process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
const ORIGINAL_API_BASE_URL = process.env.NEXT_PUBLIC_RVF_API_BASE_URL;

const API_BASE = 'https://api.example.test/api/v1';

beforeEach(() => {
  process.env.NEXT_PUBLIC_RVF_API_BASE_URL = API_BASE;
});

afterEach(() => {
  process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = ORIGINAL_DATA_SOURCE;
  process.env.NEXT_PUBLIC_RVF_API_BASE_URL = ORIGINAL_API_BASE_URL;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const stubFetchThatThrows = (): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('fetch must not be called in mock-source mode');
    }),
  );
};

const stubFetchOk = (body: unknown) => {
  const headers = new Headers({ 'content-type': 'application/json' });
  const response = new Response(JSON.stringify(body), { status: 200, headers });
  const fn = vi.fn<typeof fetch>(() => Promise.resolve(response));
  vi.stubGlobal('fetch', fn);
  return fn;
};

const stubFetchStatus = (status: number, body: unknown) => {
  const headers = new Headers({ 'content-type': 'application/json' });
  const response = new Response(JSON.stringify(body), { status, headers });
  const fn = vi.fn<typeof fetch>(() => Promise.resolve(response));
  vi.stubGlobal('fetch', fn);
  return fn;
};

const HP_001_ID = '00000000-0000-0000-0000-000000004411';
const LP_001_ID = '00000000-0000-0000-0000-000000004412';
const EMMAD_ID = '00000000-0000-0000-0000-0000000044d1';

// =============================================================================
// EquipmentType
// =============================================================================

describe('equipment-types adapter', () => {
  it('mock mode: lists EMMAD + EMGAD ordered by name', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const rows = await adapterListEquipmentTypes();
    // Alphabetical: 'EMGAD' < 'EMMAD' lexicographically (matches F4.4D
    // backend's `orderBy: { name: 'asc' }`).
    expect(rows.map((t) => t.name)).toEqual(['EMGAD', 'EMMAD']);
  });

  it('mock mode: getEquipmentType resolves on a known UUID', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const emmad = await adapterGetEquipmentType(EMMAD_ID);
    expect(emmad.name).toBe('EMMAD');
    expect(emmad.pidReference).toBe('EMMAD-generic');
  });

  it('mock mode: getEquipmentType rejects with RvfApiError(404) on miss', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const promise = adapterGetEquipmentType('00000000-0000-0000-0000-deadbeefdead');
    await expect(promise).rejects.toBeInstanceOf(RvfApiError);
    await promise.catch((err: unknown) => {
      expect((err as RvfApiError).status).toBe(404);
    });
  });

  it('api mode: listEquipmentTypes hits the F4 endpoint', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fetchMock = stubFetchOk(MOCK_F4_EQUIPMENT_TYPES);

    const rows = await adapterListEquipmentTypes();
    expect(rows).toHaveLength(MOCK_F4_EQUIPMENT_TYPES.length);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_BASE}/equipment/types`);
  });
});

// =============================================================================
// MeasurementUnit — list + filters
// =============================================================================

describe('measurement-units adapter — list', () => {
  it('mock mode: returns HP-001 + LP-001 ordered by (tenantId, code)', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const rows = await adapterListMeasurementUnits();
    expect(rows.map((u) => u.code)).toEqual(['HP-001', 'LP-001']);
    expect(rows[0]?.equipmentType?.name).toBe('EMMAD');
  });

  it('mock mode: applies the equipmentTypeId filter locally', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const rows = await adapterListMeasurementUnits({ equipmentTypeId: EMMAD_ID });
    expect(rows.every((u) => u.equipmentTypeId === EMMAD_ID)).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it('mock mode: applies the status filter locally', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const active = await adapterListMeasurementUnits({ status: 'active' });
    expect(active.every((u) => u.status === 'active')).toBe(true);

    const offline = await adapterListMeasurementUnits({ status: 'offline' });
    expect(offline).toHaveLength(0);
  });

  it('mock mode: applies the operatingProfile filter locally', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const hp = await adapterListMeasurementUnits({
      operatingProfile: 'high_pressure_high_flow',
    });
    expect(hp.map((u) => u.code)).toEqual(['HP-001']);

    const lp = await adapterListMeasurementUnits({ operatingProfile: 'low' });
    expect(lp.map((u) => u.code)).toEqual(['LP-001']);
  });

  it('mock mode: applies the tenantId filter locally', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const tenantRows = await adapterListMeasurementUnits({
      tenantId: MOCK_F4_MEASUREMENT_UNITS[0]?.tenantId,
    });
    expect(tenantRows).toHaveLength(2);

    const otherTenantRows = await adapterListMeasurementUnits({
      tenantId: '00000000-0000-0000-0000-deadbeefdead',
    });
    expect(otherTenantRows).toHaveLength(0);
  });

  it('api mode: lists measurement units with composed query string', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fetchMock = stubFetchOk([]);

    await adapterListMeasurementUnits({
      tenantId: 'aaaa',
      equipmentTypeId: EMMAD_ID,
      status: 'active',
      operatingProfile: 'low',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${API_BASE}/equipment/units?tenantId=aaaa&equipmentTypeId=${EMMAD_ID}&status=active&operatingProfile=low`,
    );
  });
});

// =============================================================================
// MeasurementUnit — detail
// =============================================================================

describe('measurement-units adapter — detail', () => {
  it('mock mode: getMeasurementUnit returns the HP-001 detail with includes', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const detail = await adapterGetMeasurementUnit(HP_001_ID);
    expect(detail.code).toBe('HP-001');
    expect(detail.equipmentType.name).toBe('EMMAD');
    expect(detail.sensors).toHaveLength(7);
    expect(detail.sensors[0]?.transmitterDevices).toHaveLength(1);
    expect(detail.sensors[0]?.transmitterDevices[0]?.installationStatus).toBe('installed');
    expect(detail.unitConfigurations).toHaveLength(1);
    expect(detail.unitConfigurations[0]?.isCurrent).toBe(true);
    expect(detail.unitOperatingEnvelopes).toHaveLength(1);
    expect(detail.unitOperatingEnvelopes[0]?.isCurrent).toBe(true);
    expect(detail.alarmRules).toHaveLength(14);
    expect(detail.alarmRules.every((r) => r.isCurrent)).toBe(true);
    expect(detail.alarmRules[0]?.canonicalTag.name).toBe('p_inlet');
  });

  it('mock mode: getMeasurementUnit rejects with RvfApiError(404) on unknown id', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const promise = adapterGetMeasurementUnit('00000000-0000-0000-0000-deadbeefdead');
    await expect(promise).rejects.toBeInstanceOf(RvfApiError);
  });

  it('api mode: getMeasurementUnit URL-encodes the id and hits the backend', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fetchMock = stubFetchOk(MOCK_F4_MEASUREMENT_UNIT_DETAILS[HP_001_ID]);

    await adapterGetMeasurementUnit(HP_001_ID);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_BASE}/equipment/units/${HP_001_ID}`);
  });

  it('api mode: backend 404 surfaces as RvfApiError', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    stubFetchStatus(404, {
      statusCode: 404,
      message: "Measurement unit 'xxx' not found.",
      error: 'Not Found',
    });

    await expect(adapterGetMeasurementUnit('xxx')).rejects.toBeInstanceOf(RvfApiError);
  });
});

// =============================================================================
// View-model / derived-field helpers
// =============================================================================

describe('view-model helpers', () => {
  it('deriveSensorsCount returns the array length on a detail; undefined on a list row', () => {
    const hpDetail = MOCK_F4_MEASUREMENT_UNIT_DETAILS[HP_001_ID];
    expect(deriveSensorsCount(hpDetail)).toBe(7);
    expect(deriveSensorsCount(undefined)).toBeUndefined();
    expect(deriveSensorsCount({})).toBeUndefined();
  });

  it('deriveAlarmsCount counts the current rules', () => {
    const hpDetail = MOCK_F4_MEASUREMENT_UNIT_DETAILS[HP_001_ID];
    expect(deriveAlarmsCount(hpDetail)).toBe(14);
    expect(deriveAlarmsCount(undefined)).toBeUndefined();
  });

  it('derive{Pressure,Flow,Gas}Unit reads from the current operating envelope', () => {
    const lpDetail = MOCK_F4_MEASUREMENT_UNIT_DETAILS[LP_001_ID];
    expect(lpDetail).toBeDefined();
    if (!lpDetail) return;
    expect(derivePressureUnit(lpDetail)).toBe('psi');
    expect(deriveFlowUnit(lpDetail)).toBe('bpd');
    expect(deriveGasUnit(lpDetail)).toBe('MMSCFD');
  });

  it('toMeasurementUnitSummaryViewModel projects a compact summary', () => {
    const row = MOCK_F4_MEASUREMENT_UNITS[0];
    expect(row).toBeDefined();
    if (!row) return;
    const vm = toMeasurementUnitSummaryViewModel(row);
    expect(vm).toEqual({
      id: row.id,
      code: row.code,
      name: row.name,
      status: row.status,
      operatingProfile: row.operatingProfile,
      location: row.location,
      equipmentTypeName: row.equipmentType?.name,
      equipmentTypePidReference: row.equipmentType?.pidReference ?? null,
    });
  });
});
