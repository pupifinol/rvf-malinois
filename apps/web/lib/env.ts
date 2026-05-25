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
 *
 * F4 data-source switch (F4.5A foundation):
 *
 *   NEXT_PUBLIC_RVF_DATA_SOURCE
 *     `mock` (default) — every screen reads from the F3 mock adapter
 *                         (`apps/web/lib/api-data/`).
 *     `api`            — opt-in: screens migrated by F4.5B+ read from
 *                         the F4 backend API via `@/lib/api/f4`.
 *
 *   NEXT_PUBLIC_RVF_API_BASE_URL
 *     Base URL for the F4 backend. Default `http://localhost:4000/api/v1`.
 *     Read by `@/lib/api/f4/config.ts`; trailing slashes are stripped.
 *
 * Both vars are intentionally separate from `NEXT_PUBLIC_API_URL` /
 * `NEXT_PUBLIC_WS_URL` (which retain their F3 semantics) so a stalled
 * F4 migration cannot break existing routes.
 */
export const publicEnv = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  wsUrl: process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000',
  telemetrySource: process.env.NEXT_PUBLIC_RVF_TELEMETRY_SOURCE ?? '',
  telemetryWsUrl: process.env.NEXT_PUBLIC_RVF_TELEMETRY_WS_URL ?? '',
  rvfDataSource: process.env.NEXT_PUBLIC_RVF_DATA_SOURCE ?? '',
  rvfApiBaseUrl: process.env.NEXT_PUBLIC_RVF_API_BASE_URL ?? '',
} as const;
