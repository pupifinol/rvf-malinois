/**
 * F4.5D — Jobs data-source-aware adapter + view-model helpers.
 *
 * Two layers (mirrors the F4.5C equipment adapter):
 *
 *   1. Adapter functions (`adapterListJobs`, `adapterGetJob`) — same delegation
 *      pattern as F4.5B / F4.5C. Mock branch returns deterministic
 *      F4-shaped fixtures; api branch delegates to `@/lib/api/f4` wrappers
 *      (`listJobs` / `getJobById`).
 *
 *   2. View-model helpers
 *      (`deriveJobRuntime`, `deriveCommissioningSummary`,
 *       `toJobListItemViewModel`) — explicit, named, optional.
 *      Each helper documents what it returns and when it returns `undefined`.
 *      The adapter response shape stays verbatim; consumers opt into the
 *      helper layer per call site.
 *
 * Decisions:
 *
 *   - Mock-mode "not found" rejects with `RvfApiError(404, 'mock:/jobs/...', null, …)`.
 *   - Mock-mode list filters use strict equality (mirrors the F4.4E backend).
 *   - The list endpoint returns rows WITHOUT the rich detail include (no
 *     `designLimits` / `equipmentType` / `engineer` / `commissioningSnapshot`).
 *     Callers that need those fields call `adapterGetJob(id)`.
 *   - `deriveJobRuntime` accepts an optional `now` parameter (default
 *     `Date.now()`) so the helper is deterministic in tests.
 *   - `deriveCommissioningSummary` defensively narrows the JSONB fields
 *     (`sensorMappings`, `effectiveThresholds`, `ruleVersions`) — Prisma
 *     types them as `unknown`, so a malformed payload yields `undefined`
 *     counts rather than a runtime crash.
 */

import { MOCK_F4_JOBS, MOCK_F4_JOB_DETAILS } from './mock-fixtures';

import {
  type CommissioningSnapshot,
  type GetOptions,
  type JobDetail,
  type JobListRow,
  type JobStatus,
  RvfApiError,
  getJobById,
  isApiSource,
  listJobs,
} from '@/lib/api/f4';

// =============================================================================
// Adapter — list + detail
// =============================================================================

export interface ListJobsParams {
  tenantId?: string;
  wellId?: string;
  unitId?: string;
  status?: JobStatus;
}

const filterMockJobs = (params?: ListJobsParams): JobListRow[] => {
  let rows: JobListRow[] = [...MOCK_F4_JOBS];
  if (params?.tenantId) rows = rows.filter((j) => j.tenantId === params.tenantId);
  if (params?.wellId) rows = rows.filter((j) => j.wellId === params.wellId);
  if (params?.unitId) rows = rows.filter((j) => j.unitId === params.unitId);
  if (params?.status) rows = rows.filter((j) => j.status === params.status);
  return rows;
};

const orderByStartedThenCreated = (rows: JobListRow[]): JobListRow[] =>
  // Mirrors the F4.4E backend: `startedAt desc nulls last → createdAt desc`.
  // A null `startedAt` sorts after every populated date; ties resolve by
  // `createdAt desc`.
  [...rows].sort((a, b) => {
    const aStarted = a.startedAt ? Date.parse(a.startedAt) : null;
    const bStarted = b.startedAt ? Date.parse(b.startedAt) : null;
    if (aStarted !== null && bStarted !== null) {
      if (aStarted !== bStarted) return bStarted - aStarted;
    } else if (aStarted !== null) {
      return -1;
    } else if (bStarted !== null) {
      return 1;
    }
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });

export const adapterListJobs = async (
  params?: ListJobsParams,
  options?: GetOptions,
): Promise<JobListRow[]> => {
  if (isApiSource()) {
    return listJobs(params, options);
  }
  return Promise.resolve(orderByStartedThenCreated(filterMockJobs(params)));
};

export const adapterGetJob = async (id: string, options?: GetOptions): Promise<JobDetail> => {
  if (isApiSource()) {
    return getJobById(id, options);
  }
  const row = MOCK_F4_JOB_DETAILS[id];
  if (!row) {
    return Promise.reject(new RvfApiError(404, `mock:/jobs/${id}`, null, `Job '${id}' not found.`));
  }
  return Promise.resolve(row);
};

// =============================================================================
// View-model / derived-field helpers
// =============================================================================

export interface JobRuntime {
  /** ISO-8601 string copy of `job.startedAt` (always defined when this object is returned). */
  startedAt: string;
  /** ISO-8601 string copy of `job.closedAt`; `null` for running jobs. */
  closedAt: string | null;
  /** `true` when the job has a populated `closedAt`. */
  isClosed: boolean;
  /** Milliseconds elapsed between `startedAt` and `closedAt ?? now`. */
  runtimeMs: number;
}

/**
 * Compute runtime info for a job. Returns `undefined` when the job has not
 * started yet (`startedAt` is `null`). `now` defaults to `Date.now()`; pass
 * a fixed timestamp in tests for deterministic output.
 */
export const deriveJobRuntime = (
  job: Pick<JobListRow, 'startedAt' | 'closedAt'>,
  now: number = Date.now(),
): JobRuntime | undefined => {
  if (!job.startedAt) return undefined;
  const started = Date.parse(job.startedAt);
  if (Number.isNaN(started)) return undefined;
  const end = job.closedAt ? Date.parse(job.closedAt) : now;
  const runtimeMs = Math.max(0, end - started);
  return {
    startedAt: job.startedAt,
    closedAt: job.closedAt,
    isClosed: job.closedAt !== null,
    runtimeMs,
  };
};

export interface CommissioningSummary {
  /** Number of sensor mappings frozen in `sensorMappings` JSONB. */
  sensorMappingCount: number;
  /** Number of effective thresholds frozen in `effectiveThresholds` JSONB. */
  effectiveThresholdCount: number;
  /** Number of rule-version entries frozen in `ruleVersions` JSONB. */
  ruleVersionCount: number;
  /** ISO-8601 snapshot timestamp. */
  takenAt: string;
  /** `true` when the snapshot is marked immutable (architectural invariant). */
  immutable: boolean;
}

const countIfArray = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

/**
 * Defensively summarize an immutable commissioning snapshot. JSONB shapes are
 * `unknown` at the type level; this helper narrows each field with a runtime
 * guard so malformed payloads yield `0` counts rather than throwing.
 */
export const deriveCommissioningSummary = (
  snapshot: CommissioningSnapshot | null,
): CommissioningSummary | undefined => {
  if (!snapshot) return undefined;
  return {
    sensorMappingCount: countIfArray(snapshot.sensorMappings),
    effectiveThresholdCount: countIfArray(snapshot.effectiveThresholds),
    ruleVersionCount: countIfArray(snapshot.ruleVersions),
    takenAt: snapshot.takenAt,
    immutable: snapshot.immutable,
  };
};

export interface JobListItemViewModel {
  id: string;
  status: JobStatus;
  startedAt: string | null;
  closedAt: string | null;
  tenantName?: string;
  wellName?: string;
  unitCode?: string;
  unitName?: string;
}

/**
 * Project a list-row to a compact summary suitable for table / card rendering.
 * Drops `tenantId` / `wellId` / `unitId` / audit timestamps and surfaces only
 * the human-readable scalars the F4.4E list include hydrates.
 */
export const toJobListItemViewModel = (row: JobListRow): JobListItemViewModel => ({
  id: row.id,
  status: row.status,
  startedAt: row.startedAt,
  closedAt: row.closedAt,
  tenantName: row.tenant?.name,
  wellName: row.well?.name,
  unitCode: row.unit?.code,
  unitName: row.unit?.name,
});
