/**
 * F4.5G.1 — `<TrendDrawer>` tests.
 *
 * Covers:
 *   - Closed-by-default render returns nothing.
 *   - Open render mounts portal-side dialog.
 *   - Range pills update the queried window.
 *   - Close via button / ESC / backdrop.
 *   - Loading / error / empty states render their indicators.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TrendDrawer } from './TrendDrawer';

import type { TelemetryTrendsResponse } from '@/lib/api/f4';

const ORIGINAL_DATA_SOURCE = process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;

const { adapterMock } = vi.hoisted(() => ({
  adapterMock: vi.fn<(...args: unknown[]) => Promise<TelemetryTrendsResponse>>(),
}));

vi.mock('@/lib/api-data/f4', () => ({
  adapterGetTelemetryTrends: adapterMock,
}));

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
  range: { from: '2026-05-24T00:00:00.000Z', to: '2026-05-24T01:00:00.000Z' },
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

const bucketedResponse = (): TelemetryTrendsResponse => ({
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

const renderDrawer = (props: Partial<React.ComponentProps<typeof TrendDrawer>> = {}) => {
  const onClose = props.onClose ?? vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  });
  return {
    onClose,
    ...render(
      <QueryClientProvider client={client}>
        <TrendDrawer
          open
          onClose={onClose}
          unitId={HP_001_ID}
          canonicalTagName="p_inlet"
          title="Inlet Pressure"
          unitLabel="psi"
          {...props}
        />
      </QueryClientProvider>,
    ),
  };
};

beforeEach(() => {
  adapterMock.mockReset();
});

afterEach(() => {
  process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = ORIGINAL_DATA_SOURCE;
});

describe('TrendDrawer — open / close', () => {
  it('renders nothing when open=false', () => {
    adapterMock.mockResolvedValueOnce(sampleResponse());
    const { container } = renderDrawer({ open: false });
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog content when open=true', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    adapterMock.mockResolvedValue(sampleResponse());
    renderDrawer();

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-label', expect.stringContaining('Inlet Pressure'));
  });

  it('close button calls onClose', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    adapterMock.mockResolvedValue(sampleResponse());
    const { onClose } = renderDrawer();
    await screen.findByRole('dialog');

    const closeBtn = screen.getByTestId('trend-drawer-close');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop click calls onClose', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    adapterMock.mockResolvedValue(sampleResponse());
    const { onClose } = renderDrawer();
    await screen.findByRole('dialog');

    const backdrop = screen.getByTestId('trend-drawer-backdrop');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape key calls onClose', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    adapterMock.mockResolvedValue(sampleResponse());
    const { onClose } = renderDrawer();
    await screen.findByRole('dialog');

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('TrendDrawer — range pills', () => {
  it('clicking 6h re-fetches with bucketed params', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    adapterMock.mockResolvedValue(sampleResponse());
    renderDrawer({ defaultWindow: '1h' });
    await screen.findByRole('dialog');

    // First call corresponds to the 1h default.
    expect(adapterMock).toHaveBeenCalledTimes(1);
    const firstParams = adapterMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstParams.bucket).toBeUndefined();

    adapterMock.mockResolvedValue(bucketedResponse());

    const pill6h = screen.getByTestId('trend-drawer-range-6h');
    fireEvent.click(pill6h);

    // Wait for the new fetch.
    await screen.findByRole('dialog');
    expect(adapterMock).toHaveBeenCalledTimes(2);
    const secondParams = adapterMock.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(secondParams.bucket).toBe('1m');
    expect(secondParams.aggregate).toBe('avg');
    expect(secondParams.qualityPolicy).toBe('good_only');
  });
});

describe('TrendDrawer — states', () => {
  it('renders empty state when adapter returns no points', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    adapterMock.mockResolvedValue({
      unitId: HP_001_ID,
      canonicalTag: TAG,
      range: { from: '2026-05-24T00:00:00.000Z', to: '2026-05-24T01:00:00.000Z' },
      points: [],
    });
    renderDrawer();
    await screen.findByRole('dialog');

    await screen.findByTestId('trend-drawer-empty');
  });

  it('renders error state when adapter rejects', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    adapterMock.mockRejectedValue(new Error('boom'));
    renderDrawer();
    await screen.findByRole('dialog');

    await screen.findByTestId('trend-drawer-error');
  });

  it('labels the source as Mock fixture in mock mode', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    adapterMock.mockResolvedValue(sampleResponse());
    renderDrawer();
    await screen.findByRole('dialog');

    const source = await screen.findByTestId('trend-drawer-source');
    expect(source.textContent).toBe('Mock fixture');
  });

  it('labels the source as Live backend in api mode', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    adapterMock.mockResolvedValue(sampleResponse());
    renderDrawer();
    await screen.findByRole('dialog');

    const source = await screen.findByTestId('trend-drawer-source');
    expect(source.textContent).toBe('Live backend');
  });
});
