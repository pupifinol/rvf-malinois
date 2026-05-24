/**
 * SharedTelemetryRuntime — F2C.
 *
 * Mountable wrapper that any internal screen which wants the F2A simulated
 * normalized stream can render. It delegates to the same ref-counted
 * `startOperationsTelemetry / stopOperationsTelemetry` singleton that the
 * Operations page uses, so:
 *
 *   - mounting Operations starts the adapter (ref=1),
 *   - mounting Alarms while Operations is also mounted bumps the ref (ref=2)
 *     and reuses the EXISTING adapter — no second simulator,
 *   - the last screen to unmount tears the adapter down.
 *
 * This satisfies F2C: Alarms can consume live telemetry without duplicating
 * intervals/adapters, even when the Operations screen is never visited
 * (e.g. user lands directly on /alarms). React 19 strict mode and HMR are
 * both safe because the underlying handle is ref-counted and module-scoped.
 *
 * The wrapper exists as a separate React component (rather than asking
 * Alarms to import the Operations wrapper) so the name reads correctly at
 * the call site and a future reader does not assume Alarms is "borrowing"
 * Operations infrastructure — both share the same singleton on purpose.
 */
'use client';

import { useEffect } from 'react';

import {
  startOperationsTelemetry,
  stopOperationsTelemetry,
} from '@/components/operations/operationsRuntime';

export const SharedTelemetryRuntime = (): null => {
  useEffect(() => {
    startOperationsTelemetry();
    return () => {
      stopOperationsTelemetry();
    };
  }, []);

  return null;
};
