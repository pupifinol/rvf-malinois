# RVF Malinois — F4.7.2.1 Operations Chart / Drawer Official-Window Pill Closeout

> Phase: implementation (frontend-only).
> Plan: `docs/architecture/RVF_Malinois_F4_7_2_Operations_Chart_Drawer_Official_Window_Pill_Plan.md` (commit `d797dae`).
> HEAD at authoring time: `d797dae` (Add F4.7.2-0 operations chart drawer official-window pill plan). Master roadmap hygiene refresh follows separately.

## 1. Purpose

F4.7.2.1 connects the existing per-unit Operations `<TrendDrawer>` to the WellTest official measurement windows shipped by F4.7.1 (`409ac1c`). The drawer now derives its `(from, to)` range from the active `WellTest` row when one exists, surfacing four primary pills (`Last Hour` / `Stabilization` / `Official Window` / `Full Test`) and preserving the existing five generic ranges (`15m / 1h / 6h / 24h / 7d`) as a secondary diagnostic row.

Three rules of this phase:

- **Frontend-only.** No backend code, Prisma schema, migration, or `WellTestsModule` change.
- **Incremental.** Existing Operations layout, card structure, and panel composition are byte-equivalent. The two pill rows replace the single row inside the drawer body; nothing else moves.
- **Honest.** Diagnostic windows are never labeled official / certified. The new badge palette (`Diagnostic` / `Stabilization phase` / `Official Window in progress` / `Official Window completed` / `Official Window aborted` / `Full Test` / `No active well test`) names the kind of range at all times.

## 2. Scope Implemented

- **`useActiveWellTest`** — new TanStack Query hook wrapping `adapterGetActiveWellTest` (F4.7.1). Cache key `['f4-active-well-test', unitId]`; 30-second `refetchInterval`; no `isApiSource()` gate (the dual-mode adapter handles both); no UUID-shape gate (mock branch tolerates non-fixture strings honestly by returning `{ active: null }`).
- **`useWellTestWindow` + `deriveWellTestWindow` + `defaultPillForActiveWellTest`** — pure derivation of `(fromMs, toMs)`, disabled state, badge label, `endsAtNow` flag, and aborted flag for each of the four primary pills. Plus a thin React hook that quantizes `Date.now()` to a 15-second bucket so the trend cache key stays stable.
- **Extended `useOperationsTrendSeries`** — additive optional `windowRange?: { fromMs, toMs, pillId }` input. When supplied, takes precedence over the legacy `window: TrendWindow` enum; cache key includes `range:<pillId>` discriminant under the shared `'f4-trends'` prefix (preserves F4.5G.2.1 reconnect invalidation); bucketing policy chosen by `policyForWidth(toMs - fromMs)`.
- **`<TrendDrawer>`** — primary pill row (`trend-drawer-primary`) + secondary diagnostic row (`trend-drawer-range`); window summary line (`trend-drawer-window-summary`); badge (`trend-drawer-badge`); reports footnote (`trend-drawer-reports-note`); disabled-pill tooltips with explicit reasons; selection re-sync triggered only on `(open, canonicalTagName, activeId, activeLifecycle, defaultWindow)` so operator clicks are not silently undone by parent re-renders.
- **Barrel exports** at `apps/web/lib/hooks/index.ts` — exports `useActiveWellTest`, `useWellTestWindow`, `deriveWellTestWindow`, `defaultPillForActiveWellTest`, `policyForWidth`, and the supporting types.
- **Tests** — new `useActiveWellTest.test.tsx` (15 tests), new `useWellTestWindow.test.tsx` (30 tests), extended `useOperationsTrendSeries.test.tsx` (+8 tests), extended `TrendDrawer.test.tsx` (+12 tests for the F4.7.2.1 pill behavior). Existing tests retained byte-equivalent expectations.

## 3. Architecture Decision

- **WellTest owns the official window.** The drawer treats `WellTestRow` as opaque and reads its timestamps; no mutation of the row is performed from the drawer. The trend API (F4.6F.1) remains generic — F4.7.2.1 introduces no new backend endpoint, no new query param, no schema change.
- **Drawer derives `(from, to)` from WellTest; backend reads the same generic trend API.** This is the single seam between the WellTest model and the existing telemetry-trend path. Reports PDF phases (future) will follow the same pattern — they receive the certified window and ask the trend API for it.
- **Last Hour and the generic 15m/1h/6h/24h/7d range are diagnostic only.** The badge palette and the §10 forbidden-labels rule prevent any UI surface from labeling them official. Reviewer rejects any future diff that introduces a "Certify Last Hour" button or otherwise blurs the line.
- **`Default pill` rule.** When an active WellTest exists, the default follows lifecycle: `measuring`/`completed`/`closed` → `Official Window`; `stabilizing` → `Stabilization`; `connected`/`scheduled` → `Last Hour`; `aborted` → `Official Window` if `officialStartedAt` is set, else `Last Hour`. When no active WellTest exists, the drawer falls through to the caller's `defaultWindow` on the diagnostic row — preserving F4.5G.1 back-compat.
- **F2 simulator-history fallback (F4.5G.2.2.2) is preserved** for the `Last Hour` primary pill and for the diagnostic row in mock-mode / unresolved-backend paths. The three official-window pills do **not** activate the simulator fallback — simulator history would lie about what was certified.
- **No fake unit mapping.** `useResolveBackendUnitId` (F4.5G.2.2.1) remains the single resolution boundary. `useActiveWellTest` calls the dual-mode adapter directly with whatever `unitId` the drawer received; the adapter's mock branch returns `{ active: null }` for any non-fixture string.

## 4. Files Changed

### Created

- `apps/web/lib/hooks/useActiveWellTest.ts` — the TanStack Query hook.
- `apps/web/lib/hooks/useActiveWellTest.test.tsx` — 15 tests.
- `apps/web/lib/hooks/useWellTestWindow.ts` — `deriveWellTestWindow` pure function, `defaultPillForActiveWellTest` pure helper, `useWellTestWindow` hook wrapper.
- `apps/web/lib/hooks/useWellTestWindow.test.tsx` — 30 tests.
- `docs/architecture/RVF_Malinois_F4_7_2_1_Operations_Chart_Drawer_Official_Window_Pill_Closeout.md` — this document.

### Modified

- `apps/web/lib/hooks/useOperationsTrendSeries.ts` — additive `windowRange` input + `policyForWidth` exported helper + `TrendWindowRange` type. Legacy `window` enum path preserved.
- `apps/web/lib/hooks/useOperationsTrendSeries.test.tsx` — 4 new tests covering `windowRange` override, width-based policy, cache key shape, legacy fallback unchanged.
- `apps/web/components/operations/TrendDrawer.tsx` — primary + diagnostic pill rows, badge, window summary line, reports footnote, `useActiveWellTest` / `useWellTestWindow` integration. Empty-state copy names the pill kind (`No samples in official measurement window.` / `… in stabilization window.` / `… in full test window.` / `… in last hour.` / `… in window.`) and includes the active source (`Mock fixture` / `Live backend` / `Simulator history exhausted`). Existing fallback / stats / error / loading states retained byte-equivalent.
- `apps/web/components/operations/TrendDrawer.test.tsx` — 12 new tests; existing tests extended with the active-well-test adapter mock defaulting to `{ active: null }` so the back-compat path stays green.
- `apps/web/lib/hooks/index.ts` — new exports.
- `apps/web/lib/api-data/f4/mock-fixtures.ts` — **F4.7.2.1 hotfix.** Aligned the HP-001 `measuring` WellTest fixture timestamps with the static `MOCK_F4_TELEMETRY_TRENDS` range (`2026-05-24T00:00:00Z → 01:00:00Z`) so the Operations drawer's `Stabilization` / `Official Window` / `Full Test` pills intersect the mock trend window. Pre-hotfix timestamps were May 29 and the trend fixture was May 24 — the official-window query returned zero points and the drawer rendered an empty chart against the Oil Rate tile (operator-visible regression reported on http://localhost:3000/operations). Also added synthetic seeds + trend responses for `q_liquid` (Oil Rate) and `t_inlet` (Temperature) so all four tile-canonical tags that exist in `MOCK_F4_CANONICAL_TAGS` (`p_inlet` / `q_gas` / `q_liquid` / `t_inlet`) carry a fixture. `water_cut` and `dp_weir` remain outside the F4.3 / F4.5B canonical-tag dictionary; their tiles continue to surface the honest empty state in mock mode.
- `apps/web/lib/api-data/f4/well-tests.test.ts` — 3 new tests asserting the alignment invariant (officialStartedAt in fixture range, stabilization window in fixture range, connectedAt at-or-before fixture start).
- `apps/web/lib/api-data/f4/telemetry.test.ts` — 2 new tests asserting `q_liquid` and `t_inlet` now return 60 synthetic points under HP-001.

### Unmodified (verified)

- `apps/backend/**` — no change.
- `apps/backend/prisma/**` — no schema or migration change.
- `apps/web/lib/api/f4/**` — no API client / type change.
- `apps/web/lib/api-data/f4/**` — no adapter change.
- `packages/**` — no `packages/types/` change.
- `apps/web/app/(rvf-console)/operations/page.tsx` — byte-equivalent.
- `apps/web/components/operations/OperationsTrendDrawer.tsx` — byte-equivalent (the selection contract on the provider is untouched; new behavior lives inside `<TrendDrawer>`).

## 5. Window / Pill Behavior

### Primary pills

| Pill | Available when | From | To | Badge |
|---|---|---|---|---|
| `last_hour` | Always | `now - 1h` | `now` | `Diagnostic` |
| `stabilization` | `stabilizationStartedAt !== null` | `stabilizationStartedAt` | `stabilizationEndedAt ?? officialStartedAt ?? now` | `Stabilization phase` |
| `official_window` | `officialStartedAt !== null` | `officialStartedAt` | `now` (measuring) / `officialEndedAt` (completed/closed) / `abortedAt ?? officialEndedAt ?? now` (aborted) | `Official Window in progress` / `Official Window completed` / `Official Window aborted` |
| `full_test` | `connectedAt !== null \|\| stabilizationStartedAt !== null` | `connectedAt ?? stabilizationStartedAt ?? officialStartedAt` | `disconnectedAt ?? officialEndedAt ?? now` | `Full Test` |

### Diagnostic ranges

`15m / 1h / 6h / 24h / 7d` — unchanged from F4.5G.1. Rendered as a secondary row labeled `Diagnostic ranges` immediately beneath the primary row. Selecting a diagnostic pill switches the drawer to the legacy `window`-enum trend query path.

### Default pill

- `active === null` → diagnostic, `defaultWindow` (preserves F4.5G.1 / F4.5G.2.2.2 callers).
- `active.lifecycleStatus === 'measuring'` → primary `official_window`.
- `active.lifecycleStatus === 'completed' | 'closed'` → primary `official_window`.
- `active.lifecycleStatus === 'stabilizing'` → primary `stabilization`.
- `active.lifecycleStatus === 'connected' | 'scheduled'` → primary `last_hour`.
- `active.lifecycleStatus === 'aborted'` → primary `official_window` if `officialStartedAt !== null`, else primary `last_hour`.

### Disabled pills

Disabled pills carry an `aria-disabled="true"`, the native `disabled` attribute, a `title` attribute with the human-readable reason, and a muted style class. Reasons:

- `Stabilization has not started.`
- `Official measurement has not started.`
- `Official window missing end timestamp.` (data-invariant violation for `completed`/`closed` rows)
- `Well test has not been connected yet.`
- `No active well test.` (used by the official_window and full_test pill descriptors when the row is null)
- Plus defensive parse-error reasons for malformed timestamps.

## 6. Active WellTest Resolution

- **Hook:** `useActiveWellTest({ unitId, enabled?, refetchIntervalMs? })`.
- **Cache key:** `['f4-active-well-test', unitId ?? '']`. Distinct namespace from `'f4-well-tests'` (list) and `'f4-well-test'` (detail) to avoid future collisions.
- **Refetch:** 30 seconds. Matches F4.5G.2.2.1 latest-values pacing.
- **Enable gate:** `(forceEnabled ?? true) && unitId !== null && unitId !== ''`. No `isApiSource()` gate; no UUID-shape gate. The dual-mode `adapterGetActiveWellTest` handles both branches; the mock branch returns `{ active: null }` for any non-fixture string (no fake mapping table).
- **Mock-mode behavior:** HP-001 (per `MOCK_F4_WELL_TESTS`) returns the measuring Fiscalización fixture; LP-001 returns `{ active: null }`; arbitrary simulator strings like `'EMMAD-02'` return `{ active: null }`.
- **api-mode behavior:** delegates to the backend `GET /api/v1/well-tests/active`; behavior gated on what F4.7.1 ships.
- **No fake mapping anywhere.** `useResolveBackendUnitId` remains the single resolution boundary upstream of the drawer.

## 7. Trend Query Behavior

- **Override input:** `useOperationsTrendSeries({ ..., windowRange: { fromMs, toMs, pillId } })`.
- **Precedence:** `windowRange` wins over the legacy `window` enum when supplied. The legacy path is unchanged when `windowRange` is omitted.
- **Cache key shape:**
  - legacy → `['f4-trends', unitId, tag, 'window:<window>', bucket, aggregate, qualityPolicy, fromEpoch, toEpoch]`.
  - override → `['f4-trends', unitId, tag, 'range:<pillId>', bucket, aggregate, qualityPolicy, fromMs, toMs]`.
- **Shared prefix:** both shapes start with `'f4-trends'` so the F4.5G.2.1 reconnect-invalidation seam (`queryClient.invalidateQueries({ queryKey: ['f4-trends'] })`) continues to drop both.
- **Bucketing policy by width:** `policyForWidth(widthMs)` selects raw (`≤ 1h`), `1m` (`1h–6h`), `5m` (`6h–24h`), or `15m` (`> 24h`). All bucketing decisions are client-side; backend trend API is unchanged.
- **Fallback policy:** `Last Hour` (primary or diagnostic) and the five generic diagnostic ranges can activate the F4.5G.2.2.2 simulator-history fallback when `(result.source === 'mock' || !hasBackendMatch)`. The three official-window pills (`stabilization`, `official_window`, `full_test`) intentionally do **not** activate the fallback — simulator history would lie about what was certified.
- **Simulator-buffer caveat** retained: when the simulator buffer is shorter than the selected window, the existing `Simulator buffer shorter than selected range` chip surfaces honestly.

## 8. UI / UX Behavior

- **Two pill rows** inside the drawer body, immediately above the latest-value row:
  - **Primary** — `Last Hour · Stabilization · Official Window · Full Test`. Disabled pills surface tooltips with the disabled-reason text.
  - **Secondary diagnostic** — `15m · 1h · 6h · 24h · 7d` with a small `Diagnostic ranges` header.
- **Window summary line** beneath the pill rows: `Stabilization: 08:05 → 09:05` / `Official Window: 09:05 → now` / `1h: 14:00 → now`. The right side renders the literal string `now` whenever the window's right edge is the wall clock (via the new `endsAtNow` flag on `DerivedWellTestWindow`).
- **Badge** in the drawer header alongside the source chip — names the kind of range: `Diagnostic` / `Stabilization phase` / `Official Window in progress` / `Official Window completed` / `Official Window aborted` / `Full Test` / `No active well test`.
- **Reports footnote** rendered only when an active WellTest exists: `Official reports use the official measurement window only.`
- **No backend label drift.** Source chip retains the F4.5G.1 / F4.5G.2.2.2 palette: `Live backend` / `Mock fixture` / `Simulator history`.
- **Layout preserved.** Header, latest value, freshness label, stats strip, empty / loading / error states all retained byte-equivalent.

### No active WellTest

When `useActiveWellTest.active === null` (genuinely no test, LP-001 empty fixture, unresolved unit, mock mode without fixture coverage):

- Default selection is `{ kind: 'diagnostic', window: defaultWindow }`.
- The four primary pills are visible. `Last Hour` is enabled; the other three are disabled with their respective reasons.
- Badge reads `Diagnostic`.
- Reports footnote is not rendered.
- F2 simulator-history fallback continues to apply for the diagnostic row.

## 9. Tests / Validation

### Tests added

| File | Count | Coverage |
|---|---|---|
| `useActiveWellTest.test.tsx` | 15 | disabled paths, mock-mode HP-001 / LP-001 / unknown string, api-mode adapter forwarding, error surface, `lastDataAt`, cache key shape |
| `useWellTestWindow.test.tsx` | 30 | `last_hour` always enabled; stabilization fallback chain; official_window per lifecycle; aborted clamps; full_test fallback chain; invariant-violation defense; `defaultPillForActiveWellTest` rules |
| `useOperationsTrendSeries.test.tsx` (extension) | +8 | `policyForWidth` thresholds; `windowRange` adapter forwarding; bucketed selection by width; cache key shape; legacy fallback unchanged |
| `TrendDrawer.test.tsx` (extension) | +12 | both pill rows render; default pill per lifecycle; disabled pill states + tooltips; click forwards official / stabilization range to trend adapter; diagnostic-row click preserves legacy path; window summary renders |

### Validation pipeline

| Command | Result |
|---|---|
| `pnpm --filter @rvf/web run lint` | ✅ clean, `--max-warnings 0` |
| `pnpm --filter @rvf/web run typecheck` | ✅ clean |
| `pnpm --filter @rvf/web run test` | ✅ **578/578** (F4.7.1 baseline was 512; +66 new across this phase: +61 in the initial pill implementation + 5 in the mock-data alignment hotfix) |
| `pnpm --filter @rvf/web run build` | ✅ Next.js build green; `/operations` route prerendered at 12.6 kB |

Backend was not touched in this phase — no backend tests run. The F4.7.1 backend baseline of **309/309** is preserved by construction.

## 10. Known Limitations / Deferred Work

- **No `Current Test` compact panel.** A small read-only panel pinned near the per-unit cards summarizing the active WellTest (`testType`, `lifecycleStatus`, planned duration, elapsed) is a natural follow-up (candidate F4.7.3). Out of scope here.
- **No Reports PDF generation.** Both Fiscalización and Optimización report types remain mock-only at `apps/web/components/reports/data/reports.mock.ts`. The certified PDFs cannot ship until a future backend `reports/` module consumes the same `(officialStartedAt, officialEndedAt)` window the `Official Window` pill now surfaces.
- **No WellTest lifecycle-transition UI.** Engineer-driven `connect` / `start-stabilization` / `start-official` / `end-official` / `abort` / `close` buttons remain a separate phase. The drawer reads from WellTest; it does not write to it.
- **No `<LiveActiveAlarmsPanel>` migration.** Still deferred behind F4.7. The panel continues to evaluate alarms in the browser against the F2 simulator path; F4.5G.4 picks it up once the official-window UI vocabulary is in use (i.e., now).
- **No alarm chart annotations.** Candidate F4.5G.3. The `Official Window` pill now provides the scope that annotations can be filtered against.
- **No chart realtime tail.** Candidate F4.5G.2.3. The `useOperationsTrendSeries` 60-second `refetchInterval` in the drawer remains the resync path; F4.5G.2.1 reconnect invalidation continues to work via the shared `'f4-trends'` prefix.
- **No automatic valve / lifecycle detection.** All WellTest timestamps remain engineer-driven (per F4.7-0 lock).
- **Mock-mode behavior locked to fixtures.** The HP-001 measuring fixture is synthetic; in mock mode, the drawer indefinitely shows `Official Window in progress` because no time passes in the fixture. The `Mock fixture` source chip names this honestly.
- **Mock-mode date drift.** The mock WellTest fixture timestamps (May 24, 2026) are pinned to the static `MOCK_F4_TELEMETRY_TRENDS` range for determinism. The operator's wall clock during a demo will sit later than the fixture range; the `Last Hour` pill therefore has no fixture coverage and falls through to the F4.5G.2.2.2 simulator-history fallback (correct — `Last Hour` is diagnostic only). The three official pills always render data because they query inside the fixed fixture window. If a future demo needs "near-real-time" WellTest fixtures, the trend fixture range would need to follow `MOCK_TIMESTAMP` similarly; a candidate sub-task can either bump `MOCK_TIMESTAMP` to a moving wall-clock or introduce a synthesized-on-demand mock trend path. Out of scope here.
- **Mock fixture coverage gap on Water Cut and Differential P.** Their canonical tags (`water_cut`, `dp_weir`) are not in `MOCK_F4_CANONICAL_TAGS`; the F4.7.2.1 mock fixture covers only the four tile tags present in the dictionary (`p_inlet` / `q_gas` / `q_liquid` / `t_inlet`). Water Cut and Differential P. continue to surface the honest empty state in mock mode, which is correct.

## 11. Acceptance Criteria

Mapping F4.7.2-0 §16 to the implementation:

1. **`useActiveWellTest` hook exists at `apps/web/lib/hooks/useActiveWellTest.ts`** with cache key `['f4-active-well-test', unitId ?? '']` and 30-second `refetchInterval`. ✅
2. **`useWellTestWindow` derivation utility exists** at `apps/web/lib/hooks/useWellTestWindow.ts` implementing §7. ✅
3. **`<TrendDrawer>` renders the four official pills** as the primary pill row with disabled-state + tooltips per §7. ✅
4. **Five generic ranges remain accessible** as a secondary diagnostic-row beneath the primary row. ✅ (option B from plan §5)
5. **Default pill follows §8.** ✅
6. **Window derivation strictly follows §7.** `official_window` uses `(officialStartedAt, officialEndedAt | now)` per lifecycle; never silently substitutes a generic range. ✅
7. **`useOperationsTrendSeries` accepts explicit `windowRange`**, takes precedence over `window`, applies width-based bucketing. ✅
8. **Source-chip / badge / freshness-label honesty rules per §11** hold; forbidden labels are forbidden. ✅
9. **No file under `apps/backend/`, `apps/backend/prisma/`, `packages/types/` is modified.** ✅ (verified via `git status`)
10. **No fake mapping from simulator catalog strings to backend UUIDs.** ✅ (`useResolveBackendUnitId` remains the single resolution boundary upstream; `useActiveWellTest` passes the string through honestly)
11. **Mock-mode behavior against `MOCK_F4_WELL_TESTS` matches §6.** ✅ (asserted by tests in `useActiveWellTest.test.tsx` and by HP-001 / LP-001 / non-fixture-string coverage)
12. **`apps/web/app/(rvf-console)/operations/page.tsx` is byte-equivalent.** ✅ (verified via `git status`)
13. **Test coverage per §14 — backend stays at 309/309; web grows by ~26–34 tests with all green.** ✅ (web 512 → 573, +61; backend untouched)
14. **`pnpm --filter @rvf/web run lint` / `typecheck` / `test` / `build` all green.** ✅
15. **Closeout report exists at `docs/architecture/RVF_Malinois_F4_7_2_1_Operations_Chart_Drawer_Official_Window_Pill_Closeout.md`.** ✅ (this document)

## 12. Recommended Next Step

Two valid next-step choices, both unblocked by this phase:

- **Recommended: Master roadmap hygiene refresh after F4.7.2.1.** Mark F4.7.2.1 closed in §3 / §5 / §7 / §10 of `docs/architecture/RVF_Malinois_Master_Roadmap.md`, anchor at this commit, and promote the next phase. Same small-scope hygiene pattern as the previous F4.7-0 / F4.7.1 / F4.7.2-0 refreshes.
- **Then either F4.7.3 — Operations Current Test Compact Panel** (small, reads `useActiveWellTest`, surfaces test summary near the cards), **or Reports PDF generation — Fiscalización certification** (first Reports backend phase, certifies against the `(officialStartedAt, officialEndedAt)` window the drawer now anchors). F4.7.3 is the lighter follow-up; Reports is the higher-leverage one because it operationalizes the official window for the customer. Plan-first sub-phase before either implementation per DX-3.

Other unblocked candidates: **F4.5G.4** (LiveActiveAlarmsPanel cutover — now consumable because the official-window vocabulary exists), **F4.5G.3** (alarm chart annotations scoped to the official window), and **F4.7.4** (WellTest lifecycle UI controls — write-side, separate phase because it introduces transition POSTs from Operations).

---

*F4.7.2.1 closeout, authored at HEAD `d797dae` (Add F4.7.2-0 operations chart drawer official-window pill plan). Web tests 512 → 578 (+66; includes the mock-data alignment hotfix), backend untouched at 309/309. Lint / typecheck / build green for `@rvf/web`. No backend, Prisma, or `packages/types/` change.*
