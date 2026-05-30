# RVF Malinois — F4.7.2-0 Operations Chart / Drawer Official-Window Pill Plan

> Plan-first phase. **No code changes in F4.7.2-0.** Implementation lands in F4.7.2.1 per the project's plan-first → implementation pattern (DX-3).
> Last known head at authoring time: `e938303` (Refresh master roadmap after F4.7.1). Previous anchor: `409ac1c` (F4.7.1 — Well Test Job Lifecycle and Official Measurement Window Implementation).

## 1. Purpose

F4.7.2-0 locks the scope for **F4.7.2.1 — Operations Chart / Drawer Official-Window Pill Implementation**. It connects the existing per-unit `<TrendDrawer>` and its range-selector pill row to the WellTest official measurement window introduced by F4.7.1 (commit `409ac1c`), without redesigning the Operations screen.

Three rules of this phase:

- **Plan-first.** This document is documentation-only. No file under `apps/web/` is modified.
- **Implementation is F4.7.2.1.** The implementation phase is the next sub-phase; it must execute this plan as written.
- **Incremental UI / data wiring, not a redesign.** F4.7.2.1 must be a surgical change to the existing drawer range-pill row and a new active-WellTest read; it must not relayout the Operations grid, introduce a chart library, change card structure, add lifecycle-transition UI, modify panel composition on `apps/web/app/(rvf-console)/operations/page.tsx`, or migrate any panel that is currently deferred (alarms, communication health, field conditions).

The goal is to surface the WellTest official measurement window as the primary range in the per-unit drawer once a well test reaches `'measuring'` / `'completed'` / `'closed'`, while preserving the existing generic ranges as secondary diagnostic controls for backwards-compat in screens where no active WellTest exists.

## 2. Current Repository State

Verified by file read at HEAD `e938303`:

**WellTest API + adapter foundation is live (F4.7.1, `409ac1c`).**

- Backend `WellTestsModule` exposes the 10 lifecycle endpoints listed in F4.7-0 §13.
- Frontend dual-mode adapters at `apps/web/lib/api-data/f4/well-tests.ts`:
  - `adapterListWellTests(params?, options?)` → `WellTestsListResponse`
  - `adapterGetWellTestById(id, options?)` → `WellTestDetail`
  - `adapterGetActiveWellTest(params, options?)` → `WellTestActiveResponse` (returns the most recent row in `connected | stabilizing | measuring` for the queried `unitId`, or `null` when none)
  - Six transition wrappers (`adapterConnectWellTest`, `adapterStartWellTestStabilization`, `adapterStartWellTestOfficial`, `adapterEndWellTestOfficial`, `adapterAbortWellTest`, `adapterCloseWellTest`)
- Types in `apps/web/lib/api/f4/types.ts`:
  - `WellTestRow` carries `lifecycleStatus`, `testType`, `reportType`, `plannedOfficialDurationHours`, `actualOfficialDurationSeconds` (derived), and the ISO-8601 timestamp set `(connectedAt, stabilizationStartedAt, stabilizationEndedAt, officialStartedAt, officialEndedAt, disconnectedAt, reportGeneratedAt, abortedAt, abortReason)`.
  - `WellTestActiveResponse = { generatedAt, source: 'well_tests', active: WellTestRow | null }`.
- `MOCK_F4_WELL_TESTS` and `MOCK_F4_WELL_TEST_DETAILS` at `apps/web/lib/api-data/f4/mock-fixtures.ts`:
  - HP-001 carries one Fiscalización `measuring` row (`connectedAt`, `stabilizationStartedAt`, `stabilizationEndedAt`, `officialStartedAt` all populated; `officialEndedAt: null`) plus one Optimización `scheduled` row (all timestamps null).
  - LP-001 fixture is empty by design (the F4.3 seed mints no Job for LP-001).

**Operations per-unit drawer is live but generic.**

- `apps/web/app/(rvf-console)/operations/page.tsx` mounts `<OperationsTrendDrawerProvider>` once for the whole Operations page.
- `apps/web/components/operations/OperationsTrendDrawer.tsx` (145 LOC) owns the page-level selection state. Its `OperationsTrendDrawerSelection` carries `unitId`, `canonicalTagName`, `variableTitle`, `unitTitle`, `unitLabel`, `color?`, `defaultWindow?: TrendWindow`, `hasBackendMatch: boolean`, `fallbackJobId?`, `fallbackTag?`. It renders one `<TrendDrawer>` driven by the current selection.
- `apps/web/components/operations/TrendDrawer.tsx` (499 LOC) is the portal-based drawer body. Range pills are emitted by the internal `<RangeSelector>` directly from `TREND_WINDOWS = ['15m', '1h', '6h', '24h', '7d']` (re-exported from `useOperationsTrendSeries.ts`). Source label is one of `Live backend` / `Mock fixture` / `Simulator history`.
- `apps/web/components/operations/LiveVariableTile.tsx` dispatches `drawer.open({ unitId: drawerUnitId, canonicalTagName: String(tile.tag), ..., fallbackJobId: jobId, fallbackTag: tile.tag })`. `drawerUnitId` is the resolved backend `MeasurementUnit.id` UUID supplied by `<LiveMultiphaseUnitCard>` via the F4.5G.2.2.1 resolver.

**Trend data wiring is window-based but the underlying adapter is range-based.**

- `apps/web/lib/hooks/useOperationsTrendSeries.ts` (221 LOC) accepts `window: TrendWindow`, then computes `from`/`to` internally from `WINDOW_MS[window]` (quantized via `quantizeNow(CACHE_BUCKET_MS)` for cache stability) and calls `adapterGetTelemetryTrends({ unitId, canonicalTagName, from, to, ...policy }, { signal })`.
- The trend backend API (F4.6F.1) accepts arbitrary `from` / `to` ISO timestamps with raw / bucketed strategy already; **no backend change is needed** to support arbitrary WellTest-derived windows.
- The hook's TanStack Query cache key already includes `fromEpoch` and `toEpoch`, so a window-name change to a `(pillId, fromEpoch, toEpoch)` cache key only requires extending the hook signature, not the API.

**Operations tile latest-value + realtime overlay are already backend-backed.**

- `apps/web/lib/hooks/useResolveBackendUnitId.ts` resolves `backendUnitCode` → backend `MeasurementUnit.id` UUID via `useUnitsFleet()` (F4.5F). Returns `null` honestly when unresolved. No fake mapping table.
- `apps/web/lib/hooks/useOperationsLatestValues.ts` consumes `adapterGetTelemetryLatest` (F4.6C.2.1) with cache key `['f4-latest', unitId]`, `refetchInterval: 30_000`, `enabled: isApiSource() && unitId !== null && isUuidShaped(unitId)`. This is the template `useActiveWellTest` should follow.

**Reports PDF, `<LiveActiveAlarmsPanel>` migration, alarm chart annotations, and chart realtime tail all remain deferred.** They are out of scope for F4.7.2.

**Master roadmap state.** `docs/architecture/RVF_Malinois_Master_Roadmap.md` at HEAD `e938303` lists F4.7.2 as the **Next** phase, with the deferred F4.5G.4 and the Reports PDF generation phases gated behind F4.7.2 establishing the official-window UI vocabulary.

## 3. Architectural Position

The target data + UI flow for F4.7.2.1:

```
Operator clicks a per-unit LiveVariableTile
  ↓
LiveVariableTile.tsx dispatches drawer.open({ unitId, canonicalTagName, ... })
  ↓
OperationsTrendDrawerProvider sets selection state and mounts <TrendDrawer>
  ↓
NEW: <TrendDrawer> resolves the active WellTest for the selected unit via
     the new useActiveWellTest({ unitId }) hook (wrapper over
     adapterGetActiveWellTest with TanStack Query cache key ['f4-active-well-test', unitId])
  ↓
NEW: useActiveWellTest.well returns either WellTestRow | null
  ↓
NEW: useWellTestWindow(activeWellTest, selectedPillId) derives the (from, to)
     range from the WellTest row's timestamps per §7
  ↓
useOperationsTrendSeries (extended in §9) accepts an explicit windowRange
     {from, to, pillId} instead of (or in addition to) the legacy
     `window: TrendWindow` enum; cache key includes pillId + fromEpoch + toEpoch
  ↓
adapterGetTelemetryTrends (unchanged) reads telemetry between (from, to)
  ↓
<TrendDrawer> renders chart + range badge + source / freshness label
     (`Official Window in progress`, `Stabilization`, etc.) per §11
```

Architectural invariants:

- **WellTest owns the official window.** The drawer derives its window from a `WellTestRow` it does not mutate. Window derivation is a pure function of `(wellTest, pillId, now)`.
- **Trend API stays generic.** F4.6F.1's `GET /api/v1/telemetry/trends` continues to accept arbitrary `from` / `to`. F4.7.2.1 introduces **no new backend endpoint**, **no new query param**, **no schema change**, **no migration**.
- **Operations UI reads from WellTest; it does not write to WellTest.** No `POST /well-tests`, no `POST /well-tests/:id/connect`, etc. originates from F4.7.2.1. Lifecycle-transition UI is a separate future phase.
- **Reports certify against the same `(officialStartedAt, officialEndedAt)` window the drawer's Official Window pill reads.** This is the explicit alignment the phase exists to establish — the pill is the operator-visible anchor that future Reports PDF phases certify against.

## 4. Window / Pill Taxonomy

F4.7.2.1 introduces four primary pills on the per-unit drawer. The pill identifiers below are the canonical strings F4.7.2.1 must use as `data-testid` suffixes and as discriminants in the new hook contracts.

### 4.1 `last-hour` — Last Hour (diagnostic)

- **Available when:** always.
- **From:** `now - 1 hour`.
- **To:** `now`.
- **Label:** `Last Hour`.
- **Badge:** `Diagnostic`.
- **Disabled state:** never disabled.
- **Empty state:** "No samples in last hour." Fall-back simulator history allowed (matches F4.5G.2.2.2 behavior when `result.source === 'mock' || !hasBackendMatch`).
- **Source label:** unchanged from F4.5G.1 / F4.5G.2.2.2 — `Live backend` / `Mock fixture` / `Simulator history`.
- **Diagnostic vs certified:** **Diagnostic only.** Reviewer must reject any future Reports PDF section that derives certification data from this pill.

### 4.2 `stabilization` — Stabilization

- **Available when:** `activeWellTest !== null && activeWellTest.stabilizationStartedAt !== null`.
- **From:** `activeWellTest.stabilizationStartedAt`.
- **To:** `activeWellTest.stabilizationEndedAt ?? activeWellTest.officialStartedAt ?? now` (whichever is non-null first; if all are null, falls back to `now`).
- **Label:** `Stabilization`.
- **Badge:** `Stabilization phase`.
- **Disabled state:** disabled when `stabilizationStartedAt === null`. Disabled-reason tooltip: `Stabilization has not started.`
- **Empty state:** "No samples during stabilization." No simulator-history fallback here — if backend is the source of truth for the WellTest, simulator history would lie about what happened during stabilization.
- **Source label:** `Stabilization · Live backend` / `Stabilization · Mock fixture`. (Always disabled when api source is mock unless `useActiveWellTest` returned the mock measuring fixture.)
- **Diagnostic vs certified:** **Pre-official.** Stabilization data is operationally meaningful but is not the certified output. Reports must not derive Fiscalización / Optimización numbers from it.

### 4.3 `official-window` — Official Window

- **Available when:** `activeWellTest !== null && activeWellTest.officialStartedAt !== null`.
- **From:** `activeWellTest.officialStartedAt`.
- **To:**
  - if `activeWellTest.lifecycleStatus === 'measuring'` → `now` (live, continuously growing window).
  - if `activeWellTest.lifecycleStatus === 'completed' || 'closed'` → `activeWellTest.officialEndedAt`.
  - if `activeWellTest.lifecycleStatus === 'aborted'` → `activeWellTest.abortedAt ?? activeWellTest.officialEndedAt ?? now` (honest fallback; see §12).
- **Label:** `Official Window`.
- **Badge:** one of `Official Window in progress` (measuring), `Official Window completed` (completed / closed), `Official Window aborted` (aborted).
- **Disabled state:** disabled when `officialStartedAt === null`. Disabled-reason tooltip: `Official measurement has not started.`
- **Empty state:** "No samples during official window." No simulator-history fallback.
- **Source label:** `Official · Live backend` / `Official · Mock fixture`.
- **Diagnostic vs certified:** **This is the only pill the future Reports PDF phases are allowed to certify against.** Reviewer must reject any future Reports PDF that ranges over Last Hour / Stabilization / Full Test for Fiscalización or Optimización certification.

### 4.4 `full-test` — Full Test

- **Available when:** `activeWellTest !== null && (activeWellTest.connectedAt !== null || activeWellTest.stabilizationStartedAt !== null)`.
- **From:** `activeWellTest.connectedAt ?? activeWellTest.stabilizationStartedAt ?? activeWellTest.officialStartedAt` (first non-null).
- **To:** `activeWellTest.disconnectedAt ?? activeWellTest.officialEndedAt ?? now` (first non-null).
- **Label:** `Full Test`.
- **Badge:** `Full Test`.
- **Disabled state:** disabled when no `connectedAt` / `stabilizationStartedAt` / `officialStartedAt` is set (i.e., `scheduled`-only). Disabled-reason tooltip: `Well test has not been connected yet.`
- **Empty state:** "No samples during full test." No simulator-history fallback.
- **Source label:** `Full Test · Live backend` / `Full Test · Mock fixture`.
- **Diagnostic vs certified:** **Diagnostic.** Useful for the engineer to see the connection → stabilization → measurement progression in one view; not a certified range.

## 5. Relationship to Existing Generic Windows

F4.5G.1 ships generic pills `15m / 1h / 6h / 24h / 7d` driven by `TREND_WINDOWS` in `useOperationsTrendSeries.ts`. F4.7.2.1 must decide how those coexist with the new pills.

Four options considered:

- **(A) Replace generic pills entirely with the four WellTest pills.** Smallest pill row but loses diagnostic ranges that the operator may want when no active WellTest exists, and forces removal even from the global `<LiveTrendsPanelLive>` mini chart.
- **(B) Keep the generic five under a "Diagnostic windows" secondary control, primary pills become the four official pills.** Preserves diagnostic reach, makes official the default visual anchor.
- **(C) Keep only `Last Hour` as diagnostic and drop the other four generic ranges from the drawer.** Minimal pill row but throws away `6h`, `24h`, `7d` which are useful for engineering-team review of the broader trend leading into the test.
- **(D) Keep current generic buttons until an active WellTest exists, then swap to the four official pills.** Hides diagnostic ranges once the operator has a WellTest selected — risky because the operator may legitimately want to compare a 7-day trend to the official window.

**Recommendation: (B) with a tweak.** Primary pill row becomes:

`Last Hour · Stabilization · Official Window · Full Test`

…and the existing generic ranges `15m / 1h / 6h / 24h / 7d` remain available as a **secondary diagnostic-only row** rendered immediately below, labeled `Diagnostic ranges`. This:

- Makes the official window the visual anchor whenever a WellTest exists.
- Preserves diagnostic reach for legitimate engineering analysis.
- Does not remove anything from the existing F4.5G.1 behavior — important because F4.5G.1 ships `<LiveTrendsPanelLive>` and a separate mini-chart path; F4.7.2.1 is scoped to the per-unit `<TrendDrawer>` only.

The generic ranges are not removed globally; the global `<LiveTrendsPanelLive>` mini chart retains its current range-pill row unchanged. F4.7.2.1 scope is the per-unit drawer only.

## 6. Active WellTest Resolution

A new hook owns the active-WellTest read. Working name: `useActiveWellTest`.

**Suggested location:** `apps/web/lib/hooks/useActiveWellTest.ts`.

**Signature (proposed):**

```ts
export interface UseActiveWellTestInput {
  unitId: string | null;
  enabled?: boolean;
  refetchIntervalMs?: number;
}

export interface UseActiveWellTestResult {
  /** WellTestRow when a connected / stabilizing / measuring test exists for
   *  the queried unit; null when none; null while loading or disabled. */
  active: WellTestRow | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  lastDataAt: string | null;
  response: WellTestActiveResponse | undefined;
  source: RvfDataSource;
  enabled: boolean;
}
```

**Cache key:** `['f4-active-well-test', unitId ?? '']` — mirrors `useOperationsLatestValues`'s key pattern (`['f4-latest', unitId]`).

**Refetch cadence:** `refetchInterval: 30_000` (30 s) — matches the F4.5G.2.2.1 latest-values pacing. The Official Window pill in `'measuring'` state slides its `to` boundary forward continuously, but the WellTest row itself does not change on every tick; 30 s polling is sufficient to detect a lifecycle transition (`measuring` → `completed`) within an operator-tolerable window. A future refinement may subscribe to a candidate `well_test.lifecycle_changed` realtime event, but this phase does not depend on it.

**Enablement gate:** `enabled: (forceEnabled ?? true) && unitId !== null && unitId !== ''`.

Note that this hook intentionally does **not** require `isApiSource()` — `adapterGetActiveWellTest` is a dual-mode adapter and the mock branch resolves from `MOCK_F4_WELL_TESTS` for both HP-001 (one `measuring` row) and LP-001 (empty). The drawer must render correctly in mock mode against the HP-001 measuring fixture.

**UUID guardrail:** the hook does not require a UUID-shape predicate the way `useOperationsLatestValues` does, because `adapterGetActiveWellTest`'s mock branch is tolerant of any string `unitId` (it falls through to an empty envelope for unknown units). The api branch is gated by `isApiSource()` — at the typed-endpoint level it will pass the string through; backend rejects malformed UUIDs with a 400. F4.7.2.1 must NOT introduce a fake-mapping layer between simulator catalog strings (`'EMMAD-01'`) and backend UUIDs anywhere — the `useResolveBackendUnitId` boundary remains the single point of resolution, the same way F4.5G.2.2.1 ships.

**Mock-mode behavior with `MOCK_F4_WELL_TESTS`:**

- HP-001's `useActiveWellTest({ unitId: HP_001_ID })` returns the `measuring` Fiscalización row → pills `Stabilization` / `Official Window` / `Full Test` are all available; `Official Window` is the default.
- HP-001's `useActiveWellTest({ unitId: <wrong unit string> })` returns `{ active: null }` → only `Last Hour` is available; the other three pills are disabled with reason tooltips.
- LP-001 returns `{ active: null }` (LP-001 fixture has no well tests) → same fallback.
- A non-HP-001 simulator job string like `'EMMAD-02'` returns `{ active: null }` → same fallback.

**No active WellTest behavior:** the drawer renders normally with the `Last Hour` pill selected and the three official pills visibly disabled. The badge reads `No active well test`. The chart continues to work for the diagnostic range — this is the case for screens that don't yet have a well test bound (the existing F4.5G.1 behavior path).

## 7. Window Derivation Rules

A pure function `deriveWindow(activeWellTest, pillId, nowMs) → { fromMs, toMs, disabled, disabledReason }` is the single seam between WellTest data and chart query parameters. Suggested location: `apps/web/lib/hooks/useWellTestWindow.ts` (one file: the pure derivation + a thin hook that quantizes `now` for cache stability).

Detailed rules per pill:

### 7.1 `last-hour`

- `disabled = false`.
- `fromMs = now - 60 * 60 * 1000`.
- `toMs = now`.

### 7.2 `stabilization`

- If `activeWellTest === null` OR `activeWellTest.stabilizationStartedAt === null` → `disabled = true`, `disabledReason = 'Stabilization has not started.'`.
- Else:
  - `fromMs = Date.parse(activeWellTest.stabilizationStartedAt)`.
  - `toMs = Date.parse(activeWellTest.stabilizationEndedAt ?? activeWellTest.officialStartedAt ?? null) || now`.

### 7.3 `official-window`

- If `activeWellTest === null` OR `activeWellTest.officialStartedAt === null` → `disabled = true`, `disabledReason = 'Official measurement has not started.'`.
- Else, by `activeWellTest.lifecycleStatus`:
  - `'measuring'` → `toMs = now`.
  - `'completed' | 'closed'` → `toMs = Date.parse(activeWellTest.officialEndedAt!)`. If `officialEndedAt === null` in a `completed`/`closed` row (data invariant violation): `disabled = true`, `disabledReason = 'Official window missing end timestamp.'` (see §12 / §15).
  - `'aborted'` → `toMs = Date.parse(activeWellTest.abortedAt ?? activeWellTest.officialEndedAt ?? now)`; badge becomes `Official Window aborted`.
  - `'scheduled' | 'connected' | 'stabilizing'` → unreachable because the availability gate already disabled the pill.
  - `fromMs = Date.parse(activeWellTest.officialStartedAt!)`.

### 7.4 `full-test`

- If `activeWellTest === null` OR (`connectedAt === null` AND `stabilizationStartedAt === null`) → `disabled = true`, `disabledReason = 'Well test has not been connected yet.'`.
- Else:
  - `fromMs = Date.parse(activeWellTest.connectedAt ?? activeWellTest.stabilizationStartedAt ?? activeWellTest.officialStartedAt!)` (first non-null).
  - `toMs = Date.parse(activeWellTest.disconnectedAt ?? activeWellTest.officialEndedAt ?? null) || now`.

### 7.5 Aborted-test posture

The `aborted` state is reachable from `scheduled` / `connected` / `stabilizing` / `measuring`. Honest treatment:

- `last-hour` always enabled.
- `stabilization` enabled iff `stabilizationStartedAt !== null` (regardless of abort).
- `official-window` enabled iff `officialStartedAt !== null` (operator may still want to see what happened in the partial measurement window). `toMs` clamps to `abortedAt ?? now`. Badge: `Official Window aborted`. Reports phases must not certify against an aborted official window — F4.7.2.1 must surface the abort badge so this is visually unambiguous.
- `full-test` enabled iff `connectedAt !== null || stabilizationStartedAt !== null`. `toMs` clamps to `abortedAt ?? now`.

### 7.6 Quantization

To keep the TanStack Query cache key stable across re-renders, `now` is quantized with `quantizeNow(CACHE_BUCKET_MS)` per the existing `useOperationsTrendSeries.ts` pattern (`CACHE_BUCKET_MS = 15 * 1000`). The `last-hour`, `stabilization` (when end is `now`), `official-window` (when measuring), and `full-test` (when end is `now`) pills all use the quantized `now` for their `toMs` so successive renders within the same 15-second bucket reuse the same cache entry. Pills whose endpoints are pinned to a WellTest timestamp do not need quantization on the right edge.

## 8. Default Selection Rules

When the drawer opens for a `(unitId, canonicalTagName)` selection, the initial pill is chosen as follows:

- `useActiveWellTest` returned `active === null` → `last-hour`.
- `active.lifecycleStatus === 'measuring'` → `official-window`.
- `active.lifecycleStatus === 'completed' || 'closed'` → `official-window`.
- `active.lifecycleStatus === 'stabilizing'` → `stabilization`.
- `active.lifecycleStatus === 'connected'` → `last-hour` (no stabilization / official timestamps yet; `full-test` is technically valid but `last-hour` is the more useful default while the operator waits for stabilization to start).
- `active.lifecycleStatus === 'scheduled'` → `last-hour`. This branch is unlikely in practice because `useActiveWellTest` only returns rows in `connected | stabilizing | measuring`, but the planning rule is defensive.
- `active.lifecycleStatus === 'aborted'` → `official-window` if `officialStartedAt !== null`, else `last-hour`.
- Unresolved backend unit (`hasBackendMatch === false` per the existing `<TrendDrawer>` prop): `last-hour`. Same path as today's F4.5G.2.2.2 simulator-history fallback.

The drawer must continue to support the existing `defaultWindow?: TrendWindow` prop on `<TrendDrawer>` and `OperationsTrendDrawerSelection` for back-compat with any caller (notably the deferred `<LiveTrendsPanelLive>` global panel) that still drives generic ranges. New behavior: if a caller supplies `defaultPillId?: 'last-hour' | 'stabilization' | 'official-window' | 'full-test'` it wins over the lifecycle-derived default; if neither is supplied, the rules above apply.

## 9. Trend Query Strategy

F4.7.2.1 extends `useOperationsTrendSeries` additively:

- New optional input: `windowRange?: { fromMs: number; toMs: number; pillId: 'last-hour' | 'stabilization' | 'official-window' | 'full-test' }`.
- When `windowRange` is supplied, it takes precedence over the legacy `window: TrendWindow` enum. `fromMs` / `toMs` are converted to ISO-8601 for the adapter call.
- When `windowRange` is omitted, the existing F4.5G.1 / F4.5G-0 §7.4 raw-vs-bucketed policy continues to apply (`15m`/`1h` raw; `6h` 1m/avg; `24h` 5m/avg; `7d` 15m/avg).
- For the new pills, a bucketing policy must be selected based on the **derived range width**, not the pill name:
  - width ≤ 1 h → raw mode.
  - 1 h < width ≤ 6 h → `1m` / `avg` / `good_only`.
  - 6 h < width ≤ 24 h → `5m` / `avg` / `good_only`.
  - 24 h < width → `15m` / `avg` / `good_only` (also enforced by `TRENDS_BUCKETS_MAX = 1500` in the backend Zod refine — no hardcoded width cap needs to live in the frontend beyond the existing backend rejection path).
- Cache key extension: `['f4-trends', unitId, canonicalTagName, pillId, bucket, aggregate, qualityPolicy, fromEpoch, toEpoch]` for new pills. Legacy `window`-based callers continue to key by `(window, bucket, …, fromEpoch, toEpoch)` as today. The two cache namespaces share the same `'f4-trends'` prefix so the F4.5G.2.1 reconnect-invalidation seam (`queryClient.invalidateQueries({ queryKey: ['f4-trends'] })`) continues to drop both.
- **Backend trend API is not modified.** All bucketing decisions remain on the client; `adapterGetTelemetryTrends` is called with the same `(from, to, bucket?, aggregate?, qualityPolicy?)` shape it accepts today.
- **F2 simulator-history fallback policy:** the existing F4.5G.2.2.2 behavior continues to apply for the `last-hour` pill in `(source === 'mock' || !hasBackendMatch)` paths. The three official-window pills (`stabilization`, `official-window`, `full-test`) do **not** activate the simulator-history fallback — if backend trends are empty inside the WellTest window, the chart shows `No samples in window.` honestly. The simulator buffer would lie about what was certified.

## 10. UI / UX Behavior

Minimal visible changes; existing drawer layout preserved.

- **Pill row.** Today: one `<RangeSelector>` row with five pills (`15m / 1h / 6h / 24h / 7d`). F4.7.2.1: two rows.
  - Primary row: `Last Hour · Stabilization · Official Window · Full Test`. Disabled pills render with `aria-disabled="true"` and a tooltip surfacing the disabled-reason string from §7.
  - Secondary row: `Diagnostic ranges` header (small, muted), then the existing five generic pills unchanged. Visible at all times.
- **Window summary line.** Below the pill row, a single-line summary of the currently active range: `Official Window: 08:00 → now` or `Stabilization: 08:00 → 08:05` or `Last Hour: 14:23 → 15:23`. Format uses `toLocaleString()` (same as the existing freshness chip) — timezone is the operator's local browser tz. The summary line is the primary place the operator confirms what they are looking at.
- **Badge.** A small badge sits next to the source chip in the drawer header.
  - `Diagnostic` (Last Hour / Full Test / any diagnostic-range pill from the secondary row).
  - `Stabilization phase` (`stabilization`).
  - `Official Window in progress` (`official-window` + measuring).
  - `Official Window completed` (`official-window` + completed/closed).
  - `Official Window aborted` (`official-window` + aborted).
  - `No active well test` (`useActiveWellTest.active === null`).
- **Reports footnote.** Beneath the chart, a small caption: `Reports certify against the official measurement window only.` Renders only when an active WellTest exists. Not interactive; informational.
- **No new card structure, no relayout, no panel restructuring.** `<LiveMultiphaseUnitCard>`, `<LiveVariableTile>`, `<LiveMultiphaseUnitGrid>`, `<LiveTrendsPanelLive>`, `<LiveActiveAlarmsPanel>`, `<LiveCommunicationHealthPanel>`, `<FieldConditionsPanel>`, `<OperationsHeaderRight>`, `<PageHeader>` are byte-equivalent. The `<OperationsTrendDrawerProvider>` mount point in `apps/web/app/(rvf-console)/operations/page.tsx` is unchanged.

## 11. Source / Freshness / Honesty Rules

The drawer header shows three pieces of information: a **source chip**, a **window badge**, and a **freshness label**. Honest labeling rules:

- **Source chip.** Continues to read `Live backend` / `Mock fixture` / `Simulator history` per F4.5G.1 / F4.5G.2.2.2. No change to how the chip is derived.
- **Window badge.** Per §10 — the badge tells the operator *what kind* of range they are looking at. Reviewer must never let a `Diagnostic` badge appear next to a `Live backend` chip when the operator believes they are seeing certified data — the badge is the disambiguator.
- **Freshness label.** Unchanged from F4.5G.1: `Loaded <timestamp>` based on `result.lastDataAt`.
- **Active-WellTest source label.** When the drawer surfaces details about the active WellTest (e.g., in the window summary line), the source must be acknowledged: in mock mode the summary line reads `Official Window (mock fixture): 09:05 → now`.
- **Forbidden labels.** F4.7.2.1 must never label the `Last Hour`, `Full Test`, or any secondary diagnostic range as `certified` / `official` / `fiscalización-ready` / `optimización-ready`. The four phrases reserved for the official pill are listed in §4.3.
- **`No active WellTest` is rendered as an honest neutral state**, not as an error. The drawer continues to function with the `Last Hour` pill; the chart renders generic-range telemetry; the badge clarifies.

## 12. Edge Cases

F4.7.2.1 must handle:

- **No active WellTest** (`useActiveWellTest.active === null`). Three official pills disabled with reason tooltips; default pill is `last-hour`; badge is `No active well test`; reports footnote hidden.
- **Unresolved backend unit** (`hasBackendMatch === false`). `useActiveWellTest` is still called against the (mock or simulator) `unitId`, which yields `active: null` for any non-fixture id; behavior collapses to "No active WellTest" plus the existing F4.5G.2.2.2 simulator-history fallback for the `Last Hour` pill.
- **WellTest in `scheduled` state.** `useActiveWellTest` does not return it (the backend's `/well-tests/active` endpoint filters to `connected | stabilizing | measuring`); from the drawer's perspective this is identical to "No active WellTest".
- **WellTest in `connected` state, no `stabilizationStartedAt` yet.** `useActiveWellTest` returns the row. `stabilization` pill disabled; `official-window` pill disabled; `full-test` pill enabled (uses `connectedAt`); default is `last-hour`.
- **WellTest in `stabilizing` state, no `officialStartedAt` yet.** `stabilization` pill enabled and selected by default; `official-window` disabled with reason; `full-test` enabled.
- **WellTest in `measuring` state, no `officialEndedAt` yet.** `official-window` selected by default with `toMs = now`; the chart's right edge slides forward as the operator watches (the 30-second `useActiveWellTest` poll keeps the row fresh; the `useOperationsTrendSeries` 30-second poll re-fetches).
- **WellTest in `completed`/`closed` state but `officialEndedAt === null`.** Data-invariant violation — should never happen because the backend transitions only stamp `completed` when `endOfficial` fires (which stamps `officialEndedAt`). Defensive behavior: `official-window` pill disabled with reason `Official window missing end timestamp.`; badge reads `Official Window data invariant violation`; the chart falls back to `last-hour`. F4.7.2.1 surfaces the disabled pill rather than silently substituting `now`.
- **`aborted` WellTest.** Per §7.5 — pills derive their ranges from the abort timestamps; the `Official Window aborted` badge prevents the operator from mistaking the partial window for a certified one.
- **Mock mode.** The HP-001 measuring fixture exercises all four pills and the `Official Window in progress` badge. The LP-001 empty fixture exercises the `No active well test` path. Mock-mode adapter clones the fixture on module load (see `apps/web/lib/api-data/f4/well-tests.ts:resetMockWellTestsStore`), so test isolation is straightforward.
- **Backend error.** `useActiveWellTest.isError === true`. Drawer renders with the `Last Hour` pill enabled (so the operator is not blocked) and a small `Couldn't load well test status` chip near the badge. Three official pills disabled with reason `Couldn't load well test status.`
- **Time window with no samples.** Existing F4.5G.1 / F4.5G.2.2.2 empty-state copy applies: `No samples in window.` (or `No samples during official window.` / `No samples during stabilization.` for the official pills).

## 13. Non-Goals

F4.7.2.1 must NOT:

- Modify backend code (`apps/backend/**`).
- Add or modify Prisma schema / migrations.
- Modify `WellTestsModule`, `WellTestsService`, `WellTestsController`, the Zod contract, or any of the 10 lifecycle endpoints.
- Add or modify the `adapterGetActiveWellTest` / `adapterListWellTests` / `adapterGetWellTestById` / transition adapters (read-only consumption only).
- Implement Reports PDF generation (any test type).
- Redesign the Operations screen layout. `apps/web/app/(rvf-console)/operations/page.tsx` stays byte-equivalent.
- Migrate `<LiveActiveAlarmsPanel>` off browser-side `evaluateReading(...)`. (Deferred behind F4.7.2 per the master roadmap.)
- Add alarm chart annotations to `<TrendChart>` / `<TrendDrawer>`. (Candidate F4.5G.3.)
- Implement chart realtime tail / appending `live_reading.updated` directly to the rendered series. (Candidate F4.5G.2.3.)
- Add lifecycle-transition UI controls (connect, start stabilization, start official, end official, abort, close, create). The drawer reads from WellTest; it does not write to it.
- Create or start or stop WellTests from the Operations screen.
- Implement automatic valve-state detection or any automated transition. (Already explicitly deferred by F4.7-0.)
- Add a `packages/types/` change.
- Add a new env variable.
- Add a new runtime dependency.

## 14. Test Plan

F4.7.2.1 ships frontend tests only. Estimated count: **~26–34 new tests** across 2 new spec files plus extensions to existing drawer specs. Exact count is a function of F4.7.2.1's implementation; the planned coverage is below.

### 14.1 `useActiveWellTest.test.tsx` (new spec file; ~10–14 tests)

- Returns `null` when `unitId === null`.
- Returns `null` when `unitId === ''`.
- Returns the active row from `MOCK_F4_WELL_TESTS` when called with `HP_001_ID` in mock mode.
- Returns `null` when called with the LP-001 unit id in mock mode.
- Returns `null` when called with a non-fixture string (e.g. `'EMMAD-02'`) in mock mode.
- `enabled: false` short-circuits the fetch.
- TanStack Query cache key shape matches `['f4-active-well-test', unitId]`.
- `refetchInterval: 30_000` configured.
- Error state propagates as `isError: true` + `error: Error`.
- `source` is `'mock'` / `'api'` per `getDataSource()`.

### 14.2 `useWellTestWindow.test.tsx` (new spec file; ~12–16 tests)

- `last-hour` always returns `(now - 1h, now)`.
- `stabilization` returns `(stabilizationStartedAt, stabilizationEndedAt)` when both set.
- `stabilization` returns `(stabilizationStartedAt, officialStartedAt)` when end is null but official has started.
- `stabilization` returns `(stabilizationStartedAt, now)` when both end and official are null.
- `stabilization` returns `disabled` when `stabilizationStartedAt === null`.
- `official-window` returns `(officialStartedAt, now)` for `measuring`.
- `official-window` returns `(officialStartedAt, officialEndedAt)` for `completed` / `closed`.
- `official-window` returns `disabled` for `scheduled` / `connected` / `stabilizing`.
- `official-window` `disabled` for `completed` rows missing `officialEndedAt` (invariant defense).
- `official-window` clamps to `abortedAt` for `aborted`.
- `full-test` uses `connectedAt` first, else `stabilizationStartedAt`, else `officialStartedAt`.
- `full-test` end clamps to `disconnectedAt` else `officialEndedAt` else `now`.
- `full-test` disabled when no `connectedAt` and no `stabilizationStartedAt`.

### 14.3 `TrendDrawer.test.tsx` (extend; ~4–6 new tests)

- Default pill is `Official Window` when active WellTest is `measuring`.
- Default pill is `Stabilization` when active WellTest is `stabilizing`.
- Default pill is `Last Hour` when no active WellTest.
- `Official Window` pill is disabled and shows `Official measurement has not started.` tooltip when `officialStartedAt === null`.
- Selecting the `Official Window` pill calls `useOperationsTrendSeries` with the WellTest-derived `(from, to)`.
- The window summary line renders `Official Window: HH:MM → now` for `measuring`.
- Existing F4.5G.1 / F4.5G.2.2.2 specs (open / close, range pills, source label, F2 fallback) remain passing.

### 14.4 `useOperationsTrendSeries.test.tsx` (extend; ~3–5 new tests)

- Accepting an explicit `windowRange: { fromMs, toMs, pillId }` builds the adapter call with the supplied range (not `WINDOW_MS[window]`).
- Cache key includes `pillId` when `windowRange` is supplied.
- Width-based bucketing policy selects raw / 1m / 5m / 15m correctly.
- Existing F4.5G.1 cache-key shape is preserved for legacy `window`-based calls.
- Reconnect invalidation against the `['f4-trends']` prefix continues to drop both legacy and new cache entries (asserted by sharing the prefix).

### 14.5 Existing test stability

- All existing `<TrendDrawer>` tests pass unchanged.
- All existing `useOperationsTrendSeries` tests pass unchanged.
- All existing well-tests adapter tests at `apps/web/lib/api-data/f4/well-tests.test.ts` pass unchanged (this phase consumes the adapter; it does not modify it).
- All existing `useOperationsLatestValues` / `useResolveBackendUnitId` / `useOperationsRealtimeF4` tests pass unchanged.

### 14.6 Validation pipeline

Per DX-3 documentation-only and frontend-only phases. F4.7.2.1 must run (and pass):

- `pnpm --filter @rvf/web run lint` — `--max-warnings 0`.
- `pnpm --filter @rvf/web run typecheck`.
- `pnpm --filter @rvf/web run test` — all green, with the new test counts called out in the closeout report.
- `pnpm --filter @rvf/web run build`.

No backend test run is required for F4.7.2.1 because no backend file is touched. The F4.7.1 backend baseline of 309/309 is preserved.

## 15. Risks and Guardrails

| Risk | Guardrail |
|---|---|
| Operator confuses `Last Hour` with the certified Official Window. | §10 badge palette and the §11 forbidden-labels rule. Reviewer must reject any UI diff that lets `Diagnostic` and `Live backend` co-display without a window badge naming the range type. |
| Reports PDF is built before the official-window pill exists. | Already a master-roadmap risk (`docs/architecture/RVF_Malinois_Master_Roadmap.md` §10). F4.7.2.1 closes it on the UI side; Reports PDF generation phases follow. Reviewer rejects any `apps/backend/src/reports/` module added in or before F4.7.2.1. |
| Over-redesigning Operations. | §10 + §13 explicit non-goals. The pill row is the only UI surface that changes; the page tree at `apps/web/app/(rvf-console)/operations/page.tsx` and the card tree are byte-equivalent. |
| `useActiveWellTest` polls too aggressively. | 30-second `refetchInterval` matches `useOperationsLatestValues`. Future tuning is a separate concern. |
| Stale mock WellTest fixtures lock operators into "measuring" indefinitely in mock mode. | Acknowledged. The HP-001 measuring fixture is intentionally synthetic; mock mode is for development / Storybook-style inspection, not field operation. The `Mock fixture` / `Official Window (mock fixture)` labeling per §11 makes this honest. |
| Timezone / local time display drift. | `toLocaleString()` for human-readable summaries (browser local tz, matches the existing `formatTimestamp` helper at `TrendDrawer.tsx:111`). Underlying `(fromMs, toMs)` arithmetic is epoch-ms (tz-independent). |
| `officialEndedAt` missing on a `completed` row. | §7.3 + §12 defense: `official-window` is disabled with explicit reason. The drawer does not silently substitute `now`. |
| `aborted` test surfaces a partial official window that gets mistaken for certified. | §7.5 + §10 badge `Official Window aborted` make the abort state visually unambiguous. Reports phases must verify the badge (post-F4.7.2.1). |
| Generic 24h diagnostic window mistaken for the Fiscalización fixed 24h window. | §11 forbidden-labels rule. The diagnostic-row pills carry the `Diagnostic` badge; only the `official-window` pill produces an `Official Window` badge. |
| Width-based bucketing chooses raw mode for windows that overflow `TRENDS_BUCKETS_MAX`. | Width thresholds in §9 are conservative; the backend Zod refine remains the authoritative cap and rejects oversize bucket counts pre-DB. Frontend defensively maps width → bucket size before issuing. |
| Future realtime tail or alarm annotations land before F4.7.2.1 closes. | Out of scope by §13. If F4.5G.2.3 or F4.5G.3 lands first, F4.7.2.1 must rebase its pill / cache-key extension on top of those changes without merging concerns. |
| `useActiveWellTest` cache key collides with future well-tests caches (e.g. `useWellTestById`). | Cache-key namespace `'f4-active-well-test'` is distinct from `'f4-well-tests'` (list) and `'f4-well-test'` (detail) — F4.7.2.1 must reserve those names so the future hooks don't collide. |
| LP-001 mock fixture returns empty — drawer might render misleading state. | `useActiveWellTest` returns `null` (correct) and the drawer falls back to `Last Hour` with the `No active well test` badge. Honest. Tests in §14.1 assert this. |
| Operator selects `Stabilization` on a `measuring` test and assumes the chart shows the certified data. | §11 + §10 — the badge clearly says `Stabilization phase`, not `Official Window`. The window summary line shows the stabilization start/end timestamps explicitly. |

## 16. Acceptance Criteria for F4.7.2.1

F4.7.2.1 is acceptable when **all** of the following hold:

1. New `useActiveWellTest({ unitId, enabled?, refetchIntervalMs? })` hook exists at `apps/web/lib/hooks/useActiveWellTest.ts`, wraps `adapterGetActiveWellTest`, and uses cache key `['f4-active-well-test', unitId ?? '']`.
2. New `useWellTestWindow(activeWellTest, pillId, nowMs?)` derivation utility exists (location at F4.7.2.1's discretion within `apps/web/lib/hooks/` or `apps/web/lib/operations/`), implementing §7.
3. `apps/web/components/operations/TrendDrawer.tsx` renders the four official pills as the primary pill row per §4, with the disabled-state and tooltip reasons specified in §7.
4. The five generic ranges remain accessible as a secondary diagnostic-row beneath the primary row (option B from §5).
5. Default pill follows §8.
6. Window derivation strictly follows §7. The `official-window` pill uses `(officialStartedAt, officialEndedAt | now)` per lifecycle state and never silently substitutes a generic range.
7. `useOperationsTrendSeries` accepts an explicit `windowRange: { fromMs, toMs, pillId }`, takes precedence over the legacy `window` enum when supplied, and applies the width-based bucketing policy per §9.
8. Source-chip / badge / freshness-label honesty rules per §11 hold; forbidden labels are forbidden.
9. No file under `apps/backend/`, `apps/backend/prisma/`, `packages/types/` is modified.
10. No fake mapping from simulator catalog strings to backend UUIDs is introduced. `useResolveBackendUnitId` remains the only resolution boundary.
11. Mock mode behavior against `MOCK_F4_WELL_TESTS` matches §6: HP-001 surfaces the four pills with `Official Window` as the default; LP-001 surfaces the `No active well test` state with `Last Hour` as the default.
12. `apps/web/app/(rvf-console)/operations/page.tsx` is byte-equivalent.
13. Test coverage per §14 — backend stays at 309/309; web grows by ~26–34 tests with all green.
14. `pnpm --filter @rvf/web run lint` / `typecheck` / `test` / `build` all green.
15. Closeout report at `docs/architecture/RVF_Malinois_F4_7_2_Operations_Chart_Drawer_Official_Window_Pill_Closeout.md` follows the F4.7.1 closeout template (files changed, validation results, deferred work, recommended next phase) and points the master roadmap update to make F4.7.2.1 Closed and promote the next phase per §17.

## 17. Recommended Next Step

After F4.7.2-0 is committed, the recommended next phase is:

**F4.7.2.1 — Operations Chart / Drawer Official-Window Pill Implementation.**

It executes this plan verbatim. No scope is added; no scope is removed.

Possible follow-ups (in roughly increasing order of independence):

- **Candidate F4.7.3 — Operations Current Test Compact Panel.** A small read-only panel pinned near the per-unit cards that summarizes the active WellTest (`testType`, `lifecycleStatus`, `officialStartedAt`, planned duration, elapsed). Pure read; consumes `useActiveWellTest`. Optional.
- **Reports PDF generation — Fiscalización certification.** First Reports backend phase. Consumes `(officialStartedAt, officialEndedAt)` only.
- **Reports PDF generation — Optimización analysis.** Second Reports backend phase.
- **F4.5G.4 — LiveActiveAlarmsPanel Alarm Events API Cutover.** Now consumable because the official-window UI vocabulary exists; the panel can distinguish stabilization-phase from measurement-phase alarms honestly.
- **F4.5G.3 — Alarm chart annotations.** Wires `alarm.event.created` overlays into `<TrendChart>` / `<TrendDrawer>`; can be scoped to the official window once F4.7.2.1 is live.
- **Candidate F4.7.4 — WellTest Lifecycle UI Controls.** Engineer-driven transition buttons (connect / start stabilization / start official / end official / abort / close) wired to the existing transition adapters. Separate phase because it introduces write paths from Operations.

---

*F4.7.2-0 plan, authored at HEAD `e938303` (Refresh master roadmap after F4.7.1). Plan-only; no code changes in this phase. Implementation is F4.7.2.1.*
