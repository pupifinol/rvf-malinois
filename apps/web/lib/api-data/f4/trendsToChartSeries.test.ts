/**
 * F4.5G.1 — chart-series normalizer tests.
 *
 * Covers both raw-mode and bucketed-mode trend responses, including:
 *   - happy-path conversion
 *   - empty / null filtering
 *   - latest-point extraction
 *   - isChartSeriesEmpty()
 */
import { describe, expect, it } from 'vitest';

import { isChartSeriesEmpty, trendsLatestPoint, trendsToChartSeries } from './trendsToChartSeries';

import type { TelemetryTrendsResponse } from '@/lib/api/f4';

const TAG = {
  id: 'tag-1',
  name: 'p_inlet',
  displayName: 'Inlet pressure',
  canonicalUnit: 'psi',
  category: 'pressure',
  precision: 1,
};

const RANGE = { from: '2026-05-24T00:00:00.000Z', to: '2026-05-24T01:00:00.000Z' };

const rawResponse = (points: TelemetryTrendsResponse['points']): TelemetryTrendsResponse => ({
  unitId: 'unit-1',
  canonicalTag: TAG,
  range: RANGE,
  points,
});

const bucketedResponse = (
  buckets: NonNullable<TelemetryTrendsResponse['buckets']>,
): TelemetryTrendsResponse => ({
  unitId: 'unit-1',
  canonicalTag: TAG,
  range: RANGE,
  points: [],
  bucket: '1m',
  aggregate: 'avg',
  qualityPolicy: 'good_only',
  buckets,
});

describe('trendsToChartSeries — raw mode', () => {
  it('converts Decimal-string values to numbers in order', () => {
    const response = rawResponse([
      {
        timestamp: '2026-05-24T00:00:00.000Z',
        value: '3800.0',
        engineeringUnit: 'psi',
        quality: 'good',
        source: 'mock',
      },
      {
        timestamp: '2026-05-24T00:01:00.000Z',
        value: '3810.5',
        engineeringUnit: 'psi',
        quality: 'good',
        source: 'mock',
      },
    ]);
    const series = trendsToChartSeries(response, { name: 'HP-001', color: 'red' });
    expect(series).toEqual({ name: 'HP-001', color: 'red', data: [3800, 3810.5] });
  });

  it('filters out non-finite values (NaN / Infinity / unparseable)', () => {
    const response = rawResponse([
      {
        timestamp: '2026-05-24T00:00:00.000Z',
        value: '3800.0',
        engineeringUnit: 'psi',
        quality: 'good',
        source: 'mock',
      },
      {
        timestamp: '2026-05-24T00:01:00.000Z',
        value: 'not-a-number',
        engineeringUnit: 'psi',
        quality: 'good',
        source: 'mock',
      },
      {
        timestamp: '2026-05-24T00:02:00.000Z',
        value: 'Infinity',
        engineeringUnit: 'psi',
        quality: 'good',
        source: 'mock',
      },
      {
        timestamp: '2026-05-24T00:03:00.000Z',
        value: '3820.0',
        engineeringUnit: 'psi',
        quality: 'good',
        source: 'mock',
      },
    ]);
    const series = trendsToChartSeries(response, { name: 'HP-001', color: 'red' });
    expect(series.data).toEqual([3800, 3820]);
  });

  it('returns empty data array for an empty response', () => {
    const series = trendsToChartSeries(rawResponse([]), { name: 'X', color: 'c' });
    expect(series.data).toEqual([]);
  });
});

describe('trendsToChartSeries — bucketed mode', () => {
  it('converts buckets[].value to numbers in order', () => {
    const response = bucketedResponse([
      {
        bucketStart: '2026-05-24T00:00:00.000Z',
        bucketEnd: '2026-05-24T00:01:00.000Z',
        value: 3800,
        sampleCount: 60,
      },
      {
        bucketStart: '2026-05-24T00:01:00.000Z',
        bucketEnd: '2026-05-24T00:02:00.000Z',
        value: 3810.5,
        sampleCount: 58,
      },
    ]);
    const series = trendsToChartSeries(response, { name: 'HP-001', color: 'blue' });
    expect(series).toEqual({ name: 'HP-001', color: 'blue', data: [3800, 3810.5] });
  });

  it('drops null-value (empty) buckets', () => {
    const response = bucketedResponse([
      {
        bucketStart: '2026-05-24T00:00:00.000Z',
        bucketEnd: '2026-05-24T00:01:00.000Z',
        value: 3800,
        sampleCount: 60,
      },
      {
        bucketStart: '2026-05-24T00:01:00.000Z',
        bucketEnd: '2026-05-24T00:02:00.000Z',
        value: null,
        sampleCount: 0,
      },
      {
        bucketStart: '2026-05-24T00:02:00.000Z',
        bucketEnd: '2026-05-24T00:03:00.000Z',
        value: 3820,
        sampleCount: 60,
      },
    ]);
    const series = trendsToChartSeries(response, { name: 'HP-001', color: 'blue' });
    expect(series.data).toEqual([3800, 3820]);
  });

  it('returns empty data array when every bucket is empty', () => {
    const response = bucketedResponse([
      {
        bucketStart: '2026-05-24T00:00:00.000Z',
        bucketEnd: '2026-05-24T00:01:00.000Z',
        value: null,
        sampleCount: 0,
      },
    ]);
    const series = trendsToChartSeries(response, { name: 'X', color: 'c' });
    expect(series.data).toEqual([]);
  });
});

describe('trendsLatestPoint', () => {
  it('returns the most recent finite point (raw mode)', () => {
    const response = rawResponse([
      {
        timestamp: '2026-05-24T00:00:00.000Z',
        value: '3800.0',
        engineeringUnit: 'psi',
        quality: 'good',
        source: 'mock',
      },
      {
        timestamp: '2026-05-24T00:01:00.000Z',
        value: '3810.5',
        engineeringUnit: 'psi',
        quality: 'good',
        source: 'mock',
      },
    ]);
    expect(trendsLatestPoint(response)).toEqual({
      value: 3810.5,
      timestamp: '2026-05-24T00:01:00.000Z',
    });
  });

  it('returns the most recent finite bucket end (bucketed mode)', () => {
    const response = bucketedResponse([
      {
        bucketStart: '2026-05-24T00:00:00.000Z',
        bucketEnd: '2026-05-24T00:01:00.000Z',
        value: 3800,
        sampleCount: 60,
      },
      {
        bucketStart: '2026-05-24T00:01:00.000Z',
        bucketEnd: '2026-05-24T00:02:00.000Z',
        value: null,
        sampleCount: 0,
      },
    ]);
    expect(trendsLatestPoint(response)).toEqual({
      value: 3800,
      timestamp: '2026-05-24T00:01:00.000Z',
    });
  });

  it('returns null when no finite point exists', () => {
    expect(trendsLatestPoint(rawResponse([]))).toBeNull();
  });
});

describe('isChartSeriesEmpty', () => {
  it('true when raw points are all unparseable', () => {
    expect(
      isChartSeriesEmpty(
        rawResponse([
          {
            timestamp: '2026-05-24T00:00:00.000Z',
            value: 'nope',
            engineeringUnit: 'psi',
            quality: 'good',
            source: 'mock',
          },
        ]),
      ),
    ).toBe(true);
  });

  it('false when at least one raw point parses', () => {
    expect(
      isChartSeriesEmpty(
        rawResponse([
          {
            timestamp: '2026-05-24T00:00:00.000Z',
            value: '1.0',
            engineeringUnit: 'psi',
            quality: 'good',
            source: 'mock',
          },
        ]),
      ),
    ).toBe(false);
  });

  it('true when every bucket is empty', () => {
    expect(
      isChartSeriesEmpty(
        bucketedResponse([
          {
            bucketStart: '2026-05-24T00:00:00.000Z',
            bucketEnd: '2026-05-24T00:01:00.000Z',
            value: null,
            sampleCount: 0,
          },
        ]),
      ),
    ).toBe(true);
  });
});
