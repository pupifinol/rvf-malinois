# RVF Malinois — F4.5G-0 Operations Chart Adapter + Expanded Trend View Plan

> Phase **F4.5G-0 — Operations Chart Adapter + Expanded Trend View Plan**. Plan-first per the codified project pattern (F4.2A → F4.2B, F4.6A.0 → F4.6A.1, F4.6B-0 → F4.6B.1, F4.6C-0 → F4.6C.1, F4.6D-0 → F4.6D.1, F4.6E-0 → F4.6E.1, F4.6F-0 → F4.6F.1).
> Documentation-only artifact. No frontend, backend, schema, migration, or runtime code is modified by F4.5G-0. Implementation lands in F4.5G.1.
> Last known head at authoring time: commit `33a700e` (Refresh master roadmap after F4.6F.1).
>
> Upstream references:
> - Master Roadmap (most recent refresh): `docs/architecture/RVF_Malinois_Master_Roadmap.md` (commit `33a700e`).
> - F4.6F.1 closeout (the historical trend API the chart will consume): `docs/architecture/RVF_Malinois_F4_6F_1_Historical_Trend_API_Closeout.md` (commit `946a023`).
> - F4.6E.1 closeout (the realtime push the chart tail will subscribe to): `docs/architecture/RVF_Malinois_F4_6E_1_WebSocket_SSE_Fan_Out_Closeout.md` (commit `51dc626`).
> - F4.6D.1 closeout (alarm events that *could* one day annotate the chart): `docs/architecture/RVF_Malinois_F4_6D_1_Alarm_Evaluation_Boundary_Closeout.md` (commit `d35a2b8`).
> - F4.5E closeout (existing telemetry-trends adapter the new wiring extends): `docs/architecture/RVF_Malinois_F4_5E_Telemetry_Trends_API_Wiring_Report.md` (commit `6af42fa`).
> - F4.5F closeout (precedent for a per-screen migration): `docs/architecture/RVF_Malinois_F4_5F_First_Screen_Migration_Units_Report.md` (commit `9e861ce`).
> - DX-3 (Definition of Done): `docs/operations/RVF_Malinois_Definition_of_Done.md` (commit `65cb736`).
> - ADR-005 (browser boundary; the browser does **not** evaluate alarms).

## 1. Purpose

F4.5G-0 is the **plan-first** phase for resuming UI adapter wiring after the F4.6 backend arc closed end-to-end. It scopes a single per-screen target — the Operations screen's Live Trends area — and defines how that area moves off the F2 simulator + F3 mock onto the canonical RVF backend surfaces now available:

- **F4.6F.1** historical trend API (`GET /api/v1/telemetry/trends`, raw + bucketed modes).
- **F4.6E.1** Socket.IO realtime fan-out (three event kinds to per-tenant rooms).
- **F4.6D.1** alarm event creation (for *future* chart annotations; deferred in F4.5G.1 — see §8).
- **F4.6C.1** live_readings projection (consumed indirectly via the realtime push, or via a candidate future F4.6C.2 read API).

This phase also defines a **new chart-interaction primitive** the codebase does not have today: clicking a Live Trends mini chart opens an **expanded trend view** for richer inspection (larger area, time-range selector, optionally realtime tail).

What this phase does:

- Locks the adapter strategy: REST trend reads on mount + on reconnect; realtime push for tail updates; simulator fallback for dev/offline.
- Locks the time-range → query-mode policy (raw vs bucketed; default aggregate; default quality policy).
- Names the expanded-view UX skeleton: trigger, container, time-range selector, loading / empty / error states, close behavior.
- Defines the test plan, the risks, and the F4.5G.1 acceptance criteria.

What this phase does **not** do:

- It does not modify any backend file.
- It does not modify any frontend file.
- It does not introduce a chart library dependency (the existing pure-SVG `TrendChart` is sufficient).
- It does not migrate Wells / Equipment / Catalog / Tags / Settings / Reports screens.
- It does not wire the full Operations screen — only the **Live Trends** area (`LiveTrendsPanelLive`) + the new expanded view.
- It does not build alarm-lifecycle UI, notification UI, multi-tag comparison, or analytics overlays.

## 2. Current Repository State

Drawn from `git log`, the master roadmap, and direct inspection of `apps/web/`.

| Phase | Status | Commit |
|---|---|---|
| Backend telemetry-persistence arc (F4.6B.1 → F4.6F.1) | Closed end-to-end | `1495457` / `49a8349` / `d35a2b8` / `51dc626` / `946a023` |
| F4.5A → F4.5E frontend F4 API client + adapter | Closed | through `6af42fa` |
| F4.5F first per-screen migration (Units selector) | Closed | `9e861ce` |
| **F4.5G-0 — Operations Chart Adapter + Expanded Trend View Plan** (this document) | **Current** | *(pending)* |
| F4.5G.1 — Operations Chart Adapter + Expanded Trend View Implementation | Deferred (next implementation phase) | — |

### 2.1 Operations screen — what renders today

`apps/web/app/(rvf-console)/operations/page.tsx` is a server-component shell that:

1. Mounts `<OperationsTelemetryRuntime />` once on the client — starts the F2A `SimulatedNormalizedTelemetryAdapter` and connects it to the singleton `TelemetryStore` (Zustand ring buffer).
2. Renders static chrome: `<PageHeader title="Live Operations Overview" subtitle="Real-time status of active well testing units · F2 simulated normalized stream" right={<OperationsHeaderRight />} />`.
3. Layout grid: main column (`<LiveMultiphaseUnitGrid />` + `<LiveTrendsPanelLive />`), right rail (`<LiveActiveAlarmsPanel />` + `<LiveCommunicationHealthPanel />` + `<FieldConditionsPanel />`).

**The chart/tendency area = `<LiveTrendsPanelLive />`** at `apps/web/components/operations/LiveTrendsPanelLive.tsx`. It hosts two compact `<TrendCard>`s (Inlet Pressure, Liquid Flow), one line per active job, sourced from `useHistoryBuffer(jobId, canonicalTag)` → the in-memory ring buffer fed by the **F2A simulator**. Header literally says "Last ~60 samples." No click behavior. No expanded view. No backend trend API consumption.

The chart renderer `<TrendChart series height={160} />` at `apps/web/components/operations/TrendChart.tsx` is a pure SVG line chart. Its input shape is `TrendSeries[] { name, color, data: readonly number[] }` — **index-based X axis, no per-point timestamps inside the chart**. F4.5G.1 will need to either extend the chart's input shape or convert backend `TelemetryPoint[] | TrendBucket[]` to the same index-based array.

`<Sparkline />` (separate from `<TrendChart>`) is the unit-tile sparkline — currently consumes the same ring-buffer data via `<VariableTile>` / `<LiveVariableTile>`. Out of F4.5G.1 scope (no expanded-view interaction; sparklines are too small for a click target).

The page subtitle string "F2 simulated normalized stream" is informational; F4.5G.1 will update it when the chart area switches to backend mode.

### 2.2 Existing frontend adapter structure

- `apps/web/lib/api/f4/` — typed REST client (F4.5A): `client.ts`, `config.ts`, `endpoints.ts`, `errors.ts`, `types.ts`, `index.ts`. `getTelemetryTrends(params, options)` exists. Types: `GetTelemetryTrendsParams`, `TelemetryTrendsResponse`, `TelemetryPoint`. **These F4.4F-shape types do NOT yet include the F4.6F.1 bucketing fields** — see §12.
- `apps/web/lib/api-data/f4/telemetry.ts` (F4.5E) — `adapterGetTelemetryTrends(params, options)` dual-mode adapter. `isApiSource()` switches between mock (`mock-fixtures.ts`) and live (`getTelemetryTrends` from `@/lib/api/f4`). Helpers: `toNumericTelemetryPoint`, `toNumericTelemetrySeries`, `isTelemetryTrendEmpty`.
- `apps/web/lib/telemetry/adapters/{simulated,websocket}.ts` — F2A `SimulatedNormalizedTelemetryAdapter` and F2D `BackendWebSocketTelemetryAdapter`. `adapterFactory.ts` picks between them by `NEXT_PUBLIC_RVF_TELEMETRY_SOURCE`. **F2D adapter is wired but receives nothing the backend produces today** (its envelope shape predates the F4.6E.1 event kinds — see §5).
- `apps/web/lib/realtime/socket.ts` — `socket.io-client@^4.8.1` wrapper, exponential-backoff reconnect, typed `RealtimeMessage` / `ConnectionState` listeners. Connects to `/api/v1/stream` namespace `/realtime`. **Does NOT yet consume the new F4.6E.1 event kinds** (`telemetry.reading.accepted` / `live_reading.updated` / `alarm.event.created` envelopes) — that's a F4.5G.1 wiring task.

### 2.3 Modal / drawer / dialog patterns

**None.** `grep Dialog|Modal|Drawer|Sheet` returns no matches in `apps/web/components/` or `packages/ui/src/`. F4.5G.1 must introduce a new minimal primitive — see §8.2 for the recommended approach (lightweight in-app drawer, no library dependency).

### 2.4 TanStack Query is wired

`apps/web/lib/query/QueryProvider.tsx` mounts a `QueryClientProvider` at the root. F4.5G.1 can use `useQuery` / `useQueryClient` for trend fetches with built-in loading / error / refetch state — recommended over hand-rolled `useEffect` + `useState`.

### 2.5 Chart components — current

- `<TrendChart>` (pure SVG, multi-series, index-based X axis, fixed `height` prop).
- `<Sparkline>` (pure SVG, single-series, minimal — used in variable tiles).
- **No "expanded" / "fullscreen" / "detail" chart mode exists** in either component today.

### 2.6 Environment variables governing data source

From `apps/web/lib/env.ts`:

- `NEXT_PUBLIC_RVF_TELEMETRY_SOURCE` — `'simulated'` (default) | `'websocket'`. Picks F2A vs F2D for the telemetry adapter.
- `NEXT_PUBLIC_RVF_TELEMETRY_WS_URL` — URL the F2D adapter connects to. Empty → factory falls back to simulator.
- `NEXT_PUBLIC_RVF_DATA_SOURCE` — `'mock'` (default) | `'api'`. F4.5A switch; picks between `lib/api-data/` mock branch and `lib/api/f4/` live branch.
- `NEXT_PUBLIC_RVF_API_BASE_URL` — F4 backend base URL, default `http://localhost:4000/api/v1`.

F4.5G.1 reuses these — **no new env variable is introduced** unless an explicit deferral note documents otherwise.

### 2.7 Backend surfaces available

| Surface | Phase | Status |
|---|---|---|
| `GET /api/v1/telemetry/trends` raw mode | F4.4F (`5e92a13`) | Active |
| `GET /api/v1/telemetry/trends` bucketed mode (`bucket` / `aggregate` / `qualityPolicy`) | F4.6F.1 (`946a023`) | Active |
| Socket.IO at `/api/v1/stream`, namespace `/realtime`, F4 subscribe/unsubscribe handlers | F4.6E.1 (`51dc626`) | Active (env-gated by `RVF_REALTIME_EMIT_ENABLED` on the backend; gateway addressable regardless) |
| `live_readings` populated | F4.6C.1 (`49a8349`) | Yes (transactionally with canonical insert) |
| `alarm_events` populated (state='active' only) | F4.6D.1 (`d35a2b8`) | Yes; no lifecycle transitions |
| `GET /api/v1/telemetry/latest` (candidate F4.6C.2) | — | **Not yet** |

Roadmap anchor: **`33a700e` (Refresh master roadmap after F4.6F.1)**. §7 there names F4.5G as the next phase, with the Operations chart cutover as the natural first target.

## 3. Architectural Position

Desired Operations Live Trends data flow once F4.5G.1 ships:

```
┌─────────────────────────── On mount / selected unit or tag changes ───────────────────────────┐
│                                                                                                 │
│  REST GET /api/v1/telemetry/trends                                                              │
│  (raw mode for short windows, bucketed for long; per §7)                                        │
│       │                                                                                         │
│       ▼                                                                                         │
│  TrendCard / TrendChart historical window                                                       │
│                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
        │
        │  (after the initial REST fetch resolves)
        ▼
┌─────────────────────────── While mounted ──────────────────────────────────────────────────────┐
│                                                                                                 │
│  Socket.IO 'subscribe' { tenantId } → joins tenant:<uuid> room                                  │
│  on 'live_reading.updated' (for matched unit/tag) → append/update chart tail                    │
│  on 'telemetry.reading.accepted' → optional (see §9)                                            │
│  on 'alarm.event.created' → deferred to a future phase (see §8)                                 │
│                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
        │
        │  (on socket reconnect)
        ▼
┌─────────────────────────── Resync ─────────────────────────────────────────────────────────────┐
│                                                                                                 │
│  Re-fetch the trend window covering [lastDataAt, now()] (or the full visible window if the     │
│  gap exceeds a small threshold) → resume realtime tail                                          │
│                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
        │
        │  (when user clicks a TrendCard)
        ▼
┌─────────────────────────── Expanded trend view ────────────────────────────────────────────────┐
│                                                                                                 │
│  selectedChartContext { unitId, canonicalTagName, label }                                       │
│       │                                                                                         │
│       ▼                                                                                         │
│  <TrendDrawer> opens (see §8)                                                                   │
│       │                                                                                         │
│       ▼                                                                                         │
│  Time-range selector { 15m | 1h | 6h | 24h | 7d }                                               │
│       │                                                                                         │
│       ▼                                                                                         │
│  REST GET /api/v1/telemetry/trends (raw or bucketed per §7)                                     │
│  Optional realtime subscribe for same unit/tag                                                  │
│                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Three principles govern the placement:

1. **REST trends are durable chart history.** The historical window the chart paints is canonical persisted state from `telemetry_readings`. The browser never derives history from realtime memory.
2. **Socket.IO is live tail notification, not history.** A subscriber that disconnects re-fetches via REST — no replay buffer (per F4.6E-0 §12 / F4.6E.1 closeout §8.5–§8.6). The mini chart and the expanded view inherit this contract.
3. **Expanded view uses the same canonical backend surfaces.** It does NOT introduce a parallel data path. Same adapter, same hooks, same normalization. The only difference is window size + bucket strategy (per §7) and the optional realtime-tail toggle.

ADR-005 invariant preserved: **the browser does not evaluate alarms.** Any chart annotation (deferred in F4.5G.1; see §8) will render `alarm.event.created` rows the backend has already produced — never compute thresholds in the browser.

## 4. Adapter Ownership

| Concern | Owner layer | Notes |
|---|---|---|
| REST trend fetch | `lib/api-data/f4/telemetry.ts` (`adapterGetTelemetryTrends`, **extended** in F4.5G.1 with new bucketed-mode params) | Existing F4.5E surface; dual-mode mock/api. |
| Realtime subscription (subscribe/unsubscribe, event handlers) | New thin hook at `apps/web/lib/realtime/useF4RealtimeSubscription.ts` (path TBD by F4.5G.1) | Wraps the existing `createSocketClient`; owns room join/leave on mount/unmount; never touches store directly — emits events for the caller to consume. |
| Chart-series merge (REST historical + realtime tail) | New hook `useOperationsTrendSeries({ unitId, canonicalTagName, window })` (path TBD by F4.5G.1) | Owns: `useQuery` for the REST fetch, in-memory append on realtime events, dedup by `(timestamp, telemetryReadingId)`, late-arrival ordering. |
| Stale / freshness state | Same hook — returns `{ isLoading, isError, isStale, lastDataAt, source: 'rest' \| 'rest+realtime' \| 'mock' }` | Surfaced to the UI so the chart can show non-authoritative state honestly (per ADR-005 "never lie about freshness"). |
| Reconnect / resync | The realtime hook listens for `'reconnect'` from `createSocketClient`; the trend hook invalidates the relevant `useQuery` key and re-fetches. | Standard TanStack Query invalidation pattern. |
| Fallback to simulator | F2A simulator stays active under `NEXT_PUBLIC_RVF_TELEMETRY_SOURCE=simulated` (default). When `NEXT_PUBLIC_RVF_DATA_SOURCE=api` is also set, the chart prefers backend reads — but the simulator can still feed the legacy `<LiveVariableTile>` widgets until they migrate too (see §11). | Adapter-level decision; no UI awareness of which mode is active beyond the freshness indicator. |
| Expanded trend view state | New component `<TrendDrawer>` owns its own local state: `selectedRange`, `isOpen`. The trend data hook is the same shared hook above, parametrized differently. | No global store; React Query's cache handles overlap between mini-chart window and expanded-view window. |
| Selected chart / tag context | Lifted to `<LiveTrendsPanelLive>` (or extracted to a small `<OperationsTrendController>` if F4.5G.1 prefers); passed to `<TrendDrawer>` via prop. | No URL parameter, no global context. Closing the drawer clears the selection. |
| Loading / error / no-data states | `<TrendChart>` already handles `data.length === 0` with "No data". F4.5G.1 wraps both `<TrendCard>` and `<TrendDrawer>` with `loading` / `error` skeletons consistent with the existing components/units pattern. | Visual baseline preserved. |
| Alarm annotations | **Deferred** in F4.5G.1 (see §8). When introduced, the realtime hook surfaces `alarm.event.created` events; the chart consumes them as overlay markers; the browser never evaluates. | Forward-compat seam exists in the realtime hook signature. |

## 5. Existing UI / Adapter Surface Inventory

Direct repository evidence as of `33a700e`. No surface is invented here.

### 5.1 Operations page + Live Trends panel

- `apps/web/app/(rvf-console)/operations/page.tsx` — server shell.
- `apps/web/components/operations/OperationsTelemetryRuntime.tsx` — client component; starts the F2A simulator + connects to the store.
- `apps/web/components/operations/LiveTrendsPanelLive.tsx` — **the chart area F4.5G.1 will migrate**. Two `<TrendCard>`s (Inlet Pressure, Liquid Flow), 3 job lines per chart, ring-buffer-backed.
- `apps/web/components/operations/data/operationsJobs.ts` — `OPERATIONS_JOBS` typed 3-tuple driving which jobs the chart binds to (F4.5G.1 will need to map these to `{ unitId, canonicalTagName }` pairs for the REST call — see §7.1).
- Other Operations panels (`<LiveMultiphaseUnitGrid>`, `<LiveActiveAlarmsPanel>`, `<LiveCommunicationHealthPanel>`, `<FieldConditionsPanel>`) are **out of F4.5G.1 scope**.

### 5.2 Chart / tendency components

- `apps/web/components/operations/TrendChart.tsx` — `<TrendChart series height yTicks className />`. Pure SVG. Input shape `TrendSeries { name, color, data: readonly number[] }`. **No timestamps in chart input** — F4.5G.1 must decide whether to extend the chart input (preferred) or adapt at the call site (simpler but loses time-aware features).
- `apps/web/components/operations/Sparkline.tsx` — separate; out of scope.
- `apps/web/components/operations/Sparkline.test.tsx`, `TrendChart` has no spec today.

### 5.3 Telemetry adapters

- `apps/web/lib/telemetry/adapter.ts` — `NormalizedTelemetryAdapter` interface.
- `apps/web/lib/telemetry/adapterFactory.ts` — picks F2A vs F2D by env.
- `apps/web/lib/telemetry/adapters/simulated.ts` — F2A `SimulatedNormalizedTelemetryAdapter`.
- `apps/web/lib/telemetry/adapters/websocket.ts` — F2D `BackendWebSocketTelemetryAdapter` (F2-shape envelope; not yet F4.6E.1-aware).
- `apps/web/lib/telemetry/simulator/` — synthetic stream.
- `apps/web/lib/realtime/socket.ts` — `createSocketClient(url)`. Used as the substrate for the new F4.6E.1-aware hook F4.5G.1 introduces (per §4).
- `apps/web/lib/realtime/telemetryStore.ts` — Zustand ring buffer fed by the F2 adapter. **F4.5G.1 does NOT extend the ring buffer to hold REST trend history** — that's a TanStack-Query cache concern, not a store concern.

### 5.4 api-data + api modules

- `apps/web/lib/api-data/f4/telemetry.ts` (F4.5E) — `adapterGetTelemetryTrends` + numeric helpers. **F4.5G.1 extends this** with the new bucketed-mode params (additive; mock-mode handling for bucketed responses is a small addition).
- `apps/web/lib/api/f4/types.ts` — `GetTelemetryTrendsParams` + `TelemetryTrendsResponse` + `TelemetryPoint`. **F4.5G.1 extends these** to mirror F4.6F.1's optional `bucket` / `aggregate` / `qualityPolicy` / `buckets[]` fields.
- `apps/web/lib/api/f4/endpoints.ts` — `getTelemetryTrends(params, options)`. F4.5G.1 ensures the new optional params serialize correctly into the query string (they already would, since `client.ts` uses URL `searchParams.append` over `Object.entries(params)` — to be verified in F4.5G.1).
- `apps/web/lib/api-data/f4/mock-fixtures.ts` — synthetic trace fixtures for the mock branch. F4.5G.1 must decide whether the mock branch implements bucketed-mode aggregation locally (not strictly required; see §11).

### 5.5 Shared realtime + telemetry types

- `packages/types/src/realtime.ts` — already extended by F4.6E.1 with `RealtimeF4Event`, payload interfaces, subscribe / unsubscribe shapes (`SubscribeF4Request`, etc.). **F4.5G.1 consumes these as-is.**
- `packages/types/src/telemetry.ts` — F2-era types (`TelemetryMessage`, `AlarmMessage`); still in place; not touched by F4.5G.1.

### 5.6 Tests

- `apps/web/components/operations/*.test.tsx` — `MultiphaseUnitCard.test.tsx`, `Sparkline.test.tsx`, `viewModel.test.ts`, `alarmSummary.test.ts`, `operationsRuntime.test.ts`. **No `TrendChart` spec exists today.**
- `apps/web/lib/api-data/f4/telemetry.test.ts` — covers `adapterGetTelemetryTrends` raw-mode dual-mode behavior. F4.5G.1 extends this with bucketed-mode dual-mode cases.
- `apps/web/lib/realtime/` — no spec on `socket.ts` today.
- Frontend test framework: vitest + `@testing-library/react@^16.0.1` + `@testing-library/jest-dom@^6.6.3` (jsdom). Playwright is wired for e2e but is not the F4.5G.1 primary surface.

### 5.7 Env variables (recap from §2.6)

`NEXT_PUBLIC_RVF_TELEMETRY_SOURCE` / `NEXT_PUBLIC_RVF_TELEMETRY_WS_URL` / `NEXT_PUBLIC_RVF_DATA_SOURCE` / `NEXT_PUBLIC_RVF_API_BASE_URL`. F4.5G.1 reuses all four; no new var added.

### 5.8 Modal / dialog / drawer

**None exists.** F4.5G.1 introduces a small, dependency-free `<TrendDrawer>` (see §8.2).

### 5.9 Chart library

**None.** `<TrendChart>` and `<Sparkline>` are pure SVG. F4.5G.1 does **not** introduce a chart library dependency — overkill for the F4.5G.1 expanded view's needs.

## 6. Proposed F4.5G.1 Implementation Boundary

F4.5G.1 wires **the Operations Live Trends area** (and only that area) to backend trend reads, and introduces the expanded-view drawer. Scope is intentionally narrow.

### 6.1 In-scope for F4.5G.1

- **Wire `<LiveTrendsPanelLive>`'s two `<TrendCard>`s to F4.6F.1 trend reads.** Replace the `useHistoryBuffer` ring-buffer source with a new `useOperationsTrendSeries({ unitId, canonicalTagName, window })` hook that calls `adapterGetTelemetryTrends` (per §7). The visual layout of the panel is preserved.
- **Preserve simulator fallback.** When `NEXT_PUBLIC_RVF_DATA_SOURCE !== 'api'`, the adapter stays in mock mode (existing F4.5E behavior). When it IS `'api'`, the chart consumes real backend data.
- **Add chart click → expanded view trigger.** Each `<TrendCard>` becomes a button (`role="button"`, keyboard-accessible) that opens `<TrendDrawer>` for that `(unitId, canonicalTagName)`.
- **`<TrendDrawer>`** — new component at `apps/web/components/operations/TrendDrawer.tsx`. Minimal portal-based drawer (no library dependency; see §8.2). Owns time-range selector, calls the same `useOperationsTrendSeries` hook with the selected window, renders a larger `<TrendChart>` instance.
- **Range → query-mode policy** per §7.
- **Optional realtime tail** — if F4.5G.1 has bandwidth and the implementation is clean, consume `live_reading.updated` events for the active chart's `(unit, sensor, tag)` and append to the in-memory tail. If not, defer to F4.5G.2 (see §17) and document in the closeout.
- **TanStack Query usage** — `useQuery` for trend fetches with stable key `['trends', unitId, canonicalTagName, window, mode, bucket, aggregate]`. Refetch on reconnect (per §9).
- **Update page subtitle** in `apps/web/app/(rvf-console)/operations/page.tsx` to reflect the new data path when backend mode is active (string-only change; cosmetic).
- **Frontend type extensions** at `apps/web/lib/api/f4/types.ts` — additive `bucket?`, `aggregate?`, `qualityPolicy?` on `GetTelemetryTrendsParams`; additive `bucket?`, `aggregate?`, `qualityPolicy?`, `buckets?: TrendBucket[]` on `TelemetryTrendsResponse`. Mirror the F4.6F.1 backend contract (see §12).
- **Tests** per §14.

### 6.2 Out-of-scope for F4.5G.1

- Migrating `<LiveMultiphaseUnitGrid>`, `<LiveVariableTile>`, `<LiveActiveAlarmsPanel>`, `<LiveCommunicationHealthPanel>`, `<FieldConditionsPanel>` to backend reads. Each is its own follow-up (some are F4.5G.2; some wait on candidate F4.6C.2).
- Migrating the Wells / Equipment / Catalog / Tags / Settings / Reports screens. Independent per-screen tasks, possibly bundled in a later F4.5H.
- Alarm-event chart annotations. Forward-compat seam only; the rendered annotation is a follow-up (see §8.4).
- Multi-tag chart comparison in one chart. The existing chart already renders multiple lines (one per job), but F4.5G.1 keeps the F2A two-chart layout (Inlet Pressure, Liquid Flow); a "compare any two tags" UI is out of scope.
- Adding a chart library.
- Touching the backend or shared types beyond the additive frontend type extensions.
- Adding a new env variable.
- URL-based deep-linking to the expanded view (e.g., `?expanded=p_inlet`). Drawer state is component-local; deep-linking can be a small follow-up if a use case appears.

### 6.3 What F4.5G.1 explicitly does **not** touch

- `apps/backend/` — no change.
- `apps/backend/prisma/` — no change.
- `packages/types/` — no change (the realtime envelope types F4.6E.1 added are reused as-is).
- `packages/ui/` — no change (the drawer is screen-local, not a design-system primitive).
- `apps/web/lib/telemetry/` — no change to the F2A / F2D adapters or the Zustand store. F4.5G.1 introduces new hooks alongside them, not replacements.
- `apps/web/lib/realtime/socket.ts` — no change to the existing client (the new realtime hook composes on top).
- `apps/web/lib/api/f4/{client,config,endpoints,errors}.ts` — no change (the existing surface already supports the additive type extensions via its `URLSearchParams` serialization).
- `docker-compose.yml`, root `package.json`, lockfile, `turbo.json`, `tsconfig*.json`, `.env*`, CI config.

## 7. Trend Query Strategy

### 7.1 Selected unit / tag mapping

The mini chart binds via `OPERATIONS_JOBS` (3 jobs, one chart line each, two tags total: `p_inlet`, `q_liquid`). F4.5G.1 needs to map each `OPERATIONS_JOBS[i].job` to a `(unitId, canonicalTagName)` pair the trend endpoint can consume.

Repo evidence: `OPERATIONS_JOBS[i].job.unitId` already exists (the simulator uses it to seed the ring buffer). F4.5G.1 reuses it verbatim — **no new identity resolution is introduced**.

`canonicalTagName` values come from `apps/web/lib/telemetry/tags.ts`'s `CANONICAL_TAGS` map. The same values (`p_inlet`, `q_liquid`) are already used in the F4.3 seed and recognized by the backend's `CanonicalTagResolver` (F4.4F).

### 7.2 Default time windows

| Surface | Default window | Notes |
|---|---|---|
| Mini chart (`<TrendCard>` inside `<LiveTrendsPanelLive>`) | **15 minutes** | Compact; matches the F2A "Last ~60 samples" feel (with samples at typical 1 Hz cadence, 15 minutes is ≤900 points). |
| Expanded view default | **1 hour** | Slightly wider context on open; user can shrink to 15m or grow to 7d via the selector. |

The mini chart does **not** show a range selector — its window is fixed at the per-card default and refreshes on a periodic interval (see §7.5) plus realtime tail (if §6.1 ships it).

### 7.3 Allowed time ranges (expanded view)

Fixed enum, finite set: `15m | 1h | 6h | 24h | 7d`.

### 7.4 Range → query-mode policy

| Range | Mode | Bucket | Aggregate | Rationale |
|---|---|---|---|---|
| `15m` | **raw** | n/a | n/a | ≤900 points at 1 Hz; well under `TRENDS_LIMIT_MAX=5000`. |
| `1h` | **raw** | n/a | n/a | ≤3600 points at 1 Hz; under 5000. If a future high-rate ingest pushes >5000 points/h, fall back to `1m` bucket — F4.5G.1 logs a clear warning and the test plan exercises the >5000 path. |
| `6h` | **bucketed** | `1m` | `avg` | 360 buckets — well under `TRENDS_BUCKETS_MAX=1500`. |
| `24h` | **bucketed** | `5m` | `avg` | 288 buckets. |
| `7d` | **bucketed** | `15m` | `avg` | 672 buckets. |

Default `aggregate`: **`avg`**. Default `qualityPolicy`: **`good_only`** (matches F4.6C.1 projection convention).

**F4.5G.1 ships only the `avg` aggregate.** Other aggregates (`min` / `max` / `count` / `first` / `last`) are supported by the backend but not exposed in the F4.5G.1 UI — they remain available for any future "show min/max envelope" feature without backend changes.

### 7.5 Refresh / resync behavior

- **Mini chart**: TanStack Query `refetchInterval: 30_000` (30 seconds). On realtime reconnect (if §6.1 ships realtime tail), `queryClient.invalidateQueries(['trends', ...])` triggers an immediate refetch.
- **Expanded view**: same hook; user-initiated range change re-fetches with the new params (TanStack Query handles the new cache key).
- **Reconnect**: per F4.6E-0 §12 / F4.6E.1 closeout §8.6 — there is no replay buffer. The chart resyncs by re-issuing the REST trend read covering the visible window. Late events arriving during the gap arrive via the next REST refetch or via the new realtime push for `timestamp >= now-gap`.

### 7.6 Empty / no-data behavior

- Empty raw-mode response (`points: []`) → existing `<TrendChart>` "No data" placeholder.
- Empty bucketed-mode response (every `buckets[i].sampleCount === 0`) → same placeholder, with optional small subtitle "No samples in window."
- `qualityPolicy='good_only'` filtering out every row → same as above; no special "all rows filtered" state in F4.5G.1.

### 7.7 Loading / error states

- Loading: skeleton placeholder in `<TrendCard>` and `<TrendDrawer>` (matches the existing units / equipment loading pattern from F4.5F / F4.5C if any; otherwise, a simple animated pulse). No spinner over the chart area while a stale dataset is still visible — TanStack Query's `isPlaceholderData` lets the previous chart stay rendered.
- Error: `<TrendChart>` collapses to a "Couldn't load trend" state; the freshness indicator (per §4) flips to `error`. No alarm to the operator — they can retry or reload.

## 8. Expanded Trend View UX Plan

### 8.1 Trigger

Each `<TrendCard>` becomes an interactive element (`role="button"`, `tabIndex={0}`, `aria-label="Open expanded {title} trend view"`). Click or Enter / Space opens the drawer for that `(unitId, canonicalTagName, title, unitLabel)`. Visual affordance: subtle hover cursor + a small "expand" icon in the top-right of the card.

### 8.2 Container — recommendation: portal-based in-app drawer (no library)

The codebase has **no** existing modal / dialog / drawer / sheet pattern. Options F4.5G.1 should consider:

- **(A) Portal drawer.** `createPortal` to `document.body`; fixed-position right-side drawer, `width: min(95vw, 880px)`, full viewport height; backdrop covers the rest; ESC + backdrop-click close. **Recommended.** Smallest delta; no library; portable to a future `packages/ui` primitive when a second use case appears.
- **(B) Inline expansion within `<LiveTrendsPanelLive>`.** Replaces the two-card grid with a single big chart when selected. Less mobile-friendly; doesn't generalize to other screens.
- **(C) Next.js parallel route / intercepting route.** Heavier wiring; URL-based; provides deep-linking but couples to the App Router conventions.
- **(D) Full-page route** like `/operations/trends/[unit]/[tag]`. Loses the "still see the dashboard behind" property.

**F4.5G.1 picks (A)** unless implementation experience suggests otherwise. The plan does not introduce a `@radix-ui/react-dialog` (or equivalent) dependency for one screen — a 60-line portal drawer covers the F4.5G.1 needs and stays the in-house primitive until a second screen needs it.

### 8.3 Content

- **Header**: title `${tag.displayName} — ${unitDisplayName}`; subtitle: engineering unit + current range; close button (top-right, `aria-label="Close trend view"`).
- **Range selector**: pill group `15m / 1h / 6h / 24h / 7d`. Default `1h`. Selected pill is visually distinct.
- **Chart area**: `<TrendChart>` at `height={420}` (vs `160` in the mini chart). Same component; F4.5G.1 may extend `<TrendChart>` with optional X-axis time tick labels (small additive enhancement; opt-in via prop so existing call sites stay byte-identical).
- **Latest value + timestamp**: top-right of the chart area, when available. Sourced from the most recent point in the loaded trend series (not from a separate latest-value endpoint — see §10).
- **Freshness indicator**: small text "Loaded HH:MM:SS · Live tail: ON / OFF / Reconnecting" — matches the ADR-005 freshness contract.
- **Empty / loading / error states**: per §7.6 / §7.7.

### 8.4 Alarm annotations — **deferred** in F4.5G.1

Per the brief: "alarm.event.created can be shown later as chart annotations if UI is not ready." F4.5G.1 ships **no** alarm overlay. The realtime hook signature already accommodates a future `onAlarmEventCreated` callback as a forward-compat seam, but `<TrendDrawer>` ignores it.

Reasoning:
- Designing the annotation marker style is its own small UX task (color / shape / interaction).
- Alarm-event lifecycle (acknowledge / clear) is owned by candidate F4.6D.3; rendering only "created" annotations without the lifecycle is half a feature.
- The browser **must not** evaluate alarms (ADR-005); F4.5G.1 keeps the boundary clean by simply not rendering them yet.

A small follow-up (candidate F4.5G.3) can wire `alarm.event.created` markers once F4.5G.1 has shipped and the operator workflow has settled.

### 8.5 Close behavior

ESC, backdrop click, or close button → drawer unmounts; the realtime subscription (if any) for the active chart leaves the per-unit room (or unsubscribes if F4.5G.1 implements that granularity). Mini chart subscriptions persist.

### 8.6 Responsive behavior

- **Desktop (≥ 1280px)**: drawer right-side, 880px wide, 100vh.
- **Tablet (768–1279px)**: drawer right-side, 100vw–32px, 100vh.
- **Mobile (< 768px)**: drawer bottom-up, 100vw, 92vh.

Tailwind responsive utilities; no additional library.

## 9. Realtime Tail Strategy

If §6.1 ships realtime tail in F4.5G.1, the contract is:

- **Subscribe**: on chart mount, send `socket.emit('subscribe', { tenantId })`. F4.5G.1 hardcodes a single tenant id for now (matches the project-wide no-auth posture — see §11 / §15). Per-unit room joins are forward-compat seam (F4.6E.1 doesn't emit to per-unit rooms yet).
- **Events consumed by the chart**:
  - `live_reading.updated` for matching `(unitId, canonicalTagId)` → **append/update chart tail.** The payload carries `value` (as string), `timestamp`, `outcome` ('created' / 'updated'). The append handler:
    - parses `value` to `Number`,
    - upserts the in-memory tail by `timestamp` (strict-equal replace; strict-newer append),
    - drops events whose `timestamp` is older than the loaded window's `from`,
    - drops events whose `timestamp` is older than the most recent loaded point (defends against late arrivals reordering the visible series; the next REST refetch reconciles).
  - `telemetry.reading.accepted` — **ignored** in F4.5G.1 to avoid double-counting (`live_reading.updated` already fires for `good`-quality samples that drive the projection; `telemetry.reading.accepted` fires for *every* accepted sample including `bad` / `uncertain`, which would pollute the chart's `good_only` policy). If a future per-screen surface needs "every reading regardless of quality" it consumes this event explicitly.
  - `alarm.event.created` — **ignored** in F4.5G.1 (see §8.4 deferral).
- **Duplicate / out-of-order**: the upsert by `timestamp` (above) handles both within the in-memory tail. The next REST refetch is the canonical reconciliation; a misordered tail eventually self-heals.
- **Reconnect → trend reload**: `createSocketClient` already surfaces `'reconnecting'` / `'connected'` `ConnectionState` transitions. The realtime hook listens for these and triggers `queryClient.invalidateQueries(['trends', ...])` on `'connected'` (after a reconnect), which causes the REST hook to refetch. Realtime tail then resumes from the post-refetch state.
- **Expanded vs mini chart tail interaction**: both subscribe through the same realtime hook (with reference counting at the hook level so unmounting one chart doesn't cancel the other's subscription). If F4.5G.1 chooses per-unit room joins, each chart's `(unitId, canonicalTagId)` filter handles its own narrow subset of incoming events; deduplication is unnecessary because there's no cross-chart broadcast.
- **Backpressure**: F4.6E.1 has no coalesce (per F4.6E-0 §11 / F4.6E.1 closeout §10). At today's ingest rates (operator-driven), there's no real backpressure to manage. If a future bridge POSTs >100 samples/s/tenant the F4.6E.4 candidate sub-phase will own coalesce server-side; the chart's per-frame render budget is irrelevant in F4.5G.1.

**If F4.5G.1 cannot ship realtime tail cleanly**, the deferral is acceptable provided the closeout names what specifically blocked it and the mini chart relies on `refetchInterval: 30_000` until F4.5G.2 wires realtime.

## 10. Latest Values / Tile Strategy

The Operations screen also renders unit tiles (`<LiveVariableTile>`, `<MultiphaseUnitCard>`) that show "current value" widgets. F4.5G.1 **does not migrate these** — they continue to render from the F2A simulator + Zustand ring buffer until a follow-up task.

Reasoning:
- A proper "current value" API is candidate **F4.6C.2 — Latest-value Read API** over the populated `live_readings` table; it does not exist yet and sizing it correctly needs a screen consumer to drive requirements.
- **Do not abuse the F4.6F.1 trend API as a latest-value API.** The trend endpoint is range-scan-shaped; asking it for `(unitId, tagId, from=now-1m, to=now, limit=1)` works but is wasteful per metric, sequentially N× more expensive than a single `live_readings` lookup, and confuses semantics ("the last point in a window" vs "the current value").
- A reasonable interim is for tiles to **opportunistically** consume `live_reading.updated` realtime events once the realtime hook lands — bookkeeping (current value, last-updated timestamp) in the existing store. This is a separate scope item (candidate F4.5G.2) and is **not** F4.5G.1 work.

F4.5G.1 ships the trend chart cutover and the expanded view; tile migration waits for either F4.5G.2 (realtime-opportunistic) or candidate F4.6C.2 (REST latest-value).

## 11. Simulator / Mock Fallback Policy

- **Default for local dev** stays simulator + mock. `NEXT_PUBLIC_RVF_TELEMETRY_SOURCE` defaults to `'simulated'`; `NEXT_PUBLIC_RVF_DATA_SOURCE` defaults to `'mock'`. The Operations chart renders from `useHistoryBuffer` (existing F2A path) when these are unset.
- **Opt-in to backend mode** by setting `NEXT_PUBLIC_RVF_DATA_SOURCE=api` (and optionally `NEXT_PUBLIC_RVF_API_BASE_URL`). The F4.5G.1 chart hook detects this via the existing `isApiSource()` helper and routes the REST fetch through the live `getTelemetryTrends`. The realtime tail subscribes through `createSocketClient(env.wsUrl)` regardless of the data-source flag (the F2D adapter has its own separate `NEXT_PUBLIC_RVF_TELEMETRY_SOURCE='websocket'` switch which is independent).
- **Production behavior**: production deployments set both flags to backend mode. Falling through to the simulator in production is **forbidden** — the freshness indicator must reflect actual state, and the `NEXT_PUBLIC_RVF_DATA_SOURCE` env-load happens at build time so a production build with the wrong value is a deploy-time error, not a silent runtime issue.
- **Mock data labeling**: the freshness indicator in `<TrendDrawer>` includes a small `source: 'mock' | 'rest' | 'rest+realtime'` chip. The mini chart does not have space for a per-card chip but the page-level header indicator (existing `<OperationsHeaderRight>`) already names the data source in dev — F4.5G.1 reuses it.
- **Expanded view in mock mode**: behaves identically (calls the same adapter, gets mock data, renders). The range selector still works; bucket-mode requests in mock mode either (a) ignore the bucket params and return raw fixture points, or (b) implement a minimal client-side bucketing of the fixture data. F4.5G.1 picks **(a)** for simplicity — bucketed-mode UX validation against real data is the backend-mode path; mock-mode is for layout/dev. The closeout names this explicitly so reviewers don't expect bucketed correctness in mock fixtures.

**Never silently claim mock data is live backend data.** When `NEXT_PUBLIC_RVF_DATA_SOURCE !== 'api'`, the freshness indicator says so.

## 12. API / Type Compatibility

### 12.1 Frontend types — additive extensions in F4.5G.1

`apps/web/lib/api/f4/types.ts` (existing F4.5A) needs additive fields to mirror F4.6F.1:

```ts
// On GetTelemetryTrendsParams (additive, all optional):
bucket?: '1m' | '5m' | '15m' | '1h' | '1d';
aggregate?: 'avg' | 'min' | 'max' | 'count' | 'first' | 'last';
qualityPolicy?: 'good_only' | 'include_uncertain' | 'include_all';

// On TelemetryTrendsResponse (additive, all optional):
bucket?: '1m' | '5m' | '15m' | '1h' | '1d';
aggregate?: 'avg' | 'min' | 'max' | 'count' | 'first' | 'last';
qualityPolicy?: 'good_only' | 'include_uncertain' | 'include_all';
buckets?: TrendBucket[];

// New interface:
export interface TrendBucket {
  bucketStart: string;          // ISO-8601
  bucketEnd: string;            // ISO-8601
  value: number | null;         // null when sampleCount === 0
  sampleCount: number;
}
```

**No `packages/types/` change.** The trend API is a backend-owned contract; the frontend keeps its own derived types. The realtime envelope types (`RealtimeF4Event` etc.) were added to `packages/types/` by F4.6E.1 and are consumed as-is.

### 12.2 Raw vs bucketed response — normalization to chart series

`<TrendChart>` consumes `TrendSeries { name, color, data: readonly number[] }` — index-based. F4.5G.1 introduces a small helper:

```ts
// apps/web/lib/api-data/f4/trendsToChartSeries.ts (path TBD)
function toChartSeries(response: TelemetryTrendsResponse, opts: { name: string; color: string }): TrendSeries {
  if (response.bucket !== undefined) {
    // Bucketed mode: drop empty-bucket nulls so the line doesn't break (chart
    // doesn't understand gap-skip yet; future enhancement could pass nulls
    // through if the chart learns to render gaps).
    const data = (response.buckets ?? []).map(b => b.value).filter((v): v is number => v !== null);
    return { name: opts.name, color: opts.color, data };
  }
  // Raw mode: convert Decimal-string to Number; null-filter parse failures.
  const data = response.points.map(p => Number(p.value)).filter(Number.isFinite);
  return { name: opts.name, color: opts.color, data };
}
```

A more visually honest "gap-aware" version (returns `number[]` with `null` placeholders so the chart can render gaps) is a small follow-up; F4.5G.1 picks the simpler filter-out-nulls path and the closeout flags the visual caveat (empty buckets compress the chart's apparent density rather than showing as gaps).

### 12.3 Timestamp / value / quality on the wire

- **Raw mode** — `TelemetryPoint.timestamp` is an ISO-8601 string; `.value` is a Decimal serialized as string (must call `Number(...)`); `.quality` is `'good' | 'uncertain' | 'bad'`; `.engineeringUnit` and `.source` are strings.
- **Bucketed mode** — `TrendBucket.bucketStart` / `.bucketEnd` are ISO-8601 strings; `.value` is `number | null` (already a JS number per F4.6F.1 §6.3); `.sampleCount` is a JS number.

### 12.4 Realtime envelope mapping to chart point

```ts
// On 'live_reading.updated':
const point = { timestamp: new Date(payload.timestamp), value: Number(payload.value) };
```

That's it. The chart consumes a `number[]`; the realtime hook appends the parsed value once it has verified the event matches the chart's `(unitId, canonicalTagId)` filter and that `timestamp >= window.from`. The hook holds a small map keyed by `(unitId, canonicalTagId)` of `{ timestamp, value }` tail entries; the chart converts to `number[]` at render time.

## 13. Non-Goals

Explicitly out of scope for F4.5G.1 (each with the future phase that should own it, if any):

- **Full Operations screen migration.** Tiles, alarms panel, communication health, field conditions — all stay on existing adapters. Each may have its own follow-up (`<LiveVariableTile>` is candidate F4.5G.2; `<LiveActiveAlarmsPanel>` waits on candidate F4.6D.2 alarm read API).
- **Wells / Equipment / Catalog / Tags / Settings / Reports screens.** Independent per-screen tasks (candidate F4.5H).
- **Alarm-event chart annotations** (`alarm.event.created` overlay markers). Deferred; candidate F4.5G.3.
- **Alarm lifecycle UI** (acknowledge / clear). Backend doesn't ship lifecycle yet (candidate F4.6D.3).
- **Notification UI** (toast / banner on new alarm). Notifications are not in the F4.6 arc.
- **Reports / exports** (CSV / PDF of trend windows). Separate concern.
- **Latest-value backend API** (`GET /api/v1/telemetry/latest`). Candidate F4.6C.2; not required for F4.5G.1.
- **Authentication / authorization.** Project-wide no-auth posture inherited.
- **Backend schema / migrations / endpoint changes.** None required; if a blocker is discovered the closeout names it and a separate backend phase ships the fix.
- **External integrations** (ThingsBoard / Node-RED). Not a UI concern.
- **Multi-tag chart comparison in one chart** beyond what the existing two-card layout already does. The current panel shows two tags (Inlet Pressure, Liquid Flow), each with N lines (per-job). F4.5G.1 preserves this; a "compare any two tags" UI is a future feature.
- **Advanced analytics / predictive / anomaly overlays.**
- **Chart library introduction.** Pure SVG is enough.
- **URL deep-linking to the expanded view.** Drawer state is component-local in F4.5G.1.
- **Updating `<Sparkline>` to consume backend data.** Sparklines are tile-bound; tile migration is its own task.
- **Rate limiting, backpressure, server-side coalesce** for realtime events. Server-side is a future F4.6E.4 concern; client-side is irrelevant at today's ingest rates.

## 14. Test Plan

### 14.1 New / extended frontend tests for F4.5G.1

**`apps/web/lib/api-data/f4/telemetry.test.ts` (extended):**

- Bucketed-mode mock path passes through `bucket` / `aggregate` / `qualityPolicy` params without errors (raw fixture data returned per §11).
- Bucketed-mode api path forwards the new params to `getTelemetryTrends` (verified via the existing typed fetch mock).
- `bucket` without `aggregate` rejected at the adapter layer (mirrors the backend Zod refine — even though the backend would reject too, the adapter should fail fast in mock mode).
- Existing raw-mode tests stay green unchanged.

**`apps/web/lib/api/f4/types.ts` consumer compile-tests:**

- Bucketed-mode response shape narrowing (`response.bucket !== undefined → response.buckets` is defined) — TypeScript compile assertion.

**New `apps/web/lib/hooks/useOperationsTrendSeries.test.tsx` (or co-located with the new hook):**

- Mounts the hook with a mocked `adapterGetTelemetryTrends` → loads, returns the expected `TrendSeries`.
- Range change triggers a new fetch (different cache key).
- Error from the adapter surfaces as `isError: true`.
- Realtime event for the matching `(unitId, canonicalTagId)` appends to the tail (if F4.5G.1 ships realtime).
- Realtime event for a different unit/tag is ignored.
- Realtime reconnect invalidates the trend query (if F4.5G.1 ships realtime).
- Simulator-mode (`NEXT_PUBLIC_RVF_DATA_SOURCE !== 'api'`) still returns mock data.

**New `apps/web/components/operations/TrendDrawer.test.tsx`:**

- Closed by default; opens on `(unitId, canonicalTagName)` prop change to a non-null value.
- Renders the chart for the selected metric.
- Range selector buttons render; clicking `6h` updates the query (asserted via the mocked hook).
- Loading state visible while the query is pending.
- Empty state when the response has zero points.
- Error state when the query errors.
- Close button + ESC + backdrop click all close the drawer.
- Latest value + timestamp display when data is present.

**Extended `apps/web/components/operations/LiveTrendsPanelLive.test.tsx` (new — does not exist today):**

- Chart cards are interactive (`role="button"`, focusable).
- Click opens the drawer with the correct `(unitId, canonicalTagName)`.
- Backend-mode renders backend data; mock-mode renders mock data.
- Page subtitle reflects the active source.

**Existing tests that must keep passing unchanged:**

- All current operations specs (`MultiphaseUnitCard.test.tsx`, `Sparkline.test.tsx`, `viewModel.test.ts`, `alarmSummary.test.ts`, `operationsRuntime.test.ts`).
- All current api-data / api specs.
- All backend tests (195/195 baseline — F4.5G.1 makes no backend change).

### 14.2 Test counts

| Metric | Before F4.5G.1 (`33a700e`) | After F4.5G.1 (projected) |
|---|---|---|
| Backend tests | 195 / 195 | **195 / 195** (no backend change) |
| Frontend tests | (existing count — to be enumerated in F4.5G.1 closeout) | **+~12–18 new tests** (~10 hook + drawer; ~3–5 adapter extension; ~2–3 panel) |

### 14.3 Validation commands (DX-3 §"Runtime phases")

- `pnpm --filter @rvf/web run lint -- --max-warnings 0`
- `pnpm --filter @rvf/web run typecheck`
- `pnpm --filter @rvf/web run build` (Next.js prod build; catches type errors in pages and components)
- `pnpm --filter @rvf/web run test` (vitest)
- Workspace `pnpm lint` / `typecheck` / `build` — both apps green; backend cached (untouched).
- **`pnpm --filter @rvf/web run test:e2e` (Playwright) — optional in F4.5G.1.** If a single Operations-chart smoke test is cheap, ship it; if not, defer to a per-screen e2e sub-phase.

### 14.4 What F4.5G-0 itself runs

**Nothing.** Documentation-only phase. DX-3 §"Documentation-only phases" prescribes only `git status` + `git diff --stat` confirming only `docs/` changed.

## 15. Risks and Guardrails

| Risk | Mitigation |
|---|---|
| **Mock drift** — the chart renders mock data and the operator believes it is real. | §11 mandates the freshness indicator name the source. The mini chart inherits the page header's source chip; the expanded view has its own per-drawer chip. Production builds force `NEXT_PUBLIC_RVF_DATA_SOURCE=api`. |
| **Double-counting tail updates** — both `telemetry.reading.accepted` and `live_reading.updated` fire for `good` samples; consuming both would render the same point twice. | §9 specifies the chart consumes ONLY `live_reading.updated`. `telemetry.reading.accepted` is ignored. |
| **Abusing the trend API as a latest-value API.** Asking the trend endpoint for a 1-point window per tile is wasteful and conflates semantics. | §10 explicitly forbids it. Tile migration waits for candidate F4.6C.2 or for an opportunistic realtime path (candidate F4.5G.2). |
| **Stale data presented as live** — a 30-second `refetchInterval` + no realtime tail = up to 30s lag, but the UI says "Live." | The freshness indicator shows the loaded-at timestamp. If realtime is OFF, the indicator says so. ADR-005 "never lie about freshness" is the binding contract. |
| **Browser evaluating alarms** to render annotations. | §8.4 defers annotations entirely. When they ship (candidate F4.5G.3), the chart consumes already-evaluated `alarm.event.created` events from the backend — never recomputes thresholds in the browser. |
| **Coupling UI to backend internals** — e.g., the chart accessing Prisma row shapes directly. | The adapter (`lib/api-data/f4/`) is the only frontend layer that knows the wire shape. Components consume normalized view-model types from `lib/api/f4/types.ts` extended additively in F4.5G.1. |
| **Mixing all screens into one phase.** | §6.2 / §13 are explicit. Reviewer rejects any PR that bundles screen migrations beyond `<LiveTrendsPanelLive>` + `<TrendDrawer>`. |
| **Silently falling back to simulator in production.** | §11. Production builds set `NEXT_PUBLIC_RVF_DATA_SOURCE=api` at build time; if missing, the build is misconfigured — operationally caught at deploy. |
| **Expanded view becoming a separate inconsistent data path** — drawer reads from a different adapter than the mini chart, the two disagree on the same metric. | §4 binds both to the same `useOperationsTrendSeries` hook (different window parameters). Shared TanStack Query cache means overlapping windows share data. |
| **Chart performance with large windows** — 1500 buckets × multiple series × SVG paths could thrash a low-end laptop. | `TRENDS_BUCKETS_MAX=1500` (backend cap) and §7.4 keeps the worst case at 672 buckets (`7d` at `15m`). Pure-SVG render of <1500 points across 3 series is well under any practical render budget. |
| **Realtime hook leaks subscriptions** across drawer open/close cycles. | Reference-counted subscribe/unsubscribe at the hook level. Test #4 in `useOperationsTrendSeries.test.tsx` asserts unsubscribe on unmount. |
| **Existing tests break because the simulator path changed.** | F4.5G.1 does NOT modify the simulator path. The new hook lives alongside, switched by the existing `isApiSource()`. Existing F2A tests stay green unchanged. |
| **The new `<TrendDrawer>` portal escapes Next.js SSR.** | `createPortal` requires a client component; the drawer is `'use client'` and mounts the portal only after `useEffect` confirms `document` exists. SSR returns null for the portal until hydration. |
| **Backend rejects a malformed query the frontend constructed** (e.g., `bucket` without `aggregate`). | The adapter validates the param shape client-side mirroring the Zod refines before issuing the request. A failed validation produces a clear `RvfApiError(400, ...)` without a network round-trip. |
| **F4.5G.1 introduces a chart library because "pure SVG can't do X."** | §13 forbids it. The expanded view's needs (single series per chart, time-range pills, ≤1500 points) are met by extending `<TrendChart>` with optional X-axis time labels. |
| **Mocked-Prisma posture on the backend means the frontend's bucketing-mode tests don't catch a real-DB shape mismatch.** | Inherited limitation from F4.6F.1 (master roadmap §10). Until a live-DB integration suite exists, treat the chart's bucketed-mode behavior against mock fixtures as a contract check, not a behavioral guarantee. |

## 16. Acceptance Criteria for F4.5G.1

F4.5G.1 is complete when **all** of the following are true:

- [ ] Operations Live Trends area's historical data comes from `GET /api/v1/telemetry/trends` when `NEXT_PUBLIC_RVF_DATA_SOURCE=api`; from the F4.5E mock adapter otherwise. Simulator fallback intact.
- [ ] `<TrendCard>` is interactive (`role="button"`, keyboard-accessible) and opens `<TrendDrawer>` on click / Enter / Space.
- [ ] `<TrendDrawer>` exists as a portal-based right-side (desktop) / bottom-up (mobile) drawer; uses the same trend hook as the mini chart.
- [ ] Range selector pills (`15m / 1h / 6h / 24h / 7d`) functional; range change re-fetches with the per-range mode/bucket/aggregate per §7.4.
- [ ] Raw / bucketed strategy implemented per §7.4 (default aggregate `avg`, default `qualityPolicy` `good_only`).
- [ ] Realtime tail (subscribing to `live_reading.updated` for the active chart's `(unitId, canonicalTagId)` and appending to the tail) **implemented** OR **explicitly deferred** with a documented reason. If deferred, the mini chart uses `refetchInterval: 30_000`.
- [ ] Frontend types extended additively in `apps/web/lib/api/f4/types.ts` (no breaking changes; no `packages/types/` change).
- [ ] The `adapterGetTelemetryTrends` in `apps/web/lib/api-data/f4/telemetry.ts` accepts and forwards the new optional params; bucketed-mode dual-mode behavior tested.
- [ ] No screen migration beyond `<LiveTrendsPanelLive>` + `<TrendDrawer>` (no `<LiveVariableTile>`, no `<LiveActiveAlarmsPanel>`, no other Operations panels, no Wells / Equipment / Catalog / Tags / Settings / Reports screens).
- [ ] No backend change; no Prisma schema / migration / seed change; no `packages/types/` change; no `docker-compose.yml` / root `package.json` / lockfile / `turbo.json` / `tsconfig*.json` / `.env*` / CI change.
- [ ] No browser-side alarm evaluation; no alarm-overlay markers (deferred per §8.4).
- [ ] Freshness indicator names the active data source (mock / rest / rest+realtime); never silently presents mock as live (per §11).
- [ ] Tests added per §14.1; expected ~12–18 new frontend tests. Existing tests (frontend + 195/195 backend) stay green unchanged.
- [ ] DX-3 §"Runtime phases" validation surface passes end to end: `lint -- --max-warnings 0` / `typecheck` / `build` / `test` for the web app, plus workspace `lint` / `typecheck` / `build`.
- [ ] F4.5G.1 closeout report exists at `docs/architecture/RVF_Malinois_F4_5G_1_Operations_Chart_Adapter_Expanded_Trend_View_Closeout.md`, follows the established closeout structure, reports the final test count, and flags any deviation from this plan.
- [ ] Master roadmap §3 / §7 refresh — deferred to a small follow-up hygiene commit per the established pattern.

## 17. Recommended Next Step

**Next step after F4.5G-0: F4.5G.1 — Operations Chart Adapter + Expanded Trend View Implementation.** Plan-first → implementation per the codified DX-3 pattern. Scope per §6; trend strategy per §7; UX per §8; realtime tail per §9; tests per §14; acceptance per §16.

After F4.5G.1, the master roadmap §7 sequence continues with whichever of these the team picks based on observed need:

- **Candidate F4.5G.2 — Operations realtime tile / status wiring.** Migrates `<LiveVariableTile>` / `<MultiphaseUnitCard>` to consume `live_reading.updated` events opportunistically (or wait for candidate F4.6C.2 latest-value API and switch to pull).
- **Candidate F4.5G.3 — Alarm chart annotations.** Wires `alarm.event.created` overlays into `<TrendChart>` / `<TrendDrawer>` once the operator workflow has settled.
- **Candidate F4.6C.2 — Latest-value Read API.** Public REST endpoint over `live_readings` if tiles need a pull surface.
- **Candidate F4.5H — Non-telemetry screen adapter wiring.** Per-screen migrations for Wells / Equipment / Catalog / Tags / Settings / Reports off the F3 mock adapter to the existing F4.5B / F4.5C / F4.5D adapter base.
- **Candidate F4.6D.2 — Alarm Events Read API.** REST surface over the populated `alarm_events`; unblocks any alarms-screen migration.

These are named so they have a place to land. None is committed to as part of F4.5G.1. The next implementation phase is **F4.5G.1**.

---

*F4.5G-0 plan, authored at HEAD `33a700e` (Refresh master roadmap after F4.6F.1). Plan-only. Update on phase close (`Current` → `Closed` with commit hash) and when F4.5G.1 lands its closeout.*
