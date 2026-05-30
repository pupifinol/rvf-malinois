/**
 * F4.5G.1 — `useOperationsTrendSeries` hook tests.
 *
 * Covers:
 *   - policyForWindow per F4.5G-0 §7.4.
 *   - Mock-mode loads + reports source='mock'.
 *   - API-mode forwards bucketed params for a long window.
 *   - Adapter errors surface as `isError`.
 *   - Disabled hook does not call the adapter.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  policyForWidth,
  policyForWindow,
  useOperationsTrendSeries,
  type UseOperationsTrendSeriesResult,
} from './useOperationsTrendSeries';

import type { TelemetryTrendsResponse } from '@/lib/api/f4';

const ORIGINAL_DATA_SOURCE = process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;

const { adapterMock } = vi.hoisted(() => ({
  adapterMock: vi.fn<(...args: unknown[]) => Promise<TelemetryTrendsResponse>>(),
}));

vi.mock('@/lib/api-data/f4', () => ({
  adapterGetTelemetryTrends: adapterMock,
}));

interface Capture {
  current: UseOperationsTrendSeriesResult | null;
}

const HP_001_ID = '00000000-0000-0000-0000-000000004411';

const TAG = {
  id: 'tag-1',
  name: 'p_inlet',
  displayName: 'Inlet pressure',
  canonicalUnit: 'psi',
  category: 'pressure',
  precision: 1,
};

const sampleResponse = (): TelemetryTrendsResponse => ({
  unitId: HP_001_ID,
  canonicalTag: TAG,
  range: { from: '2026-05-24T00:00:00.000Z', to: '2026-05-24T00:15:00.000Z' },
  points: [
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
  ],
});

const renderHookProbe = (
  capture: Capture,
  props: Parameters<typeof useOperationsTrendSeries>[0],
) => {
  const Probe = (componentProps: Parameters<typeof useOperationsTrendSeries>[0]): null => {
    capture.current = useOperationsTrendSeries(componentProps);
    return null;
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Probe {...props} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  adapterMock.mockReset();
});

afterEach(() => {
  process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = ORIGINAL_DATA_SOURCE;
});

describe('policyForWindow', () => {
  it('returns raw policy (no bucket) for 15m and 1h', () => {
    expect(policyForWindow('15m')).toEqual({});
    expect(policyForWindow('1h')).toEqual({});
  });

  it('returns bucketed policy with avg + good_only for 6h / 24h / 7d', () => {
    expect(policyForWindow('6h')).toEqual({
      bucket: '1m',
      aggregate: 'avg',
      qualityPolicy: 'good_only',
    });
    expect(policyForWindow('24h')).toEqual({
      bucket: '5m',
      aggregate: 'avg',
      qualityPolicy: 'good_only',
    });
    expect(policyForWindow('7d')).toEqual({
      bucket: '15m',
      aggregate: 'avg',
      qualityPolicy: 'good_only',
    });
  });
});

describe('useOperationsTrendSeries — mock mode (default)', () => {
  it('loads, normalizes to a chart series, and reports source=mock', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    adapterMock.mockResolvedValueOnce(sampleResponse());

    const capture: Capture = { current: null };
    renderHookProbe(capture, {
      unitId: HP_001_ID,
      canonicalTagName: 'p_inlet',
      window: '15m',
      name: 'HP-001',
      color: 'red',
    });

    await waitFor(() => {
      expect(capture.current?.isLoading).toBe(false);
    });
    expect(capture.current?.series.data).toEqual([3800, 3810.5]);
    expect(capture.current?.source).toBe('mock');
    expect(capture.current?.bucketed).toBe(false);
    expect(capture.current?.latest).toEqual({
      value: 3810.5,
      timestamp: '2026-05-24T00:01:00.000Z',
    });
  });
});

describe('useOperationsTrendSeries — api mode', () => {
  it('forwards bucketed params for the 6h window', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    adapterMock.mockResolvedValueOnce({
      unitId: HP_001_ID,
      canonicalTag: TAG,
      range: { from: '2026-05-24T00:00:00.000Z', to: '2026-05-24T06:00:00.000Z' },
      points: [],
      bucket: '1m',
      aggregate: 'avg',
      qualityPolicy: 'good_only',
      buckets: [
        {
          bucketStart: '2026-05-24T00:00:00.000Z',
          bucketEnd: '2026-05-24T00:01:00.000Z',
          value: 3800,
          sampleCount: 60,
        },
      ],
    });

    const capture: Capture = { current: null };
    renderHookProbe(capture, {
      unitId: HP_001_ID,
      canonicalTagName: 'p_inlet',
      window: '6h',
      name: 'HP-001',
      color: 'blue',
    });

    await waitFor(() => {
      expect(adapterMock).toHaveBeenCalled();
    });
    const call = adapterMock.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) return;
    const [params] = call as [Record<string, unknown>];
    expect(params.bucket).toBe('1m');
    expect(params.aggregate).toBe('avg');
    expect(params.qualityPolicy).toBe('good_only');
    expect(params.unitId).toBe(HP_001_ID);
    expect(params.canonicalTagName).toBe('p_inlet');

    await waitFor(() => {
      expect(capture.current?.isLoading).toBe(false);
    });
    expect(capture.current?.bucketed).toBe(true);
    expect(capture.current?.series.data).toEqual([3800]);
    expect(capture.current?.source).toBe('api');
  });

  it('reports isError when the adapter rejects', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    adapterMock.mockRejectedValueOnce(new Error('boom'));

    const capture: Capture = { current: null };
    renderHookProbe(capture, {
      unitId: HP_001_ID,
      canonicalTagName: 'p_inlet',
      window: '15m',
      name: 'HP-001',
      color: 'red',
    });

    await waitFor(() => {
      expect(capture.current?.isError).toBe(true);
    });
  });
});

describe('useOperationsTrendSeries — gating', () => {
  it('does not call the adapter when enabled=false', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    adapterMock.mockResolvedValueOnce(sampleResponse());

    const capture: Capture = { current: null };
    renderHookProbe(capture, {
      unitId: HP_001_ID,
      canonicalTagName: 'p_inlet',
      window: '15m',
      name: 'HP-001',
      color: 'red',
      enabled: false,
    });

    await waitFor(() => {
      expect(capture.current).not.toBeNull();
    });
    expect(adapterMock).not.toHaveBeenCalled();
    expect(capture.current?.series.data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// F4.7.2.1 — width-based bucketing + windowRange override
// ---------------------------------------------------------------------------

describe('policyForWidth (F4.7.2.1)', () => {
  it('returns raw mode for widths ≤ 1 h', () => {
    expect(policyForWidth(60 * 60 * 1000)).toEqual({});
    expect(policyForWidth(30 * 60 * 1000)).toEqual({});
  });

  it('returns 1m / avg / good_only for 1 h < width ≤ 6 h', () => {
    expect(policyForWidth(2 * 60 * 60 * 1000)).toEqual({
      bucket: '1m',
      aggregate: 'avg',
      qualityPolicy: 'good_only',
    });
    expect(policyForWidth(6 * 60 * 60 * 1000)).toEqual({
      bucket: '1m',
      aggregate: 'avg',
      qualityPolicy: 'good_only',
    });
  });

  it('returns 5m / avg / good_only for 6 h < width ≤ 24 h', () => {
    expect(policyForWidth(12 * 60 * 60 * 1000)).toEqual({
      bucket: '5m',
      aggregate: 'avg',
      qualityPolicy: 'good_only',
    });
  });

  it('returns 15m / avg / good_only for widths > 24 h', () => {
    expect(policyForWidth(7 * 24 * 60 * 60 * 1000)).toEqual({
      bucket: '15m',
      aggregate: 'avg',
      qualityPolicy: 'good_only',
    });
  });
});

describe('useOperationsTrendSeries — windowRange override (F4.7.2.1)', () => {
  it('passes explicit from/to from windowRange to the adapter', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    adapterMock.mockResolvedValueOnce(sampleResponse());

    const fromMs = Date.UTC(2026, 4, 29, 9, 5, 0);
    const toMs = Date.UTC(2026, 4, 29, 10, 0, 0);

    const capture: Capture = { current: null };
    renderHookProbe(capture, {
      unitId: HP_001_ID,
      canonicalTagName: 'p_inlet',
      window: '15m',
      windowRange: { fromMs, toMs, pillId: 'official_window' },
      name: 'HP-001',
      color: 'red',
    });

    await waitFor(() => {
      expect(adapterMock).toHaveBeenCalled();
    });
    const [params] = adapterMock.mock.calls[0] as [Record<string, unknown>];
    expect(params.from).toBe(new Date(fromMs).toISOString());
    expect(params.to).toBe(new Date(toMs).toISOString());
    // Width is 55 min → raw mode.
    expect(params.bucket).toBeUndefined();
  });

  it('selects bucketed policy by width when override range is wide', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    adapterMock.mockResolvedValueOnce(sampleResponse());

    const fromMs = Date.UTC(2026, 4, 29, 8, 0, 0);
    const toMs = Date.UTC(2026, 4, 30, 8, 0, 0); // 24 h width

    const capture: Capture = { current: null };
    renderHookProbe(capture, {
      unitId: HP_001_ID,
      canonicalTagName: 'p_inlet',
      window: '15m',
      windowRange: { fromMs, toMs, pillId: 'official_window' },
      name: 'HP-001',
      color: 'red',
    });

    await waitFor(() => {
      expect(adapterMock).toHaveBeenCalled();
    });
    const [params] = adapterMock.mock.calls[0] as [Record<string, unknown>];
    expect(params.bucket).toBe('5m');
    expect(params.aggregate).toBe('avg');
    expect(params.qualityPolicy).toBe('good_only');
  });

  it('cache key includes range:<pillId> + fromMs + toMs under f4-trends prefix', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    adapterMock.mockResolvedValueOnce(sampleResponse());

    const fromMs = Date.UTC(2026, 4, 29, 9, 5, 0);
    const toMs = Date.UTC(2026, 4, 29, 10, 0, 0);

    const capture: Capture = { current: null };
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchInterval: false } },
    });
    const Probe = (): null => {
      capture.current = useOperationsTrendSeries({
        unitId: HP_001_ID,
        canonicalTagName: 'p_inlet',
        window: '15m',
        windowRange: { fromMs, toMs, pillId: 'official_window' },
        name: 'HP-001',
        color: 'red',
      });
      return null;
    };
    render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      const entries = client.getQueryCache().findAll({ queryKey: ['f4-trends'] });
      expect(entries.length).toBeGreaterThan(0);
      const entry = entries[0];
      if (!entry) throw new Error('expected cache entry');
      const key = entry.queryKey;
      expect(key[0]).toBe('f4-trends');
      expect(key[3]).toBe('range:official_window');
      expect(key[key.length - 2]).toBe(fromMs);
      expect(key[key.length - 1]).toBe(toMs);
    });
  });

  it('legacy window enum behavior is unchanged when windowRange is absent', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    adapterMock.mockResolvedValueOnce(sampleResponse());

    const capture: Capture = { current: null };
    renderHookProbe(capture, {
      unitId: HP_001_ID,
      canonicalTagName: 'p_inlet',
      window: '15m',
      name: 'HP-001',
      color: 'red',
    });

    await waitFor(() => {
      expect(adapterMock).toHaveBeenCalled();
    });
    const [params] = adapterMock.mock.calls[0] as [Record<string, unknown>];
    // 15m window → raw mode preserved.
    expect(params.bucket).toBeUndefined();
    expect(params.aggregate).toBeUndefined();
    expect(typeof params.from).toBe('string');
    expect(typeof params.to).toBe('string');
  });
});
