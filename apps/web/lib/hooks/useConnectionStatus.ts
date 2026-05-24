/**
 * useConnectionStatus — F2A (snapshot-identity-hardened in F2B).
 *
 * Returns the wire-level CommunicationStatus surfaced by whichever adapter
 * is feeding the store. F2A uses the simulator; F2D will use the WebSocket
 * adapter. The hook is the same in both cases.
 *
 * Snapshot identity discipline:
 *
 *   - `TelemetryStore.getConnectionStatus()` returns the cached field
 *     reference, which is only reassigned when a connection message
 *     arrives. So client-side `getSnapshot` is already stable.
 *   - `getServerSnapshot` returns a module-level `DISCONNECTED_SERVER`
 *     constant — required for React 19's identity contract, and honest
 *     because the runtime is client-only.
 *
 * NOTE: the legacy F0 `useConnectionState` (in lib/realtime/RealtimeProvider)
 * surfaces a Socket.IO-shaped status. This hook is the F2A successor that
 * sits on the normalized contract. They will be reconciled in F2D.
 */
'use client';

import { useSyncExternalStore } from 'react';

import { useTelemetryStore } from './useTelemetryStore';

import type { CommunicationStatus } from '../telemetry/models';

/**
 * Stable disconnected status used during SSR / before the runtime starts.
 * Module-level so its reference never changes — required by React 19's
 * `getServerSnapshot` contract.
 */
export const DISCONNECTED_SERVER: CommunicationStatus = Object.freeze({
  kind: 'disconnected',
});

const getServerSnapshot = (): CommunicationStatus => DISCONNECTED_SERVER;

export const useConnectionStatus = (): CommunicationStatus => {
  const store = useTelemetryStore();
  return useSyncExternalStore(
    (listener) => store.subscribeConnection(listener),
    () => store.getConnectionStatus(),
    getServerSnapshot,
  );
};
