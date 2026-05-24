/**
 * Operations telemetry runtime — F2B (factory-driven in F2D).
 *
 * Module-level singleton that owns the active `NormalizedTelemetryAdapter`
 * powering Operations + Alarms, and connects it to the singleton
 * TelemetryStore. Reference-counted so React strict-mode double mounts and
 * concurrent renders never spin up two adapters at once.
 *
 * F2D change: the adapter is built by `createTelemetryAdapter()` so the
 * runtime no longer hard-codes the simulator. The factory keeps the
 * simulator as the default (local dev never needs a backend); flipping to
 * the real backend WebSocket is a deployment-time env switch with zero
 * code changes here. Per F2 Runtime Integration Notes v1.0 §13, this is
 * the single seam between "the runtime" and "the wire transport".
 *
 * The file stays plain TypeScript (no React) so it remains unit-testable.
 * The React-facing wrappers are `OperationsTelemetryRuntime.tsx` and
 * `SharedTelemetryRuntime.tsx`; both delegate to start/stop here.
 *
 * Module name preserved per Runtime Integration Notes §4: "se recomienda
 * mantener el nombre estable hasta F2D para no introducir cambios
 * mecánicos innecesarios". A rename to `sharedTelemetryRuntime` is a
 * cosmetic follow-up if the team wants it.
 */
import { OPERATIONS_JOBS } from './data/operationsJobs';

import type { NormalizedTelemetryAdapter } from '@/lib/telemetry/adapter';

import { setActiveJobSnapshot } from '@/lib/jobs/activeJob';
import { connectAdapter, getTelemetryStore } from '@/lib/realtime/telemetryStore';
import {
  createTelemetryAdapter,
  type TelemetryAdapterConfig,
} from '@/lib/telemetry/adapterFactory';

interface RuntimeHandle {
  adapter: NormalizedTelemetryAdapter;
  disconnect: () => void;
  config: TelemetryAdapterConfig;
  refCount: number;
}

let handle: RuntimeHandle | null = null;

/**
 * Start (or re-attach to) the operations telemetry runtime. Returns true if
 * this call performed the actual start (i.e. the first attach), false if it
 * just bumped the ref count.
 */
export const startOperationsTelemetry = (): boolean => {
  if (handle) {
    handle.refCount += 1;
    return false;
  }

  // The "active" job concept covers the screens that look at a single
  // current well. Operations shows multiple, but for hooks that fall back
  // to useActiveJobSnapshot() we point at the first binding.
  const first = OPERATIONS_JOBS[0];
  if (first) {
    setActiveJobSnapshot(first.job);
  }

  const { adapter, config } = createTelemetryAdapter({
    bindings: OPERATIONS_JOBS.map(({ job, profile }) => ({ job, profile })),
  });

  if (config.fellBackToSimulator) {
    // Visible-in-dev signal that the operator asked for the backend
    // WebSocket but no URL was wired. Never throws — local dev keeps
    // working on the simulator until the URL is provided.
    if (typeof console !== 'undefined' && process.env.NODE_ENV !== 'production') {
      console.info(
        '[telemetry] NEXT_PUBLIC_RVF_TELEMETRY_SOURCE=websocket requested but ' +
          'NEXT_PUBLIC_RVF_TELEMETRY_WS_URL is empty; falling back to simulator.',
      );
    }
  }

  const disconnect = connectAdapter(getTelemetryStore(), adapter);
  adapter.start();

  handle = { adapter, disconnect, config, refCount: 1 };
  return true;
};

export const stopOperationsTelemetry = (): boolean => {
  if (!handle) return false;
  handle.refCount -= 1;
  if (handle.refCount > 0) return false;
  handle.adapter.stop();
  handle.disconnect();
  handle = null;
  return true;
};

/** Test-only helper. */
export const isOperationsTelemetryRunning = (): boolean => handle !== null;

/** Test-only helper. */
export const _resetOperationsTelemetry = (): void => {
  if (handle) {
    handle.adapter.stop();
    handle.disconnect();
    handle = null;
  }
};

/** Inspection — returns the active adapter config when running, else null. */
export const getOperationsTelemetryConfig = (): TelemetryAdapterConfig | null =>
  handle?.config ?? null;
