# RVF Malinois — F4.5G.2.2.1 Operations Tile Latest-value Cutover Closeout

> Phase **F4.5G.2.2.1 — Operations Tile Latest-value Cutover Implementation**. Implements the plan locked in F4.5G.2.2-0 against repository HEAD `e03fbfc` (Refresh master roadmap after F4.5G.2.2-0).
>
> Upstream references:
> - F4.5G.2.2-0 plan: `docs/architecture/RVF_Malinois_F4_5G_2_2_Operations_Tile_Latest_Value_Cutover_Plan.md` (commit `1082f3a`).
> - F4.6C.2.1 closeout (the latest-value API + adapter this phase consumes): `docs/architecture/RVF_Malinois_F4_6C_2_1_Latest_Value_Read_API_Closeout.md` (commit `acd68d5`).
> - F4.5G.2.1 closeout (the realtime hook whose `getSlotValue` this phase overlays + whose reconnect handler this phase extends): `docs/architecture/RVF_Malinois_F4_5G_2_1_Operations_Realtime_Tile_Status_Wiring_Closeout.md` (commit `2457c4d`).
> - F4.5G.1 closeout (chart pair preserved by this phase): `docs/architecture/RVF_Malinois_F4_5G_1_Operations_Chart_Adapter_Expanded_Trend_View_Closeout.md` (commit `916d067`).
> - F4.5F closeout (the `useUnitsFleet` hook the resolver composes): see `docs/architecture/RVF_Malinois_F4_5F_First_Screen_Migration_Units_Report.md` (commit `9e861ce`).

## 1. Purpose

F4.5G.2.2.1 implements the Operations tile latest-value cutover defined in F4.5G.2.2-0. F4.6C.2.1 (`acd68d5`) had shipped the canonical current-value REST API and the matching frontend `adapterGetTelemetryLatest`, but the adapter was **dormant** — no UI surface consumed it. This phase converts the dormant adapter into a real consumer: Operations `<LiveVariableTile>` / `<LiveMultiphaseUnitCard>` now read tile primary values from the latest-value endpoint when running in api mode with a resolved backend unit, while preserving the F2 simulator path verbatim in mock mode and for unresolved bindings. The F4.5G.2-0 §9 UUID gap finally closes via the explicit per-binding `backendUnitCode` annotation and the new `useResolveBackendUnitId` hook composed over `useUnitsFleet()`. No fake mapping; no backend change.

## 2. Scope Implemented

- **Augmented `OperationsJobBinding`** with `backendUnitCode?: string`. Populated explicit per row: HP/HF → `'HP-001'`; MP → `'LP-001'`; STALE drill → **omitted** (the F4.3 seed mints no third backend asset).
- **New `useResolveBackendUnitId(code)` hook** at `apps/web/lib/hooks/useResolveBackendUnitId.ts`. Composes the existing `useUnitsFleet()` (F4.5F); matches by `MeasurementUnitListRow.code === backendUnitCode`; returns `{ unitId: string | null, isLoading, error, source }`. Returns `null` for both `code === undefined` and no-match — never throws on those paths.
- **New `useOperationsLatestValues({ unitId })` hook** at `apps/web/lib/hooks/useOperationsLatestValues.ts`. TanStack Query on `adapterGetTelemetryLatest`. Cache key `['f4-latest', unitId]`. `refetchInterval: 30_000` (matches F4.5G.1 mini-chart pacing). `enabled: isApiSource() && unitId !== null && isUuidShaped(unitId)`. Returns `{ valuesByTagName: Map<string, TelemetryLatestValue>, isLoading, isError, error, lastDataAt, response, source, enabled }`.
- **Extended `useOperationsRealtimeF4` reconnect handler** to additively invalidate `['f4-latest']` alongside the existing `['f4-trends']` invalidation on the first `'connected'` after `'reconnecting'`. F4.5G.2.1's hook contract is unchanged otherwise; all existing tests stay green.
- **`<LiveVariableTile>` cutover.** Tile reads from the new hooks in api+resolved mode; F2 simulator path verbatim otherwise. Realtime overlay via the realtime hook's `getSlotValue(unitId, canonicalTagId)` preferred only when `realtime.timestamp > rest.timestamp`. Per-tile source / freshness chip (`Mock fixture` / `No backend unit match` / `Live backend` / `Reconnecting` / `Disconnected · last value HH:MM:SS UTC` / `Loading…` / `Couldn't load latest` / `No latest value`) per F4.5G.2.2-0 §12 / ADR-005.
- **`<LiveMultiphaseUnitCard>` resolver wiring.** Resolves `backendUnitCode` via `useResolveBackendUnitId`; threads the resolved UUID down to each `<LiveVariableTile>`; builds a stable `trackedSlots` array (via `useMemo`) for `useOperationsRealtimeF4` so non-resolved cards never push slot entries.
- **`<LiveMultiphaseUnitGrid>` wiring.** Passes `binding.backendUnitCode` through to each card.
- **Tests.** 36 new frontend tests across 4 new spec files; backend unchanged.

## 3. Architecture Decision

- **Latest API is primary current-value source in api mode.** `useOperationsLatestValues` is the canonical pull surface; tile primary value resolves from `valuesByTagName.get(tile.tag)`.
- **Realtime is overlay only.** F4.5G.2.1's `getSlotValue` is consulted as a fresher tail update — preferred over the REST value only when its timestamp is strictly newer. On reconnect, the REST cache is invalidated and the next render takes the REST refetch as authoritative. Realtime is never persisted as durable state (ADR-008 §3 decision 11).
- **Simulator fallback remains explicit.** Mock mode (`NEXT_PUBLIC_RVF_DATA_SOURCE !== 'api'`) keeps the F2 path verbatim; api mode with `backendUnitCode === undefined` or a resolver `null` also keeps the F2 path with the honest `No backend unit match` chip. No silent fallback.
- **No fake ID mapping.** The `backendUnitCode` annotation lives on the binding — an explicit per-binding declaration. No `Record<string, string>` mapping catalog codes to UUIDs anywhere in the codebase. Bindings without an annotation honestly say so on the tile chip.
- **No backend changes.** F4.6C.2.1's read surface is sufficient; F4.5F's units list is the resolution substrate. Backend tests stay at 217/217.
- **Alarms not migrated.** `<LiveActiveAlarmsPanel>` continues to evaluate alarms in the browser against the F2 simulator path (out of scope per the plan; awaits candidate F4.6D.2). Tile shell color still derives from the F2 `useAlarmState` against the commissioning snapshot — ADR-005-compliant because the snapshot's thresholds are the source of truth, not a live browser computation.

## 4. Files Changed

| Path | Action | Notes |
|---|---|---|
| `apps/web/components/operations/data/operationsJobs.ts` | Modified | `OperationsJobBinding` gains optional `backendUnitCode?: string`. Explicit per-row values: HP/HF → `'HP-001'`; MP → `'LP-001'`; STALE drill → omitted. Doc comment names the hard rule against mapping tables. |
| `apps/web/lib/hooks/useResolveBackendUnitId.ts` | **New.** | Composes `useUnitsFleet()`; matches `MeasurementUnitListRow.code`; returns `null` for undefined / unmatched / loading / error paths. |
| `apps/web/lib/hooks/useResolveBackendUnitId.test.tsx` | **New.** | 9 tests covering the predicate, the resolver, fleet states, and the no-fake-mapping invariant. |
| `apps/web/lib/hooks/useOperationsLatestValues.ts` | **New.** | TanStack Query on `adapterGetTelemetryLatest`; cache key `['f4-latest', unitId]`; `refetchInterval: 30_000`; `enabled` gated on `isApiSource() && unitId !== null && isUuidShaped(unitId)`; returns `valuesByTagName` lookup map. |
| `apps/web/lib/hooks/useOperationsLatestValues.test.tsx` | **New.** | 8 tests covering mock-mode, api-mode happy / non-UUID / null / empty / error / lastDataAt / cache key. |
| `apps/web/lib/hooks/useOperationsRealtimeF4.ts` | Modified | Reconnect handler additively invalidates `['f4-latest']` alongside the existing `['f4-trends']` invalidation. Public hook contract unchanged. Header docblock updated. |
| `apps/web/lib/hooks/index.ts` | Modified | Re-exports the two new hooks + types. |
| `apps/web/components/operations/LiveVariableTile.tsx` | Modified | New optional props (`backendUnitId`, `latestValues`, `realtimeConnection`, `realtimeGetSlotValue`); api+resolved branch reads the new hooks; per-tile source/freshness chip; F2 path verbatim otherwise. |
| `apps/web/components/operations/LiveVariableTile.test.tsx` | **New.** | 11 tests covering mock / api / unresolved / loading / error / no-latest-value / realtime newer / realtime older / mismatched / reconnecting / disconnected. |
| `apps/web/components/operations/LiveMultiphaseUnitCard.tsx` | Modified | New optional `backendUnitCode` prop; resolver + latest + realtime hooks composed; stable `trackedSlots` via `useMemo`; six per-tile hook outputs threaded to `<LiveVariableTile>`. |
| `apps/web/components/operations/LiveMultiphaseUnitCard.test.tsx` | **New.** | 8 tests covering resolver wiring, `backendUnitId` threading, trackedSlots stability + emptiness on unresolved, and chart-untouched smoke. |
| `apps/web/components/operations/LiveMultiphaseUnitGrid.tsx` | Modified | Passes `b.backendUnitCode` through to each card. |
| `docs/architecture/RVF_Malinois_F4_5G_2_2_1_Operations_Tile_Latest_Value_Cutover_Closeout.md` | **New.** | This document. |

No other file modified. Explicitly:

- No `apps/backend/` change.
- No `apps/backend/prisma/` change.
- No `packages/types/` change.
- No `packages/ui/` change.
- No change to `apps/web/lib/api/f4/` / `apps/web/lib/api-data/f4/` (F4.6C.2.1's adapter surface is sufficient).
- No change to F4.5G.1's chart pair (`<LiveTrendsPanelLive>`, `<TrendDrawer>`, `useOperationsTrendSeries`, `trendsToChartSeries`) — `['f4-trends']` cache key unchanged.
- No change to F4.5G.2.1's `<LiveCommunicationHealthPanel>` (its F4 row continues to read from `useOperationsRealtimeF4` exactly as before).
- No change to `<LiveActiveAlarmsPanel>` / `<FieldConditionsPanel>` / `<OperationsHeaderRight>`.
- No `docker-compose.yml`, root `package.json`, lockfile, `turbo.json`, `tsconfig*.json`, `.env*`, CI workflow, or `vitest.config.ts` change.
- No new env variable.
- No new dependency.

## 5. Unit Resolver Behavior

- **Declarative `backendUnitCode` annotation.** Each `OperationsJobBinding` in `OPERATIONS_JOBS` declares for itself which backend asset code it stands in for. The simulator side is honest — the resolver doesn't guess.
- **Composition over `useUnitsFleet()`.** The resolver introduces no new fetch; it filters the units list `useUnitsFleet` already exposes (api mode hits the F4.4D `GET /api/v1/equipment/units` route; mock mode resolves to twin-derived items synchronously).
- **Strict `code` equality.** `MeasurementUnitListRow.code === backendUnitCode`. No regex, no pattern-match, no case-insensitive coercion.
- **`null` is the honest answer.** Returned for:
  - `backendUnitCode === undefined` (binding without the annotation),
  - the fleet hook still loading (paired with `isLoading: true`),
  - the fleet hook errored (paired with `error: Error`),
  - no fleet item matches the supplied code.
  - **In mock mode, the resolver returns `null` for HP-001 / LP-001** because `useUnitsFleet()`'s mock branch returns twin-derived items that do not carry a backend `code`. This is the right honesty: mock mode is not api mode; the tile stays on the F2 simulator path with the `Mock fixture` chip and never tries to fetch the backend.
- **No hardcoded UUID anywhere.** The Hard rule from F4.5G.2.2-0 §9.3 is honored: no `Record<string, string>` mapping catalog codes to UUIDs in the resolver, the tile, the card, the fixtures, or any new helper.

## 6. Latest-value Hydration Behavior

- **Cache key:** `['f4-latest', unitId]`. Independent of and additive to F4.5G.1's `['f4-trends', ...]`.
- **One request per resolved unit (no tag filter).** The endpoint returns up to ~6 rows in a single round-trip; tile-side lookup is O(1) via `valuesByTagName.get(canonicalTagName)`. Three concurrent calls for the current `OPERATIONS_JOBS` triple — well within budget.
- **`enabled` gating** (defense in depth on top of F4.6C.2.1's adapter `assertUuidShaped` guard):
  - `isApiSource()` — mock mode never fetches.
  - `unitId !== null` — unresolved cards never fetch.
  - `isUuidShaped(unitId)` — non-UUID values never reach the adapter.
- **`refetchInterval: 30_000`** matches the F4.5G.1 mini-chart cadence — chosen so REST stays the periodic refresh while realtime fills the gap between refreshes.
- **`valuesByTagName` is a stable empty `Map` when disabled / loading**, so tile renders never crash on `.get(...)`.
- **`lastDataAt`** is derived from TanStack Query's `dataUpdatedAt` — populated only after a successful load.
- **No-data states:** `200 OK` with `values: []` from the adapter → tile shows `—` + `No latest value` chip (per F4.5G.2.2-0 §10.4).

## 7. Realtime Overlay Behavior

- **Merge rule (per F4.5G.2.2-0 §11.1).** At render time, the tile computes `effectiveValue = realtimeSlot && realtime.timestamp > rest.timestamp ? realtimeSlot : restRow`. Both layers carry `value` / `timestamp` / `engineeringUnit` in the same shape.
- **Slot key:** `(unitId, canonicalTagId)` — both UUID-shaped. The card hands the realtime hook a `trackedSlots` array built only after the REST row resolves (so the `canonicalTag.id` UUID is known); the hook's `isUuidShaped` predicate is the second defensive layer.
- **Older / mismatched events are dropped** at the realtime-hook level by F4.5G.2.1's existing logic (slot timestamp is monotonically non-decreasing per slot; mismatched tenant / unit / tag events were already ignored).
- **Mismatched (unitId, canonicalTagId)** at the tile level: `realtimeGetSlotValue(unitId, canonicalTagId)` returns `undefined` → tile falls through to the REST value.
- **Reconnect invalidation.** On `'connected'` after `'reconnecting'`, the realtime hook **now** invalidates **both** `['f4-trends']` (existing F4.5G.2.1 behavior) **and** `['f4-latest']` (added by F4.5G.2.2.1). The next render takes the refreshed REST values as authoritative; the realtime overlay then applies on top of the fresher REST values.
- **Realtime is never source of truth.** On every render, the tile re-evaluates the merge rule against the *current* REST cache value. A realtime overlay is never persisted across re-renders independently of REST.
- **`telemetry.reading.accepted` stays ignored** (F4.5G.2.1 §8.1).
- **`alarm.event.created` is not used for tile values or shell color.** The browser does not evaluate alarms; the tile shell color stays on the F2 evaluator path against the commissioning snapshot.

## 8. UI / UX Behavior

### Tile chip palette (top-right, additive to the existing `statusLabel`)

| Hook state | Chip text |
|---|---|
| `!isApiSource()` (default mock) | `Mock fixture` |
| `isApiSource()` && `backendUnitCode === undefined` (or resolver returned `null`) | `No backend unit match` |
| `isApiSource()` && latest hook `isLoading` | `Loading…` |
| `isApiSource()` && latest hook `isError` | `Couldn't load latest` |
| `isApiSource()` && REST resolved, tag missing from response | `No latest value` |
| `isApiSource()` && REST resolved, realtime `connected` | `Live backend` |
| `isApiSource()` && REST resolved, realtime `reconnecting` | `Reconnecting` |
| `isApiSource()` && REST resolved, realtime `disconnected` | `Disconnected · last value HH:MM:SS UTC` |
| `isApiSource()` && REST resolved, realtime `disabled` / `connecting` / undefined | `Live backend` |

### Tile primary value resolution

- **Mock mode / unresolved backend:** F2 `useLiveValue` path verbatim.
- **API + resolved:** REST `valuesByTagName.get(tile.tag)?.value`, overlaid by realtime `getSlotValue(unitId, canonicalTagId)` when `realtime.timestamp > rest.timestamp`.
- **API + resolved + no REST row for the tile's tag:** `—` (matches the F2 null-rendering posture; chip flips to `No latest value`).

### Card layout / footer

Visually byte-equivalent to the F4.5G.2.1 baseline. The card-footer fields (`Last Update`, `Active Alarms`, `Stale Signals`) continue to derive from `useUnitTelemetrySnapshot` (F2 store) — no change. Future phases may migrate the footer to REST-derived timestamps; not in scope here.

### Chart / drawer / connection health row

**Unchanged.** F4.5G.1 + F4.5G.2.1 surfaces are byte-equivalent. F4.5G.2.2.1's chip lives on the tile only.

## 9. API / Backend Impact

**Zero backend impact.**

- No new backend route.
- No backend service / contract / module change.
- No Prisma schema / migration / seed change.
- No new env variable, dependency, or build-tool change.
- No `packages/types/` change — the new types live in `apps/web/lib/hooks/` and `apps/web/lib/api/f4/types.ts` (the latter shipped in F4.6C.2.1 already).
- No multi-unit batch endpoint introduced. Per-card parallel calls (max 3 concurrent for the current `OPERATIONS_JOBS` triple) are sufficient.

Backend test count stays at **217/217** — backend was not touched.

## 10. Tests / Validation

### 10.1 Frontend tests added

| File | Added | Notes |
|---|---|---|
| `apps/web/lib/hooks/useResolveBackendUnitId.test.tsx` | +9 | HP-001 + LP-001 happy paths; undefined / unknown code → `null`; loading / error pass-through; no fake-mapping of `EMMAD-01`; source pass-through; no latest-API call. |
| `apps/web/lib/hooks/useOperationsLatestValues.test.tsx` | +8 | Mock-mode disabled; api-mode null / non-UUID disabled; api-mode happy path with `valuesByTagName` mapping; empty response; adapter rejection → `isError`; `lastDataAt` set; cache-key shape `['f4-latest', unitId]`. |
| `apps/web/components/operations/LiveVariableTile.test.tsx` | +11 | Mock-mode F2 path; api+unresolved chip; api+resolved REST primary; loading / error / no-latest-value chips; realtime overlay newer / older / mismatched; reconnecting / disconnected chip with timestamp. |
| `apps/web/components/operations/LiveMultiphaseUnitCard.test.tsx` | +8 | Resolver wired with `backendUnitCode`; resolved UUID threaded to tiles; `null` resolver → empty `trackedSlots`; resolved + REST row → UUID-shaped slot; latest hook called with resolved unitId; card-untouched smoke. |

### 10.2 Test counts

| Metric | Before F4.5G.2.2.1 (`e03fbfc`) | After F4.5G.2.2.1 |
|---|---|---|
| Backend tests | 217 / 217 | **217 / 217** (no backend change) |
| Frontend tests | 394 / 394 | **430 / 430** (+36 new across 4 new spec files) |

### 10.3 Validation commands run

- `pnpm --filter @rvf/web run lint` — clean (0 errors, 0 warnings).
- `pnpm --filter @rvf/web run typecheck` — clean.
- `pnpm --filter @rvf/web run test` — **45 files / 430 tests passing**.
- `pnpm --filter @rvf/web run build` — Next.js prod build clean; `/operations` route footprint preserved.

## 11. Known Limitations / Deferred Work

- **STALE drill card has no backend unit binding.** The F4.3 seed mints only HP-001 + LP-001; the third `OPERATIONS_JOBS` row (`JOB_STALE`) has no `backendUnitCode`. Its tile cards honestly display `No backend unit match` in api mode — this is the right honesty, not a bug. Bindings can be filled in when a future seed change mints a third asset.
- **In mock mode, the resolver returns `null` for HP-001 / LP-001.** `useUnitsFleet()`'s mock branch returns twin-derived items (legacy F3 fixtures) that do not carry a backend `code`. Tile renders the F2 simulator path with the `Mock fixture` chip — correct, but it means the api-mode chip palette (`Live backend` / `Reconnecting` / etc.) is only exercised against the real backend or against a manually-configured api mode pointing at the F4.5C `MOCK_F4_MEASUREMENT_UNITS` fixtures. A future hygiene phase may unify `useUnitsFleet`'s mock branch onto `MOCK_F4_MEASUREMENT_UNITS` so mock-mode resolver behavior matches the wire shape.
- **`<LiveActiveAlarmsPanel>` migration deferred** to candidate **F4.6D.2 — Alarm Events Read API** + a follow-up frontend phase.
- **Alarm chart annotations deferred** to candidate **F4.5G.3**.
- **Chart realtime tail deferred** to candidate **F4.5G.2.3** — the mini chart and drawer still rely on `refetchInterval` (30 s / 60 s) between reconnects; `live_reading.updated` is consumed only as a tile overlay and the trend cache invalidation, not appended to the rendered series.
- **Latest-value batch / multi-unit endpoint deferred** to candidate **F4.6C.3**. Three concurrent per-unit calls are fine for the current triple; profile-driven.
- **Card footer fields still F2-derived.** `Last Update`, `Active Alarms`, `Stale Signals` continue to read from `useUnitTelemetrySnapshot` (F2 store). Future phases may re-derive these from REST timestamps; out of scope here.
- **Sparkline data source still F2 ring buffer.** Trend history for the per-tile sparkline strip continues to read `useHistoryBuffer` in both modes. Migrating sparklines to REST trends is a future concern (trend cache would need per-tile resolution).
- **No auth / rate limiting** — inherited project-wide no-auth posture.
- **Mocked-Prisma posture** inherited across F4.6; backend tests pass against mocked Prisma. The live-DB integration suite remains a candidate cross-phase deliverable.

## 12. Acceptance Criteria

F4.5G.2.2-0 §17 criteria — confirmed:

- [x] `OperationsJobBinding` extended with optional `backendUnitCode?: string`. Per-row explicit declarations: HP/HF → `'HP-001'`; MP → `'LP-001'`; STALE drill → **omitted**. No mapping table anywhere.
- [x] New `useResolveBackendUnitId(code)` hook at `apps/web/lib/hooks/useResolveBackendUnitId.ts`. Composes `useUnitsFleet()`. Returns `{ unitId: string | null, isLoading, error, source }`. `null` is the honest answer for `undefined` / no-match — never throws.
- [x] New `useOperationsLatestValues({ unitId, enabled? })` hook at `apps/web/lib/hooks/useOperationsLatestValues.ts`. TanStack Query on `adapterGetTelemetryLatest`. Cache key `['f4-latest', unitId]`. `refetchInterval: 30_000`. `enabled` gated on `isApiSource() && unitId !== null && isUuidShaped(unitId)`. Returns `{ valuesByTagName, isLoading, isError, error, lastDataAt, response, source, enabled }`.
- [x] `<LiveVariableTile>` reads from the new hooks only when api+resolved; F2 path otherwise. No prop signature change (new props are additive optional).
- [x] `<LiveMultiphaseUnitCard>` resolves the backend UUID per render; threads it to each child tile; hands the realtime hook a stable `trackedSlots` array via `useMemo`.
- [x] Per-tile source / freshness chip implemented per §12 / ADR-005.
- [x] Realtime overlay merge rule per §11.1 — preferred only when `realtime.timestamp > rest.timestamp`.
- [x] Reconnect invalidation: on `'connected'` after `'reconnecting'`, both `['f4-trends']` and `['f4-latest']` are invalidated. F4.5G.2.1's `['f4-trends']` behavior stays byte-identical.
- [x] Mock mode (`NEXT_PUBLIC_RVF_DATA_SOURCE !== 'api'`) leaves the F2 simulator path untouched. Chip reads `Mock fixture`.
- [x] Api mode with `backendUnitCode` unresolvable → F2 path; `No backend unit match` chip; no backend call issued; no realtime emit issued.
- [x] Production posture preserved: chip never silently presents mock data as live.
- [x] No backend change. No Prisma schema / migration / seed change.
- [x] No `packages/types/` change.
- [x] No new env variable; no new dependency.
- [x] No fake mapping from simulator catalog codes to backend UUIDs.
- [x] No other UI screen migration.
- [x] No browser-side alarm evaluation introduced.
- [x] Tests added per §15.1: 36 new frontend tests (within the 18–28 estimate's upper-bound family). Existing frontend 394/394 + backend 217/217 stay green unchanged.
- [x] DX-3 §"Runtime phases" validation passes: `lint --max-warnings 0` / `typecheck` / `build` / `test` for `@rvf/web` all green.
- [x] F4.5G.2.2.1 closeout report exists at this path.
- [ ] Master roadmap §3 / §7 refresh — recommended as a separate small hygiene commit per the established pattern (`121803d`, `cafccb6`, `1d0f659`, `2aa6140`, `5d2d3b5`, `5dd9826`, `e03fbfc`).

## 13. Recommended Next Step

Land the master roadmap hygiene update as a separate small commit. After that, the §7 candidate sequence continues — the team picks based on observed need:

- **Candidate F4.5G.3 — Alarm chart annotations.** Wires `alarm.event.created` overlays onto `<TrendChart>` / `<TrendDrawer>`. Browser does not evaluate; consumes server-evaluated `alarm_events` only. Builds on the `alarmEventsSeen` seam F4.5G.2.1 already exposes.
- **Candidate F4.6D.2 — Alarm Events Read API.** Public read surface over `alarm_events`; unblocks `<LiveActiveAlarmsPanel>` migration off its browser-side `evaluateReading` path.
- **Candidate F4.5G.2.3 — Operations chart realtime tail.** Append `live_reading.updated` points to the rendered `<TrendChart>` series instead of only invalidating on reconnect. Sized only if profiling shows the 30 s / 60 s `refetchInterval` cadence is too coarse.
- **Candidate F4.6C.3 — Latest-value batch / multi-unit endpoint.** Only if a multi-unit screen consumer demonstrates the per-card-fan-out pattern is too noisy.
- **Candidate F4.5H — Non-telemetry screen adapter wiring.** Per-screen migrations for Wells / Equipment / Catalog / Tags / Settings / Reports.

Recommendation: **F4.5G.3 (alarm chart annotations)** or **F4.6D.2 (alarm read API)** are the natural next steps — both close the remaining ADR-005 gap on the alarms surface. F4.6D.2 unlocks the `<LiveActiveAlarmsPanel>` migration that has been deferred since F4.5G.2.1; F4.5G.3 makes alarm state visible on the chart in a server-evaluated way. Either is a reasonable pick; **F4.5H** is the alternative if the priority is breadth (more screens migrating to F4 adapters).

---

*F4.5G.2.2.1 closeout, authored at HEAD `e03fbfc`. Implementation lives at the next commit pending review. Update on phase close (`Current` → `Closed` with commit hash) once committed.*
