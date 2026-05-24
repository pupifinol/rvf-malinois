/**
 * Active-job accessor — F2A.
 *
 * F2A doesn't yet have a backend to fetch active jobs from. This module
 * exposes a tiny synchronous accessor over the mock list, plus a setter
 * used by tests and the demo script to override the "current" job. F2B/D
 * will replace the implementation with a TanStack Query hook backed by REST
 * — the public surface (a single `getActiveJobSnapshot()` call) stays the
 * same so consuming hooks don't need to change.
 */
import { DEFAULT_ACTIVE_JOB, MOCK_ACTIVE_JOBS } from './snapshots.mock';

import type { ActiveJobSnapshot } from './types';
import type { JobId } from '@rvf/types';

let current: ActiveJobSnapshot = DEFAULT_ACTIVE_JOB;

export const getActiveJobSnapshot = (): ActiveJobSnapshot => current;

export const setActiveJobSnapshot = (next: ActiveJobSnapshot): void => {
  current = next;
};

export const findActiveJob = (id: JobId): ActiveJobSnapshot | undefined =>
  MOCK_ACTIVE_JOBS.find((j) => j.jobId === id);

export const listActiveJobs = (): readonly ActiveJobSnapshot[] => MOCK_ACTIVE_JOBS;
