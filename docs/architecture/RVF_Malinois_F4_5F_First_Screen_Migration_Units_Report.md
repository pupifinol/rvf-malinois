# RVF Malinois — F4.5F First Screen Migration: Units Screen API Wiring Report

> Phase **F4.5F — First Screen Migration (Units screen / fleet selector)**.
> First F4.5 screen migration. Reversible, minimal, visually invariant.
>
> References:
> - F4.5 closeout: `docs/architecture/RVF_Malinois_F4_5_UI_API_Wiring_Foundation_Closeout_Report.md` (commit `c1d24cc`)
> - F4.5A foundation: `docs/architecture/RVF_Malinois_F4_5A_Frontend_API_Client_Foundation_Report.md` (commit `20d45ec`)
> - F4.5C equipment / units adapter: `docs/architecture/RVF_Malinois_F4_5C_Equipment_Units_API_Wiring_Report.md` (commit `f7ecf6c`)
> - F4.4D equipment backend: `docs/architecture/RVF_Malinois_F4_4D_Equipment_API_Reactivation_Report.md` (commit `3cdee45`)

## 1. Summary

F4.5F is the first per-screen migration following the F4.5A → F4.5E foundation arc. It wires the `/units` page's fleet **selector** to the data-source-aware F4 adapter (`adapterListMeasurementUnits` from F4.5C), leaving the rest of the digital-twin payload (telemetry, instruments, calibration, alarm thresholds, separator visualization, …) on the local `twins` mock. The migration is intentionally tiny: one new hook, one prop-type narrowing on the selector component, three small edits on the page.

The visual layout is preserved exactly. Default behavior (`NEXT_PUBLIC_RVF_DATA_SOURCE` unset or `mock`) reads from `twins` synchronously — no network, no loading flicker, no rendered change. Opt-in API behavior (`NEXT_PUBLIC_RVF_DATA_SOURCE=api`) fetches from `GET /api/v1/equipment/units` via the F4.5C adapter and feeds the result into the same `<UnitSelector>` chip.

The digital-twin panels are explicitly **out of scope** for F4.5F — F4 has no live-reading payload yet (deferred to F4.6 telemetry persistence). In API mode, those panels continue to render against the local `twins[0]` fallback when the active id has no local match. This is a documented degraded state that future phases (F4.6 + F4.5G+) will resolve.

All quality gates pass: backend + workspace `lint` / `typecheck` / `build` (no backend file touched); frontend `pnpm test` is **318/318 across 34 files** (311 pre-existing + 7 new in `useUnitsFleet.test.tsx`). No commit was made.

## 2. Files Changed

| Path | Change |
|---|---|
| `apps/web/lib/hooks/useUnitsFleet.ts` | **New.** Source-aware fleet hook. Mock branch derives items synchronously from the local `twins` array; api branch fetches via `adapterListMeasurementUnits` inside `useEffect`, mapping `MeasurementUnitListRow` → `UnitSelectorItem` (`{ id, unitNumber: index+1, name, code }`). Exposes the pure mapper for tests. |
| `apps/web/lib/hooks/useUnitsFleet.test.tsx` | **New.** 7 vitest tests (`renderHook` via `Probe` pattern matching `useAlarmSummary.test.tsx`): mock default + no-fetch guard; api happy path + error + empty; pure-mapper happy + empty. Uses `vi.hoisted` + `vi.mock('@/lib/api-data/f4', …)` to stub the adapter without invoking it. |
| `apps/web/components/units-twin/UnitSelector.tsx` | **Type-narrowed.** Prop `units: readonly UnitTwin[]` → `units: readonly UnitSelectorItem[]` (new local exported interface `{ id: string; unitNumber: number }`). The selector only ever read `id` + `unitNumber`; narrowing the type decouples it from the digital-twin shape and lets the same component accept both mock twins (which satisfy the structural shape) and F4 selector items. No render / styling change. |
| `apps/web/app/(rvf-console)/units/page.tsx` | **Two small edits.** (1) `import { useUnitsFleet } from '@/lib/hooks/useUnitsFleet';` added; (2) `const fleet = useUnitsFleet(); const selectorItems = fleet.items.length > 0 ? fleet.items : twins;` replaces the direct `twins` pass-through to `<UnitSelector>`; (3) the `units={twins}` prop becomes `units={selectorItems}`. Active twin still resolves from the local `twins` mock (digital-twin panels untouched). |
| `docs/architecture/RVF_Malinois_F4_5F_First_Screen_Migration_Units_Report.md` | **New.** This document. |

No file under `apps/backend/`, `apps/backend/prisma/`, `packages/`, `docker-compose.yml`, root config, or any existing `apps/web/` screen except the targeted `/units/page.tsx` and the explicitly-narrowed `UnitSelector` was modified. The F3 mock adapter (`apps/web/lib/api-data/index.ts` and the `mockX` siblings), the F4 adapter layer (`apps/web/lib/api-data/f4/`), the F4 API client (`apps/web/lib/api/f4/`), the digital-twin mock (`apps/web/components/units-twin/data/twin.mock.ts`), and every other `units-twin` panel are byte-for-byte preserved.

## 3. Why Units Was Selected as First Screen Migration

The F4.5 closeout (§13) suggested settings / units summary / read-only diagnostics as low-risk first migration targets. Among the available pages (`/units`, `/operations`, `/wells`, `/sensors`, `/alarms`, `/jobs`, `/equipment`, `/settings`, `/catalog`, `/multiwell`, `/audit`, `/trends`, `/reports`, `/analytics`), Units is the right starting point because:

1. **The page already has a fleet roster concept.** The `<UnitSelector>` chip at the header reads from a `twins` array — a small, well-typed list. Replacing the array source is the smallest possible "real screen consumes F4 data" change.
2. **F4.3 seeds exactly the data the selector needs.** Two measurement units (HP-001, LP-001) with `code` + `name`. The F4.5C adapter exposes both list-row fields directly.
3. **The fleet selector is decoupled from the digital-twin panels.** The selector cares about `{ id, unitNumber }`; the panels care about `UnitTwin`. The two responsibilities cleanly separate, so the migration affects exactly one prop on one component.
4. **No telemetry / live readings / alarm events are wired through the selector.** The F4.5F migration cannot accidentally introduce a "telemetry over the wire" expectation that would force F4.6 to land first.
5. **Mock mode preserves the current behavior verbatim.** `useUnitsFleet()` in mock mode returns the existing `twins`-derived items synchronously, with no loading flicker.

Operations charts were explicitly avoided because they need real telemetry (F4.6). Settings / catalog were considered as alternatives but currently render placeholders (`PlaceholderPage`) and don't have a real data consumer yet — migrating them would be a no-op.

## 4. Current Units Screen Data Contract

The `/units` page is a digital-twin engineering view of one multiphase well-testing separator. The data contract has two scopes:

### 4.1 Fleet roster (`<UnitSelector>`)

| Field consumed | Source pre-F4.5F | Source post-F4.5F |
|---|---|---|
| `id` | `twin.id` (e.g. `unit-1`) | `twin.id` in mock; `MeasurementUnit.id` (UUID) in api. |
| `unitNumber` | `twin.unitNumber` (1 / 2 / 3) | Same in mock; `index + 1` in api (ordinal — F4 row has no unique sequence number). |

`UnitSelector` is the only component that reads these two fields directly. F4.5F narrows its prop type to `readonly UnitSelectorItem[]`.

### 4.2 Active digital-twin payload (every other panel on the page)

| Field consumer | Field shape | Status in F4.5F |
|---|---|---|
| `PageHeader` title + status chip | `twin.unitNumber`, `twin.config.unitClass`, `twin.status` | Local mock only. |
| `UnitProfileTag` | `twin.config.profileTag` | Local mock only. |
| `UnitStatusBar` | `twin.well` / `job` / `startedUtc` / `durationSec` / `dataQualityPct` / `comm` | Local mock only. |
| `ProcessVariableTile` ×8 | `twin.{inlet,separation,gasOutlet,liquidOutlet}.*` (`ProcessVariable` with `value`, `unit`, `history`, …) | **Local mock only.** Live readings stay on mock — F4.6 owns telemetry persistence. |
| `SeparatorDiagram` | `twin.levels` + every loop reading | Local mock only. |
| `LinePressureCard` | `twin.linePressure` | Local mock only. |
| `CompositionBars` | `twin.composition` | Local mock only. |
| `UnitConfigurationSummary` | `twin.config.*` | Local mock only. |
| `UnitAlarmThresholdsPanel` | `twin.config.thresholds` (per-tag warning/alarm bands) | Local mock only. |
| `TelemetrySourcePanel` | `twin.telemetry` | Local mock only. |
| `LiveInstrumentReadingsPanel` | `twin.instruments` | Local mock only. |
| `UnitHealthPanel` | `twin.instruments` + status | Local mock only. |
| `EngineeringLimitsPanel` | `twin.config` envelope | Local mock only. |
| `InstrumentSummaryPanel` | `twin.instruments` | Local mock only. |
| `CalibrationStatusPanel` | `twin.calibrations` | Local mock only. |

**Migration boundary.** Every field above is part of the digital-twin payload that F4 does NOT carry. The unit-detail endpoint (`GET /equipment/units/:id`, F4.4D) returns `sensors / unitConfigurations / unitOperatingEnvelopes / alarmRules` — none of which match the in-vessel process variables / live readings the digital-twin panels render. F4.5F intentionally leaves those panels on the local mock. A future migration (F4.5G+ or F4.6+) can layer a `MeasurementUnitDetail` → partial-twin mapper at the page boundary; F4.5F does not pre-empt that choice.

## 5. F4 Adapter Integration

`useUnitsFleet()` is the single integration point. It reads `getDataSource()` once per render and either:

- **mock mode** — returns a module-level constant (`TWIN_DERIVED_ITEMS`) synchronously. `isLoading: false`, `error: null`, no `fetch`.
- **api mode** — fetches via `adapterListMeasurementUnits()` inside `useEffect`, with `AbortController` cleanup. `isLoading` starts `true`; clears when the promise settles. Errors surface as `error: Error` and leave `items: []`.

Source switch behavior is identical to F4.5B–E adapters: `mock` (default) preserves current UI; `api` opts in; unknown env values fall back to `mock`; api-mode failures propagate as `RvfApiError` (never silently fall back to mock).

The hook intentionally avoids TanStack Query for now. TanStack Query is already a dependency (`apps/web/components/providers/Providers.tsx` mounts `QueryProvider`), but the matching local hook pattern in `lib/hooks/` is `useEffect` + `useState` (see `useAlarmCenter`, `useAlarmSummary`, `useHistoryBuffer`). F4.5F follows the local convention; a future refactor can wrap `useUnitsFleet` in `useQuery` once a multi-screen migration justifies it.

## 6. Mapping / View-Model Decisions

### 6.1 `UnitSelectorItem`

```ts
interface UnitSelectorItem {
  id: string;
  unitNumber: number;
  name?: string;
  code?: string;
}
```

The minimum shape that satisfies `<UnitSelector>`. `name` and `code` are optional so the same type accepts both the local mock (which has no `code`) and the F4 row (which has both `code` and `name`).

### 6.2 Mapper

```ts
const toUnitSelectorItem = (row: MeasurementUnitListRow, index: number): UnitSelectorItem => ({
  id: row.id,
  unitNumber: index + 1,      // ordinal — F4 row has no sequence number
  name: row.name,
  code: row.code,
});
```

`unitNumber` deliberately uses the array index rather than parsing the `code` (HP-001 → 1; LP-001 → 1 would collide). The selector renders `Multiphase Unit #{unitNumber}` so an ordinal is sufficient; the human-readable asset id (HP-001, LP-001) is captured in `code` and is available for any future label override.

### 6.3 `UnitSelector` prop narrowing

```ts
// Before:  units: readonly UnitTwin[];
// After:   units: readonly UnitSelectorItem[];
```

`UnitTwin` already satisfies `UnitSelectorItem` structurally (`id: string`, `unitNumber: number`), so every existing call site continues to compile. The narrowing only matters for new callers feeding F4-derived items into the selector — they no longer need to synthesise a fake `UnitTwin` to satisfy the type.

### 6.4 Active-twin fallback

The page's active twin still resolves from the local `twins` mock:

```ts
const twin = useMemo(() => {
  const match = twins.find((u) => u.id === activeId);
  return match ?? twins[0];
}, [activeId]);
```

In api mode, `activeId` may be an F4 UUID that does not match any local twin id, so the fallback to `twins[0]` activates and the digital-twin panels render against the first local mock unit. This is a documented degraded state — see §7.

### 6.5 Loading / empty fallback

```ts
const selectorItems = fleet.items.length > 0 ? fleet.items : twins;
```

If the hook reports `items: []` (initial api-mode render before the fetch settles, an empty backend, or an api-mode error), the selector falls back to the local `twins` so the page never renders an empty selector. In mock mode, `fleet.items` is always the twins-derived list, so the fallback path is never taken.

This is intentional defensive code: F4.5F is a foundation step, and the migration should not make the page worse if the backend is unreachable.

## 7. What Remains Mock / Local

Substantial: F4.5F is a fleet-selector-only migration. The entire digital-twin payload stays on mock:

- **All 17 panels** on the page (PageHeader, UnitProfileTag, UnitStatusBar, 8 × ProcessVariableTile, SeparatorDiagram, LinePressureCard, CompositionBars, UnitConfigurationSummary, UnitAlarmThresholdsPanel, TelemetrySourcePanel, LiveInstrumentReadingsPanel, UnitHealthPanel, EngineeringLimitsPanel, InstrumentSummaryPanel, CommunicationHealthPanel, CalibrationStatusPanel) read from `twin` (a `UnitTwin` from the local mock).
- **`UnitSelector` label** — always renders `Multiphase Unit #{unitNumber}` (the existing text). F4.5F does not switch the label to `code` (HP-001 / LP-001) to preserve visual invariance.
- **Active job / well / engineer.** The F4.4E job adapter exists (F4.5D) but is not wired here — `twin.well`, `twin.job` come from local mock.
- **Telemetry / live readings / charts.** Out of scope. The Operations chart wiring waits for F4.6.
- **Calibration history.** `twin.calibrations` is local-mock only; the F4 schema has a `calibrationDate / calibrationRangeMin / calibrationRangeMax / calibrationReference` per transmitter but no calibration history table.
- **Communication health.** `CommunicationHealthPanel` is a placeholder for F4.6 WebSocket-side metrics.

Migrating any of the above is a deliberate F4.5G+ scope decision, not a F4.5F oversight.

## 8. Confirmation: Mock Remains Default

Verified four ways:

1. **`NEXT_PUBLIC_RVF_DATA_SOURCE` defaults to `mock`** (F4.5A; verified by `useUnitsFleet` mock-mode tests: `delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE` then `Probe` renders the twins-derived items synchronously, never calling the adapter).
2. **No screen / hook / component other than the targeted three was modified.** F3 mock adapter byte-for-byte preserved.
3. **Existing test suite is unaffected.** Pre-F4.5F: 311 tests across 33 files. Post-F4.5F: 318 tests across 34 files. The delta is exactly the 7 new tests in `useUnitsFleet.test.tsx`.
4. **`next build` bundle output is unchanged for every existing route** other than `/units` (and `/units`'s diff is the addition of the `useUnitsFleet` hook, which tree-shakes the adapter call in mock-mode bundles).

## 9. API Mode Behavior

When `NEXT_PUBLIC_RVF_DATA_SOURCE=api`:

1. `useUnitsFleet` initially returns `{ items: [], isLoading: true, error: null, source: 'api' }`.
2. The page's `selectorItems` falls back to `twins` (no empty selector flash).
3. `adapterListMeasurementUnits()` issues `GET ${NEXT_PUBLIC_RVF_API_BASE_URL}/equipment/units` with `AbortSignal` for cleanup.
4. On success, `items` updates to the F4-mapped rows (HP-001 → ordinal 1, LP-001 → ordinal 2 when the F4.3 seed is applied).
5. On failure, `error` is set; the selector keeps the `twins` fallback.
6. The active twin still comes from the local `twins` mock — clicking an F4-derived selector item updates `activeId` but the page's `twins.find(…)` fallback to `twins[0]` keeps every panel rendered.

**Reversibility.** Setting `NEXT_PUBLIC_RVF_DATA_SOURCE` back to `mock` (or unsetting it) reverts the page to its pre-F4.5F behavior on the next build — no code change required.

## 10. Confirmation: No Backend / Prisma / Migration / Seed Files Changed

`git status` shows only frontend + docs changes:

```
modified:   apps/web/app/(rvf-console)/units/page.tsx
modified:   apps/web/components/units-twin/UnitSelector.tsx
?? apps/web/lib/hooks/useUnitsFleet.test.tsx
?? apps/web/lib/hooks/useUnitsFleet.ts
?? docs/architecture/RVF_Malinois_F4_5F_First_Screen_Migration_Units_Report.md
```

No file under `apps/backend/`, `apps/backend/prisma/`, `apps/backend/prisma/migrations/`, `apps/backend/prisma/seed.f4.ts`, `packages/*`, `docker-compose.yml`, `turbo.json`, root `package.json`, or `.github/` was modified.

## 11. Confirmation: No Telemetry / Live Readings Implemented

The Units page consumes telemetry-like data only through `UnitTwin` (the local mock), exactly as before. F4.5F:

- **Does NOT** call `adapterGetTelemetryTrends` (F4.5E adapter) from any screen.
- **Does NOT** read `live_readings_projection`.
- **Does NOT** introduce WebSocket telemetry.
- **Does NOT** generate alarm events.
- **Does NOT** invoke F4.4F's `GET /api/v1/telemetry/trends`.

The `LiveInstrumentReadingsPanel`, `TelemetrySourcePanel`, and every `ProcessVariableTile` continue to render against the local mock. F4.6 owns the migration of these surfaces.

## 12. Commands Run and Results

| Command | Result |
|---|---|
| `pnpm --filter @rvf/web run lint` | clean exit (fixed three rounds during authoring: `import/no-duplicates` on the F4 barrel, `import/order` for `@/lib/api/f4` vs `@/lib/api-data/f4` segment-by-segment alphabetisation, `@typescript-eslint/no-non-null-assertion` on test fixtures replaced with destructure + early return). |
| `pnpm --filter @rvf/web run typecheck` | clean. |
| `pnpm --filter @rvf/web run test` | **318/318 across 34 files** (311 pre-existing + 7 new in `useUnitsFleet.test.tsx`). |
| `pnpm --filter @rvf/web run build` | clean (`next build`); every existing route bundle size unchanged. |
| `pnpm run lint` (workspace) | 4/4 tasks successful. |
| `pnpm run typecheck` (workspace) | 4/4 tasks successful. |
| `pnpm run build` (workspace) | 2/2 tasks successful (FULL TURBO). |
| `pnpm --filter @rvf/web run test:e2e` | **Not run.** F4.5F preserves visual layout; existing Playwright suites continue to cover the page. E2E coverage of api-mode requires backend + DB + seed and lands when an F4 E2E harness arrives. |

## 13. Known Limitations

1. **Active digital-twin payload still resolves from local mock in api mode.** Clicking an F4 selector entry (HP-001 / LP-001) updates `activeId` but the panels render against `twins[0]` because no local twin id matches the F4 UUID. Visually the selector chip moves but the diagram doesn't change. F4.6 + F4.5G+ will fix this when telemetry-backed twin data is available.
2. **`unitNumber` is ordinal in api mode**, not derived from `code`. HP-001 → 1, LP-001 → 2 by array position. The asset id is available in `code` but the selector label still renders `Multiphase Unit #{unitNumber}` to preserve visual invariance.
3. **No backend or seed coupling in tests.** Mock-mode tests assert no `fetch` call; api-mode tests `vi.mock` the adapter. Real-DB end-to-end coverage waits for the F4 test harness.
4. **`useEffect`-based fetch.** No TanStack Query. A small refactor can move to `useQuery` once a multi-screen migration justifies the dedup / cache surface.
5. **Loading state has no visible spinner.** The page falls back to `twins` while api-mode loads, so the selector renders the local fleet during the load window. A migrating designer can decide to show a spinner explicitly in a future iteration.
6. **API mode errors are not surfaced in the UI.** `useUnitsFleet` exposes `error`; the page does not render an error message. The selector falls back to `twins` and the user sees the local fleet. A future iteration may add an inline error chip near the selector.
7. **Mock UUIDs are F3 strings** (`unit-1`, `unit-2`, `unit-3`); api UUIDs are real `gen_random_uuid()` ids. The two id spaces never overlap — mode toggling shows different ids for "the same" unit.
8. **Tests use the `Probe` + `render` pattern** (same as `useAlarmSummary.test.tsx`). `@testing-library/react`'s `renderHook` is also available; the chosen pattern keeps the suite consistent.
9. **No E2E coverage of api mode yet.** Playwright suites still hit the mock-backed Units page. F4 E2E harness is a separate phase.

## 14. Out of Scope

Repeated explicitly:

- **F4.5G — second screen migration.** Next phase.
- **F4.6 — telemetry persistence / ingestion / live-readings projection / WebSocket fan-out / alarm-event generation.**
- **Migration of any other page** (Operations, Sensors, Alarms, Jobs, Wells, Equipment, Settings, Catalog, Multiwell, Audit, Trends, Reports, Analytics).
- **Digital-twin payload migration.** The 17 panels on `/units` stay on local mock data.
- **Visual redesign.** No CSS / Tailwind / component-shape change.
- **`live_readings_projection` query.** Out of scope; F4.5/4.6 will choose.
- **WebSocket telemetry.** Out of scope.
- **Alarm-event generation.** Out of scope.
- **Authentication.** Out of scope; `CallerContext` is plumbed but inert.
- **Backend / Prisma / migration / seed changes.** None made.

## 15. Acceptance Criteria — Status

| # | Criterion | Status |
|---|---|---|
| 1 | Units screen consumes F4 data-source-aware adapter. | **Met.** `useUnitsFleet` → `adapterListMeasurementUnits` in api mode. |
| 2 | Mock remains default. | **Met.** §8. |
| 3 | API mode is opt-in. | **Met.** `NEXT_PUBLIC_RVF_DATA_SOURCE=api`. |
| 4 | Existing UI layout is preserved. | **Met.** Only `<UnitSelector units={…}>` source changed; render path and styling unchanged. |
| 5 | No backend files modified. | **Met.** §10. |
| 6 | No Prisma / migration / seed files modified. | **Met.** |
| 7 | No Operations screen changes. | **Met.** |
| 8 | No telemetry trends chart wiring. | **Met.** §11. |
| 9 | No live readings implementation. | **Met.** §11. |
| 10 | No WebSocket. | **Met.** |
| 11 | No alarm event generation. | **Met.** |
| 12 | Tests added / updated if repo pattern supports it. | **Met.** 7 new tests in `useUnitsFleet.test.tsx`. |
| 13 | `lint` passes. | **Met.** Frontend + workspace. |
| 14 | `typecheck` passes. | **Met.** Frontend + workspace. |
| 15 | `test` passes. | **Met.** 318/318. |
| 16 | `build` passes. | **Met.** Frontend + workspace. |
| 17 | F4.5F report created. | **Met.** This document. |
| 18 | No commit made. | **Met.** Working-tree only. |

All acceptance criteria are met.

## 16. Next Phase Recommendation

Two parallel streams remain. Both are unblocked by F4.5F.

### Primary recommendation: F4.5G — second screen migration

Suggested target (lowest risk, highest demo value): **Equipment / Catalog (or Settings reference data)** — a read-only page that lists tenants / wells / canonical tags / equipment types. The F4.5B/C adapters already provide everything needed; no telemetry; no digital-twin shape gap. The page is currently a `PlaceholderPage`, so the migration introduces a real consumer of the F4 adapter without conflicting with any existing UI.

Alternative target: **Jobs list** — F4.5D adapter provides everything needed; the F4.3 seed has one reference job + commissioning snapshot; the page can render a small table without telemetry.

**Avoid migrating Operations charts in F4.5G.** Those still wait for F4.6.

Suggested F4.5G deliverables:

1. A new `useEquipmentDirectory()` hook (or `useJobsList()` for the Jobs alternative) following the F4.5F pattern.
2. The target page consumes the hook; renders a small list / cards / table using F4.5C/D view-model helpers (`toMeasurementUnitSummaryViewModel`, `toJobListItemViewModel`, `deriveCommissioningSummary`).
3. Per-screen vitest coverage.
4. F4.5G closeout report.

### Parallel recommendation: F4.6 — telemetry persistence architecture + ADR

F4.6 should still start with documentation, not code:

- `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Architecture.md` — design doc.
- `docs/adr/ADR-008_…` — architectural decision record.

The F4.5F migration does not block F4.6; F4.6 does not block F4.5G. They can run in parallel.

After F4.6 ingestion lands, a follow-up `F4.5*` phase can migrate Operations charts / live readings against the F4.5E telemetry adapter (currently powered by mock synthetic traces).

### Sequencing

| Stream | Phase | Depends on |
|---|---|---|
| UI migration (read-only) | **F4.5G** | F4.5F (this doc) |
| Telemetry persistence | F4.6 architecture + ADR | F4.5F closeout |
| Telemetry persistence | F4.6 implementation | F4.6 ADR sign-off |
| UI migration (charts / live readings) | F4.5* (post-F4.6) | F4.6 implementation |
