# RVF Malinois — F4.5E Telemetry Trends API Wiring Report

> Phase **F4.5E — Telemetry Trends API Wiring**.
> Fifth (and final) F4.5 adapter sub-phase. Closes the F4.5 foundation arc:
> every F4.4 read endpoint now has a parallel `apps/web/lib/api-data/f4/`
> adapter ready for screen-by-screen migration.
>
> References:
> - F4.5A foundation: `docs/architecture/RVF_Malinois_F4_5A_Frontend_API_Client_Foundation_Report.md` (commit `20d45ec`)
> - F4.5B tenants/wells/tags: `docs/architecture/RVF_Malinois_F4_5B_Tenants_Wells_Tags_API_Wiring_Report.md` (commit `4b824d7`)
> - F4.5C equipment/units: `docs/architecture/RVF_Malinois_F4_5C_Equipment_Units_API_Wiring_Report.md` (commit `f7ecf6c`)
> - F4.5D jobs: `docs/architecture/RVF_Malinois_F4_5D_Jobs_API_Wiring_Report.md` (commit `9d24831`)
> - F4.4F telemetry backend: `docs/architecture/RVF_Malinois_F4_4F_Telemetry_API_Reactivation_Report.md` (commit `5e92a13`)
> - F4.3 seed: `docs/architecture/RVF_Malinois_F4_3_Seed_Reference_Data_Report.md` (commit `91e17aa`)

## 1. Summary

F4.5E extends the data-source-aware adapter pattern to the final F4 read endpoint:

- **Telemetry trends** (`GET /api/v1/telemetry/trends`) — `adapterGetTelemetryTrends(params)`, with full filter passthrough (`unitId`, `from`, `to`, XOR `canonicalTagId / canonicalTagName`, optional `jobId / quality / source / limit`).

Plus three new view-model helpers tuned to chart consumers:

- `toNumericTelemetryPoint(point)` — converts the single Prisma `Decimal` string `value` to a JS `number`; returns `value: null` for unparseable input (so chart code can gap-skip null points instead of crashing on NaN).
- `toNumericTelemetrySeries(response)` — shape-preserving map over the response; surfaces `validCount` so consumers detect "every point was NaN".
- `isTelemetryTrendEmpty(response)` — the explicit check for the F4.2-baseline empty-points case (and over-filtered queries).

The mock branch ships **two deterministic 60-point synthetic traces** anchored on HP-001 (`p_inlet` in psi, smooth sinusoidal pattern around 3 800 psi; `q_gas` in MMSCFD, around 3.0). Values are derived from a closed-form expression (no `Math.random`, no `Date.now`); identical inputs → identical outputs → reproducible tests and reproducible Storybook snapshots. The F4.3 seed leaves `telemetry_readings` empty; F4.5E's mock fixtures fill the screen-readiness gap without depending on F4.6.

Validation behavior mirrors the F4.4F backend's Zod refines: supplying both `canonicalTagId` and `canonicalTagName` raises `RvfApiError(400, 'mock:/telemetry/trends', …)`, as does supplying neither, as does `from >= to`. Unknown tags / unfixtured (unitId, tag) pairs surface as the empty-envelope shape (`points: []`) so a chart consumer always sees a predictable structure.

All quality gates pass: backend + workspace `lint` / `typecheck` / `build` (no backend file touched); frontend `pnpm test` is **311/311 across 33 files** (288 from F4.5D + 23 new in `telemetry.test.ts`). No commit was made.

**F4.5 adapter foundation is complete.** Every F4.4 read endpoint (tenants / wells / tags / equipment / jobs / telemetry) has a parallel adapter under `apps/web/lib/api-data/f4/`. Screen-by-screen migration can begin.

## 2. Files Changed

| Path | Change |
|---|---|
| `apps/web/lib/api-data/f4/mock-fixtures.ts` | **Extended.** F4.5E section adds: synthetic-series builder (`buildSyntheticPoints` + closed-form `syntheticValue`), two preloaded traces (`HP_001_P_INLET_TREND`, `HP_001_Q_GAS_TREND`), `MOCK_F4_TELEMETRY_TRENDS` lookup map keyed `"${unitId}::${canonicalTagName}"`, and `MOCK_F4_TRENDS_RANGE` metadata (from / to / pointCount / intervalMs). Helper `mockTrendsKey` exported for tests. F4.5B/C/D sections untouched. |
| `apps/web/lib/api-data/f4/telemetry.ts` | **New.** Single adapter function + three view-model helpers + their exported types. Mock branch enforces XOR + `from < to` and applies range / quality / source / limit filters; unknown tags surface as empty envelopes. |
| `apps/web/lib/api-data/f4/index.ts` | **Extended.** Re-exports the adapter, three helpers, two type aliases (`NumericTelemetryPoint`, `NumericTelemetrySeries`), and the synthetic-range metadata `MOCK_F4_TRENDS_RANGE`. F4.5A/B/C/D exports preserved. |
| `apps/web/lib/api-data/f4/telemetry.test.ts` | **New.** 23 mocked-`fetch` vitest tests covering mock-mode determinism + 5 filter axes (range / quality / source / limit / canonicalTagId-vs-name), validation parity with backend (XOR / both / neither / `from >= to`), api-mode URL composition, and full numeric-helper coverage. |
| `docs/architecture/RVF_Malinois_F4_5E_Telemetry_Trends_API_Wiring_Report.md` | **New.** This document. |

No file under `apps/backend/`, `apps/backend/prisma/`, `packages/`, `docker-compose.yml`, root config, or any existing `apps/web/` screen / component / hook / route handler / test was modified. The pre-F4.5E state of every prior F4.5 adapter file (`tenants.ts` / `wells.ts` / `tags.ts` / `equipment.ts` / `jobs.ts` and their tests) is byte-for-byte preserved.

## 3. Telemetry Trends Adapter Design

The single adapter function follows the F4.5C / F4.5D structural decisions exactly:

1. **Single delegation point.** `isApiSource()` → backend wrapper or mock fixture path.
2. **Mock branch never calls `fetch`** (test-guarded by `vi.stubGlobal('fetch', vi.fn(() => { throw … }))`).
3. **Uniform error type.** Both branches surface validation / not-found errors as `RvfApiError`.
4. **No silent api → mock fallback** on backend failure.

F4.5E-new structural decisions:

5. **XOR + range validation runs in mock mode too.** The F4.4F backend uses Zod refines to reject ambiguous and invalid inputs; the mock branch reproduces the same predicates so a consumer hitting the validation path sees the same `RvfApiError(400, …)` shape across both modes.
6. **Empty-envelope shape for unknown / unfixtured tags.** When a screen requests a tag that has no synthetic trace (or doesn't exist in the dictionary), mock mode returns `{ unitId, canonicalTag, range, points: [] }` rather than 404. This avoids forcing chart code to branch on tag identity — the empty path is the F4.2-baseline path that F4.6 will eventually populate, and consumers benefit from a single empty-state code path.
7. **Decimal-string `value` preserved.** The mock fixture writes `string` `value`s (matching `Prisma.Decimal.toJSON`), and the adapter never converts them. The conversion lives in the view-model helpers so future chart code calls `toNumericTelemetrySeries(response)` once and gets numbers.

## 4. Data-Source Switch Behavior

Unchanged from F4.5A/B/C/D. The new adapter honors `NEXT_PUBLIC_RVF_DATA_SOURCE`:

| Value | `adapterGetTelemetryTrends` routes through |
|---|---|
| (unset) | mock branch (`MOCK_F4_TELEMETRY_TRENDS` lookup; XOR + range validation runs locally) |
| `mock` | mock branch (same) |
| `api` | `getTelemetryTrends(params)` from `@/lib/api/f4` |
| (other) | safely falls back to mock — `resolveDataSource` never throws |

Tests verify:

- Mock mode never calls `fetch` (guard fixture).
- API mode composes the expected URL with every supported filter:
  ```
  GET <BASE>/telemetry/trends?
    unitId=<uuid>&from=2026-05-24T00%3A00%3A00.000Z&to=...&
    canonicalTagName=p_inlet&jobId=<uuid>&quality=good&source=mock&limit=100
  ```
- API mode propagates backend `RvfApiError` (the empty-points F4.2-baseline case AND any 4xx) without fallback.

## 5. Synthetic Mock Trend Design

### 5.1 Why synthetic

The F4.3 seed deliberately does NOT populate `telemetry_readings` (per F4.3 closeout §6). F4.4F therefore returns `points: []` on the F4.2 baseline. Two options for F4.5E's mock fixture:

- (a) Return `points: []` too — strict-mirror of seed.
- (b) Synthesise a small deterministic trace per (unitId, tag) — unblocks screen / chart readiness.

F4.5E chose **(b)**. The synthetic traces let migrating screens exercise chart code paths (axis scaling, gap rendering, hover, ISA-101-style coloring) before F4.6 lands. Strict-mirror behavior is still available: query an unfixtured (unitId, tag) pair and the mock returns `points: []`.

### 5.2 Determinism

The value generator is closed-form:

```ts
syntheticValue(seed, i) = seed.center + seed.amplitude * (0.6 * sin(i/7 * π) + 0.4 * cos(i/17 * π))
```

Two co-prime periods (`7` and `17`) produce a "lively" but pattern-free curve. No `Math.random`, no `Date.now`. Same `(seed, i)` → same Decimal string. Tests assert `r1.points === r2.points` across repeat calls.

### 5.3 Two preloaded traces

| Lookup key | Tag | Unit | Center | Amplitude | Precision | Points |
|---|---|---|---|---|---|---|
| `${HP-001}::p_inlet` | `p_inlet` | `psi` | 3 800 | 80 | 1 | 60 |
| `${HP-001}::q_gas` | `q_gas` | `MMSCFD` | 3.0 | 0.25 | 3 | 60 |

Both traces span 60 minutes starting at `2026-05-24T00:00:00.000Z` with one point per minute. The pressure trace stays comfortably below the F4.5C HP-001 warning threshold (4 500 psi); the gas-flow trace stays below its warning threshold (4.5 MMSCFD). A future migration that wants alarm-crossing visuals can add a third trace with a deliberate spike — the builder helper accepts any `(center, amplitude)` configuration.

### 5.4 Surface for tests / Storybook

```ts
// Fixture lookup keyed on `${unitId}::${canonicalTagName}`.
MOCK_F4_TELEMETRY_TRENDS;

// Range metadata for callers that need a sensible default `from / to`.
MOCK_F4_TRENDS_RANGE; // { from, to, pointCount: 60, intervalMs: 60_000 }
```

Both are exported from `@/lib/api-data/f4`.

## 6. API Mode Wiring

API mode delegates to `getTelemetryTrends(params, options)` from `@/lib/api/f4`. The F4.5A fetch wrapper handles:

- Query-string composition for every supported filter (`unitId`, `from`, `to`, `canonicalTagId | canonicalTagName`, `jobId`, `quality`, `source`, `limit`).
- ISO timestamp encoding (colons become `%3A`).
- `AbortSignal` forwarding.
- 4xx / 5xx → `RvfApiError(status, url, body)`.

Backend Zod validation (XOR refine + `from < to` refine + UUID format + enum bounds) runs server-side; api-mode rejections surface to the caller as `RvfApiError(400, …)` exactly as mock-mode rejections do, so consumer error-handling code is uniform across modes.

## 7. Decimal-String-to-Numeric Helpers

### 7.1 `toNumericTelemetryPoint(point)`

```ts
interface NumericTelemetryPoint {
  timestamp: string;
  value: number | null;      // null on NaN / Infinity / unparseable input
  engineeringUnit: string;
  quality: TelemetryQuality;
  source: TelemetrySource;
}
```

Decision: **`null` for invalid numeric input** rather than throwing. Rationale: chart code typically renders gaps over null points (Recharts / Visx / etc. handle this natively); throwing on the first NaN would break the entire chart for a single malformed point. The `Number.isFinite(parsed)` check rejects `NaN`, `+Infinity`, `-Infinity` uniformly.

### 7.2 `toNumericTelemetrySeries(response)`

```ts
interface NumericTelemetrySeries {
  unitId: string;
  canonicalTag: CanonicalTagSummary;
  range: { from: string; to: string };
  points: NumericTelemetryPoint[];
  validCount: number;       // points whose value parsed cleanly
}
```

Shape-preserving map. The added `validCount` lets consumers detect the "every point was NaN" pathology without iterating the array. For the F4.5E synthetic HP-001 / p_inlet trace, `validCount === 60`; tests assert this.

### 7.3 `isTelemetryTrendEmpty(response)`

`response.points.length === 0`. One-liner, but exported as a named helper so screens read `if (isTelemetryTrendEmpty(response)) renderEmptyState()` instead of `if (response.points.length === 0) …`. Reduces the surface a migrating screen has to learn.

### 7.4 What's NOT in scope

- **Chart aggregation / downsampling.** A 60-point one-minute trace is fine; a 5 000-point hour trace is too. Downsampling belongs to either the screen layer or a future F4.5F / F4.6 helper, not F4.5E.
- **Quality-grouped slices** (`splitByQuality(points)`). The F4 schema has only three quality values (`good / uncertain / bad`); F4.5E's synthetic trace is all-`good`. F4.5F or a screen-specific helper can add this once a real chart consumer materializes.
- **Min / max / avg computation.** Trivial to add at call site; F4.5E declines to introduce a helper for it (premature shaping).

## 8. Query / Filter Behavior

| Query parameter | Mock behavior | API behavior |
|---|---|---|
| `unitId` (required, UUID) | The lookup key includes `unitId`; an unfixtured unit returns the empty envelope. | Backend `Prisma.where.unitId = params.unitId`. |
| `from`, `to` (required, Date or ISO string) | Half-open range `[from, to)` filter on `Date.parse(point.timestamp)` (matches the F4.4F backend's `timestamp: { gte: from, lt: to }`). | Same. |
| `canonicalTagId` XOR `canonicalTagName` | Resolves via the F4.5B canonical-tag dictionary. Unknown id / name → empty envelope. | Backend resolver `RvfApiError(404, …)` (delegated; api mode surfaces the backend's response). |
| `jobId` (optional, UUID) | Currently no-op in mock (synthetic traces are not job-bound). The filter is accepted and silently produces `points: []` if no point matches — same shape as the api-mode response when no rows exist. | Backend `where.jobId` filter. |
| `quality` (optional, enum) | Strict equality on `point.quality`. The synthetic traces are all `good`; tests verify that `quality: 'bad'` returns 0 points. | Backend filter. |
| `source` (optional, enum) | Strict equality on `point.source`. Synthetic traces are all `mock`; `source: 'mqtt'` returns 0 points. | Backend filter. |
| `limit` (optional, int) | `points.slice(0, limit)`. Mock does NOT enforce the backend's max-5000 ceiling; the wrapper / backend Zod schema does. | Backend `take: params.limit` (validated server-side). |

Validation errors (mock mode):

| Condition | Result |
|---|---|
| Both `canonicalTagId` and `canonicalTagName` | `RvfApiError(400, 'mock:/telemetry/trends', null, 'exactly one of …')` |
| Neither `canonicalTagId` nor `canonicalTagName` | same as above |
| `from >= to` | `RvfApiError(400, 'mock:/telemetry/trends', null, '\`from\` must be strictly less than \`to\`')` |

## 9. Confirmation: Mock Remains Default

Verified five ways (same posture as F4.5B/C/D):

1. `NEXT_PUBLIC_RVF_DATA_SOURCE` defaults to `mock` (F4.5A; telemetry adapter tests' default-source cases all pass).
2. No screen / hook / route handler / component touched.
3. Mock fixtures use placeholder UUIDs (`00000000-…`).
4. Existing test suite is unaffected. Pre-F4.5E: 288 tests across 32 files. Post-F4.5E: 311 tests across 33 files. The delta is exactly the 23 new tests in `telemetry.test.ts`.
5. Bundle output unchanged for the existing routes.

## 10. Confirmation: No Backend / Prisma / Migration / Seed Changes

`git status` shows only frontend + docs changes:

```
modified:   apps/web/lib/api-data/f4/index.ts
modified:   apps/web/lib/api-data/f4/mock-fixtures.ts
?? apps/web/lib/api-data/f4/telemetry.test.ts
?? apps/web/lib/api-data/f4/telemetry.ts
?? docs/architecture/RVF_Malinois_F4_5E_Telemetry_Trends_API_Wiring_Report.md
```

No file under `apps/backend/`, `apps/backend/prisma/`, `apps/backend/prisma/migrations/`, `apps/backend/prisma/seed.f4.ts`, `packages/*`, `docker-compose.yml`, `turbo.json`, root `package.json`, `.github/`, or any existing `apps/web/` screen / component / hook / route handler / test was modified.

## 11. Confirmation: No Screen / UI Files Changed

No file under `apps/web/app/`, `apps/web/components/`, `apps/web/types/`, `apps/web/public/`, or any existing `apps/web/lib/{alarms,hooks,jobs,quality,realtime,store,telemetry,theme,catalog,api,api-data}/` (other than `apps/web/lib/api-data/f4/`) was modified. The F2A `lib/telemetry/` namespace (simulator + adapter factory + WebSocket adapter scaffolding) is untouched.

## 12. Commands Run and Results

| Command | Result |
|---|---|
| `pnpm --filter @rvf/web run lint` | clean (fixed one `@typescript-eslint/no-unused-vars` warning during authoring: `MOCK_F4_TRENDS_RANGE` was imported but only re-exported via `export … from './mock-fixtures'`; removed the duplicate import). |
| `pnpm --filter @rvf/web run typecheck` | clean. |
| `pnpm --filter @rvf/web run test` | **311/311 across 33 files** (288 pre-existing + 23 new in `telemetry.test.ts`). |
| `pnpm --filter @rvf/web run build` | clean (`next build`); existing route bundle sizes unchanged. |
| `pnpm run lint` (workspace) | 4/4 tasks successful. |
| `pnpm run typecheck` (workspace) | 4/4 tasks successful. |
| `pnpm run build` (workspace) | 2/2 tasks successful (FULL TURBO). |
| `pnpm --filter @rvf/web run test:e2e` | **Not run.** No UI change; F4.5E introduces no rendered behavior. |

## 13. Known Limitations

1. **No screen consumes the new telemetry adapter yet.** Foundation-shaped. Screen / chart wiring is a future per-screen migration.
2. **`jobId` filter is a no-op in mock mode.** Synthetic traces are not job-bound. The filter is accepted and silently produces `points: []` when no point matches — same shape as the api-mode response on an empty-result query. A future fixture extension can attach `jobId` to specific traces if a migrating screen needs job-filtered visuals.
3. **The mock does not enforce the backend's max-5000 `limit` ceiling.** The F4.5A `getTelemetryTrends` wrapper and the F4.4F backend Zod schema validate it server-side; mock mode only respects the user-supplied `limit` (or no limit) and returns at most 60 points anyway.
4. **Decimal-string values come from a fixed-precision `Number.toFixed(n)` call.** Real backend values may carry more precision when calibration changes propagate. Consumers using `toNumericTelemetryPoint(point).value` get a `number` either way.
5. **Synthetic traces stay within the F4.5C alarm thresholds.** No alarm-crossing visual is built in. A future migration that wants threshold-crossing visuals adds a third trace with a deliberate spike or a `source: 'mock'` `'uncertain'`/`'bad'` segment.
6. **Two preloaded traces only.** HP-001 / `p_inlet` and HP-001 / `q_gas`. Other (unitId, tag) combinations resolve to the empty envelope. Adding a new trace is a 4-line config entry (seed + lookup key).
7. **`toNumericTelemetryPoint` returns `null` on NaN.** Charting libraries that don't gap-skip null must do their own filtering.
8. **No real-DB e2e.** Same posture as F4.5A/B/C/D.

## 14. Out of Scope

Repeated explicitly so the reader cannot infer F4.5E quietly shipped any of these:

- **Visual chart components.** Zero chart UI added.
- **Operations / Units / Sensors / Alarms screen wiring.**
- **Expanded chart view / modal / drawer.**
- **Live readings projection (`live_readings_projection` view).** F4.5 / F4.6 will decide.
- **WebSocket frontend telemetry.** `lib/realtime/` untouched.
- **Telemetry ingestion.** `POST /telemetry`, MQTT / OPC-UA / Modbus clients, edge-gateway integration — all F4.6.
- **Alarm-event generation.**
- **Reports module.**
- **Authentication.**
- **Backend / Prisma / migration / seed changes.** None made.
- **F2A telemetry simulator retirement.** `lib/telemetry/` continues to drive Operations / Sensors / Alarms through the F2D adapter factory.

## 15. Acceptance Criteria — Status

| # | Criterion | Status |
|---|---|---|
| 1 | Telemetry trends can be read through a data-source-aware frontend adapter. | **Met.** `adapterGetTelemetryTrends`. |
| 2 | Mock remains default. | **Met.** §9. |
| 3 | API mode uses `apps/web/lib/api/f4` `getTelemetryTrends` wrapper. | **Met.** §6. |
| 4 | Mock mode returns deterministic synthetic F4-shaped trend data. | **Met.** §5. |
| 5 | Mock mode does not call fetch. | **Met.** Test-guarded by throwing-fetch stub. |
| 6 | Decimal string conversion helper exists. | **Met.** `toNumericTelemetryPoint` / `toNumericTelemetrySeries`. |
| 7 | Existing mock UI behavior remains intact. | **Met.** Zero screen / hook / component touched. |
| 8 | No backend files modified. | **Met.** §10. |
| 9 | No Prisma / migration / seed files modified. | **Met.** |
| 10 | No screen rewrite. | **Met.** |
| 11 | No visual chart component added. | **Met.** |
| 12 | No Operations / Units UI wiring. | **Met.** |
| 13 | No live readings. | **Met.** |
| 14 | No telemetry ingestion. | **Met.** |
| 15 | Tests added for telemetry trends adapter and conversion helpers. | **Met.** 23 new tests in `telemetry.test.ts`. |
| 16 | `lint` passes. | **Met.** Frontend + workspace. |
| 17 | `typecheck` passes. | **Met.** Frontend + workspace. |
| 18 | `test` passes. | **Met.** 311/311. |
| 19 | `build` passes. | **Met.** Frontend + workspace. |
| 20 | F4.5E report created. | **Met.** This document. |
| 21 | No commit made. | **Met.** All changes are working-tree only. |

All acceptance criteria are met.

## 16. Next Phase Recommendation

**F4.5 foundation is complete.** Every F4.4 read endpoint has a parallel adapter:

| F4 domain | Adapter | Helpers | Sub-phase |
|---|---|---|---|
| Tenants | `adapterListTenants` / `adapterGetTenant` | — | F4.4A / F4.5B |
| Wells | `adapterListWells` / `adapterGetWell` | — | F4.4B / F4.5B |
| Canonical tags | `adapterListCanonicalTags` / `adapterGetCanonicalTag` | — | F4.4C / F4.5B |
| Equipment | `adapterList/Get{EquipmentType,MeasurementUnit}` | `derive{Sensors,Alarms}Count`, `derive{Pressure,Flow,Gas}Unit`, `toMeasurementUnitSummaryViewModel` | F4.4D / F4.5C |
| Jobs | `adapterListJobs` / `adapterGetJob` | `deriveJobRuntime`, `deriveCommissioningSummary`, `toJobListItemViewModel` | F4.4E / F4.5D |
| Telemetry trends | `adapterGetTelemetryTrends` | `toNumericTelemetryPoint`, `toNumericTelemetrySeries`, `isTelemetryTrendEmpty` | F4.4F / F4.5E |

Two parallel streams unblocked now:

**Recommended next phase: F4.5 Closeout Report** — a documentation-only deliverable that consolidates F4.5A → F4.5E into a single record (same format as the F4.4 closeout). It would:

- List every adapter + helper exported from `@/lib/api-data/f4`.
- Document the standard adapter pattern (`isApiSource()` delegation, `RvfApiError(404, 'mock:/…', null, …)` parity, mock fixtures keyed by id / by name / by composite key, view-model helpers as opt-in).
- Inventory the F3 vs F4 shape gaps that future screen migrations will encounter (the `MeasurementUnit` rename, slug-vs-UUID identifiers, Decimal-as-string serialization, JSONB columns as `unknown`).
- Recommend the migration order for screen-by-screen cut-over (e.g. settings panels first, then operational dashboards, then chart screens).

**After F4.5 closeout, two streams in parallel:**

1. **Screen-by-screen UI migration** — starting with the smallest non-telemetry consumer. Each migration:
   - Replaces a hook / page's data source with the corresponding `@/lib/api-data/f4` adapter.
   - Adapts the rendered shape with one of the F4.5C/D/E view-model helpers (or a one-off `f4ToF3<Entity>` mapper at the screen boundary).
   - Adds per-screen vitest coverage with mocked adapter responses.
   - Lands as `F4.5F` / `F4.5G` / … one report per screen.

2. **F4.6 architecture + ADR** — telemetry persistence design (ingestion adapter architecture, dedup strategy, live-readings projection mechanism, WebSocket fan-out, alarm-event evaluation policy). Should land an architecture doc + ADR before any implementation. The F4.5E telemetry adapter is forward-compatible: F4.6 only needs to populate `telemetry_readings` for the api branch's `points: []` envelope to start carrying real data.
