/**
 * Operations telemetry runtime — F2B.
 *
 * Module-level singleton that owns the SimulatedNormalizedTelemetryAdapter
 * powering the Operations screen, and connects it to the telemetry store.
 * Reference-counted so React strict-mode double mounts and concurrent
 * renders never spin up two adapters at once.
 *
 * This file is plain TypeScript (no React) so it stays unit-testable.
 * The React-facing wrapper lives in OperationsTelemetryRuntime.tsx.
 */
import { OPERATIONS_JOBS } from './data/operationsJobs';

import { setActiveJobSnapshot } from '@/lib/jobs/activeJob';
import { connectAdapter, getTelemetryStore } from '@/lib/realtime/telemetryStore';
import { SimulatedNormalizedTelemetryAdapter } from '@/lib/telemetry/adapters/simulated';

interface RuntimeHandle {
  adapter: SimulatedNormalizedTelemetryAdapter;
  disconnect: () => void;
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

  const adapter = new SimulatedNormalizedTelemetryAdapter({
    bindings: OPERATIONS_JOBS.map(({ job, profile }) => ({ job, profile })),
    seed: 17,
    intervalMs: 1000,
    heartbeatEveryTicks: 10,
    connectionGlitchEveryTicks: 0,
  });

  const disconnect = connectAdapter(getTelemetryStore(), adapter);
  adapter.start();

  handle = { adapter, disconnect, refCount: 1 };
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
