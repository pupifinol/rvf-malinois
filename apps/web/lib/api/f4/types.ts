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

// F4.6F.1 — bucketed-mode response fields.

/** Allowed bucket widths exposed by the bucketed-mode trend endpoint. */
export type TrendBucketSize = '1m' | '5m' | '15m' | '1h' | '1d';

/** Allowed bucketed-mode aggregate expressions. */
export type TrendAggregate = 'avg' | 'min' | 'max' | 'count' | 'first' | 'last';

/** Allowed bucketed-mode quality-policy filters. */
export type TrendQualityPolicy = 'good_only' | 'include_uncertain' | 'include_all';

export interface TrendBucket {
  /** ISO-8601 — left edge (inclusive). */
  bucketStart: string;
  /** ISO-8601 — right edge (exclusive). */
  bucketEnd: string;
  /** JS number (coerced from Decimal server-side); `null` when `sampleCount === 0`. */
  value: number | null;
  /** Rows that entered the aggregator for this bucket. */
  sampleCount: number;
}

export interface TelemetryTrendsResponse {
  unitId: string;
  canonicalTag: CanonicalTagSummary;
  range: { from: string; to: string };
  /** Always present. Empty array in bucketed mode (the shape stays stable). */
  points: TelemetryPoint[];
  /** Present only in bucketed mode. */
  bucket?: TrendBucketSize;
  /** Present only in bucketed mode. */
  aggregate?: TrendAggregate;
  /** Present only in bucketed mode. */
  qualityPolicy?: TrendQualityPolicy;
  /** Present only in bucketed mode (may include empty-bucket rows). */
  buckets?: TrendBucket[];
}

// =============================================================================
// Telemetry latest — F4.6C.2.1
// =============================================================================

/**
 * One row of the latest-values response. Derived view of the backend
 * `live_readings` projection — `tenantId` / projection `id` / `createdAt` /
 * `updatedAt` / `status` are intentionally not on the wire.
 *
 * `value` is the Prisma Decimal serialized as a string (matches the F4.4F
 * raw-mode posture; consumers `Number(...)` if they need numeric math).
 * `quality` is always `'good'` per the F4.6C.1 projection contract but is
 * typed against the full F4.4F union for forward compatibility.
 */
export interface TelemetryLatestValue {
  sensorId: string;
  canonicalTag: CanonicalTagSummary;
  /** Decimal — serialized as a string. */
  value: string;
  engineeringUnit: string;
  quality: TelemetryQuality;
  /** ISO-8601 — canonical reading timestamp (the watermark). */
  timestamp: string;
  /** ISO-8601 — backend acceptance time. Nullable in projection. */
  ingestionTimestamp: string | null;
  /** E.g. 'mqtt', 'manual', 'mock'. Nullable in projection. */
  source: string | null;
  /** UUID of the `telemetry_readings` row this projection points at. Nullable. */
  latestTelemetryReadingId: string | null;
}

export interface TelemetryLatestResponse {
  unitId: string;
  /** ISO-8601 — server-side response-generation time. */
  generatedAt: string;
  /** Constant string identifying the read source. */
  source: 'live_readings';
  /** Zero or more rows, one per `(sensorId, canonicalTagId)` slot for the unit. */
  values: TelemetryLatestValue[];
}

// =============================================================================
// Alarm events — F4.6D.2.1
// =============================================================================

/** State enum — matches `alarm_events.state` CHECK. F4.6D.1 writes only `'active'`. */
export type AlarmEventState = 'active' | 'acknowledged' | 'cleared';

/** Severity enum — matches `alarm_events.severity` CHECK. */
export type AlarmEventSeverity = 'info' | 'warning' | 'critical';

/** Threshold-band enum — matches `alarm_events.threshold_violated` CHECK. */
export type AlarmEventThresholdBand = 'low_low' | 'low' | 'high' | 'high_high';

/**
 * One row of the alarm-events response. Derived view of the backend
 * `alarm_events` row — `tenantId` / `ruleSnapshot` / `createdAt` /
 * `updatedAt` / `jobId` are intentionally not on the wire (per
 * F4.6D.2-0 §9.3 — exposing `ruleSnapshot` thresholds would invite
 * browser-side re-interpretation, exactly the ADR-005 violation this API
 * exists to prevent).
 *
 * `triggeredValue` is the Prisma Decimal serialized as a string (matches
 * the F4.4F raw-mode posture; consumers `Number(...)` if they need numeric
 * math). `alarmRuleId` is nullable — `SetNull` cascade when the referenced
 * rule is deleted; events outlive their rules.
 *
 * Lifecycle columns (`acknowledgedAt` / `acknowledgedBy` / `clearedAt`) are
 * surfaced as `null` until F4.6D.3 ships the `active → acknowledged →
 * cleared` transitions. Their wire presence makes that next phase additive.
 */
export interface AlarmEventRow {
  alarmEventId: string;
  unitId: string;
  canonicalTag: CanonicalTagSummary;
  /** Nullable — `SetNull` cascade when the rule is deleted. */
  alarmRuleId: string | null;
  severity: AlarmEventSeverity;
  state: AlarmEventState;
  /** Decimal — serialized as a string. */
  triggeredValue: string;
  thresholdViolated: AlarmEventThresholdBand;
  /** ISO-8601 — the reading's timestamp at trigger time. */
  firstTriggeredAt: string;
  /** Reserved for F4.6D.3 lifecycle; `null` until that phase ships. */
  acknowledgedAt: string | null;
  /** Reserved for F4.6D.3 lifecycle; `null` until that phase ships. */
  acknowledgedBy: string | null;
  /** Reserved for F4.6D.3 lifecycle; `null` until that phase ships. */
  clearedAt: string | null;
}

export interface AlarmEventsResponse {
  /** ISO-8601 — server-side response-generation time. */
  generatedAt: string;
  /** Constant string identifying the read source. */
  source: 'alarm_events';
  /** Echoes the parsed (defaulted) state query parameter. */
  state: AlarmEventState;
  /** Zero or more rows, ordered by `firstTriggeredAt DESC`. */
  events: AlarmEventRow[];
}

// =============================================================================
// Well tests — F4.7.1
// =============================================================================

/** Test-type enum — matches `well_tests.test_type` CHECK. */
export type WellTestType = 'fiscalizacion' | 'optimizacion';

/** Report-type enum — matches `well_tests.report_type` CHECK. */
export type WellTestReportType = 'fiscalizacion_pdf' | 'optimizacion_pdf';

/** Lifecycle-status enum — matches `well_tests.lifecycle_status` CHECK
 *  (8-state engineer-driven lifecycle per F4.7-0 §5). */
export type WellTestLifecycleStatus =
  | 'scheduled'
  | 'connected'
  | 'stabilizing'
  | 'measuring'
  | 'completed'
  | 'closed'
  | 'aborted';

/**
 * One row of the well-tests list / detail response. Derived view of the
 * backend `well_tests` row — `tenantId`, `createdBy`, `updatedBy` are
 * intentionally not on the wire (per F4.7-0 §14.1). `actualOfficialDurationSeconds`
 * is **derived** server-side from `(officialEndedAt - officialStartedAt)`;
 * `null` until the test reaches `completed` / `closed`.
 */
export interface WellTestRow {
  id: string;
  jobId: string;
  wellId: string;
  unitId: string;
  testType: WellTestType;
  reportType: WellTestReportType;
  lifecycleStatus: WellTestLifecycleStatus;
  plannedOfficialDurationHours: number;
  /** Derived. `null` until the test reaches `completed`. */
  actualOfficialDurationSeconds: number | null;
  /** ISO-8601. `null` until the matching transition has fired. */
  connectedAt: string | null;
  stabilizationStartedAt: string | null;
  stabilizationEndedAt: string | null;
  officialStartedAt: string | null;
  officialEndedAt: string | null;
  disconnectedAt: string | null;
  reportGeneratedAt: string | null;
  abortedAt: string | null;
  abortReason: string | null;
  notes: string | null;
  clientReference: string | null;
  /** ISO-8601 — operational metadata for audit / Reports. */
  createdAt: string;
  updatedAt: string;
}

/** Nested summaries the detail endpoint hydrates from `Job` / `Well` /
 *  `MeasurementUnit` (mirrors the F4.4E Jobs detail pattern). */
export interface WellTestJobSummary {
  id: string;
  status: string;
  startedAt: string | null;
  closedAt: string | null;
}

export interface WellTestWellSummary {
  id: string;
  name: string;
  fieldOrSite: string | null;
}

export interface WellTestUnitSummary {
  id: string;
  code: string;
  name: string;
}

export interface WellTestDetail extends WellTestRow {
  job: WellTestJobSummary;
  well: WellTestWellSummary;
  unit: WellTestUnitSummary;
}

export interface WellTestsListResponse {
  /** ISO-8601 — server-side response-generation time. */
  generatedAt: string;
  /** Constant string identifying the read source. */
  source: 'well_tests';
  /** Zero or more rows, ordered by `createdAt DESC`. */
  wellTests: WellTestRow[];
}

export interface WellTestActiveResponse {
  generatedAt: string;
  source: 'well_tests';
  /** The most recent row in `connected | stabilizing | measuring` for the
   *  queried unit, or `null` when none. */
  active: WellTestRow | null;
}
