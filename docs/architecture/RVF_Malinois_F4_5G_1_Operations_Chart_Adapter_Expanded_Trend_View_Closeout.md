# RVF Malinois — F4.5G.1 Operations Chart Adapter + Expanded Trend View Closeout

> Phase **F4.5G.1 — Operations Chart Adapter + Expanded Trend View Implementation**. Implements the plan locked in F4.5G-0 against repository HEAD `121803d` (Refresh master roadmap after F4.5G-0).
>
> Upstream references:
> - F4.5G-0 plan: `docs/architecture/RVF_Malinois_F4_5G_Operations_Chart_Adapter_Expanded_Trend_View_Plan.md` (commit `1028153`).
> - F4.6F.1 closeout (historical trend API consumed by the chart): `docs/architecture/RVF_Malinois_F4_6F_1_Historical_Trend_API_Closeout.md` (commit `946a023`).
> - F4.6E.1 closeout (realtime fan-out — chart tail deferred per §9): `docs/architecture/RVF_Malinois_F4_6E_1_WebSocket_SSE_Fan_Out_Closeout.md` (commit `51dc626`).
> - F4.5E closeout (telemetry-trends adapter foundation extended by this phase): `docs/architecture/RVF_Malinois_F4_5E_Telemetry_Trends_API_Wiring_Report.md` (commit `6af42fa`).
> - F4.5F closeout (precedent per-screen migration): `docs/architecture/RVF_Malinois_F4_5F_First_Screen_Migration_Units_Report.md` (commit `9e861ce`).

## 1. Purpose

F4.5G.1 implements the Operations chart adapter wiring and expanded trend view defined in F4.5G-0. The Operations Live Trends area can now consume F4.6F.1 historical trend reads when the `NEXT_PUBLIC_RVF_DATA_SOURCE=api` switch is set, and operators can click a mini chart to open an expanded drawer with a range selector (15m / 1h / 6h / 24h / 7d) that drives the same adapter through the F4.5G-0 raw / bucketed query-mode policy. The simulator path is preserved as the default fallback, the browser performs no alarm evaluation, and no backend / schema / migration / realtime / ingestion code is modified.

## 2. Scope Implemented

- **Operations Live Trends backend wiring.** `<LiveTrendsPanelLive>` now picks its data source from `getDataSource()`:
  - `api` mode → backend trend reads through the new `useOperationsTrendSeries` hook (default 15-minute window, 30-second TanStack Query refetch interval).
  - `mock` / default → the existing F2A simulator ring-buffer path is preserved byte-equivalent. Hooks are still called at fixed positions so React-rules cleanliness is maintained.
- **Expanded trend view.** A new portal-based right-side drawer (`<TrendDrawer>`) opens when an operator clicks either of the two `<TrendCard>` mini charts. It reuses the same `useOperationsTrendSeries` hook with a per-user-selected window, so the mini chart and the expanded view never diverge into separate data paths.
- **Range selector.** Pill group with `15m | 1h | 6h | 24h | 7d`. Default opens at `1h` per F4.5G-0 §7.2. Reselecting another metric resets to the default window.
- **Raw / bucketed strategy.** `policyForWindow(...)` returns the per-window strategy locked by F4.5G-0 §7.4 — raw for `15m` / `1h`, `1m`/`avg`/`good_only` for `6h`, `5m`/`avg`/`good_only` for `24h`, `15m`/`avg`/`good_only` for `7d`.
- **Frontend type extensions.** `apps/web/lib/api/f4/types.ts` and `apps/web/lib/api/f4/endpoints.ts` gain the F4.6F.1 bucketed-mode fields (`bucket`, `aggregate`, `qualityPolicy`, `buckets[]`, `TrendBucket`). Additive only — every existing F4.5E consumer still compiles.
- **Adapter parity refines.** `adapterGetTelemetryTrends` in mock mode mirrors the F4.6F.1 Zod refines (bucket ↔ aggregate must appear together; `qualityPolicy` requires `bucket`). The api-mode path forwards the new params verbatim.
- **Chart-series normalizer.** `trendsToChartSeries(...)` + `trendsLatestPoint(...)` + `isChartSeriesEmpty(...)` convert either raw responses or bucketed responses into the `TrendSeries { name, color, data: number[] }` shape `<TrendChart>` consumes. The chart input shape is unchanged.
- **Honest source labeling.** The panel header subtitle reads `F4.6F.1 backend trends` (api) or `F2 simulated normalized stream` (mock); the drawer header carries an explicit `Live backend` / `Mock fixture` chip and a freshness timestamp.
- **Simulator fallback intact.** No screen falls through silently to the simulator in api mode; in mock mode the chart never issues a network request.
- **Realtime tail — deferred.** F4.5G.1 ships REST trend wiring + expanded view only. Realtime tail consumption of `live_reading.updated` is deferred to F4.5G.2 (see §9) — the mini chart relies on TanStack Query's 30-second refetch interval.

## 3. Architecture Decision

- **Trend history comes from F4.6F.1.** Both the mini chart and the expanded drawer read history exclusively from `GET /api/v1/telemetry/trends` (via the F4.5E adapter). Neither component derives history from realtime memory.
- **Realtime is only tail / current notification.** The Socket.IO fan-out is *not* consumed in this phase; when it ships in F4.5G.2 it will append/update the chart tail only, not refeed history. REST remains the authoritative resync surface on reconnect.
- **Simulator / mock is explicit fallback only.** Production deployments set `NEXT_PUBLIC_RVF_DATA_SOURCE=api`; the build-time env load means a misconfigured production deploy is caught at deploy time, not silently at runtime. The drawer freshness chip names the source so a mock-mode reader never mistakes fixture data for live backend data.
- **Browser does not evaluate alarms.** Alarm chart annotations remain deferred (F4.5G-0 §8.4 forward-compat seam). `<TrendDrawer>` never compares values against thresholds.
- **Expanded view reuses the same adapter/data path.** `<TrendDrawer>` and the mini chart both call `useOperationsTrendSeries`, which composes `adapterGetTelemetryTrends`. The same TanStack Query cache backs both, so overlapping windows share data.

## 4. Files Changed

| Path | Action | Notes |
|---|---|---|
| `apps/web/lib/api/f4/types.ts` | Modified | Additive extensions: new `TrendBucketSize`, `TrendAggregate`, `TrendQualityPolicy` unions and `TrendBucket` interface; `TelemetryTrendsResponse` gains optional `bucket` / `aggregate` / `qualityPolicy` / `buckets[]` mirroring F4.6F.1. |
| `apps/web/lib/api/f4/endpoints.ts` | Modified | `GetTelemetryTrendsParams` gains optional `bucket` / `aggregate` / `qualityPolicy`. Existing surface untouched. |
| `apps/web/lib/api/f4/index.ts` | Modified | Re-export the new types from the barrel. |
| `apps/web/lib/api-data/f4/telemetry.ts` | Modified | Mock-mode validation mirrors F4.6F.1 refines (`bucket` ↔ `aggregate` together; `qualityPolicy` requires `bucket`). Existing raw-mode behavior preserved; mock-mode bucket params return raw fixture points per F4.5G-0 §11 option (a). |
| `apps/web/lib/api-data/f4/trendsToChartSeries.ts` | **New.** | `trendsToChartSeries`, `trendsLatestPoint`, `isChartSeriesEmpty` — normalize raw / bucketed responses to the `<TrendChart>` shape; pick the latest finite value for the drawer indicator. |
| `apps/web/lib/api-data/f4/index.ts` | Modified | Re-export the normalizer / latest helpers / emptiness check. |
| `apps/web/lib/hooks/useOperationsTrendSeries.ts` | **New.** | Shared TanStack Query hook driving both the mini chart and the drawer. Returns `{ series, isLoading, isError, isEmpty, lastDataAt, latest, response, source, window, bucketed }`. Cache key quantizes `now` to a 15-second bucket so identical re-renders share a fetch. |
| `apps/web/lib/hooks/index.ts` | Modified | Re-export the hook + `policyForWindow` + `TREND_WINDOWS` + types. |
| `apps/web/components/operations/TrendDrawer.tsx` | **New.** | Portal-based drawer (right-side on desktop, bottom-up on mobile). Range pills, latest value + timestamp, source chip, loading / empty / error states. Close on ESC / backdrop / button. |
| `apps/web/components/operations/LiveTrendsPanelLive.tsx` | Modified | Hooks for both data paths called at fixed positions (3 jobs × 2 tags). API mode consumes the new hook; mock mode keeps the simulator-fed `useHistoryBuffer`. Each `<TrendCard>` is now a `<button>` opening the drawer. Header subtitle reflects the active source. |
| `apps/web/lib/api-data/f4/telemetry.test.ts` | Modified | Adds bucketed-mode param forwarding test + three refine-parity tests (`bucket` without `aggregate`, `aggregate` without `bucket`, `qualityPolicy` without `bucket`). |
| `apps/web/lib/api-data/f4/trendsToChartSeries.test.ts` | **New.** | 12 tests covering raw + bucketed normalization, latest-point extraction, empty-detection. |
| `apps/web/lib/hooks/useOperationsTrendSeries.test.tsx` | **New.** | 6 tests covering `policyForWindow`, mock-mode happy path, api-mode bucketed-param forwarding, error surfacing, `enabled: false` gating. |
| `apps/web/components/operations/TrendDrawer.test.tsx` | **New.** | 10 tests covering open / close (button, backdrop, ESC), range pill behavior (raw → bucketed), loading / empty / error states, mock / api source label. |
| `apps/web/components/operations/LiveTrendsPanelLive.test.tsx` | **New.** | 6 tests covering mock-mode no-fetch, api-mode adapter calls, header subtitle change per source, click-to-open drawer behavior on both cards. |
| `docs/architecture/RVF_Malinois_F4_5G_1_Operations_Chart_Adapter_Expanded_Trend_View_Closeout.md` | **New.** | This document. |

No other file modified. Explicitly:

- No file under `apps/backend/`.
- No `apps/backend/prisma/` change.
- No `packages/types/` change (F4.6E.1 realtime envelope types remain available as forward-compat).
- No `packages/ui/` change (the drawer is screen-local).
- No `docker-compose.yml`, root `package.json`, lockfile, `turbo.json`, `tsconfig*.json`, `.env*`, CI workflow, or `vitest.config.ts` change.
- No new env variable.
- No new dependency.

## 5. Data Flow

```
┌──────────────── On mount / unitId or tag change ──────────────┐
│                                                                │
│  isApiSource() ? useOperationsTrendSeries(...)                 │
│                : useHistoryBuffer(jobId, tag)   (F2 simulator) │
│       │                                                        │
│       ▼                                                        │
│  TrendChart series (≤60 points or windowed REST result)        │
└────────────────────────────────────────────────────────────────┘
        │
        │ (user clicks <TrendCard>)
        ▼
┌──────────────── Expanded drawer ──────────────────────────────┐
│                                                                │
│  <TrendDrawer> mounts → useOperationsTrendSeries({              │
│    unitId, canonicalTagName, window: selectedRange,            │
│    refetchIntervalMs: 60_000                                   │
│  })                                                            │
│       │                                                        │
│       ▼                                                        │
│  GET /api/v1/telemetry/trends?…&bucket=…&aggregate=…&…         │
│  (raw for 15m/1h; bucketed for 6h/24h/7d)                      │
│       │                                                        │
│       ▼                                                        │
│  trendsToChartSeries(...) → TrendChart at height=420           │
│  trendsLatestPoint(...)   → latest value chip                  │
└────────────────────────────────────────────────────────────────┘
```

- **Mount trend fetch.** Each `(unitId, canonicalTagName, window)` triple resolves to a TanStack Query cache entry; identical re-renders within a 15-second quantize window share the fetch.
- **Expanded view fetch.** Same hook, different `window`. TanStack Query's cache means the drawer's `15m` window shares data with the mini chart's `15m` default.
- **Range selection.** Clicking a pill updates local state in `<TrendDrawer>`; the new `window` re-derives the policy + cache key, TanStack Query fetches and renders.
- **Reconnect / resync.** Deferred — the mini chart's 30-second `refetchInterval` keeps the data fresh; the drawer's 60-second `refetchInterval` keeps the expanded view honest. A future realtime hook (F4.5G.2) will trigger explicit `invalidateQueries` on `'connected'` transitions.
- **Realtime tail.** Deferred to F4.5G.2 (see §9).

## 6. UI / UX Behavior

- **Click-to-expand.** Each `<TrendCard>` is rendered as a `<button>` with `aria-label="Open expanded {title} trend view"`. Mouse click, Enter, and Space activate it. Visual affordance: pointer cursor + a focus-visible outline using `--border-focus`.
- **Drawer / modal behavior.** Portal-mounted at `document.body` after `useEffect` confirms it. Right-side panel on `md+` (`max-w-[880px]`), bottom-up sheet on smaller screens. Backdrop is a full-screen semi-transparent button that calls `onClose`.
- **Range pills.** `15m / 1h / 6h / 24h / 7d`. The selected pill carries a raised background; unselected pills are minimal-chrome. `role="radiogroup"` + `role="radio"` with `aria-checked` for assistive tech.
- **Loading / no-data / error states.** Tested separately (`trend-drawer-loading` / `-empty` / `-error` `data-testid` hooks). The mini chart preserves the existing `<TrendChart>` "No data" placeholder.
- **Close behavior.** Close button (top-right `X`), ESC, and backdrop click all call `onClose`.
- **Responsive.** Tailwind responsive utilities only; no library. `md`-breakpoint flip handles desktop / tablet → mobile.

## 7. API / Type Impact

- **Frontend types — additive.** `apps/web/lib/api/f4/types.ts` and `apps/web/lib/api/f4/endpoints.ts` gain the new F4.6F.1 fields (`bucket`, `aggregate`, `qualityPolicy`, `buckets[]`, `TrendBucket`). Every prior consumer compiles unchanged.
- **Raw trend response handling.** `trendsToChartSeries` calls `Number(p.value)` on the Decimal-serialized string and filters non-finite results, matching the F4.5E `toNumericTelemetryPoint` convention.
- **Bucketed trend response handling.** `trendsToChartSeries` reads `buckets[].value` (already `number | null` from F4.6F.1) and filters `null` entries. The chart input shape stays `number[]` — no gap rendering yet.
- **No backend API changes.** F4.5G.1 only consumes already-released F4.6F.1 surfaces.

## 8. Tests / Validation

### 8.1 Frontend tests added

| File | Added | Notes |
|---|---|---|
| `apps/web/lib/api-data/f4/telemetry.test.ts` | +4 | Bucketed-mode param forwarding (api) + three refine-parity tests (mock). |
| `apps/web/lib/api-data/f4/trendsToChartSeries.test.ts` | +12 | Raw + bucketed normalization, latest-point extraction, empty detection. |
| `apps/web/lib/hooks/useOperationsTrendSeries.test.tsx` | +6 | Range → policy; mock + api; error; gating. |
| `apps/web/components/operations/TrendDrawer.test.tsx` | +10 | Open/close (button/backdrop/ESC), range pill flow, loading/empty/error, source label. |
| `apps/web/components/operations/LiveTrendsPanelLive.test.tsx` | +6 | Mock mode no-fetch; api-mode adapter calls; subtitle per source; click-to-open both cards. |

### 8.2 Test counts

| Metric | Before F4.5G.1 (`121803d`) | After F4.5G.1 |
|---|---|---|
| Backend tests | 195 / 195 | **195 / 195** (no backend change; not rerun this phase) |
| Frontend tests | 318 / 318 | **356 / 356** (+38 new) |

### 8.3 Validation commands run

- `pnpm --filter @rvf/web run test` — **38 files / 356 tests passing.**
- `pnpm --filter @rvf/web run lint` — clean (no warnings, no errors).
- `pnpm --filter @rvf/web run typecheck` — clean.
- `pnpm --filter @rvf/web run build` — Next.js prod build green; `/operations` route 9.6 kB.

## 9. Known Limitations / Deferred Work

- **Realtime tail deferred.** F4.5G.1 ships REST-only trend wiring. Subscribing to `live_reading.updated` events and appending to the in-memory chart tail is deferred to **F4.5G.2** per F4.5G-0 §17 sequence. Friction: the existing `createSocketClient` listener layer surfaces a generic `RealtimeMessage` rather than the F4.6E.1-typed event envelopes; introducing a typed F4-aware subscription hook is its own design surface and risks bundling the hook design with the chart wiring under one phase. The closeout sequence keeps the two concerns separate.
- **Alarm chart annotations deferred.** Per F4.5G-0 §8.4 the browser does not evaluate alarms; rendering `alarm.event.created` overlays without the lifecycle (acknowledge / clear from F4.6D.3 candidate) is half a feature. Tracked as candidate F4.5G.3.
- **Latest-value tile migration deferred.** Per F4.5G-0 §10, `<LiveVariableTile>` / `<MultiphaseUnitCard>` continue to read from the F2A simulator + ring buffer. A future candidate F4.6C.2 latest-value API or the F4.5G.2 realtime hook can drive them.
- **Other Operations panels deferred.** `<LiveMultiphaseUnitGrid>`, `<LiveActiveAlarmsPanel>`, `<LiveCommunicationHealthPanel>`, `<FieldConditionsPanel>` remain on their existing adapters per F4.5G-0 §6.2.
- **Wells / Equipment / Catalog / Tags / Settings / Reports screens deferred.** Each remains on its existing F3 mock / F4.5B-D adapter base; per F4.5G-0 §13 these are bundled into a candidate F4.5H.
- **Mock-mode bucketed responses are not aggregated.** Per F4.5G-0 §11 option (a) the mock branch ignores `bucket` params and returns raw fixture points; bucketed-mode behavior is only validated against the live backend.
- **Auth / rate limiting not in scope.** Project-wide no-auth posture inherited; the new realtime / REST calls inherit the same posture as the F4.6 arc.
- **URL deep-linking deferred.** Drawer state is component-local; query-string deep-linking can be a follow-up if needed.

## 10. Acceptance Criteria

F4.5G-0 §16 criteria — confirmed:

- [x] Operations Live Trends area's historical data comes from `GET /api/v1/telemetry/trends` when `NEXT_PUBLIC_RVF_DATA_SOURCE=api`; from the F4.5E mock adapter otherwise. Simulator fallback intact.
- [x] `<TrendCard>` is interactive (`role="button"`, keyboard-accessible via native `<button>`) and opens `<TrendDrawer>` on click / Enter / Space.
- [x] `<TrendDrawer>` exists as a portal-based right-side (desktop) / bottom-up (mobile) drawer; uses the same trend hook as the mini chart.
- [x] Range selector pills (`15m / 1h / 6h / 24h / 7d`) functional; range change re-fetches with the per-range mode/bucket/aggregate per F4.5G-0 §7.4.
- [x] Raw / bucketed strategy implemented per F4.5G-0 §7.4 (default aggregate `avg`, default `qualityPolicy` `good_only`).
- [x] Realtime tail **explicitly deferred** to F4.5G.2 with documented reason (see §9). Mini chart uses 30-second `refetchInterval`; expanded drawer uses 60-second `refetchInterval`.
- [x] Frontend types extended additively in `apps/web/lib/api/f4/types.ts` (no breaking changes; no `packages/types/` change).
- [x] `adapterGetTelemetryTrends` accepts and forwards the new optional params; bucketed-mode dual-mode behavior tested.
- [x] No screen migration beyond `<LiveTrendsPanelLive>` + `<TrendDrawer>`.
- [x] No backend change; no Prisma schema / migration / seed change; no `packages/types/` change; no `docker-compose.yml` / root `package.json` / lockfile / `turbo.json` / `tsconfig*.json` / `.env*` / CI change.
- [x] No browser-side alarm evaluation; no alarm-overlay markers (deferred).
- [x] Freshness indicator names the active data source (mock / api); never silently presents mock as live (per F4.5G-0 §11).
- [x] Tests added per F4.5G-0 §14.1; 38 new frontend tests (above the 12–18 estimate; covers the four new files thoroughly). Existing tests stay green unchanged.
- [x] DX-3 §"Runtime phases" validation surface passes end to end: `lint -- --max-warnings 0` / `typecheck` / `build` / `test` for the web app.
- [x] F4.5G.1 closeout report exists at this path, follows the established closeout structure, reports the final test count.
- [ ] Master roadmap §3 / §7 refresh — recommended as a separate hygiene commit per the established pattern; see §11 below.

## 11. Recommended Next Step

Land the master roadmap hygiene update as a separate small commit (matches the precedent of `121803d` post-F4.5G-0): mark F4.5G.1 as **Closed**, advance the "next phase" pointer, and identify the next deliverable from F4.5G-0 §17:

- **F4.5G.2 — Operations realtime tile / status wiring.** Wires `live_reading.updated` events to the chart tail and (opportunistically) to `<LiveVariableTile>` / `<MultiphaseUnitCard>`; introduces the typed F4-aware realtime subscription hook deferred from F4.5G.1.
- **Candidate F4.5G.3 — Alarm chart annotations.** Overlay markers for `alarm.event.created` on `<TrendChart>` / `<TrendDrawer>`.
- **Candidate F4.6C.2 — Latest-value Read API.** REST surface over `live_readings`; unblocks tile migration via pull semantics.
- **Candidate F4.5H — Non-telemetry screen adapter wiring.** Per-screen migrations for Wells / Equipment / Catalog / Tags / Settings / Reports off the F3 mock adapter.

Recommendation: **F4.5G.2** is the natural follow-up — it builds on the same `useOperationsTrendSeries` cache key, exercises the F4.6E.1 fan-out the F4.6 arc spent a sub-phase establishing, and converts the 30-second mini-chart refetch into a true live tail. If the team prefers to cover more screens before deepening one, **Candidate F4.5H** is the alternative.

---

*F4.5G.1 closeout, authored at HEAD `121803d`. Implementation lives at the next commit pending review. Update on phase close (`Current` → `Closed` with commit hash) once committed.*
