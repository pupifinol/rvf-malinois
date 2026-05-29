/**
 * F4.5A — typed endpoint wrappers for the F4 backend API.
 *
 * Each function is a thin, dependency-free async call that returns the
 * frontend-typed shape defined in `./types.ts`. They are deliberately
 * un-opinionated about caching / retry / hydration — F4.5B+ will compose
 * them inside React Query queries (or whichever fetch-orchestration layer
 * the migrating screen chose).
 *
 * Foundation-only: no screen consumes these in F4.5A. The mock adapter at
 * `apps/web/lib/api-data/` remains the default data source. See
 * `./config.ts` for the data-source switch.
 */

import { getJson, postJson, type GetOptions } from './client';

import type {
  AlarmEventSeverity,
  AlarmEventState,
  AlarmEventsResponse,
  CanonicalTag,
  EquipmentType,
  JobDetail,
  JobListRow,
  MeasurementUnitDetail,
  MeasurementUnitListRow,
  MeasurementUnitOperatingProfile,
  MeasurementUnitStatus,
  TelemetryLatestResponse,
  TelemetryQuality,
  TelemetrySource,
  TelemetryTrendsResponse,
  Tenant,
  TenantStatus,
  TrendAggregate,
  TrendBucketSize,
  TrendQualityPolicy,
  Well,
  WellTestActiveResponse,
  WellTestDetail,
  WellTestLifecycleStatus,
  WellTestReportType,
  WellTestType,
  WellTestsListResponse,
} from './types';

// =============================================================================
// Tenants — F4.4A
// =============================================================================

export interface ListTenantsParams {
  status?: TenantStatus;
}

export const listTenants = (params?: ListTenantsParams, options?: GetOptions): Promise<Tenant[]> =>
  getJson<Tenant[]>('/tenants', params, options);

export const getTenant = (id: string, options?: GetOptions): Promise<Tenant> =>
  getJson<Tenant>(`/tenants/${encodeURIComponent(id)}`, undefined, options);

// =============================================================================
// Wells — F4.4B
// =============================================================================

export interface ListWellsParams {
  tenantId?: string;
  fieldOrSite?: string;
  type?: string;
  fluid?: string;
}

export const listWells = (params?: ListWellsParams, options?: GetOptions): Promise<Well[]> =>
  getJson<Well[]>('/wells', params, options);

export const getWell = (id: string, options?: GetOptions): Promise<Well> =>
  getJson<Well>(`/wells/${encodeURIComponent(id)}`, undefined, options);

// =============================================================================
// Canonical tags — F4.4C
// =============================================================================

export interface ListCanonicalTagsParams {
  category?: string;
  canonicalUnit?: string;
  deprecated?: boolean;
}

export const listCanonicalTags = (
  params?: ListCanonicalTagsParams,
  options?: GetOptions,
): Promise<CanonicalTag[]> => getJson<CanonicalTag[]>('/tags', params, options);

export const getCanonicalTag = (name: string, options?: GetOptions): Promise<CanonicalTag> =>
  getJson<CanonicalTag>(`/tags/${encodeURIComponent(name)}`, undefined, options);

// =============================================================================
// Equipment — F4.4D
// =============================================================================

export const listEquipmentTypes = (options?: GetOptions): Promise<EquipmentType[]> =>
  getJson<EquipmentType[]>('/equipment/types', undefined, options);

export const getEquipmentType = (id: string, options?: GetOptions): Promise<EquipmentType> =>
  getJson<EquipmentType>(`/equipment/types/${encodeURIComponent(id)}`, undefined, options);

export interface ListMeasurementUnitsParams {
  tenantId?: string;
  equipmentTypeId?: string;
  status?: MeasurementUnitStatus;
  operatingProfile?: MeasurementUnitOperatingProfile;
}

export const listMeasurementUnits = (
  params?: ListMeasurementUnitsParams,
  options?: GetOptions,
): Promise<MeasurementUnitListRow[]> =>
  getJson<MeasurementUnitListRow[]>('/equipment/units', params, options);

export const getMeasurementUnit = (
  id: string,
  options?: GetOptions,
): Promise<MeasurementUnitDetail> =>
  getJson<MeasurementUnitDetail>(`/equipment/units/${encodeURIComponent(id)}`, undefined, options);

// =============================================================================
// Jobs — F4.4E
// =============================================================================

export interface ListJobsParams {
  tenantId?: string;
  wellId?: string;
  unitId?: string;
  status?: JobListRow['status'];
}

export const listJobs = (params?: ListJobsParams, options?: GetOptions): Promise<JobListRow[]> =>
  getJson<JobListRow[]>('/jobs', params, options);

export const getJobById = (id: string, options?: GetOptions): Promise<JobDetail> =>
  getJson<JobDetail>(`/jobs/${encodeURIComponent(id)}`, undefined, options);

// =============================================================================
// Telemetry trends — F4.4F
// =============================================================================

/**
 * Telemetry trends query.
 *
 * Exactly one of `canonicalTagId` / `canonicalTagName` is required (the
 * backend Zod schema rejects both together; supplying neither also fails).
 * The frontend type leaves both optional so callers compose them
 * explicitly; the runtime validation lives on the backend.
 */
export interface GetTelemetryTrendsParams {
  unitId: string;
  from: Date | string;
  to: Date | string;
  canonicalTagId?: string;
  canonicalTagName?: string;
  jobId?: string;
  quality?: TelemetryQuality;
  source?: TelemetrySource;
  /** Defaults to 1000 on the backend; max 5000. Raw-mode only. */
  limit?: number;
  /** F4.6F.1 — bucketed-mode bucket width. Requires `aggregate`. */
  bucket?: TrendBucketSize;
  /** F4.6F.1 — bucketed-mode aggregate expression. Requires `bucket`. */
  aggregate?: TrendAggregate;
  /** F4.6F.1 — bucketed-mode quality-policy filter. Requires `bucket`. */
  qualityPolicy?: TrendQualityPolicy;
}

export const getTelemetryTrends = (
  params: GetTelemetryTrendsParams,
  options?: GetOptions,
): Promise<TelemetryTrendsResponse> =>
  getJson<TelemetryTrendsResponse>('/telemetry/trends', params, options);

// =============================================================================
// Telemetry latest values — F4.6C.2.1
// =============================================================================

/**
 * Latest-value query.
 *
 * `unitId` is required (backend rejects non-UUID at 400). At most one of
 * `canonicalTagId` / `canonicalTagName` may be supplied — omitting both
 * returns every latest value for the unit (the most useful shape for a
 * tile-grid hydration call).
 */
export interface GetTelemetryLatestParams {
  unitId: string;
  canonicalTagId?: string;
  canonicalTagName?: string;
}

export const getTelemetryLatest = (
  params: GetTelemetryLatestParams,
  options?: GetOptions,
): Promise<TelemetryLatestResponse> =>
  getJson<TelemetryLatestResponse>('/telemetry/latest', params, options);

// =============================================================================
// Alarm events — F4.6D.2.1
// =============================================================================

/**
 * Alarm-events query.
 *
 * All parameters optional; the backend applies defaults `state='active'`
 * and `limit=100`. At most one of `canonicalTagId` / `canonicalTagName`
 * (the backend Zod XOR rejects both together). `from`/`to` must appear
 * together with `from < to` (backend refine).
 *
 * `tenantId` is intentionally absent — tenant scoping is server-derived
 * from the `CallerContext`, never trusted from the client (F4.6D.2-0 §11).
 */
export interface GetAlarmEventsParams {
  unitId?: string;
  canonicalTagId?: string;
  canonicalTagName?: string;
  state?: AlarmEventState;
  severity?: AlarmEventSeverity;
  from?: Date | string;
  to?: Date | string;
  /** Defaults to 100 on the backend; max 500. */
  limit?: number;
}

export const getAlarmEvents = (
  params: GetAlarmEventsParams,
  options?: GetOptions,
): Promise<AlarmEventsResponse> => getJson<AlarmEventsResponse>('/alarms/events', params, options);

// =============================================================================
// Well tests — F4.7.1
// =============================================================================

/**
 * Well-tests list query.
 *
 * All filters optional. Tenant scoping is server-derived from the
 * `CallerContext`; **`tenantId` is intentionally absent** from the wire.
 * `from` / `to` (ISO-8601 or Date) filter `officialStartedAt` and must
 * appear together with `from < to`.
 */
export interface ListWellTestsParams {
  unitId?: string;
  wellId?: string;
  jobId?: string;
  lifecycleStatus?: WellTestLifecycleStatus;
  testType?: WellTestType;
  from?: Date | string;
  to?: Date | string;
  /** Defaults to 50 on the backend; max 200. */
  limit?: number;
}

export const listWellTests = (
  params?: ListWellTestsParams,
  options?: GetOptions,
): Promise<WellTestsListResponse> => getJson<WellTestsListResponse>('/well-tests', params, options);

export const getWellTestById = (id: string, options?: GetOptions): Promise<WellTestDetail> =>
  getJson<WellTestDetail>(`/well-tests/${encodeURIComponent(id)}`, undefined, options);

export interface GetActiveWellTestParams {
  unitId: string;
}

export const getActiveWellTest = (
  params: GetActiveWellTestParams,
  options?: GetOptions,
): Promise<WellTestActiveResponse> =>
  getJson<WellTestActiveResponse>('/well-tests/active', params, options);

/**
 * Create-well-test wire payload. **`tenantId` is never on the wire** —
 * derived server-side from the referenced `Job`. Fiscalización requires
 * `plannedOfficialDurationHours === 24` and `reportType ===
 * 'fiscalizacion_pdf'`. Optimización requires `plannedOfficialDurationHours
 * BETWEEN 12 AND 24` and `reportType === 'optimizacion_pdf'`. Both refines
 * are enforced server-side (Zod + DB CHECK).
 */
export interface CreateWellTestPayload {
  jobId: string;
  wellId: string;
  unitId: string;
  testType: WellTestType;
  reportType: WellTestReportType;
  plannedOfficialDurationHours: number;
  notes?: string;
  clientReference?: string;
}

export const createWellTest = (
  payload: CreateWellTestPayload,
  options?: GetOptions,
): Promise<WellTestDetail> =>
  postJson<WellTestDetail, CreateWellTestPayload>('/well-tests', payload, options);

/** Optional notes patch on a lifecycle transition. */
export interface WellTestTransitionPayload {
  notes?: string;
}

export interface AbortWellTestPayload {
  abortReason: string;
  notes?: string;
}

export interface CloseWellTestPayload {
  notes?: string;
  /** ISO-8601. Optional — only set when a Reports PDF has already landed. */
  reportGeneratedAt?: Date | string;
}

export const connectWellTest = (
  id: string,
  payload?: WellTestTransitionPayload,
  options?: GetOptions,
): Promise<WellTestDetail> =>
  postJson<WellTestDetail, WellTestTransitionPayload>(
    `/well-tests/${encodeURIComponent(id)}/connect`,
    payload ?? {},
    options,
  );

export const startWellTestStabilization = (
  id: string,
  payload?: WellTestTransitionPayload,
  options?: GetOptions,
): Promise<WellTestDetail> =>
  postJson<WellTestDetail, WellTestTransitionPayload>(
    `/well-tests/${encodeURIComponent(id)}/start-stabilization`,
    payload ?? {},
    options,
  );

export const startWellTestOfficial = (
  id: string,
  payload?: WellTestTransitionPayload,
  options?: GetOptions,
): Promise<WellTestDetail> =>
  postJson<WellTestDetail, WellTestTransitionPayload>(
    `/well-tests/${encodeURIComponent(id)}/start-official`,
    payload ?? {},
    options,
  );

export const endWellTestOfficial = (
  id: string,
  payload?: WellTestTransitionPayload,
  options?: GetOptions,
): Promise<WellTestDetail> =>
  postJson<WellTestDetail, WellTestTransitionPayload>(
    `/well-tests/${encodeURIComponent(id)}/end-official`,
    payload ?? {},
    options,
  );

export const abortWellTest = (
  id: string,
  payload: AbortWellTestPayload,
  options?: GetOptions,
): Promise<WellTestDetail> =>
  postJson<WellTestDetail, AbortWellTestPayload>(
    `/well-tests/${encodeURIComponent(id)}/abort`,
    payload,
    options,
  );

export const closeWellTest = (
  id: string,
  payload?: CloseWellTestPayload,
  options?: GetOptions,
): Promise<WellTestDetail> =>
  postJson<WellTestDetail, CloseWellTestPayload>(
    `/well-tests/${encodeURIComponent(id)}/close`,
    payload ?? {},
    options,
  );
