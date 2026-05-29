/**
 * useOperationsTrendSeries — F4.5G.1.
 *
 * Single shared hook driving both the Operations Live Trends mini chart and
 * the expanded trend drawer. Wraps the F4.5E `adapterGetTelemetryTrends`
 * adapter behind a TanStack Query call so loading / error / refetch state is
 * handled centrally, the same cache backs both views, and a future realtime
 * tail can `invalidateQueries` to trigger a resync.
 *
 * Range → query-mode policy from F4.5G-0 §7.4:
 *
 *   - `15m` / `1h` : raw mode (no bucket / aggregate).
 *   - `6h`         : bucketed, 1m / avg / good_only.
 *   - `24h`        : bucketed, 5m / avg / good_only.
 *   - `7d`         : bucketed, 15m / avg / good_only.
 *
 * The hook keeps a single source of truth: the same hook drives the mini
 * chart (default range `15m`, periodic refetch) and the expanded drawer
 * (user-selected range, on-demand refetch).
 *
 * Source switch (per F4.5G-0 §11):
 *
 *   - `api` data-source : adapter calls the F4.6F.1 backend endpoint.
 *   - `mock` data-source : adapter returns the deterministic F4.5E fixture.
 *
 * No realtime tail consumption in F4.5G.1 — deferred to F4.5G.2 per the
 * plan's optional bullet. The hook signature already exposes a `lastDataAt`
 * so a future realtime path can update the displayed freshness without
 * widening the contract.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  type RvfDataSource,
  type TelemetryTrendsResponse,
  type TrendAggregate,
  type TrendBucketSize,
  type TrendQualityPolicy,
  getDataSource,
} from '@/lib/api/f4';
import { adapterGetTelemetryTrends } from '@/lib/api-data/f4';
import {
  type ChartSeries,
  type LatestPoint,
  isChartSeriesEmpty,
  trendsLatestPoint,
  trendsToChartSeries,
} from '@/lib/api-data/f4/trendsToChartSeries';

export type TrendWindow = '15m' | '1h' | '6h' | '24h' | '7d';

export const TREND_WINDOWS: readonly TrendWindow[] = ['15m', '1h', '6h', '24h', '7d'];

/** Window width in milliseconds. Exported so callers that need to filter a
 * non-backend series (e.g. the F4.5G.2.2.2 simulator-history fallback in
 * `<TrendDrawer>`) reuse the same edges the trend query uses. */
export const WINDOW_MS: Record<TrendWindow, number> = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

export interface TrendQueryPolicy {
  /** `undefined` ⇒ raw mode; present ⇒ bucketed mode. */
  bucket?: TrendBucketSize;
  aggregate?: TrendAggregate;
  qualityPolicy?: TrendQualityPolicy;
}

/**
 * Picks the raw / bucketed strategy for a given window per F4.5G-0 §7.4.
 * Exported for tests.
 */
export const policyForWindow = (window: TrendWindow): TrendQueryPolicy => {
  switch (window) {
    case '15m':
    case '1h':
      return {};
    case '6h':
      return { bucket: '1m', aggregate: 'avg', qualityPolicy: 'good_only' };
    case '24h':
      return { bucket: '5m', aggregate: 'avg', qualityPolicy: 'good_only' };
    case '7d':
      return { bucket: '15m', aggregate: 'avg', qualityPolicy: 'good_only' };
  }
};

/**
 * Quantizes `Date.now()` to a `bucketMs` boundary so successive renders
 * within the same bucket reuse the same TanStack Query cache key. Without
 * this, each render would compute a slightly newer `now`, invalidating the
 * cache and causing a refetch on every tick.
 */
const quantizeNow = (bucketMs: number): number => Math.floor(Date.now() / bucketMs) * bucketMs;

const CACHE_BUCKET_MS = 15 * 1000; // 15-second cache-key resolution

export interface UseOperationsTrendSeriesInput {
  /** Backend `MeasurementUnit.id` (UUID in api mode; simulator id in mock mode). */
  unitId: string;
  /** Canonical tag identifier name (e.g. `p_inlet`). */
  canonicalTagName: string;
  /** Time window. Defaults to `15m` (mini chart) when omitted by caller. */
  window: TrendWindow;
  /** Series label shown by the chart legend. */
  name: string;
  /** Series color (CSS custom property or color string). */
  color: string;
  /** When false (default true) the hook skips fetching — used to gate disabled cards. */
  enabled?: boolean;
  /** TanStack Query refetch interval. Defaults to 30 s (mini chart pacing). */
  refetchIntervalMs?: number;
}

export interface UseOperationsTrendSeriesResult {
  series: ChartSeries;
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  /** ISO-8601 of the load that produced the current data, when available. */
  lastDataAt: string | null;
  /** Most recent finite value + its timestamp, for the latest-value indicator. */
  latest: LatestPoint | null;
  /** Backend response (raw or bucketed) — exposed for callers that need the envelope. */
  response: TelemetryTrendsResponse | undefined;
  /** Current data source (mock / api) — surfaced so callers can label the chart honestly. */
  source: RvfDataSource;
  /** Window applied for this fetch. */
  window: TrendWindow;
  /** True ⇒ bucketed-mode fetch; false ⇒ raw-mode fetch. */
  bucketed: boolean;
}

const EMPTY_SERIES = (name: string, color: string): ChartSeries => ({
  name,
  color,
  data: [],
});

/**
 * Compose the trend query for a `(unitId, canonicalTagName, window)` triple.
 */
export const useOperationsTrendSeries = (
  input: UseOperationsTrendSeriesInput,
): UseOperationsTrendSeriesResult => {
  const {
    unitId,
    canonicalTagName,
    window,
    name,
    color,
    enabled = true,
    refetchIntervalMs = 30_000,
  } = input;

  const source = getDataSource();
  const policy = useMemo(() => policyForWindow(window), [window]);

  // Quantize `to` to a coarse bucket so identical (unit, tag, window) re-renders
  // within the same window share a TanStack Query cache key rather than
  // refetching on every render. The refetchInterval below moves the window
  // forward at controlled pacing.
  const toEpoch = quantizeNow(CACHE_BUCKET_MS);
  const fromEpoch = toEpoch - WINDOW_MS[window];

  const queryKey = [
    'f4-trends',
    unitId,
    canonicalTagName,
    window,
    policy.bucket ?? 'raw',
    policy.aggregate ?? 'none',
    policy.qualityPolicy ?? 'none',
    fromEpoch,
    toEpoch,
  ] as const;

  const query = useQuery<TelemetryTrendsResponse>({
    queryKey,
    enabled: enabled && unitId.length > 0 && canonicalTagName.length > 0,
    refetchInterval: refetchIntervalMs,
    queryFn: ({ signal }) =>
      adapterGetTelemetryTrends(
        {
          unitId,
          canonicalTagName,
          from: new Date(fromEpoch).toISOString(),
          to: new Date(toEpoch).toISOString(),
          ...policy,
        },
        { signal },
      ),
  });

  const response = query.data;
  const series = response
    ? trendsToChartSeries(response, { name, color })
    : EMPTY_SERIES(name, color);
  const latest = response ? trendsLatestPoint(response) : null;
  const isEmpty = response ? isChartSeriesEmpty(response) : true;

  const lastDataAt = query.dataUpdatedAt > 0 ? new Date(query.dataUpdatedAt).toISOString() : null;

  return {
    series,
    isLoading: query.isLoading,
    isError: query.isError,
    isEmpty,
    lastDataAt,
    latest,
    response,
    source,
    window,
    bucketed: policy.bucket !== undefined,
  };
};
