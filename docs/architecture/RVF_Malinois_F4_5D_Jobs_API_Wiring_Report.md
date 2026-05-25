# RVF Malinois — F4.5D Jobs API Wiring Report

> Phase **F4.5D — Jobs API Wiring**.
> Fourth F4.5 sub-phase. Extends the F4.5C adapter pattern to the F4.4E
> jobs surface (`Job` + `CommissioningSnapshot`) and adds three
> jobs-specific view-model helpers. Foundation-only; no screen rewrite.
>
> References:
> - F4.5A foundation: `docs/architecture/RVF_Malinois_F4_5A_Frontend_API_Client_Foundation_Report.md` (commit `20d45ec`)
> - F4.5B tenants/wells/tags: `docs/architecture/RVF_Malinois_F4_5B_Tenants_Wells_Tags_API_Wiring_Report.md` (commit `4b824d7`)
> - F4.5C equipment/units: `docs/architecture/RVF_Malinois_F4_5C_Equipment_Units_API_Wiring_Report.md` (commit `f7ecf6c`)
> - F4.4E jobs backend: `docs/architecture/RVF_Malinois_F4_4E_Jobs_API_Reactivation_Report.md` (commit `ebaa23b`)
> - F4.3 seed: `docs/architecture/RVF_Malinois_F4_3_Seed_Reference_Data_Report.md` (commit `91e17aa`)

## 1. Summary

F4.5D extends the data-source-aware adapter pattern to two more F4 endpoints:

- **Job list** (`GET /api/v1/jobs`) — `adapterListJobs(params?)` with optional `tenantId / wellId / unitId / status` filters.
- **Job detail** (`GET /api/v1/jobs/:id`) — `adapterGetJob(id)` returning the full F4.4E detail include: tenant summary + well (with `designLimits`) + measurement unit (with nested `equipmentType`) + engineer placeholder + current `commissioningSnapshot` (immutable, with JSONB `effectiveThresholds` / `sensorMappings` / `engineeringEnvelope` / `ruleVersions`).

Plus three new view-model helpers tuned to the jobs surface:

- `deriveJobRuntime(job, now?)` — `{ startedAt, closedAt, isClosed, runtimeMs }` or `undefined` when the job has not started. Accepts an optional `now` parameter so tests are deterministic.
- `deriveCommissioningSummary(snapshot)` — `{ sensorMappingCount, effectiveThresholdCount, ruleVersionCount, takenAt, immutable }` or `undefined` when the snapshot is `null`. Defensively narrows the JSONB fields (Prisma types them as `unknown`), so a malformed payload yields `0` counts rather than a crash.
- `toJobListItemViewModel(row)` — compact summary `{ id, status, startedAt, closedAt, tenantName?, wellName?, unitCode?, unitName? }` for table / card rendering.

The fixture mirrors the F4.3 seed exactly: **one reference job** anchored on HP-001 with the full immutable commissioning snapshot (7 sensor mappings, 14 effective thresholds, 14 rule versions, engineering envelope mirroring the HP-001 seed envelope). No synthetic fixture-only jobs were introduced — the mock matches the seed 1:1.

All quality gates pass: backend + workspace `lint` / `typecheck` / `build` (no backend file touched); frontend `pnpm test` is **288/288 across 32 files** (271 from F4.5C + 17 new in `jobs.test.ts`). No commit was made.

## 2. Files Changed

| Path | Change |
|---|---|
| `apps/web/lib/api-data/f4/mock-fixtures.ts` | **Extended.** F4.5D section adds: `MOCK_F4_JOBS` (single reference list row with tenant/well/unit summaries), `MOCK_F4_JOB_DETAILS` (lookup keyed by job id — one HP-001 reference job with full detail include), `MOCK_F4_COMMISSIONING_SNAPSHOTS` (one immutable snapshot). Reuses the F4.5C `HP_001_SENSOR_SEEDS` / `HP_001_ALARM_SEEDS` / `HP_001_ENGINEERING_UNIT_SET` to derive the JSONB shapes — no data duplication. F4.5B/C sections untouched. |
| `apps/web/lib/api-data/f4/jobs.ts` | **New.** Adapter functions (`adapterListJobs` / `adapterGetJob`) + three view-model helpers (`deriveJobRuntime` / `deriveCommissioningSummary` / `toJobListItemViewModel`). Mock list ordering mirrors the F4.4E backend (`startedAt desc nulls last → createdAt desc`). |
| `apps/web/lib/api-data/f4/index.ts` | **Extended.** Re-exports adapter functions, view-model helpers, four type aliases (`ListJobsParams`, `JobRuntime`, `CommissioningSummary`, `JobListItemViewModel`), and three new fixture exports. F4.5A/B/C exports preserved. |
| `apps/web/lib/api-data/f4/jobs.test.ts` | **New.** 17 mocked-`fetch` vitest tests covering mock-mode determinism, api-mode URL composition, the four list filters, detail include shape, NotFound parity, every view-model helper (including the `now`-parameter determinism path and defensive JSONB narrowing). |
| `docs/architecture/RVF_Malinois_F4_5D_Jobs_API_Wiring_Report.md` | **New.** This document. |

No file under `apps/backend/`, `apps/backend/prisma/`, `packages/`, `docker-compose.yml`, root config, or any existing `apps/web/` screen / component / hook / route handler / test was modified. The pre-F4.5D state of `apps/web/lib/api-data/f4/{tenants,wells,tags,equipment,adapter.test,equipment.test}.ts` is byte-for-byte preserved. `apps/web/lib/jobs/` (the F2A `ActiveJobSnapshot` namespace used for alarm evaluation) is also untouched — that namespace is a different concept and operates independently of the F4 backend.

## 3. Jobs Adapter Design

The two adapter functions follow the F4.5C structural decisions exactly:

1. **Single delegation point per function** (`isApiSource()` → backend wrapper or mock fixture path).
2. **Mock branch never calls `fetch`** (test-guarded).
3. **Uniform error type** (`RvfApiError(404, …)` in both branches).
4. **Two list / detail granularities** matching the F4.4E backend: the list endpoint returns rows with small `tenant / well / unit` summaries; the detail endpoint returns the full include with `designLimits` / `equipmentType` / `engineer` / `commissioningSnapshot`.
5. **Separate detail-lookup table** (`MOCK_F4_JOB_DETAILS: Record<id, JobDetail>`) so the by-id mock is O(1). Adding a new mock job requires updating both arrays — documented inline.

F4.5D-new: the mock list ordering reproduces the F4.4E backend's nullable-aware sort (`startedAt desc nulls last → createdAt desc`) explicitly in TypeScript. The F4.4E backend uses Prisma 5's `{ sort: 'desc', nulls: 'last' }` syntax; the frontend mock implements the same predicate so a consumer's display ordering does not flip when toggling `NEXT_PUBLIC_RVF_DATA_SOURCE`.

## 4. Data-Source Switch Behavior

Unchanged from F4.5A/B/C. The two new adapters honor `NEXT_PUBLIC_RVF_DATA_SOURCE`:

| Value | Jobs reads route through |
|---|---|
| (unset) | mock branch (`MOCK_F4_JOBS`, `MOCK_F4_JOB_DETAILS`) |
| `mock` | mock branch (same) |
| `api` | `listJobs` / `getJobById` from `@/lib/api/f4` |
| (other) | safely falls back to mock — `resolveDataSource` never throws |

Tests verify:

- Mock mode never calls `fetch` (guard fixture: `vi.stubGlobal('fetch', vi.fn(() => { throw … }))`).
- API mode composes the expected URL including all four filter parameters: `${API_BASE}/jobs?tenantId=…&wellId=…&unitId=…&status=in_progress`.
- API mode forwards UUID path params verbatim: `${API_BASE}/jobs/00000000-0000-0000-0000-000000004444`.

No silent fallback from api → mock on failure: a 4xx / 5xx / network error from the backend propagates as `RvfApiError`.

## 5. Jobs List Wiring

### 5.1 Surface

```ts
adapterListJobs(params?: ListJobsParams, options?: GetOptions): Promise<JobListRow[]>

interface ListJobsParams {
  tenantId?: string;
  wellId?: string;
  unitId?: string;
  status?: JobStatus;       // 'programmed' | 'in_progress' | 'closed'
}
```

### 5.2 Mock branch

- Returns `MOCK_F4_JOBS` after applying every truthy filter from `params`. All filters use strict equality (matches the F4.4E backend's Prisma `where`).
- Ordering: `startedAt desc nulls last → createdAt desc` — same predicate as the F4.4E backend.
- The single seeded row is the HP-001 reference job (`status: 'in_progress'`, `startedAt: 2026-05-24T00:00:00.000Z`, `closedAt: null`). It carries the small list-shape includes (`tenant: {id,name,status}`, `well: {id,name,fieldOrSite}`, `unit: {id,code,name}`) the F4.4E backend hydrates.

### 5.3 API branch

Delegates to `listJobs(params, options)`. The F4.5A fetch wrapper handles query-string composition + `AbortSignal` forwarding.

## 6. Job Detail Wiring

### 6.1 Surface

```ts
adapterGetJob(id: string, options?: GetOptions): Promise<JobDetail>
```

### 6.2 Mock branch — detail

`adapterGetJob(id)` returns the full `JobDetail` shape with includes:

- `tenant` summary.
- `well` (full: `id`, `name`, `fieldOrSite`, `location`, `type`, `fluid`, `designLimits` JSONB).
- `unit` (full: `id`, `code`, `name`, `serialNumber`, `status`, `operatingProfile`, `location`, plus a nested `equipmentType: { id, name, pidReference }` summary).
- `engineer` (placeholder: `{ id, displayName, role }`).
- `commissioningSnapshot` (immutable: `id`, `tenantId`, `jobId`, `unitId`, `takenAt`, four JSONB fields, `immutable: true`, `createdAt`).

**HP-001 reference detail** mirrors the F4.3 seed in full. The JSONB shapes are derived from the F4.5C `HP_001_SENSOR_SEEDS` / `HP_001_ALARM_SEEDS` / `HP_001_ENGINEERING_UNIT_SET` (no data duplication):

- `sensorMappings`: 7 entries (`{ instrument_tag, canonical_tag }`).
- `effectiveThresholds`: 14 entries (`{ canonical_tag, severity, kind, value }`).
- `ruleVersions`: 14 entries (`{ canonical_tag, severity, version }`).
- `engineeringEnvelope`: object with `max_pressure: 5000`, `max_flow_rate: 10000`, `max_temperature: 250`, `max_vibration: 1.0`, `max_differential_pressure: 500`, `max_volume: null`, `max_gas_rate: 5.0`, `engineering_unit_set: HP_001_ENGINEERING_UNIT_SET`.

### 6.3 Circular FK note

The F4.3 seed initially creates the job with `commissioning_snapshot_id = NULL` and then updates the FK after the snapshot is created (per the F4.4E backend report §3). By the time a frontend `findById` reads the row the FK is populated; the mock fixture matches that final state (`commissioningSnapshotId: REFERENCE_SNAPSHOT_ID`).

### 6.4 API branch

Delegates to `getJobById(id, options)`. The F4.5A fetch wrapper URL-encodes the UUID path param.

## 7. Mock Fixtures Added

| Fixture | Rows | Notes |
|---|---|---|
| `MOCK_F4_JOBS` | 1 | Single HP-001 reference list row mirroring the F4.3 seed. |
| `MOCK_F4_JOB_DETAILS` | 1 (lookup) | HP-001 detail keyed by `REFERENCE_JOB_ID`; full include with snapshot. |
| `MOCK_F4_COMMISSIONING_SNAPSHOTS` | 1 | Single immutable snapshot with 7 sensor mappings + 14 effective thresholds + 14 rule versions + engineering envelope. |

All identifiers continue the F4.5B placeholder convention (`00000000-0000-0000-0000-XXXXXXXXXXXX`). The reference job id is `00000000-0000-0000-0000-000000004444`, the snapshot id `00000000-0000-0000-0000-000000004499` (matching the F4.3 audit-log `correlation_id` convention informally — both fixtures and seed use deterministic suffixes).

No fixture-only synthetic jobs were introduced. `MOCK_F4_JOBS.length === 1` matches the F4.3 seed baseline exactly.

## 8. View-Model / Derived-Field Decisions

F4.5D introduces three jobs-specific helpers that complement (don't replace) the F4.5C equipment helpers.

### 8.1 `deriveJobRuntime`

```ts
interface JobRuntime {
  startedAt: string;     // always defined when this object is returned
  closedAt: string | null;
  isClosed: boolean;
  runtimeMs: number;     // clamped to ≥ 0
}

deriveJobRuntime(
  job: Pick<JobListRow, 'startedAt' | 'closedAt'>,
  now: number = Date.now(),
): JobRuntime | undefined
```

Behaviour:

- Returns `undefined` if `job.startedAt` is `null` (the job is `'programmed'` but not started).
- Returns `undefined` if `job.startedAt` is unparseable (defensive against malformed strings).
- For open jobs (`closedAt === null`): `runtimeMs = max(0, now - started)`. The default `now = Date.now()` makes the helper trivially callable; tests pass a fixed `now` for deterministic output.
- For closed jobs: `runtimeMs = max(0, end - started)` (where `end` is parsed from `closedAt`).
- The `max(0, …)` clamp defends against clock skew where `closedAt < startedAt` (or `now < startedAt`); the helper returns `0` rather than a negative number.

This is the first F4.5 helper that accepts a "test seam" parameter (`now`). The pattern is intentional — UI consumers wanting deterministic snapshots (e.g. SSR caching) can also pass a fixed timestamp.

### 8.2 `deriveCommissioningSummary`

```ts
interface CommissioningSummary {
  sensorMappingCount: number;
  effectiveThresholdCount: number;
  ruleVersionCount: number;
  takenAt: string;
  immutable: boolean;
}

deriveCommissioningSummary(snapshot: CommissioningSnapshot | null): CommissioningSummary | undefined
```

Behaviour:

- Returns `undefined` when the input is `null` (no current snapshot — the job is `programmed` or the FK has not been wired).
- For each JSONB field, returns `Array.isArray(value) ? value.length : 0` — defensive narrowing because Prisma JSON is `unknown` and a malformed payload should not throw. The `takenAt` and `immutable` scalars are surfaced as-is.

Tests cover both the happy path (HP-001 returns 7 / 14 / 14) and the defensive path (passing `{ malformed: true }` / `null` / `'not an array'` for the JSONB fields all return `0`).

### 8.3 `toJobListItemViewModel`

```ts
interface JobListItemViewModel {
  id: string;
  status: JobStatus;
  startedAt: string | null;
  closedAt: string | null;
  tenantName?: string;
  wellName?: string;
  unitCode?: string;
  unitName?: string;
}

toJobListItemViewModel(row: JobListRow): JobListItemViewModel
```

Surfaces only the scalars a list view normally renders. Drops the UUID FKs (`tenantId`, `wellId`, `unitId`, `commissioningSnapshotId`, `engineerId`) and audit timestamps. Optional `tenantName / wellName / unitCode / unitName` reflect that the F4.4E list-include is opt-in on the backend side (the API always returns them; the type is optional because that's how the F4 frontend type declares them).

### 8.4 What F4.5D explicitly does NOT bridge

- **The F2A `ActiveJobSnapshot` namespace** (`apps/web/lib/jobs/`) is **untouched**. That namespace serves alarm evaluation with a `FrozenSensorMapping` / `EffectiveThresholdSet` shape tuned to the runtime evaluator. F4.5D's `JobDetail.commissioningSnapshot` carries the same conceptual data but as JSONB blobs (matching the F4 backend's storage shape). A future screen migration may write a one-off mapper between the two — F4.5D does not pre-empt that choice.
- **No "active job" lookup** in the adapter. The F2A `getActiveJobSnapshot()` accessor remains the single source of truth for the runtime evaluator. The F4 backend may grow a similar concept in F4.6+ (e.g. "the in-progress job for this unit"), but F4.5D does not introduce it.

## 9. Confirmation: Mock Remains Default

Verified five ways (same posture as F4.5B/C):

1. `NEXT_PUBLIC_RVF_DATA_SOURCE` defaults to `mock` (F4.5A; jobs adapter tests' default-source cases all pass).
2. No screen / hook / route handler / component touched.
3. Mock fixtures use placeholder UUIDs (`00000000-…`).
4. Existing test suite is unaffected. Pre-F4.5D: 271 tests across 31 files. Post-F4.5D: 288 tests across 32 files. The delta is exactly the 17 new tests in `jobs.test.ts`.
5. Bundle output unchanged for the existing routes.

## 10. Confirmation: No Backend / Prisma / Migration / Seed Changes

`git status` shows only frontend + docs changes:

```
modified:   apps/web/lib/api-data/f4/index.ts
modified:   apps/web/lib/api-data/f4/mock-fixtures.ts
?? apps/web/lib/api-data/f4/jobs.test.ts
?? apps/web/lib/api-data/f4/jobs.ts
?? docs/architecture/RVF_Malinois_F4_5D_Jobs_API_Wiring_Report.md
```

No file under `apps/backend/`, `apps/backend/prisma/`, `apps/backend/prisma/migrations/`, `apps/backend/prisma/seed.f4.ts`, `packages/*`, `docker-compose.yml`, `turbo.json`, root `package.json`, `.github/`, or any existing `apps/web/` screen / component / hook / route handler / test was modified.

## 11. Commands Run and Results

| Command | Result |
|---|---|
| `pnpm --filter @rvf/web run lint` | clean (no fixes needed during authoring). |
| `pnpm --filter @rvf/web run typecheck` | clean. |
| `pnpm --filter @rvf/web run test` | **288/288 across 32 files** (271 pre-existing + 17 new). |
| `pnpm --filter @rvf/web run build` | clean (`next build`); existing route bundle sizes unchanged. |
| `pnpm run lint` (workspace) | 4/4 tasks successful. |
| `pnpm run typecheck` (workspace) | 4/4 tasks successful. |
| `pnpm run build` (workspace) | 2/2 tasks successful (FULL TURBO). |
| `pnpm --filter @rvf/web run test:e2e` | **Not run.** No UI change; F4.5D introduces no rendered behavior. |

## 12. Known Limitations

1. **No screen consumes the new jobs adapter yet.** Foundation-shaped. A future per-screen migration will swap an existing component (likely a jobs / commissioning view) from its current data source to the F4 adapter.
2. **`MOCK_F4_JOBS.length === 1`** to match the F4.3 seed exactly. Filter tests verify both match-1 and match-0 outcomes; tests that need multi-row sorting can be added in a future phase if needed.
3. **JSONB fields surface as `unknown`** on the API surface. `deriveCommissioningSummary` narrows defensively; consumers reading the JSONB directly should apply their own runtime checks (or pass through a Zod parser when one is needed).
4. **`deriveJobRuntime` uses `Date.now()` as default**. Consumers that need a deterministic snapshot (SSR caching, fixed-time tests) pass an explicit `now`.
5. **No mock-mode write paths**. F4.4E retired the F1 commissioning write surface; F4.5D mirrors that posture.
6. **Active-job runtime evaluator (`apps/web/lib/jobs/`) untouched.** The F4 detail carries the same conceptual data via the `commissioningSnapshot` JSONB but in a different shape. A migrating screen that wants to feed the runtime evaluator from F4 data must write a one-off mapper at the screen boundary.
7. **`MOCK_F4_JOB_DETAILS` must be maintained alongside `MOCK_F4_JOBS`.** Adding a new mock job means two edits.
8. **No real-DB e2e.** Same posture as F4.5A/B/C.

## 13. Out of Scope

Repeated explicitly so the reader cannot infer F4.5D quietly shipped any of these:

- **F4.5E — Telemetry trends API wiring.** Next phase.
- **F4.6 — Telemetry persistence / ingestion / live readings projection / WebSocket fan-out / alarm-event generation.**
- **Screen / page rewrites.** Zero pages or components changed.
- **Job write paths.** No create / close / update job; no commissioning workflow writes.
- **F2A `ActiveJobSnapshot` retirement.** That namespace remains the single source of truth for runtime alarm evaluation.
- **Operations expanded chart view, live readings, sensors/alarms wiring.**
- **Auth.**
- **Backend / Prisma / migration / seed changes.** None made.

## 14. Acceptance Criteria — Status

| # | Criterion | Status |
|---|---|---|
| 1 | Jobs can be read through a data-source-aware frontend adapter. | **Met.** `adapterListJobs` / `adapterGetJob`. |
| 2 | Job detail includes the immutable commissioning snapshot. | **Met.** Mock + API branches both surface the F4.4E detail include. |
| 3 | Mock remains default. | **Met.** §9. |
| 4 | API mode uses `apps/web/lib/api/f4` wrappers. | **Met.** `listJobs` / `getJobById` from F4.5A. |
| 5 | Existing mock UI behavior remains intact. | **Met.** Zero screen / hook / component / route handler touched. |
| 6 | No backend files modified. | **Met.** §10. |
| 7 | No Prisma / migration / seed files modified. | **Met.** |
| 8 | No major screen rewrite. | **Met.** |
| 9 | No Telemetry UI wiring. | **Met.** F4.5E. |
| 10 | No frontend visual redesign. | **Met.** |
| 11 | Derived view-model helpers exist for legacy UI compatibility. | **Met.** `deriveJobRuntime`, `deriveCommissioningSummary`, `toJobListItemViewModel`. |
| 12 | Tests added for adapters and / or derived mappings. | **Met.** 17 new tests in `jobs.test.ts`. |
| 13 | `lint` passes. | **Met.** Frontend + workspace. |
| 14 | `typecheck` passes. | **Met.** Frontend + workspace. |
| 15 | `test` passes. | **Met.** 288/288. |
| 16 | `build` passes. | **Met.** Frontend + workspace. |
| 17 | F4.5D report created. | **Met.** This document. |
| 18 | No commit made. | **Met.** All changes are working-tree only. |

All acceptance criteria are met.

## 15. Next Phase Recommendation

**Recommend F4.5E — Telemetry trends API wiring — as the next phase.**

Rationale:

- F4.5E is the last F4.5 adapter sub-phase. After it lands, every F4.4 read endpoint (tenants / wells / tags / equipment / jobs / telemetry) has a parallel `apps/web/lib/api-data/f4/` adapter.
- F4.5E's adapter is **single-endpoint** (`getTelemetryTrends`) so the surface is small, but the response carries time-series data and surfaces the **Decimal-string convention** prominently (`points[].value` is a Prisma `Decimal` serialized as a string). F4.5E is a natural place to add a `toNumericPoint(point): { timestamp: Date, value: number, … }` view-model helper that converts the string value to a JS `number` once at the adapter boundary so chart code doesn't repeat the conversion.
- The F4.3 seed does NOT populate `telemetry_readings`, so the F4 backend returns `points: []` on the F4.2 baseline. F4.5E's mock fixture must therefore decide between:
  - (a) Returning `points: []` deterministically (matches the F4.2 baseline; closes the cosmetic gap once F4.6 populates the table).
  - (b) Synthesising a small deterministic trace (e.g. 60 1-minute samples over the requested range) so a migrating screen can visually exercise the chart code path before F4.6 lands.
  - Recommended: **(b)** with a 60-sample synthetic trace clearly labelled (`source: 'mock'`). This matches the F4.5C posture (mock fixtures are richer than the strict seed when it benefits test coverage) and gives F4.5E adopters a working chart path without waiting for F4.6.
- F4.5E will likely add 2-3 view-model helpers: `toNumericPoint(point)`, `summarizeTrends(response)` (min/max/avg/count of valid `Number(value)` entries), `splitByQuality(points)` (grouping `good` / `uncertain` / `bad` for ISA-101-style rendering).

Two parallel streams remain unblocked:

- **F4.5 screen migrations** — start migrating the smallest equipment / units / jobs consumer to the F4 adapter (likely a settings or directory page).
- **F4.6 architecture + ADR** — start the telemetry-persistence design (ingestion adapter design, dedup, live-readings projection, WebSocket fan-out, alarm-event policy).

After F4.5E, the F4.5 foundation arc is complete and screen-by-screen migration can begin in earnest. F4.6 can run as its own architecture-first stream in parallel.
