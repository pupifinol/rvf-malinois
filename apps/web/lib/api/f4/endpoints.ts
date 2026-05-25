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

import { getJson, type GetOptions } from './client';

import type {
  CanonicalTag,
  EquipmentType,
  JobDetail,
  JobListRow,
  MeasurementUnitDetail,
  MeasurementUnitListRow,
  MeasurementUnitOperatingProfile,
  MeasurementUnitStatus,
  TelemetryQuality,
  TelemetrySource,
  TelemetryTrendsResponse,
  Tenant,
  TenantStatus,
  Well,
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
  /** Defaults to 1000 on the backend; max 5000. */
  limit?: number;
}

export const getTelemetryTrends = (
  params: GetTelemetryTrendsParams,
  options?: GetOptions,
): Promise<TelemetryTrendsResponse> =>
  getJson<TelemetryTrendsResponse>('/telemetry/trends', params, options);
