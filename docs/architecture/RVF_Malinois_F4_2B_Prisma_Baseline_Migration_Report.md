# RVF Malinois — F4.2B Prisma Baseline Migration Report

> Phase **F4.2B — Prisma Baseline Migration + Backend Insulation**.
> Strategy reference: `docs/architecture/RVF_Malinois_F4_2B_Insulation_Strategy_Confirmation.md` (commit `a8862e2`).
> Plan reference: `docs/architecture/RVF_Malinois_F4_2A_Prisma_Reconciliation_Plan.md` (commit `7bd6103`).
> Architecture reference: `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md` (commit `f36923a`).
> ADR reference: `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md` (commit `8147399`).
> SQL source of truth: `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql` (commit `a475066`).

## 1. Summary

F4.2B replaces the F1/F1.5 Prisma stack with a Prisma baseline aligned 1:1 with the F4 canonical PostgreSQL schema, and bundles the minimum backend insulation needed to keep lint / typecheck / build green while the F1 service/spec source is preserved for the F4.4 rewrite. The execution followed the **Mode 1 — Module quarantine** strategy approved in the F4.2B-0 confirmation document:

- `apps/backend/prisma/schema.prisma` rewritten to model 20 F4 tables (no TimescaleDB, `pgcrypto` for UUID generation, CHECK constraints documented in `///` comments, partial unique indexes documented and deferred to raw SQL).
- A new baseline migration `apps/backend/prisma/migrations/20260524000000_f4_2_baseline/migration.sql` was hand-authored from the F4.1 SQL file. It creates the 20 tables, indexes, partial unique indexes, CHECK constraints, FKs, and the derived `live_readings_projection` view. No TimescaleDB, no hypertables, no seed inserts.
- The three F1/F1.5 migrations were archived (not deleted) under `apps/backend/prisma/migrations.f1-archive/` with a README explaining their status.
- `apps/backend/src/app.module.ts` was reduced to the safe modules (`ConfigModule`, `LoggerModule`, `PrismaModule`, `HealthModule`, `RealtimeModule`). The six F1-dependent feature modules were removed from bootstrap with a documented header comment.
- `apps/backend/tsconfig.json`, `apps/backend/eslint.config.mjs`, and `apps/backend/vitest.config.ts` were extended with matching excludes/ignores so the quarantined source does not break typecheck, lint, or test runs.
- `apps/backend/prisma/seed.ts` was renamed to `seed.f1.ts.bak`. The legacy telemetry generator `apps/backend/scripts/generate-sample-telemetry.ts` was moved to `apps/backend/scripts/legacy/generate-sample-telemetry.ts.bak`. The `package.json` `prisma.seed` field and the `telemetry:sample` script were removed.

Quality gates ran clean: `pnpm run lint`, `pnpm run typecheck`, `pnpm run build` (workspace-wide) all green; backend test suite passes with the single `health.controller.spec.ts` (1 test); `pnpm --filter @rvf/backend exec prisma validate` and `prisma generate` both succeed without a database connection.

No commit was made.

## 2. Files Changed

### 2.1 Schema and migrations

| Path | Change |
|---|---|
| `apps/backend/prisma/schema.prisma` | **Rewritten.** 20 F4 models, `extensions = [pgcrypto]`, no Prisma `enum` blocks (CHECK constraints documented in `///` comments and enforced via raw SQL in migration). |
| `apps/backend/prisma/migrations/20260524000000_f4_2_baseline/migration.sql` | **New.** Hand-authored from the F4.1 SQL file. ~430 lines. |
| `apps/backend/prisma/migrations/migration_lock.toml` | **New copy.** Standard `provider = "postgresql"`. |
| `apps/backend/prisma/migrations.f1-archive/` | **Renamed (preserved).** Contains the three F1/F1.5 migrations and their original `migration_lock.toml`. |
| `apps/backend/prisma/migrations.f1-archive/README.md` | **New.** Explains archive status, why F4 supersedes F1, and that these migrations must not be replayed. |

### 2.2 Quarantined seed and script

| Path | Change |
|---|---|
| `apps/backend/prisma/seed.f1.ts.bak` | Renamed from `apps/backend/prisma/seed.ts`. F4.3 authors a new `seed.ts`. |
| `apps/backend/scripts/legacy/generate-sample-telemetry.ts.bak` | Renamed from `apps/backend/scripts/generate-sample-telemetry.ts`. F4.6 may revisit when telemetry ingestion lands. |

### 2.3 Backend insulation

| Path | Change |
|---|---|
| `apps/backend/src/app.module.ts` | Removed `CanonicalTagsModule`, `TenantsModule`, `WellsModule`, `EquipmentModule`, `JobsModule`, `TelemetryModule` from imports. Kept `ConfigModule`, `LoggerModule`, `PrismaModule`, `HealthModule`, `RealtimeModule`. Header comment cites the F4.2B strategy. |
| `apps/backend/tsconfig.json` | Added quarantined directories to `exclude`: `src/wells/**`, `src/tenants/**`, `src/tags/**`, `src/equipment/**`, `src/jobs/**`, `src/telemetry/**`. |
| `apps/backend/eslint.config.mjs` | Layered an `ignores` block over the inherited Nest config for the same six directories (needed because `eslint src` is path-driven and `recommendedTypeChecked` would otherwise compile-check quarantined files). |
| `apps/backend/vitest.config.ts` | Added `exclude` for the six quarantined directories so `pnpm test` does not attempt to compile their specs. |
| `apps/backend/prisma/tsconfig.json` | `include` reduced to `[]`. The previous list referenced `seed.ts` (renamed) and `../src/telemetry/contracts/**/*.ts` (quarantined); F4.3 / F4.4 will reintroduce active sources. |
| `apps/backend/package.json` | Removed `scripts.prisma:seed`, `scripts.telemetry:sample`, and the top-level `prisma.seed` field (all pointed at quarantined files). |

### 2.4 Documentation

| Path | Change |
|---|---|
| `docs/architecture/RVF_Malinois_F4_2B_Prisma_Baseline_Migration_Report.md` | **New.** This document. |

No frontend, no shared packages, no infrastructure, no docker-compose, no `.github/`, no root `package.json`, no `turbo.json` changes.

## 3. Prisma Baseline Created

### 3.1 Models (20)

`Tenant`, `User`, `EquipmentType`, `MeasurementUnit`, `Sensor`, `TransmitterDevice`, `CanonicalTag`, `SensorTagBinding`, `UnitConfiguration`, `UnitOperatingEnvelope`, `AlarmRule`, `AlarmThreshold`, `AlarmEvent`, `Well`, `Job`, `CommissioningSnapshot`, `TelemetryReading`, `IntegrationSource`, `IntegrationMapping`, `AuditLog`.

Each model uses `@@map("<snake_case_table_name>")` to match the F4.1 SQL table names exactly. Field names use camelCase in TypeScript and `@map("snake_case")` to match column names. Primary keys are `String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`, matching the F4.1 SQL `UUID PRIMARY KEY DEFAULT gen_random_uuid()`.

### 3.2 Datasource and generator

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
  binaryTargets   = ["native", "debian-openssl-3.0.x", "linux-arm64-openssl-3.0.x"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgcrypto]
}
```

The `timescaledb` extension declaration was removed (it was the F1/F1.5 dependency that F4 explicitly drops). The `pgcrypto` extension is declared so Prisma migrate auto-runs `CREATE EXTENSION IF NOT EXISTS pgcrypto` on a fresh database; the baseline migration also issues the statement explicitly for clarity.

### 3.3 Type mapping

| F4.1 SQL type | Prisma type |
|---|---|
| `UUID` | `String @db.Uuid` (with `@default(dbgenerated("gen_random_uuid()"))` for IDs) |
| `TEXT` | `String` |
| `INTEGER` | `Int` |
| `BIGINT` | `BigInt` |
| `NUMERIC` | `Decimal @db.Decimal` |
| `BOOLEAN` | `Boolean` |
| `TIMESTAMPTZ` | `DateTime @db.Timestamptz(6)` |
| `DATE` | `DateTime @db.Date` |
| `JSONB` | `Json` |
| `INET` | `String @db.Inet` |

### 3.4 Enums

**None.** Per the strategy, every F4.1 SQL CHECK constraint is preserved in the migration SQL but is **not** modeled as a Prisma `enum`. The corresponding Prisma fields are plain `String`; the allowed values are documented inline via `///` comments next to each field. This avoids the F1-style trap where enum values are leaked into application code as runtime constants, and it lets F4 evolve the allowed value sets without a Prisma client regeneration.

Affected constraints (representative, not exhaustive): `tenants.status`, `users.role`, `users.status`, `measurement_units.status`, `measurement_units.operating_profile`, `sensors.type`, `transmitter_devices.protocol`, `transmitter_devices.installation_status`, `alarm_rules.severity`, `alarm_thresholds.kind`, `alarm_events.severity`, `alarm_events.state`, `alarm_events.threshold_violated`, `jobs.status`, `telemetry_readings.quality`, `telemetry_readings.source`, `integration_sources.kind`, `integration_sources.status`, `audit_logs.action`.

### 3.5 Partial unique indexes

Prisma 5 does not model partial unique indexes (`WHERE …`). The baseline migration creates them in raw SQL. Affected indexes:

| Index | Predicate |
|---|---|
| `sensor_tag_bindings_sensor_active_uk` | `WHERE effective_to IS NULL` |
| `unit_configurations_unit_current_uk` | `WHERE is_current = TRUE` |
| `unit_operating_envelopes_unit_current_uk` | `WHERE is_current = TRUE` |
| `alarm_rules_unit_tag_severity_current_uk` | `WHERE is_current = TRUE` |
| `transmitter_devices_sensor_active_idx` (non-unique partial) | `WHERE installation_status = 'installed'` |
| `alarm_events_active_idx` (non-unique partial) | `WHERE state = 'active'` |
| `telemetry_readings_job_time_idx` (non-unique partial) | `WHERE job_id IS NOT NULL` |

The Prisma client knows nothing about the partial predicate; application code performs plain INSERT/UPSERT and lets the DB enforce. This is acceptable per the F4.2A risk register (R6).

### 3.6 Circular FK

`jobs.commissioning_snapshot_id → commissioning_snapshots(id)` and `commissioning_snapshots.job_id → jobs(id)`. The migration creates `jobs` without the back-FK first, then `commissioning_snapshots`, then `ALTER TABLE jobs ADD CONSTRAINT jobs_commissioning_snapshot_fk …`. The Prisma schema declares both relations using named relations (`JobCurrentSnapshot`, `CommissioningSnapshotJob`).

### 3.7 View

`live_readings_projection` is **not** modeled in Prisma. It is defined as raw SQL in the migration (`CREATE OR REPLACE VIEW …`). Consumers in F4.6 will either read it via `$queryRaw` or be migrated to whatever projection mechanism F4.6 picks (view, materialized view, upsert table, application cache). Keeping it out of the Prisma schema avoids dependence on Prisma's preview `views` feature and matches the deliberate decision recorded in the F4.2B-0 strategy (§16 Q1).

## 4. Migration Strategy

Hand-authored from the F4.1 SQL file. Rationale:

- F4.1 already exists and has been reviewed; it is the canonical source of truth per ADR-007.
- The baseline migration is essentially a 1:1 copy of F4.1 SQL with no behavioral changes.
- Generating via `prisma migrate dev --create-only` would have required a live database and would still need hand-editing to add CHECK constraints, partial unique indexes, and the view (Prisma does not emit any of these from the schema).
- Hand-authoring drifts the least, is easiest to audit against the F4.1 file, and does not require a DB connection at authoring time.

The migration is a single file: `apps/backend/prisma/migrations/20260524000000_f4_2_baseline/migration.sql`. Its layout follows F4.1 SQL section by section (A. Tenancy and identity → J. Audit log) with comments preserved where they document architectural intent.

`prisma validate` returns `The schema at prisma/schema.prisma is valid 🚀`. `prisma generate` succeeds without DB connection and produces a client whose model accessors include `prisma.tenant`, `prisma.measurementUnit`, `prisma.transmitterDevice`, `prisma.sensorTagBinding`, `prisma.unitConfiguration`, `prisma.unitOperatingEnvelope`, `prisma.alarmRule`, `prisma.alarmThreshold`, `prisma.alarmEvent`, `prisma.telemetryReading`, `prisma.integrationSource`, `prisma.integrationMapping`, `prisma.auditLog`, `prisma.canonicalTag`, `prisma.commissioningSnapshot`, `prisma.equipmentType`, `prisma.well`, `prisma.job`, `prisma.user`, and `prisma.sensor`. No F1 model accessors (`equipmentUnit`, `signalFireDevice`, `jobSensorSnapshot`, `telemetry`, `sensorHealth`, `lateTelemetryQuarantine`, `operationalEvent`, `rvfMeta`) remain in the generated client.

## 5. What Happened to F1/F1.5 Migrations

The three previously-active migrations were moved, not deleted:

| Original path | New path |
|---|---|
| `apps/backend/prisma/migrations/20260519000000_init_timescaledb/migration.sql` | `apps/backend/prisma/migrations.f1-archive/20260519000000_init_timescaledb/migration.sql` |
| `apps/backend/prisma/migrations/20260520174418_f1_domain_model/migration.sql` | `apps/backend/prisma/migrations.f1-archive/20260520174418_f1_domain_model/migration.sql` |
| `apps/backend/prisma/migrations/20260520185255_f1_5_telemetry_hypertables/migration.sql` | `apps/backend/prisma/migrations.f1-archive/20260520185255_f1_5_telemetry_hypertables/migration.sql` |
| `apps/backend/prisma/migrations/migration_lock.toml` | `apps/backend/prisma/migrations.f1-archive/migration_lock.toml` (preserved copy; the active history has its own) |

`apps/backend/prisma/migrations.f1-archive/README.md` documents:

- Archive status: do not replay; not part of active history.
- Why F4.2 superseded rather than evolved them (substantively different schemas, no production data, ADR-007 makes F4 canonical).
- That the archived `migration_lock.toml` is retained for forensic reference; the active `apps/backend/prisma/migrations/migration_lock.toml` is a fresh copy.

The reset procedure for a developer landing on this branch is documented in the strategy doc (§10 step 10): `docker compose down -v && docker compose up -d postgres && pnpm --filter @rvf/backend exec prisma migrate dev`. This applies only the F4.2 baseline. The archived migrations are never reapplied.

## 6. Backend Insulation Strategy Applied

**Mode 1 — Module quarantine**, exactly as specified in the F4.2B-0 confirmation document (§9, §10 Step 5–6).

### 6.1 What was removed from app bootstrap

In `apps/backend/src/app.module.ts`, the following imports were removed from the `imports` array (and from the file's `import` statements at the top):

- `CanonicalTagsModule` (was `/api/v1/tags`)
- `TenantsModule` (was `/api/v1/tenants`)
- `WellsModule` (was `/api/v1/wells`)
- `EquipmentModule` (was `/api/v1/equipment`)
- `JobsModule` (was `/api/v1/jobs` + commissioning service)
- `TelemetryModule` (was `/api/v1/telemetry` trends + ingest scaffolding)

The `AppModule` now imports only `ConfigModule`, `LoggerModule` (via `nestjs-pino`), `PrismaModule`, `HealthModule`, and `RealtimeModule`. The header comment in `app.module.ts` explains the quarantine, lists the modules removed, and points at this document and the F4.2B-0 confirmation.

### 6.2 What was excluded from compile

`apps/backend/tsconfig.json` `exclude` was extended with the six quarantined directories:

```
"src/wells/**",
"src/tenants/**",
"src/tags/**",
"src/equipment/**",
"src/jobs/**",
"src/telemetry/**"
```

This handles `pnpm run typecheck` (`tsc --noEmit`) and `pnpm run build` (`nest build`, which uses tsc under the hood).

### 6.3 What was ignored by lint

The Nest ESLint preset uses `recommendedTypeChecked`, which compiles each file it touches. `eslint src` is path-driven (it does not respect tsconfig excludes), so the quarantined directories would still be parsed and would fail on removed `@prisma/client` exports. `apps/backend/eslint.config.mjs` was updated to layer an `ignores` block over the inherited config:

```js
export default [
  ...nest,
  {
    ignores: [
      'src/wells/**',
      'src/tenants/**',
      'src/tags/**',
      'src/equipment/**',
      'src/jobs/**',
      'src/telemetry/**',
    ],
  },
];
```

### 6.4 What was skipped by vitest

`apps/backend/vitest.config.ts` `exclude` was extended for the same six directories. The only spec that now runs is `apps/backend/src/health/health.controller.spec.ts`.

## 7. Modules Quarantined

Six Nest feature modules, with source preserved in place:

| Module | Source directory | Status | Reactivation phase |
|---|---|---|---|
| `CanonicalTagsModule` | `apps/backend/src/tags/` | Quarantined | F4.4 |
| `TenantsModule` | `apps/backend/src/tenants/` | Quarantined | F4.4 |
| `WellsModule` | `apps/backend/src/wells/` | Quarantined | F4.4 |
| `EquipmentModule` | `apps/backend/src/equipment/` | Quarantined | F4.4 |
| `JobsModule` | `apps/backend/src/jobs/` (includes `commissioning.service.ts`) | Quarantined | F4.4 |
| `TelemetryModule` | `apps/backend/src/telemetry/` (controller, validator, unit-converter, canonical-tag-resolver, trends.service, contracts) | Quarantined | F4.4 (read paths); F4.6 (ingestion paths) |

Modules still active during the F4.2 → F4.4 window:

| Module | Source directory | Notes |
|---|---|---|
| `ConfigModule` | `apps/backend/src/config/` | No Prisma dependency. |
| `LoggerModule` (`nestjs-pino`) | external | Inline in `AppModule.imports`. |
| `PrismaModule` | `apps/backend/src/prisma/` | Only imports `PrismaClient` (no specific model/enum); compile-safe across schema swap. The injected `PrismaService` is generated against the F4 baseline. |
| `HealthModule` | `apps/backend/src/health/` | No Prisma dependency. |
| `RealtimeModule` | `apps/backend/src/realtime/` | Socket.IO scaffolding; no Prisma dependency. |

## 8. Files/Directories Temporarily Excluded or Renamed

### 8.1 Renamed (preserved in git)

| Original | New |
|---|---|
| `apps/backend/prisma/migrations/` | `apps/backend/prisma/migrations.f1-archive/` (with new README) |
| `apps/backend/prisma/seed.ts` | `apps/backend/prisma/seed.f1.ts.bak` |
| `apps/backend/scripts/generate-sample-telemetry.ts` | `apps/backend/scripts/legacy/generate-sample-telemetry.ts.bak` |

### 8.2 Excluded from typecheck / build

`apps/backend/tsconfig.json` `exclude`: `src/wells/**`, `src/tenants/**`, `src/tags/**`, `src/equipment/**`, `src/jobs/**`, `src/telemetry/**`.

### 8.3 Ignored by ESLint

Same six directories, declared in `apps/backend/eslint.config.mjs`.

### 8.4 Excluded by vitest

Same six directories, declared in `apps/backend/vitest.config.ts`.

### 8.5 Neutralized

- `apps/backend/package.json` `scripts.prisma:seed` — removed.
- `apps/backend/package.json` `scripts.telemetry:sample` — removed.
- `apps/backend/package.json` top-level `prisma.seed` field — removed.
- `apps/backend/prisma/tsconfig.json` `include` — reduced to `[]` (previously listed `seed.ts` and quarantined contracts).

## 9. Confirmation: F4.3 / F4.4 / F4.5 / F4.6 Were NOT Implemented

- **F4.3 (Seed / reference data):** No seed file is authored. No reference rows are inserted by F4.2B. The migration SQL contains no `INSERT` statements, no `COPY`, no data of any kind. The new Prisma client has no seed configuration in `package.json`.
- **F4.4 (API adaptation):** No service, controller, contract, or spec under `src/wells`, `src/tenants`, `src/tags`, `src/equipment`, `src/jobs`, or `src/telemetry` was rewritten, edited, or otherwise modified. They remain in their F1 form, quarantined from compile/lint/test. No new endpoints were added. The active `AppModule` exposes only `/health` and the Socket.IO scaffolding.
- **F4.5 (UI connection):** No file under `apps/web/` was modified. The frontend continues to render via the F3 `lib/api-data/` mock adapter. No changes to API contracts, no environment variables added, no new pages.
- **F4.6 (Telemetry persistence):** No ingestion service, no writes to `telemetry_readings`, no `live_readings_projection` consumer. The view exists in the migration SQL but is not queried by any active service. The legacy `generate-sample-telemetry.ts` is quarantined.

## 10. Commands Run and Results

### 10.1 Prisma validate

```
$ pnpm --filter @rvf/backend exec prisma validate
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma

The schema at prisma/schema.prisma is valid 🚀
```

### 10.2 Prisma generate

```
$ pnpm --filter @rvf/backend exec prisma generate
✔ Generated Prisma Client (5.22.0) to ./node_modules/@prisma/client …
```

(No DB connection required for either command.)

### 10.3 Lint

```
$ pnpm --filter @rvf/backend run lint
> @rvf/backend@0.0.0 lint
> eslint src --max-warnings 0
[clean exit]

$ pnpm run lint   # workspace-wide
 Tasks:    4 successful, 4 total
Cached:    3 cached, 4 total
  Time:    1.522s
```

### 10.4 Typecheck

```
$ pnpm --filter @rvf/backend run typecheck
> @rvf/backend@0.0.0 typecheck
> tsc --noEmit --incremental false
[clean exit]

$ pnpm run typecheck   # workspace-wide
 Tasks:    4 successful, 4 total
Cached:    3 cached, 4 total
  Time:    730ms
```

### 10.5 Build

```
$ pnpm --filter @rvf/backend run build
> @rvf/backend@0.0.0 build
> nest build
[clean exit]

$ pnpm run build   # workspace-wide (backend + web)
 Tasks:    2 successful, 2 total
Cached:    1 cached, 2 total
  Time:    1.543s
```

### 10.6 Test (informational; not in F4.2B acceptance criteria)

```
$ pnpm --filter @rvf/backend run test
> @rvf/backend@0.0.0 test
> vitest run

 ✓ src/health/health.controller.spec.ts (1 test) 1ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
```

Only `health.controller.spec.ts` ran. The quarantined specs were skipped by the vitest `exclude` list, as designed.

### 10.7 Commands not run (and why)

- `prisma migrate dev` / `prisma migrate deploy` — not run. Per F4.2B scope, no live database connection is established and no migration is applied to any database. The `migration.sql` file is committed for review; `migrate dev` will replay it on a fresh local volume when a developer chooses to do so.
- `prisma db seed` — not run. No seed exists (intentional; F4.3 will author it).
- `docker compose up -d postgres` — not run. F4.2B is a code/schema change; bringing up the dev DB is a developer choice unrelated to the gate.

## 11. Known Limitations

1. **APIs dependent on quarantined modules are temporarily unavailable.** During the F4.2 → F4.4 window, the backend exposes only `/health` and the Socket.IO scaffolding. `/api/v1/{tenants,wells,tags,equipment,jobs,telemetry}` return 404. The frontend continues to render via `lib/api-data/` (F3 mock adapter); no UI consumer is affected.
2. **Seed data is not present until F4.3.** Running the backend against a freshly migrated database yields empty tables. There are no canonical tags, no tenants, no equipment types, no `EMMAD-01` or `EMGAD` reference rows. F4.3 authors a new seed against the F4 model.
3. **API adapter rewrite is F4.4.** Reactivating each quarantined module against the F4 Prisma client is F4.4's job, one module at a time. Reactivation must be paired with a confirmed F4 client rewrite in the same PR; do not unbox a module without rewriting its services.
4. **Telemetry persistence is F4.6.** No ingestion adapter writes to `telemetry_readings`. The `live_readings_projection` view exists but has no canonical row to project; F4.6 will both populate the table and pick the final projection mechanism (view, materialized view, upsert-maintained projection, application cache).
5. **CHECK constraints are not modeled in Prisma.** They live in the migration SQL. Application code can still send invalid string values; the database will reject the INSERT/UPDATE. F4.4 should add a thin Zod (or io-ts) validation layer at the controller boundary to fail-fast on invalid values before the round trip.
6. **Partial unique indexes are not modeled in Prisma.** They live in the migration SQL. Application code uses plain INSERT/UPSERT; the DB enforces the predicate. Prisma Studio and Prisma client introspection will not show these indexes.
7. **`live_readings_projection` view is not modeled in Prisma.** Consumers must use `$queryRaw` or migrate to F4.6's chosen projection mechanism. The F4.2B Prisma client has no first-class accessor for it.
8. **`auditLogs.action` is extensible by future migration.** The CHECK constraint enumerates a finite set of action strings (`created`, `updated`, `deleted`, `acknowledged`, `cleared`, `calibrated`, `replaced`, `commissioned`, `closed`). Future phases that add new actions must widen the constraint in a follow-up migration.
9. **Backend `PrismaService.onModuleInit` will fail at runtime if `DATABASE_URL` is unset or unreachable.** F4.2B does not run the backend, so this is not exercised. Developers who try `pnpm dev` without a running postgres will see the connection error — by design until F4.4 / F4.6 wire up real DB workflows.
10. **`docker-compose.yml` still pins a TimescaleDB image.** The `timescaledb` extension is not loaded by the F4 schema (and not declared in Prisma), so it lies dormant. Swapping the image to vanilla `postgres:16` is a follow-up infra ticket out of scope for F4.2B.
11. **`apps/backend/prisma/tsconfig.json` `include` is empty.** This tsconfig is now inert. F4.3 (seed) will reintroduce a valid include for the new `seed.ts`; F4.4 (telemetry rewrite) may also re-add contracts. Leaving the file in place avoids touching surrounding repo tooling expectations.

## 12. Rollback Strategy

F4.2B has not been committed. Rollback paths, ordered by likelihood:

1. **Reject before commit.** `git restore --staged . && git checkout -- .`. Untracked files (the new baseline migration directory, the archive README, and this report) are also untracked, so `git clean -fd apps/backend/prisma/migrations apps/backend/prisma/migrations.f1-archive docs/architecture/RVF_Malinois_F4_2B_Prisma_Baseline_Migration_Report.md` returns the tree to `main`'s state. No remote impact.
2. **Revert after commit but before merge.** `git reset --hard origin/main` on the feature branch. F1 source is untouched in the working tree by construction (all changes are renames or excludes; F1 service / spec / contract code was never edited). The archived migrations restore by moving `migrations.f1-archive/` back to `migrations/`. The seed and the legacy script restore by reverting their `.bak` suffix.
3. **Revert after merge to `main`.** `git revert <merge-commit>` produces an inverse commit. Because F4.2B is a precondition for F4.3 / F4.4, no downstream code depends on it at the time of revert; the revert is mechanical.
4. **Recover from accidental `prisma migrate dev` against a clean DB.** No risk: there is no production database and no shared dev database. Local recovery: `docker compose down -v && docker compose up -d postgres && pnpm --filter @rvf/backend exec prisma migrate dev` returns the local volume to the F4.2 baseline.

**No data-loss risk.** F4.2A §5.6 verified there is no production database. Local volumes are recreatable from migration alone (until F4.3 introduces a seed).

## 13. Next Phase Recommendation

**Recommend F4.3 — Seed / reference data — as the next phase.**

Rationale:

- **F4.3 is a precondition for F4.4 verification.** Reactivating a feature module (say, `WellsModule`) and rewriting `wells.service.ts` against `prisma.well` is hard to validate end-to-end without at least one tenant, one well, one canonical tag dictionary, and one measurement unit in place. F4.3 fills that gap.
- **F4.3 is low-risk and self-contained.** A seed script populates rows; no service rewrite, no contract evolution. Failure mode is local only (developer's dev DB).
- **F4.3 forces clarity on canonical reference data.** Drafting the F4 seed surfaces decisions (which canonical tags ship by default, which equipment types are RVF catalog vs tenant-private, which user roles exist) that F4.4 would otherwise resolve ad hoc.
- **F4.4 can then proceed module-by-module.** With seed data in place, the rewrite of `TenantsModule` (simplest) → `WellsModule` → `CanonicalTagsModule` → `EquipmentModule` → `JobsModule` → `TelemetryModule` (most complex) becomes incremental and verifiable. Each unboxed module reactivates its `tsconfig` / `eslint` / `vitest` exclude in the same PR.

Alternative: **F4.4 first, F4.3 in parallel.** If team capacity favors a different ordering, F4.4 can begin on simple modules without seed (using ad-hoc fixtures), and F4.3 lands in parallel. The strategy in the F4.2B-0 confirmation document allows either order; the recommendation here is to land F4.3 first for the reasons above.

Either way, **F4.5 (UI connection) should wait for F4.4** so the UI does not start consuming half-rewritten endpoints. **F4.6 (telemetry persistence)** is the last and most consequential phase; it can be planned in parallel with F4.4 but should not land until at least one F4.4 read endpoint is in production.

## 14. Acceptance Criteria — Status

| # | Criterion | Status |
|---|---|---|
| 1 | `apps/backend/prisma/schema.prisma` aligned with F4 canonical model. | **Met.** 20 models matching `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql`. |
| 2 | F1/F1.5 TimescaleDB datasource extension removed from Prisma schema. | **Met.** `extensions = [pgcrypto]` only. |
| 3 | A clear F4.2 baseline migration exists. | **Met.** `apps/backend/prisma/migrations/20260524000000_f4_2_baseline/migration.sql`. |
| 4 | F1/F1.5 migrations handled explicitly, not silently ignored. | **Met.** Archived under `apps/backend/prisma/migrations.f1-archive/` with README. |
| 5 | Backend old Prisma-dependent modules are quarantined per the approved strategy. | **Met.** Six modules removed from `AppModule`; source preserved; tsconfig/eslint/vitest excludes added. |
| 6 | `app.module.ts` starts only safe modules during the F4.2B → F4.4 transition. | **Met.** `ConfigModule`, `LoggerModule`, `PrismaModule`, `HealthModule`, `RealtimeModule`. |
| 7 | `lint` passes. | **Met.** Backend and workspace-wide. |
| 8 | `typecheck` passes. | **Met.** Backend and workspace-wide. |
| 9 | `build` passes. | **Met.** Backend (`nest build`) and workspace-wide. |
| 10 | No frontend files changed. | **Met.** No edits under `apps/web/`. |
| 11 | No UI changed. | **Met.** No edits under `packages/ui/`. |
| 12 | No seed data added. | **Met.** No `INSERT`s in migration; `prisma.seed` config removed. |
| 13 | No telemetry ingestion implemented. | **Met.** Legacy generator quarantined; no new ingestion code. |
| 14 | No API rewrite implemented beyond quarantine. | **Met.** All F1 service/controller/contract source preserved unchanged. |
| 15 | No production DB reset or connection attempted. | **Met.** No `migrate dev` / `migrate deploy` / `db push` / `db seed` invocations. |
| 16 | A F4.2B report is created. | **Met.** This document. |
| 17 | No commit made. | **Met.** All changes are staged or working-tree only. |

All acceptance criteria are met.
