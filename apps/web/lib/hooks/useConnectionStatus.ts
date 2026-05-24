/**
 * useConnectionStatus — F2A.
 *
 * Returns the wire-level CommunicationStatus surfaced by whichever adapter
 * is feeding the store. F2A uses the simulator; F2D will use the WebSocket
 * adapter. The hook is the same in both cases.
 *
 * NOTE: the legacy F0 `useConnectionState` (in lib/realtime/RealtimeProvider)
 * surfaces a Socket.IO-shaped status. This hook is the F2A successor that
 * sits on the normalized contract. They will be reconciled in F2D.
 */
'use client';

import { useSyncExternalStore } from 'react';

import { useTelemetryStore } from './useTelemetryStore';

import type { CommunicationStatus } from '../telemetry/models';

export const useConnectionStatus = (): CommunicationStatus => {
  const store = useTelemetryStore();
  return useSyncExternalStore(
    (listener) => store.subscribeConnection(listener),
    () => store.getConnectionStatus(),
    () => store.getConnectionStatus(),
  );
};
