# RVF Malinois — F4.5G.2-0 Operations Realtime Tile / Status Wiring Plan

> Phase **F4.5G.2-0 — Operations Realtime Tile / Status Wiring Plan**. Plan-first per the codified project pattern (F4.2A → F4.2B, F4.6A.0 → F4.6A.1, F4.6B-0 → F4.6B.1, F4.6C-0 → F4.6C.1, F4.6D-0 → F4.6D.1, F4.6E-0 → F4.6E.1, F4.6F-0 → F4.6F.1, F4.5G-0 → F4.5G.1).
> Documentation-only artifact. No frontend, backend, schema, migration, or runtime code is modified by F4.5G.2-0. Implementation lands in **F4.5G.2.1**.
> Last known head at authoring time: commit `cafccb6` (Refresh master roadmap after F4.5G.1).
>
> Upstream references:
> - Master Roadmap (most recent refresh): `docs/architecture/RVF_Malinois_Master_Roadmap.md` (commit `cafccb6`).
> - F4.5G.1 closeout (the chart adapter + drawer this phase must not regress): `docs/architecture/RVF_Malinois_F4_5G_1_Operations_Chart_Adapter_Expanded_Trend_View_Closeout.md` (commit `916d067`).
> - F4.5G-0 plan (locks the chart-side architecture this phase extends): `docs/architecture/RVF_Malinois_F4_5G_Operations_Chart_Adapter_Expanded_Trend_View_Plan.md` (commit `1028153`).
> - F4.6E.1 closeout (the realtime push this phase consumes): `docs/architecture/RVF_Malinois_F4_6E_1_WebSocket_SSE_Fan_Out_Closeout.md` (commit `51dc626`).
> - F4.6F.1 closeout (the historical trend API the chart already consumes): `docs/architecture/RVF_Malinois_F4_6F_1_Historical_Trend_API_Closeout.md` (commit `946a023`).
> - DX-3 (Definition of Done): `docs/operations/RVF_Malinois_Definition_of_Done.md` (commit `65cb736`).
> - ADR-005 (browser boundary; the browser does **not** evaluate alarms).

## 1. Purpose

F4.5G.2-0 is the **plan-first** phase for wiring the Operations screen's tile / status surfaces to the F4.6E.1 realtime fan-out. F4.5G.1 (`916d067`) wired the chart area to the F4.6F.1 trend API and deliberately deferred realtime tail consumption to this phase. F4.5G.2-0 scopes that deferral narrowly: which tile / status surfaces consume which event kinds, how they coexist with the chart's REST cache, how the simulator / mock fallback stays explicit, and how the existing simulator-string `unitId` limitation (e.g. `EMMAD-01`) is contained until backend unit selection lands.

Naming: the implementation will land as **F4.5G.2.1** (mirrors F4.5G-0 → F4.5G.1, F4.6E-0 → F4.6E.1). When the roadmap refers to "F4.5G.2" in §3 / §7 it points at the same implementation step — this plan and its implementation pair are referenced as F4.5G.2-0 / F4.5G.2.1 below for unambiguous DX-3 tracking.

What this phase does:

- Locks **which Operations tile / status surfaces consume which F4.6E.1 event kinds** and which they intentionally ignore.
- Defines the **shared-vs-new hook decision** (consume the existing `useOperationsTrendSeries` cache key for chart-tail invalidation; introduce one new narrow hook for tile / status updates).
- Defines the **UUID / mock-ID guardrail** explicitly so a future regression cannot silently issue `unitId='EMMAD-01'` against the live backend.
- Defines the **simulator / mock fallback policy**, the **freshness / source labels**, the **test plan**, the **risks**, and the **F4.5G.2.1 acceptance criteria**.

What this phase does **not** do:

- It does not modify any backend file.
- It does not modify any frontend file. (Including `apps/web/lib/realtime/`, `apps/web/lib/telemetry/adapters/`, `apps/web/components/operations/`.)
- It does not modify Prisma schema, migrations, seed, or ingestion / projection / alarm / realtime / trend backend behavior.
- It does not introduce a backend latest-value API (candidate **F4.6C.2**; sized only when a screen consumer requires pull semantics).
- It does not migrate `<LiveActiveAlarmsPanel>` off its browser-side `evaluateReading(...)` path — see §7.2.
- It does not migrate Wells / Equipment / Catalog / Tags / Settings / Reports screens (candidate F4.5H).
- It does not introduce alarm-chart annotation overlays (candidate F4.5G.3).
- It does not introduce notifications (toast / banner / push), authentication, or external integrations (MQTT / Node-RED / OPC-UA / ThingsBoard).

## 2. Current Repository State

Drawn from `git log`, the master roadmap (`cafccb6`), and direct inspection of `apps/web/`.

| Phase | Status | Commit |
|---|---|---|
| Backend telemetry-persistence arc (F4.6B.1 → F4.6F.1) | Closed end-to-end | `1495457` / `49a8349` / `d35a2b8` / `51dc626` / `946a023` |
| F4.5A → F4.5E frontend F4 API client + adapter | Closed | through `6af42fa` |
| F4.5F first per-screen migration (Units selector) | Closed | `9e861ce` |
| F4.5G-0 Operations chart plan | Closed | `1028153` |
| F4.5G.1 Operations chart adapter + expanded trend view | Closed | `916d067` |
| Master roadmap refresh after F4.5G.1 | Closed | `cafccb6` |
| **F4.5G.2-0 — Operations Realtime Tile / Status Wiring Plan** (this document) | **Current** | *(pending)* |
| F4.5G.2.1 — Operations Realtime Tile / Status Wiring Implementation | Deferred (next implementation phase) | — |

### 2.1 What the Operations tiles / status surfaces render today

`apps/web/app/(rvf-console)/operations/page.tsx` (server shell) mounts `<OperationsTelemetryRuntime />` once on the client and renders the same chrome F2B established. The data-bearing children:

- **`<LiveMultiphaseUnitGrid />`** — three `<LiveMultiphaseUnitCard>`s (one per `OPERATIONS_JOBS` entry).
- **`<LiveMultiphaseUnitCard>`** (`apps/web/components/operations/LiveMultiphaseUnitCard.tsx`) — reads `useUnitTelemetrySnapshot({ jobId, snapshot, nowMs })` + `useNowTick(5000)`. Renders a `UnitBadgeStatus` chip (`TESTING / DEGRADED / ALARM / OFFLINE`) rolled up by `rollUpUnitStatus(unitSnap.byTag, DISPLAYED_TAGS)`, a 3×2 grid of six `<LiveVariableTile>`s, and a footer with `Duration` / `Last Update` / `Active Alarms` / `Stale Signals`.
- **`<LiveVariableTile>`** (`apps/web/components/operations/LiveVariableTile.tsx`) — reads `useLiveValue(tile.tag, ...)`, `useAlarmState(tile.tag, ...)`, `useHistoryBuffer(jobId, tile.tag)`, `useNowTick(5000)`. Renders an icon row + big number + Sparkline. Tile shell color comes from `shellByState[state]` driven by the browser-side `useAlarmState` evaluator output (`alarm_high` / `warning_low` / etc.).
- **`<LiveActiveAlarmsPanel jobs={...} />`** (`apps/web/components/operations/LiveActiveAlarmsPanel.tsx`) — **calls `evaluateReading(reading, job.snapshot, { nowIso })` directly in the browser** to derive the displayed alarm row set. Today this is acceptable because the snapshot path is F2-simulator-only; once the api-mode backend is the source of truth it would violate ADR-005 if left untouched. F4.5G.2.1 **does not migrate this panel** (out of scope); the constraint is documented in §7.2 so a follow-up phase owns it.
- **`<LiveCommunicationHealthPanel />`** (`apps/web/components/operations/LiveCommunicationHealthPanel.tsx`) — reads `useConnectionStatus()` and renders four rows: `Normalized Stream` (F2A connection), `F2 Simulated Source` (the simulator), `Backend WebSocket: NOT CONNECTED`, `Field Protocols: NOT ACTIVE IN BUILD`. **F4.5G.2.1 owns the "Backend WebSocket" row's label and status** so the operator sees an honest "CONNECTED · F4.6E.1" / "RECONNECTING" / "NOT CONNECTED" state.
- **`<FieldConditionsPanel />`** — static; no telemetry; out of scope.
- **`<OperationsHeaderRight />`** — derives a chip from `useAlarmSummary(HEADER_JOBS)`. The summary is computed in the browser today from the F2 store. Out of scope.

The chart area (`<LiveTrendsPanelLive>` + `<TrendDrawer>`) was migrated by F4.5G.1 (`916d067`) — both consume the F4.6F.1 trend API through the shared `useOperationsTrendSeries` hook in api mode and the F2 simulator path in mock mode. F4.5G.2.1 must preserve that pair untouched except for the **realtime tail invalidation** seam described in §7.1.

### 2.2 What the F2 simulator drives today

`startOperationsTelemetry()` / `stopOperationsTelemetry()` in `apps/web/components/operations/operationsRuntime.ts` boot the F2A `SimulatedNormalizedTelemetryAdapter` and connect it to the singleton `TelemetryStore`. The hooks above (`useUnitTelemetrySnapshot` / `useLiveValue` / `useAlarmState` / `useHistoryBuffer` / `useConnectionStatus`) all read from that store. `<LiveCommunicationHealthPanel>`'s "Normalized Stream" row is the F2A connection — currently *not* the F4.6E.1 socket.

The simulator job set comes from `OPERATIONS_JOBS` (`apps/web/components/operations/data/operationsJobs.ts`), a typed 3-tuple bound to `JOB_HP_HF` / `JOB_MP` / `JOB_STALE` from `apps/web/lib/jobs/snapshots.mock.ts`. Each job's `unitId` is a catalog-style string (`EMMAD-01` / `EMMAD-02` / `PSK-03`) from `apps/web/lib/catalog/units.mock.ts`, **not** a backend UUID. See §9 for the implications.

### 2.3 What F4.5G.1 already wired

- `apps/web/lib/hooks/useOperationsTrendSeries.ts` — TanStack Query hook keyed by `['f4-trends', unitId, canonicalTagName, window, bucket, aggregate, qualityPolicy, fromEpoch, toEpoch]`. Used by both `<LiveTrendsPanelLive>` (mini, `window='15m'`, `refetchInterval=30_000`) and `<TrendDrawer>` (expanded, user-selected window, `refetchInterval=60_000`). `getDataSource()`-gated; in mock mode the panel keeps the F2 ring-buffer path via `useHistoryBuffer`. **Cache key shape is stable; F4.5G.2.1 will `queryClient.invalidateQueries({ queryKey: ['f4-trends'] })` on socket reconnect** — no key change required.
- `apps/web/components/operations/TrendDrawer.tsx` — portal-based right-side drawer; ESC / backdrop / close-button; range pills `15m / 1h / 6h / 24h / 7d`; same hook. F4.5G.2.1 does not modify the drawer.
- `apps/web/lib/api-data/f4/trendsToChartSeries.ts` — `trendsToChartSeries` / `trendsLatestPoint` / `isChartSeriesEmpty`. Unchanged by this phase.
- `apps/web/lib/api/f4/{types,endpoints,index}.ts` — additive bucketed-mode types. Unchanged by this phase.

### 2.4 What the F4 realtime client exposes today

- `apps/web/lib/realtime/socket.ts` — `createSocketClient(url)` returns `{ socket, onState, onMessage, disconnect }`. Path `/api/v1/stream`. Reconnects with exponential backoff + jitter. The `onMessage` listener filter only checks `'kind' in first` against the F0/F2 `RealtimeMessage` union — **it does not yet narrow on the F4.6E.1 `schema` / `kind` envelope shape**.
- `apps/web/lib/realtime/RealtimeProvider.tsx` — opens **one** socket per browser tab against `publicEnv.wsUrl` (default `ws://localhost:4000`); exposes `useRealtime()` / `useConnectionState()`. Already mounted at the app root via `apps/web/components/providers/Providers.tsx` so a socket is open on every page load.
- `apps/web/lib/realtime/telemetryStore.ts` — Zustand-flavored store; ring buffer per `(jobId, tag)`; fed by the F2A simulator (or F2D adapter when `NEXT_PUBLIC_RVF_TELEMETRY_SOURCE='websocket'` and `NEXT_PUBLIC_RVF_TELEMETRY_WS_URL` is set). **Indexed by `jobId`** — not by backend `unitId` — so F4.6E.1 payloads (which carry backend `unitId` / `canonicalTagId` UUIDs) **do not map cleanly** into the store without translation. F4.5G.2.1 does **not** push F4.6E.1 events into the F2 store; it builds a parallel narrow view-model state (§7).
- `apps/web/lib/telemetry/adapters/websocket.ts` — F2D `BackendWebSocketTelemetryAdapter`. Wired but expects the F2 envelope, not F4.6E.1's three event kinds. **No code path consumes `RealtimeF4Event` envelopes today.**
- `apps/web/lib/realtime/telemetryStore.test.ts` / `apps/web/lib/realtime/ringBuffer.test.ts` exist; no spec covers F4.6E.1 envelope consumption.

### 2.5 What F4.6E.1 events look like on the wire (from `packages/types/src/realtime.ts`)

Per-tenant Socket.IO rooms. Three event kinds with a `'rvf.realtime.v1'` schema:

- **`telemetry.reading.accepted`** — every accepted reading (any quality). Payload: `{ telemetryReadingId, tenantId, unitId, sensorId, canonicalTagId, value, engineeringUnit, quality, timestamp, source, sequence }`.
- **`live_reading.updated`** — quality-gated to `good`; emitted on projection outcomes `created` / `updated` only. Payload: `{ liveReadingId, tenantId, unitId, sensorId, canonicalTagId, value, engineeringUnit, quality: 'good', timestamp, source, ingestionTimestamp, outcome }`.
- **`alarm.event.created`** — emitted on per-rule `triggered` outcomes only; never on `skipped_duplicate_active` / `no_threshold_violated`. Payload: `{ alarmEventId, tenantId, unitId, canonicalTagId, alarmRuleId, severity, triggeredValue, thresholdViolated, state: 'active', firstTriggeredAt }`.

All three carry backend UUIDs (`unitId` / `canonicalTagId` / `tenantId`). No simulator-string ids appear on the wire.

Subscribe payload shape (per-tenant only; per-unit join is the forward-compat seam but the backend does not fan-out per-unit yet — F4.6E.1 closeout §6 / §11): `SubscribeF4Request { tenantId: string; unitIds?: string[] }`.

### 2.6 Existing env variables

From `apps/web/lib/env.ts`:

- `NEXT_PUBLIC_RVF_TELEMETRY_SOURCE` — `'simulated'` (default) | `'websocket'`. Picks F2A vs F2D for the **telemetry store** (independent of F4.6E.1).
- `NEXT_PUBLIC_RVF_TELEMETRY_WS_URL` — URL the F2D adapter connects to.
- `NEXT_PUBLIC_RVF_DATA_SOURCE` — `'mock'` (default) | `'api'`. The F4.5A switch; gates the REST adapter.
- `NEXT_PUBLIC_RVF_API_BASE_URL` — F4 backend REST base, default `http://localhost:4000/api/v1`.
- `publicEnv.wsUrl` — `NEXT_PUBLIC_WS_URL` ?? `ws://localhost:4000`. **Already in use by `RealtimeProvider`.**

F4.5G.2.1 should reuse these. The plan does **not** introduce a new env variable.

### 2.7 Known limitation: simulator unit IDs ≠ backend UUIDs

Flagged by F4.5G.1 closeout (§9 "Known Limitations") and roadmap §10 risks. `OPERATIONS_JOBS[i].job.unitId` is `'EMMAD-01'` / `'EMMAD-02'` / `'PSK-03'` (catalog strings). The F4.6E.1 events all carry backend UUIDs (`measurement_units.id`). No mapping table exists in the frontend today between simulator catalog strings and backend UUIDs. This is the central design problem of §9 and shapes the §7 boundary.

## 3. Architectural Position

Desired Operations data flow once F4.5G.2.1 ships:

```
┌────────────────── On mount (mock OR api mode) ──────────────────────────────────────────────┐
│                                                                                              │
│  REST trend fetch (existing F4.5G.1 path; unchanged)                                         │
│       │                                                                                      │
│       ▼                                                                                      │
│  <LiveTrendsPanelLive> + <TrendDrawer> render via useOperationsTrendSeries                   │
│                                                                                              │
│  F2 simulator (existing path) feeds <LiveMultiphaseUnitCard> / <LiveVariableTile> /          │
│  <LiveActiveAlarmsPanel> as today                                                            │
│                                                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────── Realtime connection (F4.5G.2.1) ──────────────────────────────────────────┐
│                                                                                              │
│  RealtimeProvider keeps the existing Socket.IO connection open (no change)                   │
│  ── Operations screen mounts useOperationsRealtimeF4({ tenantId, enabled: isApi })           │
│       │                                                                                      │
│       ├─► emit('subscribe', { tenantId })   ── join tenant:<uuid> room                       │
│       │                                                                                      │
│       ▼                                                                                      │
│  on 'live_reading.updated' → if (unitId, canonicalTagId) tracked → update tile view-model    │
│  on 'telemetry.reading.accepted' → IGNORED (avoids double-counting; quality not gated)       │
│  on 'alarm.event.created' → optional status-badge / count update (see §8)                    │
│  on socket 'connected' (after reconnect) → invalidateQueries(['f4-trends'])                  │
│                                                                                              │
│  ── on unmount: emit('unsubscribe', { tenantId }); clear local view-model                    │
│                                                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────── Mock / simulator mode (unchanged) ────────────────────────────────────────┐
│                                                                                              │
│  When isApi === false, useOperationsRealtimeF4 stays disabled:                               │
│    - no subscribe / unsubscribe emit                                                         │
│    - no event listeners attached                                                             │
│    - tile / status surfaces continue to render from the F2 simulator path                    │
│  <LiveCommunicationHealthPanel> labels the F4 row as "NOT CONNECTED · MOCK MODE"             │
│                                                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

Three principles govern the placement:

1. **Realtime is tail / freshness, never history.** F4.5G.2.1 may update a tile's *latest displayed value* and a *last-update timestamp* from `live_reading.updated`, but it never builds a history buffer from realtime events. Historical reads continue through REST (F4.6F.1) via the existing chart hook.
2. **Realtime is not source-of-truth.** On reconnect, the chart hook invalidates its TanStack Query cache so the next render fetches from REST. Tile view-model state during the gap is best-effort — the UI labels it stale per §12.
3. **Browser does not evaluate alarms.** F4.5G.2.1 may *display* a count or badge derived from `alarm.event.created` payloads, but does not compare values against thresholds. Browser-side alarm evaluation in `<LiveActiveAlarmsPanel>` remains the F2 simulator path and is out of scope here (§7.2 / §13).

ADR-005 invariants preserved:

- Browser does not write canonical telemetry, does not call `prisma`, does not evaluate alarms server-side, and **never lies about freshness**.
- Realtime is delivery, not durable storage. Reconnect path is REST resync, not replay buffer.

## 4. Adapter / Ownership and Boundaries

| Concern | Owner layer | Notes |
|---|---|---|
| Socket.IO connection lifecycle (open / close / reconnect, exponential backoff) | Existing `apps/web/lib/realtime/socket.ts` + `RealtimeProvider`. F4.5G.2.1 does **not** modify either. | One socket per browser tab; already running on every page. |
| Per-tenant room subscription (`subscribe { tenantId }` emit) | New thin hook `apps/web/lib/hooks/useOperationsRealtimeF4.ts` (path TBD by F4.5G.2.1). Joins on mount; unsubscribes on unmount. | Forward-compat seam: `unitIds?` not populated yet (backend does not fan-out per-unit per F4.6E.1 closeout §6 / §11). |
| F4 envelope narrowing (`RealtimeF4Event` discriminated union) | Same hook. Uses the `schema === 'rvf.realtime.v1'` predicate + `kind` discriminator from `packages/types/src/realtime.ts`. | Existing `createSocketClient` listener only handles F0/F2 `RealtimeMessage`; F4.5G.2.1 adds a narrow `socket.on(eventName, handler)` for each F4 kind (or one `onAny` if simpler). |
| Tile / status view-model state | Same hook. Returns a stable per-`(unitId, canonicalTagName)` map `{ latestValue, latestTimestamp, sourceKind, lastEventReceivedAt }`. No global Zustand store; React state inside the hook (or a small dedicated Zustand slice if multiple consumers need to read it). | The F2 `TelemetryStore` is **not** extended — its key is `(jobId, tag)`, not `(unitId, canonicalTagId)`, and the F2 path stays intact. |
| Stale / freshness state | Same hook — returns `{ lastEventReceivedAt: string \| null, isStale: boolean, source: 'mock' \| 'rest' \| 'rest+realtime' }`. | Surfaced to tile / status components so the chip / footer can show non-authoritative state honestly per ADR-005. |
| Mock / simulator fallback | When `isApiSource() === false`, the new hook returns the disabled-state default `{ enabled: false, … }`. Components continue to read from `useUnitTelemetrySnapshot` / `useLiveValue` (F2 path). | No silent crossover. |
| Reconnect → trend invalidation | New hook listens to `createSocketClient`'s `'reconnect'` / `'connected'` state transitions; on the post-reconnect `connected`, calls `queryClient.invalidateQueries({ queryKey: ['f4-trends'] })`. | Reuses the F4.5G.1 cache key shape — no change to `useOperationsTrendSeries`. |
| Backend UUID guardrail | Same hook. Only opens the subscription when `isApi && tenantId.length > 0 && /^[0-9a-f-]{32,}$/i.test(unitId)` — i.e. the unit identifier looks like a UUID. Otherwise the hook stays disabled and labels the surface as "mock". | See §9 for the rationale and the recommendation. |
| `<LiveCommunicationHealthPanel>` F4 row | The panel reads the same hook's `{ enabled, connectionState, lastEventReceivedAt }` outputs. | Replaces the static `Backend WebSocket: NOT CONNECTED` row with an honest `CONNECTED · F4.6E.1` / `RECONNECTING` / `NOT CONNECTED · MOCK MODE` row. |
| Alarm / annotation rendering | Out of scope for tiles in F4.5G.2.1. Optional status-badge count from `alarm.event.created` only if §8 demands it. `<LiveActiveAlarmsPanel>` stays on its existing browser-side path. | Lifecycle UI deferred to candidate F4.6D.3; chart annotations to candidate F4.5G.3. |

## 5. Existing Operations Tile / Status Surface Inventory

Direct repository evidence as of `cafccb6`. No surface is invented here.

### 5.1 Operations page + cards / panels

- `apps/web/app/(rvf-console)/operations/page.tsx` — server shell.
- `apps/web/components/operations/OperationsTelemetryRuntime.tsx` — F2A simulator runtime boot.
- `apps/web/components/operations/LiveMultiphaseUnitGrid.tsx` + `LiveMultiphaseUnitCard.tsx` + `LiveVariableTile.tsx` — **tile / status target of F4.5G.2.1**.
- `apps/web/components/operations/LiveActiveAlarmsPanel.tsx` — **out of scope** for F4.5G.2.1 (browser-side `evaluateReading` path).
- `apps/web/components/operations/LiveCommunicationHealthPanel.tsx` — **in scope** for the F4 socket row only.
- `apps/web/components/operations/FieldConditionsPanel.tsx` — out of scope.
- `apps/web/components/operations/OperationsHeaderRight.tsx` — out of scope.
- `apps/web/components/operations/LiveTrendsPanelLive.tsx` + `TrendDrawer.tsx` — **F4.5G.1 chart pair; touched only to wire reconnect invalidation**.

### 5.2 View-model + bindings

- `apps/web/components/operations/data/operationsJobs.ts` — `OPERATIONS_JOBS` typed 3-tuple.
- `apps/web/components/operations/viewModel.ts` — `OPERATIONS_TILES` (6 tiles per unit: `q_liquid` / `q_gas` / `water_cut` / `p_inlet` / `t_inlet` / `dp_weir`), `rollUpUnitStatus(byTag, tagsToConsider)`, `findTileByTag`.
- `apps/web/lib/jobs/snapshots.mock.ts` — `JOB_HP_HF` / `JOB_MP` / `JOB_STALE`. Each carries a simulator-string `unitId` (§9).
- `apps/web/lib/catalog/units.mock.ts` — catalog ids `EMMAD-01` / `EMMAD-02` / `PSK-03`.

### 5.3 Hooks the tile / status surfaces read today

- `useUnitTelemetrySnapshot({ jobId, snapshot, nowMs })` — `lib/hooks/useUnitTelemetrySnapshot.ts`.
- `useLiveValue(tag, { jobId, snapshot, nowMs })` — `lib/hooks/useLiveValue.ts`.
- `useAlarmState(tag, { jobId, snapshot, nowMs })` — `lib/hooks/useAlarmState.ts`. **Browser-side alarm evaluation.** F4.5G.2.1 does not migrate this; out of scope (§7.2).
- `useHistoryBuffer(jobId, tag)` — `lib/hooks/useHistoryBuffer.ts`.
- `useNowTick(5000)` — `lib/hooks/useNowTick.ts`.
- `useConnectionStatus()` — `lib/hooks/useConnectionStatus.ts`. Returns the F2 store's `CommunicationStatus`.
- `useAlarmSummary(jobs)` — `lib/hooks/useAlarmSummary.ts`.

None of the above consume F4.6E.1 envelopes today.

### 5.4 Existing freshness / stale indicators

- `<LiveVariableTile>`'s footer label flips to `Stale` / `Offline` driven by `live.status` (F2 store) when the simulator stops feeding.
- `<LiveMultiphaseUnitCard>`'s footer `Last Update` formats `newestTs` against `useNowTick(5000)` and turns `text-status-stale` when older than 30 s.
- `<LiveActiveAlarmsPanel>` shows `STALE SIGNAL` / `OFFLINE SIGNAL` rows from the F2 stale detector.
- `<LiveCommunicationHealthPanel>` shows `Normalized Stream` connection state from the F2 store.
- **None of these are wired to the F4.6E.1 socket.** F4.5G.2.1 adds an honest F4-socket-aware row to `<LiveCommunicationHealthPanel>` and (optionally, per §10) a per-tile `last realtime update` chip — but the existing F2-driven indicators stay intact so mock mode keeps working.

### 5.5 Existing tests on Operations / hooks

- `apps/web/components/operations/MultiphaseUnitCard.test.tsx`, `Sparkline.test.tsx`, `viewModel.test.ts`, `alarmSummary.test.ts`, `operationsRuntime.test.ts`, `LiveTrendsPanelLive.test.tsx`, `TrendDrawer.test.tsx`.
- `apps/web/lib/hooks/useHistoryBuffer.test.tsx`, `useAlarmCenter.test.tsx`, `useAlarmSummary.test.tsx`, `snapshotStability.test.tsx`, `useOperationsTrendSeries.test.tsx`, `useUnitsFleet.test.tsx`.
- **No realtime-envelope spec on `socket.ts`**; no F4.6E.1-aware test fixture today.
- Frontend framework: vitest + `@testing-library/react@^16.0.1` + `@testing-library/jest-dom@^6.6.3` (jsdom). Playwright is wired for e2e but not the F4.5G.2.1 primary surface.

## 6. Existing Realtime Frontend Surface Inventory

Direct evidence as of `cafccb6`.

### 6.1 Socket client

- `apps/web/lib/realtime/socket.ts` — `createSocketClient(url)`:
  - `socket-io-client@^4.8.1`; path `/api/v1/stream`; transports `['websocket']`; `reconnectionAttempts: Infinity`; backoff 1 s → 10 s with `randomizationFactor: 0.5`.
  - State transitions: `connect` → `{ status: 'connected', since }`; `reconnect_attempt` → `{ status: 'reconnecting', attempt, lastDataAt }`; `disconnect` → `{ status: 'disconnected', lastDataAt }`.
  - Message routing: `socket.onAny` records `lastDataAt` and forwards only payloads matching the F0/F2 `RealtimeMessage` predicate (`'kind' in first`).
  - **No `subscribe` / `unsubscribe` emit anywhere in the frontend today** — the socket connects but does not join F4.6E.1 rooms.

### 6.2 Provider / hooks

- `apps/web/lib/realtime/RealtimeProvider.tsx` — opens one socket on `publicEnv.wsUrl` (default `ws://localhost:4000`). Already mounted via `apps/web/components/providers/Providers.tsx` so a socket exists on every page.
- `useRealtime()` / `useConnectionState()` — surface the `ConnectionState`. F4.5G.2.1's new hook uses `useRealtime().client` to access the Socket.IO client without re-creating it.

### 6.3 Store + adapter

- `apps/web/lib/realtime/telemetryStore.ts` — Zustand store keyed by `(jobId, tag)`. **Not extended** by F4.5G.2.1 because the F4.6E.1 envelope is keyed by backend `(unitId, canonicalTagId)`; cross-store synthesis would require a UUID ↔ simulator-string map that does not exist.
- `apps/web/lib/telemetry/adapters/websocket.ts` — F2D `BackendWebSocketTelemetryAdapter`. **Wired but does not yet consume F4.6E.1 envelopes.** F4.5G.2.1 does not modify it.

### 6.4 F4.6E.1 envelope consumption today

**None.** No code in `apps/web/` imports `RealtimeF4Event`, `LiveReadingUpdatedPayload`, `AlarmEventCreatedPayload`, or `SubscribeF4Request` from `@rvf/types`. F4.5G.2.1 introduces the first import.

### 6.5 Realtime tests today

- `apps/web/lib/realtime/telemetryStore.test.ts` — store invariants (F2 envelope only).
- `apps/web/lib/realtime/ringBuffer.test.ts` — ring buffer invariants.
- **No `socket.ts` spec**; no F4.6E.1-aware fixture.

### 6.6 Env (recap from §2.6)

`NEXT_PUBLIC_RVF_DATA_SOURCE` / `NEXT_PUBLIC_RVF_TELEMETRY_SOURCE` / `NEXT_PUBLIC_RVF_TELEMETRY_WS_URL` / `NEXT_PUBLIC_RVF_API_BASE_URL` / `publicEnv.wsUrl`. F4.5G.2.1 reuses all five; no new var added.

## 7. Proposed F4.5G.2.1 Implementation Boundary

F4.5G.2.1 wires **realtime tail and the F4-socket health row only**, on top of the F4.5G.1 chart pair. Scope is intentionally narrow.

### 7.1 In-scope for F4.5G.2.1

- **New hook `useOperationsRealtimeF4`** at `apps/web/lib/hooks/useOperationsRealtimeF4.ts` (path TBD by F4.5G.2.1). Owns:
  - `subscribe { tenantId }` on mount (skipping the emit when disabled per §9).
  - F4 envelope narrowing — discriminate by `schema === 'rvf.realtime.v1'` and `kind`.
  - Filter inbound events by tracked `(unitId, canonicalTagId)` pairs (passed in by the panel).
  - Maintain a small per-`(unitId, canonicalTagName)` view-model: `{ latestValue, latestTimestamp, lastEventReceivedAt }` keyed for direct lookup by the tile.
  - On reconnect (`'connected'` after a `'reconnecting'`): `queryClient.invalidateQueries({ queryKey: ['f4-trends'] })` (reuses F4.5G.1 cache key).
  - `unsubscribe` on unmount; clear local view-model.
  - Returns `{ tileState, connection, lastEventReceivedAt, source }` for components to consume.
- **`<LiveCommunicationHealthPanel>` F4 row update.** Replace the static `Backend WebSocket: NOT CONNECTED` row with `Backend WebSocket: CONNECTED · F4.6E.1` / `RECONNECTING` / `NOT CONNECTED · MOCK MODE` derived from the new hook. Only the row content changes; the panel layout / other rows are untouched. F2 connection row stays.
- **Optional opportunistic tile latest-value update.** When the hook receives a `live_reading.updated` for a tracked `(unitId, canonicalTagName)`, expose the new value via the hook's `tileState` map. `<LiveVariableTile>` *may* render the realtime value when available **alongside** the F2-derived display value — but the recommended posture (per §10) is to render realtime as a secondary "last live" chip and leave the primary number on its existing F2 path, so mock mode stays stable. **Defer the primary-source decision to repo evidence at implementation time** — if `<LiveVariableTile>` cannot honor both sources cleanly, the tile stays on F2 and the realtime update is shown only as a `last live update HH:MM:SS` chip in the card footer.
- **Reconnect invalidation seam on `useOperationsTrendSeries` cache key.** No change to the hook itself; the new realtime hook calls `queryClient.invalidateQueries({ queryKey: ['f4-trends'] })` on `'connected'`-after-`'reconnecting'`.
- **TanStack Query usage**: the new hook does NOT issue REST queries; it only uses `useQueryClient()` to invalidate the existing key.
- **Source labeling.** The hook surfaces a `source` value (`'mock' | 'rest' | 'rest+realtime'`) so `<LiveCommunicationHealthPanel>` and (optionally) `<LiveVariableTile>` can label the active path honestly. Production builds with `NEXT_PUBLIC_RVF_DATA_SOURCE=api` and a working socket → `'rest+realtime'`. Mock builds → `'mock'`. api mode with disconnected socket → `'rest'` (chart works, realtime doesn't).
- **Tests** per §14.

### 7.2 Out-of-scope for F4.5G.2.1

- **`<LiveActiveAlarmsPanel>` migration.** It calls `evaluateReading(...)` in the browser today; replacing this with server-evaluated `alarm.event.created` consumption is its own design surface (UUID mapping, alarm lifecycle deferred, ack/clear UI deferred). Owned by candidate **F4.6D.2 — Alarm Events Read API** + a separate frontend phase.
- **Alarm chart annotations.** Deferred (candidate F4.5G.3).
- **Notifications.** No toast / banner / push.
- **Authentication / authorization.** Inherited no-auth posture.
- **Backend changes.** None. F4.5G.2.1 is entirely frontend.
- **Latest-value pull API.** Candidate F4.6C.2; not introduced.
- **F2D `BackendWebSocketTelemetryAdapter` migration to F4.6E.1 envelope.** The F2D adapter stays on the F2 envelope; the new hook reads directly off `createSocketClient`'s `socket` (via `useRealtime().client`). A future phase may converge the two adapters — not this one.
- **Push of F4.6E.1 events into the F2 `TelemetryStore` ring buffer.** Out of scope (keys don't align — see §6.3).
- **Wells / Equipment / Catalog / Tags / Settings / Reports screens.** Independent per-screen tasks (candidate F4.5H).
- **URL-based deep-linking / external sharing.** N/A.

### 7.3 What F4.5G.2.1 explicitly does **not** touch

- `apps/backend/` — no change.
- `apps/backend/prisma/` — no change.
- `packages/types/` — no change. The F4.6E.1 `RealtimeF4Event` envelope types are consumed as-is.
- `packages/ui/` — no change.
- `apps/web/lib/realtime/{socket,RealtimeProvider,telemetryStore,ringBuffer}.ts` — no change.
- `apps/web/lib/telemetry/` — no change.
- `apps/web/lib/api/f4/` / `apps/web/lib/api-data/f4/` — no change (F4.5G.1 types remain).
- `apps/web/lib/hooks/useOperationsTrendSeries.ts` — no signature change (cache key unchanged).
- `apps/web/components/operations/{TrendDrawer,LiveTrendsPanelLive}.tsx` — only the new hook is *referenced* if reconnect-invalidation is wired from the panel; ideally the new hook owns the invalidation internally so the chart files stay untouched.
- `docker-compose.yml`, root `package.json`, lockfile, `turbo.json`, `tsconfig*.json`, `.env*`, CI config.

## 8. Realtime Event Consumption Policy

Per event kind, with rationale:

### 8.1 `telemetry.reading.accepted` — **ignored** for tiles

- The trend area already consumes `live_reading.updated` (via the F4.5G.1 plan §9) for `good`-quality tail updates; consuming `telemetry.reading.accepted` *also* would re-introduce double-counting (same canonical reading would fire both events for `good` samples) and pollute the tile against the `good_only` policy that backs `live_readings`.
- F4.5G.2.1 explicitly ignores this kind. A future screen that needs "every accepted sample regardless of quality" (e.g. an audit / forensics view) consumes this kind explicitly.

### 8.2 `live_reading.updated` — **primary**

- The driver for tile latest-value + last-update timestamp updates.
- Apply only when the payload's `(unitId, canonicalTagId)` matches a tracked tile slot.
- The payload's `timestamp` is the reading's timestamp; the payload's `ingestionTimestamp` is when the backend accepted it. Tile freshness uses `ingestionTimestamp` (so a late backfill doesn't bump "last update" backwards). Tile *displayed value* uses the `value` (after `Number(payload.value)`).
- Duplicate / out-of-order: keep the highest `timestamp` per slot (`live_readings` is watermark-gated server-side, so out-of-order arrivals should be rare, but the hook tolerates them anyway).
- The hook does **not** push these events into the F2 store; the tile reads from the hook's own view-model when in api mode.

### 8.3 `alarm.event.created` — **deferred for tiles**; **optional** small count badge

- F4.5G.2.1 may render a small `Backend alarm events (last 1h)` counter on `<LiveCommunicationHealthPanel>` derived from realtime events — purely informational, never a substitute for the lifecycle UI deferred to F4.6D.2 / F4.6D.3.
- The tile and the card badge stay on the F2 simulator's browser-side evaluator until candidate F4.6D.2 ships a read API and a follow-up frontend phase consumes it.
- **Browser must not evaluate.** The hook only displays counts of server-evaluated events; it never compares values against thresholds.

### 8.4 Duplicate / out-of-order behavior

- Drop any event whose `timestamp < currentSlot.timestamp` for the matching `(unitId, canonicalTagId)`.
- Drop any event whose `tenantId !== subscribedTenantId`.
- Drop any event whose `(unitId, canonicalTagId)` is not tracked.
- Drop any event whose schema is not `'rvf.realtime.v1'`.
- Realtime cannot double-append chart data because F4.5G.2.1 **does not modify the trend hook's data** — the trend cache is invalidated on reconnect only, and refetches REST. Tile view-model state is independent.

## 9. UUID / Mock ID Guardrail

This is the central risk for F4.5G.2.1. Repo evidence:

- `OPERATIONS_JOBS[i].job.unitId` resolves to `'EMMAD-01'` / `'EMMAD-02'` / `'PSK-03'` (`apps/web/lib/catalog/units.mock.ts`).
- F4.6E.1 events all carry backend UUIDs for `unitId` / `canonicalTagId` / `tenantId` (`packages/types/src/realtime.ts` — every payload field typed `string` but documented as UUID).
- F4.5G.1's chart hook already accepts non-UUID `unitId` in mock mode; in api mode against the live backend the trend endpoint would 400 on a non-UUID `unitId` (Zod refine in `apps/backend/src/telemetry/contracts/trends.ts`). Today this surfaces as an `isError` state on the chart; F4.5G.1 closeout §9 names this as a known limitation.
- No mapping table exists in the frontend between simulator catalog ids and backend UUIDs. Building one would re-introduce the "browser owns identity resolution" smell the project has deliberately avoided.

The four options framed in the brief:

- **(A) Realtime-only with mock-safe IDs; do not call UUID-requiring APIs.** Feasible: the hook can subscribe to `tenant:<uuid>` rooms without referencing `unitId` (the per-unit-room join is forward-compat seam per F4.6E.1 closeout §6 / §11; the server currently fans out per-tenant only). Tracked `(unitId, canonicalTagId)` filtering happens client-side. **Problem:** the inbound `unitId` is a backend UUID; matching it against `OPERATIONS_JOBS[i].job.unitId` (a catalog string) never succeeds, so no tile would ever receive a tail update. Realtime would functionally do nothing in api mode.
- **(B) Introduce a UUID mapping from mock display IDs to backend unit UUIDs.** Requires a new fixture / config / API call. Hard-coding a fixture re-creates the same "frontend invents UUIDs" smell. Calling a backend API to resolve `(code='HP-001') → uuid` is a new endpoint and a new dependency. **Not justifiable in F4.5G.2.1's scope.**
- **(C) Defer full backend unit selection to a later phase.** The roadmap's expectation (§10 risk row): the resolution belongs in a backend-job-selection / operations-source-of-truth step that the Operations screen does not own today.
- **(D) Block api-mode tile wiring against backend unit IDs until backend unit selection is solved.** F4.5G.2.1 ships the realtime hook + the `<LiveCommunicationHealthPanel>` F4 row + the reconnect-invalidation seam, but **gates the tile-level realtime tail behind a UUID-shape predicate on the bound `unitId`**. When the predicate fails, the hook stays in a `source: 'rest'` mode (no tile updates, chart still works), and `<LiveCommunicationHealthPanel>` labels the F4 row honestly.

### Recommendation: **(C) + (D) combined.**

F4.5G.2.1:

1. **Subscribes to `tenant:<tenantId>` only** — not per-unit. Hardcode a single tenant id sourced from the F4.6E.1 closeout reference (or a new `NEXT_PUBLIC_RVF_TENANT_ID` env var if the implementation finds the value needs to be configurable; default to the F4.3 seed tenant UUID `00000000-0000-0000-0000-000000000001` from `apps/web/lib/api-data/f4/mock-fixtures.ts`).
2. **Tracks `(unitId, canonicalTagName)` slots** the panel hands it — but **only when the `unitId` matches a UUID shape** (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`). Non-UUID `unitId` values skip subscription-level filtering; their corresponding tile stays on the F2 simulator path.
3. **Connects the F4 socket health row in `<LiveCommunicationHealthPanel>`** regardless — operators benefit from knowing the socket is up even when no tile is yet wired to it.
4. **Invalidates the F4.5G.1 trend cache on reconnect** regardless — even non-UUID `unitId` queries simply return empty / 400, and an invalidation is harmless.
5. **Documents the deferral in the F4.5G.2.1 closeout** so that whichever phase introduces backend-unit selection (likely as part of an Operations job-selection redesign or candidate F4.6C.2 + a small unit-resolver hook) can flip the tile-level wiring on without changes to F4.5G.2.1.

Reasoning:
- Option (A) ships a hook that does nothing useful → wasted effort.
- Option (B) re-creates the smell.
- Option (C) alone defers everything → no progress.
- Option (C) + (D) ships the connection-health row + the reconnect-invalidation seam + the realtime hook scaffolding **without** silently issuing invalid identifiers, and leaves an obvious place for the backend-unit-selection follow-up to land.

**Hard rule:** F4.5G.2.1 must never issue a REST or socket call that embeds a non-UUID `unitId` value while running in api mode against a live backend. The Zod refines on the backend would 400 the request and surface as a confusing error in the UI. The UUID-shape predicate is the binding contract.

## 10. Latest Value Strategy

Per F4.5G-0 §10 and the F4.5G.1 closeout §9:

- **Do not abuse the trend API as a latest-value API.** Asking the trend endpoint for `(unitId, tagId, from=now-1m, to=now, limit=1)` works but is wasteful and conflates semantics. F4.5G.2.1 does not introduce this pattern.
- **Use `live_reading.updated` as an opportunistic tail-update source** for tiles in api mode. Initial tile hydration continues from the F2 simulator path until either:
  - a backend latest-value REST API lands (candidate **F4.6C.2 — Latest-value Read API** over `live_readings`), or
  - the backend-unit-selection follow-up resolves §9's UUID gap and the tile rebinds to a proper api-mode source.
- **Continue rendering F2 simulator values for non-api mode.** F4.5G.2.1 must not present simulator data as "live backend" — `<LiveCommunicationHealthPanel>` labels the F4 row `MOCK MODE` when `NEXT_PUBLIC_RVF_DATA_SOURCE !== 'api'`.

Tile rendering contract during F4.5G.2.1:

| Mode | Tile primary value | Tile freshness label | F4 health row |
|---|---|---|---|
| `mock` (default) | F2 simulator via `useLiveValue` | F2 stale detector via `useUnitTelemetrySnapshot` | `NOT CONNECTED · MOCK MODE` |
| `api`, UUID-shaped `unitId`, socket up | F2 simulator (primary) + optional realtime "last live" chip with `live_reading.updated` `timestamp` | F2 stale label + optional realtime-last-event chip | `CONNECTED · F4.6E.1` |
| `api`, UUID-shaped `unitId`, socket reconnecting | F2 simulator (primary), stale realtime chip | F2 stale label | `RECONNECTING` |
| `api`, non-UUID `unitId` | F2 simulator (primary), no realtime chip | F2 stale label | `CONNECTED · F4.6E.1` (the socket health is independent of tile binding) |

This contract is deliberately conservative: it prevents any silent claim that simulator data is live backend data, and it lets F4.5G.2.1 ship without solving the §9 UUID gap.

## 11. Simulator / Mock Fallback Policy

- **Default for local dev** stays simulator + mock. `NEXT_PUBLIC_RVF_TELEMETRY_SOURCE='simulated'`; `NEXT_PUBLIC_RVF_DATA_SOURCE='mock'`. Tiles render from the F2 store; the F4 hook stays disabled.
- **Opt-in to backend mode** by setting `NEXT_PUBLIC_RVF_DATA_SOURCE='api'`. The F4 hook activates, subscribes to `tenant:<tenantId>`, and tracks slots that match the UUID-shape predicate.
- **Production behavior**: production builds set both flags to backend mode. The F4 socket health row must read `CONNECTED · F4.6E.1` for the UI to be honest about freshness. A misconfigured production build is caught at deploy time (env vars load at build time for `NEXT_PUBLIC_*`).
- **No silent fallback.** In api mode with a disconnected socket: the F4 row reads `RECONNECTING` / `NOT CONNECTED`; tiles continue to render F2 simulator (where present) but the panel never claims realtime when it isn't there. ADR-005 "never lie about freshness" is the binding contract.
- **Mock data labeling.** `<LiveCommunicationHealthPanel>` adds an explicit `MOCK MODE` token to the F4 row when `NEXT_PUBLIC_RVF_DATA_SOURCE !== 'api'`.

## 12. UI / UX Behavior

### 12.1 `<LiveCommunicationHealthPanel>` F4 row (the only UI change in scope for this panel)

Current row content (today):
- `Backend WebSocket` — static `NOT CONNECTED` (stale-toned).

F4.5G.2.1 row content (proposed):
- `mock` mode (default): `NOT CONNECTED · MOCK MODE` (stale tone).
- api mode, socket connected: `CONNECTED · F4.6E.1` (normal tone, green).
- api mode, socket reconnecting: `RECONNECTING (attempt N)` (warn tone).
- api mode, socket disconnected: `DISCONNECTED · LAST EVENT HH:MM:SS UTC` (stale tone).

Only the row content changes — layout / other rows untouched.

### 12.2 `<LiveVariableTile>` (optional, deferrable within F4.5G.2.1)

If repo evidence supports a clean change at implementation time:
- Add a tiny `last live HH:MM:SS` chip in the tile header right corner when the F4 hook has a `lastEventReceivedAt` for the tile's `(unitId, canonicalTagName)`.
- Tile primary value stays on F2 (see §10).

If a clean rendering is not feasible without disrupting the F2 visual layout, defer the per-tile chip to F4.5G.2.2 / candidate F4.6C.2 and ship only the `<LiveCommunicationHealthPanel>` row + the new hook + the reconnect-invalidation seam.

### 12.3 `<TrendDrawer>` (no UI change)

The drawer's existing source chip (`Live backend` / `Mock fixture`) already labels the data source per F4.5G.1 closeout §6. F4.5G.2.1 may *optionally* extend the drawer freshness label to read `Loaded HH:MM:SS · Live tail: ON / OFF / Reconnecting` per the F4.5G-0 §8.3 plan — but this is **deferred to F4.5G.2.2 if the implementation hits friction**; the drawer's current "Loaded HH:MM:SS" is honest enough during F4.5G.2.1.

### 12.4 Error / disconnect state

When the F4 socket is disconnected:
- `<LiveCommunicationHealthPanel>` shows the disconnected row.
- Per-tile realtime chips disappear; tiles keep rendering F2 values.
- Chart cache stays untouched until the next reconnect (then invalidated).

### 12.5 No realtime event yet

Initial state after mount, before any `live_reading.updated` arrives:
- `<LiveCommunicationHealthPanel>` reads `CONNECTED · F4.6E.1` once `connect` fires.
- Per-tile chips do not render (no `lastEventReceivedAt` yet).
- Chart still renders REST data via F4.5G.1.

### 12.6 Expanded `<TrendDrawer>` is open

- The drawer subscribes through the same shared Socket.IO connection — no extra subscription is needed (per-tenant rooms are joined once per page).
- The drawer's data still comes from REST; F4.5G.2.1 does not add a realtime tail to the chart series in this phase. (A future phase may layer realtime points onto the rendered series.)
- Closing the drawer does not affect the tile-level realtime subscriptions.

## 13. Non-Goals

Explicitly out of scope for F4.5G.2.1 (each with the future phase that should own it, if any):

- **Backend changes.** None. F4.5G.2.1 is entirely frontend.
- **Latest-value backend API** (`GET /api/v1/telemetry/latest`). Candidate **F4.6C.2**.
- **Full Operations redesign.** Layout, navigation, job selection, etc. — out.
- **All Operations panels at once.** Only `<LiveCommunicationHealthPanel>` F4 row + new hook + optional tile chip. `<LiveActiveAlarmsPanel>` / `<LiveMultiphaseUnitCard>` badge / `<FieldConditionsPanel>` / `<OperationsHeaderRight>` stay.
- **Wells / Equipment / Catalog / Tags / Settings / Reports screen migrations.** Candidate F4.5H.
- **Alarm lifecycle UI** (`active → acknowledged → cleared`). Backend doesn't ship lifecycle yet (candidate F4.6D.3).
- **Alarm chart annotations.** Candidate F4.5G.3.
- **Notifications** (toast / banner / push). Not in scope.
- **Authentication / authorization.** Inherited.
- **External integrations** (ThingsBoard / Node-RED / OPC-UA / MQTT / Modbus / PLC / edge / historian). Not a UI concern.
- **F2D `BackendWebSocketTelemetryAdapter` migration.** Out.
- **F2 `TelemetryStore` extension to ingest F4.6E.1 envelopes.** Out — keys don't align (§6.3).
- **`<LiveActiveAlarmsPanel>` migration off browser-side `evaluateReading`.** Out — requires alarm-events read API.
- **Chart-side realtime tail (append realtime points to the rendered chart series).** Optional extension; if implementation friction appears, defer to candidate F4.5G.2.2.

## 14. Test Plan

### 14.1 New / extended frontend tests for F4.5G.2.1

**New `apps/web/lib/hooks/useOperationsRealtimeF4.test.tsx` (or co-located with the new hook):**

- Mounts with `enabled: false` → no `subscribe` emit; no listeners attached.
- Mounts with `enabled: true` + UUID-shaped `tenantId` → emits `subscribe { tenantId }` exactly once.
- Unmounts → emits `unsubscribe { tenantId }`.
- `live_reading.updated` matching a tracked `(unitId, canonicalTagId)` updates the hook's view-model.
- `live_reading.updated` for a different `tenantId` is ignored.
- `live_reading.updated` for a non-tracked `(unitId, canonicalTagId)` is ignored.
- `live_reading.updated` with a `timestamp` older than the current slot is ignored.
- `telemetry.reading.accepted` is **not** consumed (no view-model update).
- `alarm.event.created` does **not** trigger any client-side threshold comparison (if the hook surfaces a count, the count merely increments; no value-vs-threshold logic is invoked).
- Connection state transitions surfaced via the hook's `connection` field.
- On a `'connected'` event following a `'reconnecting'` transition, `queryClient.invalidateQueries({ queryKey: ['f4-trends'] })` is called exactly once.
- UUID-shape predicate: a non-UUID `unitId` does NOT cause a subscription-level filter against it.
- Mock-mode (`NEXT_PUBLIC_RVF_DATA_SOURCE !== 'api'`) → hook stays disabled; no socket emit; no listener attached.

**New `apps/web/components/operations/LiveCommunicationHealthPanel.test.tsx` (does not exist today):**

- Default (mock mode) renders `NOT CONNECTED · MOCK MODE` on the F4 row.
- api mode + simulated connected socket renders `CONNECTED · F4.6E.1`.
- api mode + simulated reconnecting socket renders `RECONNECTING`.
- The legacy F2 `Normalized Stream` row continues to render unchanged.

**Optional `apps/web/components/operations/LiveVariableTile.test.tsx` extension (only if the §12.2 chip ships):**

- Tile renders with no `lastEventReceivedAt` → no chip.
- Tile renders with `lastEventReceivedAt` → chip shows `last live HH:MM:SS`.

**Existing tests that must keep passing unchanged:**

- All current operations specs (`MultiphaseUnitCard.test.tsx`, `Sparkline.test.tsx`, `viewModel.test.ts`, `alarmSummary.test.ts`, `operationsRuntime.test.ts`, `LiveTrendsPanelLive.test.tsx`, `TrendDrawer.test.tsx`).
- All current hook specs (`useHistoryBuffer.test.tsx`, `useAlarmCenter.test.tsx`, `useAlarmSummary.test.tsx`, `snapshotStability.test.tsx`, `useOperationsTrendSeries.test.tsx`, `useUnitsFleet.test.tsx`).
- All current api / adapter / store specs.
- All current backend tests (195/195) — F4.5G.2.1 makes no backend change.

### 14.2 Test counts

| Metric | Before F4.5G.2.1 (`cafccb6`) | After F4.5G.2.1 (projected) |
|---|---|---|
| Backend tests | 195 / 195 | **195 / 195** (no backend change) |
| Frontend tests | 356 / 356 | **+~10–16 new tests** (~8–12 hook; ~3–4 panel; +0–3 optional tile chip) |

### 14.3 Validation commands (DX-3 §"Runtime phases")

- `pnpm --filter @rvf/web run lint -- --max-warnings 0`
- `pnpm --filter @rvf/web run typecheck`
- `pnpm --filter @rvf/web run build`
- `pnpm --filter @rvf/web run test`
- Workspace `pnpm lint` / `typecheck` / `build` — both apps green; backend cached (untouched).
- **Playwright e2e — optional in F4.5G.2.1.** No realtime e2e harness exists today; defer unless trivial.

### 14.4 What F4.5G.2-0 itself runs

**Nothing.** Documentation-only phase. DX-3 §"Documentation-only phases" prescribes only `git status` + `git diff --stat` confirming only `docs/` changed.

## 15. Risks and Guardrails

| Risk | Mitigation |
|---|---|
| **Mock UUID mismatch — `OPERATIONS_JOBS[i].job.unitId = 'EMMAD-01'` does not match backend UUIDs.** | §9 mandates the UUID-shape predicate. Non-matching slots skip tile-level wiring; the F4 socket health row + reconnect invalidation still ship. The closeout names this and points to the backend-unit-selection follow-up. |
| **Silently falling back to simulator in production.** | §11. Production builds force `NEXT_PUBLIC_RVF_DATA_SOURCE='api'`. The F4 row label includes `MOCK MODE` when this is missing. Reviewer rejects any PR that silences the label. |
| **Stale values shown as live.** | Per-tile chip (if it ships) is labeled `last live HH:MM:SS`, not "current value". F4 health row carries `LAST EVENT HH:MM:SS` when disconnected. F2 stale detector continues to drive the primary tile-stale labeling. |
| **Browser evaluating alarms.** | F4.5G.2.1 does not evaluate alarms. If a `<LiveCommunicationHealthPanel>` event counter ships, it counts server-evaluated `alarm.event.created` envelopes only — no threshold comparison. `<LiveActiveAlarmsPanel>` stays on the F2 evaluator path (out of scope here; flagged for migration). |
| **Chart / tile double-counting.** | Chart cache is invalidated on reconnect (one event = one invalidation). Tile view-model is independent of the chart cache. `telemetry.reading.accepted` is intentionally ignored to avoid duplicating `live_reading.updated` for `good` samples. |
| **Overcoupling to backend internals.** | The new hook consumes only `RealtimeF4Event` envelopes (from `@rvf/types`) — no Prisma row shapes, no internal IDs beyond what the envelope exposes. |
| **Trying to solve latest-value API inside a UI phase.** | F4.5G.2.1 explicitly defers it (§10). The recommended candidate F4.6C.2 (latest-value REST API) is the right place. |
| **Mixing too many Operations panels.** | §13 / §7.2. Only `<LiveCommunicationHealthPanel>` F4 row + new hook + (optional) per-tile chip. Reviewer rejects any PR that migrates `<LiveActiveAlarmsPanel>` / unit-card badge / `<OperationsHeaderRight>` / `<FieldConditionsPanel>` in the same phase. |
| **F2 store and F4 envelope cross-contamination.** | The new hook does NOT push F4 events into the F2 `TelemetryStore`. Keys don't align (`(jobId, tag)` vs `(unitId, canonicalTagId)`), and mixing them would silently lie about the source. Two stores remain side-by-side. |
| **Existing tests break because the socket lifecycle changed.** | F4.5G.2.1 does not modify `socket.ts` / `RealtimeProvider.tsx`. The new hook composes on top via `useRealtime().client`. Existing tests (`socket`-related and `telemetryStore.test.ts`) stay green unchanged. |
| **TanStack Query cache invalidation thrashing on a flaky network.** | The hook invalidates only on a `'connected'` event that follows a `'reconnecting'` transition (not on every `connect`). The trend cache's `staleTime: 30_000` + `gcTime: 5 * 60_000` (per `QueryProvider`) absorbs transient flips. |
| **A second Operations page mount opens a duplicate subscription.** | The hook composes the existing single-socket `RealtimeProvider`; subscribe is reference-counted at the hook level so two consumers share one room join. |
| **A reconnect during an open `<TrendDrawer>` causes a flash of empty chart.** | `useOperationsTrendSeries` returns the previous data as `isPlaceholderData` while the next fetch resolves; the drawer's chart stays visible. |
| **F4.6E.1 backend disabled (`RVF_REALTIME_EMIT_ENABLED` unset) — gateway addressable but emits nothing.** | The frontend treats this as "connected but no events ever" — the F4 row shows `CONNECTED · F4.6E.1` and the tiles never see a chip. Honest. Reviewer notes this in the closeout if observed locally. |
| **No subscribe ack arrives (server error / room mismatch).** | The hook surfaces a `subscribe_error` state in `connection`. `<LiveCommunicationHealthPanel>` may show `SUBSCRIBE ERROR` if implementation finds it tractable; otherwise the row stays `CONNECTED · F4.6E.1` (the socket is up; only the room join failed). Document whichever lands. |

## 16. Acceptance Criteria for F4.5G.2.1

F4.5G.2.1 is complete when **all** of the following are true:

- [ ] New `useOperationsRealtimeF4` hook lives at a single new file under `apps/web/lib/hooks/` (path TBD by implementation). Composes the existing `useRealtime().client`; does not modify `socket.ts` or `RealtimeProvider.tsx`.
- [ ] In api mode with a UUID-shaped `tenantId`, the hook emits `subscribe { tenantId }` once on mount and `unsubscribe` once on unmount.
- [ ] In mock mode (default), the hook stays disabled — no `subscribe` emit; no listeners attached; no view-model updates.
- [ ] `live_reading.updated` for tracked `(unitId, canonicalTagId)` pairs updates the hook's view-model; mismatched / older / cross-tenant events are ignored.
- [ ] `telemetry.reading.accepted` is **not** consumed by the hook.
- [ ] `alarm.event.created` does not trigger browser-side threshold comparison. If a count badge ships, it counts server-evaluated events only.
- [ ] Reconnect (`'connected'` after `'reconnecting'`) triggers exactly one `queryClient.invalidateQueries({ queryKey: ['f4-trends'] })`. The F4.5G.1 cache key is unchanged.
- [ ] `<LiveCommunicationHealthPanel>` renders an honest F4 row: `NOT CONNECTED · MOCK MODE` (mock), `CONNECTED · F4.6E.1` (api up), `RECONNECTING` (api reconnecting), `DISCONNECTED · LAST EVENT HH:MM:SS UTC` (api down).
- [ ] UUID-shape predicate enforced: non-UUID `unitId` slots never receive realtime tile updates and the closeout documents the limitation.
- [ ] F4.5G.1 chart pair (`<LiveTrendsPanelLive>` + `<TrendDrawer>` + `useOperationsTrendSeries`) renders unchanged — same data path, same cache key, same source label, same tests green.
- [ ] No screen migration beyond `<LiveCommunicationHealthPanel>` F4 row + the new hook + (optional) per-tile `last live` chip.
- [ ] No backend change; no Prisma / migration / seed change; no `packages/types/` change; no `docker-compose.yml` / root `package.json` / lockfile / `turbo.json` / `tsconfig*.json` / `.env*` / CI change.
- [ ] No new env variable required (the F4.3 seed tenant UUID is hardcoded or read from `apps/web/lib/api-data/f4/mock-fixtures.ts`).
- [ ] No browser-side alarm evaluation.
- [ ] Source / freshness labeling never silently presents mock data as live (per §11).
- [ ] Tests added per §14.1; expected ~10–16 new frontend tests. Existing tests (frontend 356/356 + backend 195/195) stay green unchanged.
- [ ] DX-3 §"Runtime phases" validation surface passes end to end: `lint -- --max-warnings 0` / `typecheck` / `build` / `test` for the web app, plus workspace `lint` / `typecheck` / `build`.
- [ ] F4.5G.2.1 closeout report exists at `docs/architecture/RVF_Malinois_F4_5G_2_1_Operations_Realtime_Tile_Status_Wiring_Closeout.md`, follows the established closeout structure, reports the final test count, names the UUID-gap deferral.
- [ ] Master roadmap §3 / §7 refresh — deferred to a small follow-up hygiene commit per the established pattern (`121803d` post-F4.5G-0, `cafccb6` post-F4.5G.1).

## 17. Recommended Next Step

**Next step after F4.5G.2-0: F4.5G.2.1 — Operations Realtime Tile / Status Wiring Implementation.** Plan-first → implementation per the codified DX-3 pattern. Scope per §7; consumption policy per §8; UUID guardrail per §9; latest-value strategy per §10; fallback per §11; UI per §12; tests per §14; acceptance per §16.

After F4.5G.2.1, the master roadmap §7 sequence continues with whichever of these the team picks based on observed need:

- **Candidate F4.5G.3 — Alarm chart annotations.** Wires `alarm.event.created` overlays into `<TrendChart>` / `<TrendDrawer>` once the operator workflow has settled.
- **Candidate F4.6C.2 — Latest-value Read API.** Public `GET /api/v1/telemetry/latest` over `live_readings` if tile migration needs a pull surface alongside (or instead of) realtime. Unblocks the §9 UUID-gap fully if paired with a small unit-resolver hook.
- **Candidate F4.6D.2 — Alarm Events Read API.** REST surface over `alarm_events`; unblocks `<LiveActiveAlarmsPanel>` migration off browser-side `evaluateReading`.
- **Candidate F4.5H — Non-telemetry screen adapter wiring.** Per-screen migrations for Wells / Equipment / Catalog / Tags / Settings / Reports off the F3 mock adapter.

These are named so they have a place to land. None is committed to as part of F4.5G.2.1. The next implementation phase is **F4.5G.2.1**.

---

*F4.5G.2-0 plan, authored at HEAD `cafccb6` (Refresh master roadmap after F4.5G.1). Plan-only. Update on phase close (`Current` → `Closed` with commit hash) and when F4.5G.2.1 lands its closeout.*
