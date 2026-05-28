/**
 * F4.5G.2.2.1 — `<LiveMultiphaseUnitCard>` resolver / latest / realtime wiring.
 *
 * Mocks the new hooks so the card's composition can be asserted without
 * pulling the QueryClient or RealtimeProvider through the test harness:
 *
 *   - `useResolveBackendUnitId(backendUnitCode)` receives the prop.
 *   - The resolved `backendUnitId` is threaded to the latest-values hook +
 *     downstream tiles.
 *   - `trackedSlots` passed to `useOperationsRealtimeF4` is empty when the
 *     resolver returns `null` (no fake slot ever reaches the socket).
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LiveMultiphaseUnitCard } from './LiveMultiphaseUnitCard';

import type { TelemetryLatestValue } from '@/lib/api/f4';
import type * as HooksModule from '@/lib/hooks';
import type { ActiveJobSnapshot } from '@/lib/jobs/types';

type TrackedSlot = HooksModule.TrackedSlot;
type UseOperationsLatestValuesInput = HooksModule.UseOperationsLatestValuesInput;
type UseOperationsLatestValuesResult = HooksModule.UseOperationsLatestValuesResult;
type UseOperationsRealtimeF4Input = HooksModule.UseOperationsRealtimeF4Input;
type UseOperationsRealtimeF4Result = HooksModule.UseOperationsRealtimeF4Result;
type UseResolveBackendUnitIdResult = HooksModule.UseResolveBackendUnitIdResult;

import { JOB_HP_HF } from '@/lib/jobs/snapshots.mock';

const HP_001_ID = '00000000-0000-0000-0000-000000004411';

const { resolverMock, latestMock, realtimeMock, unitSnapMock, nowTickMock } = vi.hoisted(() => ({
  resolverMock: vi.fn<(code: string | undefined) => UseResolveBackendUnitIdResult>(),
  latestMock: vi.fn<(input: UseOperationsLatestValuesInput) => UseOperationsLatestValuesResult>(),
  realtimeMock: vi.fn<(input: UseOperationsRealtimeF4Input) => UseOperationsRealtimeF4Result>(),
  unitSnapMock: vi.fn(),
  nowTickMock: vi.fn(),
}));

vi.mock('@/lib/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof HooksModule>();
  return {
    ...actual,
    useResolveBackendUnitId: resolverMock,
    useOperationsLatestValues: latestMock,
    useOperationsRealtimeF4: realtimeMock,
    useUnitTelemetrySnapshot: unitSnapMock,
    useNowTick: nowTickMock,
  };
});

// Stub LiveVariableTile so we can observe the props the card hands down
// without dragging the tile's F2 substrate into this spec.
vi.mock('./LiveVariableTile', () => ({
  LiveVariableTile: ({
    tile,
    backendUnitId,
  }: {
    tile: { id: string };
    backendUnitId?: string | null;
  }) => (
    <div
      data-testid={`tile-stub-${tile.id}`}
      data-backend-unit-id={backendUnitId === null ? 'null' : (backendUnitId ?? 'undefined')}
    />
  ),
}));

const baseResolver = (
  override: Partial<UseResolveBackendUnitIdResult> = {},
): UseResolveBackendUnitIdResult => ({
  unitId: override.unitId ?? null,
  isLoading: override.isLoading ?? false,
  error: override.error ?? null,
  source: override.source ?? 'mock',
});

const baseLatest = (
  override: Partial<UseOperationsLatestValuesResult> = {},
): UseOperationsLatestValuesResult => ({
  valuesByTagName: override.valuesByTagName ?? new Map(),
  isLoading: override.isLoading ?? false,
  isError: override.isError ?? false,
  error: override.error ?? null,
  lastDataAt: override.lastDataAt ?? null,
  response: override.response,
  source: override.source ?? 'mock',
  enabled: override.enabled ?? false,
});

const baseRealtime = (
  override: Partial<UseOperationsRealtimeF4Result> = {},
): UseOperationsRealtimeF4Result => ({
  enabled: override.enabled ?? false,
  connection: override.connection ?? { kind: 'disabled' },
  source: override.source ?? 'mock',
  lastEventReceivedAt: override.lastEventReceivedAt ?? null,
  slots: override.slots ?? new Map(),
  alarmEventsSeen: override.alarmEventsSeen ?? 0,
  getSlotValue: override.getSlotValue ?? (() => undefined),
});

const job: ActiveJobSnapshot = JOB_HP_HF;
const connectionStatus = { kind: 'connected', since: '2026-05-28T13:00:00.000Z' } as const;

beforeEach(() => {
  unitSnapMock.mockReturnValue({ byTag: {} });
  nowTickMock.mockReturnValue(Date.parse('2026-05-28T14:00:00.000Z'));
  resolverMock.mockReturnValue(baseResolver());
  latestMock.mockReturnValue(baseLatest());
  realtimeMock.mockReturnValue(baseRealtime());
});

afterEach(() => {
  vi.clearAllMocks();
});

const renderCard = (backendUnitCode?: string) =>
  render(
    <LiveMultiphaseUnitCard
      job={job}
      displayNumber={1}
      connectionStatus={connectionStatus}
      backendUnitCode={backendUnitCode}
    />,
  );

describe('LiveMultiphaseUnitCard — resolver wiring', () => {
  it('passes backendUnitCode to useResolveBackendUnitId', () => {
    renderCard('HP-001');
    expect(resolverMock).toHaveBeenCalledWith('HP-001');
  });

  it('omitted backendUnitCode passes undefined to the resolver', () => {
    renderCard(undefined);
    expect(resolverMock).toHaveBeenCalledWith(undefined);
  });

  it('threads resolved backendUnitId to each tile', () => {
    resolverMock.mockReturnValue(baseResolver({ unitId: HP_001_ID, source: 'api' }));
    renderCard('HP-001');
    const tileStubs = screen.getAllByTestId(/^tile-stub-/);
    expect(tileStubs.length).toBe(6);
    for (const stub of tileStubs) {
      expect(stub.getAttribute('data-backend-unit-id')).toBe(HP_001_ID);
    }
  });

  it('threads null backendUnitId when the resolver returns null', () => {
    resolverMock.mockReturnValue(baseResolver({ unitId: null }));
    renderCard('HP-001');
    const stub = screen.getByTestId('tile-stub-p_inlet');
    expect(stub.getAttribute('data-backend-unit-id')).toBe('null');
  });
});

describe('LiveMultiphaseUnitCard — latest hook + tracked slots', () => {
  it('calls useOperationsLatestValues with the resolved unitId', () => {
    resolverMock.mockReturnValue(baseResolver({ unitId: HP_001_ID, source: 'api' }));
    renderCard('HP-001');
    expect(latestMock).toHaveBeenCalledWith({ unitId: HP_001_ID });
  });

  it('null resolver → trackedSlots is empty', () => {
    resolverMock.mockReturnValue(baseResolver({ unitId: null }));
    renderCard('HP-001');
    const call = realtimeMock.mock.calls[0]?.[0];
    expect(call?.trackedSlots).toEqual([]);
  });

  it('resolved + REST rows present → trackedSlots is UUID-shaped per tile', () => {
    resolverMock.mockReturnValue(baseResolver({ unitId: HP_001_ID, source: 'api' }));
    const valuesByTagName = new Map<string, TelemetryLatestValue>();
    const row: TelemetryLatestValue = {
      sensorId: '00000000-0000-0000-0000-000000005551',
      canonicalTag: {
        id: '00000000-0000-0000-0000-0000000044f1',
        name: 'p_inlet',
        displayName: 'Inlet pressure',
        canonicalUnit: 'psi',
        category: 'pressure',
        precision: 1,
      },
      value: '3800.0',
      engineeringUnit: 'psi',
      quality: 'good',
      timestamp: '2026-05-28T13:59:00.000Z',
      ingestionTimestamp: '2026-05-28T13:59:00.500Z',
      source: 'mqtt',
      latestTelemetryReadingId: '00000000-0000-0000-0000-000000006661',
    };
    valuesByTagName.set('p_inlet', row);
    latestMock.mockReturnValue(baseLatest({ valuesByTagName, enabled: true, source: 'api' }));

    renderCard('HP-001');
    const call = realtimeMock.mock.calls[realtimeMock.mock.calls.length - 1]?.[0];
    expect(call?.trackedSlots).toBeDefined();
    expect((call?.trackedSlots ?? []).length).toBe(1);
    const slot: TrackedSlot | undefined = (call?.trackedSlots ?? [])[0];
    expect(slot?.unitId).toBe(HP_001_ID);
    expect(slot?.canonicalTagId).toBe('00000000-0000-0000-0000-0000000044f1');
    expect(slot?.canonicalTagName).toBe('p_inlet');
  });

  it('renders the same chart-untouched header (no regression on F2 fields)', () => {
    renderCard('HP-001');
    // Card header text is the existing F2-derived markup; just confirm we
    // still render something role-tagged.
    expect(screen.getByRole('article')).toBeInTheDocument();
  });
});
