/**
 * F4.5G.1 — chart-series normalizer.
 *
 * Converts a `TelemetryTrendsResponse` (raw mode OR bucketed mode) into the
 * `TrendSeries { name, color, data: number[] }` shape `<TrendChart>` consumes.
 *
 * The chart input is index-based (no per-point timestamps). To keep gaps from
 * collapsing the visible density too aggressively, the normalizer drops
 * unparseable / null entries instead of injecting placeholders — `<TrendChart>`
 * does not yet understand gap rendering. A future "gap-aware" variant can
 * pass `(number | null)[]` through once the chart learns to skip nulls.
 *
 * Decisions:
 *
 *   - **Raw mode** (`response.bucket === undefined`): `points[].value` is a
 *     Decimal-serialized string; `Number(...)` parses it. Non-finite values
 *     (NaN / Infinity / unparseable) are filtered out.
 *   - **Bucketed mode** (`response.bucket !== undefined`): `buckets[].value`
 *     is already a JS `number | null` (per F4.6F.1 §6.3). `null` entries
 *     (empty buckets where `sampleCount === 0`) are filtered out.
 *   - Caller supplies `name` (label drawn in the legend) and `color` (a CSS
 *     custom property reference or other CSS color string).
 *   - The result preserves the input ordering (oldest → newest), which the
 *     chart relies on for the index-based X axis.
 */
import type { TelemetryTrendsResponse } from '@/lib/api/f4';

export interface ChartSeriesOptions {
  name: string;
  color: string;
}

export interface ChartSeries {
  name: string;
  color: string;
  data: number[];
}

/**
 * Latest finite value + its timestamp from a trend response. Returns `null`
 * when no usable point exists. The drawer uses this for the "latest value"
 * indicator next to the expanded chart.
 */
export interface LatestPoint {
  value: number;
  timestamp: string;
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Convert a trend response (raw OR bucketed) to a chart series.
 */
export const trendsToChartSeries = (
  response: TelemetryTrendsResponse,
  opts: ChartSeriesOptions,
): ChartSeries => {
  if (response.bucket !== undefined) {
    const data = (response.buckets ?? [])
      .map((b) => b.value)
      .filter((v): v is number => isFiniteNumber(v));
    return { name: opts.name, color: opts.color, data };
  }
  const data = response.points.map((p) => Number(p.value)).filter(isFiniteNumber);
  return { name: opts.name, color: opts.color, data };
};

/**
 * Extract the most recent finite value + its timestamp from a trend response.
 * Returns `null` when no usable point exists.
 */
export const trendsLatestPoint = (response: TelemetryTrendsResponse): LatestPoint | null => {
  if (response.bucket !== undefined) {
    const buckets = response.buckets ?? [];
    for (let i = buckets.length - 1; i >= 0; i--) {
      const b = buckets[i];
      if (b && isFiniteNumber(b.value)) {
        return { value: b.value, timestamp: b.bucketEnd };
      }
    }
    return null;
  }
  for (let i = response.points.length - 1; i >= 0; i--) {
    const p = response.points[i];
    if (!p) continue;
    const v = Number(p.value);
    if (isFiniteNumber(v)) {
      return { value: v, timestamp: p.timestamp };
    }
  }
  return null;
};

/** True when the response has zero usable data points for a chart. */
export const isChartSeriesEmpty = (response: TelemetryTrendsResponse): boolean => {
  if (response.bucket !== undefined) {
    return (response.buckets ?? []).every((b) => !isFiniteNumber(b.value));
  }
  return response.points.every((p) => !Number.isFinite(Number(p.value)));
};
