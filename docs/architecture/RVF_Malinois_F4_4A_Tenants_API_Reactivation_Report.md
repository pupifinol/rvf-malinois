# RVF Malinois — F4.4A TenantsModule API Reactivation Report

> Phase **F4.4A — TenantsModule API Reactivation**.
> First module reactivated atop the F4 canonical Prisma client after the
> F4.2B quarantine. Single-module scope by design.
>
> References:
> - F4 architecture: `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md` (commit `f36923a`)
> - ADR-007: `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md` (commit `8147399`)
> - F4.2B strategy: `docs/architecture/RVF_Malinois_F4_2B_Insulation_Strategy_Confirmation.md` (commit `a8862e2`)
> - F4.2B implementation: `docs/architecture/RVF_Malinois_F4_2B_Prisma_Baseline_Migration_Report.md` (commit `e37f7b5`)
> - F4.3 seed: `docs/architecture/RVF_Malinois_F4_3_Seed_Reference_Data_Report.md` (commit `91e17aa`)

## 1. Summary

F4.4A is the first un-quarantining step of F4.4 (API adaptation). It rewrites `TenantsService` and `TenantsController` against the F4 canonical Prisma client, restores them to the Nest application bootstrap, removes `src/tenants/**` from the F4.2B quarantine excludes in `tsconfig.json`, `eslint.config.mjs`, and `vitest.config.ts`, and replaces the previously-deleted F1 live-DB spec with a focused mocked-Prisma vitest suite that runs cleanly inside `pnpm test` without a database.

The scope is intentionally minimal. Only `TenantsModule` is reactivated. The other five quarantined modules (`WellsModule`, `CanonicalTagsModule`, `EquipmentModule`, `JobsModule`, `TelemetryModule`) remain quarantined and untouched. No frontend, no schema, no migration, no seed, no authentication, no telemetry persistence, no other service rewrites.

The F4 schema drops two F1 affordances that the old controller relied on: the soft `code` identifier and the `kind` enum. The reactivated API therefore changes shape in those two narrow ways: `GET /api/v1/tenants/:id` (UUID) replaces `GET /api/v1/tenants/:code`, and the optional list filter changes from `?kind=` to `?status=`. The list endpoint surface, the `CallerContext` scoping seam, and the response shape are otherwise preserved. F4.5 (UI connection) will choose how to surface the new identifier path in the frontend.

All quality gates pass: `prisma validate`, `prisma generate`, backend and workspace-wide `lint` / `typecheck` / `build`, plus the backend `vitest` suite (7/7 tests including 6 new TenantsService tests). No commit was made.

## 2. Files Changed

| Path | Change |
|---|---|
| `apps/backend/src/tenants/tenants.service.ts` | **Rewritten** against F4 `Tenant`. Dropped `kind` filter and `findByCode`; added `status` filter and `findById`. Documented allowed `TENANT_STATUSES` mirror of the CHECK constraint. |
| `apps/backend/src/tenants/tenants.controller.ts` | **Rewritten.** `GET /:code` → `GET /:id` (with `ParseUUIDPipe`); `?kind=` → `?status=`. Swagger annotations updated; controller still uses `ZodValidationPipe` for the query schema and `SystemContext` for the read-only F1.5-prep scoping seam. |
| `apps/backend/src/tenants/tenants.service.spec.ts` | **New.** Mocked-Prisma vitest suite. 6 tests: 3 for `findAll` (no scope, status filter, ctx-scoped), 3 for `findById` (found, missing, out-of-scope). |
| `apps/backend/src/app.module.ts` | Added `TenantsModule` back to `imports`; replaced the F4.2B-quarantine-state header comment with an F4.4A-reactivation-state header that lists which modules are now live and which remain quarantined for which subsequent F4.4 sub-phase. |
| `apps/backend/tsconfig.json` | Removed `src/tenants/**` from `exclude`. The other five quarantined directories remain excluded. |
| `apps/backend/eslint.config.mjs` | Removed `src/tenants/**` from `ignores`. |
| `apps/backend/vitest.config.ts` | Removed `src/tenants/**` from `exclude`. |
| `docs/architecture/RVF_Malinois_F4_4A_Tenants_API_Reactivation_Report.md` | **New.** This document. |

No edits under `apps/web/`, `packages/`, `apps/backend/prisma/`, `apps/backend/src/wells|tags|equipment|jobs|telemetry/`, `docker-compose.yml`, `.github/`, or root `package.json` / `turbo.json`.

## 3. Tenants API Behavior Restored

### 3.1 Endpoint surface (F4.4A)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/tenants` | List all tenants (optionally filtered by `?status=active` / `?status=inactive`), ordered by `name` ascending. |
| `GET` | `/api/v1/tenants/:id` | Fetch a single tenant by its UUID primary key. `ParseUUIDPipe` enforces UUID format; non-UUID input returns `400 Bad Request`. Unknown UUID or out-of-scope UUID returns `404 Not Found`. |

Both endpoints are read-only, no auth required (F1 posture preserved — `SystemContext` is empty, so every tenant is visible). Tenant scoping via `CallerContext.tenantId` is plumbed but inert until F1.5/authentication arrives, identical to the F1 design.

### 3.2 Response shape

`Tenant` row as Prisma serializes it:

```json
{
  "id": "00000000-0000-0000-0000-000000000001",
  "name": "RVF Internal",
  "status": "active",
  "residencyHint": "local-dev",
  "createdAt": "2026-05-24T00:00:00.000Z",
  "updatedAt": "2026-05-24T00:00:00.000Z"
}
```

`tenant.findFirst` is not exposed. Create/update/delete are not exposed. F4.4A is strictly read-only, as the F1 implementation was.

### 3.3 Shape changes vs F1

| F1 | F4.4A | Why it changed |
|---|---|---|
| `GET /api/v1/tenants/:code` (string slug like `repsol`) | `GET /api/v1/tenants/:id` (UUID) | F4 schema dropped the soft `code` column; the only stable identifier is the UUID primary key. |
| `?kind=rvf_internal\|client` | `?status=active\|inactive` | F4 dropped the `kind` enum entirely; `status` is the closest F4-native filter. F4.5 may surface a presentation-layer concept of "internal vs client" later if the UI needs it, but the API does not. |
| `orderBy: { code: 'asc' }` | `orderBy: { name: 'asc' }` | `code` no longer exists; `name` is the canonical sortable text. |
| `TenantKind` enum imported as runtime value | `TENANT_STATUSES` string literal tuple exported from the service | F4 uses CHECK constraints, not Prisma enums (F4.2B Insulation Strategy §3.4). The tuple mirrors the CHECK literal list. |

These are the only behavioral deltas. F4.5 will decide how to expose them in the frontend.

## 4. Prisma Model Used

`Tenant` from the F4 client generated against `apps/backend/prisma/schema.prisma` (commit `e37f7b5`):

```prisma
model Tenant {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name          String
  status        String   @default("active")
  residencyHint String?  @map("residency_hint")
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  // ...back-relations to users, measurement_units, sensors, ..., audit_logs
}
```

The service uses `prisma.tenant.findMany({ where, orderBy })` and `prisma.tenant.findUnique({ where: { id } })`. No raw SQL, no `$queryRaw`, no transactions. The CHECK constraint on `tenants.status` lives in `apps/backend/prisma/migrations/20260524000000_f4_2_baseline/migration.sql` and is mirrored at the application layer by the `TENANT_STATUSES` tuple used to type the Zod query schema and the service filter.

## 5. Quarantine Changes

Removed `src/tenants/**` from three places:

| File | Before (F4.2B / F4.3 state) | After (F4.4A state) |
|---|---|---|
| `apps/backend/tsconfig.json` `exclude` | `src/{wells,tenants,tags,equipment,jobs,telemetry}/**` | `src/{wells,tags,equipment,jobs,telemetry}/**` |
| `apps/backend/eslint.config.mjs` `ignores` | `src/{wells,tenants,tags,equipment,jobs,telemetry}/**` | `src/{wells,tags,equipment,jobs,telemetry}/**` |
| `apps/backend/vitest.config.ts` `exclude` | `src/{wells,tenants,tags,equipment,jobs,telemetry}/**` | `src/{wells,tags,equipment,jobs,telemetry}/**` |

The remaining five entries continue to keep their respective modules out of compile / lint / test until F4.4B–F4.4F land them one by one.

In `apps/backend/src/app.module.ts`:

- `import { TenantsModule } from './tenants/tenants.module';` re-added.
- `TenantsModule` re-added to `imports`.
- Header comment rewritten to reflect the F4.4A reactivation state instead of the F4.2B quarantine state.

## 6. Tests Added / Updated

The F4.2B closeout (§3 / §5) documented that the F1 `tenants.service.spec.ts` had connected to a live Postgres instance via `new PrismaClient()`. That file had been deleted along with the F1 source tree's other DB-bound specs; no `tenants.service.spec.ts` existed when F4.4A started.

F4.4A adds a new spec at `apps/backend/src/tenants/tenants.service.spec.ts` that follows the repo's preferred mock-light pattern (cf. `src/health/health.controller.spec.ts`): direct instantiation of the service with a typed Prisma mock, no Nest test module, no live DB.

| Test | Verifies |
|---|---|
| `findAll: orders tenants by name and applies no scope when CallerContext is empty` | Default ordering is `name asc`; an empty `where` clause when neither `ctx.tenantId` nor `filter.status` is set. |
| `findAll: passes through the optional status filter` | `?status=inactive` is forwarded as `where: { status: 'inactive' }`. |
| `findAll: scopes the query to ctx.tenantId when one is provided` | `CallerContext.tenantId` adds `where: { id: ctx.tenantId }` in addition to any other filter, so the F1.5 scoping seam works the moment auth lands. |
| `findById: returns the tenant when found and the context is system-wide` | Happy path with empty context. |
| `findById: throws NotFoundException when Prisma returns null` | Unknown UUID surfaces a `404`. |
| `findById: throws NotFoundException when the row exists but is outside the caller scope` | A tenant that doesn't match `ctx.tenantId` is treated as "not found" for the caller — preserves the F1 information-hiding posture. |

Backend test run: 7/7 pass (1 pre-existing `health.controller.spec.ts` + 6 new tenants tests).

A controller-level spec is not added in F4.4A: with `ZodValidationPipe` and `ParseUUIDPipe` already covered by Nest's own end-to-end semantics and the validation library tests, a controller spec would mostly verify Nest's `@Get`/`@Param`/`@Query` wiring rather than business behavior. F4.4 will revisit when an integration test harness against a real DB is in place (likely after F4.4B or F4.4C).

## 7. Commands Run and Results

| Command | Result |
|---|---|
| `pnpm --filter @rvf/backend exec prisma validate` | `The schema at prisma/schema.prisma is valid 🚀` |
| `pnpm --filter @rvf/backend exec prisma generate` | Clean (Prisma Client 5.22.0) |
| `pnpm --filter @rvf/backend run lint` | clean exit (fixed 3 rounds of eslint feedback during authoring: `@typescript-eslint/unbound-method`, `@typescript-eslint/no-unsafe-call`, `@typescript-eslint/consistent-type-definitions`) |
| `pnpm --filter @rvf/backend run typecheck` | clean (chains `tsc` for `src/` + `tsc -p prisma/tsconfig.json` for the seed) |
| `pnpm --filter @rvf/backend run test` | `2 files / 7 tests passed (6 tenants + 1 health)` |
| `pnpm --filter @rvf/backend run build` | clean (`nest build`) |
| `pnpm run lint` (workspace) | 4/4 tasks successful |
| `pnpm run typecheck` (workspace) | 4/4 tasks successful |
| `pnpm run build` (workspace) | 2/2 tasks successful |

## 8. What Remains Out of Scope

- **Reactivation of any other quarantined module.** `WellsModule`, `CanonicalTagsModule`, `EquipmentModule`, `JobsModule`, `TelemetryModule` stay quarantined.
- **Tenant create / update / delete endpoints.** F1 did not expose them; F4.4A does not introduce them. If a future phase needs them, it will design the audit-log + role-check semantics first.
- **Real authentication.** `CallerContext` is plumbed but inert. `SystemContext` returns every tenant. F1.5 (or a later auth phase) replaces `SystemContext` with a derived caller.
- **Controller integration tests against a real DB.** Deferred until the F4 test-harness story lands.
- **Frontend wiring.** F4.5 owns the UI side: when (and how) the Units / Wells / Jobs screens start calling the live `/api/v1/tenants` endpoint instead of the F3 mock adapter.
- **Schema changes.** None made; none needed. The F4 `Tenant` model is sufficient for the F4.4A endpoints.
- **Seed changes.** None made; the F4.3 seed continues to populate one `RVF Internal` tenant which the reactivated `findAll` will return when called.
- **Migration changes.** None made.
- **`packages/types`** changes. The F4.4A response shape (`Tenant` row as serialized by Prisma) is consumed only by the OpenAPI/Swagger surface for now; if F4.5 needs a shared type, that change belongs to F4.4B / F4.5.

## 9. Risks / Limitations

1. **Identifier change from `:code` to `:id` is a breaking shape change vs F1.** F1's mock adapter and the frontend were the only consumers of the F1 API. The frontend currently reads from `lib/api-data/` (F3 mock), not the live backend, so no UI is broken today. F4.5 must update any frontend code that constructs tenant routes to use UUID. This is documented here so F4.5 doesn't rediscover it.
2. **`?kind=` → `?status=` filter rename** is the same kind of breaking shape change. Same mitigation — F4.5 will reconcile when it adopts the live endpoint.
3. **CHECK constraint not surfaced as a typed enum.** Sending a string outside `TENANT_STATUSES` is rejected at the controller layer by Zod, but the application-side mirror could drift from the DB CHECK if either side is edited in isolation. The mirror lives next to its usage in `tenants.service.ts` to make drift visible at code-review time.
4. **No controller-level spec.** See §6 — pragmatic deferral; not a blocking gap because Nest's pipe and routing behavior is well-covered by upstream tests.
5. **Mocked-Prisma test surface only.** A typo in a field name on the `Tenant` model that the seed depends on would still be caught by the typecheck and by the F4.3 seed runtime; a typo in a non-seeded path could survive until a real-DB integration test lands.
6. **No e2e run against a real DB.** Same posture as F4.3 (§6): the local Postgres volume still holds the F1 schema until a developer chooses to `docker compose down -v && prisma migrate dev`. The seed-then-API loop has not been exercised end-to-end on this host.

## 10. Acceptance Criteria — Status

| # | Criterion | Status |
|---|---|---|
| 1 | TenantsModule is active in `app.module.ts`. | **Met.** |
| 2 | TenantsModule compiles against F4 Prisma schema. | **Met.** Typecheck + build green. |
| 3 | TenantsModule removed from quarantine excludes. | **Met.** `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts` updated. |
| 4 | `lint` passes. | **Met.** Backend and workspace-wide. |
| 5 | `typecheck` passes. | **Met.** Backend (src + prisma) and workspace-wide. |
| 6 | `build` passes. | **Met.** Backend (`nest build`) and workspace-wide. |
| 7 | Backend tests pass or unrelated skipped/quarantined remain documented. | **Met.** 7/7 tests pass; remaining quarantined-module specs documented as still-skipped. |
| 8 | No frontend files changed. | **Met.** No edits under `apps/web/`. |
| 9 | No other quarantined modules reactivated. | **Met.** Wells / tags / equipment / jobs / telemetry remain quarantined. |
| 10 | No seed data added. | **Met.** F4.3 seed unchanged. |
| 11 | No telemetry implementation. | **Met.** No writes to `telemetry_readings`; no ingestion code. |
| 12 | F4.4A report created. | **Met.** This document. |
| 13 | No commit made. | **Met.** All changes are working-tree only. |

All acceptance criteria are met.

## 11. Next Phase Recommendation

**Recommend F4.4B — WellsModule API Reactivation** as the next phase.

Rationale:

- `WellsModule` is the next-simplest in the dependency graph. The F1 `wells.service.ts` was a thin reader of `prisma.well.findMany` / `findUnique` scoped by tenant — the F4 `Well` model preserves the same shape (with field renames `code/siteCode/wellType` → `name/fieldOrSite/type`). F4.4A's pattern (rewrite service + controller against new field names, restore module to bootstrap, drop directory from three excludes, add mocked-Prisma spec) maps directly.
- `WellsModule` reuses the same `CallerContext` seam, the same `ZodValidationPipe`, and the same response posture established in F4.4A — no new infrastructure required.
- The F4.3 seed already provisions `Reference Well A` against the `RVF Internal` tenant, so `GET /api/v1/wells` will return one row once F4.4B lands and the local DB is on the F4.2 baseline.

Suggested ordering for the remaining F4.4 sub-phases:

- **F4.4B** — `WellsModule` (lookup by UUID; optional `?tenantId=` filter once auth lands).
- **F4.4C** — `CanonicalTagsModule` (global read-only dictionary; smallest controller surface; pure read of the 22-entry seed).
- **F4.4D** — `EquipmentModule` (`equipment_types` + `measurement_units`; introduces the per-unit envelope read; the F4.3 seed populates 2 types and 2 units).
- **F4.4E** — `JobsModule` (joins well + unit + commissioning snapshot; the F4.3 seed provides one reference job + snapshot for HP-001).
- **F4.4F** — `TelemetryModule` (read paths only; full `telemetry_readings` write paths land in F4.6).

After F4.4F, the entire backend is back online on the F4 client and F4.5 (UI connection) can start phasing the frontend off the `lib/api-data/` mock adapter, one screen at a time.
