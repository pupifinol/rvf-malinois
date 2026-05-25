# RVF Malinois — F4.4B WellsModule API Reactivation Report

> Phase **F4.4B — WellsModule API Reactivation**.
> Second module reactivated atop the F4 canonical Prisma client. Same
> single-module scope and posture as F4.4A.
>
> References:
> - F4 architecture: `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md` (commit `f36923a`)
> - ADR-007: `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md` (commit `8147399`)
> - F4.2B strategy: `docs/architecture/RVF_Malinois_F4_2B_Insulation_Strategy_Confirmation.md` (commit `a8862e2`)
> - F4.2B implementation: `docs/architecture/RVF_Malinois_F4_2B_Prisma_Baseline_Migration_Report.md` (commit `e37f7b5`)
> - F4.3 seed: `docs/architecture/RVF_Malinois_F4_3_Seed_Reference_Data_Report.md` (commit `91e17aa`)
> - F4.4A tenants: `docs/architecture/RVF_Malinois_F4_4A_Tenants_API_Reactivation_Report.md` (commit `2f5c108`)

## 1. Summary

F4.4B rewrites `WellsService` and `WellsController` against the F4 canonical `Well` model, restores them to the Nest application bootstrap, removes `src/wells/**` from the F4.2B quarantine excludes in `tsconfig.json`, `eslint.config.mjs`, and `vitest.config.ts`, and adds a focused mocked-Prisma vitest suite that runs cleanly inside `pnpm test` without a database.

The scope mirrors F4.4A: only `WellsModule` is reactivated. `CanonicalTagsModule`, `EquipmentModule`, `JobsModule`, and `TelemetryModule` remain quarantined and untouched. `TenantsModule` (reactivated in F4.4A) continues to operate. No frontend, no schema, no migration, no seed, no authentication, no telemetry persistence, no other service rewrites.

The F4 `wells` table dropped F1's `code`, `siteCode`, and `wellType` columns, replaced the soft-coded `(tenant_id, code)` compound identifier with UUIDs, and renamed `siteCode`/`wellType` to `fieldOrSite`/`type`. The reactivated API therefore changes shape: `GET /api/v1/wells/:id` (UUID) replaces `GET /api/v1/wells/:tenantCode/:code`, and the list filter changes from `?tenantCode=` to optional `?tenantId=` (UUID) plus three new F4-aligned filters `?fieldOrSite=`, `?type=`, `?fluid=`. The `CallerContext.tenantId` scoping seam is preserved verbatim.

All quality gates pass: `prisma validate`, `prisma generate`, backend + workspace-wide `lint` / `typecheck` / `build`, plus the backend `vitest` suite (14/14 tests including 7 new wells tests). No commit was made.

## 2. Files Changed

| Path | Change |
|---|---|
| `apps/backend/src/wells/wells.service.ts` | **Rewritten** against F4 `Well`. Dropped `findByCode` and the tenant-code-resolution helper; added `findById` (UUID) and four F4-aligned optional filters. The `tenant` include now selects `{ id, name, status }` (F4 Tenant scalar fields — F1's `code` no longer exists). |
| `apps/backend/src/wells/wells.controller.ts` | **Rewritten.** `GET /:tenantCode/:code` → `GET /:id` (UUID via `ParseUUIDPipe`); `?tenantCode=` → `?tenantId=` (UUID); new `?fieldOrSite=`, `?type=`, `?fluid=` filters. Zod schema and Swagger updated. |
| `apps/backend/src/wells/wells.service.spec.ts` | **New.** 7 mocked-Prisma vitest tests covering both methods, filter passthrough, the ctx-vs-manual-tenant precedence, and out-of-scope hiding. |
| `apps/backend/src/app.module.ts` | Added `WellsModule` to `imports`; header rewritten to F4.4B reactivation state. |
| `apps/backend/tsconfig.json` | Removed `src/wells/**` from `exclude`. |
| `apps/backend/eslint.config.mjs` | Removed `src/wells/**` from `ignores`. |
| `apps/backend/vitest.config.ts` | Removed `src/wells/**` from `exclude`. |
| `docs/architecture/RVF_Malinois_F4_4B_Wells_API_Reactivation_Report.md` | **New.** This document. |

No edits under `apps/web/`, `packages/`, `apps/backend/prisma/`, `apps/backend/src/{tags,equipment,jobs,telemetry}/`, `docker-compose.yml`, `.github/`, or root config files. `wells.module.ts` was already a thin shell over `controllers: [WellsController]` + `providers: [WellsService]` and required no changes.

## 3. Wells API Behavior Restored

### 3.1 Endpoint surface (F4.4B)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/wells` | List wells visible to the caller. Optional filters: `tenantId` (UUID), `fieldOrSite`, `type`, `fluid`. Ordered by `(tenantId asc, name asc)`. Each row is returned with a nested `tenant: { id, name, status }`. |
| `GET` | `/api/v1/wells/:id` | Fetch a single well by UUID. `ParseUUIDPipe` enforces UUID format; non-UUID returns `400`. Unknown or out-of-scope UUID returns `404`. Response includes the same nested `tenant`. |

### 3.2 Response shape

`Well` row + tenant scalar as Prisma serializes it:

```json
{
  "id": "00000000-0000-0000-0000-000000004401",
  "tenantId": "00000000-0000-0000-0000-000000000001",
  "clientId": null,
  "name": "Reference Well A",
  "fieldOrSite": "Reference Field",
  "location": "Local Dev",
  "type": "test",
  "fluid": "multiphase",
  "designLimits": { "...": "..." },
  "createdAt": "2026-05-24T00:00:00.000Z",
  "updatedAt": "2026-05-24T00:00:00.000Z",
  "tenant": { "id": "00000000-0000-0000-0000-000000000001", "name": "RVF Internal", "status": "active" }
}
```

Create / update / delete are not exposed. F4.4B is strictly read-only, as the F1 implementation was.

### 3.3 Filter / scoping precedence

- `CallerContext.tenantId` wins. When the server derives a tenant scope (post-auth), the `?tenantId=` query parameter is ignored and the scope is enforced.
- With the current empty `SystemContext` and no `?tenantId=` query parameter, every well is returned.
- `?fieldOrSite=`, `?type=`, `?fluid=` are equality filters layered on top of whatever tenant scope is active.

## 4. Prisma Model Used

`Well` from the F4 client generated against `apps/backend/prisma/schema.prisma` (commit `e37f7b5`):

```prisma
model Well {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String   @map("tenant_id") @db.Uuid
  clientId      String?  @map("client_id") @db.Uuid
  name          String
  fieldOrSite   String?  @map("field_or_site")
  location      String?
  type          String?
  fluid         String?
  designLimits  Json?    @map("design_limits")
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  jobs   Job[]
  @@index([tenantId], map: "wells_tenant_idx")
  @@map("wells")
}
```

The service uses `prisma.well.findMany({ where, include, orderBy })` and `prisma.well.findUnique({ where: { id }, include })`. No raw SQL, no transactions.

## 5. Field Mapping F1 → F4

| F1 column / parameter | F4 equivalent | Why it changed |
|---|---|---|
| `wells.code` (per-tenant slug, e.g. `CN-014`) | (removed) | F4 dropped the soft `code` identifier. UUID `id` is the only stable identifier. |
| `wells.site_code` | `wells.field_or_site` | F4 generalises "site" to "field or site". |
| `wells.well_type` | `wells.type` | F4 simplifies the column name. |
| `wells.design_limits` | `wells.design_limits` | Unchanged. |
| `wells.fluid` | `wells.fluid` | Unchanged. |
| `wells.name` | `wells.name` | Unchanged. |
| `(tenant_id, code)` compound unique | UUID primary key | Identification path simplifies; `code` no longer exists. |
| `GET /:tenantCode/:code` | `GET /:id` (UUID) | UUIDs are the only stable identifier. |
| `?tenantCode=` (string slug) | `?tenantId=` (UUID) | F4 Tenant dropped the `code` slug too — see F4.4A. |
| `include: { tenant: { select: { code, name } } }` | `include: { tenant: { select: { id, name, status } } }` | F4 Tenant has `id`/`name`/`status`/`residencyHint`, no `code`/`kind`. |
| `orderBy: [{ tenantId }, { code }]` | `orderBy: [{ tenantId }, { name }]` | `code` no longer exists; `name` is the canonical sortable text. |

F4.5 (UI connection) must reconcile any frontend code that constructed well routes using `:tenantCode/:code` paths. The F3 mock adapter is the only consumer today, so no live UI breaks.

## 6. Quarantine Changes

Removed `src/wells/**` from three places:

| File | Before (F4.4A state) | After (F4.4B state) |
|---|---|---|
| `apps/backend/tsconfig.json` `exclude` | `src/{wells,tags,equipment,jobs,telemetry}/**` | `src/{tags,equipment,jobs,telemetry}/**` |
| `apps/backend/eslint.config.mjs` `ignores` | `src/{wells,tags,equipment,jobs,telemetry}/**` | `src/{tags,equipment,jobs,telemetry}/**` |
| `apps/backend/vitest.config.ts` `exclude` | `src/{wells,tags,equipment,jobs,telemetry}/**` | `src/{tags,equipment,jobs,telemetry}/**` |

The remaining four entries continue to keep their respective modules out of compile / lint / test until F4.4C–F4.4F land them.

In `apps/backend/src/app.module.ts`:

- `import { WellsModule } from './wells/wells.module';` added.
- `WellsModule` appended to `imports` (after `TenantsModule`).
- Header comment rewritten to reflect the F4.4B reactivation state.

## 7. Tests Added / Updated

The F1 `wells.service.spec.ts` had been deleted with the F4.2B quarantine cleanup; F4.4B introduces a fresh mocked-Prisma spec that follows the F4.4A pattern (`tenants.service.spec.ts`).

| Test | Verifies |
|---|---|
| `findAll: lists every well with no scope when CallerContext is empty and no manual filter is supplied` | Default query: empty `where`, `tenant` include with F4 scalar fields, `orderBy: [{ tenantId: 'asc' }, { name: 'asc' }]`. |
| `findAll: passes through fieldOrSite / type / fluid filters` | The three F4-aligned filters layer onto `where`. |
| `findAll: uses ctx.tenantId when set and ignores the manual tenantId filter` | Server-derived scope wins over the manual query parameter (security posture). |
| `findAll: falls back to the manual tenantId filter when no ctx scope is present` | Manual filter is honored only when CallerContext provides no scope (F1-equivalent behavior post-rename). |
| `findById: returns the well + tenant when found and the context is system-wide` | Happy path with empty context; `tenant` is included with F4 scalar fields. |
| `findById: throws NotFoundException when Prisma returns null` | Unknown UUID surfaces a `404`. |
| `findById: throws NotFoundException when the well exists but belongs to a different tenant scope` | Out-of-scope row is hidden from a scoped caller — same information-hiding posture as F4.4A's tenants spec. |

Backend test run: 14/14 pass (1 health + 6 tenants + 7 wells). No DB connection required.

A controller-level spec is not added in F4.4B for the same reason as F4.4A: the controller is a thin Nest binding (`@Get`, `@Param`, `@Query`, `ParseUUIDPipe`, `ZodValidationPipe`) whose behavior is well-covered by upstream tests. A real-DB integration suite is deferred.

## 8. Commands Run and Results

| Command | Result |
|---|---|
| `pnpm --filter @rvf/backend exec prisma validate` | `The schema at prisma/schema.prisma is valid 🚀` |
| `pnpm --filter @rvf/backend exec prisma generate` | Clean (Prisma Client 5.22.0) |
| `pnpm --filter @rvf/backend run lint` | clean exit |
| `pnpm --filter @rvf/backend run typecheck` | clean (fixed one error during authoring: `ApiQueryOptions` does not accept a `format` property — replaced with `description: 'UUID'`). |
| `pnpm --filter @rvf/backend run test` | `3 files / 14 tests passed (1 health + 6 tenants + 7 wells)` |
| `pnpm --filter @rvf/backend run build` | clean (`nest build`) |
| `pnpm run lint` (workspace) | 4/4 tasks successful |
| `pnpm run typecheck` (workspace) | 4/4 tasks successful |
| `pnpm run build` (workspace) | 2/2 tasks successful |

## 9. What Remains Out of Scope

- **Reactivation of any other quarantined module.** `CanonicalTagsModule`, `EquipmentModule`, `JobsModule`, `TelemetryModule` stay quarantined.
- **Well create / update / delete endpoints.** F1 did not expose them; F4.4B does not introduce them.
- **`packages/types` exports for `Well`.** The F4.4B response shape is consumed only by Swagger today; a shared TypeScript type for the frontend belongs to F4.5 (or whichever phase first needs it).
- **`clientId` semantics.** F4 introduced a nullable `clientId` UUID column "reserved for future use when client identity is separated from tenant" (F4.1 SQL comment). The reactivated API surfaces the column verbatim but does not interpret it.
- **Indexes on the new filters.** `fieldOrSite`, `type`, `fluid` are equality-filtered without supporting indexes. For the F4.3 seed-sized dataset this is irrelevant; production-scale tuning lands when needed.
- **Real authentication.** `CallerContext` is plumbed but inert.
- **Controller integration tests against a real DB.** Deferred until the F4 test-harness story lands.
- **Schema or migration changes.** None made; none needed.

## 10. Risks / Limitations

1. **Identifier change from `:tenantCode/:code` to `:id`** is a breaking shape change vs F1. The frontend currently uses the F3 mock adapter, so nothing breaks now; F4.5 must reconcile.
2. **`?tenantCode=` → `?tenantId=` filter rename** is the same kind of breaking change. Same mitigation.
3. **`tenant` include shape changed** (`{code, name}` → `{id, name, status}`). Any future consumer relying on the F1 `tenant.code` field will need updating; F4.5 will surface this when the UI starts consuming the live endpoint.
4. **No real-DB e2e** for the same reason as F4.3 / F4.4A: the local Postgres volume still holds the F1 schema until a developer chooses to `docker compose down -v && prisma migrate dev`. Mocked-Prisma unit tests cover the F4 query shape.
5. **`@nestjs/swagger`'s `ApiQueryOptions` doesn't accept `format`.** Caught at typecheck during authoring. The OpenAPI document does not advertise the `tenantId` parameter as a `uuid` format string in the schema (only in the Zod schema's runtime validation). If the OpenAPI document is ever used to generate clients, that detail must be surfaced via `@ApiQuery({ schema: { type: 'string', format: 'uuid' } })` — out of scope for F4.4B.
6. **Mocked-Prisma test surface only.** Same posture as F4.4A; typo-in-field-name remains caught by typecheck (Prisma generates strongly-typed accessors).

## 11. Acceptance Criteria — Status

| # | Criterion | Status |
|---|---|---|
| 1 | WellsModule is active in `app.module.ts`. | **Met.** |
| 2 | WellsModule compiles against F4 Prisma schema. | **Met.** Typecheck + build green. |
| 3 | WellsModule removed from quarantine excludes. | **Met.** `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts` updated. |
| 4 | TenantsModule remains active. | **Met.** F4.4A reactivation preserved. |
| 5 | No other quarantined modules reactivated. | **Met.** Tags, equipment, jobs, telemetry remain quarantined. |
| 6 | `lint` passes. | **Met.** Backend + workspace. |
| 7 | `typecheck` passes. | **Met.** Backend (src + prisma) + workspace. |
| 8 | `build` passes. | **Met.** Backend (`nest build`) + workspace. |
| 9 | Backend tests pass or unrelated skipped/quarantined documented. | **Met.** 14/14 pass. |
| 10 | No frontend files changed. | **Met.** |
| 11 | No Prisma schema / migration changes. | **Met.** |
| 12 | No seed data added. | **Met.** |
| 13 | No telemetry implementation. | **Met.** |
| 14 | F4.4B report created. | **Met.** This document. |
| 15 | No commit made. | **Met.** |

All acceptance criteria are met.

## 12. Next Phase Recommendation

**Recommend F4.4C — CanonicalTagsModule API Reactivation** as the next phase.

Rationale:

- `CanonicalTagsModule` is the smallest remaining module: it reads a globally-shared dictionary (no tenant scope, no joins), so there is no `CallerContext.tenantId` filtering to plumb.
- The F4.3 seed already populates 22 canonical tags, so `GET /api/v1/tags` will return a deterministic, non-empty result on the F4.2 baseline.
- The F4 `CanonicalTag` model preserved the field name `name` (still `@unique`) so lookup-by-name is still possible; F4 added `canonicalUnit`, `category`, `precision`, `description`, `deprecated`. The reactivation pattern (rewrite service against renamed fields, drop `unit` / `unitClass` references, restore to bootstrap, drop directory from excludes, add mocked-Prisma spec) is identical to F4.4A and F4.4B.
- After F4.4C, three of six modules are reactivated and the remaining trio (`EquipmentModule`, `JobsModule`, `TelemetryModule`) form a connected dependency cluster (equipment → unit configurations → alarm rules → jobs → telemetry); F4.4D onward can address them with growing confidence in the rewrite pattern.

Suggested ordering remains:

- **F4.4C** — `CanonicalTagsModule` (global read-only dictionary).
- **F4.4D** — `EquipmentModule` (`equipment_types` + `measurement_units` + per-unit envelope read).
- **F4.4E** — `JobsModule` (joins well + unit + commissioning snapshot).
- **F4.4F** — `TelemetryModule` (read paths only; full write paths land in F4.6).
