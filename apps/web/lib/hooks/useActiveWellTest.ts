/**
 * useActiveWellTest — F4.7.2.1.
 *
 * Reads the active WellTest for a unit through F4.7.1's
 * `adapterGetActiveWellTest`. Wraps the adapter in TanStack Query so the
 * cache + refetch + invalidation seams are uniform with `useOperationsLatestValues`
 * (cache key `['f4-latest', unitId]`) and `useOperationsTrendSeries` (cache
 * key prefix `['f4-trends', …]`).
 *
 * Per F4.7.2-0 §6:
 *
 *   - Cache key `['f4-active-well-test', unitId ?? '']` (distinct namespace
 *     from `'f4-well-tests'` list and `'f4-well-test'` detail to avoid future
 *     collisions).
 *   - `refetchInterval: 30_000` matches the F4.5G.2.2.1 latest-values pacing.
 *     The Official Window pill in `'measuring'` state slides its `to`
 *     boundary forward continuously, but the `WellTest` row itself only
 *     changes on lifecycle transitions; 30 s polling detects those within
 *     an operator-tolerable window.
 *   - **No `isApiSource()` gate.** `adapterGetActiveWellTest` is dual-mode;
 *     the mock branch resolves from `MOCK_F4_WELL_TESTS` for HP-001 (one
 *     `measuring` Fiscalización row) and returns `null` honestly for LP-001
 *     (empty fixture) and any non-fixture unit id (e.g. simulator strings
 *     like `EMMAD-02`).
 *   - **No UUID-shape gate.** Mock branch tolerates any string `unitId`
 *     (unknown → `{ active: null }`); api branch passes the string to the
 *     backend which rejects malformed UUIDs with 400. F4.7.2.1 does NOT
 *     introduce any fake mapping from simulator catalog strings to backend
 *     UUIDs anywhere — `useResolveBackendUnitId` (F4.5G.2.2.1) remains the
 *     single resolution boundary.
 *   - `enabled` defaults to `unitId !== null && unitId !== ''`. A
 *     `forceEnabled === false` short-circuits the fetch (for tests /
 *     staged rollouts).
 */
'use client';

import { useQuery } from '@tanstack/react-query';

import {
  type RvfDataSource,
  type WellTestActiveResponse,
  type WellTestRow,
  getDataSource,
} from '@/lib/api/f4';
import { adapterGetActiveWellTest } from '@/lib/api-data/f4';

export interface UseActiveWellTestInput {
  /** Backend `MeasurementUnit.id` UUID, simulator id, or `null`/`undefined`
   *  when no unit context is available. Empty string is treated as null. */
  unitId: string | null | undefined;
  /** Force-disable (for tests / staged rollouts). Default: enabled. */
  enabled?: boolean;
  /** Refetch interval in ms. Default 30 s. */
  refetchIntervalMs?: number;
}

export interface UseActiveWellTestResult {
  /** The most recent WellTest in `connected | stabilizing | measuring` for
   *  the queried unit, or `null` when none / loading / disabled. */
  active: WellTestRow | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  /** ISO-8601 of the most recent successful load, or null. */
  lastDataAt: string | null;
  /** Backend response envelope (when loaded). */
  response: WellTestActiveResponse | undefined;
  /** Effective data source (`'mock'` / `'api'`). Surfaced for honest labeling. */
  source: RvfDataSource;
  /** True when the hook will (or did) fire a fetch. */
  enabled: boolean;
}

export const useActiveWellTest = (input: UseActiveWellTestInput): UseActiveWellTestResult => {
  const { unitId, enabled: forceEnabled, refetchIntervalMs = 30_000 } = input;

  const source = getDataSource();
  const normalizedUnitId = unitId ?? '';
  const allowed = (forceEnabled ?? true) && normalizedUnitId !== '';

  const query = useQuery<WellTestActiveResponse>({
    queryKey: ['f4-active-well-test', normalizedUnitId],
    enabled: allowed,
    refetchInterval: allowed ? refetchIntervalMs : false,
    queryFn: ({ signal }) => adapterGetActiveWellTest({ unitId: normalizedUnitId }, { signal }),
  });

  const response = query.data;
  const active = response?.active ?? null;
  const lastDataAt = query.dataUpdatedAt > 0 ? new Date(query.dataUpdatedAt).toISOString() : null;

  return {
    active,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error instanceof Error ? query.error : null,
    lastDataAt,
    response,
    source,
    enabled: allowed,
  };
};
