/**
 * OperationsTelemetryRuntime — F2B.
 *
 * Boots the SimulatedNormalizedTelemetryAdapter once per browser session
 * and connects it to the singleton TelemetryStore. Rendered as a hidden
 * child of the Operations page; mounting it is the way the page declares
 * "I want live data."
 *
 * Idempotency:
 *   - React 19 strict mode mounts effects twice in dev. The runtime guards
 *     against double-start by tracking module-level state.
 *   - HMR keeps modules alive across edits. The guard preserves the same
 *     adapter across HMR updates, so the simulator's seed/step counters
 *     don't reset on every save.
 *   - Bookkeeping is reference-counted so two pages mounting the runtime
 *     simultaneously share one adapter; the last unmount tears it down.
 *
 * Server-render safety:
 *   - The component is marked `'use client'`. The body only runs in the
 *     browser. Effects only run after hydration.
 */
'use client';

import { useEffect } from 'react';

import { startOperationsTelemetry, stopOperationsTelemetry } from './operationsRuntime';

export const OperationsTelemetryRuntime = (): null => {
  useEffect(() => {
    startOperationsTelemetry();
    return () => {
      stopOperationsTelemetry();
    };
  }, []);

  return null;
};
