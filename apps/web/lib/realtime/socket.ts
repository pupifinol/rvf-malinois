import { io, type Socket } from 'socket.io-client';

import type { ConnectionState, RealtimeMessage } from '@rvf/types';

/**
 * Realtime client — FOUNDATION.
 *
 * F0 wires the connection lifecycle and surfaces a typed `ConnectionState`
 * that the `ConnectionBanner` primitive consumes. The browser opens ONE
 * socket (multiplexing planned for F2), reconnects with exponential backoff
 * + jitter, and tells the user honestly when data is stale.
 *
 * Engineering doc §13:
 *   - one connection, multiplexed by subscription;
 *   - exponential backoff with jitter on reconnect;
 *   - catch-up via REST after reconnect;
 *   - scope decided by the server.
 *
 * F2 will add: subscribe/unsubscribe API, the ring buffer for telemetry,
 * the rAF tick that fans changes out to subscribed components, and the
 * REST catch-up call.
 */

export interface SocketClient {
  socket: Socket;
  /** Adds a listener that is fired every time the connection state changes. */
  onState: (listener: (state: ConnectionState) => void) => () => void;
  /** Adds a listener for incoming realtime messages (placeholder for F2). */
  onMessage: (listener: (msg: RealtimeMessage) => void) => () => void;
  disconnect: () => void;
}

export const createSocketClient = (url: string): SocketClient => {
  const socket = io(url, {
    path: '/api/v1/stream',
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    randomizationFactor: 0.5,
    autoConnect: true,
  });

  const stateListeners = new Set<(state: ConnectionState) => void>();
  const messageListeners = new Set<(msg: RealtimeMessage) => void>();
  let lastDataAt: string | null = null;

  const emitState = (state: ConnectionState): void => {
    for (const listener of stateListeners) listener(state);
  };

  socket.on('connect', () => {
    emitState({ status: 'connected', since: new Date().toISOString() });
  });

  socket.io.on('reconnect_attempt', (attempt: number) => {
    emitState({ status: 'reconnecting', attempt, lastDataAt });
  });

  socket.on('disconnect', () => {
    emitState({ status: 'disconnected', lastDataAt });
  });

  // The backend currently emits a `connection` greeting; F2 will replace this
  // with the typed RealtimeMessage stream and ring-buffer integration.
  socket.on('connection', (payload: ConnectionState) => {
    if (payload.status === 'connected') lastDataAt = payload.since;
    emitState(payload);
  });

  socket.onAny((event: string, ...args: unknown[]) => {
    // F2 will narrow this to the typed RealtimeMessage union. For F0 we just
    // record the timestamp of any inbound traffic so the banner can report
    // "data 9 min old" if the link drops.
    if (event !== 'connection') {
      lastDataAt = new Date().toISOString();
      const [first] = args;
      if (first && typeof first === 'object' && 'kind' in first) {
        for (const listener of messageListeners) {
          listener(first as RealtimeMessage);
        }
      }
    }
  });

  return {
    socket,
    onState: (listener) => {
      stateListeners.add(listener);
      return () => {
        stateListeners.delete(listener);
      };
    },
    onMessage: (listener) => {
      messageListeners.add(listener);
      return () => {
        messageListeners.delete(listener);
      };
    },
    disconnect: () => socket.disconnect(),
  };
};
