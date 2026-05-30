/**
 * F4.7.2.1 — `useActiveWellTest` tests.
 *
 * Covers:
 *   - `unitId: null` / `unitId: undefined` / `unitId: ''` short-circuit.
 *   - `enabled: false` short-circuit.
 *   - HP-001 mock returns the measuring Fiscalización row.
 *   - LP-001 mock returns `{ active: null }`.
 *   - Non-fixture string returns `null` honestly (no fake mapping).
 *   - Adapter rejection surfaces as `isError`.
 *   - `lastDataAt` populated after data arrives.
 *   - Cache key shape `['f4-active-well-test', unitId]`.
 *   - api mode is exercised through the dual-mode adapter — no UUID-shape
 *     gate, no `isApiSource()` gate; the hook only owns the cache + refetch
 *     plumbing.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useActiveWellTest, type UseActiveWellTestResult } from './useActiveWellTest';

import type { WellTestActiveResponse, WellTestRow } from '@/lib/api/f4';

const ORIGINAL_DATA_SOURCE = process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;

const { adapterMock } = vi.hoisted(() => ({
  adapterMock: vi.fn<(...args: unknown[]) => Promise<WellTestActiveResponse>>(),
}));

vi.mock('@/lib/api-data/f4', () => ({
  adapterGetActiveWellTest: adapterMock,
}));

const HP_001_ID = '00000000-0000-0000-0000-000000004411';
const LP_001_ID = '00000000-0000-0000-0000-000000004412';

const measuringRow = (): WellTestRow => ({
  id: '00000000-0000-0000-0000-000000007001',
  jobId: '00000000-0000-0000-0000-000000003001',
  wellId: '00000000-0000-0000-0000-000000002001',
  unitId: HP_001_ID,
  testType: 'fiscalizacion',
  reportType: 'fiscalizacion_pdf',
  lifecycleStatus: 'measuring',
  plannedOfficialDurationHours: 24,
  actualOfficialDurationSeconds: null,
  connectedAt: '2026-05-29T08:00:00.000Z',
  stabilizationStartedAt: '2026-05-29T08:05:00.000Z',
  stabilizationEndedAt: '2026-05-29T09:05:00.000Z',
  officialStartedAt: '2026-05-29T09:05:00.000Z',
  officialEndedAt: null,
  disconnectedAt: null,
  reportGeneratedAt: null,
  abortedAt: null,
  abortReason: null,
  notes: null,
  clientReference: null,
  createdAt: '2026-05-29T08:00:00.000Z',
  updatedAt: '2026-05-29T09:05:00.000Z',
});

const measuringResponse = (): WellTestActiveResponse => ({
  generatedAt: '2026-05-29T10:00:00.000Z',
  source: 'well_tests',
  active: measuringRow(),
});

const emptyResponse = (): WellTestActiveResponse => ({
  generatedAt: '2026-05-29T10:00:00.000Z',
  source: 'well_tests',
  active: null,
});

interface Capture {
  current: UseActiveWellTestResult | null;
}

const renderHook = (props: { unitId: string | null | undefined; enabled?: boolean }) => {
  const capture: Capture = { current: null };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  });
  const Probe = (componentProps: typeof props): null => {
    capture.current = useActiveWellTest({
      unitId: componentProps.unitId,
      enabled: componentProps.enabled,
    });
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

describe('useActiveWellTest — disabled paths', () => {
  it('disables when unitId is null', () => {
    const { capture } = renderHook({ unitId: null });
    expect(capture.current?.enabled).toBe(false);
    expect(capture.current?.active).toBeNull();
    expect(adapterMock).not.toHaveBeenCalled();
  });

  it('disables when unitId is undefined', () => {
    const { capture } = renderHook({ unitId: undefined });
    expect(capture.current?.enabled).toBe(false);
    expect(adapterMock).not.toHaveBeenCalled();
  });

  it('disables when unitId is empty string', () => {
    const { capture } = renderHook({ unitId: '' });
    expect(capture.current?.enabled).toBe(false);
    expect(adapterMock).not.toHaveBeenCalled();
  });

  it('disables when forceEnabled is false', () => {
    const { capture } = renderHook({ unitId: HP_001_ID, enabled: false });
    expect(capture.current?.enabled).toBe(false);
    expect(adapterMock).not.toHaveBeenCalled();
  });
});

describe('useActiveWellTest — mock mode (default)', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
  });

  it('returns the measuring WellTest for HP-001 mock', async () => {
    adapterMock.mockResolvedValueOnce(measuringResponse());
    const { capture } = renderHook({ unitId: HP_001_ID });

    await waitFor(() => {
      expect(capture.current?.isLoading).toBe(false);
    });

    expect(adapterMock).toHaveBeenCalledWith(
      expect.objectContaining({ unitId: HP_001_ID }),
      expect.anything(),
    );
    expect(capture.current?.active?.lifecycleStatus).toBe('measuring');
    expect(capture.current?.active?.officialStartedAt).toBe('2026-05-29T09:05:00.000Z');
    expect(capture.current?.source).toBe('mock');
  });

  it('returns null for LP-001 (empty fixture)', async () => {
    adapterMock.mockResolvedValueOnce(emptyResponse());
    const { capture } = renderHook({ unitId: LP_001_ID });

    await waitFor(() => {
      expect(capture.current?.isLoading).toBe(false);
    });
    expect(capture.current?.active).toBeNull();
    expect(capture.current?.response?.active).toBeNull();
  });

  it('returns null for a non-fixture simulator string (no fake mapping)', async () => {
    adapterMock.mockResolvedValueOnce(emptyResponse());
    const { capture } = renderHook({ unitId: 'EMMAD-02' });

    await waitFor(() => {
      expect(capture.current?.isLoading).toBe(false);
    });
    expect(adapterMock).toHaveBeenCalledWith(
      expect.objectContaining({ unitId: 'EMMAD-02' }),
      expect.anything(),
    );
    expect(capture.current?.active).toBeNull();
  });
});

describe('useActiveWellTest — api mode', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
  });

  it('calls the adapter with the unitId (no UUID-shape gate in the hook)', async () => {
    adapterMock.mockResolvedValueOnce(measuringResponse());
    const { capture } = renderHook({ unitId: HP_001_ID });

    await waitFor(() => {
      expect(capture.current?.isLoading).toBe(false);
    });

    expect(adapterMock).toHaveBeenCalledWith(
      expect.objectContaining({ unitId: HP_001_ID }),
      expect.anything(),
    );
    expect(capture.current?.source).toBe('api');
  });

  it('surfaces adapter rejection as isError', async () => {
    adapterMock.mockRejectedValueOnce(new Error('boom'));
    const { capture } = renderHook({ unitId: HP_001_ID });

    await waitFor(() => {
      expect(capture.current?.isError).toBe(true);
    });
    expect(capture.current?.error?.message).toBe('boom');
  });

  it('populates lastDataAt after data arrives', async () => {
    adapterMock.mockResolvedValueOnce(measuringResponse());
    const { capture } = renderHook({ unitId: HP_001_ID });

    await waitFor(() => {
      expect(capture.current?.lastDataAt).not.toBeNull();
    });
  });
});

describe('useActiveWellTest — cache key', () => {
  it('uses ["f4-active-well-test", unitId]', async () => {
    adapterMock.mockResolvedValueOnce(measuringResponse());
    const { queryClient } = renderHook({ unitId: HP_001_ID });

    await waitFor(() => {
      const entries = queryClient.getQueryCache().findAll({ queryKey: ['f4-active-well-test'] });
      expect(entries.length).toBeGreaterThan(0);
      const cached = entries[0];
      expect(cached?.queryKey).toEqual(['f4-active-well-test', HP_001_ID]);
    });
  });
});
