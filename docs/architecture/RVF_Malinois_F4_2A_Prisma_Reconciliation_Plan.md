# RVF Malinois — F4.2A Prisma Reconciliation Plan

> Phase F4.2A — Analysis only. No code, no schema, no migrations, no DB connection.
> Companion documents:
> - `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md` (commit `f36923a`)
> - `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md` (commit `8147399`)
> - `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql` (commit `a475066`)
> - `docs/architecture/RVF_Malinois_F4_1_Schema_Implementation_Report.md` (commit `a475066`)

## 1. Executive Summary

The repository already contains a working Prisma stack from phases F1 and F1.5: a 618-line `apps/backend/prisma/schema.prisma`, three applied migrations (one of which enables the `timescaledb` extension and converts `telemetry` into a hypertable), a Prisma-backed NestJS backend with services, controllers, contracts, and tests, plus a non-trivial seed script. F4.1 added a parallel, canonical PostgreSQL DDL at `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql` that uses a deliberately different vocabulary (`MeasurementUnit`, `TransmitterDevice`, per-unit `AlarmRule`, append-only `telemetry_readings`, derived `live_readings_projection` view, etc.) and intentionally avoids TimescaleDB.

The two models cannot quietly coexist. The F1 Prisma schema and the F4.1 SQL foundation disagree on entity names, on FK shapes, on how alarms are modeled, on how telemetry is stored, and on which extensions the database depends on. ADR-007 makes the F4 model the canonical system of record; the F1 Prisma stack is therefore legacy by decision, regardless of how recently it was written.

F4.2 must reconcile this. The hard constraint is that the backend currently does **type-time** work against the F1 Prisma client across at least 14 source files (services, controllers, contracts, specs). Any clean replacement of `schema.prisma` immediately breaks `pnpm run lint`, `pnpm run typecheck`, and `pnpm run build` because the backend imports F1-only types (`EquipmentUnit`, `JobStatus`, `Quality`, `SensorType`, `LateTelemetryReason`, `TenantKind`, `EquipmentCategory`, `EngineeringUnitClass`) that will no longer exist.

This document does not change any code. It enumerates the current state, performs the gap analysis, evaluates four strategy options against repo evidence, recommends a path (Option B — **Clean reset, with mandatory bundled backend insulation**), and lays out the F4.2B implementation plan, the risk register, and the acceptance criteria so the next phase can be executed safely.

## 2. Current Prisma State

### 2.1 File layout

| Path                                                                         | Notes |
|------------------------------------------------------------------------------|-------|
| `apps/backend/prisma/schema.prisma`                                          | 618 lines. F1 + F1.5 domain model. |
| `apps/backend/prisma/seed.ts`                                                | Idempotent F1 seed: canonical tags, tenants, equipment types, EMMAD-01 unit + sensors + SignalFire devices, well CN-014, job JOB-2026-0001 with snapshot. |
| `apps/backend/prisma/migrations/migration_lock.toml`                         | `provider = "postgresql"`. |
| `apps/backend/prisma/migrations/20260519000000_init_timescaledb/`            | Enables `timescaledb` extension; creates marker table `_rvf_meta`. |
| `apps/backend/prisma/migrations/20260520174418_f1_domain_model/`             | Creates the F1 catalog + operation tables. |
| `apps/backend/prisma/migrations/20260520185255_f1_5_telemetry_hypertables/`  | Creates `telemetry`, `sensor_health`, `late_telemetry_quarantine`; sets up hypertable conversion. |
| `apps/backend/scripts/generate-sample-telemetry.ts`                          | Standalone script using `PrismaClient` + `Quality` directly. |

### 2.2 `datasource` and `generator`

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
  binaryTargets   = ["native", "debian-openssl-3.0.x", "linux-arm64-openssl-3.0.x"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [timescaledb]
}
```

The datasource is keyed on `DATABASE_URL`, so deployment-specific values are environment-resolved. The `postgresqlExtensions` preview feature is **on** and `extensions = [timescaledb]` is declared — meaning Prisma migrate currently expects the `timescaledb` extension to exist in the target database.

### 2.3 Existing models (18 total)

`Tenant`, `User`, `Well`, `EquipmentType`, `EquipmentUnit`, `CanonicalTag`, `Sensor`, `SignalFireDevice`, `Job`, `CommissioningSnapshot`, `JobSensorSnapshot`, `AlarmRule`, `OperationalEvent`, `AuditLog`, `Telemetry`, `SensorHealth`, `LateTelemetryQuarantine`, `RvfMeta`.

### 2.4 Existing enums (14 total)

`TenantKind`, `EquipmentCategory`, `SensorType` (`pressure_scout`, `sentinel_rtd`, `wireless_totalizer`, `water_cut_analyzer`, `other`), `EngineeringUnitClass`, `JobStatus`, `Quality` (`good`, `estimated`, `uncertain`, `bad`, `stale`), `AlarmState`, `AlarmSeverity` (`critical`, `high`, `medium`, `low`), `AlarmCondition` (`LO_LO`, `LO`, `HI`, `HI_HI`, `RATE`, `DEVIATION`, `NO_DATA`), `UserRole`, `OperationalEventKind`, `TelemetryDirection`, `HealthStatus`, `LateTelemetryReason`.

These are exposed as runtime values via `@prisma/client` and are referenced in **controllers and services**, not only at the type layer. Removing them requires either substitute string-literal unions in TypeScript or a coordinated rewrite.

### 2.5 Extensions used

- `timescaledb` — required by the generator/datasource and used by the F1.5 migration (`create_hypertable`, retention, compression).
- No `pgcrypto` declaration. F1 IDs are `cuid()` strings, not UUIDs.

### 2.6 Migration history

Three forward migrations, applied in order. The F0 marker table (`_rvf_meta`) lives across all three. There is no rollback / down migration. Local dev recovers state with `docker compose down -v && docker compose up -d && pnpm prisma migrate dev`.

### 2.7 Vocabulary check: F1 Prisma vs F4 canonical

The two vocabularies overlap on **names** but disagree on **shapes**. Key mismatches:

| F1 Prisma                | F4 canonical              | Mismatch |
|--------------------------|---------------------------|---|
| `EquipmentUnit` (asset, NOT tenant-scoped, cuid id) | `MeasurementUnit` (tenant-scoped, UUID id, `status` + `operating_profile`) | Different ownership model and identity strategy. |
| `Sensor.canonicalTagName` (soft string ref) + `Sensor.modbusRegister` + `SignalFireDevice` (separate physical-device table) | `sensors.engineering_unit` + `sensor_tag_bindings` (effective-dated FK binding) + `transmitter_devices` (generalized device — Modbus / HART / OPC-UA / wireless / 4-20mA) | Different binding mechanism (soft-by-name vs FK + history) and different device abstraction (SignalFire-specific vs vendor-agnostic). |
| `AlarmRule(jobId?, wellId?, canonicalTagName, condition, threshold, severity)` | `alarm_rules(unit_id, canonical_tag_id, severity, version, is_current, low_low/low/high/high_high)` | F1 alarms hang off job-or-well; F4 alarms hang off unit-and-tag, versioned, with four standard thresholds + per-unit envelope. ADR-005 invariant. |
| `JobSensorSnapshot` rows | `commissioning_snapshots` jsonb fields (`sensor_mappings`, `effective_thresholds`, `engineering_envelope`, `rule_versions`) | F1 normalizes; F4 captures as jsonb in a single immutable row. |
| `Telemetry` (hypertable, composite PK `(ts, job_id, canonical_tag_name)`) | `telemetry_readings` (plain table, UUID id, `tenant_id` first-class, `sensor_id` first-class, no hypertable, `quality IN ('good','uncertain','bad')`) | Different storage strategy (hypertable vs plain), different quality enum (5 values vs 3), different keying, different tenancy column position. |
| `Quality` has `estimated` and `stale` | `telemetry_readings.quality` is `good`/`uncertain`/`bad` only | Lossy mapping; `estimated` and `stale` have to be either dropped or remapped. |
| `AlarmCondition` UPPERCASE (`LO_LO`, `HI_HI`, `RATE`, `DEVIATION`, `NO_DATA`) | `alarm_thresholds.kind` lowercase (`low_low`, `low`, `high`, `high_high`, `rate_of_change`) + no `DEVIATION`/`NO_DATA` | Casing change and missing kinds. |
| `AlarmSeverity` (`critical`, `high`, `medium`, `low`) | `alarm_rules.severity` (`info`, `warning`, `critical`) | Different value set. |
| `SignalFireDevice` | (none) | F1 hard-coded to SignalFire; F4 generalizes to `transmitter_devices`. |
| `OperationalEvent` | (covered by `audit_logs` actions like `commissioned`/`closed`) | F4 collapses operational events into the central audit log. |
| `SensorHealth` (hypertable) | (no equivalent in F4.1) | F1.5 device-liveness time series has no F4.1 home. |
| `LateTelemetryQuarantine` | (no equivalent in F4.1) | F1.5 telemetry quarantine has no F4.1 home. |
| `RvfMeta` | (none) | F0 marker table, can be dropped. |

The verdict: the two schemas are **substantively different**, not cosmetically different. They model the same business but at different levels of abstraction (F4 is more ambitious — per-unit envelopes, vendor-agnostic transmitters, effective-dated bindings, generalized integration metadata) and with different operational invariants (per-unit alarms vs job/well-scoped alarms; UUID vs cuid; plain table vs hypertable).

## 3. Current Backend Prisma Usage

The backend wires Prisma into NestJS as a global module and consumes both **runtime values** (enums used in `switch`/comparisons and DTO validation) and **types** (model types in service signatures). Removing or renaming any of the existing models / enums will fail typecheck immediately.

### 3.1 Plumbing

- `apps/backend/src/prisma/prisma.module.ts` — global `PrismaModule`.
- `apps/backend/src/prisma/prisma.service.ts` — `PrismaService extends PrismaClient`.
- `apps/backend/src/app.module.ts` — imports `PrismaModule`.

### 3.2 Services and controllers (production code)

| File | What it uses |
|---|---|
| `wells/wells.service.ts` | `prisma.well.findMany / findUnique`; type `Well`. |
| `tenants/tenants.service.ts` | `prisma.tenant.findMany / findUnique`; types `Tenant`, `TenantKind`. |
| `tenants/tenants.controller.ts` | Runtime value `TenantKind` (enum imported as value). |
| `tags/tags.service.ts` | `prisma.canonicalTag.findMany / findUnique`; type `CanonicalTag`. |
| `equipment/equipment.service.ts` | `prisma.equipmentType.* / prisma.equipmentUnit.*`; types `EquipmentType`, `EquipmentUnit`, `EquipmentCategory`. |
| `equipment/equipment.controller.ts` | Runtime value `EquipmentCategory`. |
| `jobs/jobs.service.ts` | `prisma.job.* / prisma.tenant.*`; types `Job`, `JobStatus`. |
| `jobs/jobs.controller.ts` | Runtime value `JobStatus`. |
| `jobs/commissioning.service.ts` | `prisma.equipmentUnit.* / prisma.canonicalTag.* / prisma.commissioningSnapshot.* / prisma.job.*`; types `CommissioningSnapshot`, `Job`, `JobSensorSnapshot`. |
| `telemetry/canonical-tag-resolver.ts` | `prisma.jobSensorSnapshot.findFirst / prisma.job.* / prisma.equipmentUnit.*`; types `EngineeringUnitClass`, `SensorType`, `JobStatus`. |
| `telemetry/trends.service.ts` | `prisma.job.* / prisma.jobSensorSnapshot.*`; runtime `Prisma`, `Quality`. |
| `telemetry/contracts/envelope.ts` | Runtime `Quality`. |
| `telemetry/contracts/trends.ts` | Runtime `Quality`. |
| `telemetry/contracts/ingestion-adapter.ts` | Types `Quality`, `LateTelemetryReason`. |

### 3.3 Tests (vitest specs)

| File | What it uses |
|---|---|
| `telemetry/canonical-tag-resolver.spec.ts` | `new PrismaClient()`; runtime `JobStatus`. Mutates seed rows. |
| `telemetry/trends.service.spec.ts`         | `new PrismaClient()`; runtime `Prisma`, `Quality`. Inserts `telemetry` rows. |
| `jobs/commissioning.service.spec.ts`       | `new PrismaClient()`; runtime `JobStatus`. |
| `jobs/jobs.service.spec.ts`                | `new PrismaClient()`. |

### 3.4 Scripts and seeds

- `apps/backend/prisma/seed.ts` — uses `PrismaClient`, `AlarmCondition`, `AlarmSeverity`, `EngineeringUnitClass`, `EquipmentCategory`, `JobStatus`, `SensorType`, `TenantKind`, `UserRole`.
- `apps/backend/scripts/generate-sample-telemetry.ts` — uses `PrismaClient`, `Quality`.

### 3.5 What breaks if `schema.prisma` is replaced naively

Every file listed above stops compiling because:

1. `prisma.equipmentUnit`, `prisma.jobSensorSnapshot`, `prisma.signalFireDevice`, `prisma.telemetry`, `prisma.sensorHealth`, `prisma.lateTelemetryQuarantine`, `prisma.operationalEvent` no longer exist.
2. The enum values `EquipmentCategory`, `SensorType` (with F1 members), `JobStatus`, `Quality` (with `estimated`/`stale`), `LateTelemetryReason`, `AlarmCondition`, `AlarmSeverity` (with F1 members), `TenantKind`, `EngineeringUnitClass`, `UserRole`, `HealthStatus`, `OperationalEventKind`, `TelemetryDirection`, `AlarmState` no longer exist (F4.1 uses CHECK constraints, not Postgres enums; Prisma generates enums only for `enum` declarations).
3. The seed script's entire payload no longer matches the F4 model (no `equipmentUnit`, no `signalFireDevice`, no `jobSensorSnapshot`, no `OperationalEventKind`).
4. The two telemetry specs insert into a `telemetry` model whose shape and primary key change entirely.

Therefore: **F4.2 cannot be "schema only"**. Any clean reset must be bundled with backend insulation work (see §8).

## 4. F4.1 Canonical Schema Summary

The F4.1 SQL file establishes 20 tables, 51 indexes, the `live_readings_projection` view, and the `pgcrypto` extension. It deliberately uses **no TimescaleDB syntax**. Summary by group:

- **Tenancy / identity** — `tenants`, `users` (placeholder for audit FK).
- **Equipment catalog** — `equipment_types` (global), `measurement_units` (tenant-scoped; `status` + `operating_profile`).
- **Instrumentation** — `sensors`, `transmitter_devices` (separate device table, vendor-agnostic, calibration + replacement history).
- **Canonical tags** — `canonical_tags` (global dictionary, `name` unique, `deprecated` flag), `sensor_tag_bindings` (effective-dated, partial unique on active binding).
- **Per-unit operational config** — `unit_configurations`, `unit_operating_envelopes` (versioned, partial unique on `is_current`).
- **Alarms** — `alarm_rules` (per `(unit_id, canonical_tag_id, severity)`, versioned, partial unique on `is_current`), `alarm_thresholds` (placeholder child for multi-step / rate-of-change), `alarm_events` (lifecycle `active → acknowledged → cleared`, partial index for active).
- **Telemetry** — `telemetry_readings` (plain table, UUID id, indexes on `(unit_id, canonical_tag_id, ts DESC)`, `(tenant_id, ts DESC)`, `(sensor_id, ts DESC)`, partial `(job_id, ts DESC) WHERE job_id IS NOT NULL`). Append-only by architecture; SQL enforcement deferred.
- **Live projection** — `live_readings_projection` (`DISTINCT ON` view, derived, NOT canonical; F4.6 chooses final implementation).
- **Job lifecycle** — `wells`, `jobs` (FK to `commissioning_snapshots` added via `ALTER TABLE` to break circular dependency), `commissioning_snapshots` (immutable by architecture, jsonb-frozen `effective_thresholds`, `sensor_mappings`, `engineering_envelope`, `rule_versions`).
- **Integration placeholders** — `integration_sources` (jsonb `config`, `credentials_reference`), `integration_mappings` (unique per `(integration_source_id, external_identifier)`).
- **Audit** — `audit_logs` (single append-only table; polymorphic `entity_type` + `entity_id`; jsonb `before`/`after`; `correlation_id`; `ip_address` as `INET`).

UUID primary keys via `gen_random_uuid()` from `pgcrypto`. Multi-tenancy is column-level (`tenant_id` + FK) on every operational table.

## 5. Gap Analysis

### 5.1 Models that must be replaced (semantic conflict)

| F1 Prisma → F4 target | Why |
|---|---|
| `EquipmentUnit` → `measurement_units` | Different ownership (tenant-scoped in F4), different identity (UUID), different fields (`status`, `operating_profile`, `location`). Not a rename — different model. |
| `Sensor` (with `canonicalTagName` + `modbusRegister`) → `sensors` + `sensor_tag_bindings` + `transmitter_devices` | F4 splits sensor identity, tag binding (effective-dated, with history), and physical device into three tables. Modbus details move into `transmitter_devices`. |
| `SignalFireDevice` → `transmitter_devices` | F4 generalizes to any vendor / protocol. SignalFire becomes one possible `manufacturer` value. |
| `AlarmRule` → `alarm_rules` | Different cardinality (per-unit-and-tag vs per-job-or-well); different threshold model (four standard fields vs single `threshold` + `condition`); versioned. |
| `JobSensorSnapshot` → JSONB inside `commissioning_snapshots.sensor_mappings` | F4 collapses normalized snapshot rows into a single immutable JSONB document per snapshot. |
| `Telemetry` (hypertable) → `telemetry_readings` (plain) | Different keying (UUID vs composite PK), different tenancy column position, different quality vocabulary, no hypertable. |
| `SensorHealth` (hypertable) | No F4.1 equivalent. Device liveness is implicit in `transmitter_devices.installation_status` + `battery_status`; continuous health-time-series is not in F4.1 scope. |
| `LateTelemetryQuarantine` | No F4.1 equivalent. F4 expects the ingestion service (out of scope until F4.6) to handle rejections; quarantine table will be designed when ingestion lands. |
| `OperationalEvent` | No dedicated F4 table. F4 routes such events through `audit_logs` (e.g. `action='commissioned'`, `'closed'`). |
| `RvfMeta` | F0 marker; not needed in F4. |

### 5.2 Models that map cleanly (still need shape changes)

| F1 Prisma → F4 target | Notes |
|---|---|
| `Tenant` → `tenants` | Same intent. F1 has `code` + `kind`; F4 has `status` + `residency_hint`. Migration adds the new columns, drops `kind`/`code` or maps them into the new shape. |
| `User` → `users` | F1 has `email` + `UserRole`; F4 has `display_name` + freeform `role` (CHECK constraint). The placeholder character is the same. |
| `Well` → `wells` | F1 has `code` + `siteCode` + `wellType` + `designLimits`; F4 has `name` + `field_or_site` + `type` + `design_limits` jsonb. Direct rename + a few field mappings. |
| `EquipmentType` → `equipment_types` | F1 has `code` + `category` + `expectedSensorChannels`; F4 has `name` UNIQUE + `default_sensor_template` jsonb + `pid_reference`. Mostly compatible. |
| `CanonicalTag` → `canonical_tags` | F1 has `unit` + `unitClass`; F4 has `canonical_unit` + `category` + `precision` + `deprecated` flag. Rename + add `deprecated`. |
| `Job` → `jobs` | F1 status enum (`scheduled`/`in_progress`/`closed`) ≠ F4 CHECK (`programmed`/`in_progress`/`closed`). One value rename. F1 has `code` + `engineerUserId` + `notes`; F4 has `commissioning_snapshot_id` FK + `engineer_id`. |
| `CommissioningSnapshot` → `commissioning_snapshots` | Shape changes substantially: F4 stores the four JSONB documents directly on the snapshot row; F1 normalizes through `JobSensorSnapshot`. Migration is essentially a transformation, not a column rename. |
| `AuditLog` → `audit_logs` | F1 has `actorUserId` + `entityKind` + `beforeJson` + `afterJson` + `ipAddress` VARCHAR; F4 has `actor_id` + `entity_type` + `before` + `after` + `correlation_id` + `ip_address` `INET`. Mostly a rename. |

### 5.3 Missing F4 entities (must be created)

`transmitter_devices`, `sensor_tag_bindings`, `unit_configurations`, `unit_operating_envelopes`, `alarm_rules` (new shape), `alarm_thresholds`, `alarm_events`, `telemetry_readings` (new shape), `integration_sources`, `integration_mappings`, view `live_readings_projection`.

### 5.4 Field-level surprises that Prisma can't model identically

- **`pgcrypto` UUID defaults.** Prisma's `@default(uuid())` uses the application; F4.1 SQL uses `gen_random_uuid()` SQL-side. Prisma 5 has `@default(dbgenerated("gen_random_uuid()"))` which works but is awkward. A reasonable F4.2 choice is `@default(uuid())` (application-generated UUIDs) and drop the SQL-side default during introspection — the database will accept either.
- **`INET` type.** Prisma has no first-class `INET`. Workarounds: `String @db.Inet` (Prisma supports this attribute) or keep as `String` and CAST at the SQL boundary. Either is acceptable.
- **CHECK constraints.** Prisma does not model CHECK constraints. F4.2 must either drop them (relying on TypeScript enums at the application layer) or preserve them via `@@map` + a hand-written SQL migration that re-adds the CHECKs after Prisma's table creation.
- **Partial unique indexes.** Prisma 5 supports `@@unique` only as a full unique. Partial unique indexes (`WHERE is_current = TRUE`, `WHERE effective_to IS NULL`) require raw SQL in the migration. Prisma will not introspect or model them.
- **Views.** `live_readings_projection` is a view. Prisma 5 supports `view` blocks behind the `views` preview feature; otherwise the view must be defined in raw SQL and queried via `prisma.$queryRaw`.
- **JSONB.** Prisma `Json` ↔ PostgreSQL `jsonb` is fine, but Prisma cannot enforce the shape of JSONB content. F4.2 should layer Zod or io-ts validation on top — out of scope for F4.2 itself.
- **Circular FK.** `jobs.commissioning_snapshot_id → commissioning_snapshots` and `commissioning_snapshots.job_id → jobs` form a cycle. F4.1 SQL handles this with `ALTER TABLE` after table creation; Prisma must declare both relations and Prisma's migration engine will sequence the SQL automatically. Sanity-check the generated migration.

### 5.5 Migration incompatibilities

- **TimescaleDB extension.** F1 has `extensions = [timescaledb]` in the datasource and a migration that runs `CREATE EXTENSION "timescaledb"`. F4.1 explicitly drops this dependency. The F4.2 schema must remove the `extensions = [timescaledb]` declaration; the dev docker-compose `timescale/timescaledb:latest-pg16` image can be left in place (TimescaleDB-as-extension is opt-in; not declaring it leaves it dormant), or swapped for vanilla `postgres:16` in a follow-up infra ticket.
- **Hypertables.** F1.5 migration runs `create_hypertable('telemetry', 'ts', ...)`. The F4 baseline migration drops `telemetry` as a hypertable when it drops the table.
- **Existing applied migrations are non-trivial to "compose" with a new baseline.** Prisma migrate refuses to apply a new migration that conflicts with the existing history unless `migrations/` is reset or a new shadow baseline is created. Practically, F4.2 will need to **archive or delete** the three F1 migrations and create a single new baseline migration. (Local dev: documented procedure to `docker compose down -v && rm -rf prisma/migrations && pnpm prisma migrate dev --name f4_baseline`.)

### 5.6 Data-loss risk if a real DB existed

This repo has **no production database** and **no shared dev database**. Evidence:
- `docker-compose.yml` is local-only; its leading comment says: *"Production deployment is autoalojado (engineering-architecture §35); a separate compose / k8s manifest lives outside this repo."*
- No CI configuration is present in `.github/` (no workflows directory).
- `DATABASE_URL` is supplied via local `.env` and resolves to the local docker postgres container.
- Seed is idempotent and reproducible.

Conclusion: F4.2 carries **no production data-loss risk**. Local dev data is recreatable from seed.

## 6. Strategy Options

### Option A — Incremental migration of existing Prisma schema

Modify `schema.prisma` in place: rename `EquipmentUnit` → `MeasurementUnit`, fold `SignalFireDevice` into a new `TransmitterDevice` model, rebuild `AlarmRule` to be per-unit-and-tag, add the new tables (`transmitter_devices`, `sensor_tag_bindings`, `unit_configurations`, etc.), and let Prisma generate the migration diff.

- **Advantages.** Smallest single change. Preserves migration history in spirit. Familiar to anyone reading the git log.
- **Disadvantages.** The actual diff is enormous (≥ 10 model renames, ≥ 10 new tables, ≥ 5 enum reshapes, hypertable removal, extension removal, telemetry primary-key change). Prisma migrate's auto-generated diff will be wrong (it will see drops + creates rather than renames) and will need extensive hand-editing. The result is not really "incremental"; it's a clean reset with extra steps.
- **Risks.** Worst of both worlds: still breaks backend on the same surface as Option B, but with a migration that is harder to read and reason about.
- **When it applies.** When the two schemas are mostly the same and differ by 1–3 columns per model. **Not the case here.**
- **Impact on backend.** Same as Option B — full surface breaks.
- **Impact on F4.3–F4.6.** Negligible difference vs Option B.

### Option B — Clean reset of Prisma schema and migrations

Replace `schema.prisma` with an F4-aligned schema. Archive (or delete) the three F1 migrations under `prisma/migrations/`. Create a single new baseline migration named e.g. `20260524_f4_2_baseline`. Regenerate the Prisma client. Bundle this with backend insulation work (see §8) so lint/typecheck/build keep passing.

- **Advantages.** One schema, one truth. Matches ADR-007's "RVF Malinois owns this schema as canonical" principle. Migration is clean to read. Removes the TimescaleDB extension declaration. Removes hypertables. Mirrors the F4.1 SQL file directly, which makes drift between SQL DDL and Prisma easy to catch.
- **Disadvantages.** Breaks all F1-using backend files until they are insulated or rewritten. Loses the F1 migration narrative in git (mitigated: the migrations are still in git history, just archived from the active folder).
- **Risks.** If insulation is not part of the same change, the repo lands in a state where `pnpm run typecheck` fails — unacceptable. Mitigation: bundle insulation atomically (§8).
- **When it applies.** When there is no production data, when the two schemas substantively differ, and when the new schema is authoritative. **Exactly the current case.**
- **Impact on backend.** High and unavoidable, but localized. Either (a) services / specs are rewritten to use the new client (heavy — drifts into F4.4 scope), or (b) services / specs are stubbed / quarantined until F4.4 (lighter, recommended).
- **Impact on F4.3–F4.6.** Positive. F4.3 seed targets the canonical model directly. F4.4 adapter rewrite has a single client to call. F4.5 UI gets canonical data straightaway. F4.6 telemetry writes to `telemetry_readings`, not `telemetry` hypertable.

### Option C — Parallel F4 Prisma schema

Create a second Prisma project at e.g. `apps/backend/prisma-f4/` with its own `schema.prisma`, its own migrations folder, its own `migration_lock.toml`, and a generator that writes to a custom output path (e.g. `node_modules/@prisma/client-f4` or `apps/backend/src/prisma-f4/generated`). Leave the F1 stack untouched. Backend keeps using F1 client; new F4.4 work can import the F4 client at its own pace; F4.6 telemetry writes through the F4 client; after F4.5 lands the F1 client is removed.

- **Advantages.** No backend insulation needed up front. Lint/typecheck/build stay green throughout F4.2 and F4.3. Roll-forward speed: F4.2 can land literally any day.
- **Disadvantages.** Two Prisma clients pointing at the same database (or two different databases) for a non-trivial window. Drift is real: schema fixes might land in one and not the other. Confusion at the import call site: which client is canonical for which entity? Eventually still requires the same insulation work, just delayed and spread thin.
- **Risks.** "Two sources of truth" anti-pattern, even temporarily. Increased likelihood of bugs where two services read different shapes of the same row. Tooling surface (Prisma Studio, migrate, generate) doubles.
- **When it applies.** When the existing client supports active production traffic that cannot be paused for the schema swap, or when a long parallel run is genuinely desirable (e.g. dual-write / shadow read patterns). **Not the case here**: there is no production, and the F1 stack is dev-only.
- **Impact on backend.** Backend keeps running on F1 client. New F4 client used selectively. Eventually backend rewrite is the same size as Option B.
- **Impact on F4.3–F4.6.** Mixed. Speeds up F4.2 landing. Slows down F4.4 (which must reconcile two clients during the cut-over). Adds risk to F4.6 (telemetry-write code lives in F4 client; alarm-event reads might still be in F1 client until rewritten).

### Option D — SQL-first / Prisma introspection

Apply `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql` to a fresh database; run `pnpm prisma db pull` (introspection) against it; let Prisma generate `schema.prisma` from the live schema.

- **Advantages.** The F4.1 SQL stays canonical. Prisma schema becomes a derived artifact. CHECK constraints, partial unique indexes, and the view can be introspected (with caveats — see §5.4) so nothing is silently lost.
- **Disadvantages.** Requires connecting to a real database (forbidden in F4.1 / F4.2A and arguably premature in F4.2B). Introspection output is opinionated and almost always needs manual touch-up (model names default to PascalCase of the table name, relations pick up generic names, etc.). The "view" support is a preview feature with rough edges. Doesn't solve the backend dependency problem at all — backend still breaks on enum drops.
- **Risks.** Same backend-break risk as Option B, plus the operational risk of standing up a temporary database just to run introspection. Likelihood of introspection drift (e.g., partial unique indexes silently lost) is moderate and easy to miss in code review.
- **When it applies.** When the source of truth is genuinely the SQL file (or an existing legacy DB) and Prisma is "the ORM layer over that." This is consistent with the spirit of ADR-007 — but the gain over Option B is small, and the operational cost is real.
- **Impact on backend.** Same as Option B.
- **Impact on F4.3–F4.6.** Same as Option B, plus an ongoing "two sources" cognitive load (SQL file vs Prisma schema) that needs explicit governance.

## 7. Recommended Strategy

**Recommend Option B — Clean reset, with mandatory bundled backend insulation.**

### Justification (evidence-based)

- **No production database.** Local dev only; `docker-compose.yml` is explicit about this. Data loss is a non-risk.
- **No CI deployment.** No `.github/workflows/`. No GitHub Actions migration pipeline to coordinate with.
- **ADR-007 makes F4 canonical.** The F1 schema is legacy by decision. Maintaining it past F4.2 (Option C) is anti-architecture.
- **The two schemas are substantively different.** Incremental migration (Option A) would produce a confusing diff full of drops + creates; the saved history is not worth the noise.
- **The backend dependency surface is medium-sized.** ~14 files. Bundled insulation is feasible in one PR; it is not a multi-week effort.

### Mandatory bundling

Option B is recommended **only if** F4.2 is executed as an atomic change set that includes one of the two backend insulation modes below. Landing the schema swap without insulation leaves the repo in a non-buildable state; that is unacceptable.

**Insulation Mode 1 — Quarantine F1 modules.** In `apps/backend/src/`, temporarily exclude the F1-dependent feature modules from the Nest application bootstrap (`app.module.ts`) and from `tsconfig.json` includes; the source files remain in git for reference. Result: backend compiles and exposes `/health` only. `lib/api-data/` mock adapter continues to serve the frontend (F3 / F3.1 contract preserved). F4.4 reintroduces the modules atop the new Prisma client.

**Insulation Mode 2 — Migrate one module at a time inside F4.2.** Rewrite the simplest modules (tenants, tags, equipment) against the new client in the same change; quarantine the others (jobs, commissioning, telemetry, trends, canonical-tag-resolver) until F4.4. Heavier; favored if the team prefers a shallower F4.4.

**Mode 1 is the lower-risk default.** It localizes the F4.2 change to schema + Prisma client + minimal Nest wiring; F4.4 then does the per-module rewrites as designed in F4 §J.

## 8. Proposed F4.2B Implementation Plan

The following is a plan, not an execution. Each step is a checklist item for the F4.2B phase.

1. **Branch isolation.** Create `feature/f4-2-prisma-baseline` off the current `main`. All F4.2B work lands in this branch and is merged via a single squash PR.
2. **Snapshot the F1 stack.** Move the existing `apps/backend/prisma/migrations/` directory to `apps/backend/prisma/migrations.f1-archive/`. Preserve `migration_lock.toml`. Preserve `seed.ts` under a new name (e.g. `seed.f1.ts.bak`) — it will be rewritten in F4.3.
3. **Replace `schema.prisma`.** Author a new `schema.prisma` aligned 1:1 with `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql`:
   - Datasource: drop `extensions = [timescaledb]`. Keep `previewFeatures = ["postgresqlExtensions"]` if introducing `pgcrypto` is desired; otherwise remove the preview feature and use `@default(uuid())`.
   - Models for all 20 F4.1 tables, names matching the SQL table names via `@@map`.
   - No Prisma `enum` blocks for fields backed by SQL CHECK constraints; use `String` with comments referencing the CHECK list (preserves Prisma client portability and avoids enum proliferation).
   - JSONB fields as `Json`.
   - Partial unique indexes preserved via raw SQL in the migration (see step 5).
   - `live_readings_projection` view declared with a `view` block (behind `views` preview feature) **or** omitted and queried via `$queryRaw` — pick one; document the choice in the F4.2 closeout.
4. **Decide migration naming.** Single baseline migration: `20260601000000_f4_2_baseline` (or the date of execution). One migration, no incremental F4.1 → F4.1.1 splits.
5. **Author the migration's `migration.sql`.** Either:
   - Let `pnpm prisma migrate dev --name f4_2_baseline --create-only` generate a draft against an empty database, then hand-edit to add: partial unique indexes, CHECK constraints, the view, the `pgcrypto` extension. **OR**
   - Write the migration by hand using `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql` as the source — this is the lower-drift approach and is recommended.
6. **Insulate the backend (Mode 1 default).**
   - In `apps/backend/src/app.module.ts`, comment out / temporarily remove imports of feature modules that depend on F1 client (`WellsModule`, `TenantsModule`, `TagsModule`, `EquipmentModule`, `JobsModule`, `TelemetryModule`). Keep `PrismaModule` and `HealthModule`.
   - In `apps/backend/tsconfig.json`, exclude the corresponding `src/**` paths from the typecheck input (or add a `// @ts-nocheck` blanket — heavier, ugly, last resort).
   - Document the quarantine in the F4.2 closeout: which modules, why, and that F4.4 reactivates them on the new client.
7. **Regenerate the Prisma client.** `pnpm --filter @rvf/backend exec prisma generate`. Does not require a DB connection.
8. **Run quality gates.** `pnpm run lint`, `pnpm run typecheck`, `pnpm run build`. Must be green.
9. **Verify API contract preservation.** Frontend continues to talk to the F3 `lib/api-data/` mock adapter; backend `/health` remains live. No live DB connection.
10. **Decide local DB reset cadence.** Document: `docker compose down -v && docker compose up -d postgres && pnpm --filter @rvf/backend exec prisma migrate dev` is the developer's one-liner to bring up an F4.2 dev DB. Note the docker postgres image is still TimescaleDB-based — that is fine; the extension is not loaded.
11. **Author the F4.2 implementation report.** `docs/architecture/RVF_Malinois_F4_2_Prisma_Migration_Report.md`. Sections: summary, files added/changed, prisma schema decisions (extensions, enums, views, CHECK constraints), backend quarantine list, quality-gate output, known limitations (CHECKs not enforced via Prisma, partial unique indexes in raw SQL, view definition choice), suggested F4.3 next phase.
12. **No commit / no push yet.** F4.2B reviewer approves before commit. PR description references this F4.2A document.

## 9. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Backend imports break on enum / model removal | Certain | High | Quarantine F1 modules in F4.2B (§8 step 6); reactivate in F4.4. |
| R2 | F1 migration history collides with new baseline | High | Medium | Archive (don't delete) `prisma/migrations/` to `migrations.f1-archive/`; documented developer one-liner to reset local DB (§8 step 10). |
| R3 | Mixed F1 / F4 vocabulary in code reviews | Medium | Medium | F4.2B closeout explicitly lists which modules are quarantined and which use the new client. CLAUDE.md update can codify the rule for the duration of the migration window. |
| R4 | TimescaleDB image still serves dev DB | Low | Low | Acceptable. The `timescaledb` extension is not loaded unless declared. Optionally swap to vanilla `postgres:16` in a follow-up infra ticket. |
| R5 | Prisma cannot model CHECK constraints; drift between Prisma schema and DB | Medium | Medium | CHECKs live in the migration SQL, not in `schema.prisma`. A test in F4.4 round-trips representative invalid values through the API to confirm DB-level rejection. Document this gap. |
| R6 | Prisma cannot model partial unique indexes; introspection won't see them | Medium | Low | Partial unique indexes are created in the F4.2B migration via raw SQL (`CREATE UNIQUE INDEX … WHERE …`). Prisma client doesn't know; application code uses them via plain INSERT / UPSERT and lets the DB enforce. Documented gap. |
| R7 | Prisma `view` preview for `live_readings_projection` is unstable | Medium | Low | Two acceptable options: (a) declare the view in Prisma with the preview feature; (b) define the view in raw SQL only and read via `prisma.$queryRaw`. Decision in F4.2B step 3; F4.6 may revisit. |
| R8 | JSONB shape drift inside `commissioning_snapshots.*` / `audit_logs.before/after` / `integration_sources.config` | Medium | Medium | Out of scope for F4.2B. F4.3 / F4.4 layer Zod (or io-ts) validation on top of the Prisma client at the service boundary. Documented gap. |
| R9 | Lack of seed data until F4.3 | Certain | Low | Expected. F4.2B explicitly does not seed; `/health` endpoint is the only live signal during the F4.2 → F4.3 gap. |
| R10 | No real DB connection in F4.2B | Certain | Low | Expected. F4.4 introduces the live connection on top of the existing `DATABASE_URL` env var. |
| R11 | Local developer accidentally runs `prisma migrate dev` against a database with old F1 schema applied | Medium | Medium | Documented procedure to reset the volume (`docker compose down -v`) before first F4.2B migrate. The reset wipes ONLY the local dev volume, never any shared / remote database (none exists). |
| R12 | `pgcrypto` extension not present in some target Postgres builds | Low | Medium | `pgcrypto` ships with PostgreSQL contrib (default in `postgres:*` and `timescale/timescaledb:*` images). Migration uses `CREATE EXTENSION IF NOT EXISTS pgcrypto` (or relies on Prisma `extensions = [pgcrypto]`). Document in F4.2B. |
| R13 | Tests (vitest specs) using `new PrismaClient()` directly break against the new schema | Certain | Low | The four affected specs (`canonical-tag-resolver.spec.ts`, `trends.service.spec.ts`, `commissioning.service.spec.ts`, `jobs.service.spec.ts`) are quarantined alongside their services in F4.2B. Reactivated and rewritten in F4.4. |
| R14 | `scripts/generate-sample-telemetry.ts` uses removed enums | Certain | Low | Move to `scripts/legacy/` or guard behind a feature flag. Reactivated / rewritten when F4.6 telemetry persistence lands. |

## 10. Acceptance Criteria for F4.2B

1. Exactly one Prisma schema lives in the repo at `apps/backend/prisma/schema.prisma`, aligned 1:1 with `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql`.
2. The F1 Prisma migrations are archived (not silently deleted), preserved at a documented path with a clear README explaining their status.
3. Exactly one new Prisma migration is created (`*_f4_2_baseline`), and `pnpm prisma migrate status` against a fresh database reports a clean apply.
4. `pnpm run lint` is green across all workspaces.
5. `pnpm run typecheck` is green across all workspaces.
6. `pnpm run build` is green across all workspaces.
7. The frontend continues to render via the F3 `lib/api-data/` mock adapter — no UI regressions.
8. Backend `/health` endpoint is live; F1-dependent feature endpoints may be temporarily quarantined (documented).
9. No live database connection is established in F4.2B; the new Prisma client is generated but not bound to a runtime instance for feature work.
10. No seed data, no telemetry ingestion, no authentication added in F4.2B.
11. A closeout report `docs/architecture/RVF_Malinois_F4_2_Prisma_Migration_Report.md` is produced and reviewed.
12. The PR description references this F4.2A plan and explicitly states which insulation mode was used.
13. No commit is made until the reviewer signs off.

## 11. Out of Scope

- **No Prisma changes in F4.2A.** F4.2A is analysis only.
- **No migrations in F4.2A.** No `prisma migrate` invocations.
- **No code changes in F4.2A.** Backend, frontend, packages, scripts untouched.
- **No DB reset in F4.2A.** Local dev DB state is not affected by this document.
- **No backend adapter changes in F4.2A.** `lib/api-data/` mock adapter unchanged.
- **No seed data anywhere in F4.2.** Seed and reference data are F4.3.
- **No telemetry ingestion anywhere in F4.2.** Ingestion is F4.6.
- **No authentication.** `users` remains a placeholder per F4 §D.
- **No CI changes.** No `.github/workflows` are added or modified.
- **No infrastructure changes.** `docker-compose.yml` is not modified (TimescaleDB image stays for now; can be revisited post-F4.6 if desired).
- **No removal of the F1 archived migrations.** They remain in git for historical reference.
