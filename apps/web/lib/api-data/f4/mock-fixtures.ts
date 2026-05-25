/**
 * F4.5B — deterministic mock fixtures aligned with the F4.3 seed.
 *
 * These fixtures are intentionally a thin, F4-shaped subset of the data
 * `apps/backend/prisma/seed.f4.ts` produces. The frontend mock adapter
 * branch under `apps/web/lib/api-data/f4/` returns these objects so a
 * screen consuming the adapter sees the **same response shapes** in mock
 * mode and in API mode — only the transport differs.
 *
 * Two scopes are intentional:
 *
 *   1. The F3 mock files (`mockUnits` / `mockSensors` / `mockAlarms` /
 *      `mockTelemetry`) stay byte-for-byte untouched. They feed the
 *      existing UI through `apps/web/lib/api-data/index.ts`. The F4
 *      domain entities (tenants / wells / canonical tags) had no F3 mock
 *      yet because no existing screen consumed them — F4.5B introduces
 *      them now without disturbing F3.
 *
 *   2. The fixtures here are NOT a 1:1 copy of every seed row. Only the
 *      reference tenant, the reference well, and the canonical-tag
 *      dictionary are mirrored — that is the surface F4.5B exposes
 *      through the adapter. Wider seed coverage (equipment / jobs /
 *      telemetry) is intentionally deferred to F4.5C / D / E.
 *
 * All UUID values are deterministic placeholders shaped like
 * `00000000-0000-0000-0000-XXXXXXXXXXXX`; they do NOT match the real
 * `gen_random_uuid()` ids that the seed generates at runtime. Consumers
 * that need a real id must run the seed and query the API.
 */

import type {
  AlarmRuleWithTag,
  CanonicalTag,
  CommissioningSnapshot,
  EquipmentType,
  EquipmentTypeSummary,
  JobDetail,
  JobListRow,
  MeasurementUnitDetail,
  MeasurementUnitListRow,
  SensorType,
  SensorWithTransmitters,
  Tenant,
  TransmitterDevice,
  UnitConfigurationRow,
  UnitOperatingEnvelopeRow,
  Well,
} from '@/lib/api/f4';

const MOCK_TIMESTAMP = '2026-05-24T00:00:00.000Z';

const RVF_INTERNAL_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export const MOCK_F4_TENANTS: readonly Tenant[] = Object.freeze([
  {
    id: RVF_INTERNAL_TENANT_ID,
    name: 'RVF Internal',
    status: 'active',
    residencyHint: 'local-dev',
    createdAt: MOCK_TIMESTAMP,
    updatedAt: MOCK_TIMESTAMP,
  },
]);

export const MOCK_F4_WELLS: readonly Well[] = Object.freeze([
  {
    id: '00000000-0000-0000-0000-000000004400',
    tenantId: RVF_INTERNAL_TENANT_ID,
    clientId: null,
    name: 'Reference Well A',
    fieldOrSite: 'Reference Field',
    location: 'Local Dev',
    type: 'test',
    fluid: 'multiphase',
    designLimits: {
      max_pressure_psi: 5000,
      max_temperature_degF: 250,
      max_liquid_flow_bpd: 10000,
      max_gas_flow_MMSCFD: 5,
    },
    createdAt: MOCK_TIMESTAMP,
    updatedAt: MOCK_TIMESTAMP,
    tenant: {
      id: RVF_INTERNAL_TENANT_ID,
      name: 'RVF Internal',
      status: 'active',
    },
  },
]);

/**
 * Canonical-tag dictionary — mirrors the 22 entries seeded by F4.3
 * (`apps/backend/prisma/seed.f4.ts`). Field values match the seed exactly.
 */
export const MOCK_F4_CANONICAL_TAGS: readonly CanonicalTag[] = Object.freeze([
  // Pressure
  tag(
    'p_inlet',
    'Inlet pressure',
    'psi',
    'pressure',
    1,
    'Process pressure measured at the unit inlet manifold.',
  ),
  tag(
    'p_outlet',
    'Outlet pressure',
    'psi',
    'pressure',
    1,
    'Process pressure measured at the unit outlet manifold.',
  ),
  tag(
    'p_separator',
    'Separator pressure',
    'psi',
    'pressure',
    1,
    'Static pressure inside the three-phase separator vessel.',
  ),
  tag(
    'dp_filter',
    'Filter differential P',
    'psi',
    'pressure',
    2,
    'Differential pressure across the inlet filter / strainer.',
  ),
  // Temperature
  tag(
    't_inlet',
    'Inlet temperature',
    'degF',
    'temperature',
    1,
    'Process temperature at the unit inlet.',
  ),
  tag(
    't_outlet',
    'Outlet temperature',
    'degF',
    'temperature',
    1,
    'Process temperature at the unit outlet.',
  ),
  tag(
    't_separator',
    'Separator temperature',
    'degF',
    'temperature',
    1,
    'Internal separator temperature.',
  ),
  // Flow
  tag('q_liquid', 'Total liquid flow rate', 'bpd', 'flow', 1, 'Aggregate liquid flow rate.'),
  tag(
    'q_gas',
    'Total gas flow rate',
    'MMSCFD',
    'flow',
    3,
    'Aggregate gas flow rate, normalised to MMSCFD.',
  ),
  tag('q_oil', 'Oil flow rate', 'bpd', 'flow', 1, 'Oil-phase flow rate.'),
  tag('q_water', 'Water flow rate', 'bpd', 'flow', 1, 'Water-phase flow rate.'),
  // Volume / totals
  tag(
    'v_liquid_total',
    'Cumulative liquid volume',
    'bbl',
    'volume',
    1,
    'Cumulative liquid volume since job start.',
  ),
  tag(
    'v_gas_total',
    'Cumulative gas volume',
    'MMSCF',
    'volume',
    3,
    'Cumulative gas volume since job start.',
  ),
  tag(
    'v_oil_total',
    'Cumulative oil volume',
    'bbl',
    'volume',
    1,
    'Cumulative oil volume since job start.',
  ),
  tag(
    'v_water_total',
    'Cumulative water volume',
    'bbl',
    'volume',
    1,
    'Cumulative water volume since job start.',
  ),
  // Level
  tag(
    'level_separator',
    'Separator liquid level',
    '%',
    'level',
    1,
    'Liquid level inside the separator as a percentage of full range.',
  ),
  // Vibration
  tag('vib_x', 'Vibration X-axis', 'in/s', 'vibration', 3, 'RMS vibration on the X axis (radial).'),
  tag('vib_y', 'Vibration Y-axis', 'in/s', 'vibration', 3, 'RMS vibration on the Y axis (radial).'),
  tag('vib_z', 'Vibration Z-axis', 'in/s', 'vibration', 3, 'RMS vibration on the Z axis (axial).'),
  // Status / quality
  tag(
    'battery_status',
    'Transmitter battery %',
    '%',
    'status',
    0,
    'Remaining battery on the wireless transmitter, percent.',
  ),
  tag(
    'signal_quality',
    'Wireless signal RSSI',
    '%',
    'status',
    0,
    'Normalised signal-quality indicator (0-100).',
  ),
  tag(
    'device_status',
    'Device status code',
    'state',
    'status',
    0,
    'Device-reported state machine value (string).',
  ),
]);

function tag(
  name: string,
  displayName: string,
  canonicalUnit: string,
  category: string,
  precision: number,
  description: string,
): CanonicalTag {
  return {
    id: `00000000-0000-0000-0000-${hashSuffix(name)}`,
    name,
    displayName,
    canonicalUnit,
    category,
    precision,
    description,
    deprecated: false,
    createdAt: MOCK_TIMESTAMP,
    updatedAt: MOCK_TIMESTAMP,
  };
}

/** Deterministic 12-hex-digit suffix derived from the canonical-tag name. */
function hashSuffix(name: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h = Math.imul(h ^ name.charCodeAt(i), 0x01000193) >>> 0;
  }
  // Spread the 32-bit hash across 12 hex digits by interleaving the same
  // value with its inverse. Plenty of room for the 22-tag dictionary; this
  // is for display determinism only — fixtures never collide with backend
  // UUIDs because the leading 28 bits are always zero.
  const hex = h.toString(16).padStart(8, '0');
  return `0000${hex}`;
}

// =============================================================================
// F4.5C — Equipment types + measurement units
// =============================================================================
//
// Mirrors the F4.3 seed (`apps/backend/prisma/seed.f4.ts`): two equipment-type
// templates (EMMAD, EMGAD) and two measurement units (HP-001, LP-001). HP-001
// is provided with the full F4.4D unit-detail include shape — every sensor,
// its currently-installed transmitter, the current `unitConfiguration`, the
// current `unitOperatingEnvelope`, and every current `alarmRule` joined with
// a canonical-tag scalar. LP-001 is provided with a smaller representative
// detail so the fixture stays readable; both list-row rows expose the same
// `equipmentType` summary the F4 backend embeds.

const EMMAD_ID = '00000000-0000-0000-0000-0000000044d1';
const EMGAD_ID = '00000000-0000-0000-0000-0000000044d2';
const HP_001_ID = '00000000-0000-0000-0000-000000004411';
const LP_001_ID = '00000000-0000-0000-0000-000000004412';
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000010';

const EMMAD_DEFAULT_TEMPLATE = {
  loops: [
    { name: 'inlet_pressure', canonical_tag: 'p_inlet', engineering_unit: 'psi' },
    { name: 'outlet_pressure', canonical_tag: 'p_outlet', engineering_unit: 'psi' },
    { name: 'inlet_temperature', canonical_tag: 't_inlet', engineering_unit: 'degF' },
    { name: 'liquid_flow', canonical_tag: 'q_liquid', engineering_unit: 'bpd' },
    { name: 'gas_flow', canonical_tag: 'q_gas', engineering_unit: 'MMSCFD' },
    { name: 'separator_level', canonical_tag: 'level_separator', engineering_unit: '%' },
    { name: 'vibration_x', canonical_tag: 'vib_x', engineering_unit: 'in/s' },
  ],
};

const EMGAD_DEFAULT_TEMPLATE = {
  loops: [
    { name: 'inlet_pressure', canonical_tag: 'p_inlet', engineering_unit: 'psi' },
    { name: 'inlet_temperature', canonical_tag: 't_inlet', engineering_unit: 'degF' },
    { name: 'gas_flow', canonical_tag: 'q_gas', engineering_unit: 'MMSCFD' },
    { name: 'gas_total', canonical_tag: 'v_gas_total', engineering_unit: 'MMSCF' },
  ],
};

const EMMAD_TYPE: EquipmentType = {
  id: EMMAD_ID,
  name: 'EMMAD',
  description:
    'Well testing / measurement unit template for oil, gas and liquid operational monitoring.',
  defaultSensorTemplate: EMMAD_DEFAULT_TEMPLATE,
  pidReference: 'EMMAD-generic',
  createdAt: MOCK_TIMESTAMP,
  updatedAt: MOCK_TIMESTAMP,
};

const EMGAD_TYPE: EquipmentType = {
  id: EMGAD_ID,
  name: 'EMGAD',
  description: 'Gas measurement / gas analysis unit template for gas-focused monitoring.',
  defaultSensorTemplate: EMGAD_DEFAULT_TEMPLATE,
  pidReference: 'EMGAD-generic',
  createdAt: MOCK_TIMESTAMP,
  updatedAt: MOCK_TIMESTAMP,
};

const EMMAD_SUMMARY: EquipmentTypeSummary = {
  id: EMMAD_ID,
  name: EMMAD_TYPE.name,
  pidReference: EMMAD_TYPE.pidReference,
};

export const MOCK_F4_EQUIPMENT_TYPES: readonly EquipmentType[] = Object.freeze([
  EMMAD_TYPE,
  EMGAD_TYPE,
]);

export const MOCK_F4_MEASUREMENT_UNITS: readonly MeasurementUnitListRow[] = Object.freeze([
  {
    id: HP_001_ID,
    tenantId: RVF_INTERNAL_TENANT_ID,
    equipmentTypeId: EMMAD_ID,
    code: 'HP-001',
    serialNumber: 'RVF-HP-001',
    name: 'High Pressure / High Flow Test Unit',
    status: 'active',
    operatingProfile: 'high_pressure_high_flow',
    location: 'Yard / Test Bench',
    createdAt: MOCK_TIMESTAMP,
    updatedAt: MOCK_TIMESTAMP,
    equipmentType: EMMAD_SUMMARY,
  },
  {
    id: LP_001_ID,
    tenantId: RVF_INTERNAL_TENANT_ID,
    equipmentTypeId: EMMAD_ID,
    code: 'LP-001',
    serialNumber: 'RVF-LP-001',
    name: 'Low Pressure / Medium Flow Test Unit',
    status: 'active',
    operatingProfile: 'low',
    location: 'Yard / Test Bench',
    createdAt: MOCK_TIMESTAMP,
    updatedAt: MOCK_TIMESTAMP,
    equipmentType: EMMAD_SUMMARY,
  },
]);

interface SensorSeed {
  instrumentTag: string;
  name: string;
  sensorType: SensorType;
  engineeringUnit: string;
  minRange: number;
  maxRange: number;
  transmitterProtocol: TransmitterDevice['protocol'];
  transmitterSignalType: string;
  transmitterModel: string;
}

interface AlarmSeed {
  canonicalTagName: string;
  severity: 'warning' | 'critical';
  thresholdKind: 'high' | 'high_high';
  value: number;
  message: string;
}

const HP_001_SENSOR_SEEDS: SensorSeed[] = [
  {
    instrumentTag: 'HP-PIT-001',
    name: 'HP-001 inlet pressure',
    sensorType: 'pressure',
    engineeringUnit: 'psi',
    minRange: 0,
    maxRange: 6000,
    transmitterProtocol: '4-20mA',
    transmitterSignalType: 'analog',
    transmitterModel: 'Reference Pressure Transmitter',
  },
  {
    instrumentTag: 'HP-PIT-002',
    name: 'HP-001 outlet pressure',
    sensorType: 'pressure',
    engineeringUnit: 'psi',
    minRange: 0,
    maxRange: 6000,
    transmitterProtocol: '4-20mA',
    transmitterSignalType: 'analog',
    transmitterModel: 'Reference Pressure Transmitter',
  },
  {
    instrumentTag: 'HP-TIT-001',
    name: 'HP-001 inlet temperature',
    sensorType: 'temperature',
    engineeringUnit: 'degF',
    minRange: -40,
    maxRange: 350,
    transmitterProtocol: '4-20mA',
    transmitterSignalType: 'analog',
    transmitterModel: 'Reference Temperature Transmitter',
  },
  {
    instrumentTag: 'HP-FIT-001',
    name: 'HP-001 liquid flow',
    sensorType: 'flow',
    engineeringUnit: 'bpd',
    minRange: 0,
    maxRange: 12000,
    transmitterProtocol: 'HART',
    transmitterSignalType: 'digital',
    transmitterModel: 'Reference Flow Transmitter',
  },
  {
    instrumentTag: 'HP-FIT-002',
    name: 'HP-001 gas flow',
    sensorType: 'flow',
    engineeringUnit: 'MMSCFD',
    minRange: 0,
    maxRange: 6,
    transmitterProtocol: 'HART',
    transmitterSignalType: 'digital',
    transmitterModel: 'Reference Flow Transmitter',
  },
  {
    instrumentTag: 'HP-LIT-001',
    name: 'HP-001 separator level',
    sensorType: 'level',
    engineeringUnit: '%',
    minRange: 0,
    maxRange: 100,
    transmitterProtocol: '4-20mA',
    transmitterSignalType: 'analog',
    transmitterModel: 'Reference Level Transmitter',
  },
  {
    instrumentTag: 'HP-VIT-001',
    name: 'HP-001 vibration X',
    sensorType: 'vibration',
    engineeringUnit: 'in/s',
    minRange: 0,
    maxRange: 2,
    transmitterProtocol: '4-20mA',
    transmitterSignalType: 'analog',
    transmitterModel: 'Reference Vibration Transmitter',
  },
];

const LP_001_SENSOR_SEEDS: SensorSeed[] = [
  {
    instrumentTag: 'LP-PIT-001',
    name: 'LP-001 inlet pressure',
    sensorType: 'pressure',
    engineeringUnit: 'psi',
    minRange: 0,
    maxRange: 1000,
    transmitterProtocol: '4-20mA',
    transmitterSignalType: 'analog',
    transmitterModel: 'Reference Pressure Transmitter',
  },
  {
    instrumentTag: 'LP-FIT-001',
    name: 'LP-001 liquid flow',
    sensorType: 'flow',
    engineeringUnit: 'bpd',
    minRange: 0,
    maxRange: 4000,
    transmitterProtocol: 'HART',
    transmitterSignalType: 'digital',
    transmitterModel: 'Reference Flow Transmitter',
  },
];

const HP_001_ALARM_SEEDS: AlarmSeed[] = [
  {
    canonicalTagName: 'p_inlet',
    severity: 'warning',
    thresholdKind: 'high',
    value: 4500,
    message: 'HP-001 inlet pressure approaching design limit (warning).',
  },
  {
    canonicalTagName: 'p_inlet',
    severity: 'critical',
    thresholdKind: 'high_high',
    value: 5000,
    message: 'HP-001 inlet pressure at design limit (critical).',
  },
  {
    canonicalTagName: 'p_outlet',
    severity: 'warning',
    thresholdKind: 'high',
    value: 4200,
    message: 'HP-001 outlet pressure elevated (warning).',
  },
  {
    canonicalTagName: 'p_outlet',
    severity: 'critical',
    thresholdKind: 'high_high',
    value: 4800,
    message: 'HP-001 outlet pressure critical (critical).',
  },
  {
    canonicalTagName: 't_inlet',
    severity: 'warning',
    thresholdKind: 'high',
    value: 220,
    message: 'HP-001 inlet temperature elevated (warning).',
  },
  {
    canonicalTagName: 't_inlet',
    severity: 'critical',
    thresholdKind: 'high_high',
    value: 250,
    message: 'HP-001 inlet temperature critical (critical).',
  },
  {
    canonicalTagName: 'q_liquid',
    severity: 'warning',
    thresholdKind: 'high',
    value: 9000,
    message: 'HP-001 liquid flow approaching capacity (warning).',
  },
  {
    canonicalTagName: 'q_liquid',
    severity: 'critical',
    thresholdKind: 'high_high',
    value: 10000,
    message: 'HP-001 liquid flow at capacity (critical).',
  },
  {
    canonicalTagName: 'q_gas',
    severity: 'warning',
    thresholdKind: 'high',
    value: 4.5,
    message: 'HP-001 gas flow elevated (warning).',
  },
  {
    canonicalTagName: 'q_gas',
    severity: 'critical',
    thresholdKind: 'high_high',
    value: 5.0,
    message: 'HP-001 gas flow critical (critical).',
  },
  {
    canonicalTagName: 'level_separator',
    severity: 'warning',
    thresholdKind: 'high',
    value: 80,
    message: 'HP-001 separator level high (warning).',
  },
  {
    canonicalTagName: 'level_separator',
    severity: 'critical',
    thresholdKind: 'high_high',
    value: 90,
    message: 'HP-001 separator level critical (critical).',
  },
  {
    canonicalTagName: 'vib_x',
    severity: 'warning',
    thresholdKind: 'high',
    value: 0.8,
    message: 'HP-001 vibration elevated (warning).',
  },
  {
    canonicalTagName: 'vib_x',
    severity: 'critical',
    thresholdKind: 'high_high',
    value: 1.0,
    message: 'HP-001 vibration critical (critical).',
  },
];

const LP_001_ALARM_SEEDS: AlarmSeed[] = [
  {
    canonicalTagName: 'p_inlet',
    severity: 'warning',
    thresholdKind: 'high',
    value: 600,
    message: 'LP-001 inlet pressure elevated (warning).',
  },
  {
    canonicalTagName: 'p_inlet',
    severity: 'critical',
    thresholdKind: 'high_high',
    value: 750,
    message: 'LP-001 inlet pressure at design limit (critical).',
  },
];

const HP_001_ENGINEERING_UNIT_SET = {
  pressure: 'psi',
  differential_pressure: 'psi',
  temperature: 'degF',
  liquid_flow: 'bpd',
  gas_flow: 'MMSCFD',
  volume_liquid: 'bbl',
  volume_gas: 'MMSCF',
  level: '%',
  vibration: 'in/s',
};

const LP_001_ENGINEERING_UNIT_SET = HP_001_ENGINEERING_UNIT_SET;

function buildSensorsWithTransmitters(
  unitId: string,
  seeds: SensorSeed[],
): SensorWithTransmitters[] {
  return seeds.map((s) => {
    const sensorId = `00000000-0000-0000-0000-${hashSuffix(`sensor:${unitId}:${s.instrumentTag}`)}`;
    const transmitterId = `00000000-0000-0000-0000-${hashSuffix(`tx:${unitId}:${s.instrumentTag}`)}`;
    const transmitter: TransmitterDevice = {
      id: transmitterId,
      tenantId: RVF_INTERNAL_TENANT_ID,
      sensorId,
      serialNumber: `TX-${s.instrumentTag}`,
      manufacturer: 'RVF Reference',
      model: s.transmitterModel,
      protocol: s.transmitterProtocol,
      signalType: s.transmitterSignalType,
      modbusAddress: null,
      registerMapReference: null,
      channel: null,
      firmwareVersion: '1.0.0',
      calibrationDate: '2026-05-24',
      calibrationRangeMin: String(s.minRange),
      calibrationRangeMax: String(s.maxRange),
      calibrationReference: 'F4.3 reference seed',
      batteryStatus: null,
      installationStatus: 'installed',
      installedAt: MOCK_TIMESTAMP,
      removedAt: null,
      createdAt: MOCK_TIMESTAMP,
      updatedAt: MOCK_TIMESTAMP,
    };
    return {
      id: sensorId,
      tenantId: RVF_INTERNAL_TENANT_ID,
      unitId,
      type: s.sensorType,
      name: s.name,
      instrumentTag: s.instrumentTag,
      enabled: true,
      minRange: String(s.minRange),
      maxRange: String(s.maxRange),
      engineeringUnit: s.engineeringUnit,
      createdAt: MOCK_TIMESTAMP,
      updatedAt: MOCK_TIMESTAMP,
      transmitterDevices: [transmitter],
    };
  });
}

function buildAlarmRules(unitId: string, seeds: AlarmSeed[]): AlarmRuleWithTag[] {
  return seeds.map((a) => {
    const ruleId = `00000000-0000-0000-0000-${hashSuffix(`alarm:${unitId}:${a.canonicalTagName}:${a.severity}`)}`;
    const tag = MOCK_F4_CANONICAL_TAGS.find((t) => t.name === a.canonicalTagName);
    const canonicalTagId = tag
      ? tag.id
      : `00000000-0000-0000-0000-${hashSuffix(a.canonicalTagName)}`;
    return {
      id: ruleId,
      tenantId: RVF_INTERNAL_TENANT_ID,
      unitId,
      canonicalTagId,
      severity: a.severity,
      enabled: true,
      lowLowThreshold: null,
      lowThreshold: null,
      highThreshold: a.thresholdKind === 'high' ? String(a.value) : null,
      highHighThreshold: a.thresholdKind === 'high_high' ? String(a.value) : null,
      deadband: null,
      delaySeconds: null,
      messageTemplate: a.message,
      version: 1,
      isCurrent: true,
      createdBy: SYSTEM_USER_ID,
      createdAt: MOCK_TIMESTAMP,
      canonicalTag: {
        id: canonicalTagId,
        name: a.canonicalTagName,
        displayName: tag ? tag.displayName : a.canonicalTagName,
        canonicalUnit: tag ? tag.canonicalUnit : '',
        category: tag ? tag.category : '',
        precision: tag ? tag.precision : 0,
      },
    };
  });
}

function buildUnitConfiguration(
  unitId: string,
  sensors: SensorWithTransmitters[],
): UnitConfigurationRow {
  return {
    id: `00000000-0000-0000-0000-${hashSuffix(`config:${unitId}`)}`,
    tenantId: RVF_INTERNAL_TENANT_ID,
    unitId,
    version: 1,
    configuration: { notes: 'F4.3 seed initial configuration.' },
    enabledSensors: sensors.map((s) => s.instrumentTag),
    engineeringUnitOverrides: {},
    displayPrecisionOverrides: {},
    isCurrent: true,
    createdBy: SYSTEM_USER_ID,
    createdAt: MOCK_TIMESTAMP,
  };
}

function buildUnitOperatingEnvelope(
  unitId: string,
  envelope: {
    maxPressure: number;
    maxFlowRate: number;
    maxTemperature: number;
    maxVibration: number;
    maxDifferentialPressure: number;
    maxGasRate: number;
  },
  engineeringUnitSet: Record<string, string>,
): UnitOperatingEnvelopeRow {
  return {
    id: `00000000-0000-0000-0000-${hashSuffix(`envelope:${unitId}`)}`,
    tenantId: RVF_INTERNAL_TENANT_ID,
    unitId,
    version: 1,
    maxPressure: String(envelope.maxPressure),
    maxFlowRate: String(envelope.maxFlowRate),
    maxTemperature: String(envelope.maxTemperature),
    maxVibration: String(envelope.maxVibration),
    maxDifferentialPressure: String(envelope.maxDifferentialPressure),
    maxVolume: null,
    maxGasRate: String(envelope.maxGasRate),
    engineeringUnitSet,
    isCurrent: true,
    createdBy: SYSTEM_USER_ID,
    createdAt: MOCK_TIMESTAMP,
  };
}

const HP_001_SENSORS = buildSensorsWithTransmitters(HP_001_ID, HP_001_SENSOR_SEEDS);
const LP_001_SENSORS = buildSensorsWithTransmitters(LP_001_ID, LP_001_SENSOR_SEEDS);

const HP_001_DETAIL: MeasurementUnitDetail = {
  id: HP_001_ID,
  tenantId: RVF_INTERNAL_TENANT_ID,
  equipmentTypeId: EMMAD_ID,
  code: 'HP-001',
  serialNumber: 'RVF-HP-001',
  name: 'High Pressure / High Flow Test Unit',
  status: 'active',
  operatingProfile: 'high_pressure_high_flow',
  location: 'Yard / Test Bench',
  createdAt: MOCK_TIMESTAMP,
  updatedAt: MOCK_TIMESTAMP,
  equipmentType: EMMAD_TYPE,
  sensors: HP_001_SENSORS,
  unitConfigurations: [buildUnitConfiguration(HP_001_ID, HP_001_SENSORS)],
  unitOperatingEnvelopes: [
    buildUnitOperatingEnvelope(
      HP_001_ID,
      {
        maxPressure: 5000,
        maxFlowRate: 10000,
        maxTemperature: 250,
        maxVibration: 1.0,
        maxDifferentialPressure: 500,
        maxGasRate: 5.0,
      },
      HP_001_ENGINEERING_UNIT_SET,
    ),
  ],
  alarmRules: buildAlarmRules(HP_001_ID, HP_001_ALARM_SEEDS),
};

const LP_001_DETAIL: MeasurementUnitDetail = {
  id: LP_001_ID,
  tenantId: RVF_INTERNAL_TENANT_ID,
  equipmentTypeId: EMMAD_ID,
  code: 'LP-001',
  serialNumber: 'RVF-LP-001',
  name: 'Low Pressure / Medium Flow Test Unit',
  status: 'active',
  operatingProfile: 'low',
  location: 'Yard / Test Bench',
  createdAt: MOCK_TIMESTAMP,
  updatedAt: MOCK_TIMESTAMP,
  equipmentType: EMMAD_TYPE,
  sensors: LP_001_SENSORS,
  unitConfigurations: [buildUnitConfiguration(LP_001_ID, LP_001_SENSORS)],
  unitOperatingEnvelopes: [
    buildUnitOperatingEnvelope(
      LP_001_ID,
      {
        maxPressure: 750,
        maxFlowRate: 3000,
        maxTemperature: 180,
        maxVibration: 0.5,
        maxDifferentialPressure: 150,
        maxGasRate: 1.0,
      },
      LP_001_ENGINEERING_UNIT_SET,
    ),
  ],
  alarmRules: buildAlarmRules(LP_001_ID, LP_001_ALARM_SEEDS),
};

/**
 * Lookup table keyed by `MeasurementUnit.id`. Used by the `adapterGetMeasurementUnit`
 * mock branch. New mock units must be added both to `MOCK_F4_MEASUREMENT_UNITS`
 * (list rows) and to this map (detail rows).
 */
export const MOCK_F4_MEASUREMENT_UNIT_DETAILS: Readonly<Record<string, MeasurementUnitDetail>> =
  Object.freeze({
    [HP_001_ID]: HP_001_DETAIL,
    [LP_001_ID]: LP_001_DETAIL,
  });

// =============================================================================
// F4.5D — Jobs + CommissioningSnapshot
// =============================================================================
//
// Mirrors the F4.3 seed: a single reference job anchored on HP-001 with an
// immutable commissioning snapshot. The seed produces one row; the fixture
// reproduces it. Fixture-only synthetic rows are deliberately avoided so
// `MOCK_F4_JOBS.length === 1` matches the F4.3 baseline exactly.
//
// JSONB fields (`effectiveThresholds`, `sensorMappings`, `engineeringEnvelope`,
// `ruleVersions`) carry the same content the seed inserts — they are typed
// `unknown` on the API surface (Prisma JSON), but the fixture writes a
// concrete object literal so the view-model helpers in `jobs.ts` can read it
// with the same defensive narrowing they would apply to a real backend
// response.

const REFERENCE_WELL_ID = '00000000-0000-0000-0000-000000004400';
const REFERENCE_JOB_ID = '00000000-0000-0000-0000-000000004444';
const REFERENCE_SNAPSHOT_ID = '00000000-0000-0000-0000-000000004499';
const ADMIN_USER_ID = '00000000-0000-0000-0000-000000000011';

const REFERENCE_JOB_STARTED_AT = MOCK_TIMESTAMP;

const HP_001_SENSOR_MAPPINGS_JSON = HP_001_SENSOR_SEEDS.map((s) => ({
  instrument_tag: s.instrumentTag,
  canonical_tag: s.transmitterModel.startsWith('Reference')
    ? canonicalTagFor(s.instrumentTag)
    : 'unknown',
}));

function canonicalTagFor(instrumentTag: string): string {
  // Map each HP-001 instrument tag to its canonical tag (mirrors F4.3 seed).
  const map: Record<string, string> = {
    'HP-PIT-001': 'p_inlet',
    'HP-PIT-002': 'p_outlet',
    'HP-TIT-001': 't_inlet',
    'HP-FIT-001': 'q_liquid',
    'HP-FIT-002': 'q_gas',
    'HP-LIT-001': 'level_separator',
    'HP-VIT-001': 'vib_x',
  };
  return map[instrumentTag] ?? instrumentTag;
}

const HP_001_EFFECTIVE_THRESHOLDS_JSON = HP_001_ALARM_SEEDS.map((a) => ({
  canonical_tag: a.canonicalTagName,
  severity: a.severity,
  kind: a.thresholdKind,
  value: a.value,
}));

const HP_001_RULE_VERSIONS_JSON = HP_001_ALARM_SEEDS.map((a) => ({
  canonical_tag: a.canonicalTagName,
  severity: a.severity,
  version: 1,
}));

const HP_001_ENGINEERING_ENVELOPE_JSON = {
  max_pressure: 5000,
  max_flow_rate: 10000,
  max_temperature: 250,
  max_vibration: 1.0,
  max_differential_pressure: 500,
  max_volume: null,
  max_gas_rate: 5.0,
  engineering_unit_set: HP_001_ENGINEERING_UNIT_SET,
};

const REFERENCE_COMMISSIONING_SNAPSHOT: CommissioningSnapshot = {
  id: REFERENCE_SNAPSHOT_ID,
  tenantId: RVF_INTERNAL_TENANT_ID,
  jobId: REFERENCE_JOB_ID,
  unitId: HP_001_ID,
  takenAt: MOCK_TIMESTAMP,
  effectiveThresholds: HP_001_EFFECTIVE_THRESHOLDS_JSON,
  sensorMappings: HP_001_SENSOR_MAPPINGS_JSON,
  engineeringEnvelope: HP_001_ENGINEERING_ENVELOPE_JSON,
  ruleVersions: HP_001_RULE_VERSIONS_JSON,
  immutable: true,
  createdAt: MOCK_TIMESTAMP,
};

const REFERENCE_JOB_LIST_ROW: JobListRow = {
  id: REFERENCE_JOB_ID,
  tenantId: RVF_INTERNAL_TENANT_ID,
  wellId: REFERENCE_WELL_ID,
  unitId: HP_001_ID,
  // The F4.3 seed initially creates the job with a null FK and later updates
  // it to point at the snapshot. By the time a frontend `findById` reads the
  // row the FK is populated; the mock fixture matches that final state.
  commissioningSnapshotId: REFERENCE_SNAPSHOT_ID,
  engineerId: ADMIN_USER_ID,
  status: 'in_progress',
  startedAt: REFERENCE_JOB_STARTED_AT,
  closedAt: null,
  createdAt: MOCK_TIMESTAMP,
  updatedAt: MOCK_TIMESTAMP,
  tenant: { id: RVF_INTERNAL_TENANT_ID, name: 'RVF Internal', status: 'active' },
  well: { id: REFERENCE_WELL_ID, name: 'Reference Well A', fieldOrSite: 'Reference Field' },
  unit: { id: HP_001_ID, code: 'HP-001', name: 'High Pressure / High Flow Test Unit' },
};

const REFERENCE_JOB_DETAIL: JobDetail = {
  ...REFERENCE_JOB_LIST_ROW,
  well: {
    id: REFERENCE_WELL_ID,
    name: 'Reference Well A',
    fieldOrSite: 'Reference Field',
    location: 'Local Dev',
    type: 'test',
    fluid: 'multiphase',
    designLimits: {
      max_pressure_psi: 5000,
      max_temperature_degF: 250,
      max_liquid_flow_bpd: 10000,
      max_gas_flow_MMSCFD: 5,
    },
  },
  unit: {
    id: HP_001_ID,
    code: 'HP-001',
    name: 'High Pressure / High Flow Test Unit',
    serialNumber: 'RVF-HP-001',
    status: 'active',
    operatingProfile: 'high_pressure_high_flow',
    location: 'Yard / Test Bench',
    equipmentType: EMMAD_SUMMARY,
  },
  engineer: { id: ADMIN_USER_ID, displayName: 'Admin Placeholder', role: 'admin' },
  commissioningSnapshot: REFERENCE_COMMISSIONING_SNAPSHOT,
};

export const MOCK_F4_JOBS: readonly JobListRow[] = Object.freeze([REFERENCE_JOB_LIST_ROW]);

/**
 * Lookup table keyed by `Job.id`. Used by the `adapterGetJob` mock branch.
 * New mock jobs must be added both to `MOCK_F4_JOBS` (list rows) and to this
 * map (detail rows).
 */
export const MOCK_F4_JOB_DETAILS: Readonly<Record<string, JobDetail>> = Object.freeze({
  [REFERENCE_JOB_ID]: REFERENCE_JOB_DETAIL,
});

export const MOCK_F4_COMMISSIONING_SNAPSHOTS: readonly CommissioningSnapshot[] = Object.freeze([
  REFERENCE_COMMISSIONING_SNAPSHOT,
]);
