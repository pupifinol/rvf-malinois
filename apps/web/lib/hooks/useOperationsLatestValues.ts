/**
 * useOperationsLatestValues — F4.5G.2.2.1.
 *
 * Reads the latest canonical value per `(unitId, canonicalTag)` slot for an
 * Operations card from `adapterGetTelemetryLatest` (F4.6C.2.1). Wraps the
 * adapter in TanStack Query so the cache + refetch + invalidation seams are
 * available; the F4.5G.2.1 realtime hook's reconnect handler invalidates
 * this hook's cache (cache key `['f4-latest', unitId]`) alongside the
 * existing `['f4-trends']` invalidation.
 *
 * Per F4.5G.2.2-0 §10:
 *
 *   - One request per resolved unit (no tag filter). Tile-side lookup via
 *     `valuesByTagName.get('p_inlet')` — O(1) per tile.
 *   - Cache key `['f4-latest', unitId]`. Independent of `['f4-trends', …]`.
 *   - `refetchInterval: 30_000` matches the F4.5G.1 mini-chart pacing.
 *   - `enabled: isApiSource() && isUuidShaped(unitId)` — defense in depth on
 *     top of `adapterGetTelemetryLatest`'s api-mode `assertUuidShaped` guard.
 *     Mock mode and non-UUID `unitId` keep the hook disabled — no fetch.
 *   - `valuesByTagName` is a stable empty `Map` when disabled / loading, so
 *     tile renders never crash on `.get(...)`.
 *   - `lastDataAt` is the ISO-8601 timestamp of the most recent successful
 *     load, surfaced for the tile freshness chip.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  type RvfDataSource,
  type TelemetryLatestResponse,
  type TelemetryLatestValue,
  getDataSource,
  isApiSource,
} from '@/lib/api/f4';
import { adapterGetTelemetryLatest } from '@/lib/api-data/f4';
import { isUuidShaped } from '@/lib/hooks/useOperationsRealtimeF4';

export interface UseOperationsLatestValuesInput {
  /** Backend `MeasurementUnit.id` UUID (resolved upstream). `null` disables. */
  unitId: string | null;
  /** Force-disable (for tests / staged rollouts). Default: enabled. */
  enabled?: boolean;
  /** Refetch interval in ms. Default 30 s (matches F4.5G.1 mini-chart cadence). */
  refetchIntervalMs?: number;
}

export interface UseOperationsLatestValuesResult {
  /** Lookup by canonical-tag name (`'p_inlet'`, `'q_gas'`, …). Empty when disabled. */
  valuesByTagName: ReadonlyMap<string, TelemetryLatestValue>;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  /** ISO-8601 of the most recent successful load, or null. */
  lastDataAt: string | null;
  /** Backend response envelope (when loaded), exposed for callers that need it. */
  response: TelemetryLatestResponse | undefined;
  /** Effective data source (`'mock'` / `'api'`). Surfaced for honest labeling. */
  source: RvfDataSource;
  /** True when the hook will (or did) fire a fetch. */
  enabled: boolean;
}

const EMPTY_MAP: ReadonlyMap<string, TelemetryLatestValue> = new Map();

export const useOperationsLatestValues = (
  input: UseOperationsLatestValuesInput,
): UseOperationsLatestValuesResult => {
  const { unitId, enabled: forceEnabled, refetchIntervalMs = 30_000 } = input;

  const source = getDataSource();
  const allowed =
    (forceEnabled ?? true) && isApiSource() && unitId !== null && isUuidShaped(unitId);

  const query = useQuery<TelemetryLatestResponse>({
    queryKey: ['f4-latest', unitId ?? ''],
    enabled: allowed,
    refetchInterval: allowed ? refetchIntervalMs : false,
    queryFn: ({ signal }) => {
      if (unitId === null) {
        return Promise.reject(new Error('useOperationsLatestValues: unitId is null'));
      }
      return adapterGetTelemetryLatest({ unitId }, { signal });
    },
  });

  const response = query.data;

  const valuesByTagName = useMemo<ReadonlyMap<string, TelemetryLatestValue>>(() => {
    if (!response) return EMPTY_MAP;
    const map = new Map<string, TelemetryLatestValue>();
    for (const row of response.values) {
      map.set(row.canonicalTag.name, row);
    }
    return map;
  }, [response]);

  const lastDataAt = query.dataUpdatedAt > 0 ? new Date(query.dataUpdatedAt).toISOString() : null;

  return {
    valuesByTagName,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error instanceof Error ? query.error : null,
    lastDataAt,
    response,
    source,
    enabled: allowed,
  };
};
