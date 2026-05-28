/**
 * F4.5G.2.1 — `<LiveCommunicationHealthPanel>` F4 row tests.
 *
 * Only the Backend WebSocket row's content is in scope. The existing
 * Normalized Stream / F2 Simulated Source / Field Protocols rows must stay
 * intact in every state.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LiveCommunicationHealthPanel } from './LiveCommunicationHealthPanel';

import type * as HooksModule from '@/lib/hooks';

type OperationsRealtimeConnection = HooksModule.OperationsRealtimeConnection;
type UseOperationsRealtimeF4Result = HooksModule.UseOperationsRealtimeF4Result;

const ORIGINAL_DATA_SOURCE = process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;

const { useOperationsRealtimeF4Mock, useConnectionStatusMock } = vi.hoisted(() => ({
  useOperationsRealtimeF4Mock: vi.fn<() => UseOperationsRealtimeF4Result>(),
  useConnectionStatusMock: vi.fn<
    () => { kind: 'connected' | 'reconnecting' | 'disconnected'; lastTs?: string }
  >(() => ({ kind: 'connected' })),
}));

vi.mock('@/lib/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof HooksModule>();
  return {
    ...actual,
    useConnectionStatus: useConnectionStatusMock,
    useOperationsRealtimeF4: useOperationsRealtimeF4Mock,
  };
});

const baseResult = (
  overrides: Partial<UseOperationsRealtimeF4Result> & {
    connection?: OperationsRealtimeConnection;
  } = {},
): UseOperationsRealtimeF4Result => ({
  enabled: overrides.enabled ?? false,
  connection: overrides.connection ?? { kind: 'disabled' },
  source: overrides.source ?? 'mock',
  lastEventReceivedAt: overrides.lastEventReceivedAt ?? null,
  slots: overrides.slots ?? new Map(),
  alarmEventsSeen: overrides.alarmEventsSeen ?? 0,
  getSlotValue: overrides.getSlotValue ?? (() => undefined),
});

const renderPanel = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LiveCommunicationHealthPanel />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  useOperationsRealtimeF4Mock.mockReset();
  useConnectionStatusMock.mockReset();
  useConnectionStatusMock.mockReturnValue({ kind: 'connected' });
});

afterEach(() => {
  process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = ORIGINAL_DATA_SOURCE;
});

describe('LiveCommunicationHealthPanel — F4 row', () => {
  it('shows NOT CONNECTED · MOCK MODE when the F4 hook is disabled (mock mode)', () => {
    useOperationsRealtimeF4Mock.mockReturnValue(baseResult({ enabled: false }));

    renderPanel();

    expect(screen.getByText('NOT CONNECTED · MOCK MODE')).toBeInTheDocument();
  });

  it('shows CONNECTED · F4.6E.1 when the F4 hook reports connected', () => {
    useOperationsRealtimeF4Mock.mockReturnValue(
      baseResult({
        enabled: true,
        connection: { kind: 'connected', since: '2026-05-28T10:00:00.000Z' },
        source: 'rest+realtime',
      }),
    );

    renderPanel();

    expect(screen.getByText('CONNECTED · F4.6E.1')).toBeInTheDocument();
  });

  it('shows RECONNECTING (attempt N) when reconnecting', () => {
    useOperationsRealtimeF4Mock.mockReturnValue(
      baseResult({
        enabled: true,
        connection: { kind: 'reconnecting', attempt: 3, lastDataAt: null },
        source: 'rest',
      }),
    );

    renderPanel();

    expect(screen.getByText('RECONNECTING (attempt 3)')).toBeInTheDocument();
  });

  it('shows DISCONNECTED with LAST EVENT timestamp when known', () => {
    useOperationsRealtimeF4Mock.mockReturnValue(
      baseResult({
        enabled: true,
        connection: {
          kind: 'disconnected',
          lastDataAt: '2026-05-28T10:00:00.000Z',
        },
        source: 'rest',
      }),
    );

    renderPanel();

    expect(screen.getByText('DISCONNECTED · LAST EVENT 10:00:00 UTC')).toBeInTheDocument();
  });

  it('shows DISCONNECTED without LAST EVENT when no event has arrived', () => {
    useOperationsRealtimeF4Mock.mockReturnValue(
      baseResult({
        enabled: true,
        connection: { kind: 'disconnected', lastDataAt: null },
        source: 'rest',
      }),
    );

    renderPanel();

    expect(screen.getByText('DISCONNECTED')).toBeInTheDocument();
  });

  it('preserves the legacy Normalized Stream / F2 Simulated Source / Field Protocols rows', () => {
    useOperationsRealtimeF4Mock.mockReturnValue(baseResult({ enabled: false }));
    useConnectionStatusMock.mockReturnValue({ kind: 'connected' });

    renderPanel();

    expect(screen.getByText('Normalized Stream')).toBeInTheDocument();
    expect(screen.getByText('F2 Simulated Source')).toBeInTheDocument();
    expect(screen.getByText('Field Protocols')).toBeInTheDocument();
    expect(screen.getByText('NOT ACTIVE IN BUILD')).toBeInTheDocument();
  });
});
