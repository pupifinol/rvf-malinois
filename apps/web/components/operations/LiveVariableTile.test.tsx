/**
 * F4.5G.2.2.1 — `<LiveVariableTile>` cutover tests.
 *
 * Mocks the F2 substrate hooks + the new api-mode hooks so the tile's
 * branch behavior can be asserted deterministically. Sparkline + alarm-shell
 * + status-label behavior remains the existing F2 path; F4.5G.2.2.1's new
 * surface area is the primary value resolution and the source chip.
 */
import { brand } from '@rvf/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LiveVariableTile } from './LiveVariableTile';
import { OPERATIONS_TILES } from './viewModel';

import type { TelemetryLatestValue } from '@/lib/api/f4';
import type * as HooksModule from '@/lib/hooks';
import type { CommissioningSnapshot } from '@/lib/jobs/types';
import type { JobId } from '@rvf/types';

type OperationsRealtimeConnection = HooksModule.OperationsRealtimeConnection;
type SlotLiveValue = HooksModule.SlotLiveValue;
type UseOperationsLatestValuesResult = HooksModule.UseOperationsLatestValuesResult;

const HP_001_ID = '00000000-0000-0000-0000-000000004411';
const P_INLET_ID = '00000000-0000-0000-0000-0000000044f1';

// --- F2 substrate mocks -----------------------------------------------------
//
// We mock the entire @/lib/hooks barrel so the tile's F2 calls
// (useLiveValue / useAlarmState / useHistoryBuffer / useNowTick) return
// stable stubs without booting the simulator.

const {
  useLiveValueMock,
  useAlarmStateMock,
  useHistoryBufferMock,
  useNowTickMock,
  drawerOpenMock,
} = vi.hoisted(() => ({
  useLiveValueMock: vi.fn(),
  useAlarmStateMock: vi.fn(),
  useHistoryBufferMock: vi.fn(),
  useNowTickMock: vi.fn(),
  drawerOpenMock: vi.fn(),
}));

vi.mock('./OperationsTrendDrawer', () => ({
  useOperationsTrendDrawer: () => ({ open: drawerOpenMock, close: vi.fn() }),
}));

vi.mock('@/lib/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof HooksModule>();
  return {
    ...actual,
    useLiveValue: useLiveValueMock,
    useAlarmState: useAlarmStateMock,
    useHistoryBuffer: useHistoryBufferMock,
    useNowTick: useNowTickMock,
  };
});

const tile = OPERATIONS_TILES.find((t) => t.id === 'p_inlet');
if (!tile) throw new Error('test fixture: p_inlet tile must exist');

const jobId = brand<string, 'JobId'>('JOB-TEST-001') as JobId;
const snapshot = {} as CommissioningSnapshot;

const sampleRestRow = (overrides: Partial<TelemetryLatestValue> = {}): TelemetryLatestValue => ({
  sensorId: '00000000-0000-0000-0000-000000005551',
  canonicalTag: {
    id: P_INLET_ID,
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
  ...overrides,
});

const baseLatest = (
  overrides: Partial<UseOperationsLatestValuesResult> = {},
): UseOperationsLatestValuesResult => ({
  valuesByTagName: overrides.valuesByTagName ?? new Map(),
  isLoading: overrides.isLoading ?? false,
  isError: overrides.isError ?? false,
  error: overrides.error ?? null,
  lastDataAt: overrides.lastDataAt ?? null,
  response: overrides.response,
  source: overrides.source ?? 'api',
  enabled: overrides.enabled ?? true,
});

const baseConn = (
  kind: OperationsRealtimeConnection['kind'] = 'connected',
): OperationsRealtimeConnection => {
  switch (kind) {
    case 'connected':
      return { kind: 'connected', since: '2026-05-28T13:00:00.000Z' };
    case 'connecting':
      return { kind: 'connecting' };
    case 'reconnecting':
      return { kind: 'reconnecting', attempt: 1, lastDataAt: null };
    case 'disconnected':
      return { kind: 'disconnected', lastDataAt: null };
    case 'disabled':
    default:
      return { kind: 'disabled' };
  }
};

const renderTile = (props: Partial<React.ComponentProps<typeof LiveVariableTile>> = {}) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LiveVariableTile jobId={jobId} snapshot={snapshot} tile={tile} {...props} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  useLiveValueMock.mockReturnValue({ value: 3500, unit: 'psi', status: 'live' });
  useAlarmStateMock.mockReturnValue({ state: 'normal' });
  useHistoryBufferMock.mockReturnValue([]);
  useNowTickMock.mockReturnValue(Date.parse('2026-05-28T14:00:00.000Z'));
});

afterEach(() => {
  vi.clearAllMocks();
});

// --- Mock / non-api branches ------------------------------------------------

describe('LiveVariableTile — mock / unresolved branches', () => {
  it('mock mode (no backend wiring): renders F2 value with "Mock fixture" chip', () => {
    renderTile();
    expect(screen.getByText('3,500')).toBeInTheDocument();
    expect(screen.getByTestId('tile-source-p_inlet').textContent).toBe('Mock fixture');
  });

  it('api mode with backendUnitId === null: F2 value + "No backend unit match" chip', () => {
    renderTile({ backendUnitId: null });
    expect(screen.getByText('3,500')).toBeInTheDocument();
    expect(screen.getByTestId('tile-source-p_inlet').textContent).toBe('No backend unit match');
  });
});

// --- API + resolved branches -----------------------------------------------

describe('LiveVariableTile — api-mode + resolved branch', () => {
  it('renders REST value as primary; chip reads "Live backend" when connected', () => {
    const valuesByTagName = new Map<string, TelemetryLatestValue>([['p_inlet', sampleRestRow()]]);
    renderTile({
      backendUnitId: HP_001_ID,
      latestValues: baseLatest({ valuesByTagName }),
      realtimeConnection: baseConn('connected'),
      realtimeGetSlotValue: () => undefined,
    });
    expect(screen.getByText('3,812')).toBeInTheDocument();
    expect(screen.getByTestId('tile-source-p_inlet').textContent).toBe('Live backend');
  });

  it('shows "Loading…" chip while the latest hook is loading', () => {
    renderTile({
      backendUnitId: HP_001_ID,
      latestValues: baseLatest({ isLoading: true }),
      realtimeConnection: baseConn('connected'),
    });
    expect(screen.getByTestId('tile-source-p_inlet').textContent).toBe('Loading…');
  });

  it('shows "Couldn\'t load latest" chip on error', () => {
    renderTile({
      backendUnitId: HP_001_ID,
      latestValues: baseLatest({ isError: true, error: new Error('boom') }),
      realtimeConnection: baseConn('connected'),
    });
    expect(screen.getByTestId('tile-source-p_inlet').textContent).toBe("Couldn't load latest");
  });

  it('shows "No latest value" when the tag is missing from the response', () => {
    renderTile({
      backendUnitId: HP_001_ID,
      latestValues: baseLatest({ valuesByTagName: new Map() }),
      realtimeConnection: baseConn('connected'),
    });
    expect(screen.getByTestId('tile-source-p_inlet').textContent).toBe('No latest value');
  });
});

// --- Realtime overlay -------------------------------------------------------

describe('LiveVariableTile — realtime overlay', () => {
  const newerSlot = (value: string): SlotLiveValue => ({
    value,
    engineeringUnit: 'psi',
    timestamp: '2026-05-28T13:59:30.000Z', // 30 s newer than the REST row
    ingestionTimestamp: '2026-05-28T13:59:30.500Z',
    receivedAt: '2026-05-28T13:59:30.500Z',
  });
  const olderSlot = (value: string): SlotLiveValue => ({
    value,
    engineeringUnit: 'psi',
    timestamp: '2026-05-28T13:58:00.000Z', // 60 s older than the REST row
    ingestionTimestamp: '2026-05-28T13:58:00.500Z',
    receivedAt: '2026-05-28T13:58:00.500Z',
  });

  it('prefers realtime value when its timestamp is newer than REST', () => {
    const valuesByTagName = new Map<string, TelemetryLatestValue>([['p_inlet', sampleRestRow()]]);
    renderTile({
      backendUnitId: HP_001_ID,
      latestValues: baseLatest({ valuesByTagName }),
      realtimeConnection: baseConn('connected'),
      realtimeGetSlotValue: (u, t) =>
        u === HP_001_ID && t === P_INLET_ID ? newerSlot('3850.0') : undefined,
    });
    expect(screen.getByText('3,850')).toBeInTheDocument();
  });

  it('keeps REST value when realtime is older', () => {
    const valuesByTagName = new Map<string, TelemetryLatestValue>([['p_inlet', sampleRestRow()]]);
    renderTile({
      backendUnitId: HP_001_ID,
      latestValues: baseLatest({ valuesByTagName }),
      realtimeConnection: baseConn('connected'),
      realtimeGetSlotValue: (u, t) =>
        u === HP_001_ID && t === P_INLET_ID ? olderSlot('9999') : undefined,
    });
    expect(screen.getByText('3,812')).toBeInTheDocument();
  });

  it('ignores realtime for mismatched (unitId, canonicalTagId)', () => {
    const valuesByTagName = new Map<string, TelemetryLatestValue>([['p_inlet', sampleRestRow()]]);
    renderTile({
      backendUnitId: HP_001_ID,
      latestValues: baseLatest({ valuesByTagName }),
      realtimeConnection: baseConn('connected'),
      // Slot lookup returns undefined for the tile's (unitId, canonicalTagId).
      realtimeGetSlotValue: () => undefined,
    });
    expect(screen.getByText('3,812')).toBeInTheDocument();
  });

  it('chip flips to "Reconnecting" when the socket is reconnecting', () => {
    const valuesByTagName = new Map<string, TelemetryLatestValue>([['p_inlet', sampleRestRow()]]);
    renderTile({
      backendUnitId: HP_001_ID,
      latestValues: baseLatest({ valuesByTagName }),
      realtimeConnection: baseConn('reconnecting'),
    });
    expect(screen.getByTestId('tile-source-p_inlet').textContent).toBe('Reconnecting');
  });

  it('chip reads "Disconnected · last value HH:MM:SS UTC" when disconnected', () => {
    const valuesByTagName = new Map<string, TelemetryLatestValue>([['p_inlet', sampleRestRow()]]);
    renderTile({
      backendUnitId: HP_001_ID,
      latestValues: baseLatest({ valuesByTagName }),
      realtimeConnection: baseConn('disconnected'),
    });
    // REST timestamp '2026-05-28T13:59:00.000Z' → '13:59:00 UTC'.
    expect(screen.getByTestId('tile-source-p_inlet').textContent).toBe(
      'Disconnected · last value 13:59:00 UTC',
    );
  });
});

// --- F4.5G.2.2.2 — drawer dispatch ------------------------------------------

describe('LiveVariableTile — drawer dispatch (F4.5G.2.2.2)', () => {
  it('without drawer identity → tile button is disabled (no provider / no host)', () => {
    renderTile();
    const button = screen.getByTestId(`tile-${tile.id}`);
    expect(button.tagName).toBe('BUTTON');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId(`tile-expand-${tile.id}`)).toBeNull();
  });

  it('with drawer identity → button is enabled, renders Expand icon', () => {
    renderTile({
      drawerUnitId: HP_001_ID,
      drawerUnitTitle: 'Multiphase Unit #1',
      drawerHasBackendMatch: true,
    });
    const button = screen.getByTestId(`tile-${tile.id}`);
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId(`tile-expand-${tile.id}`)).toBeInTheDocument();
    expect(button.getAttribute('aria-label')).toContain('Multiphase Unit #1');
  });

  it('clicking the tile dispatches drawer.open with the resolved selection', () => {
    renderTile({
      drawerUnitId: HP_001_ID,
      drawerUnitTitle: 'Multiphase Unit #1',
      drawerHasBackendMatch: true,
    });
    fireEvent.click(screen.getByTestId(`tile-${tile.id}`));
    expect(drawerOpenMock).toHaveBeenCalledTimes(1);
    const call = drawerOpenMock.mock.calls[0]?.[0] as {
      unitId: string;
      canonicalTagName: string;
      variableTitle: string;
      unitTitle: string;
      hasBackendMatch: boolean;
      fallbackJobId: string;
      fallbackTag: string;
    };
    expect(call.unitId).toBe(HP_001_ID);
    expect(call.canonicalTagName).toBe('p_inlet');
    expect(call.variableTitle).toBe(tile.label);
    expect(call.unitTitle).toBe('Multiphase Unit #1');
    expect(call.hasBackendMatch).toBe(true);
    // F4.5G.2.2.2 — fallback identity mirrors the tile's `useHistoryBuffer`.
    expect(String(call.fallbackJobId)).toBe(String(jobId));
    expect(String(call.fallbackTag)).toBe(String(tile.tag));
  });

  it('clicking with hasBackendMatch=false still dispatches (honest open w/ caveat)', () => {
    renderTile({
      drawerUnitId: 'EMMAD-01',
      drawerUnitTitle: 'Multiphase Unit #3',
      drawerHasBackendMatch: false,
    });
    fireEvent.click(screen.getByTestId(`tile-${tile.id}`));
    expect(drawerOpenMock).toHaveBeenCalledTimes(1);
    const call = drawerOpenMock.mock.calls[0]?.[0] as { hasBackendMatch: boolean; unitId: string };
    expect(call.hasBackendMatch).toBe(false);
    expect(call.unitId).toBe('EMMAD-01');
  });
});
