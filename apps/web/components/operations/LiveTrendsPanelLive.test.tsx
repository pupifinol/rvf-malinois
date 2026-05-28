/**
 * F4.5G.1 — `<LiveTrendsPanelLive>` tests.
 *
 * Covers:
 *   - Mock mode: simulator path drives the chart (no fetch issued).
 *   - API mode: backend adapter is called for each (unit, tag) pair and the
 *     header subtitle reflects the active source.
 *   - Click-to-open: a TrendCard is button-shaped and opens the drawer.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LiveTrendsPanelLive } from './LiveTrendsPanelLive';

import type { TelemetryTrendsResponse } from '@/lib/api/f4';

const ORIGINAL_DATA_SOURCE = process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;

const { adapterMock } = vi.hoisted(() => ({
  adapterMock: vi.fn<(...args: unknown[]) => Promise<TelemetryTrendsResponse>>(),
}));

vi.mock('@/lib/api-data/f4', () => ({
  adapterGetTelemetryTrends: adapterMock,
}));

const TAG = {
  id: 'tag-1',
  name: 'p_inlet',
  displayName: 'Inlet pressure',
  canonicalUnit: 'psi',
  category: 'pressure',
  precision: 1,
};

const sampleResponse = (): TelemetryTrendsResponse => ({
  unitId: 'EMMAD-01',
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
  ],
});

const renderPanel = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LiveTrendsPanelLive />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  adapterMock.mockReset();
  adapterMock.mockResolvedValue(sampleResponse());
});

afterEach(() => {
  process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = ORIGINAL_DATA_SOURCE;
});

describe('LiveTrendsPanelLive — mock mode (default)', () => {
  it('renders the panel header with the simulator subtitle', () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    renderPanel();
    const section = screen.getByLabelText('Live trends');
    expect(within(section).getByText(/Last ~60 samples/)).toBeInTheDocument();
    expect(within(section).getByText(/F2 simulated normalized stream/)).toBeInTheDocument();
  });

  it('does NOT call the backend adapter in mock mode', () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    renderPanel();
    expect(adapterMock).not.toHaveBeenCalled();
  });
});

describe('LiveTrendsPanelLive — api mode', () => {
  it('updates the header subtitle to the backend label', () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    renderPanel();
    const section = screen.getByLabelText('Live trends');
    expect(within(section).getByText(/F4\.6F\.1 backend trends/)).toBeInTheDocument();
    expect(within(section).getByText(/Live ~15m window/)).toBeInTheDocument();
  });

  it('calls the backend adapter for each unique (unit, tag) pair', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    renderPanel();
    await screen.findByLabelText('Live trends');
    // OPERATIONS_JOBS has two unique unitIds (EMMAD-01 + EMMAD-02) and two
    // tags (p_inlet + q_liquid) — TanStack Query dedupes the duplicate
    // (EMMAD-02) cache keys to one fetch per (unit, tag) pair.
    expect(adapterMock.mock.calls.length).toBeGreaterThanOrEqual(4);
    const tags = new Set(
      adapterMock.mock.calls.map((c) => (c[0] as { canonicalTagName: string }).canonicalTagName),
    );
    expect(tags.has('p_inlet')).toBe(true);
    expect(tags.has('q_liquid')).toBe(true);
  });
});

describe('LiveTrendsPanelLive — click to expand', () => {
  it('clicking the Inlet Pressure card opens the drawer with that title', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    renderPanel();

    const card = screen.getByTestId('trend-card-inlet-pressure');
    fireEvent.click(card);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-label', expect.stringContaining('Inlet Pressure'));
  });

  it('clicking the Liquid Flow card opens the drawer with that title', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    renderPanel();

    const card = screen.getByTestId('trend-card-liquid-flow');
    fireEvent.click(card);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-label', expect.stringContaining('Liquid Flow'));
  });
});
