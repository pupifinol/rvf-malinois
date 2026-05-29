/**
 * F4.5G.1 + F4.5G.2.2.2 — `<TrendDrawer>` tests.
 *
 * Covers:
 *   - Closed-by-default render returns nothing.
 *   - Open render mounts portal-side dialog.
 *   - Range pills update the queried window.
 *   - Close via button / ESC / backdrop.
 *   - Loading / error / empty states render their indicators.
 *   - F4.5G.2.2.2: F2 history-buffer fallback renders chart when trend
 *     adapter is empty in mock mode or for unresolved backend bindings.
 */
import { brand } from '@rvf/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TrendDrawer } from './TrendDrawer';

import type { TelemetryTrendsResponse } from '@/lib/api/f4';
import type { TelemetryReading } from '@/lib/telemetry/models';
import type { CanonicalTag, JobId } from '@rvf/types';

const ORIGINAL_DATA_SOURCE = process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;

const { adapterMock, useHistoryBufferMock } = vi.hoisted(() => ({
  adapterMock: vi.fn<(...args: unknown[]) => Promise<TelemetryTrendsResponse>>(),
  useHistoryBufferMock: vi.fn<(jobId: unknown, tag: unknown) => readonly TelemetryReading[]>(
    () => [],
  ),
}));

vi.mock('@/lib/api-data/f4', () => ({
  adapterGetTelemetryTrends: adapterMock,
}));

vi.mock('@/lib/hooks/useHistoryBuffer', () => ({
  useHistoryBuffer: useHistoryBufferMock,
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
  useHistoryBufferMock.mockReset();
  useHistoryBufferMock.mockReturnValue([]);
});

afterEach(() => {
  process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = ORIGINAL_DATA_SOURCE;
});

// ---------------------------------------------------------------------------
// F4.5G.2.2.2 — F2 history-buffer fallback
// ---------------------------------------------------------------------------

const FALLBACK_JOB_ID = brand<string, 'JobId'>('JOB-TEST-001') as JobId;
const FALLBACK_TAG = brand<string, 'CanonicalTag'>('t_inlet') as CanonicalTag;

const emptyTrend = (): TelemetryTrendsResponse => ({
  unitId: HP_001_ID,
  canonicalTag: TAG,
  range: { from: '2026-05-24T00:00:00.000Z', to: '2026-05-24T01:00:00.000Z' },
  points: [],
});

const makeReading = (ts: string, value: number | null): TelemetryReading => ({
  ts,
  jobId: FALLBACK_JOB_ID,
  tag: FALLBACK_TAG,
  value,
  unit: 'psi',
  quality: value === null ? 'bad' : 'good',
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

// History generators rooted at the real `Date.now()` so the window filter
// (F4.5G.2.2.2) treats them as recent. The simulator's F2 ring buffer is
// always "recent at runtime", so we mirror that here rather than freezing
// a 2026-05-29 wall clock that drifts away from the test runner's idea of
// "now". `vi.useFakeTimers` is avoided — TanStack Query's microtask /
// setTimeout-based mounting times out under it.

const nowRelative = (msAgo: number, value: number | null = 3800) =>
  makeReading(new Date(Date.now() - msAgo).toISOString(), value);

describe('TrendDrawer — F2 history-buffer fallback (F4.5G.2.2.2)', () => {
  it('mock mode + empty trend + non-empty history → renders chart, chip says "Simulator history"', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    adapterMock.mockResolvedValue(emptyTrend());
    useHistoryBufferMock.mockReturnValue([
      nowRelative(2 * 60_000, 3800),
      nowRelative(1 * 60_000, 3810),
      nowRelative(0, 3820),
    ]);
    renderDrawer({ fallbackJobId: FALLBACK_JOB_ID, fallbackTag: FALLBACK_TAG });
    await screen.findByRole('dialog');

    expect(screen.queryByTestId('trend-drawer-empty')).toBeNull();
    const source = await screen.findByTestId('trend-drawer-source');
    expect(source.textContent).toBe('Simulator history');
  });

  it('mock mode + empty trend + empty history → empty state stays honest', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    adapterMock.mockResolvedValue(emptyTrend());
    useHistoryBufferMock.mockReturnValue([]);
    renderDrawer({ fallbackJobId: FALLBACK_JOB_ID, fallbackTag: FALLBACK_TAG });
    await screen.findByRole('dialog');

    await screen.findByTestId('trend-drawer-empty');
  });

  it('mock mode + non-empty trend → trend wins, fallback ignored, chip says "Mock fixture"', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    adapterMock.mockResolvedValue(sampleResponse());
    useHistoryBufferMock.mockReturnValue([nowRelative(0, 9999)]);
    renderDrawer({ fallbackJobId: FALLBACK_JOB_ID, fallbackTag: FALLBACK_TAG });
    await screen.findByRole('dialog');

    expect(screen.queryByTestId('trend-drawer-empty')).toBeNull();
    const source = await screen.findByTestId('trend-drawer-source');
    expect(source.textContent).toBe('Mock fixture');
  });

  it('api mode + hasBackendMatch=true + empty trend → empty state (no fallback to history)', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    adapterMock.mockResolvedValue(emptyTrend());
    useHistoryBufferMock.mockReturnValue([nowRelative(0, 3800)]);
    renderDrawer({
      fallbackJobId: FALLBACK_JOB_ID,
      fallbackTag: FALLBACK_TAG,
      hasBackendMatch: true,
    });
    await screen.findByRole('dialog');

    await screen.findByTestId('trend-drawer-empty');
    const source = await screen.findByTestId('trend-drawer-source');
    expect(source.textContent).toBe('Live backend');
  });

  it('api mode + hasBackendMatch=false + empty trend + non-empty history → fallback renders', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    adapterMock.mockResolvedValue(emptyTrend());
    useHistoryBufferMock.mockReturnValue([nowRelative(60_000, 3800), nowRelative(0, 3810)]);
    renderDrawer({
      fallbackJobId: FALLBACK_JOB_ID,
      fallbackTag: FALLBACK_TAG,
      hasBackendMatch: false,
    });
    await screen.findByRole('dialog');

    expect(screen.queryByTestId('trend-drawer-empty')).toBeNull();
    const source = await screen.findByTestId('trend-drawer-source');
    expect(source.textContent).toBe('Simulator history');
  });

  it('no fallback identity (existing F4.5G.1 callers) → behavior unchanged on empty trend', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    adapterMock.mockResolvedValue(emptyTrend());
    useHistoryBufferMock.mockReturnValue([nowRelative(0, 3800)]);
    renderDrawer();
    await screen.findByRole('dialog');

    // No fallbackJobId / fallbackTag ⇒ fallback ineligible. Existing empty
    // state remains.
    await screen.findByTestId('trend-drawer-empty');
  });
});

// ---------------------------------------------------------------------------
// F4.5G.2.2.2 — window-aware fallback + summary stats
// ---------------------------------------------------------------------------

describe('TrendDrawer — window-aware fallback (F4.5G.2.2.2)', () => {
  // History generators rooted at `Date.now()` so the window filter sees the
  // readings as recent. See header comment above.

  // 7 readings one minute apart, ending at `now` → buffer spans ~6 min.
  const sevenMinuteHistory = () =>
    Array.from({ length: 7 }, (_, i) => nowRelative((6 - i) * 60_000, 3800 + i * 5));

  // 10 readings ten minutes apart, ending at `now - 1 min`. The 1-minute
  // offset shifts every reading off the round-minute window edges (15m, 60m,
  // 6h) so a few-millisecond clock drift between the reading-construction
  // `Date.now()` and the drawer's filter `Date.now()` cannot bump a boundary
  // reading across the edge.
  const ninetyMinuteHistory = () =>
    Array.from({ length: 10 }, (_, i) => nowRelative((9 - i) * 10 * 60_000 + 60_000, 3800 + i * 5));

  it('range pills filter the fallback series by window edge', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    adapterMock.mockResolvedValue(emptyTrend());
    useHistoryBufferMock.mockReturnValue(ninetyMinuteHistory());
    renderDrawer({
      fallbackJobId: FALLBACK_JOB_ID,
      fallbackTag: FALLBACK_TAG,
      defaultWindow: '1h',
    });
    await screen.findByRole('dialog');

    // Default window is 1h → readings older than 60 min are filtered out.
    // Offsets are 91, 81, 71, 61, 51, 41, 31, 21, 11, 1 min ago → 6 readings
    // inside 1 h (51, 41, 31, 21, 11, 1).
    const count1h = (await screen.findByTestId('trend-drawer-stat-count')).textContent;
    expect(count1h).toBe('6');

    // Switch to 15m → only readings ≤ 15 min old remain (11, 1 min ago).
    act(() => {
      screen.getByTestId('trend-drawer-range-15m').click();
    });
    const count15m = screen.getByTestId('trend-drawer-stat-count').textContent;
    expect(count15m).toBe('2');
    expect(count15m).not.toBe(count1h);

    // Switch to 6h → all 10 readings included.
    act(() => {
      screen.getByTestId('trend-drawer-range-6h').click();
    });
    expect(screen.getByTestId('trend-drawer-stat-count').textContent).toBe('10');
  });

  it('shows "Simulator buffer shorter than selected range" caveat when range exceeds buffer', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    adapterMock.mockResolvedValue(emptyTrend());
    useHistoryBufferMock.mockReturnValue(sevenMinuteHistory());
    renderDrawer({
      fallbackJobId: FALLBACK_JOB_ID,
      fallbackTag: FALLBACK_TAG,
      defaultWindow: '1h',
    });
    await screen.findByRole('dialog');

    // 7-min buffer at 1h selected → buffer does not cover the window.
    const short = await screen.findByTestId('trend-drawer-short-buffer');
    expect(short.textContent ?? '').toMatch(/shorter than selected range/i);
  });

  it('omits the short-buffer caveat when buffer covers the selected window', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    adapterMock.mockResolvedValue(emptyTrend());
    // Buffer that starts 20 min ago — covers a 15m window.
    const longerHistory = Array.from({ length: 21 }, (_, i) =>
      nowRelative((20 - i) * 60_000, 3800 + i),
    );
    useHistoryBufferMock.mockReturnValue(longerHistory);
    renderDrawer({
      fallbackJobId: FALLBACK_JOB_ID,
      fallbackTag: FALLBACK_TAG,
      defaultWindow: '15m',
    });
    await screen.findByRole('dialog');

    expect(screen.queryByTestId('trend-drawer-short-buffer')).toBeNull();
  });

  it('renders summary stats (count / min / max / avg) for the rendered series', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    adapterMock.mockResolvedValue(emptyTrend());
    useHistoryBufferMock.mockReturnValue(sevenMinuteHistory()); // values 3800..3830
    renderDrawer({
      fallbackJobId: FALLBACK_JOB_ID,
      fallbackTag: FALLBACK_TAG,
      defaultWindow: '1h',
    });
    await screen.findByRole('dialog');

    expect((await screen.findByTestId('trend-drawer-stat-count')).textContent).toBe('7');
    expect(screen.getByTestId('trend-drawer-stat-min').textContent).toBe('3,800');
    expect(screen.getByTestId('trend-drawer-stat-max').textContent).toBe('3,830');
    expect(screen.getByTestId('trend-drawer-stat-avg').textContent).toBe('3,815');
  });

  it('empty state remains when fallback history is empty (no false positives)', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    adapterMock.mockResolvedValue(emptyTrend());
    useHistoryBufferMock.mockReturnValue([]);
    renderDrawer({
      fallbackJobId: FALLBACK_JOB_ID,
      fallbackTag: FALLBACK_TAG,
      defaultWindow: '15m',
    });
    await screen.findByRole('dialog');

    await screen.findByTestId('trend-drawer-empty');
    expect(screen.queryByTestId('trend-drawer-stats')).toBeNull();
  });

  it('api + resolved + non-empty trend: stats reflect trend response, no fallback caveat', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    adapterMock.mockResolvedValue(sampleResponse()); // two points: 3800, 3810.5
    useHistoryBufferMock.mockReturnValue([]);
    renderDrawer({
      fallbackJobId: FALLBACK_JOB_ID,
      fallbackTag: FALLBACK_TAG,
      hasBackendMatch: true,
    });
    await screen.findByRole('dialog');

    expect((await screen.findByTestId('trend-drawer-stat-count')).textContent).toBe('2');
    expect(screen.getByTestId('trend-drawer-stat-min').textContent).toBe('3,800');
    expect(screen.getByTestId('trend-drawer-stat-max').textContent).toBe('3,811');
    expect(screen.queryByTestId('trend-drawer-short-buffer')).toBeNull();
  });
});
