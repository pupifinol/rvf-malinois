# RVF Malinois — F4.2B Backend Insulation Strategy Confirmation

> Phase F4.2B-0 — Analysis only. No code, no schema, no migrations, no commits.
> Companion documents:
> - `docs/architecture/RVF_Malinois_F4_2A_Prisma_Reconciliation_Plan.md` (commit `7bd6103`)
> - `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md` (commit `f36923a`)
> - `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md` (commit `8147399`)
> - `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql` (commit `a475066`)

## 1. Executive Summary

F4.2A established that the backend has deep compile-time dependencies on the F1/F1.5 Prisma client across 16 source files (3 controllers, 7 services/resolvers, 3 telemetry contracts, 4 vitest specs) plus 2 standalone scripts (`prisma/seed.ts`, `scripts/generate-sample-telemetry.ts`). These dependencies are not only at the type layer — five files import enums **as runtime values** (`TenantKind`, `EquipmentCategory`, `JobStatus`, `Quality`), which means a clean schema swap removes both *types* and *runtime constants* the backend currently references.

Any naïve replacement of `apps/backend/prisma/schema.prisma` with the F4 canonical model breaks `pnpm run lint`, `pnpm run typecheck`, and `pnpm run build` on first compile, because every renamed model (`equipmentUnit` → `measurement_units`, `jobSensorSnapshot` → JSONB inside `commissioning_snapshots`, `telemetry` → `telemetry_readings`) and every removed enum (`SensorType` F1 members, `Quality.estimated`/`stale`, `LateTelemetryReason`, `AlarmCondition` UPPERCASE values, `AlarmSeverity.high`/`medium`/`low`) is referenced by name in TypeScript code or DTO contracts.

This document evaluates four insulation modes (module quarantine, compatibility shim, full immediate rewrite, hybrid) against repo evidence and **recommends Mode 1 — Module quarantine** as the F4.2B strategy. Mode 1 keeps lint/typecheck/build green by temporarily removing F1-dependent Nest feature modules from `app.module.ts` and excluding their source paths from the TypeScript compile input, *without deleting any source file*. F4.2 ships a backend that boots into `/health` only; F4.4 reintroduces the modules atop the F4 Prisma client. This bounds F4.2B to ~3 file edits beyond the Prisma swap itself, preserves all F1 source in git for reference during the F4.4 rewrite, and matches the bundling discipline F4.2A §7 requires.

## 2. Evidence Reviewed

| Source | Commit | Notes |
|---|---|---|
| `docs/architecture/RVF_Malinois_F4_2A_Prisma_Reconciliation_Plan.md` | `7bd6103` | Recommends Option B (clean reset + mandatory bundled insulation). Lists 14 dependent files; F4.2B-0 re-verified and refined to 16 backend files + 2 scripts. |
| `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md` | `f36923a` | F4 canonical model: `MeasurementUnit`, `TransmitterDevice`, per-unit `AlarmRule`, append-only `telemetry_readings`, `live_readings_projection` view, no TimescaleDB. |
| `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md` | `8147399` | F4 is the system of record. F1 is legacy by decision. |
| `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql` | `a475066` | 20 tables, 51 indexes, view, `pgcrypto` UUIDs, CHECK constraints, partial unique indexes. |
| `apps/backend/prisma/schema.prisma` | working tree | 618 lines, 18 models, 14 enums, `extensions = [timescaledb]`. |
| `apps/backend/prisma/migrations/` | working tree | Three forward migrations (`20260519000000_init_timescaledb`, `20260520174418_f1_domain_model`, `20260520185255_f1_5_telemetry_hypertables`) + `migration_lock.toml`. |
| `apps/backend/src/**/*.ts` | working tree | Grep audit of `from '@prisma/client'`, `prisma.<model>.*`, `PrismaClient`. See §3. |
| `apps/backend/prisma/seed.ts`, `apps/backend/scripts/generate-sample-telemetry.ts` | working tree | Both import F1-only enums + `PrismaClient` directly. |
| `apps/backend/tsconfig.json` | working tree | `include: ["src/**/*.ts"]`, `exclude: ["node_modules", "dist", "test"]`. No per-module excludes yet — extending `exclude` is supported. |
| `apps/backend/vitest.config.ts` | working tree | `include: ['src/**/*.{test,spec}.ts']`, `fileParallelism: false` (specs share one DB instance). |
| `apps/backend/src/app.module.ts` | working tree | Imports `ConfigModule`, `LoggerModule`, `PrismaModule`, `HealthModule`, `RealtimeModule`, `CanonicalTagsModule`, `TenantsModule`, `WellsModule`, `EquipmentModule`, `JobsModule`, `TelemetryModule`. |

Audit method:
- `grep -rn "from '@prisma/client'" apps/backend/{src,prisma,scripts}` → 21 hits across 19 files.
- `grep -rn "PrismaService\|PrismaClient" apps/backend/src --include='*.ts' -l` → 14 files.
- `grep -rn "prisma\." apps/backend/src --include='*.ts'` → method call inventory.
- Each Nest module's source confirmed by reading `app.module.ts`, then each `*.module.ts`.

## 3. Existing F1/F1.5 Prisma Dependency Map

### 3.1 Production code (controllers, services, resolvers, contracts)

| # | File | Imports from `@prisma/client` | Prisma model calls |
|---|---|---|---|
| 1 | `apps/backend/src/prisma/prisma.service.ts` | `PrismaClient` (value) | n/a — extends client |
| 2 | `apps/backend/src/prisma/prisma.module.ts` | (re-exports `PrismaService`) | n/a |
| 3 | `apps/backend/src/wells/wells.service.ts` | `type Well` | `prisma.well.findMany`, `prisma.well.findUnique`, `prisma.tenant.findUnique` |
| 4 | `apps/backend/src/wells/wells.controller.ts` | — | (consumes `WellsService`) |
| 5 | `apps/backend/src/tenants/tenants.service.ts` | `type Tenant`, `type TenantKind` | `prisma.tenant.findMany`, `prisma.tenant.findUnique` |
| 6 | `apps/backend/src/tenants/tenants.controller.ts` | `TenantKind` (**value**) | n/a |
| 7 | `apps/backend/src/tags/tags.service.ts` | `type CanonicalTag` | `prisma.canonicalTag.findMany`, `prisma.canonicalTag.findUnique` |
| 8 | `apps/backend/src/tags/tags.controller.ts` | — | (consumes `CanonicalTagService`) |
| 9 | `apps/backend/src/equipment/equipment.service.ts` | `type EquipmentCategory`, `type EquipmentType`, `type EquipmentUnit` | `prisma.equipmentType.*`, `prisma.equipmentUnit.*` |
| 10 | `apps/backend/src/equipment/equipment.controller.ts` | `EquipmentCategory` (**value**) | n/a |
| 11 | `apps/backend/src/jobs/jobs.service.ts` | `type Job`, `type JobStatus` | `prisma.job.findMany`, `prisma.job.findUnique`, `prisma.tenant.findUnique` |
| 12 | `apps/backend/src/jobs/jobs.controller.ts` | `JobStatus` (**value**) | n/a |
| 13 | `apps/backend/src/jobs/commissioning.service.ts` | `type CommissioningSnapshot`, `type Job`, `type JobSensorSnapshot`, `JobStatus` (**value**), `type Prisma` | `prisma.equipmentUnit.*`, `prisma.canonicalTag.*`, `prisma.commissioningSnapshot.*`, `prisma.job.*`, `prisma.$transaction` |
| 14 | `apps/backend/src/telemetry/canonical-tag-resolver.ts` | `type EngineeringUnitClass`, `JobStatus` (**value**), `type SensorType` | `prisma.jobSensorSnapshot.findFirst`, `prisma.job.findUnique`, `prisma.job.findMany`, `prisma.equipmentUnit.findUnique` |
| 15 | `apps/backend/src/telemetry/trends.service.ts` | `Prisma` (**value, for `Prisma.sql`**), `Quality` (**value**) | `prisma.job.findUnique`, `prisma.jobSensorSnapshot.findFirst`, `prisma.$queryRaw` |
| 16 | `apps/backend/src/telemetry/contracts/envelope.ts` | `Quality` (**value**) | n/a (DTO shape) |
| 17 | `apps/backend/src/telemetry/contracts/trends.ts` | `Quality` (**value**) | n/a (DTO shape) |
| 18 | `apps/backend/src/telemetry/contracts/ingestion-adapter.ts` | `type Quality`, `type LateTelemetryReason` | n/a (DTO shape) |
| 19 | `apps/backend/src/telemetry/telemetry.controller.ts` | — | (consumes telemetry services via Nest DI) |
| 20 | `apps/backend/src/telemetry/telemetry.validator.ts` | — | pure shape validation |
| 21 | `apps/backend/src/telemetry/unit-converter.ts` | — | pure math |

Files 19–21 do not import Prisma directly, but they live inside `TelemetryModule` which depends on `TrendsService` and `CanonicalTagResolver` (files 14–15). When the module is quarantined, files 19–21 leave the compile graph along with the rest.

### 3.2 Tests (vitest specs)

| # | File | Imports from `@prisma/client` | Behavior |
|---|---|---|---|
| 22 | `apps/backend/src/jobs/jobs.service.spec.ts` | `PrismaClient` | Connects to live dev DB; reads seed tenants. |
| 23 | `apps/backend/src/jobs/commissioning.service.spec.ts` | `PrismaClient`, `JobStatus` (**value**) | Creates/destroys jobs, snapshots, alarm rules, operational events against live dev DB. |
| 24 | `apps/backend/src/telemetry/canonical-tag-resolver.spec.ts` | `PrismaClient`, `JobStatus` (**value**) | Mutates seed jobs; creates conflict jobs. |
| 25 | `apps/backend/src/telemetry/trends.service.spec.ts` | `PrismaClient`, `Prisma` (**value**), `Quality` (**value**) | Inserts into `telemetry` hypertable directly via `prisma.telemetry.createMany` and `prisma.$executeRaw`. |
| — | `apps/backend/src/telemetry/unit-converter.spec.ts` | — | Pure math; no DB. |
| — | `apps/backend/src/telemetry/telemetry.validator.spec.ts` | — | Pure shape; no DB. |
| — | `apps/backend/src/health/health.controller.spec.ts` | — | No DB. |

### 3.3 Seed and scripts

| # | File | Imports from `@prisma/client` |
|---|---|---|
| 26 | `apps/backend/prisma/seed.ts` | `PrismaClient`, `AlarmCondition`, `AlarmSeverity`, `EngineeringUnitClass`, `EquipmentCategory`, `JobStatus`, `SensorType`, `TenantKind`, `UserRole` (all **values**) |
| 27 | `apps/backend/scripts/generate-sample-telemetry.ts` | `PrismaClient`, `Quality` (**value**) |

### 3.4 Specific F1 enums/types referenced

**Models (Prisma client accessors):** `well`, `tenant`, `canonicalTag`, `equipmentType`, `equipmentUnit`, `job`, `jobSensorSnapshot`, `commissioningSnapshot`, `telemetry`, `alarmRule`, `operationalEvent`.

**Generated model types (TypeScript):** `Well`, `Tenant`, `CanonicalTag`, `EquipmentType`, `EquipmentUnit`, `Job`, `JobSensorSnapshot`, `CommissioningSnapshot`.

**Generated enum values (used at runtime):** `TenantKind`, `EquipmentCategory`, `JobStatus`, `Quality`, `AlarmCondition`, `AlarmSeverity`, `SensorType`, `UserRole`, `EngineeringUnitClass`.

**Generated enum types (type-only):** `TenantKind`, `EquipmentCategory`, `JobStatus`, `SensorType`, `EngineeringUnitClass`, `Quality`, `LateTelemetryReason`.

**Other Prisma namespace symbols:** `Prisma` (value, for `Prisma.sql` template tag in raw queries; type, for `Prisma.InputJsonValue` etc).

## 4. Runtime-Critical Dependencies

"Runtime-critical" = participates in Nest application bootstrap. Removing the file (or the enum it references) prevents `apps/backend` from starting.

| Module | Runtime-critical files | Why |
|---|---|---|
| `PrismaModule` | `prisma.service.ts`, `prisma.module.ts` | Global Nest provider; needed by every feature module. `PrismaClient` exists regardless of schema content — file stays compile-safe after schema swap **if** it does not import any specific model/enum (it doesn't, only `PrismaClient`). ✅ Keep as-is. |
| `HealthModule` | `health.module.ts`, `health.controller.ts` | No Prisma dependency. ✅ Keep as-is. |
| `RealtimeModule` | `realtime.module.ts`, `realtime.gateway.ts` | No Prisma dependency (Socket.IO only). ✅ Keep as-is. |
| `ConfigModule` | `config.module.ts`, `env.ts` | No Prisma. ✅ Keep as-is. |
| `CanonicalTagsModule` | `tags.service.ts`, `tags.controller.ts`, `tags.module.ts` | `tags.service.ts` imports `type CanonicalTag` from F1 client. ❌ Breaks. |
| `TenantsModule` | `tenants.service.ts`, `tenants.controller.ts`, `tenants.module.ts` | Imports `type Tenant`, `type TenantKind`, **runtime `TenantKind`**. ❌ Breaks. |
| `WellsModule` | `wells.service.ts`, `wells.controller.ts`, `wells.module.ts` | Imports `type Well`. ❌ Breaks. |
| `EquipmentModule` | `equipment.service.ts`, `equipment.controller.ts`, `equipment.module.ts` | Imports `type EquipmentCategory`, `type EquipmentType`, `type EquipmentUnit`, **runtime `EquipmentCategory`**. ❌ Breaks. |
| `JobsModule` | `jobs.service.ts`, `jobs.controller.ts`, `jobs.module.ts`, `commissioning.service.ts` | Imports `type Job`, `type JobStatus`, **runtime `JobStatus`**, `type CommissioningSnapshot`, `type JobSensorSnapshot`. Uses `prisma.equipmentUnit.*`, `prisma.jobSensorSnapshot.*`, `prisma.commissioningSnapshot.*`. ❌ Breaks. |
| `TelemetryModule` | `canonical-tag-resolver.ts`, `trends.service.ts`, `telemetry.controller.ts`, `telemetry.validator.ts`, `unit-converter.ts`, `telemetry.module.ts`, `contracts/{envelope,trends,ingestion-adapter}.ts` | Imports `type EngineeringUnitClass`, `type SensorType`, **runtime `JobStatus`**, **runtime `Quality`**, **runtime `Prisma`**, `type LateTelemetryReason`. ❌ Breaks. |

### 4.1 Minimum runtime-safe surface after F4.2B

After Prisma swap + Mode 1 quarantine, the only Nest modules left bootstrapped are:

- `ConfigModule`, `LoggerModule`, `PrismaModule`, `HealthModule`, `RealtimeModule`.

`/health` returns OK. `/api/v1/{tenants,wells,tags,equipment,jobs,telemetry,...}` return 404 (route not mounted) — by design, until F4.4 reintroduces each feature on the F4 client. The frontend continues to render via the F3 `lib/api-data/` mock adapter (engineering-architecture §J).

## 5. Test/Spec Dependencies

Four specs break on the schema swap (files 22–25 above). Three specs survive (`unit-converter.spec.ts`, `telemetry.validator.spec.ts`, `health.controller.spec.ts`).

The four breaking specs all instantiate `new PrismaClient()` directly and connect to the live dev DB (`vitest.config.ts` sets `fileParallelism: false` for this reason). They mutate the F1 seed and reference removed enums/models.

**Quarantine strategy for specs (Mode 1):** because the breaking specs live inside `src/jobs/` and `src/telemetry/`, excluding `src/jobs/**` and `src/telemetry/**` from the TypeScript `include` (or adding to `exclude`) automatically removes them from the vitest run as well — vitest reads from the same `tsconfig.json`. The pure-math specs (`unit-converter.spec.ts`, `telemetry.validator.spec.ts`) are casualties of this approach because they sit in the same directory; that is acceptable for F4.2B (they will return when the directory is reactivated in F4.4).

**Alternative:** keep `src/telemetry/unit-converter.ts` + `unit-converter.spec.ts` + `telemetry.validator.ts` + `telemetry.validator.spec.ts` outside the quarantine by either (a) moving them to a new `src/telemetry/_pure/` subdirectory before the quarantine, or (b) listing each spec individually in `vitest.config.ts` `exclude`. Both are mechanical and reversible. **Recommend (b)** for F4.2B — does not move files, easier to revert in F4.4.

## 6. Seed/Script Dependencies

- `apps/backend/prisma/seed.ts` — 100% F1 enums/models. Cannot be rewritten in F4.2B without drifting into F4.3 scope.
  - **Quarantine action:** rename to `apps/backend/prisma/seed.f1.ts.bak` so Prisma doesn't auto-detect it (Prisma reads the path from `package.json` `prisma.seed`). Verify `package.json` does not invoke seed during build/typecheck.
- `apps/backend/scripts/generate-sample-telemetry.ts` — uses `PrismaClient` + `Quality`. Not on the build/typecheck path by default (it lives under `scripts/`, not `src/`).
  - **Quarantine action:** move to `apps/backend/scripts/legacy/generate-sample-telemetry.ts.bak`, or add a `// @ts-nocheck` top line. Confirm `tsconfig.json` already excludes `scripts/` (it does — `include` is `["src/**/*.ts"]`). No compile-time breakage today; rename anyway to make legacy status explicit.

Confirm `apps/backend/package.json` `prisma.seed` field: if it points at `seed.ts`, update or remove for the F4.2B window so a future `prisma db seed` does not crash with "module not found".

## 7. Breakage Analysis if Prisma Is Replaced Without Insulation

A clean schema swap (`schema.prisma` → F4 canonical, archive `migrations/`, `prisma generate`) **without** any backend insulation causes every file in §3.1 and §3.2 to fail typecheck. Concrete failure modes, in the order TSC will report them:

1. **Removed model accessors.** `this.prisma.equipmentUnit` → `Property 'equipmentUnit' does not exist on type 'PrismaClient<...>'` (renamed to `measurementUnit`). Same for `jobSensorSnapshot` (removed; folded into JSONB), `commissioningSnapshot` (renamed `commissioningSnapshot` — depends on naming chosen for F4.2B), `telemetry` (replaced by `telemetryReading`), `alarmRule` (different shape and accessor remains), `operationalEvent` (removed; folded into `auditLog`).
2. **Removed model type imports.** `import type { EquipmentUnit } from '@prisma/client'` → `Module '"@prisma/client"' has no exported member 'EquipmentUnit'`. Same for `JobSensorSnapshot`, `CommissioningSnapshot` (shape change).
3. **Removed enum runtime values.** `import { TenantKind } from '@prisma/client'` → `Module '"@prisma/client"' has no exported member 'TenantKind'`. Same for `EquipmentCategory`, `JobStatus`, `Quality`, `AlarmCondition`, `AlarmSeverity`, `SensorType`, `UserRole`. F4.1 uses SQL CHECK constraints, not Postgres enums — Prisma generates enum exports only from `enum` blocks in `schema.prisma`, so any F4.2B schema written to mirror F4.1 (no `enum` declarations) emits none of these names.
4. **Removed enum type imports.** Same files break a second time at the type position.
5. **`Quality.estimated` / `Quality.stale` value references.** Even if the F4 schema redefined a `Quality` enum, the F1 vocabulary (5 values) does not match F4 (3 values: `good`/`uncertain`/`bad`). Any `=== Quality.estimated` comparison fails to compile.
6. **`AlarmCondition.LO_LO` / UPPERCASE references.** F4 uses lowercase `low_low` and removes `DEVIATION`/`NO_DATA`.
7. **`Prisma.sql\`...\`` template tag.** Stays compile-clean (the `Prisma` namespace always exists) but the SQL inside `trends.service.ts` references the `telemetry` table — runtime crash on first call, not a compile error.
8. **Specs that call `new PrismaClient()`.** Compile-clean signature but every `prisma.<oldModel>.*` call inside the spec breaks the same way as §3.
9. **Seed script.** All enum imports break; all `prisma.<oldModel>.create` calls break.
10. **CI / quality gate impact.** `pnpm run typecheck` exits non-zero with > 40 individual errors across 17 files. `pnpm run build` (which runs `tsc -b` via Nest CLI) fails identically. `pnpm run lint` may also report `@typescript-eslint/no-unused-vars` and `import/no-unresolved` cascades.

**Conclusion:** insulation is not optional. Without it, F4.2B leaves `main` in a non-buildable state for the duration of the F4.2 → F4.4 work — unacceptable per F4.2A §7.

## 8. Strategy Options

### Mode 1 — Module quarantine (recommended)

Remove F1-dependent feature modules from `app.module.ts` and exclude their source paths from `tsconfig.json` `include` (or extend `exclude`). Source files remain in git. Prisma `seed.ts` is renamed to `.bak`. The legacy telemetry generator script is renamed to `.bak`. Backend boots into `/health` + WebSocket gateway only. F4.4 reactivates modules one at a time on the F4 client.

- **Advantages.** Smallest F4.2B surface: ~3 file edits beyond Prisma + migrations. No F1 source rewritten, so the F4.4 rewrite has the original logic intact for reference. Lint/typecheck/build green in one atomic change. Symmetric to F4.2A §7's recommended Mode 1.
- **Disadvantages.** Backend feature endpoints temporarily disappear from `/api/v1/*`. Frontend depends on the `lib/api-data/` mock adapter for the F4.2 → F4.4 window (this is already the F3 contract).
- **Risks.** Low. Anyone running the backend during the window sees only `/health`. A README note in `apps/backend/` covers expectations. No production traffic to disrupt.
- **Reversibility.** Trivial: remove the `tsconfig` exclude, re-add module imports, rename `.bak` files back. The F4.4 rewrite happens module-by-module, so reactivation is incremental, not big-bang.

### Mode 2 — Compatibility shim

Author a temporary `apps/backend/src/prisma/_f1-types.ts` (or similar) that re-exports hand-written TypeScript types/enums mirroring the F1 vocabulary (`type EquipmentUnit`, `enum JobStatus`, `enum Quality`, etc.). Redirect all F1 imports from `@prisma/client` to this local file. The F4 Prisma client coexists; the F1 services still compile because they consume the shim's types instead of the real client, even though their `prisma.equipmentUnit.*` calls would still fail at runtime.

- **Advantages.** Backend continues to expose all `/api/v1/*` routes from a TypeScript standpoint. No `app.module.ts` surgery.
- **Disadvantages.** **Type compatibility is incomplete.** Shim covers enums and bare model types, but service code calls `this.prisma.equipmentUnit.findUnique({ ... })` — that path requires the *real* `PrismaClient` to expose an `equipmentUnit` accessor, which it no longer will. So compile breaks anyway at the `prisma.<model>` call sites unless the shim also injects a fake `PrismaService` (heavy: requires changing `PrismaModule` to provide either the real or the fake client conditionally, plus a runtime error when an endpoint is hit). Net effect: more work than Mode 1 for less safety.
- **Risks.** Medium. Shim drift: F1 shim types get out of step with F1 source, masking bugs. Mode 2 also encourages "we'll fix it later" — endpoints look alive but throw at runtime, which is worse than a 404.
- **Reversibility.** Delete the shim file in F4.4 — straightforward in mechanics but the rewrite scope is identical to Mode 1's, just delayed.

### Mode 3 — Full immediate rewrite

Rewrite all 14 production files + 4 specs against the F4 Prisma client in the same change set as F4.2B. Implement F4-shaped controllers/services for tenants, wells, tags, equipment, jobs, telemetry. Build the new commissioning service against `commissioning_snapshots` JSONB. Wire up `transmitter_devices` and `sensor_tag_bindings`.

- **Advantages.** F4.2B ends with a fully working backend on the F4 model. No quarantine window. F4.4 becomes a no-op.
- **Disadvantages.** Massive scope expansion. F4 introduces new entities the F1 backend never had: `transmitter_devices`, `sensor_tag_bindings`, `unit_configurations`, `unit_operating_envelopes`, `alarm_thresholds`, `alarm_events`, `integration_sources`, `integration_mappings`. Building service layers for these is squarely F4.4's job. Doing it inside F4.2B violates the phase boundary explicitly stated in F4.2A §11.
- **Risks.** High. The F4.2 PR balloons from "Prisma baseline" to "full backend rewrite". Review cost, merge conflict surface, and probability of regressions all rise sharply. Tests are also rewritten, so the quality signal during F4.2B is weakest right when it should be strongest.
- **Reversibility.** Bad. Once rewritten, going back to F1 logic requires git archaeology.

### Mode 4 — Hybrid

Quarantine the harder modules (`JobsModule`, `TelemetryModule`, `EquipmentModule`) in F4.2B; rewrite the easy ones (`TenantsModule`, `WellsModule`, `CanonicalTagsModule`) against the F4 client because they are nearly identical (rename `tenants.kind` → `tenants.status`, `wells.code/name/siteCode` → `wells.name/field_or_site`, `canonical_tags.unit/unitClass` → `canonical_tags.canonical_unit/category`).

- **Advantages.** Backend retains 3 of 6 feature endpoints. F4.4 has less work because the trivial migrations are already done.
- **Disadvantages.** Even the "easy" rewrites need F3 contract decisions (does the API return `kind` or `status`? Both? Both is forbidden by the contract-stability rule. Just `status` is a contract change. Just `kind` requires a translation layer.) Those decisions belong to F4.4's contract-evolution review, not F4.2B's plumbing change. Hybrid also mixes "schema swap" with "API evolution" in the same PR — confusing to review.
- **Risks.** Medium. Half-done work is a known anti-pattern (system prompt: *No half-finished implementations either*). If F4.4 is delayed, the half-quarantined state lingers.
- **Reversibility.** Same as Mode 1 for the quarantined half; same as Mode 3 for the rewritten half.

## 9. Recommended Strategy

**Recommend Mode 1 — Module quarantine.**

### Justification (evidence-based)

- **F4.2A §7 already recommends Mode 1.** Aligning F4.2B with the planning phase removes ambiguity for reviewers.
- **Smallest atomic change set.** ~3 file edits beyond the Prisma swap (`app.module.ts`, `tsconfig.json`, optionally `vitest.config.ts`) + 2 `.bak` renames. Lowest probability of regression.
- **No half-finished rewrites.** F1 service logic stays in git as a literal reference for F4.4. F4.4 then rewrites against the F4 client one module at a time, picking the new contract intentionally rather than under time pressure.
- **Phase boundary respected.** F4.2B touches schema + migrations + minimal Nest wiring. Service rewriting, contract evolution, seeding, ingestion, UI integration stay where they belong (F4.3 / F4.4 / F4.5 / F4.6).
- **No production risk.** Backend is dev-only; frontend talks to mock adapters. Quarantine has no user-visible cost during the F4.2 → F4.4 window.
- **Reversible.** A reviewer who disagrees with the cut can list a feature module for reactivation in F4.4 without affecting any other module.

### What Mode 1 explicitly does NOT cover

- API contract changes — those belong to F4.4.
- Seed rewriting — F4.3.
- Service-layer logic for new F4 tables (`transmitter_devices`, `sensor_tag_bindings`, etc.) — F4.4.
- Live database connection during F4.2B — explicitly deferred. Schema generates the client; no service binds to a runtime DB instance for feature work. `prisma migrate dev` is documented as a developer one-liner but not required for `pnpm run build` to pass.

## 10. Exact F4.2B Execution Plan

Each step is a discrete action. Quality gates after every step. No commit until all gates pass and the reviewer signs off.

### Step 0 — Branch isolation

- Create `feature/f4-2b-prisma-baseline` off current `main`.
- All F4.2B work lands here, squash-merged via single PR.

### Step 1 — Archive F1 migration history

- `git mv apps/backend/prisma/migrations apps/backend/prisma/migrations.f1-archive`
- Add `apps/backend/prisma/migrations.f1-archive/README.md` explaining: these are the F1 + F1.5 migrations, archived during F4.2B per F4.2A §7, preserved for git history reference, never re-applied.
- Do **not** delete. Future archaeology relies on them.

### Step 2 — Quarantine the F1 seed

- `git mv apps/backend/prisma/seed.ts apps/backend/prisma/seed.f1.ts.bak`
- Inspect `apps/backend/package.json` for a `"prisma": { "seed": "..." }` field. If present, remove it or point to a no-op placeholder for the F4.2 → F4.3 window.
- F4.3 will author a new `seed.ts` against the F4 model.

### Step 3 — Quarantine the F1 telemetry generator script

- `git mv apps/backend/scripts/generate-sample-telemetry.ts apps/backend/scripts/legacy/generate-sample-telemetry.ts.bak`
- The `scripts/` tree is already outside `tsconfig.json` `include`, so this is documentation-only. Move anyway to make legacy status explicit.

### Step 4 — Replace `schema.prisma` with F4 canonical model

- Author a new `apps/backend/prisma/schema.prisma` that mirrors `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql` 1:1:
  - `datasource db`: drop `extensions = [timescaledb]`; add `extensions = [pgcrypto]` (or use `@default(uuid())` and skip the extension declaration — pick one and document).
  - `generator client`: keep `previewFeatures = ["postgresqlExtensions"]` if using SQL-side `gen_random_uuid()`; keep `views` only if declaring `live_readings_projection` as a Prisma `view` block.
  - 20 models corresponding to F4.1 tables, each with `@@map("<snake_case_table_name>")`.
  - **No `enum` declarations.** F4.1 uses CHECK constraints; mirror this by using `String` columns with a `///` comment listing the allowed values. This preserves Prisma client portability and prevents the F1-style "enums are runtime values" trap from recurring.
  - JSONB columns as `Json`.
  - Partial unique indexes are NOT declared in Prisma (Prisma 5 cannot model them); document that they live in the migration's raw SQL (Step 6).
  - CHECK constraints are NOT declared in Prisma; same — live in raw SQL.
  - View `live_readings_projection`: pick (a) declare as Prisma `view` (with `views` preview feature) or (b) define only in raw SQL and query via `prisma.$queryRaw` in F4.6. Document the choice.
  - Circular FK between `jobs.commissioning_snapshot_id` and `commissioning_snapshots.job_id` is declared as two relations; Prisma migrate sequences the SQL.

### Step 5 — Quarantine F1 backend modules in `app.module.ts`

Edit `apps/backend/src/app.module.ts`:

- Remove (or comment with a clear F4.2B marker) the imports and `imports: [...]` entries for: `CanonicalTagsModule`, `TenantsModule`, `WellsModule`, `EquipmentModule`, `JobsModule`, `TelemetryModule`.
- Keep: `ConfigModule`, `LoggerModule`, `PrismaModule`, `HealthModule`, `RealtimeModule`.
- Add a header comment that points to this document and to the F4.4 reactivation plan.

### Step 6 — Quarantine F1 module source from typecheck/test compile

Edit `apps/backend/tsconfig.json`:

- Add to `exclude`:
  - `"src/wells/**"`
  - `"src/tenants/**"`
  - `"src/tags/**"`
  - `"src/equipment/**"`
  - `"src/jobs/**"`
  - `"src/telemetry/**"`
- This removes the F1-dependent source from both TypeScript compilation and vitest compilation (vitest reads from `tsconfig.json`).

Edit `apps/backend/vitest.config.ts`:

- Optionally, add `"src/telemetry/unit-converter.spec.ts"` and `"src/telemetry/telemetry.validator.spec.ts"` back to `include` if you want the pure-math specs to keep running. **Recommend:** skip this — losing 2 trivial specs for the F4.2 → F4.4 window is acceptable, and adding back specs whose containing directory is `tsconfig`-excluded creates surprising behavior.

### Step 7 — Author the baseline migration

- Two acceptable approaches:
  - **(a) Generate from Prisma diff against an empty DB.** `pnpm --filter @rvf/backend exec prisma migrate dev --name f4_2_baseline --create-only` against a freshly reset local DB. Hand-edit `migration.sql` to add: `CREATE EXTENSION IF NOT EXISTS pgcrypto;`, all partial unique indexes (`CREATE UNIQUE INDEX ... WHERE ...`), all CHECK constraints, the `live_readings_projection` view definition. Requires a live DB connection.
  - **(b) Author migration.sql by hand from `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql`.** Lower drift; recommended. No DB connection needed.
- Name: `apps/backend/prisma/migrations/20260524000000_f4_2_baseline/migration.sql` (use execution date).
- Add `apps/backend/prisma/migrations/migration_lock.toml` if absent (the archived one stays in `migrations.f1-archive/`).

### Step 8 — Regenerate the Prisma client

- `pnpm --filter @rvf/backend exec prisma generate`
- No DB connection required.
- Verify `node_modules/.prisma/client/` exposes the F4 model accessors.

### Step 9 — Quality gates (must all be green)

Run in order:

1. `pnpm run lint` — must be green across all workspaces.
2. `pnpm run typecheck` — must be green across all workspaces.
3. `pnpm run build` — must be green across all workspaces.
4. `pnpm run test` — backend test suite must pass (only `health.controller.spec.ts` runs because the rest are quarantined).
5. `pnpm --filter @rvf/frontend dev` — frontend must still render via the `lib/api-data/` mock adapter; no UI regression.

If any gate fails, fix the cause **before** adding more quarantine exclusions. If a file outside the planned quarantine zones breaks, that signals a missed dependency — investigate, do not silently extend the exclude list.

### Step 10 — Documentation deliverables

- Update `apps/backend/README.md` (or add an `F4_2_NOTES.md` at the backend root) with: which modules are quarantined, why, how to reactivate them, where the F1 source lives in git.
- Author the F4.2 closeout report `docs/architecture/RVF_Malinois_F4_2_Prisma_Migration_Report.md` (separate phase deliverable, not produced by F4.2B-0).

### Step 11 — No commit until reviewer sign-off

- F4.2B-0 ends at "ready for review". No `git commit`. No `git push`.
- Reviewer confirms quality gates, then the implementer commits.

### Order-of-operations rationale

Steps 1–3 are reversible filesystem renames — do them first because they document intent in git without touching code. Step 4 (schema replacement) is the high-risk edit; do it before the backend insulation (Steps 5–6) so that, in the unlikely case the schema swap reveals an unknown dependency, the insulation can be widened in the same PR. Step 7 (migration authoring) can be parallelized with Step 4 if (b) is chosen. Step 8 (`prisma generate`) must follow Steps 4 and 7. Steps 9–10 are validation and documentation.

## 11. Files Expected to Change in F4.2B

| Path | Change |
|---|---|
| `apps/backend/prisma/schema.prisma` | Full rewrite — replaces 618-line F1 schema with F4-aligned schema. |
| `apps/backend/prisma/migrations.f1-archive/` (new directory, renamed from `migrations/`) | Three F1 migration folders moved here; new `README.md` describing archive status. |
| `apps/backend/prisma/migrations/20260524000000_f4_2_baseline/migration.sql` (new) | Single F4 baseline migration. |
| `apps/backend/prisma/migrations/migration_lock.toml` (new copy) | Standard `provider = "postgresql"`. |
| `apps/backend/prisma/seed.f1.ts.bak` (renamed from `seed.ts`) | Quarantined. F4.3 authors a new `seed.ts`. |
| `apps/backend/scripts/legacy/generate-sample-telemetry.ts.bak` (renamed from `scripts/generate-sample-telemetry.ts`) | Quarantined. F4.6 authors a new generator. |
| `apps/backend/src/app.module.ts` | Remove `CanonicalTagsModule`, `TenantsModule`, `WellsModule`, `EquipmentModule`, `JobsModule`, `TelemetryModule` from `imports`. Add comment block referencing this document. |
| `apps/backend/tsconfig.json` | Extend `exclude` with the six F1-dependent feature directories. |
| `apps/backend/vitest.config.ts` | Optional: no change recommended. If pure-math specs are kept, add explicit `include` overrides. |
| `apps/backend/package.json` | If a `"prisma": { "seed": "..." }` field exists pointing at `seed.ts`, remove or repoint to a no-op for the F4.2 → F4.3 window. |
| `apps/backend/README.md` or new `apps/backend/F4_2_NOTES.md` | Document the quarantine: modules affected, reactivation path, F4.4 link. |
| `docs/architecture/RVF_Malinois_F4_2_Prisma_Migration_Report.md` (new) | F4.2 closeout report (separate deliverable from this F4.2B-0 confirmation). |

## 12. Files That Must Not Change in F4.2B

- **All quarantined backend source files.** Their existence in git is the F4.4 reference material. Do not edit them. Do not delete them. Do not refactor them. Specifically untouched:
  - `apps/backend/src/wells/*`
  - `apps/backend/src/tenants/*`
  - `apps/backend/src/tags/*`
  - `apps/backend/src/equipment/*`
  - `apps/backend/src/jobs/*`
  - `apps/backend/src/telemetry/*` (including the pure-math files and their specs)
- **`apps/backend/src/prisma/prisma.service.ts` / `prisma.module.ts`.** These only import `PrismaClient` (no specific model/enum), so they remain compile-safe across the schema swap.
- **`apps/backend/src/health/*`, `apps/backend/src/realtime/*`, `apps/backend/src/config/*`, `apps/backend/src/common/*`, `apps/backend/src/main.ts`.** No Prisma dependency; no change required.
- **`apps/frontend/**`** — frontend is untouched. F3 mock adapter (`apps/frontend/.../lib/api-data/`) remains the source of frontend data during the F4.2 → F4.4 window.
- **`packages/**`** — no shared packages depend on the F1 client (verified by absence of `from '@prisma/client'` outside `apps/backend`).
- **`docker-compose.yml`** — TimescaleDB image stays. The `timescaledb` extension is opt-in; not declaring it leaves it dormant. Image swap to vanilla `postgres:16` is a separate infra ticket post-F4.6.
- **Root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`** — no dependency or build pipeline change required.
- **F4.1 SQL file** (`database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql`) — canonical, do not edit during F4.2B.
- **Existing F4 architecture documents and ADRs** — informational sources; do not edit.
- **`.github/workflows/`** — does not exist; do not create in F4.2B.
- **`packages/types/src/domain.ts`** (if present, was referenced by F1 schema header) — verify untouched; F4.2B does not change shared domain types. Contract evolution belongs to F4.4.

## 13. Rollback Strategy

F4.2B runs on a feature branch and does not commit until the reviewer signs off, so the primary rollback is **do not commit**: discard the working tree and re-checkout `main`. Detail:

| Failure point | Rollback |
|---|---|
| Quality gate fails (lint/typecheck/build/test) | Diagnose root cause. If the quarantine missed a dependency, widen the quarantine in the same change. If schema authoring is wrong, fix `schema.prisma`. Re-run gates. Do not commit until all gates green. |
| Reviewer rejects the strategy | `git stash` the working tree (or `git checkout -- .` if no value to preserve) and start over with the reviewer's preferred strategy. No remote state has been affected. |
| Need to revert after commit but before merge | `git reset --hard origin/main` on the feature branch. F1 source is untouched in the working tree by construction. Archived migrations restore by moving `migrations.f1-archive/` back to `migrations/`. Renamed seed/script restore by reverting their `.bak` suffix. |
| Need to revert after merge to `main` | `git revert <merge-commit>` produces an inverse commit. Because no other code changed in F4.2B, the revert is mechanical and complete. F4.3 / F4.4 work that depends on F4.2B is not yet underway by definition (F4.2B is a precondition). |
| Local dev DB landed in a broken state | `docker compose down -v && docker compose up -d postgres && pnpm --filter @rvf/backend exec prisma migrate dev` brings up a clean F4.2 DB. No shared dev DB exists; no other developer is affected. |

**No data-loss risk.** Per F4.2A §5.6: no production DB, no shared dev DB. Local volumes are recreatable from seed (when F4.3 lands; during F4.2B no seed runs).

## 14. Acceptance Criteria for F4.2B

1. `apps/backend/prisma/schema.prisma` aligns 1:1 with `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql` (20 tables, JSONB where the SQL has JSONB, no `enum` declarations, no `timescaledb` extension declaration).
2. Exactly one new Prisma migration exists at `apps/backend/prisma/migrations/20260524000000_f4_2_baseline/` (or the date of execution). Three F1 migrations live under `apps/backend/prisma/migrations.f1-archive/` with a README documenting their status.
3. `apps/backend/src/app.module.ts` imports only `ConfigModule`, `LoggerModule`, `PrismaModule`, `HealthModule`, `RealtimeModule`.
4. `apps/backend/tsconfig.json` excludes `src/wells/**`, `src/tenants/**`, `src/tags/**`, `src/equipment/**`, `src/jobs/**`, `src/telemetry/**`.
5. `apps/backend/prisma/seed.ts` is renamed to `seed.f1.ts.bak`; `package.json` no longer references a seed entry point pointing at the renamed file.
6. `apps/backend/scripts/generate-sample-telemetry.ts` is renamed to `scripts/legacy/generate-sample-telemetry.ts.bak`.
7. `pnpm run lint` is green across all workspaces.
8. `pnpm run typecheck` is green across all workspaces.
9. `pnpm run build` is green across all workspaces (backend and frontend).
10. `pnpm run test` for the backend passes with only `health.controller.spec.ts` reporting tests (the 6 quarantined specs are excluded by the tsconfig exclude propagating into vitest).
11. Frontend renders via the F3 `lib/api-data/` mock adapter with no UI regression.
12. No live database connection is required for any quality gate. The Prisma client is generated; no service binds it for feature work in F4.2B.
13. No seed data is produced. No telemetry ingestion is wired. No authentication is added.
14. `apps/backend/README.md` (or new `F4_2_NOTES.md`) documents the quarantine: which modules, why, how F4.4 reactivates them.
15. `docs/architecture/RVF_Malinois_F4_2_Prisma_Migration_Report.md` is produced as the F4.2 closeout (separate deliverable from F4.2B-0).
16. The PR description references this F4.2B-0 confirmation document and F4.2A.
17. No commit is made until reviewer sign-off.

## 15. Out of Scope

F4.2B is strictly a **schema baseline + backend insulation** phase. The following are explicitly out of scope:

- **API contract evolution.** Endpoint shapes, response field renames, F1 → F4 contract translation — all belong to F4.4.
- **Service-layer logic for F4 entities.** No code is written against `transmitter_devices`, `sensor_tag_bindings`, `unit_configurations`, `unit_operating_envelopes`, `alarm_thresholds`, `alarm_events`, `integration_sources`, `integration_mappings`, or `audit_logs`. That is F4.4.
- **Seed data.** No seed file is authored. No reference rows are inserted. That is F4.3.
- **Telemetry ingestion.** No writes to `telemetry_readings`. No edge adapter. No idempotency layer. That is F4.6.
- **Frontend changes.** No edits to `apps/frontend/`. Frontend continues to render via the F3 `lib/api-data/` mock adapter. UI connection to a live backend is F4.5.
- **Production database connection.** No `DATABASE_URL` change for staging/prod. No CI deploy. No `.github/workflows/` additions.
- **Real authentication.** `users` remains a placeholder per F4 §D. No password hashing, no MFA, no JWT issuance.
- **Reports / dashboards.** No reporting endpoints, no analytic queries.
- **TimescaleDB swap.** The dev `docker-compose.yml` keeps the TimescaleDB image; the extension is dormant. A vanilla `postgres:16` swap is a separate infra ticket.
- **Deletion of archived F1 migrations or quarantined source.** They stay in git. F4.4 may delete a module's source after its F4 replacement lands; that is F4.4's choice, not F4.2B's.
- **F4.2 closeout report content.** This document is the **F4.2B-0 strategy confirmation**. The implementation closeout (`RVF_Malinois_F4_2_Prisma_Migration_Report.md`) is a separate deliverable that runs after Step 11 of the execution plan.

## 16. Open Questions / Risks

| # | Item | Resolution path |
|---|---|---|
| Q1 | Should `live_readings_projection` be declared as a Prisma `view` (preview feature) or only in raw SQL? | Decide during Step 4 of the execution plan. Recommend: raw SQL only for F4.2B; F4.6 revisits when telemetry-read code lands. |
| Q2 | Should UUID defaults come from `gen_random_uuid()` (SQL-side, requires `pgcrypto` extension) or `uuid()` (application-side, no extension)? | Decide during Step 4. Recommend: `gen_random_uuid()` to match F4.1 SQL, declaring `extensions = [pgcrypto]` in the datasource. |
| Q3 | Should the F4.2B baseline migration be generated by `prisma migrate dev --create-only` then hand-edited, or authored by hand from the F4.1 SQL file? | Recommend hand-authored (approach (b) in Step 7) — lower drift, no DB required, easier to audit. |
| R1 | A reviewer disagrees with quarantining `TenantsModule` / `WellsModule` because they look "trivial to rewrite". | Push back with §8 Mode 4 analysis: even trivial rewrites involve API contract decisions that belong to F4.4. Cite engineering-architecture principle that schema swap and contract evolution should not share a PR. |
| R2 | Prisma cannot model CHECK constraints — drift risk between Prisma schema and DB. | Documented in F4.2A R5. Mitigation: CHECKs live in raw SQL inside the migration; F4.4 adds an integration test that round-trips invalid values through the API to confirm DB-level rejection. |
| R3 | Prisma cannot model partial unique indexes — introspection silently drops them. | Documented in F4.2A R6. Mitigation: partial uniques are created via raw `CREATE UNIQUE INDEX … WHERE …` in the baseline migration; application code uses plain INSERT / UPSERT and lets the DB enforce. Document the gap in the F4.2 closeout. |
| R4 | Quarantined pure-math specs (`unit-converter.spec.ts`, `telemetry.validator.spec.ts`) lose CI coverage for the F4.2 → F4.4 window. | Acceptable. Both files test pure functions whose behavior is well-covered and rarely changes. Coverage returns when F4.4 reactivates `src/telemetry/`. |
| R5 | A future developer runs `pnpm prisma db seed` during the F4.2 → F4.3 window and crashes on "module not found". | Mitigation: confirm `apps/backend/package.json` has no `"prisma": { "seed": "…" }` field pointing at the renamed file, or set it to a no-op `echo 'F4.2B window: no seed available'`. Document in `F4_2_NOTES.md`. |
| R6 | Backend `/api/v1/*` returning 404 might be mistaken for a regression by anyone running the dev server. | Mitigation: clear `README.md` / `F4_2_NOTES.md` note. The frontend's mock-adapter behavior is documented from F3; no actual consumer is affected. |
| R7 | The PR ends up too large to review easily (schema + migrations + quarantine + docs). | Strategy: PR description leads with this F4.2B-0 document. Reviewer reads strategy first, then diffs schema.prisma against the F4.1 SQL file (1:1 mapping), then verifies the insulation diff (3 files: app.module.ts, tsconfig.json, optional vitest.config.ts) is exactly what this document predicts. Quality gates (`pnpm lint / typecheck / build / test`) are the final acceptance signal. |
| R8 | A subsequent phase reactivates a module without rewriting it to the F4 client. | Mitigation: F4.4 plan should require that reactivation in `app.module.ts` is paired with a confirmed F4 client rewrite in the same PR. Document this rule in `F4_2_NOTES.md`. |
| R9 | F4.4 takes longer than expected, leaving the backend in "/health only" mode for many weeks. | Acceptable for this project (no production traffic, frontend has mock adapter). If the window grows past a planning checkpoint, F4.4 can be split into per-module sub-phases (F4.4a tenants, F4.4b wells, …) without re-doing F4.2B. |

---

*End of F4.2B-0 strategy confirmation. This document does not modify any code, schema, migration, package file, seed, or test. F4.2B execution begins on reviewer approval.*
