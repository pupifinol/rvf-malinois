/**
 * Public env access for the browser. Anything that needs to ship to the
 * client MUST start with `NEXT_PUBLIC_`. Never leak server-only secrets.
 *
 * Telemetry adapter selection (F2D):
 *
 *   NEXT_PUBLIC_RVF_TELEMETRY_SOURCE
 *     `simulated` (default) — drive Operations/Alarms from the F2A
 *                              SimulatedNormalizedTelemetryAdapter.
 *     `websocket`           — drive them from the F2D
 *                              BackendWebSocketTelemetryAdapter pointed at
 *                              `NEXT_PUBLIC_RVF_TELEMETRY_WS_URL`. If the
 *                              URL is missing or empty, the factory falls
 *                              back to the simulator so local dev never
 *                              hangs waiting for a backend that does not
 *                              exist yet.
 *
 *   NEXT_PUBLIC_RVF_TELEMETRY_WS_URL
 *     `wss://…` URL the BackendWebSocketTelemetryAdapter connects to when
 *     `source === 'websocket'`. Only ever used through the factory; no
 *     other code in the app touches this directly.
 */
export const publicEnv = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  wsUrl: process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000',
  telemetrySource: process.env.NEXT_PUBLIC_RVF_TELEMETRY_SOURCE ?? '',
  telemetryWsUrl: process.env.NEXT_PUBLIC_RVF_TELEMETRY_WS_URL ?? '',
} as const;
