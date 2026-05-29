/**
 * F4.5A — barrel export for the F4 frontend API foundation.
 *
 * Consumers should import from `@/lib/api/f4` rather than reaching into
 * individual files. F4.5B+ migrations should depend on this barrel so the
 * internal layout (`client.ts`, `config.ts`, `endpoints.ts`, …) can evolve
 * without touching screen code.
 *
 * IMPORTANT: this barrel is foundation-only. F4.5A does not consume the
 * F4 API from any screen — `apps/web/lib/api-data/` (the F3 mock adapter)
 * remains the default data source until a later sub-phase intentionally
 * migrates a specific screen.
 */

// Config & data-source switch.
export {
  RVF_DATA_SOURCES,
  type RvfDataSource,
  resolveDataSource,
  resolveApiBaseUrl,
  getDataSource,
  getApiBaseUrl,
  isMockSource,
  isApiSource,
} from './config';

// Error type.
export { RvfApiError } from './errors';

// Low-level client (exported for tests + bespoke callers; most consumers
// should prefer the typed endpoint wrappers below).
export { buildUrl, getJson, type GetOptions, type QueryParams, type QueryValue } from './client';

// Typed endpoint wrappers.
export {
  type ListTenantsParams,
  type ListWellsParams,
  type ListCanonicalTagsParams,
  type ListMeasurementUnitsParams,
  type ListJobsParams,
  type GetTelemetryTrendsParams,
  type GetTelemetryLatestParams,
  type GetAlarmEventsParams,
  listTenants,
  getTenant,
  listWells,
  getWell,
  listCanonicalTags,
  getCanonicalTag,
  listEquipmentTypes,
  getEquipmentType,
  listMeasurementUnits,
  getMeasurementUnit,
  listJobs,
  getJobById,
  getTelemetryTrends,
  getTelemetryLatest,
  getAlarmEvents,
} from './endpoints';

// Frontend types.
export type {
  TenantStatus,
  Tenant,
  TenantSummary,
  Well,
  CanonicalTag,
  CanonicalTagSummary,
  EquipmentType,
  EquipmentTypeSummary,
  MeasurementUnitStatus,
  MeasurementUnitOperatingProfile,
  MeasurementUnitListRow,
  MeasurementUnitDetail,
  TransmitterProtocol,
  TransmitterInstallationStatus,
  TransmitterDevice,
  SensorType,
  SensorWithTransmitters,
  UnitConfigurationRow,
  UnitOperatingEnvelopeRow,
  AlarmSeverity,
  AlarmRuleWithTag,
  JobStatus,
  CommissioningSnapshot,
  JobListRow,
  JobEngineerSummary,
  JobDetail,
  TelemetryQuality,
  TelemetrySource,
  TelemetryPoint,
  TelemetryTrendsResponse,
  TrendBucketSize,
  TrendAggregate,
  TrendQualityPolicy,
  TrendBucket,
  TelemetryLatestValue,
  TelemetryLatestResponse,
  AlarmEventState,
  AlarmEventSeverity,
  AlarmEventThresholdBand,
  AlarmEventRow,
  AlarmEventsResponse,
} from './types';
