'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { createSocketClient, type SocketClient } from './socket';

import type { ConnectionState } from '@rvf/types';

interface RealtimeContextValue {
  state: ConnectionState;
  client: SocketClient | null;
}

const RealtimeContext = createContext<RealtimeContextValue | undefined>(undefined);

/**
 * RealtimeProvider — mounts the WebSocket client and shares its state.
 *
 * One client per browser tab. F2 will add scope-aware subscription helpers
 * that screens call when they mount. For F0 we just keep the connection
 * open and expose the connection state so the ConnectionBanner can render.
 */
export const RealtimeProvider = ({ url, children }: { url: string; children: ReactNode }) => {
  const [state, setState] = useState<ConnectionState>({ status: 'connecting' });
  const clientRef = useRef<SocketClient | null>(null);

  useEffect(() => {
    const client = createSocketClient(url);
    clientRef.current = client;
    const unsub = client.onState(setState);

    return () => {
      unsub();
      client.disconnect();
      clientRef.current = null;
    };
  }, [url]);

  const value = useMemo<RealtimeContextValue>(
    () => ({ state, client: clientRef.current }),
    [state],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
};

export const useRealtime = (): RealtimeContextValue => {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used inside <RealtimeProvider>');
  return ctx;
};

export const useConnectionState = (): ConnectionState => useRealtime().state;
