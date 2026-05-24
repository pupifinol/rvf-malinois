# RVF Malinois — F2D Result · Backend WebSocket Adapter & Normalized Stream Boundary

> RVF Soluciones Energéticas C.A. — Confidential.
> Result document for Fase F2D, layered on top of:
>
> - `docs/architecture/RVF_Malinois_Adenda_Arquitectura_ADR_001_005_v1.3.md`
> - `docs/architecture/RVF_Malinois_F2_Arquitectura_Telemetria_Tiempo_Real_v1.0.md`
> - `docs/architecture/RVF_Malinois_F2_Runtime_Integration_Notes_v1.0.md`

## 1. What F2D delivered

F2D introduced the **BackendWebSocketTelemetryAdapter** — a working
implementation of `NormalizedTelemetryAdapter` that connects to the
backend's normalized stream over WebSocket — and an **adapter selection
factory** that lets the runtime pick between the F2A simulator and the
backend WebSocket without any UI change.

The simulator remains the default. Flipping the runtime to the real
WebSocket transport is now a deployment-time env switch:

```
NEXT_PUBLIC_RVF_TELEMETRY_SOURCE=websocket
NEXT_PUBLIC_RVF_TELEMETRY_WS_URL=wss://backend.rvf.example/telemetry
```

Operations, Alarms, the TelemetryStore, the AlarmEvaluator, the
StaleDetector, every `useSyncExternalStore`-backed hook and the Client
Portal were **not touched**. The substitution happens entirely behind the
adapter seam.

## 2. Files created

| Path | Purpose |
| --- | --- |
| `apps/web/lib/telemetry/adapterFactory.ts` | `createTelemetryAdapter()` + `getTelemetryAdapterConfig()`. Reads env, returns `{ adapter, config }`. Documents the fallback-to-simulator rule when WS URL is missing. |
| `apps/web/lib/telemetry/adapterFactory.test.ts` | 8 tests: defaults, explicit websocket, fallback-on-missing-URL, case-insensitivity, NormalizedTelemetryAdapter conformance. |
| `apps/web/lib/telemetry/adapters/websocket.test.ts` | 19 tests over a `FakeWebSocket` + fake timers: lifecycle, idempotency, malformed JSON, unknown kinds, listener safety, intentional-stop blocks reconnect, exponential backoff growth, heartbeat-timeout reconnect path, catch-up hook firing. |
| `docs/architecture/RVF_Malinois_F2D_RESULT.md` | This document. |

## 3. Files modified

| Path | Change |
| --- | --- |
| `apps/web/lib/telemetry/adapters/websocket.ts` | **Full rewrite** of the F2A placeholder. Real implementation: `start/stop/subscribe`, strict JSON parsing of every NormalizedTelemetryMessage kind, exponential backoff with jitter, heartbeat-timeout watchdog, intentional-stop guard, optional `onCatchUp` placeholder hook, missing-URL safe path. Injectable `createSocket / setTimer / clearTimer / now / random` for deterministic tests. No DOM dependency, no industrial-protocol import. |
| `apps/web/lib/telemetry/index.ts` | Re-exports `./adapterFactory`. |
| `apps/web/lib/env.ts` | Adds `telemetrySource` + `telemetryWsUrl` to `publicEnv`. Documented in comments. |
| `apps/web/components/operations/operationsRuntime.ts` | Uses `createTelemetryAdapter({ bindings })` instead of constructing `SimulatedNormalizedTelemetryAdapter` directly. Logs an informational message in dev when the user requested `websocket` but no URL is set. Adds `getOperationsTelemetryConfig()` for inspection. The ref-counted singleton, start/stop semantics, and behaviour for default-dev are **unchanged**. |
| `apps/web/lib/telemetry/contract.test.ts` | Adds one test asserting `BackendWebSocketTelemetryAdapter` conforms to `NormalizedTelemetryAdapter`. |

No other files anywhere in the project were edited. Operations UI,
Alarms UI, Units, Sensors, Reports, Settings, Client Portal, design
tokens, and RVF branding remain byte-identical.

## 4. How BackendWebSocketTelemetryAdapter works

### Constructor

```ts
new BackendWebSocketTelemetryAdapter({
  url: 'wss://backend.rvf.example/telemetry',
  heartbeatTimeoutMs?: 30_000,       // optional, default 30 s
  onCatchUp?: (sinceIso) => void,    // optional, placeholder hook
  // Test injection points (never used in production):
  createSocket?, setTimer?, clearTimer?, now?, random?,
});
```

### `start()`

1. Returns immediately if already running (idempotent).
2. Resets the reconnect attempt counter.
3. If `url` is empty, emits `{kind: 'connection', status: {kind: 'disconnected'}}` and returns. No socket is ever opened — this is the local-dev safety path for when `source=websocket` is requested but the URL is not wired yet.
4. Otherwise, emits `{kind: 'connection', status: {kind: 'reconnecting', lastDataTs}}` so any UI subscribed to `useConnectionStatus` instantly reflects that we are about to connect.
5. Opens the socket via `createSocket(url)` (default: `globalThis.WebSocket`).

### Message handling (`onmessage`)

Every inbound frame goes through `parseNormalizedMessage(raw)`:

- Strings are `JSON.parse`'d in a try/catch (malformed JSON is dropped silently in production, `console.warn` in development).
- The resulting object must have a recognised `kind`: `reading`, `frame`, `alarm`, `heartbeat`, or `connection`. `snapshot-update` is intentionally unsupported on the wire boundary — snapshots travel via REST per ADR-005.
- Field-level validation: ISO timestamps validated via `Date.parse`; reading quality must be one of `good | estimated | uncertain | bad`; alarm wire-kind must be one of the six F2 wire alarm states; `thresholdsSource` must be the literal `'commissioning_snapshot'` (per ADR-005 regla 1).
- Any failure returns `null`; the listener never sees a malformed message.

Successful parses arm the heartbeat watchdog (any received message resets the inactivity timer) and forward the typed message to every subscriber. A subscriber throwing does not derail the adapter — surviving subscribers still receive their copy.

### Connection lifecycle

- `onopen`: reset backoff, emit `connected`, invoke `onCatchUp(lastDataTs)`, arm heartbeat watchdog.
- `onclose` (server-initiated or after an error): clear heartbeat timer; if `stop()` was not called, emit `reconnecting` and schedule the next attempt.
- `onerror`: no state change here; `onclose` will follow and own the recovery path.
- Heartbeat timeout: emit `reconnecting`, close the socket, schedule reconnect.

### `stop()`

1. Returns immediately if not running (idempotent).
2. Sets `intentionallyStopped = true` — the reconnect scheduler reads this and refuses to open a new socket.
3. Clears both timers (reconnect + heartbeat).
4. Closes the current socket (best-effort try/catch).
5. Emits `{kind: 'connection', status: {kind: 'disconnected', lastDataTs}}`.

After `stop()` the adapter is dormant. The next `start()` re-enters the lifecycle from scratch with backoff reset.

## 5. How adapter selection works

```ts
import { createTelemetryAdapter } from '@/lib/telemetry/adapterFactory';

const { adapter, config } = createTelemetryAdapter({
  bindings: OPERATIONS_JOBS.map(({ job, profile }) => ({ job, profile })),
});
```

`createTelemetryAdapter()` resolves a `TelemetryAdapterConfig`:

```ts
type TelemetryAdapterConfig = {
  source: 'simulated' | 'websocket';
  wsUrl: string;
  fellBackToSimulator: boolean;
};
```

Resolution rules (`getTelemetryAdapterConfig`):

| `NEXT_PUBLIC_RVF_TELEMETRY_SOURCE` | `NEXT_PUBLIC_RVF_TELEMETRY_WS_URL` | Resolved source | Note |
| --- | --- | --- | --- |
| unset / empty / unknown | (any) | `simulated` | Default. |
| `simulated` | (any) | `simulated` | Explicit default. |
| `websocket` | non-empty | `websocket` | Production target. |
| `websocket` | empty | `simulated` | **Safe fallback**, `fellBackToSimulator=true`. Logged in dev. |

The check is case-insensitive on the source label so `WebSocket`,
`WEBSOCKET`, `websocket` all resolve identically.

## 6. Default behaviour in local dev

With no env vars set:

- `getTelemetryAdapterConfig()` → `{ source: 'simulated', wsUrl: '', fellBackToSimulator: false }`.
- `createTelemetryAdapter()` → `SimulatedNormalizedTelemetryAdapter` with seed 17, interval 1000 ms, heartbeat every 10 ticks (the same parameters F2B/F2C used).
- Operations + Alarms see exactly the same simulated stream they saw before F2D.
- No WebSocket is ever opened. The browser never tries to reach a backend.

Running with the fallback path explicitly (`NEXT_PUBLIC_RVF_TELEMETRY_SOURCE=websocket` and no URL):

- Same behaviour as default, plus a `console.info` in dev:
  ```
  [telemetry] NEXT_PUBLIC_RVF_TELEMETRY_SOURCE=websocket requested but
  NEXT_PUBLIC_RVF_TELEMETRY_WS_URL is empty; falling back to simulator.
  ```

## 7. Reconnect / backoff / heartbeat behaviour

**Backoff schedule** (capped exponential with 0–25 % jitter):

| Attempt | Base delay | Effective range (0–25 % jitter) |
| --- | --- | --- |
| 0 | 500 ms | 500–625 ms |
| 1 | 1 000 ms | 1 000–1 250 ms |
| 2 | 2 000 ms | 2 000–2 500 ms |
| 3 | 4 000 ms | 4 000–5 000 ms |
| 4 | 8 000 ms | 8 000–10 000 ms |
| 5 | 16 000 ms | 16 000–20 000 ms |
| ≥ 6 | 30 000 ms (cap) | 30 000–37 500 ms |

Backoff resets to attempt 0 on every successful `onopen`.

**Heartbeat watchdog.** Every received frame (any kind, including
`heartbeat`) re-arms a `heartbeatTimeoutMs` timer (default 30 s). If the
timer fires, the adapter:

1. Emits `reconnecting`.
2. Calls `socket.close()`.
3. Schedules the next reconnect attempt via the backoff schedule.

**Intentional-stop guard.** `scheduleReconnect()` checks
`intentionallyStopped` before opening any socket. A Strict-Mode
double-mount (mount → unmount → mount) therefore cannot leave a zombie
socket attached to the dead first instance.

## 8. Catch-up placeholder behaviour

The adapter exposes `onCatchUp(sinceIso)` as a hook fired on every
successful socket `open`. F2D **does not implement REST catch-up itself**
— it ships the seam, not the call. The hook is invoked with the
timestamp of the last reading the adapter delivered (`undefined` if
none yet), exactly the shape a future REST endpoint would need.

When the backend gains a `/telemetry/catch-up?since=…` REST endpoint,
the runtime can supply an `onCatchUp` that:

1. Hits the REST endpoint.
2. Receives an array of historical `NormalizedTelemetryMessage`s.
3. Forwards each one into the same listener fan-out (or directly into
   the TelemetryStore).

That's a single-file change in `operationsRuntime.ts`. The adapter and
the rest of the runtime do not need to change.

## 9. Contract tests added

| Test file | Tests | What they pin |
| --- | --- | --- |
| `adapterFactory.test.ts` | 8 | Default resolution, websocket selection, fallback, case-insensitivity, factory returns the right concrete class, both implementations satisfy `NormalizedTelemetryAdapter`. |
| `adapters/websocket.test.ts` | 19 | `start()` opens a socket, emits `reconnecting`. `start()`/`stop()` are idempotent. Missing URL never opens a socket. Valid frames forwarded with the right shape. Malformed JSON dropped. Unknown kinds dropped. Bad quality dropped. Listener errors do not derail. Intentional `stop()` prevents reconnect. Server-drop triggers reconnect. Backoff grows. Heartbeat timeout closes + reconnects. Catch-up hook fires on open. `parseNormalizedMessage` strict-contract paths. |
| `contract.test.ts` | +1 | `BackendWebSocketTelemetryAdapter` conforms to `NormalizedTelemetryAdapter` (start/stop/subscribe). |

All tests use a `FakeWebSocket` and a `FakeTimers` harness. **No test
requires a real backend, real network, or any industrial protocol.**

## 10. Validation results

| Step | Result |
| --- | --- |
| `pnpm --filter @rvf/web lint` | ✅ 0 warnings, 0 errors (`--max-warnings 0`) |
| `pnpm --filter @rvf/web typecheck` | ✅ `tsc --noEmit` clean |
| `pnpm --filter @rvf/web test` | ✅ **20 test files, 147/147 tests** (119 prior + 28 new across factory, websocket, contract conformance) |
| `pnpm --filter @rvf/web build` | ✅ Compiled 2.2 s, static prerender 20/20, `/alarms` 8.06 kB / 130 kB first-load, `/operations` 7.77 kB / 129 kB. No warnings. |
| **Browser smoke (Playwright)** — default dev | ✅ 4/4: `/operations` no React fatals, `/alarms` no React fatals, `/portal` zero alarm content, no WebSocket "not available" errors. |
| **Browser smoke (Playwright)** — fallback dev with `source=websocket, url=''` | ✅ 4/4: simulator still drives the UI, no fatals, portal still alarm-free. |

## 11. Operations still works

Confirmed:

- `/operations` returns HTTP 200 from the dev server.
- "Live Operations Overview" heading visible.
- KPI cards, active job context, live trends, communication health
  panel, header alarm indicator continue rendering from the shared
  TelemetryStore (the simulator is still the underlying adapter in
  default config).
- No React 19 `getSnapshot` / `getServerSnapshot` warnings.
- No `Maximum update depth` errors.
- The shared runtime is still ref-counted via the same singleton in
  `operationsRuntime.ts` — Operations and Alarms continue to share
  one adapter.

## 12. Alarms still works

Confirmed:

- `/alarms` returns HTTP 200.
- "Alarm Center" heading visible.
- ISA-18.2 priority cards, active table, history table, realtime feed,
  quick actions all consume the same `useAlarmCenter` hook against the
  same store fed by the same factory-built adapter.
- Local acknowledge continues to work in-memory.
- No React 19 snapshot-identity errors.

## 13. Client Portal still has no alarms

Confirmed via a Playwright assertion that runs after a full
`networkidle` settle on `/portal`:

- "Production Overview" heading visible.
- `text=/Alarm Center/i` count is **0**.
- `text=/Active Alarms/i` count is **0**.

The portal does not import any adapter, does not subscribe to the
TelemetryStore, and does not consume `useAlarmCenter`. The runtime
sharing between Operations and Alarms does not leak into the portal.

## 14. Units / Sensors / Reports / Settings were not modified

`git status` after F2D shows the diff scoped strictly to:

- `apps/web/lib/env.ts`
- `apps/web/lib/telemetry/index.ts`
- `apps/web/lib/telemetry/adapters/websocket.ts`
- `apps/web/lib/telemetry/contract.test.ts`
- `apps/web/components/operations/operationsRuntime.ts`
- new files under `apps/web/lib/telemetry/` (factory + tests)
- this F2D_RESULT.md

Zero edits in `components/units/`, `components/sensors/`,
`components/reports/`, `components/settings/`,
`app/(rvf-console)/{units,sensors,reports,settings}/`, the design-system
tokens, or any branding asset.

## 15. No industrial protocols implemented in frontend

The frontend dependency graph does not gain a single industrial-protocol
import in F2D. A grep over the new + modified files for `mqtt`, `modbus`,
`opcua`, `opc-ua`, `node-red`, `nodered`, `thingsboard`, `plc`,
`historian`, `gateway-stick` returns zero occurrences in code (only the
documentary mentions in this file and the architecture documents that
explicitly call out the rule).

The browser still speaks one and only one transport: the normalized
WebSocket stream from the RVF backend, exactly as ADR-005 mandates.

## 16. Remaining technical debt

| Item | Why deferred |
| --- | --- |
| REST catch-up call inside `onCatchUp` | F2D ships the seam; the REST endpoint does not exist yet on the backend. Implementing it would require a backend that is out of scope. |
| `snapshot-update` parsing on the wire | Per ADR-005 §3 snapshots travel via REST. F2D intentionally drops any wire-level `snapshot-update` to keep the discipline visible. If a future phase decides to push snapshots over WebSocket, add a parser path here. |
| Visible "fallback to simulator" banner | Today the fallback emits a `console.info`. A small status pill on the Operations header would be friendlier for ops. Cosmetic. |
| Optional renaming of `operationsRuntime` → `sharedTelemetryRuntime` | F2 Runtime Integration Notes v1.0 §4 explicitly defers this to keep mechanical churn low. Touches no production behaviour. |
| Backoff-jitter range tunability | Hard-coded at 0–25 %. If the backend's reconnect storm characteristics warrant a different jitter envelope, expose it via `BackendWebSocketAdapterOptions`. |
| Per-page persistence of acknowledged alarms across refresh | Inherited F2C debt — independent of F2D. |

## 17. F2D checklist (from F2 Runtime Integration Notes v1.0 §17)

- [x] `SimulatedAdapter` continues to work exactly as before; never disabled.
- [x] `BackendWebSocketAdapter` can be mounted without changes to Operations / Alarms.
- [x] Operations works with the factory-selected adapter.
- [x] Alarms works with the factory-selected adapter.
- [x] No `useSyncExternalStore` warnings, no React 19 loops.
- [x] No hydration mismatch (SSR remains deterministic; no `Date.now()` introduced in render).
- [x] No industrial-protocol imports in the frontend.
- [x] Contract tests between simulator and backend adapter pass.
- [x] Automatic fallback to simulator if the backend URL is missing.
- [x] Reconnect does not duplicate intervals (timers cleared on stop; `intentionallyStopped` flag honoured).
- [x] Client Portal continues to show no internal alarms.

## 18. How to test locally

### Default (simulator)

```bash
pnpm --filter @rvf/web dev
# open http://localhost:3000/operations and http://localhost:3000/alarms
```

You should see the same live tiles and alarm rows that have shipped
since F2B/F2C.

### Future WebSocket-backed run

Once the backend's normalized WebSocket endpoint exists:

```bash
NEXT_PUBLIC_RVF_TELEMETRY_SOURCE=websocket \
NEXT_PUBLIC_RVF_TELEMETRY_WS_URL=wss://backend.rvf.example/telemetry \
pnpm --filter @rvf/web dev
```

The factory will build a `BackendWebSocketTelemetryAdapter` instead of
the simulator. The browser tabs `/operations`, `/alarms`, and `/portal`
should keep rendering with no visual change — they consume the store,
not the adapter.

### Explicit fallback test

```bash
NEXT_PUBLIC_RVF_TELEMETRY_SOURCE=websocket pnpm --filter @rvf/web dev
# (no URL set)
```

Pages still work (the runtime falls back to the simulator); the browser
console shows `[telemetry] … falling back to simulator.`

*
