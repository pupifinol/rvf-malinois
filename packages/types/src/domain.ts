import type { Brand } from './brand';

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------
// Each entity in the domain model gets its own branded ID. See
// docs/architecture/domain-model.md for the full entity map.

export type TenantId = Brand<string, 'TenantId'>;
export type SiteId = Brand<string, 'SiteId'>;
export type WellId = Brand<string, 'WellId'>;
export type EquipmentId = Brand<string, 'EquipmentId'>;
export type SensorId = Brand<string, 'SensorId'>;
export type SignalFireDeviceId = Brand<string, 'SignalFireDeviceId'>;
export type GatewayId = Brand<string, 'GatewayId'>;
export type JobId = Brand<string, 'JobId'>;
export type CommissioningId = Brand<string, 'CommissioningId'>;
export type AlarmId = Brand<string, 'AlarmId'>;
export type UserId = Brand<string, 'UserId'>;

/**
 * Canonical tag name (the RVF dictionary entry: p_inlet, t_outlet, q_oil...).
 * This is the OFFICIAL name; it is fixed and governed by RVF. ADR-003/004.
 */
export type CanonicalTag = Brand<string, 'CanonicalTag'>;

// ---------------------------------------------------------------------------
// Quality (telemetry-foundation §4 + domain-model §14)
// ---------------------------------------------------------------------------
// Every telemetry reading carries one of these qualities. We never show a bad
// reading as good; we never interpolate a stale one. Quality is first-class.

export const Quality = {
  Good: 'good',
  Estimated: 'estimated',
  Uncertain: 'uncertain',
  Bad: 'bad',
  Stale: 'stale',
} as const;
export type Quality = (typeof Quality)[keyof typeof Quality];

// ---------------------------------------------------------------------------
// Alarm lifecycle (ISA-18.2 — telemetry-foundation §5, domain-model §15)
// ---------------------------------------------------------------------------

export const AlarmState = {
  Active: 'active',
  Acknowledged: 'acknowledged',
  Cleared: 'cleared',
  Shelved: 'shelved',
} as const;
export type AlarmState = (typeof AlarmState)[keyof typeof AlarmState];

export const AlarmSeverity = {
  Critical: 'critical',
  High: 'high',
  Medium: 'medium',
  Low: 'low',
} as const;
export type AlarmSeverity = (typeof AlarmSeverity)[keyof typeof AlarmSeverity];

export const AlarmCondition = {
  LoLo: 'LO_LO',
  Lo: 'LO',
  Hi: 'HI',
  HiHi: 'HI_HI',
  Rate: 'RATE',
  Deviation: 'DEVIATION',
  NoData: 'NO_DATA',
} as const;
export type AlarmCondition = (typeof AlarmCondition)[keyof typeof AlarmCondition];

// ---------------------------------------------------------------------------
// Job lifecycle
// ---------------------------------------------------------------------------

export const JobStatus = {
  Scheduled: 'scheduled',
  InProgress: 'in_progress',
  Closed: 'closed',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

// ---------------------------------------------------------------------------
// Roles (telemetry-foundation §18)
// ---------------------------------------------------------------------------

export const UserRole = {
  RvfSuperAdmin: 'rvf_super_admin',
  RvfAdmin: 'rvf_admin',
  RvfOperations: 'rvf_operations',
  RvfField: 'rvf_field',
  RvfAnalyst: 'rvf_analyst',
  ClientAdmin: 'client_admin',
  ClientViewer: 'client_viewer',
  ClientApi: 'client_api',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
