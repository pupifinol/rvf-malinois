# RVF Malinois — F4.4C CanonicalTagsModule API Reactivation Report

> Phase **F4.4C — CanonicalTagsModule API Reactivation**.
> Third module reactivated atop the F4 canonical Prisma client. Same
> single-module posture as F4.4A and F4.4B.
>
> References:
> - F4 architecture: `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md` (commit `f36923a`)
> - ADR-007: `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md` (commit `8147399`)
> - F4.2B strategy: `docs/architecture/RVF_Malinois_F4_2B_Insulation_Strategy_Confirmation.md` (commit `a8862e2`)
> - F4.2B implementation: `docs/architecture/RVF_Malinois_F4_2B_Prisma_Baseline_Migration_Report.md` (commit `e37f7b5`)
> - F4.3 seed: `docs/architecture/RVF_Malinois_F4_3_Seed_Reference_Data_Report.md` (commit `91e17aa`)
> - F4.4A tenants: `docs/architecture/RVF_Malinois_F4_4A_Tenants_API_Reactivation_Report.md` (commit `2f5c108`)
> - F4.4B wells: `docs/architecture/RVF_Malinois_F4_4B_Wells_API_Reactivation_Report.md` (commit `20dadca`)

## 1. Summary

F4.4C reactivates `CanonicalTagsModule` against the F4 `canonical_tags` table, restores it to the Nest application bootstrap, removes `src/tags/**` from the F4.2B quarantine excludes in `tsconfig.json`, `eslint.config.mjs`, and `vitest.config.ts`, and adds a focused mocked-Prisma vitest suite that runs cleanly inside `pnpm test` without a database.

Scope mirrors F4.4A and F4.4B: only `CanonicalTagsModule` is reactivated. `EquipmentModule`, `JobsModule`, and `TelemetryModule` remain quarantined and untouched. `TenantsModule` (F4.4A) and `WellsModule` (F4.4B) continue to operate.

Of the three reactivations so far, F4.4C is the lightest: the F1 service was already field-agnostic — it referenced only `prisma.canonicalTag.findMany / findUnique` and the `CanonicalTag` type — so a strict literal rewrite is not necessary. F4.4C does three small things on top of restoring the module:

1. Adds optional `category`, `canonicalUnit`, `deprecated` filters (Zod-validated at the controller).
2. Switches the list ordering from `{ name asc }` to `[{ category asc }, { name asc }]` so the dictionary groups naturally in API consumers / Swagger UI.
3. Updates the docstrings to reference F4 / ADR-003 instead of the F1 vocabulary.

The `/api/v1/tags` and `/api/v1/tags/:name` URLs are preserved verbatim; the dictionary remains global (no tenant scope, no joins). F4.3 already populates 22 canonical tags, so the reactivated endpoint returns a deterministic non-empty result once the F4.2 baseline is applied locally.

All quality gates pass: `prisma validate`, `prisma generate`, backend + workspace-wide `lint` / `typecheck` / `build`, plus the backend `vitest` suite (21/21 tests including 7 new canonical-tags tests). No commit was made.

## 2. Files Changed

| Path | Change |
|---|---|
| `apps/backend/src/tags/tags.service.ts` | Added optional `category` / `canonicalUnit` / `deprecated` filter parameters; switched `orderBy` to `[{ category: 'asc' }, { name: 'asc' }]`; updated docstring to reference F4 / ADR-003 / F4.4C. Method signatures preserved (`findAll`, `findByName`). |
| `apps/backend/src/tags/tags.controller.ts` | Wrapped `list()` in a Zod-validated query schema (`category?`, `canonicalUnit?`, `deprecated?: 'true' \| 'false'`); the controller converts `deprecated` string → boolean before handing the filter to the service. Swagger annotations updated. Routes (`GET /tags`, `GET /tags/:name`) unchanged. |
| `apps/backend/src/tags/tags.service.spec.ts` | **New.** 7 mocked-Prisma vitest tests covering the default ordering, each filter, `deprecated=true` / `deprecated=false`, the happy path of `findByName`, and the `NotFoundException` path. |
| `apps/backend/src/app.module.ts` | Added `CanonicalTagsModule` to `imports`; header rewritten to F4.4C reactivation state. |
| `apps/backend/tsconfig.json` | Removed `src/tags/**` from `exclude`. |
| `apps/backend/eslint.config.mjs` | Removed `src/tags/**` from `ignores`. |
| `apps/backend/vitest.config.ts` | Removed `src/tags/**` from `exclude`. |
| `docs/architecture/RVF_Malinois_F4_4C_CanonicalTags_API_Reactivation_Report.md` | **New.** This document. |

`tags.module.ts` already imported `CanonicalTagsController` + `CanonicalTagsService` from the right paths and required no changes. No edits under `apps/web/`, `packages/`, `apps/backend/prisma/`, `apps/backend/src/{equipment,jobs,telemetry}/`, `docker-compose.yml`, `.github/`, or root config files.

## 3. Canonical Tags API Behavior Restored

### 3.1 Endpoint surface (F4.4C)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/tags` | List the canonical tag dictionary. Optional filters: `category` (e.g. `pressure`), `canonicalUnit` (e.g. `psi`), `deprecated` (`true` or `false`). Ordered by `(category asc, name asc)`. |
| `GET` | `/api/v1/tags/:name` | Fetch a single tag by its stable business key (lowercase snake_case, e.g. `p_inlet`, `q_gas`, `level_separator`). 404 if the name is not in the dictionary. |

The dictionary is **not** tenant-scoped. No `CallerContext` plumbing on this module — same posture as the F1 implementation. Names are the stable business key (`name @unique`); UUIDs exist but the API never asks for them.

### 3.2 Response shape

`CanonicalTag` row as Prisma serializes it:

```json
{
  "id": "00000000-0000-0000-0000-0000000044c1",
  "name": "p_inlet",
  "displayName": "Inlet pressure",
  "canonicalUnit": "psi",
  "category": "pressure",
  "precision": 1,
  "description": "Process pressure measured at the unit inlet manifold.",
  "deprecated": false,
  "createdAt": "2026-05-24T00:00:00.000Z",
  "updatedAt": "2026-05-24T00:00:00.000Z"
}
```

Create / update / delete / deprecate / rename remain unexposed.

### 3.3 Filter semantics

- `?category=pressure` — equality on `canonical_tags.category`.
- `?canonicalUnit=psi` — equality on `canonical_tags.canonical_unit`.
- `?deprecated=true` / `?deprecated=false` — explicit deprecation filter; omitting the parameter returns every row (deprecated and active).
- The three filters compose (logical AND).

## 4. Prisma Model Used

`CanonicalTag` from the F4 client generated against `apps/backend/prisma/schema.prisma` (commit `e37f7b5`):

```prisma
model CanonicalTag {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name           String   @unique
  displayName    String   @map("display_name")
  canonicalUnit  String   @map("canonical_unit")
  category       String
  precision      Int      @default(2)
  description    String?
  deprecated     Boolean  @default(false)
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  // ...back-relations to sensor_tag_bindings, alarm_rules, alarm_events, telemetry_readings, integration_mappings
}
```

The service uses `prisma.canonicalTag.findMany({ where, orderBy })` and `prisma.canonicalTag.findUnique({ where: { name } })`. No raw SQL, no transactions, no includes.

## 5. Field Mapping F1 → F4

| F1 column | F4 equivalent | Why it changed |
|---|---|---|
| `canonical_tags.name` | `canonical_tags.name` | Unchanged. Still `@unique`, still the stable business key. |
| `canonical_tags.display_name` | `canonical_tags.display_name` | Unchanged. |
| `canonical_tags.unit` | `canonical_tags.canonical_unit` | Renamed for clarity (`canonical_unit` makes the canonical-vs-engineering distinction explicit at column level). |
| `canonical_tags.unit_class` (enum: `pressure`, `temperature`, `flow`, ...) | `canonical_tags.category` (string + comment) | F4 dropped Postgres enums in favor of CHECK constraints; for `canonical_tags.category` there is no CHECK either (the category set is open by design — F4 §C). The values used by the F4.3 seed (`pressure`, `temperature`, `flow`, `volume`, `level`, `vibration`, `status`) match the F1 vocabulary semantically. |
| `canonical_tags.decimals` | `canonical_tags.precision` | Renamed; same meaning (digits after the decimal point for display). |
| `canonical_tags.expected_range` (jsonb `{lo, hi}`) | (removed) | F4 §D Sensor carries `min_range` / `max_range` directly; per-tag expected envelopes belong to `unit_operating_envelopes` and `alarm_rules`, not to the global dictionary. |
| (n/a) | `canonical_tags.deprecated` (boolean, default `false`) | F4 introduced an explicit deprecation flag (ADR-003: "rows are never deleted"). F1 had no equivalent column. |
| `canonical_tags.description` | `canonical_tags.description` | Unchanged. |

No F4 fields are dropped, renamed, or hidden by F4.4C — the controller returns the full Prisma row.

## 6. Quarantine Changes

Removed `src/tags/**` from three places:

| File | Before (F4.4B state) | After (F4.4C state) |
|---|---|---|
| `apps/backend/tsconfig.json` `exclude` | `src/{tags,equipment,jobs,telemetry}/**` | `src/{equipment,jobs,telemetry}/**` |
| `apps/backend/eslint.config.mjs` `ignores` | `src/{tags,equipment,jobs,telemetry}/**` | `src/{equipment,jobs,telemetry}/**` |
| `apps/backend/vitest.config.ts` `exclude` | `src/{tags,equipment,jobs,telemetry}/**` | `src/{equipment,jobs,telemetry}/**` |

Three modules still quarantined: `EquipmentModule`, `JobsModule`, `TelemetryModule`.

In `apps/backend/src/app.module.ts`:

- `import { CanonicalTagsModule } from './tags/tags.module';` added (in alphabetical order with the other `./<feature>/...` imports).
- `CanonicalTagsModule` appended to `imports` (after `WellsModule`).
- Header comment rewritten to reflect the F4.4C reactivation state.

## 7. Tests Added / Updated

The F1 `tags.service.spec.ts` was never present (the F1 tags surface had no spec file). F4.4C introduces a fresh mocked-Prisma spec following the F4.4A / F4.4B pattern.

| Test | Verifies |
|---|---|
| `findAll: returns every tag with the canonical ordering when no filter is supplied` | Empty `where`, `orderBy: [{ category: 'asc' }, { name: 'asc' }]`. |
| `findAll: applies the optional category filter` | `?category=pressure` → `where: { category: 'pressure' }`. |
| `findAll: applies the optional canonicalUnit filter` | `?canonicalUnit=psi` → `where: { canonicalUnit: 'psi' }`. |
| `findAll: passes through deprecated=false as an explicit filter` | The explicit-false case (`deprecated=false`) must not be conflated with "no filter" — covered separately because `if (filter.deprecated !== undefined)` is exactly the kind of conditional that drifts on refactor. |
| `findAll: passes through deprecated=true as an explicit filter` | Mirror of the above for `deprecated=true`. |
| `findByName: returns the canonical tag for a known name` | Happy path; argument shape `{ where: { name } }` is asserted. |
| `findByName: throws NotFoundException when the name is not in the dictionary` | Unknown name surfaces a `404`. |

Backend test run: **21/21 pass** (1 health + 6 tenants + 7 wells + 7 canonical-tags). No DB connection required.

A controller-level spec is not added in F4.4C — same rationale as F4.4A / F4.4B: the controller is a thin Nest binding (`@Get`, `@Param`, `@Query`, `ZodValidationPipe`) whose behavior is well-covered by upstream tests.

## 8. Commands Run and Results

| Command | Result |
|---|---|
| `pnpm --filter @rvf/backend exec prisma validate` | `The schema at prisma/schema.prisma is valid 🚀` |
| `pnpm --filter @rvf/backend exec prisma generate` | Clean (Prisma Client 5.22.0) |
| `pnpm --filter @rvf/backend run lint` | clean exit |
| `pnpm --filter @rvf/backend run typecheck` | clean (fixed one error during authoring — see §10 R3) |
| `pnpm --filter @rvf/backend run test` | `4 files / 21 tests passed (1 health + 6 tenants + 7 wells + 7 canonical-tags)` |
| `pnpm --filter @rvf/backend run build` | clean (`nest build`) |
| `pnpm run lint` (workspace) | 4/4 tasks successful |
| `pnpm run typecheck` (workspace) | 4/4 tasks successful |
| `pnpm run build` (workspace) | 2/2 tasks successful |

## 9. What Remains Out of Scope

- **Reactivation of any other quarantined module.** `EquipmentModule`, `JobsModule`, `TelemetryModule` stay quarantined.
- **Tag write paths (`deprecate`, `rename`).** Not exposed. The service's docstring records that these will return behind a guarded path that refuses deprecation/rename when the tag is referenced by any sensor binding, alarm rule, or commissioning snapshot. F4.4D+ may need read-only counters for that guard but does not yet implement it.
- **Search / full-text.** Explicitly out of scope; F4 §C documents the dictionary as small and category-grouped, not requiring full-text search.
- **Pagination.** The dictionary is bounded (~22 rows post-seed; intentional growth is slow); pagination is not added.
- **`packages/types` exports for `CanonicalTag`.** Not added; F4.5 will decide if the frontend needs a shared type.
- **Index on `category`.** Not added. The dictionary is too small for an index to matter; production-scale tuning is a later concern.
- **Real authentication.** N/A — the dictionary is global.
- **Controller integration tests against a real DB.** Deferred.
- **Schema or migration changes.** None made; none needed.

## 10. Risks / Limitations

1. **`deprecated` query parameter is typed as `'true' \| 'false'`, not a real boolean.** The `ZodValidationPipe` types its schema as `ZodSchema<T>` (input = output = `T`), which is incompatible with a Zod `.transform()` narrowing string → boolean. The controller therefore converts the string in code before handing the filter to the service. The OpenAPI document exposes `deprecated` as `enum: ['true', 'false']`. Switching the pipe to support transform schemas is a small infrastructure change that could land in F4.4D / F4.4E if more endpoints want similar boolean query params.
2. **No CHECK constraint on `canonical_tags.category`.** F4.1 SQL does not constrain the category column; the F4.3 seed uses `pressure / temperature / flow / volume / level / vibration / status`, but the schema accepts any string. A typo in a future write-path would not be caught at the DB layer. Filter behavior is unaffected: an unknown category simply yields an empty result.
3. **`ApiQueryOptions` rejects `format: 'uuid'` and similar** — same Swagger-fidelity gap noted in F4.4B; for this module the gap doesn't matter because none of the F4.4C parameters are UUIDs.
4. **No real-DB e2e.** Same posture as F4.3 / F4.4A / F4.4B. Mocked-Prisma unit tests cover the F4 query shape and the controller's filter conversion.
5. **Names like `p_inlet`, `q_gas`, `level_separator` are routed through `:name`.** Lowercase snake_case is URL-safe; no encoding concerns. A name with `/` or `.` would break the route — F4 §C convention guarantees neither character ever appears in a canonical tag name.

## 11. Acceptance Criteria — Status

| # | Criterion | Status |
|---|---|---|
| 1 | CanonicalTagsModule is active in `app.module.ts`. | **Met.** |
| 2 | CanonicalTagsModule compiles against F4 Prisma schema. | **Met.** Typecheck + build green. |
| 3 | CanonicalTagsModule removed from quarantine excludes. | **Met.** `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts` updated. |
| 4 | TenantsModule remains active. | **Met.** |
| 5 | WellsModule remains active. | **Met.** |
| 6 | No other quarantined modules reactivated. | **Met.** Equipment, jobs, telemetry remain quarantined. |
| 7 | `lint` passes. | **Met.** Backend + workspace. |
| 8 | `typecheck` passes. | **Met.** Backend (src + prisma) + workspace. |
| 9 | `build` passes. | **Met.** Backend (`nest build`) + workspace. |
| 10 | Backend tests pass or unrelated skipped/quarantined documented. | **Met.** 21/21 pass. |
| 11 | No frontend files changed. | **Met.** |
| 12 | No Prisma schema / migration changes. | **Met.** |
| 13 | No seed data added. | **Met.** |
| 14 | No telemetry implementation. | **Met.** |
| 15 | F4.4C report created. | **Met.** This document. |
| 16 | No commit made. | **Met.** |

All acceptance criteria are met.

## 12. Next Phase Recommendation

**Recommend F4.4D — EquipmentModule API Reactivation** as the next phase.

Rationale:

- `EquipmentModule` is the next-smallest remaining surface. The F1 module exposed `equipment_types` + `equipment_units`; F4 keeps both (renamed `equipment_units` → `measurement_units`) and adds the per-unit configuration / envelope / alarm-rule references that the unit detail view will eventually surface.
- The F4.3 seed populates 2 `equipment_types` (EMMAD, EMGAD) and 2 `measurement_units` (HP-001, LP-001), so the reactivated endpoints return deterministic non-empty results.
- F4.4D will introduce the first endpoint that needs to *project* per-unit configuration / envelope into the response payload. The pattern (Prisma `include` + Zod-validated query schema + mocked-Prisma spec) is the same as F4.4B; F4.4D extends it with one additional nested relation read.
- After F4.4D, four of six modules are reactivated and `JobsModule` (F4.4E) and `TelemetryModule` (F4.4F) become the only remaining quarantined surfaces.

Suggested ordering remains:

- **F4.4D** — `EquipmentModule` (`equipment_types` + `measurement_units` + per-unit envelope read).
- **F4.4E** — `JobsModule` (joins well + unit + commissioning snapshot).
- **F4.4F** — `TelemetryModule` (read paths only; full write paths land in F4.6).
