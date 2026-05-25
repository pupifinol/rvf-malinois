/**
 * F4.5C — Equipment / Units data-source-aware adapter + view-model helpers.
 *
 * Two layers:
 *
 *   1. Adapter functions (`adapterListEquipmentTypes`,
 *      `adapterGetEquipmentType`, `adapterListMeasurementUnits`,
 *      `adapterGetMeasurementUnit`) — same pattern as F4.5B
 *      (`tenants` / `wells` / `tags`). Mock branch returns deterministic
 *      F4-shaped fixtures; api branch delegates to `@/lib/api/f4` wrappers.
 *
 *   2. View-model helpers
 *      (`deriveSensorsCount`, `deriveAlarmsCount`,
 *       `derivePressureUnit`, `deriveFlowUnit`, `deriveGasUnit`,
 *       `toMeasurementUnitSummaryViewModel`) — explicit, named, optional.
 *      The legacy F3 `MeasurementUnit` carries `pressureUnit`, `flowUnit`,
 *      `sensorsCount`, `alarmsCount` directly on the row; the F4 backend
 *      does not (those values either live in `unitOperatingEnvelope.engineeringUnitSet`
 *      or are derived from the sensors / alarmRules collections). Migrating
 *      screens use these helpers explicitly — F4.5C does NOT smuggle
 *      computed fields into the response shape itself, so consumers always
 *      see exactly what the API returns.
 *
 * Decisions:
 *
 *   - Mock-mode "not found" rejects with `RvfApiError(404, 'mock:/equipment/...', null, …)`
 *     for parity with the api branch.
 *   - Mock-mode list filters use strict equality (mirrors the F4.4D backend).
 *   - The list endpoint returns rows WITHOUT the full unit-detail include;
 *     callers that need sensors / configuration / envelope / alarm rules
 *     must call `adapterGetMeasurementUnit(id)`.
 *   - `derivePressureUnit` / `deriveFlowUnit` / `deriveGasUnit` read
 *     `unitOperatingEnvelopes[0].engineeringUnitSet.{pressure, liquid_flow,
 *     gas_flow}`. They return `undefined` when the envelope is missing or
 *     the key is absent — no hidden defaults.
 */

import {
  MOCK_F4_EQUIPMENT_TYPES,
  MOCK_F4_MEASUREMENT_UNITS,
  MOCK_F4_MEASUREMENT_UNIT_DETAILS,
} from './mock-fixtures';

import {
  type EquipmentType,
  type GetOptions,
  type MeasurementUnitDetail,
  type MeasurementUnitListRow,
  type MeasurementUnitOperatingProfile,
  type MeasurementUnitStatus,
  RvfApiError,
  getEquipmentType,
  getMeasurementUnit,
  isApiSource,
  listEquipmentTypes,
  listMeasurementUnits,
} from '@/lib/api/f4';

// =============================================================================
// EquipmentType
// =============================================================================

export const adapterListEquipmentTypes = async (options?: GetOptions): Promise<EquipmentType[]> => {
  if (isApiSource()) {
    return listEquipmentTypes(options);
  }
  return Promise.resolve([...MOCK_F4_EQUIPMENT_TYPES].sort((a, b) => a.name.localeCompare(b.name)));
};

export const adapterGetEquipmentType = async (
  id: string,
  options?: GetOptions,
): Promise<EquipmentType> => {
  if (isApiSource()) {
    return getEquipmentType(id, options);
  }
  const row = MOCK_F4_EQUIPMENT_TYPES.find((t) => t.id === id);
  if (!row) {
    return Promise.reject(
      new RvfApiError(
        404,
        `mock:/equipment/types/${id}`,
        null,
        `Equipment type '${id}' not found.`,
      ),
    );
  }
  return Promise.resolve(row);
};

// =============================================================================
// MeasurementUnit
// =============================================================================

export interface ListMeasurementUnitsParams {
  tenantId?: string;
  equipmentTypeId?: string;
  status?: MeasurementUnitStatus;
  operatingProfile?: MeasurementUnitOperatingProfile;
}

const filterMockUnits = (params?: ListMeasurementUnitsParams): MeasurementUnitListRow[] => {
  let rows: MeasurementUnitListRow[] = [...MOCK_F4_MEASUREMENT_UNITS];
  if (params?.tenantId) rows = rows.filter((u) => u.tenantId === params.tenantId);
  if (params?.equipmentTypeId) {
    rows = rows.filter((u) => u.equipmentTypeId === params.equipmentTypeId);
  }
  if (params?.status) rows = rows.filter((u) => u.status === params.status);
  if (params?.operatingProfile) {
    rows = rows.filter((u) => u.operatingProfile === params.operatingProfile);
  }
  return rows;
};

const orderByTenantThenCode = (rows: MeasurementUnitListRow[]): MeasurementUnitListRow[] =>
  [...rows].sort((a, b) => {
    const tenantCmp = a.tenantId.localeCompare(b.tenantId);
    if (tenantCmp !== 0) return tenantCmp;
    return a.code.localeCompare(b.code);
  });

export const adapterListMeasurementUnits = async (
  params?: ListMeasurementUnitsParams,
  options?: GetOptions,
): Promise<MeasurementUnitListRow[]> => {
  if (isApiSource()) {
    return listMeasurementUnits(params, options);
  }
  return Promise.resolve(orderByTenantThenCode(filterMockUnits(params)));
};

export const adapterGetMeasurementUnit = async (
  id: string,
  options?: GetOptions,
): Promise<MeasurementUnitDetail> => {
  if (isApiSource()) {
    return getMeasurementUnit(id, options);
  }
  const row = MOCK_F4_MEASUREMENT_UNIT_DETAILS[id];
  if (!row) {
    return Promise.reject(
      new RvfApiError(
        404,
        `mock:/equipment/units/${id}`,
        null,
        `Measurement unit '${id}' not found.`,
      ),
    );
  }
  return Promise.resolve(row);
};

// =============================================================================
// View-model / derived-field helpers
// =============================================================================

/**
 * Number of sensors on the unit detail. Returns `undefined` when the input
 * is a list row (no sensors include) — callers should fetch the detail
 * endpoint when this number is needed.
 */
export const deriveSensorsCount = (
  detail: { sensors?: readonly unknown[] } | undefined,
): number | undefined => (detail?.sensors ? detail.sensors.length : undefined);

/**
 * Number of currently-active alarm rules on the unit detail. Returns
 * `undefined` when the input is a list row (no alarmRules include).
 */
export const deriveAlarmsCount = (
  detail: { alarmRules?: readonly unknown[] } | undefined,
): number | undefined => (detail?.alarmRules ? detail.alarmRules.length : undefined);

interface EngineeringUnitSet {
  pressure?: string;
  differential_pressure?: string;
  temperature?: string;
  liquid_flow?: string;
  gas_flow?: string;
  volume_liquid?: string;
  volume_gas?: string;
  level?: string;
  vibration?: string;
}

const readEngineeringUnitSet = (detail: MeasurementUnitDetail): EngineeringUnitSet | undefined => {
  const envelope = detail.unitOperatingEnvelopes[0];
  if (!envelope) return undefined;
  const raw = envelope.engineeringUnitSet;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    // `raw` is `unknown` from the schema (`engineeringUnitSet: Json?`);
    // narrow to the structural EngineeringUnitSet shape via a runtime guard
    // above and then expose as `Partial<EngineeringUnitSet>`.
    const obj = raw as { [K in keyof EngineeringUnitSet]?: unknown };
    return {
      pressure: typeof obj.pressure === 'string' ? obj.pressure : undefined,
      differential_pressure:
        typeof obj.differential_pressure === 'string' ? obj.differential_pressure : undefined,
      temperature: typeof obj.temperature === 'string' ? obj.temperature : undefined,
      liquid_flow: typeof obj.liquid_flow === 'string' ? obj.liquid_flow : undefined,
      gas_flow: typeof obj.gas_flow === 'string' ? obj.gas_flow : undefined,
      volume_liquid: typeof obj.volume_liquid === 'string' ? obj.volume_liquid : undefined,
      volume_gas: typeof obj.volume_gas === 'string' ? obj.volume_gas : undefined,
      level: typeof obj.level === 'string' ? obj.level : undefined,
      vibration: typeof obj.vibration === 'string' ? obj.vibration : undefined,
    };
  }
  return undefined;
};

const stringFromUnitSet = (
  detail: MeasurementUnitDetail,
  key: keyof EngineeringUnitSet,
): string | undefined => {
  const value = readEngineeringUnitSet(detail)?.[key];
  return typeof value === 'string' ? value : undefined;
};

export const derivePressureUnit = (detail: MeasurementUnitDetail): string | undefined =>
  stringFromUnitSet(detail, 'pressure');

export const deriveFlowUnit = (detail: MeasurementUnitDetail): string | undefined =>
  stringFromUnitSet(detail, 'liquid_flow');

export const deriveGasUnit = (detail: MeasurementUnitDetail): string | undefined =>
  stringFromUnitSet(detail, 'gas_flow');

export interface MeasurementUnitSummaryViewModel {
  id: string;
  code: string;
  name: string;
  status: MeasurementUnitStatus;
  operatingProfile: MeasurementUnitOperatingProfile;
  location: string | null;
  equipmentTypeName?: string;
  equipmentTypePidReference: string | null;
}

/**
 * Project a list-row to a small summary suitable for table / card rendering.
 * Intentionally drops fields the list view doesn't need (`tenantId`,
 * `equipmentTypeId`, audit timestamps) so the view-model contract stays
 * narrow and migrating screens can switch from the F3 `MeasurementUnit`
 * shape with a thin per-screen mapping.
 */
export const toMeasurementUnitSummaryViewModel = (
  row: MeasurementUnitListRow,
): MeasurementUnitSummaryViewModel => ({
  id: row.id,
  code: row.code,
  name: row.name,
  status: row.status,
  operatingProfile: row.operatingProfile,
  location: row.location,
  equipmentTypeName: row.equipmentType?.name,
  equipmentTypePidReference: row.equipmentType?.pidReference ?? null,
});
