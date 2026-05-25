# RVF Malinois — F4.4E JobsModule API Reactivation Report

> Phase **F4.4E — JobsModule API Reactivation**.
> Fifth module reactivated atop the F4 canonical Prisma client. Same
> single-module posture as F4.4A → F4.4D.
>
> References:
> - F4 architecture: `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md` (commit `f36923a`)
> - ADR-007: `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md` (commit `8147399`)
> - F4.2B strategy: `docs/architecture/RVF_Malinois_F4_2B_Insulation_Strategy_Confirmation.md` (commit `a8862e2`)
> - F4.2B implementation: `docs/architecture/RVF_Malinois_F4_2B_Prisma_Baseline_Migration_Report.md` (commit `e37f7b5`)
> - F4.3 seed: `docs/architecture/RVF_Malinois_F4_3_Seed_Reference_Data_Report.md` (commit `91e17aa`)
> - F4.4A tenants: `docs/architecture/RVF_Malinois_F4_4A_Tenants_API_Reactivation_Report.md` (commit `2f5c108`)
> - F4.4B wells: `docs/architecture/RVF_Malinois_F4_4B_Wells_API_Reactivation_Report.md` (commit `20dadca`)
> - F4.4C canonical tags: `docs/architecture/RVF_Malinois_F4_4C_CanonicalTags_API_Reactivation_Report.md` (commit `0ec1099`)
> - F4.4D equipment: `docs/architecture/RVF_Malinois_F4_4D_Equipment_API_Reactivation_Report.md` (commit `3cdee45`)

## 1. Summary

F4.4E rewrites `JobsService` and `JobsController` against the F4 canonical schema, reduces `CommissioningService` to a read-only helper, restores `JobsModule` to the Nest application bootstrap, removes `src/jobs/**` from the F4.2B quarantine excludes in `tsconfig.json`, `eslint.config.mjs`, and `vitest.config.ts`, and replaces both previously-quarantined live-DB specs with mocked-Prisma vitest suites.

This reactivation is the largest of F4.4 so far. F4 changed the operation spine in three substantive ways: F1's job slug (`JOB-YYYY-NNNN`) and unique `code` column were dropped (UUID is now the only identifier); F1's `JobSensorSnapshot` rows were collapsed into JSONB inside `commissioning_snapshots.sensor_mappings`; and the commissioning write workflow (`createJobWithSnapshot`, `assertSnapshotMutable`, `assertJobMutable`) is no longer the responsibility of an application service — F4 enforces immutability via the `commissioning_snapshots.immutable = TRUE` CHECK constraint plus a future trigger / GRANT hardening pass. F4.4E therefore rewrites the entire JobsService surface, retires the F1 CommissioningService write surface, and replaces the live-DB specs that exercised both.

Scope mirrors prior F4.4 sub-phases: only `JobsModule` is reactivated. `TelemetryModule` remains quarantined. `TenantsModule`, `WellsModule`, `CanonicalTagsModule`, `EquipmentModule` continue to operate. No frontend, no schema, no migration, no seed, no auth, no telemetry, no alarm-event persistence, no commissioning write flow, no live readings, no reports.

All quality gates pass: `prisma validate`, `prisma generate`, backend + workspace-wide `lint` / `typecheck` / `build`, plus the backend `vitest` suite (**42/42 tests** including 7 new jobs tests and 4 new commissioning tests). No commit was made.

## 2. Files Changed

| Path | Change |
|---|---|
| `apps/backend/src/jobs/jobs.service.ts` | **Rewritten** against F4. New method set (`findAll`, `findById`); CHECK-constraint mirror `JOB_STATUSES` exported for the controller's Zod schema; new module-private `JOB_LIST_INCLUDE` and `JOB_DETAIL_INCLUDE` constants. |
| `apps/backend/src/jobs/jobs.controller.ts` | **Rewritten.** `:code` → `:id` (UUID, `ParseUUIDPipe`); F1 `?tenantCode=` removed; new F4-aligned filters `?tenantId=` / `?wellId=` / `?unitId=` / `?status=` (all Zod-validated). Swagger annotations updated. |
| `apps/backend/src/jobs/commissioning.service.ts` | **Reduced** from a write-owning service to two read-only helpers (`findById`, `findLatestByJobId`). The F1 `createJobWithSnapshot` / `assertSnapshotMutable` / `assertJobMutable` surface is retired — F4 enforces immutability at the DB layer + a future trigger / GRANT hardening pass; write flow returns behind a guarded audit-logging service in a later phase. Service stays registered in `JobsModule` for future read consumers (e.g. an `/api/v1/jobs/:jobId/snapshot` endpoint when F4.5 needs it). |
| `apps/backend/src/jobs/jobs.service.spec.ts` | **Rewritten** as a 7-test mocked-Prisma suite (default-empty filter; wellId/unitId/status passthrough; ctx-vs-manual-tenant precedence; happy path + 404 + out-of-scope hiding). Replaces the previously-quarantined F1 spec that connected to a real Postgres instance. |
| `apps/backend/src/jobs/commissioning.service.spec.ts` | **Rewritten** as a 4-test mocked-Prisma suite (`findById` happy + 404; `findLatestByJobId` happy + null). Replaces the previously-quarantined F1 spec that exercised the now-retired write workflow. |
| `apps/backend/src/app.module.ts` | Added `JobsModule` to `imports`; header rewritten to F4.4E reactivation state. |
| `apps/backend/tsconfig.json` | Removed `src/jobs/**` from `exclude`. |
| `apps/backend/eslint.config.mjs` | Removed `src/jobs/**` from `ignores`. |
| `apps/backend/vitest.config.ts` | Removed `src/jobs/**` from `exclude`. |
| `docs/architecture/RVF_Malinois_F4_4E_Jobs_API_Reactivation_Report.md` | **New.** This document. |

`jobs.module.ts` already wired `JobsController`, `JobsService`, and `CommissioningService` from the right paths and required no changes. No edits under `apps/web/`, `packages/`, `apps/backend/prisma/`, `apps/backend/src/telemetry/`, `docker-compose.yml`, `.github/`, or root config files.

## 3. Jobs API Behavior Restored

### 3.1 Endpoint surface (F4.4E)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/jobs` | List jobs. Optional filters: `tenantId` (UUID), `wellId` (UUID), `unitId` (UUID), `status` (`programmed` / `in_progress` / `closed`). Ordered by `startedAt desc nulls last` then `createdAt desc`. Each row carries a small `tenant` / `well` / `unit` summary. |
| `GET` | `/api/v1/jobs/:id` | Fetch one job by UUID with the full detail include (see §3.3). 400 on malformed UUID; 404 on missing or out-of-scope. |

### 3.2 Filter / scoping precedence

`CallerContext.tenantId` (server-derived) wins over any `?tenantId=` query parameter — same posture as F4.4B / F4.4D. `SystemContext` (empty) preserves the F1 read posture: every tenant is visible until authentication lands.

### 3.3 List vs detail include

**List include** (compact, small rows):

```ts
{
  tenant: { select: { id, name, status } },
  well: { select: { id, name, fieldOrSite } },
  unit: { select: { id, code, name } },
}
```

**Detail include** (full operation spine for one job):

```ts
{
  tenant: { select: { id, name, status } },
  well: {
    select: { id, name, fieldOrSite, location, type, fluid, designLimits },
  },
  unit: {
    select: {
      id, code, name, serialNumber, status, operatingProfile, location,
      equipmentType: { select: { id, name, pidReference } },
    },
  },
  engineer: { select: { id, displayName, role } },
  commissioningSnapshot: true,   // the row pointed at by jobs.commissioning_snapshot_id
}
```

`commissioningSnapshot` follows Prisma's `JobCurrentSnapshot` named relation, which targets the F4 schema's `jobs.commissioning_snapshot_id` FK. The detail therefore exposes the immutable JSONB of the **current** snapshot directly: `effectiveThresholds`, `sensorMappings`, `engineeringEnvelope`, `ruleVersions`. F1's `JobSensorSnapshot[]` is no longer a separate table; its contents are now `sensor_mappings`'s JSONB.

Intentionally **not** included: `telemetry_readings`, `alarm_events`, `alarm_rules` (those live under `MeasurementUnit` per F4.4D's detail include and are read via the equipment endpoint), additional historical commissioning snapshots, `integration_mappings`. F4.4F (telemetry reads) and F4.6 (telemetry persistence) own those reads.

### 3.4 Ordering

`[{ startedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }]`. Most-recently-started jobs first; `status='programmed'` jobs (which typically have `started_at IS NULL`) fall to the bottom of the started-jobs band; `createdAt desc` is the deterministic tiebreaker. Uses Prisma 5's nullable-field nulls-position syntax — no raw SQL needed.

## 4. Prisma Models Used

| Model | Where |
|---|---|
| `Job` | direct (`prisma.job.findMany / findUnique`) |
| `Tenant` | indirect via include scalar select |
| `Well` | indirect via include scalar select |
| `MeasurementUnit` | indirect via include scalar select |
| `EquipmentType` | nested inside the unit include |
| `User` | indirect via the `engineer` include scalar select |
| `CommissioningSnapshot` | indirect via the current-snapshot include + direct (`prisma.commissioningSnapshot.findUnique / findFirst`) in CommissioningService |

No raw SQL, no transactions, no write paths.

## 5. Field Mapping F1/F1.5 → F4

### 5.1 Model + table changes

| F1 | F4 | Notes |
|---|---|---|
| `EquipmentUnit` | `MeasurementUnit` | Already noted in F4.4D; the Job FK now points at `measurement_units(id)`. |
| `Job.equipmentUnit` (relation) | `Job.unit` (relation) | Prisma relation name follows the model rename. |
| `JobSensorSnapshot` (normalized rows) | (removed) | F4 collapses into JSONB inside `commissioning_snapshots.sensor_mappings`. The reactivated detail include exposes that JSONB directly. |
| `Job.snapshot` (1:1) | `Job.commissioningSnapshot` (FK via `JobCurrentSnapshot` named relation) | F4 lets a job carry many historical snapshots via the `CommissioningSnapshotJob` back-relation, with the "current" one selected by `jobs.commissioning_snapshot_id`. |

### 5.2 Field renames / removals

| F1 column | F4 equivalent | Why it changed |
|---|---|---|
| `jobs.code` (slug, `JOB-YYYY-NNNN`) | (removed) | F4 dropped soft codes. UUID is the only stable identifier. |
| `jobs.notes` | (removed) | Free-text notes are not part of the F4 operation spine. F4 routes operational metadata through `audit_logs` (action + before/after JSONB). |
| `jobs.engineerUserId` | `jobs.engineerId` | Renamed for consistency with F4's `*_id` UUID FK convention. |
| `jobs.status` enum (F1: `scheduled` / `in_progress` / `closed`) | `jobs.status` CHECK (`programmed` / `in_progress` / `closed`) | One value renamed (`scheduled` → `programmed`); CHECK constraint instead of Postgres enum. Mirror tuple `JOB_STATUSES` lives in `jobs.service.ts`. |
| `jobs.snapshot.frozenAt` | `commissioning_snapshots.takenAt` | Renamed; same semantic (when the photo was taken). |
| `jobs.snapshot.commissionedById` | (removed from snapshot table) | F4 routes "who commissioned" through `audit_logs` rather than a dedicated FK column. |
| (n/a) | `commissioning_snapshots.effectiveThresholds` / `sensorMappings` / `engineeringEnvelope` / `ruleVersions` (JSONB) | New: the F4 snapshot freezes everything as JSONB. The reactivated detail include exposes these directly. |
| (n/a) | `commissioning_snapshots.immutable` (BOOLEAN, CHECK `(immutable = TRUE)`) | New: DB-level immutability marker (ADR-005). |

### 5.3 Endpoint surface

| F1 | F4.4E | Why |
|---|---|---|
| `GET /jobs` with `?tenantCode=` / `?status=` | `GET /jobs` with `?tenantId=` / `?wellId=` / `?unitId=` / `?status=` | F4 dropped the tenant `code` slug (F4.4A); the F4-aligned filters surface every F4 UUID FK on the row. |
| `GET /jobs/:code` (`JOB-2026-0001`) | `GET /jobs/:id` (UUID) | F4 has no `code` column; UUID is the only identifier. |
| Detail include: `tenant.code/name + well.code/name + equipmentUnit.code + snapshot.sensorSnapshots` | Detail include: see §3.3 | F4 select shape uses `id/name`-based scalars on `tenant` / `well` (no `code`); the per-sensor normalized rows are replaced by `commissioningSnapshot`'s JSONB. |

## 6. Treatment of `commissioning.service.ts`

The F1 service owned the entire "freeze the photo" workflow:

1. `createJobWithSnapshot(input)` — atomically created `Job + CommissioningSnapshot + JobSensorSnapshot[]` rows in a single Prisma transaction, copying `Sensor.canonicalTagName / unit / unitClass / rangeLow / rangeHigh / serialNumber` into each normalized snapshot row.
2. `assertSnapshotMutable(jobId)` — service-layer guard that refused writes if the job's snapshot had been frozen.
3. `assertJobMutable(jobId)` — service-layer guard that refused writes if the job was closed.

Every one of those methods depended on F1 concepts removed in F4:
- `prisma.equipmentUnit` (renamed to `prisma.measurementUnit`),
- `prisma.jobSensorSnapshot` (entire model removed),
- `Sensor.canonicalTagName` (replaced by `sensor_tag_bindings`),
- `CanonicalTag.unit` / `unitClass` (renamed to `canonical_unit` / `category`),
- `CommissioningSnapshot.frozenAt` (renamed to `takenAt`),
- `JobStatus.in_progress` (runtime enum value — F4 has no Prisma enum here).

Per the F4.4E spec, the service is **kept** (not deleted) but **reduced** to two read-only helpers:

```ts
async findById(id: string): Promise<CommissioningSnapshot>          // 404 on miss
findLatestByJobId(jobId: string): Promise<CommissioningSnapshot | null>
```

Both are consumed today only indirectly (via `JobsService.findById`'s `include: { commissioningSnapshot: true }`). No new routes are wired in F4.4E. F4.5 may expose an `/api/v1/jobs/:jobId/snapshot` endpoint if the UI's commissioning view needs it; that decision is outside F4.4E scope.

The retired write surface returns behind a guarded audit-logging service in a later phase. The contract for that phase is documented inline at the top of `commissioning.service.ts`.

## 7. Quarantine Changes

Removed `src/jobs/**` from three places:

| File | Before (F4.4D state) | After (F4.4E state) |
|---|---|---|
| `apps/backend/tsconfig.json` `exclude` | `src/{jobs,telemetry}/**` | `src/telemetry/**` |
| `apps/backend/eslint.config.mjs` `ignores` | `src/{jobs,telemetry}/**` | `src/telemetry/**` |
| `apps/backend/vitest.config.ts` `exclude` | `src/{jobs,telemetry}/**` | `src/telemetry/**` |

One module still quarantined: `TelemetryModule`.

In `apps/backend/src/app.module.ts`:

- `import { JobsModule } from './jobs/jobs.module';` added.
- `JobsModule` appended to `imports` (after `EquipmentModule`).
- Header rewritten to F4.4E reactivation state.

## 8. Tests Added / Updated

The two F1 specs both connected to a real Postgres instance (`new PrismaClient()`) and exercised the seed; F4.4E replaces both with focused mocked-Prisma vitest suites following the F4.4A–D pattern.

### 8.1 `jobs.service.spec.ts` (7 tests)

| Test | Verifies |
|---|---|
| `findAll: lists every job with no scope when CallerContext is empty and no manual filter is supplied` | Empty `where`, list include shape (`tenant/well/unit` scalar selects), ordering `[{ startedAt: 'desc' nulls 'last' }, { createdAt: 'desc' }]`. |
| `findAll: passes through wellId / unitId / status filters` | Filter passthrough at the right `where` keys. |
| `findAll: uses ctx.tenantId when set and ignores the manual tenantId filter` | Server-derived scope wins. |
| `findAll: falls back to the manual tenantId filter when no ctx scope is present` | Manual filter honored when CallerContext is empty. |
| `findById: returns the job with detail include when found and the context is system-wide` | Happy path + shape-asserts the detail include (`tenant`, `well` with `designLimits`, `unit` with nested `equipmentType`, `engineer`, `commissioningSnapshot: true`). |
| `findById: throws NotFoundException when Prisma returns null` | Unknown UUID → 404. |
| `findById: throws NotFoundException when the job exists but belongs to a different tenant scope` | Out-of-scope hiding posture preserved. |

### 8.2 `commissioning.service.spec.ts` (4 tests)

| Test | Verifies |
|---|---|
| `findById: returns the snapshot when the UUID is known` | Happy path; `{ where: { id } }` shape. |
| `findById: throws NotFoundException when Prisma returns null` | Unknown UUID → 404. |
| `findLatestByJobId: returns the most recently taken snapshot for the given job, or null` | `{ where: { jobId }, orderBy: { takenAt: 'desc' } }` shape; happy path. |
| `findLatestByJobId: returns null when no snapshot exists for the job` | Null pass-through (not an exception). |

Backend test run: **42/42 pass** (1 health + 6 tenants + 7 wells + 7 canonical-tags + 10 equipment + 7 jobs + 4 commissioning). No DB connection required.

No controller-level spec — same rationale as the prior reactivations.

## 9. Commands Run and Results

| Command | Result |
|---|---|
| `pnpm --filter @rvf/backend exec prisma validate` | `The schema at prisma/schema.prisma is valid 🚀` |
| `pnpm --filter @rvf/backend exec prisma generate` | Clean (Prisma Client 5.22.0) |
| `pnpm --filter @rvf/backend run lint` | clean exit |
| `pnpm --filter @rvf/backend run typecheck` | clean (`tsc` for src + `tsc -p prisma/tsconfig.json`) |
| `pnpm --filter @rvf/backend run test` | `7 files / 42 tests passed (1 health + 6 tenants + 7 wells + 7 canonical-tags + 10 equipment + 7 jobs + 4 commissioning)` |
| `pnpm --filter @rvf/backend run build` | clean (`nest build`) |
| `pnpm run lint` (workspace) | 4/4 tasks successful |
| `pnpm run typecheck` (workspace) | 4/4 tasks successful |
| `pnpm run build` (workspace) | 2/2 tasks successful |

## 10. What Remains Out of Scope

- **Reactivation of any other quarantined module.** `TelemetryModule` stays quarantined.
- **Write paths.** No create job, no close job, no update job, no commissioning workflow writes. F1's `CommissioningService` write surface is retired; rewriting it behind a guarded audit-logging service is a later phase.
- **`/api/v1/jobs/:jobId/snapshot` endpoint.** Not exposed. The current snapshot is already available via the detail include; a dedicated endpoint is a F4.5 decision.
- **Historical snapshots list.** `Job.commissioningSnapshots` (the back-relation array) is not included. Only the current snapshot via `jobs.commissioning_snapshot_id` is exposed.
- **Telemetry readings, live readings, alarm events, alarm rules, reports.** Out of scope.
- **`packages/types` exports for `Job` / `CommissioningSnapshot`.** Not added; F4.5 will surface shared types when the frontend starts consuming the live endpoint.
- **Real authentication.** `CallerContext` is plumbed but inert.
- **Controller integration tests against a real DB.** Deferred.
- **Schema or migration changes.** None made; none needed.

## 11. Risks / Limitations

1. **Breaking shape changes vs F1 (intentional):** `:code` → `:id` (UUID); `?tenantCode=` → `?tenantId=` (UUID); detail include reshaped (`snapshot.sensorSnapshots[]` replaced by `commissioningSnapshot.sensorMappings` JSONB; `equipmentUnit` relation → `unit`). Frontend currently uses the F3 mock adapter, so nothing live breaks; F4.5 must reconcile.
2. **`jobs.notes` dropped without replacement.** F1 stored free-text notes on the job row; F4 routes operational metadata through `audit_logs`. Any F1 consumer relying on `job.notes` must adapt. The F4.3 seed never populated `notes`.
3. **`engineerId` is exposed as a plain UUID in `Job` rows.** The detail include hydrates it via the `engineer` relation (`{ id, displayName, role }`); the list include does not (kept compact). F4.5 may decide to hydrate at the list layer too if the UI needs it.
4. **`commissioning_snapshots.immutable = TRUE` is enforced by CHECK only.** SQL alone cannot prevent UPDATE/DELETE without triggers or REVOKE. The contract is documented; trigger / GRANT hardening is a later phase.
5. **Reduced `CommissioningService` is a tiny read helper.** It is currently consumed only indirectly via `JobsService`'s `include`; the standalone helpers (`findById`, `findLatestByJobId`) exist so F4.5 has a stable seam, but they have no live route today. Reviewers should be aware that the service is intentionally low-traffic until F4.5 / F4.6 wire consumers.
6. **Ordering `startedAt desc nulls last` uses Prisma 5's nullable-field nulls-position syntax.** Older Prisma versions did not support this. Repo is on `@prisma/client@5.22.0` (per `apps/backend/package.json`), which does. Documented as a min-version dependency.
7. **No real-DB e2e.** Same posture as prior reactivations.

## 12. Acceptance Criteria — Status

| # | Criterion | Status |
|---|---|---|
| 1 | JobsModule is active in `app.module.ts`. | **Met.** |
| 2 | JobsModule compiles against F4 Prisma schema. | **Met.** Typecheck + build green. |
| 3 | JobsModule removed from quarantine excludes. | **Met.** |
| 4 | TenantsModule remains active. | **Met.** |
| 5 | WellsModule remains active. | **Met.** |
| 6 | CanonicalTagsModule remains active. | **Met.** |
| 7 | EquipmentModule remains active. | **Met.** |
| 8 | No other quarantined modules reactivated. | **Met.** Telemetry remains quarantined. |
| 9 | Jobs API is read-only. | **Met.** No create / update / delete. |
| 10 | Job reads aligned with F4 canonical model. | **Met.** §3–§5. |
| 11 | Job detail does not query telemetry / live readings. | **Met.** Detail include explicitly excludes those. |
| 12 | CommissioningSnapshot treated as immutable read model. | **Met.** Service reduced to two read-only helpers; write surface retired. |
| 13 | `lint` passes. | **Met.** Backend + workspace. |
| 14 | `typecheck` passes. | **Met.** Backend (src + prisma) + workspace. |
| 15 | `build` passes. | **Met.** Backend (`nest build`) + workspace. |
| 16 | Backend tests pass / quarantined documented. | **Met.** 42/42 pass. |
| 17 | No frontend files changed. | **Met.** |
| 18 | No Prisma schema / migration changes. | **Met.** |
| 19 | No seed data added. | **Met.** |
| 20 | No telemetry implementation. | **Met.** |
| 21 | F4.4E report created. | **Met.** This document. |
| 22 | No commit made. | **Met.** |

All acceptance criteria are met.

## 13. Next Phase Recommendation

**Recommend F4.4F — TelemetryModule API Reactivation** as the next phase.

Rationale:

- `TelemetryModule` is the last quarantined module. After F4.4F lands, the backend is fully back online on the F4 client and `app.module.ts` no longer mentions any quarantine.
- F4.4F is the heaviest of the F4.4 sub-phases because the F1 module contained: a `TelemetryController` (placeholder routes), a `TelemetryValidator` (Zod-only, no DB), a `UnitConverter` (pure math), a `CanonicalTagResolver` (depends on `jobSensorSnapshot` and `equipmentUnit`), a `TrendsService` (depends on the hypertable `telemetry`), and three contracts under `src/telemetry/contracts/` (`envelope.ts`, `trends.ts`, `ingestion-adapter.ts`, all importing F1 enums). The pure-math and Zod-only files (`unit-converter.ts`, `telemetry.validator.ts`, their specs) are F4-clean and can ship as-is.
- The F4.4F **scope** should be read-only: `GET /api/v1/telemetry/trends` against `telemetry_readings` plus a small canonical-tag-resolver that uses `sensor_tag_bindings` (the F4 replacement for F1's `JobSensorSnapshot` + `canonicalTagName` lookup). All **write/ingestion** paths (`TelemetryReceiver`, `IngestionAdapter`, MQTT/Node-RED/ThingsBoard integration) land in F4.6.
- The F4.3 seed does **not** populate `telemetry_readings`. F4.4F's read endpoints will return empty arrays on the F4.2 baseline; F4.6 then makes them meaningful.
- After F4.4F, F4.5 (UI connection) can start phasing the frontend off the `lib/api-data/` mock adapter, one screen at a time.

The F4.4F PR should additionally remove the last entry from each of `tsconfig.json` / `eslint.config.mjs` / `vitest.config.ts` so all six F1 directories are fully back in the compile / lint / test surface.
