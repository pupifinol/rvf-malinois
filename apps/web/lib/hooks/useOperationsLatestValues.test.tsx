/**
 * F4.5G.2.2.1 — `useOperationsLatestValues` tests.
 *
 * Covers:
 *   - mock mode (default NEXT_PUBLIC_RVF_DATA_SOURCE unset) → disabled.
 *   - api mode + UUID `unitId` → calls adapter; returns `valuesByTagName`.
 *   - api mode + non-UUID `unitId` → disabled, no fetch.
 *   - `unitId: null` → disabled, no fetch.
 *   - empty response → empty `valuesByTagName`.
 *   - error surfaces as `isError`.
 *   - `lastDataAt` populated after data arrives.
 *   - cache key shape (`['f4-latest', unitId]`).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useOperationsLatestValues,
  type UseOperationsLatestValuesResult,
} from './useOperationsLatestValues';

import type { TelemetryLatestResponse } from '@/lib/api/f4';

const ORIGINAL_DATA_SOURCE = process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;

const { adapterMock } = vi.hoisted(() => ({
  adapterMock: vi.fn<(...args: unknown[]) => Promise<TelemetryLatestResponse>>(),
}));

vi.mock('@/lib/api-data/f4', () => ({
  adapterGetTelemetryLatest: adapterMock,
}));

const HP_001_ID = '00000000-0000-0000-0000-000000004411';

const sampleResponse = (): TelemetryLatestResponse => ({
  unitId: HP_001_ID,
  generatedAt: '2026-05-28T14:00:00.000Z',
  source: 'live_readings',
  values: [
    {
      sensorId: '00000000-0000-0000-0000-000000005551',
      canonicalTag: {
        id: '00000000-0000-0000-0000-0000000044f1',
        name: 'p_inlet',
        displayName: 'Inlet pressure',
        canonicalUnit: 'psi',
        category: 'pressure',
        precision: 1,
      },
      value: '3812.4',
      engineeringUnit: 'psi',
      quality: 'good',
      timestamp: '2026-05-28T13:59:00.000Z',
      ingestionTimestamp: '2026-05-28T13:59:00.500Z',
      source: 'mqtt',
      latestTelemetryReadingId: '00000000-0000-0000-0000-000000006661',
    },
    {
      sensorId: '00000000-0000-0000-0000-000000005552',
      canonicalTag: {
        id: '00000000-0000-0000-0000-0000000044f2',
        name: 'q_gas',
        displayName: 'Total gas flow rate',
        canonicalUnit: 'MMSCFD',
        category: 'flow',
        precision: 3,
      },
      value: '3.012',
      engineeringUnit: 'MMSCFD',
      quality: 'good',
      timestamp: '2026-05-28T13:59:00.000Z',
      ingestionTimestamp: '2026-05-28T13:59:00.500Z',
      source: 'mqtt',
      latestTelemetryReadingId: '00000000-0000-0000-0000-000000006662',
    },
  ],
});

interface Capture {
  current: UseOperationsLatestValuesResult | null;
}

const renderHook = (props: { unitId: string | null }) => {
  const capture: Capture = { current: null };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  });
  const Probe = (componentProps: { unitId: string | null }): null => {
    capture.current = useOperationsLatestValues({ unitId: componentProps.unitId });
    return null;
  };
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <Probe {...props} />
    </QueryClientProvider>,
  );
  return { capture, queryClient, ...utils };
};

beforeEach(() => {
  adapterMock.mockReset();
});

afterEach(() => {
  process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = ORIGINAL_DATA_SOURCE;
});

describe('useOperationsLatestValues — mock mode (default)', () => {
  it('stays disabled, returns empty map, never calls the adapter', () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    const { capture } = renderHook({ unitId: HP_001_ID });
    expect(capture.current?.enabled).toBe(false);
    expect(capture.current?.valuesByTagName.size).toBe(0);
    expect(adapterMock).not.toHaveBeenCalled();
  });
});

describe('useOperationsLatestValues — api mode', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
  });

  it('disables when unitId is null', () => {
    const { capture } = renderHook({ unitId: null });
    expect(capture.current?.enabled).toBe(false);
    expect(adapterMock).not.toHaveBeenCalled();
  });

  it('disables when unitId is non-UUID', () => {
    const { capture } = renderHook({ unitId: 'EMMAD-01' });
    expect(capture.current?.enabled).toBe(false);
    expect(adapterMock).not.toHaveBeenCalled();
  });

  it('calls adapter with UUID unitId and maps rows to valuesByTagName', async () => {
    adapterMock.mockResolvedValueOnce(sampleResponse());
    const { capture } = renderHook({ unitId: HP_001_ID });

    await waitFor(() => {
      expect(capture.current?.isLoading).toBe(false);
    });

    expect(adapterMock).toHaveBeenCalledWith(
      expect.objectContaining({ unitId: HP_001_ID }),
      expect.anything(),
    );
    expect(capture.current?.valuesByTagName.size).toBe(2);
    expect(capture.current?.valuesByTagName.get('p_inlet')?.value).toBe('3812.4');
    expect(capture.current?.valuesByTagName.get('q_gas')?.value).toBe('3.012');
  });

  it('returns empty valuesByTagName when response.values is []', async () => {
    adapterMock.mockResolvedValueOnce({
      unitId: HP_001_ID,
      generatedAt: '2026-05-28T14:00:00.000Z',
      source: 'live_readings',
      values: [],
    });
    const { capture } = renderHook({ unitId: HP_001_ID });

    await waitFor(() => {
      expect(capture.current?.isLoading).toBe(false);
    });
    expect(capture.current?.valuesByTagName.size).toBe(0);
    expect(capture.current?.response?.values).toEqual([]);
  });

  it('surfaces adapter rejection as isError', async () => {
    adapterMock.mockRejectedValueOnce(new Error('boom'));
    const { capture } = renderHook({ unitId: HP_001_ID });

    await waitFor(() => {
      expect(capture.current?.isError).toBe(true);
    });
    expect(capture.current?.error?.message).toBe('boom');
  });

  it('populates lastDataAt once data arrives', async () => {
    adapterMock.mockResolvedValueOnce(sampleResponse());
    const { capture } = renderHook({ unitId: HP_001_ID });

    await waitFor(() => {
      expect(capture.current?.lastDataAt).not.toBeNull();
    });
  });

  it('cache key uses ["f4-latest", unitId]', async () => {
    adapterMock.mockResolvedValueOnce(sampleResponse());
    const { queryClient } = renderHook({ unitId: HP_001_ID });

    await waitFor(() => {
      const entries = queryClient.getQueryCache().findAll({ queryKey: ['f4-latest'] });
      expect(entries.length).toBeGreaterThan(0);
      const cached = entries[0];
      expect(cached?.queryKey).toEqual(['f4-latest', HP_001_ID]);
    });
  });
});
