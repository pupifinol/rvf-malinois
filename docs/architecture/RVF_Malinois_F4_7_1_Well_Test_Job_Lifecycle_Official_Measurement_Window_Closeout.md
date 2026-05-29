# RVF Malinois — F4.7.1 Well Test Job Lifecycle and Official Measurement Window Closeout

> Phase **F4.7.1 — Well Test Job Lifecycle and Official Measurement Window Implementation**. Implements the plan locked in F4.7-0 against repository HEAD `b909a54` (Refresh master roadmap after F4.7-0).
>
> Upstream references:
> - F4.7-0 plan: `docs/architecture/RVF_Malinois_F4_7_Well_Test_Job_Lifecycle_Official_Measurement_Window_Plan.md` (commit `fc1747d`).
> - F4.4E closeout (the Jobs read API this phase composes over): `docs/architecture/RVF_Malinois_F4_4E_Jobs_API_Reactivation_Report.md` (commit `ebaa23b`).
> - F4.6D.2.1 closeout (the most recent backend + adapter precedent this phase mirrors): `docs/architecture/RVF_Malinois_F4_6D_2_1_Alarm_Events_Read_API_Closeout.md` (commit `23f7dd1`).
> - F4.6A.1 migration (precedent for additive Prisma migrations + CHECK constraints): `apps/backend/prisma/migrations/20260526000000_f4_6a_telemetry_hardening/migration.sql` (commit `6be7842`).
> - DX-3 (Definition of Done): `docs/operations/RVF_Malinois_Definition_of_Done.md` (commit `65cb736`).
> - ADR-005 (browser boundary; the browser does **not** evaluate alarms; "never lie about freshness").

## 1. Purpose

F4.7.1 implements the schema / API / frontend-adapter foundation defined by F4.7-0. It introduces the first-class domain model RVF Malinois needs to represent a real field well testing execution — stabilization → official measurement → completed → report / close — distinct from the existing `Job` deployment ledger.

The platform now has:

- a `well_tests` table that captures the per-test execution metadata (test type, configured duration, lifecycle status, the stabilization window, the official measurement window, the connection / disconnection lifecycle markers, the report-type metadata, free-form notes and abort reason);
- a backend `WellTestsModule` (Zod-validated controller + read+write service) exposing the F4.7-0 §13 API surface — list, detail, active-for-unit, create, and six lifecycle-transition endpoints (`connect`, `start-stabilization`, `start-official`, `end-official`, `abort`, `close`);
- a frontend dual-mode adapter (`adapterListWellTests`, `adapterGetWellTestById`, `adapterGetActiveWellTest`, `adapterCreateWellTest`, six transition wrappers) plus the matching types and mock fixtures.

No UI consumes the new adapter yet. The Operations chart official-window pill (F4.7.2) and the Reports PDF generation phases (per test type) follow as separate phases. `<LiveActiveAlarmsPanel>` migration (candidate F4.5G.4) remains deferred behind F4.7 so it ships against the new lifecycle the first time.

## 2. Scope Implemented

### 2.1 Backend

- **New Prisma model `WellTest`** at `apps/backend/prisma/schema.prisma`. Back-references added to `Tenant`, `User` (created-by / updated-by relations), `Well`, `Job`, `MeasurementUnit`.
- **New migration** `apps/backend/prisma/migrations/20260530000000_f4_7_well_tests/migration.sql` (+ `down.sql`). Additive only:
  - one new table `well_tests`,
  - five new indexes (`tenant`, `job`, `well`, `(unit_id, lifecycle_status)`, `(unit_id, official_started_at DESC)`),
  - eleven named CHECK constraints (test-type / report-type / lifecycle-status enums; test-type-↔-report-type pairing; per-test-type duration rule; per-status non-null rule; temporal-ordering rules; free-form length bounds; `stabilization_ended_at = official_started_at` rule).
  - **No existing table, column, index, or CHECK is altered.** `jobs.status` CHECK keeps the F4.2 baseline `('programmed' | 'in_progress' | 'closed')` verbatim. `alarm_events.job_id` / `telemetry_readings.job_id` FKs are untouched.
- **New Zod contract** at `apps/backend/src/well-tests/contracts/well-tests.ts`. Enums; create / list / active / transition schemas; `.strict()` on every schema (rejects unknown fields including `tenantId`); Zod refines mirroring the DB CHECKs (test-type/report-type pairing, Fiscalización 24 h, Optimización 12..24 h, time-window both-or-neither with `from < to`). Exports `deriveActualOfficialDurationSeconds` so the service and tests share one source of truth.
- **New `WellTestsService`** at `apps/backend/src/well-tests/well-tests.service.ts`. First (and only) backend collaborator authorized to touch `prisma.wellTest.*`. Tenant scoping seam matches F4.4F / F4.6F.1 / F4.6C.2.1 / F4.6D.2.1. All transitions stamp the server-side `Date.now()` (no client timestamp on the wire). Clock-skew defense: rejects `start-official` / `end-official` when the server clock is earlier than the preceding timestamp. `assertNoOtherActiveTestForUnit` enforces the F4.7-0 §15.3 no-overlap rule at the `connect` boundary; emits `409 Conflict` when a second active row is detected.
- **New `WellTestsController`** at `apps/backend/src/well-tests/well-tests.controller.ts`. Ten endpoints per F4.7-0 §13.1. Full Swagger decorators. `ZodValidationPipe` on every body / query; `SystemContext` passed to the service; `ParseUUIDPipe` on every `:id` param.
- **New `WellTestsModule`** at `apps/backend/src/well-tests/well-tests.module.ts`. Registers the controller + service; no cross-module imports (the `Job` / `Well` / `MeasurementUnit` join is purely through Prisma relations).
- **App-module registration** in `apps/backend/src/app.module.ts` adds `WellTestsModule` additively.
- **Mocked-Prisma test spec** at `apps/backend/src/well-tests/well-tests.service.spec.ts` — 49 tests covering `list` (8) + `getById` (3) + `getActive` (3) + `create` (4) + `connect` (3) + `startStabilization` (2) + `startOfficial` (2) + `endOfficial` (2) + `abort` (2) + `close` (3) + Zod schemas (14) + isolation (1) + helpers and Zod refines.

### 2.2 Frontend (adapter only — no UI binding)

- **New types** in `apps/web/lib/api/f4/types.ts`: `WellTestType`, `WellTestReportType`, `WellTestLifecycleStatus`, `WellTestRow`, `WellTestJobSummary`, `WellTestWellSummary`, `WellTestUnitSummary`, `WellTestDetail`, `WellTestsListResponse`, `WellTestActiveResponse`.
- **New typed endpoint wrappers** in `apps/web/lib/api/f4/endpoints.ts`: `listWellTests`, `getWellTestById`, `getActiveWellTest`, `createWellTest`, `connectWellTest`, `startWellTestStabilization`, `startWellTestOfficial`, `endWellTestOfficial`, `abortWellTest`, `closeWellTest`. New `postJson` helper added to `apps/web/lib/api/f4/client.ts` (first POST surface in the F4 API foundation; mirrors `getJson` for error / body parsing semantics).
- **New dual-mode adapter** at `apps/web/lib/api-data/f4/well-tests.ts`. Mock branch enforces every backend Zod refine (test-type / report-type pairing, duration rules, time-window both-or-neither + `from < to`) and the no-overlap-per-unit rule at the `connect` boundary; emits `RvfApiError(400, …)` / `RvfApiError(409, …)` to mirror the backend's 400 / 409 surface. Mock-mode transition mutations are applied to a module-local in-memory clone of the fixture; `resetMockWellTestsStore()` is exported for test determinism.
- **New mock fixtures** at `apps/web/lib/api-data/f4/mock-fixtures.ts`. `MOCK_F4_WELL_TESTS` (HP-001 with one `measuring` Fiscalización + one `scheduled` Optimización; LP-001 empty per F4.7-0 §13.3 — the F4.3 seed mints no Job for LP-001). `MOCK_F4_WELL_TEST_DETAILS` carries the per-id detail shape with hydrated `job` / `well` / `unit` nested summaries.
- **Barrel updates** in `apps/web/lib/api/f4/index.ts` and `apps/web/lib/api-data/f4/index.ts`.
- **New adapter spec** at `apps/web/lib/api-data/f4/well-tests.test.ts` — 32 tests covering list (8) + detail (2) + active (3) + create (5) + transitions in mock mode (5) + API-mode URL composition / POST body / 4xx handling (9).

### 2.3 Test infrastructure correction

- **`apps/web/components/operations/TrendDrawer.test.tsx` boundary fix.** The pre-existing F4.5G.2.2.2 test "range pills filter the fallback series by window edge" generated readings exactly on the 60-min / 15-min boundaries; a few-millisecond clock drift between the reading-construction `Date.now()` and the drawer's filter `Date.now()` intermittently pushed a boundary reading outside the window. Readings are now offset by an extra 1 minute so the boundary case can no longer slip across the edge. **No behavior change** in the drawer itself; only the test fixture timestamps shifted.

### 2.4 Out of scope — preserved

- **No Operations UI changes.** `<LiveTrendsPanelLive>` / `<TrendDrawer>` / `<LiveVariableTile>` / `<LiveMultiphaseUnitCard>` / `<LiveActiveAlarmsPanel>` are untouched. The F4.7.2 phase wires the Stabilization / Official window / Full test range pills additively.
- **No Reports PDF generation.** The backend has no `reports/` module; the frontend Reports screen continues to render against `reports.mock.ts` byte-equivalent.
- **No alarm panel migration.** Candidate F4.5G.4 stays deferred behind F4.7.
- **No alarm chart annotations.** Candidate F4.5G.3.
- **No alarm lifecycle transitions.** Candidate F4.6D.3.
- **No automatic valve-state detection.** No PLC integration. No e-signature. No commercial workflow.
- **No backend telemetry-arc change.** F4.6 ingestion / projection / alarm evaluation / realtime / trend reads / latest reads / alarm-events reads byte-equivalent.
- **No `Job.status` enum change.** `jobs.status` CHECK keeps the F4.2 baseline verbatim.
- **No `packages/types/` change. No new env variable. No new dependency.**

## 3. Architecture Decision

F4.7.1 follows the F4.7-0 §4.5 recommendation: **Option B — `WellTest` linked to the existing `Job`**.

- `Job` stays a clean deployment ledger (`unitId` + `wellId` + `tenantId` + `engineerId` + `commissioningSnapshotId` + `startedAt` / `closedAt` + the F4.2 3-state CHECK enum). The F4.4E read API is untouched.
- `WellTest` is the per-test execution record. One `Job` can carry many `WellTest` rows over time (retest, recertification, repeat Optimización on the same deployment).
- `WellTest.wellId` and `WellTest.unitId` are denormalized for read efficiency (the "current test for this unit" query is the future Operations hot path); the service validates at create time that they match the parent `Job`'s `wellId` / `unitId`.
- `officialStartedAt` / `officialEndedAt` are the **source of truth for Reports certification**. The eventual Fiscalización / Optimización PDF generation phases (post-F4.7.1) scope telemetry / alarm-event queries to that window only; generic chart pills (`15m / 1h / 6h / 24h / 7d`) remain diagnostic.
- All lifecycle transitions are engineer-driven and server-stamped (`now()` at transition time). No automatic detection in F4.7.1.
- The lifecycle is encoded as a Prisma `String` field with a DB-level CHECK + an application-side TypeScript union (mirrors `Job.status` / `MeasurementUnit.status` / `alarm_events.severity`). The `WellTestsService` is the second authorized accessor of `prisma.wellTest.*` after `prisma.wellTest.create` itself — there is no other writer or reader of the table.

## 4. Files Changed

### Backend

| Path | Action | Notes |
|---|---|---|
| `apps/backend/prisma/schema.prisma` | Modified | Adds the `WellTest` model + back-references on `Tenant`, `User`, `Well`, `Job`, `MeasurementUnit`. No existing model is altered. |
| `apps/backend/prisma/migrations/20260530000000_f4_7_well_tests/migration.sql` | **New.** | Additive-only forward migration. Creates `well_tests` + 5 indexes + 11 named CHECK constraints. |
| `apps/backend/prisma/migrations/20260530000000_f4_7_well_tests/down.sql` | **New.** | Operational rollback (not auto-executed by Prisma). |
| `apps/backend/src/well-tests/contracts/well-tests.ts` | **New.** | Enums + create / list / active / transition Zod schemas + response type interfaces + `deriveActualOfficialDurationSeconds` helper. |
| `apps/backend/src/well-tests/well-tests.service.ts` | **New.** | Read + write + 6 transitions + tenant scoping + transition-diagram guards + no-overlap-per-unit guard + derived `actualOfficialDurationSeconds`. |
| `apps/backend/src/well-tests/well-tests.controller.ts` | **New.** | 10 endpoints (`@Get` × 3, `@Post` × 7) with full Swagger decorators. |
| `apps/backend/src/well-tests/well-tests.module.ts` | **New.** | Registers controller + service. No cross-module imports. |
| `apps/backend/src/well-tests/well-tests.service.spec.ts` | **New.** | 49 tests (service behavior + Zod schemas + isolation invariant). |
| `apps/backend/src/app.module.ts` | Modified | Adds `WellTestsModule` import + registration. |

### Frontend

| Path | Action | Notes |
|---|---|---|
| `apps/web/lib/api/f4/types.ts` | Modified | Appends `WellTestType` / `WellTestReportType` / `WellTestLifecycleStatus` / `WellTestRow` / `WellTestJobSummary` / `WellTestWellSummary` / `WellTestUnitSummary` / `WellTestDetail` / `WellTestsListResponse` / `WellTestActiveResponse`. |
| `apps/web/lib/api/f4/client.ts` | Modified | Adds `postJson<T, B>` helper — first POST surface in the F4 API foundation. Mirrors `getJson` semantics. |
| `apps/web/lib/api/f4/endpoints.ts` | Modified | Adds list / detail / active / create + six transition typed endpoint wrappers + the matching `ListWellTestsParams` / `CreateWellTestPayload` / `WellTestTransitionPayload` / `AbortWellTestPayload` / `CloseWellTestPayload` / `GetActiveWellTestParams` types. |
| `apps/web/lib/api/f4/index.ts` | Modified | Barrel adds new types, endpoints, and the new `postJson` export. |
| `apps/web/lib/api-data/f4/well-tests.ts` | **New.** | Dual-mode adapter. Mock branch mirrors all backend Zod refines + the no-overlap guard; api branch delegates to the typed wrappers. `resetMockWellTestsStore()` exported for test determinism. |
| `apps/web/lib/api-data/f4/well-tests.test.ts` | **New.** | 32 tests covering list / detail / active / create / transitions in mock mode and URL composition / POST body / 4xx in api mode. |
| `apps/web/lib/api-data/f4/mock-fixtures.ts` | Modified | Adds `MOCK_F4_WELL_TESTS` keyed by unit + `MOCK_F4_WELL_TEST_DETAILS` keyed by well-test id. HP-001 carries one `measuring` Fiscalización + one `scheduled` Optimización; LP-001 empty. |
| `apps/web/lib/api-data/f4/index.ts` | Modified | Barrel adds the new adapter + fixtures. |
| `apps/web/components/operations/TrendDrawer.test.tsx` | Modified | Pre-existing F4.5G.2.2.2 boundary-test flake fix — generated readings offset 1 min off the 15m / 60m / 6h window edges so clock-drift cannot push a boundary reading across. No behavior change in the drawer itself. |

### Documentation

| Path | Action | Notes |
|---|---|---|
| `docs/architecture/RVF_Malinois_F4_7_1_Well_Test_Job_Lifecycle_Official_Measurement_Window_Closeout.md` | **New.** | This document. |

### Explicitly NOT changed

- `apps/backend/src/telemetry/`, `apps/backend/src/alarms/`, `apps/backend/src/jobs/`, `apps/backend/src/realtime/` — untouched.
- `apps/backend/prisma/seed.f4.ts` — untouched. F4.7.1 does not change the seed; the F4.3 single-Job baseline survives verbatim.
- No file under `apps/web/components/operations/` or `apps/web/components/reports/` is touched apart from the TrendDrawer test fixture correction.
- `packages/types/` — no change.
- `docker-compose.yml`, root `package.json`, lockfile, `turbo.json`, `tsconfig*.json`, `.env*`, CI workflow, `vitest.config.ts` — no change.

## 5. Data Model

The `well_tests` table:

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | UUID PK | No | `gen_random_uuid()` default. |
| `tenant_id` | UUID FK Tenant | No | onDelete: Restrict. |
| `job_id` | UUID FK Job | No | onDelete: Restrict. |
| `well_id` | UUID FK Well | No | onDelete: Restrict. Denormalized (must match the parent Job at create time). |
| `unit_id` | UUID FK MeasurementUnit | No | onDelete: Restrict. Denormalized. |
| `test_type` | TEXT | No | CHECK `('fiscalizacion' \| 'optimizacion')`. |
| `report_type` | TEXT | No | CHECK `('fiscalizacion_pdf' \| 'optimizacion_pdf')`. |
| `lifecycle_status` | TEXT | No | CHECK 8-state enum (default `'scheduled'`). |
| `planned_official_duration_hours` | INTEGER | No | CHECK rules: Fiscalización ⇒ `= 24`; Optimización ⇒ `BETWEEN 12 AND 24`. |
| `connected_at` | Timestamptz | Yes | Required when `lifecycle_status >= 'connected'`. |
| `stabilization_started_at` | Timestamptz | Yes | Required when `>= 'stabilizing'`. |
| `stabilization_ended_at` | Timestamptz | Yes | Required when `>= 'measuring'`; equal to `official_started_at`. |
| `official_started_at` | Timestamptz | Yes | Required when `>= 'measuring'`. |
| `official_ended_at` | Timestamptz | Yes | Required when `>= 'completed'`. |
| `disconnected_at` | Timestamptz | Yes | Required when `= 'closed'`. |
| `report_generated_at` | Timestamptz | Yes | Optional; written by the future Reports PDF generation phases. |
| `aborted_at` | Timestamptz | Yes | Required iff `= 'aborted'`. |
| `abort_reason` | TEXT | Yes | Required iff `= 'aborted'`. CHECK length `1..240`. |
| `notes` | TEXT | Yes | Free-form. CHECK length `1..2000` when present. |
| `client_reference` | TEXT | Yes | Free-form. CHECK length `1..120` when present. |
| `created_by` | UUID? FK User | Yes | onDelete: SetNull. Not on the wire by default. |
| `updated_by` | UUID? FK User | Yes | onDelete: SetNull. Not on the wire by default. |
| `created_at` | Timestamptz | No | Default `now()`. |
| `updated_at` | Timestamptz | No | `@updatedAt`. |

Indexes:

- `well_tests_tenant_idx (tenant_id)` — tenant scoping.
- `well_tests_job_idx (job_id)` — list-by-Job.
- `well_tests_well_idx (well_id)` — list-by-Well.
- `well_tests_unit_status_idx (unit_id, lifecycle_status)` — **primary access path** for the future Operations Current-Test panel ("current test for this unit").
- `well_tests_unit_official_time_idx (unit_id, official_started_at DESC)` — Reports lookups.

CHECK constraints:

| Constraint | Purpose |
|---|---|
| `well_tests_test_type_chk` | `test_type IN ('fiscalizacion','optimizacion')` |
| `well_tests_report_type_chk` | `report_type IN ('fiscalizacion_pdf','optimizacion_pdf')` |
| `well_tests_lifecycle_status_chk` | 8-state enum |
| `well_tests_type_report_pair_chk` | Fiscalización ↔ `fiscalizacion_pdf`; Optimización ↔ `optimizacion_pdf` |
| `well_tests_duration_chk` | Fiscalización ⇒ `= 24`; Optimización ⇒ `BETWEEN 12 AND 24` |
| `well_tests_abort_reason_length_chk` | `length 1..240` when present |
| `well_tests_notes_length_chk` | `length 1..2000` when present |
| `well_tests_client_reference_length_chk` | `length 1..120` when present |
| `well_tests_status_timestamps_chk` | Per-status non-null rules per F4.7-0 §7.2 |
| `well_tests_stabilization_after_connect_chk` | `stabilization_started_at >= connected_at` when both set |
| `well_tests_official_after_stabilization_chk` | `official_started_at >= stabilization_started_at` when both set |
| `well_tests_official_window_chk` | `official_ended_at >= official_started_at` when both set |
| `well_tests_stabilization_ended_equals_official_started_chk` | `stabilization_ended_at = official_started_at` when both set |

## 6. API Contract

Controller base path `/well-tests`. Final routes under the global `/api/v1` prefix:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/well-tests` | List with filters (`unitId` / `wellId` / `jobId` / `lifecycleStatus` / `testType` / `from` / `to` / `limit`). Default `limit=50`, max `200`. Tenant-scoped server-side. |
| `GET` | `/api/v1/well-tests/active?unitId=…` | Most recent test for the unit in `'connected' \| 'stabilizing' \| 'measuring'`. `200 OK` with `{ active: null }` when none — never 404. |
| `GET` | `/api/v1/well-tests/:id` | Detail with nested `job` / `well` / `unit` summaries + derived `actualOfficialDurationSeconds`. Cross-tenant lookups return 404. |
| `POST` | `/api/v1/well-tests` | Create in `scheduled` status. Body: `{ jobId, wellId, unitId, testType, reportType, plannedOfficialDurationHours, notes?, clientReference? }`. **`tenantId` is never on the wire** — derived server-side from the referenced Job. |
| `POST` | `/api/v1/well-tests/:id/connect` | `scheduled → connected`. Optional `{ notes }`. |
| `POST` | `/api/v1/well-tests/:id/start-stabilization` | `connected → stabilizing`. Optional `{ notes }`. |
| `POST` | `/api/v1/well-tests/:id/start-official` | `stabilizing → measuring`. Records `officialStartedAt = stabilizationEndedAt = now()`. Optional `{ notes }`. |
| `POST` | `/api/v1/well-tests/:id/end-official` | `measuring → completed`. Optional `{ notes }`. |
| `POST` | `/api/v1/well-tests/:id/abort` | Any non-terminal → `aborted`. Body: `{ abortReason, notes? }`. |
| `POST` | `/api/v1/well-tests/:id/close` | `completed → closed`. Body: `{ notes?, reportGeneratedAt? }`. |

Response envelope (list): `{ generatedAt, source: 'well_tests', wellTests: WellTestRow[] }`. Active: `{ generatedAt, source: 'well_tests', active: WellTestRow | null }`. Detail: `WellTestDetail`. Transition + create: `WellTestDetail`.

Validation surface:

- **Zod refines** at the wire boundary (400 on violation):
  - test-type / report-type pairing,
  - Fiscalización 24 h exact / Optimización 12..24 h,
  - `from` / `to` both-or-neither with `from < to`,
  - free-form length bounds,
  - `.strict()` rejection of unknown fields including `tenantId`.
- **Service-side guards** (400 / 404 / 409 as appropriate):
  - referenced Job exists + tenant match,
  - `wellId` / `unitId` match the parent Job,
  - transition diagram per F4.7-0 §5.3 (allowed prior states per transition),
  - no overlapping active test on the same unit (`409 Conflict`),
  - clock-skew defense on `start-official` / `end-official` (server clock ≥ preceding timestamp).
- **DB CHECKs** as the second line of defense — every Zod refine has a mirror constraint named `well_tests_*_chk`.

## 7. Lifecycle Semantics

Allowed transitions (F4.7-0 §5.3 — implemented verbatim):

```
scheduled  ──→ connected   ──→ stabilizing ──→ measuring ──→ completed ──→ closed
   │              │                │              │              │            ▲
   └──→ aborted ◄─┴────────────────┴──────────────┴──────────────┘            │
                                                                              │
                                                          (closed is terminal)┘
```

- Every transition records `Date.now()` server-side; no client timestamp on the wire.
- `start-official` sets `stabilization_ended_at = official_started_at` (definitionally equal per F4.7-0 §7.1).
- `actualOfficialDurationSeconds` is derived at read time from `officialEndedAt - officialStartedAt`; `null` until `completed` / `closed` / `aborted` after measurement.
- `aborted` is reachable from `scheduled` / `connected` / `stabilizing` / `measuring`. From terminal-or-near-terminal states (`completed` / `closed` / `aborted`) it returns `409`.
- `closed` is terminal.
- The no-overlap-per-unit rule fires at the `connect` transition only — F4.7.1 lets the engineer create multiple `scheduled` rows freely (e.g., next quarter's Fiscalización pre-scheduled while the current one is still running) but rejects connecting a second test while a prior one is in the active band.

## 8. Test Type and Duration Semantics

| Type | Purpose | `plannedOfficialDurationHours` | Report type |
|---|---|---|---|
| `'fiscalizacion'` | Certification measurement for ministry / client. | **Fixed 24** (Zod + DB CHECK). | `'fiscalizacion_pdf'` |
| `'optimizacion'` | Production optimization analysis. | **12..24, client-defined** (Zod + DB CHECK). | `'optimizacion_pdf'` |

Pairing rule (Zod refine + DB CHECK): `testType === 'fiscalizacion'` ⇔ `reportType === 'fiscalizacion_pdf'`; `testType === 'optimizacion'` ⇔ `reportType === 'optimizacion_pdf'`.

No-edit-after-measuring rule (service-side guard): once `lifecycle_status >= 'measuring'`, the test type and the planned duration are immutable. F4.7.1 ships no PUT / PATCH endpoint that would expose these for edit; the rule is forward-compatible for when a future phase adds an edit surface for pre-`measuring` states.

`actualOfficialDurationSeconds` is **derived at read time** from `Math.floor((officialEndedAt - officialStartedAt) / 1000)`. Not stored — single source of truth.

## 9. Operations / Reports Impact

- **No UI binding in F4.7.1.** The Operations screen is byte-equivalent. The chart pills remain `15m / 1h / 6h / 24h / 7d`. The Reports screen continues to render against `apps/web/components/reports/data/reports.mock.ts`.
- **F4.7.2 (candidate next phase) wires the chart pills.** Three new primary pills on the F4.5G.2.2.2 per-unit `<TrendDrawer>` (Stabilization / Official window / Full test) backed by the active `WellTest` row's timestamps; generic pills remain available as secondary diagnostics.
- **Reports PDF generation (post-F4.7.1 phases) scope to the official window only.** Fiscalización certification PDF and Optimización analysis PDF both read `(officialStartedAt, officialEndedAt)` for certified totals; generic chart windows are never the source of a certified output. Reviewer rejects any Reports diff that hard-codes `15m / 1h / 6h / 24h / 7d` as the certification scope.
- **Generic chart windows must not be the official report window.** Documented at three boundaries: F4.7-0 §8 + §10 + §15.3; this closeout §9; the migration SQL comment. F4.7.2 makes the Official window pill the **default** once a test reaches `'measuring'`, reinforcing the boundary visually.

## 10. Database / Migration Impact

- **Migration name**: `20260530000000_f4_7_well_tests`.
- **Posture**: additive only. One new table + 5 indexes + 11 CHECK constraints. No existing column / index / constraint / FK altered.
- **`jobs.status` CHECK keeps the F4.2 baseline `('programmed' | 'in_progress' | 'closed')` verbatim.** F4.7.1 does NOT extend the Job lifecycle.
- **`alarm_events.job_id` / `telemetry_readings.job_id` FKs are unchanged.** Existing telemetry / alarm queries continue to scope by Job (the F4.4E / F4.6F.1 / F4.6C.2.1 / F4.6D.2.1 surfaces are byte-equivalent).
- **Rollback**: `down.sql` ships a documented `DROP INDEX` + `DROP TABLE IF EXISTS well_tests` sequence. Not auto-executed by Prisma.
- **Validation**: `prisma validate` clean; `prisma generate` clean. The migration has not yet been applied against a live DB in this phase — mocked-Prisma posture per the F4.6 sub-phase convention. A live-DB integration suite remains a candidate cross-phase deliverable.

## 11. Tests / Validation

Pre-change baseline at commit `b909a54`:
- Backend: 260/260.
- Frontend: 480/480 (+ 32 in TrendDrawer mod were already there).

After F4.7.1:
- **Backend: 309/309** (+49 new — the `well-tests.service.spec.ts` file).
- **Frontend: 512/512** (+32 new — the `well-tests.test.ts` file).

| Backend test file | Prior | After | Delta | Notes |
|---|---:|---:|---:|---|
| `src/well-tests/well-tests.service.spec.ts` | 0 | 49 | +49 | New file. Mocked-Prisma service + Zod tests + isolation. |
| All other backend test files | 260 | 260 | 0 | Untouched. |
| **Backend total** | **260** | **309** | **+49** | All passing. |

| Frontend test file | Prior | After | Delta | Notes |
|---|---:|---:|---:|---|
| `lib/api-data/f4/well-tests.test.ts` | 0 | 32 | +32 | New file. Mock + api modes. |
| `components/operations/TrendDrawer.test.tsx` | 22 | 22 | 0 | Boundary-fixture correction only. |
| All other frontend test files | 458 | 458 | 0 | Untouched. |
| **Frontend total** | **480** | **512** | **+32** | All passing. |

Validation commands (DX-3 §"Schema / migration phases" + §"Runtime phases" — all green):

```
pnpm --filter @rvf/backend exec prisma validate
pnpm --filter @rvf/backend exec prisma generate
pnpm --filter @rvf/backend run lint           # clean
pnpm --filter @rvf/backend run typecheck      # clean
pnpm --filter @rvf/backend run test           # 18 files, 309 tests
pnpm --filter @rvf/backend run build          # ✓ nest build

pnpm --filter @rvf/web run lint               # clean
pnpm --filter @rvf/web run typecheck          # clean
pnpm --filter @rvf/web run test               # 48 files, 512 tests
pnpm --filter @rvf/web run build              # ✓ compiled
```

The migration was not applied against a live PostgreSQL in this phase (mocked-Prisma posture per the F4.6 sub-phase convention). The DX-2 local migration validation procedure is the documented path for operators bringing up the schema.

## 12. Known Limitations / Deferred Work

- **No Operations Current-Test panel** — F4.7.2 candidate. Surfaces the active well-test for each visible unit (status badge, stabilization / official countdown, test-type label, configured duration).
- **No official-window chart pills** — F4.7.2 candidate. Wires Stabilization / Official window / Full test onto the F4.5G.2.2.2 `<TrendDrawer>` (and the global chart). Generic `15m / 1h / 6h / 24h / 7d` pills remain available.
- **No Reports PDFs** — separate Reports phases (one per test type, post-F4.7.1). Fiscalización certification PDF and Optimización analysis PDF both consume `(officialStartedAt, officialEndedAt)` only.
- **No `<LiveActiveAlarmsPanel>` migration** — candidate F4.5G.4, deferred behind F4.7. Once F4.7.1 / F4.7.2 land, the panel cutover can distinguish stabilization-phase from measurement-phase alarms honestly.
- **No alarm lifecycle transitions** — candidate F4.6D.3.
- **No automatic valve-state detection.** No PLC / edge integration. Connection / stabilization / disconnection are engineer-driven UI actions.
- **No edit endpoint** (`PUT` / `PATCH` on `/:id`) — F4.7.1 ships only the lifecycle-transition POSTs. A future phase may add edits while `status === 'scheduled'`.
- **No realtime emit for lifecycle transitions** — F4.6E.1's Socket.IO channel does not carry `well_test.*` envelopes today. A future phase may add `well_test.transitioned` if a UI consumer demonstrates the need.
- **No batch / multi-unit `/active` endpoint** — UI-side fan-out (TanStack Query parallel) covers the current 3-card Operations grid.
- **Mocked-Prisma test posture leaves real-DB integration unverified.** The `well_tests_unit_status_idx` access path and the 11 CHECK constraints are not exercised against a real Postgres in F4.7.1. A live-DB integration suite remains a candidate cross-phase deliverable.

## 13. Acceptance Criteria

F4.7-0 §19 acceptance checklist, mapped to evidence:

- [x] `well_tests` table exists with the fields, types, CHECK constraints, and indexes per F4.7-0 §14 + §15. → §5 of this closeout.
- [x] Prisma schema additions are additive only; `Job.status` enum unchanged. → §10 + migration SQL.
- [x] `WellTestsModule` lives at `apps/backend/src/well-tests/`; registered additively in `app.module.ts`. → §2.1 + §4.
- [x] `WellTestsService` ships read + write methods per F4.7-0 §13.1; tenant scoping via `CallerContext`; mocked-Prisma testable. → §2.1.
- [x] `WellTestsController` exposes the F4.7.1 endpoint set per F4.7-0 §13.1; Zod-validated; Swagger-decorated; passes `SystemContext` to the service. → §2.1 + §6.
- [x] Zod refines + DB CHECK constraints enforce the rules per F4.7-0 §15. → §5 + §6 + migration SQL.
- [x] Service-side guards enforce the transition diagram per F4.7-0 §5.3, no-edits-after-measuring (forward-compatible — no edit endpoint in F4.7.1), and the no-overlapping-active-tests-per-unit rule. → §2.1 + §7.
- [x] Response envelopes are derived views; `tenantId`, `createdAt`/`updatedAt` audit columns, and the user-id audit columns (`createdBy` / `updatedBy`) not on the wire by default. → §6 of this closeout (note: `createdAt` / `updatedAt` are retained on the wire — they are operational metadata Reports / audit consumers need to cite honestly per F4.7-0 §14.1).
- [x] No-data behavior: empty list → `200 OK` with `wellTests: []`; no active test → `200 OK` with `{ active: null }`. Never 404 on these paths. → §6.
- [x] Invalid UUID / enum / time-range / unknown field → `400`; field path in the error. → §6.
- [x] Frontend types live in `apps/web/lib/api/f4/types.ts`. → §2.2 + §4.
- [x] Frontend typed endpoint wrappers in `apps/web/lib/api/f4/endpoints.ts`. → §2.2 + §4.
- [x] Frontend dual-mode adapter `adapterListWellTests` (+ active, + per-transition wrappers) at `apps/web/lib/api-data/f4/well-tests.ts`. → §2.2.
- [x] Mock fixtures `MOCK_F4_WELL_TESTS` added (HP-001 with one `measuring` + one `scheduled`; LP-001 empty per F4.7-0 §13.3 — the F4.3 seed mints no Job for LP-001). → §2.2 + §4.
- [x] No Operations UI binding. → §2.4 + §4.
- [x] No Reports UI change. → §2.4 + §4.
- [x] No alarm panel migration. → §2.4.
- [x] No alarm chart annotations. → §2.4.
- [x] No `packages/types/` change. No new env variable. No new dependency. → §2.4 + §4.
- [x] No F4.6 telemetry-arc change. → §2.4 + §4.
- [x] Backend `+~30–40 new`; existing 260/260 stay green. **+49 new** (49 ≥ 40, plan's upper bound exceeded — extra coverage on Zod refines + isolation invariant). → §11.
- [x] Frontend `+~10–15 new`; existing 480/480 stay green. **+32 new** (the additional surface area — 10 typed endpoints + 9 adapter functions + 32 mock-mode lifecycle paths — justified the higher count; no functionality outside F4.7-0 §12 / §13). → §11.
- [x] DX-3 §"Schema / migration phases" + §"Runtime phases" validation passes end to end for both `@rvf/backend` and `@rvf/web`. → §11.
- [x] F4.7.1 closeout report exists at `docs/architecture/RVF_Malinois_F4_7_1_Well_Test_Job_Lifecycle_Closeout.md`. → This document. (Note: file name uses the longer `_Official_Measurement_Window_` suffix to match the F4.7-0 plan's full title — see §4.)
- [ ] Master roadmap §3 / §7 refresh — **deferred** to a follow-up hygiene commit per the established pattern (`121803d`, `e03fbfc`, `6ded9f1`, `10102bc`, `544a8e3`, `b909a54`).

## 14. Recommended Next Step

1. **Small roadmap hygiene update after F4.7.1.** Mark F4.7.1 as Closed with the commit hash; promote **F4.7.2 — Operations chart / drawer official-window pill** to **Next** (or, if profiling demand or product priorities point elsewhere, the **Reports PDF Fiscalización generation** phase as a parallel option). Follows the established hygiene-commit pattern.
2. **F4.7.2 — Operations chart / drawer official-window pill** (recommended natural next phase). Frontend-only consumer of the F4.7.1 adapter:
   - New hook (e.g. `useActiveWellTestForUnit`) wrapping TanStack Query over `adapterGetActiveWellTest`.
   - Three new primary pills on `<TrendDrawer>` and (if scope allows) the global `<LiveTrendsPanelLive>`: **Stabilization** (`stabilizationStartedAt..officialStartedAt`), **Official window** (`officialStartedAt..(officialEndedAt ?? now)`), **Full test** (`connectedAt..(disconnectedAt ?? now)`).
   - Generic `15m / 1h / 6h / 24h / 7d` pills retained as secondary diagnostics.
   - Per-unit tile chip overlay: `STABILIZING` / `MEASURING` / `TEST COMPLETED` once the active test is bound.
   - **No backend change.** **No Reports PDF.** **No alarm panel migration.**
3. **Then either the Reports PDF Fiscalización phase or `<LiveActiveAlarmsPanel>` cutover** (candidate F4.5G.4), depending on which dependent surface is the more pressing operator-visible win. Reports PDF must consume the official window only; the panel cutover must distinguish stabilization-phase from measurement-phase alarms.

Until F4.7.2 ships, the WellTest backend + adapter is **dormant from a UI perspective**: live and testable, but no Operations or Reports component consumes it.

---

*F4.7.1 closeout, authored at HEAD `b909a54` (Refresh master roadmap after F4.7-0). Backend 260 → 309 (+49), frontend 480 → 512 (+32). Lint / typecheck / build all green for both packages. Migration additive only; no live-DB integration in this phase.*
