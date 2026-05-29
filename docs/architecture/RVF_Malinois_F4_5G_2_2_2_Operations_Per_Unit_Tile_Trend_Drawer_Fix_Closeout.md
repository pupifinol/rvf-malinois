# RVF Malinois — F4.5G.2.2.2 Operations Per-unit Tile Trend Drawer Fix Closeout

> Phase **F4.5G.2.2.2 — Operations Per-unit Tile Trend Drawer Fix**. Implementation against repository HEAD `53df3cc` (Add F4.6D.2-0 alarm events read API plan).
>
> Upstream references:
> - F4.5G.1 closeout (introduced the expanded `<TrendDrawer>` and the global `<TrendCard>` click target this phase replaces): `docs/architecture/RVF_Malinois_F4_5G_1_Operations_Chart_Adapter_Expanded_Trend_View_Closeout.md` (commit `916d067`).
> - F4.5G.2.2.1 closeout (per-card resolver + `backendUnitCode` annotation this phase composes over): `docs/architecture/RVF_Malinois_F4_5G_2_2_1_Operations_Tile_Latest_Value_Cutover_Closeout.md` (commit `acd68d5`).
> - F4.5G.2.2-0 plan §9.3 binding rule: "no `Record<string, string>` mapping catalog codes to UUIDs anywhere." Carried into this phase verbatim.
> - F4.6F.1 closeout (the trend read API the drawer body consumes via `useOperationsTrendSeries`): `docs/architecture/RVF_Malinois_F4_6F_1_Historical_Trend_API_Closeout.md`.

## 1. Purpose

Frontend-only UX correction. At commit `53df3cc`, the Operations console (`http://localhost:3000/operations`) had three compounding issues that this phase corrects in one bundled F4.5G.2.2.2 fix iterated across three turns:

1. **Wrong drawer entry point.** The drawer's only click target was the global **LIVE TRENDS** section, hard-wired to the first binding's `(unitId, tag)` pair (`'EMMAD-01'` + `'q_liquid'` for LIQUID FLOW). Operators could not inspect a specific Multiphase Unit / variable, which is the actual operational task.
2. **Empty drawer in mock / unresolved paths.** `useOperationsTrendSeries` is fed by `adapterGetTelemetryTrends`, which in mock mode reads `MOCK_F4_TELEMETRY_TRENDS` keyed by `(unitId, canonicalTag)`. The fixture only ships data for two pairs (`HP_001_ID::p_inlet`, `HP_001_ID::q_gas`). Every other tile click landed on `"No samples in window."` — even though the tile sparkline was happily painting from the F2 ring buffer.
3. **Range pills did nothing in fallback mode.** Once turn 2 introduced the F2 history-buffer fallback, the fallback series used the entire buffer regardless of window. Clicking `15M / 1H / 6H / 24H` showed the same chart, and there was no compact summary the operator could read at a glance.

This phase rewires drawer ownership, adds an honest data-source fallback, and makes the range pills meaningful in fallback mode:

- Each individual variable tile inside each `<LiveMultiphaseUnitCard>` is now the **primary** drawer entry point. The expanded drawer opens for the exact `(resolved unit, canonical tag)` pair the operator clicked.
- The drawer falls back to `useHistoryBuffer(jobId, tag)` — the same F2 ring buffer powering the tile sparkline — when `useOperationsTrendSeries` is empty AND we're in mock mode OR an unresolved binding. api + resolved + backend-empty keeps `"No samples in window"` honest.
- The fallback is **window-aware**: readings are filtered by `ts >= now - WINDOW_MS[window]` so the range pills change the visible chart. When the buffer doesn't cover the selected range (256-sample / 1 Hz buffer ≈ 4 min), the drawer surfaces a `Simulator buffer shorter than selected range` caveat in amber next to the source chip — operators are never misled into thinking the simulator owns deep history.
- A compact 4-column stats strip (`Samples / Min / Max / Avg`) renders below the latest-value row for both data paths.

The unresolved STALE drill (no `backendUnitCode`) opens with a `· No backend unit match` title suffix and falls back to its simulator buffer honestly. The global `<LiveTrendsPanelLive>` keeps its visual chrome but is downgraded from button-shaped click target to non-interactive aggregate view with an explicit `Aggregate · drill into a unit tile for detail` caveat.

No backend change, no schema change, no alarm work, no migration of any other screen — exactly the scope the user requested.

## 2. Scope Implemented

### 2.1 Per-unit tile drawer entry (turn 1)

- **New `<OperationsTrendDrawerProvider>` + `useOperationsTrendDrawer()` context** at `apps/web/components/operations/OperationsTrendDrawer.tsx`. One drawer instance per page; selection state owned in the provider. Hook returns a no-op `open`/`close` when called outside a provider (graceful fallback for tests / Storybook).
- **`<LiveVariableTile>` is now the primary drawer entry point.** Tile's outer container is a `<button>` (was `<div>`). New optional props `drawerUnitId`, `drawerUnitTitle`, `drawerHasBackendMatch`. On click, dispatches `useOperationsTrendDrawer().open({ unitId, canonicalTagName, variableTitle, unitTitle, unitLabel, color, hasBackendMatch, fallbackJobId, fallbackTag })`. Visual affordance: hover-strong border, focus-visible outline, `Expand` icon (`lucide-react`), `aria-label="Open expanded {label} trend view for {unitTitle}"`. Button is `disabled` when the host did not supply drawer identity (back-compat for test harnesses).
- **`<LiveMultiphaseUnitCard>` computes drawer identity per card.** Resolves the drawer's `unitId` from three honest sources, in priority order: (1) api-mode resolver UUID via `useResolveBackendUnitId` (already F4.5G.2.2.1); (2) mock-mode lookup against `MOCK_F4_MEASUREMENT_UNITS` keyed by the same `code` column the backend exposes; (3) simulator job `unitId` fallback. Sets `hasBackendMatch = (1) || (2)`. Passes the resolved triple to each of the six tiles.
- **STALE drill (no `backendUnitCode`) opens the drawer honestly.** The drawer still opens with the simulator job `unitId` (`'PSK-03'`); the title is suffixed with `· No backend unit match`; the chart falls back to the simulator buffer (turn 2). No silent failure, no fake mapping.
- **Global `<LiveTrendsPanelLive>` de-emphasized.** `<TrendCard>` flipped from `<button>` to `<div>` (no click target). The aggregate panel keeps its mini-charts intact and adds an `Aggregate · drill into a unit tile for detail` caveat in the header. Local `useState<DrawerSelection>` removed, along with the local `<TrendDrawer>` mount.
- **Page wrap.** `apps/web/app/(rvf-console)/operations/page.tsx` now wraps its tree in `<OperationsTrendDrawerProvider>` so descendant tiles can dispatch via the context.

### 2.2 F2 history-buffer fallback (turn 2)

- **`<TrendDrawer>` accepts `fallbackJobId?: JobId` + `fallbackTag?: CanonicalTag` + `hasBackendMatch?: boolean`.** When `useOperationsTrendSeries` returns empty AND (`source === 'mock'` OR `!hasBackendMatch`), the drawer renders the F2 ring buffer for `(fallbackJobId, fallbackTag)` instead — the same data path the tile's mini sparkline reads. The source chip flips to `Simulator history` in that case.
- **`useHistoryBuffer` is called unconditionally** with sentinel `(jobId, tag)` brands when the host did not supply them — the F2 store returns `EMPTY_HISTORY` for any unknown pair, so the call is harmless and avoids React-rules violations.
- **The `OperationsTrendDrawerSelection` type** carries the optional `fallbackJobId` + `fallbackTag` so the provider's `open()` API stays a single dispatch with all the identity the drawer needs.
- **No-fake-UUID rule preserved.** The drawer never invents a backend `MeasurementUnit.id`; the simulator path is the same one the tile already uses honestly.

### 2.3 Window-aware fallback + summary stats + buffer-short caveat (turn 3)

- **`WINDOW_MS` exported** from `apps/web/lib/hooks/useOperationsTrendSeries.ts` so the drawer reuses the exact window edges the trend query uses — no duplicated constant.
- **`<TrendDrawer>` filters the fallback by window edge**: `Date.now() - WINDOW_MS[window]`. Clicking `15M / 1H / 6H / 24H / 7D` re-derives the filtered slice, the stats strip, and the latest-value indicator. Empty state shows only when the filtered slice is truly empty.
- **`Simulator buffer shorter than selected range` caveat** (amber, next to the source chip) when the oldest reading in the buffer sits inside the window — i.e. the simulator has not run long enough to cover the selected range. The F2 ring buffer is 256 readings at 1 Hz ≈ 4 min, so this caveat is on for any range ≥ 15 min in normal operation. Operators see the chart with the data the simulator has, never a fabricated deep history.
- **Compact 4-column stats strip** below the latest-value row: `Samples / Min {unit} / Max {unit} / Avg {unit}`. Computed from the rendered series — the trend response in api mode, the filtered fallback in fallback mode — so the same `<StatsStrip>` honestly summarizes both paths. Numbers use the tile's existing `formatStat` rules (integer at ≥ 100, 1 dp at ≥ 10, 2 dp below).
- **The stats strip is hidden when `count === 0`** so the drawer's empty state stays the only signal in honest-empty cases.

### 2.4 Tests

- 15 tile / drawer-dispatch tests (`LiveVariableTile.test.tsx`).
- 6 provider tests (`OperationsTrendDrawer.test.tsx`).
- 5 card drawer-identity tests (`LiveMultiphaseUnitCard.test.tsx`).
- 7 `LiveTrendsPanelLive.test.tsx` (existing "click-to-expand" block flipped to aggregate-caveat / non-clickable).
- **`TrendDrawer.test.tsx` extended from 10 → 22 tests:** 6 F2 fallback (turn 2) + 6 window-aware / stats / short-buffer (turn 3).

## 3. Architecture Decisions

- **Per-tile drawer entry point.** The aggregate panel is structurally a poor drawer entry point — it can address at most one `(unit, tag)` per chart, and the "first binding" choice is arbitrary. The tile already owns the exact `(unit, tag)` slot the operator is reading; dispatching from there is the only entry point that's operationally correct in every cell of the 3 cards × 6 tiles grid.
- **Single drawer instance per page, owned in a context.** Two reasons: (a) only one inspection focus at a time matches operator practice; (b) keeping selection state out of the card / tile avoids cross-card race conditions where two cards would each own their own drawer and stay open simultaneously. The `useOperationsTrendDrawer` hook is the only public surface for opening; tiles don't render `<TrendDrawer>` directly.
- **Mock-mode resolution is not a fake mapping.** The drawer's `unitId` is read from `MOCK_F4_MEASUREMENT_UNITS.find(u => u.code === backendUnitCode)?.id`. This uses the **same `code` column** the real backend exposes for a `MeasurementUnit` — it is the fixture array's own data, not a separate translation table. There is no `Record<string, string>` from `'HP-001' → '00000000-…-4411'` anywhere. The fallback chain (`backendUnitId ?? mockBackendUnitId ?? String(job.unitId)`) plus the boolean `hasBackendMatch` flag keeps the simulator path honest when no backend asset matches.
- **Provider-less fallback is intentional.** `useOperationsTrendDrawer` returns a no-op `open`/`close` outside a provider so existing tile tests do not need to mount a context. The tile is rendered `disabled` in that case (visually + via the `disabled` attribute), so the click path is unreachable.
- **Global panel kept, not removed.** The aggregate mini-charts are still useful for catching cross-unit divergence. Removing them was out of scope per the user constraint "Do not redesign the whole Operations screen." Downgrading from interactive to chrome-only is the minimum change that fixes the empty-drawer bug without disturbing the rest of the layout.

## 4. Files Changed

| Path | Action | Notes |
|---|---|---|
| `apps/web/components/operations/OperationsTrendDrawer.tsx` | **New.** | `<OperationsTrendDrawerProvider>` + `useOperationsTrendDrawer` + `OperationsTrendDrawerSelection` type. Selection carries `fallbackJobId?: JobId`, `fallbackTag?: CanonicalTag`, and `hasBackendMatch` so the drawer can pivot to the F2 buffer honestly. Renders a single `<TrendDrawer>` driven by selection state. Title format: `"{variableTitle} — {unitTitle}"` with backend match, suffixed `· No backend unit match` without. |
| `apps/web/components/operations/OperationsTrendDrawer.test.tsx` | **New.** | 6 tests: initial render no drawer; backend-match title; no-backend-match title suffix; `fallbackJobId`/`fallbackTag`/`hasBackendMatch` forwarding; close removes drawer; provider-less hook is no-op. |
| `apps/web/components/operations/LiveVariableTile.tsx` | Modified | New optional props `drawerUnitId`, `drawerUnitTitle`, `drawerHasBackendMatch`. Outer container converted from `<div>` to `<button type="button">` with disabled fallback. New `Expand` icon affordance (`tile-expand-{id}`), `aria-label`, focus-visible outline. `data-testid="tile-{id}"` added at the button level. Dispatch payload includes `fallbackJobId: jobId, fallbackTag: tile.tag` — the same `(jobId, tag)` the tile's mini sparkline already reads. |
| `apps/web/components/operations/LiveVariableTile.test.tsx` | Modified | Added drawer-dispatch describe block (4 tests). Hoisted `drawerOpenMock` + module mock of `./OperationsTrendDrawer`. `fireEvent` import added. Click-dispatch test asserts `fallbackJobId` + `fallbackTag` are in the payload. |
| `apps/web/components/operations/LiveMultiphaseUnitCard.tsx` | Modified | New import `MOCK_F4_MEASUREMENT_UNITS` from `@/lib/api-data/f4`. New `mockBackendUnitId = useMemo(…)` derivation. New `drawerUnitId / drawerUnitTitle / drawerHasBackendMatch` resolution per the priority chain. Three new props passed down to each `<LiveVariableTile>`. |
| `apps/web/components/operations/LiveMultiphaseUnitCard.test.tsx` | Modified | Tile stub extended to capture `drawerUnitId / drawerUnitTitle / drawerHasBackendMatch`. New describe block (5 tests) covering: resolved → backend UUID; mock fixture lookup; unresolved → simulator id + `hasBackendMatch=false`; `displayName` vs `Multiphase Unit #N` fallback. |
| `apps/web/components/operations/LiveTrendsPanelLive.tsx` | Modified | Removed imports: `cn`, `useState`, `TrendDrawer`. Removed `DrawerSelection` type. Removed `selection`/`openDrawer`/`closeDrawer` state + the local `<TrendDrawer>` mount. `<TrendCard>` flipped from `<button>` to `<div>` (no `onOpen`). Header adds `Aggregate · drill into a unit tile for detail` caveat (`data-testid="live-trends-aggregate-caveat"`). Header docblock updated to call out F4.5G.2.2.2 ownership move. |
| `apps/web/components/operations/LiveTrendsPanelLive.test.tsx` | Modified | "Click to expand" describe block flipped to "Aggregate caveat (F4.5G.2.2.2)": asserts caveat text, asserts `TrendCard` elements are not `BUTTON`, asserts clicking a card opens no dialog. |
| `apps/web/components/operations/TrendDrawer.tsx` | Modified | New optional props `fallbackJobId?: JobId`, `fallbackTag?: CanonicalTag`, `hasBackendMatch?: boolean` (default `true` preserves F4.5G.1 behavior). `useHistoryBuffer` called unconditionally with sentinel `(jobId, tag)` brands when missing. **Turn 3:** fallback series filtered by `Date.now() - WINDOW_MS[window]`; `bufferCoversWindow` boolean drives the amber `Simulator buffer shorter than selected range` caveat; new `<StatsStrip>` renders `Samples / Min / Max / Avg` of the rendered series for both api + fallback paths. Source chip flips to `Simulator history` when the fallback is used. |
| `apps/web/components/operations/TrendDrawer.test.tsx` | Modified | Extended from 10 → 22 tests. F4.5G.2.2.2 turn 2: `useHistoryBuffer` hoisted mock; 6 fallback tests. Turn 3: 6 window-aware / stats / short-buffer tests using `Date.now()`-relative timestamps (no fake timers — TanStack Query's microtask path stalls under them). |
| `apps/web/lib/hooks/useOperationsTrendSeries.ts` | Modified | `WINDOW_MS: Record<TrendWindow, number>` now exported so `<TrendDrawer>` reuses the same window edges instead of duplicating the constant. No other behavior change. |
| `apps/web/app/(rvf-console)/operations/page.tsx` | Modified | Wraps the page tree with `<OperationsTrendDrawerProvider>`. |
| `docs/architecture/RVF_Malinois_F4_5G_2_2_2_Operations_Per_Unit_Tile_Trend_Drawer_Fix_Closeout.md` | **New.** | This document. |

Explicitly **NOT** changed:

- No `apps/backend/` change.
- No `apps/backend/prisma/` change.
- No Prisma migration.
- No change to `apps/web/lib/api/f4/` or `apps/web/lib/api-data/f4/` adapters.
- No change to telemetry ingestion, `live_readings` projection, alarm evaluation, realtime fan-out, the trend API, the latest-value API, or the F4.6D.2 alarm events plan.
- No change to `<LiveActiveAlarmsPanel>` (alarm migration remains deferred to F4.6D.2.1).
- No `<TrendChart>` annotation work.
- No other screen migrated.
- No `Record<string, string>` mapping table added anywhere.

## 5. Tests

Pre-change baseline: 430/430 frontend tests passing (F4.5G.2.2.1 closeout). New count: **458/458** frontend tests passing across the three F4.5G.2.2.2 turns.

| File | Prior | After | Delta | Notes |
|---|---:|---:|---:|---|
| `components/operations/OperationsTrendDrawer.test.tsx` | 0 | 6 | +6 | New file (turn 1) + 1 forwarding test (turn 2). |
| `components/operations/LiveVariableTile.test.tsx` | 11 | 15 | +4 | Drawer-dispatch describe; click payload includes `fallbackJobId` + `fallbackTag`. |
| `components/operations/LiveMultiphaseUnitCard.test.tsx` | 8 | 13 | +5 | Drawer identity describe. |
| `components/operations/LiveTrendsPanelLive.test.tsx` | 7 | 7 | 0 | Click-to-expand block replaced by aggregate-caveat block (3 → 3). |
| `components/operations/TrendDrawer.test.tsx` | 10 | 22 | +12 | Turn 2: 6 fallback tests (`useHistoryBuffer` hoisted mock). Turn 3: 6 window-aware / stats / short-buffer tests. |
| **Total frontend tests** | **430** | **458** | **+28** | All passing. |

Validation commands (executed at the end of turn 3; all green):

```
pnpm --filter @rvf/web run lint           # clean
pnpm --filter @rvf/web run typecheck      # clean
pnpm --filter @rvf/web run test           # 46 files, 458 tests, ~3.9 s
pnpm --filter @rvf/web run build          # ✓ Compiled; /operations route 11.4 kB
```

Backend tests not re-run — no backend code touched in this phase.

## 6. Operator UX (post-fix)

- **Hovering** any variable tile inside a Multiphase Unit card shows a stronger border + cursor pointer; the `Expand` icon appears on the top-right of the tile next to the status label.
- **Clicking** a tile opens the expanded `<TrendDrawer>` for the exact `(unit, variable)` slot the operator just read. The drawer header reads e.g. `"Pressure — Multiphase Unit #1"` or `"Oil Rate — Multiphase Unit #2"`.
- **In mock mode and api+unresolved paths,** the drawer chart now renders the simulator history (the same series the tile sparkline shows) instead of `"No samples in window"`. The source chip below the title reads `Simulator history` so the operator knows what they're looking at.
- **Range pills change the chart.** `15M / 1H / 6H / 24H / 7D` filter the fallback by timestamp; the latest-value indicator and the summary stats strip update with the selection. In api+resolved mode, the existing F4.6F.1 trend API path (raw vs bucketed per F4.5G-0 §7.4) drives the chart unchanged.
- **Buffer-coverage caveat.** When the simulator's 256-sample / 1 Hz ring buffer (~4 min) does not cover the selected range, the drawer surfaces a small amber `Simulator buffer shorter than selected range` chip next to the source chip. Operators never see a fabricated deep history.
- **Compact stats strip** (below the latest-value row) shows `Samples / Min {unit} / Max {unit} / Avg {unit}` for the rendered series. Hidden when count is zero so the honest empty state stays the only signal.
- **STALE drill (Unit #3)** opens with `"{variable} — Multiphase Unit #3 · No backend unit match"`, the simulator-history chip, and (because the simulator is running) a populated chart with the same range / stats / caveat semantics — never a silent failure.
- **Keyboard** navigation works: each tile is a `<button>`, so `Tab` reaches it, `Enter`/`Space` activates it, and the focus-visible outline is the standard `--border-focus` token.
- **Global LIVE TRENDS panel** still renders both aggregate mini-charts (INLET PRESSURE, LIQUID FLOW) but is no longer clickable. Header copy includes `Aggregate · drill into a unit tile for detail` so the operator's eye is guided to the per-unit entry point.

## 7. Constraints Honored

User-supplied hard constraints, mapped to evidence:

- "Do not start F4.6D.2.1." — F4.6D.2.1 not touched. The plan doc at `docs/architecture/RVF_Malinois_F4_6D_2_Alarm_Events_Read_API_Plan.md` is unchanged from commit `53df3cc`.
- "Do not modify backend code." — No file under `apps/backend/` modified.
- "Do not modify Prisma schema or migrations." — No file under `apps/backend/prisma/` modified.
- "Do not modify telemetry ingestion, live_readings projection, alarm evaluation, realtime fan-out, trend API, latest-value API, or alarm events plan." — None of the corresponding backend or adapter files modified.
- "Do not migrate LiveActiveAlarmsPanel." — `LiveActiveAlarmsPanel.tsx` untouched.
- "Do not add alarm chart annotations." — `TrendChart.tsx` untouched.
- "Do not redesign the whole Operations screen." — Only the drawer wiring + tile button shape + aggregate-panel click handler were touched. Layout, header, right rail, footer, status chips, source pills, F2 hooks, all preserved.
- "Do not migrate other screens." — No file under any other `app/(rvf-console)/<screen>/page.tsx` modified.
- "Do not commit unless explicitly instructed." — No commits created in this phase. Closeout left staged for review.
- F4.5G.2.2-0 §9.3 binding rule: "no `Record<string, string>` mapping catalog codes to UUIDs anywhere." — The mock-mode lookup reads `MOCK_F4_MEASUREMENT_UNITS.find(u => u.code === backendUnitCode)?.id`. This is the canonical fixture array, keyed by the same `code` column the real backend exposes; no auxiliary mapping table was introduced.

## 8. Deferred / Out of Scope

- **F4.6D.2.1** (alarm events read API implementation) — paused per user instruction; resumes when this UX correction is accepted.
- **LiveActiveAlarmsPanel migration** — still uses F2 browser-side alarm evaluation; awaits F4.6D.2.1 + a follow-up phase.
- **Trend chart alarm annotations** — not added.
- **Drawer deep-linking / URL state** — the drawer's open state is currently in-memory only; no URL query param. Operators that want to share a "selected slot" view will need a future phase.
- **Aggregate panel removal** — the global LIVE TRENDS panel was kept as visual chrome (per "Do not redesign the whole Operations screen"). A future phase could remove it once the per-unit pattern is the unambiguous operator habit.
- **Tile-level annotations / value markers in the drawer chart** — out of scope; the F4.5G.1 `<TrendDrawer>` is rendered unchanged.

## 9. Next Steps

1. **User review.** Confirm the per-unit click pattern matches the operational intent at `http://localhost:3000/operations`. Verify the STALE drill on Multiphase Unit #3 opens with the `No backend unit match` caveat and an empty chart rather than silently misleading data.
2. **On acceptance:** the master roadmap should be refreshed to note F4.5G.2.2.2 complete (`docs/architecture/RVF_Malinois_Master_Roadmap.md`). This phase does not modify the roadmap; per the "do not commit unless explicitly instructed" constraint, the user owns the commit.
3. **Resume F4.6D.2.1** (alarm events read API implementation), per the plan locked at `docs/architecture/RVF_Malinois_F4_6D_2_Alarm_Events_Read_API_Plan.md` (commit `53df3cc`).
4. **Optional follow-up** to consider after F4.6D.2.1 ships: deep-link the drawer's selected slot to a URL query param so operators can share / bookmark a specific `(unit, variable)` inspection view.
