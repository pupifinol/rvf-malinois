/**
 * Telemetry adapter factory — F2D.
 *
 * Picks the right `NormalizedTelemetryAdapter` implementation for the
 * runtime to use, based on `NEXT_PUBLIC_RVF_TELEMETRY_SOURCE`. Per F2 Runtime
 * Integration Notes v1.0 §13 the SIMULATOR remains the default until the
 * backend is ready; the only way to flip to the real WebSocket transport
 * is to set the env var explicitly *and* provide
 * `NEXT_PUBLIC_RVF_TELEMETRY_WS_URL`. If the URL is missing the factory
 * falls back to the simulator so local dev never hangs waiting for a
 * backend that does not exist yet.
 *
 * The factory is the single seam between the runtime and the adapter
 * implementation. Operations / Alarms / Client Portal NEVER import an
 * adapter directly — they consume hooks that consume the store, which is
 * fed by whichever adapter the runtime obtains here.
 *
 * F2 Runtime Integration Notes v1.0 §15 risk note:
 *   "Mezcla de simulador y backend real" — the source is mutually
 *   exclusive by construction. There is exactly one adapter per runtime
 *   start; the factory never returns a hybrid.
 */
import {
  SimulatedNormalizedTelemetryAdapter,
  type SimulatedJobBinding,
} from './adapters/simulated';
import { BackendWebSocketTelemetryAdapter } from './adapters/websocket';

import type { NormalizedTelemetryAdapter } from './adapter';

import { publicEnv } from '@/lib/env';

export type TelemetrySource = 'simulated' | 'websocket';

export interface TelemetryAdapterConfig {
  /** Effective source after env resolution. */
  source: TelemetrySource;
  /** WebSocket URL when `source === 'websocket'`; `''` otherwise. */
  wsUrl: string;
  /**
   * True iff the operator asked for `websocket` but the URL was missing
   * and we fell back to `simulated`. Logged by the runtime so the gap is
   * visible without crashing dev.
   */
  fellBackToSimulator: boolean;
}

const normalizeSource = (raw: string): TelemetrySource =>
  raw.toLowerCase() === 'websocket' ? 'websocket' : 'simulated';

/**
 * Resolve the effective adapter configuration from the public env. Pure;
 * called by tests with an injected `env` to validate every path.
 */
export const getTelemetryAdapterConfig = (
  env: { telemetrySource: string; telemetryWsUrl: string } = publicEnv,
): TelemetryAdapterConfig => {
  const requested = normalizeSource(env.telemetrySource);
  if (requested === 'websocket') {
    if (env.telemetryWsUrl.length > 0) {
      return { source: 'websocket', wsUrl: env.telemetryWsUrl, fellBackToSimulator: false };
    }
    // Requested websocket but no URL — safe fallback.
    return { source: 'simulated', wsUrl: '', fellBackToSimulator: true };
  }
  return { source: 'simulated', wsUrl: '', fellBackToSimulator: false };
};

export interface CreateTelemetryAdapterInput {
  /** Bindings used to drive the simulator. Ignored by the WebSocket adapter. */
  bindings: SimulatedJobBinding[];
  /** Override the resolved config (tests + storybook). */
  config?: TelemetryAdapterConfig;
  /**
   * Optional fine-tuning for the simulator. Production defaults match what
   * F2B+F2C wired before the factory existed.
   */
  simulatorOptions?: {
    seed?: number;
    intervalMs?: number;
    heartbeatEveryTicks?: number;
    connectionGlitchEveryTicks?: number;
  };
}

const DEFAULT_SIM_SEED = 17;
const DEFAULT_SIM_INTERVAL_MS = 1_000;
const DEFAULT_SIM_HEARTBEAT_TICKS = 10;

/**
 * Build the adapter the runtime will use for this browser session. The
 * runtime is responsible for `start()` / `stop()` and connecting the
 * adapter to the singleton TelemetryStore.
 */
export const createTelemetryAdapter = (
  input: CreateTelemetryAdapterInput,
): { adapter: NormalizedTelemetryAdapter; config: TelemetryAdapterConfig } => {
  const config = input.config ?? getTelemetryAdapterConfig();

  if (config.source === 'websocket') {
    return {
      adapter: new BackendWebSocketTelemetryAdapter({ url: config.wsUrl }),
      config,
    };
  }

  const sim = input.simulatorOptions ?? {};
  return {
    adapter: new SimulatedNormalizedTelemetryAdapter({
      bindings: input.bindings,
      seed: sim.seed ?? DEFAULT_SIM_SEED,
      intervalMs: sim.intervalMs ?? DEFAULT_SIM_INTERVAL_MS,
      heartbeatEveryTicks: sim.heartbeatEveryTicks ?? DEFAULT_SIM_HEARTBEAT_TICKS,
      ...(sim.connectionGlitchEveryTicks !== undefined
        ? { connectionGlitchEveryTicks: sim.connectionGlitchEveryTicks }
        : {}),
    }),
    config,
  };
};
