/**
 * F4.5A — frontend types for the F4 backend API responses.
 *
 * These types describe the shapes the backend's NestJS controllers emit
 * (`apps/backend/src/{tenants,wells,tags,equipment,jobs,telemetry}/`), as
 * documented in the F4.4A → F4.4F closeout reports. They are **derived
 * but independent** from the Prisma client:
 *
 *   - The frontend MUST NOT import `@prisma/client`. Prisma is a backend
 *     concern; pulling it into the bundle would couple the web build to
 *     the database engine and explode the bundle size.
 *   - When the backend's serialization changes, update these types
 *     intentionally — they are a contract the frontend agrees to.
 *
 * Field-shape conventions:
 *
 *   - Dates arrive as ISO-8601 strings (`createdAt`, `updatedAt`, …).
 *     NestJS / Prisma serialize `Date` to JSON via `Date.toISOString()`.
 *   - Decimals (`measurement_units.min_range / max_range`, every
 *     numeric field on alarm rules and operating envelopes, every
 *     `telemetry_readings.value`) arrive as STRINGS via
 *     `Prisma.Decimal.toJSON`. Consumers that need numeric math call
 *     `Number(...)`.
 *   - Optional nested includes use `?` so the same type covers both the
 *     list and detail responses (lists return a subset of nested rows;
 *     detail returns the full include).
 */

// =============================================================================
// Tenant — F4.4A
// =============================================================================

export type TenantStatus = 'active' | 'inactive';

export interface Tenant {
  id: string;
  name: string;
  status: TenantStatus;
  residencyHint: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Shape used inside nested `tenant: { id, name, status }` includes. */
export interface TenantSummary {
  id: string;
  name: string;
  status: TenantStatus;
}

// =============================================================================
// Well — F4.4B
// =============================================================================

export interface Well {
  id: string;
  tenantId: string;
  clientId: string | null;
  name: string;
  fieldOrSite: string | null;
  location: string | null;
  type: string | null;
  fluid: string | null;
  designLimits: unknown;
  createdAt: string;
  updatedAt: string;
  /** Present in both list and detail responses (F4.4B always includes tenant). */
  tenant?: TenantSummary;
}

// =============================================================================
// CanonicalTag — F4.4C
// =============================================================================

export interface CanonicalTag {
  id: string;
  name: string;
  displayName: string;
  canonicalUnit: string;
  category: string;
  precision: number;
  description: string | null;
  deprecated: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Shape used inside the trends endpoint response and alarm-rule includes. */
export interface CanonicalTagSummary {
  id: string;
  name: string;
  displayName: string;
  canonicalUnit: string;
  category: string;
  precision: number;
}

// =============================================================================
// Equipment — F4.4D
// =============================================================================

export interface EquipmentType {
  id: string;
  name: string;
  description: string | null;
  defaultSensorTemplate: unknown;
  pidReference: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EquipmentTypeSummary {
  id: string;
  name: string;
  pidReference: string | null;
}

export type MeasurementUnitStatus = 'active' | 'inactive' | 'offline' | 'maintenance';
export type MeasurementUnitOperatingProfile =
  | 'high_pressure_high_flow'
  | 'medium'
  | 'low'
  | 'custom';

export interface MeasurementUnitListRow {
  id: string;
  tenantId: string;
  equipmentTypeId: string;
  code: string;
  serialNumber: string | null;
  name: string;
  status: MeasurementUnitStatus;
  operatingProfile: MeasurementUnitOperatingProfile;
  location: string | null;
  createdAt: string;
  updatedAt: string;
  equipmentType?: EquipmentTypeSummary;
}

export type TransmitterProtocol = '4-20mA' | 'HART' | 'Modbus' | 'OPC-UA' | 'wireless';
export type TransmitterInstallationStatus = 'installed' | 'removed' | 'on_bench' | 'replaced';

export interface TransmitterDevice {
  id: string;
  tenantId: string;
  sensorId: string;
  serialNumber: string;
  manufacturer: string;
  model: string;
  protocol: TransmitterProtocol;
  signalType: string;
  modbusAddress: number | null;
  registerMapReference: string | null;
  channel: string | null;
  firmwareVersion: string | null;
  calibrationDate: string | null;
  /** Decimal — serialized as a string. */
  calibrationRangeMin: string | null;
  /** Decimal — serialized as a string. */
  calibrationRangeMax: string | null;
  calibrationReference: string | null;
  batteryStatus: string | null;
  installationStatus: TransmitterInstallationStatus;
  installedAt: string | null;
  removedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SensorType =
  | 'pressure'
  | 'temperature'
  | 'flow'
  | 'vibration'
  | 'volume'
  | 'level'
  | 'gas_composition'
  | 'digital_status';

export interface SensorWithTransmitters {
  id: string;
  tenantId: string;
  unitId: string;
  type: SensorType;
  name: string;
  instrumentTag: string;
  enabled: boolean;
  /** Decimal — serialized as a string. */
  minRange: string | null;
  /** Decimal — serialized as a string. */
  maxRange: string | null;
  engineeringUnit: string;
  createdAt: string;
  updatedAt: string;
  /** F4.4D detail include: only currently-installed transmitter devices. */
  transmitterDevices: TransmitterDevice[];
}

export interface UnitConfigurationRow {
  id: string;
  tenantId: string;
  unitId: string;
  version: number;
  configuration: unknown;
  enabledSensors: unknown;
  engineeringUnitOverrides: unknown;
  displayPrecisionOverrides: unknown;
  isCurrent: boolean;
  createdBy: string | null;
  createdAt: string;
}

export interface UnitOperatingEnvelopeRow {
  id: string;
  tenantId: string;
  unitId: string;
  version: number;
  /** Decimal — serialized as a string. */
  maxPressure: string | null;
  /** Decimal — serialized as a string. */
  maxFlowRate: string | null;
  /** Decimal — serialized as a string. */
  maxTemperature: string | null;
  /** Decimal — serialized as a string. */
  maxVibration: string | null;
  /** Decimal — serialized as a string. */
  maxDifferentialPressure: string | null;
  /** Decimal — serialized as a string. */
  maxVolume: string | null;
  /** Decimal — serialized as a string. */
  maxGasRate: string | null;
  engineeringUnitSet: unknown;
  isCurrent: boolean;
  createdBy: string | null;
  createdAt: string;
}

export type AlarmSeverity = 'info' | 'warning' | 'critical';

export interface AlarmRuleWithTag {
  id: string;
  tenantId: string;
  unitId: string;
  canonicalTagId: string;
  severity: AlarmSeverity;
  enabled: boolean;
  /** Decimal — serialized as a string. */
  lowLowThreshold: string | null;
  /** Decimal — serialized as a string. */
  lowThreshold: string | null;
  /** Decimal — serialized as a string. */
  highThreshold: string | null;
  /** Decimal — serialized as a string. */
  highHighThreshold: string | null;
  /** Decimal — serialized as a string. */
  deadband: string | null;
  delaySeconds: number | null;
  messageTemplate: string | null;
  version: number;
  isCurrent: boolean;
  createdBy: string | null;
  createdAt: string;
  /** F4.4D detail include hydrates the canonical-tag scalar. */
  canonicalTag: CanonicalTagSummary;
}

/** F4.4D unit-detail response (returned by `GET /equipment/units/:id`). */
export interface MeasurementUnitDetail extends MeasurementUnitListRow {
  equipmentType: EquipmentType;
  sensors: SensorWithTransmitters[];
  unitConfigurations: UnitConfigurationRow[];
  unitOperatingEnvelopes: UnitOperatingEnvelopeRow[];
  alarmRules: AlarmRuleWithTag[];
}

// =============================================================================
// Job + CommissioningSnapshot — F4.4E
// =============================================================================

export type JobStatus = 'programmed' | 'in_progress' | 'closed';

export interface CommissioningSnapshot {
  id: string;
  tenantId: string;
  jobId: string;
  unitId: string;
  takenAt: string;
  effectiveThresholds: unknown;
  sensorMappings: unknown;
  engineeringEnvelope: unknown;
  ruleVersions: unknown;
  immutable: boolean;
  createdAt: string;
}

export interface JobListRow {
  id: string;
  tenantId: string;
  wellId: string;
  unitId: string;
  commissioningSnapshotId: string | null;
  engineerId: string | null;
  status: JobStatus;
  startedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tenant?: TenantSummary;
  well?: { id: string; name: string; fieldOrSite: string | null };
  unit?: { id: string; code: string; name: string };
}

export interface JobEngineerSummary {
  id: string;
  displayName: string;
  role: string;
}

export interface JobDetail extends JobListRow {
  well: {
    id: string;
    name: string;
    fieldOrSite: string | null;
    location: string | null;
    type: string | null;
    fluid: string | null;
    designLimits: unknown;
  };
  unit: {
    id: string;
    code: string;
    name: string;
    serialNumber: string | null;
    status: MeasurementUnitStatus;
    operatingProfile: MeasurementUnitOperatingProfile;
    location: string | null;
    equipmentType: EquipmentTypeSummary;
  };
  engineer: JobEngineerSummary | null;
  commissioningSnapshot: CommissioningSnapshot | null;
}

// =============================================================================
// Telemetry trends — F4.4F
// =============================================================================

export type TelemetryQuality = 'good' | 'uncertain' | 'bad';

export type TelemetrySource =
  | 'mock'
  | 'manual'
  | 'field_gateway'
  | 'historian'
  | 'plc'
  | 'mqtt'
  | 'node_red'
  | 'opc_ua'
  | 'modbus'
  | 'edge_gateway';

export interface TelemetryPoint {
  timestamp: string;
  /** Decimal — serialized as a string. Consumers needing numeric math call `Number(...)`. */
  value: string;
  engineeringUnit: string;
  quality: TelemetryQuality;
  source: TelemetrySource;
}

export interface TelemetryTrendsResponse {
  unitId: string;
  canonicalTag: CanonicalTagSummary;
  range: { from: string; to: string };
  points: TelemetryPoint[];
}
