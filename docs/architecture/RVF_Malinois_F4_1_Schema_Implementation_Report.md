# RVF Malinois — F4.1 Schema Implementation Report

> Phase F4.1 — Schema Implementation (SQL foundation only).
> Companion to `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md` (commit `f36923a`) and `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md` (commit `8147399`).

## 1. Summary

F4.1 delivers the first SQL implementation of the canonical operational data model defined by the F4 Database Foundation Architecture and formalized by ADR-007. The deliverable is a single PostgreSQL-compatible DDL file that creates every required canonical entity, the per-unit configuration tables, the alarm model, the append-only telemetry table, the derived live-reading projection, the integration placeholders, and the central audit log.

This phase is intentionally a foundation: it ships SQL only. No Prisma schema is created or modified, no migrations are produced, no seed rows are inserted, no application code is touched, and no runtime database connection is established. Those are scheduled for F4.2 through F4.6.

## 2. Files created

Exactly two files were added:

1. `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql` — the F4.1 PostgreSQL DDL.
2. `docs/architecture/RVF_Malinois_F4_1_Schema_Implementation_Report.md` — this report.

### Path choice

The repository did not previously contain a top-level `database/schema/` directory; it was created as part of this phase. The existing Prisma assets under `apps/backend/prisma/` (F1 / F1.5 schema, with TimescaleDB-based migrations and a different vocabulary — `EquipmentUnit`, `JobSensorSnapshot`, etc.) were left untouched per the F4.1 instructions. F4.1 establishes a fresh SQL baseline that maps to the F4 vocabulary (`MeasurementUnit`, `TransmitterDevice`, etc.); reconciliation between the F1 Prisma schema and the F4 baseline will happen in F4.2.

## 3. Confirmation: nothing else was modified

- No code files modified (backend, frontend, packages).
- No Prisma schema created or modified.
- No Prisma migrations created or modified.
- No `package.json`, `pnpm-lock.yaml`, or `pnpm-workspace.yaml` changes.
- No `docker-compose.yml`, `turbo.json`, or `tsconfig.base.json` changes.
- No seed data; no `INSERT` statements anywhere in the SQL file.
- No environment-specific values, credentials, URLs, or connection strings.

The repository should show exactly the two files above as the only diff.

## 4. Mapping to F4 Architecture and ADR-007

Every entity listed in F4 §D and ADR-007 §7 has a corresponding table in `RVF_Malinois_F4_1_PostgreSQL_Schema.sql`. The mapping is one-to-one with the conceptual vocabulary defined in F4 §B:

| F4 vocabulary           | SQL table                  | Notes                                                          |
|-------------------------|----------------------------|----------------------------------------------------------------|
| Tenant                  | `tenants`                  | Multi-client root; required first.                             |
| User (placeholder)      | `users`                    | Pre-auth placeholder; supports audit FK.                       |
| EquipmentType           | `equipment_types`          | Globally unique by `name`; not tenant-scoped.                  |
| MeasurementUnit         | `measurement_units`        | Unique per tenant by `code`.                                   |
| Sensor                  | `sensors`                  | Logical instrument; survives transmitter replacements.         |
| Transmitter             | `transmitter_devices`      | Separate table — calibration & replacement history.            |
| CanonicalTag            | `canonical_tags`           | Global RVF dictionary; `name` unique; `deprecated` flag.       |
| SensorTagBinding        | `sensor_tag_bindings`      | Effective-dated; partial unique index on active rows.          |
| UnitConfiguration       | `unit_configurations`      | Versioned; partial unique index on `is_current`.               |
| UnitOperatingEnvelope   | `unit_operating_envelopes` | Versioned; per-unit limits; partial unique on `is_current`.    |
| AlarmRule               | `alarm_rules`              | Per-unit, per-tag; partial unique on `is_current`.             |
| AlarmThreshold          | `alarm_thresholds`         | Placeholder child for future complex alarms.                   |
| AlarmEvent              | `alarm_events`             | Lifecycle states; partial index on `state = 'active'`.         |
| TelemetryReading        | `telemetry_readings`       | Append-only by architecture; F4-mandated indexes.              |
| LiveReading             | `live_readings_projection` | **View only**, not a table; derived from `telemetry_readings`. |
| Well                    | `wells`                    | Multi-tenant; `design_limits` jsonb.                           |
| Job                     | `jobs`                     | FK to `commissioning_snapshots` added after-the-fact.          |
| CommissioningSnapshot   | `commissioning_snapshots`  | Immutable by architecture; documented enforcement plan.        |
| IntegrationSource       | `integration_sources`      | Placeholder; opaque `config` jsonb; `credentials_reference`.   |
| IntegrationMapping      | `integration_mappings`     | Placeholder; unique per (`integration_source_id`, external id).|
| AuditLog                | `audit_logs`               | Single append-only central table; polymorphic on `entity_type`.|

Constraints, indexes and jsonb fields follow the requirements spelled out in the F4.1 brief and in F4 §§E, F, G, H, I. Notable choices:

- **Multi-tenant indexes.** Every operational / canonical table that carries `tenant_id` has at least one `tenant_id` index; high-traffic tables (`telemetry_readings`, `alarm_events`, `audit_logs`) carry composite indexes that lead with `tenant_id` for the expected access patterns.
- **Partial unique indexes.** `unit_configurations`, `unit_operating_envelopes`, and `alarm_rules` enforce "at most one current row per scope" via partial unique indexes on `is_current = TRUE`. `sensor_tag_bindings` enforces "at most one active binding per sensor" via a partial unique index on `effective_to IS NULL`.
- **Telemetry indexes.** `telemetry_readings` carries the four indexes called out in F4 §F: `(unit_id, canonical_tag_id, timestamp DESC)`, `(tenant_id, timestamp DESC)`, `(sensor_id, timestamp DESC)`, and a partial `(job_id, timestamp DESC) WHERE job_id IS NOT NULL`.
- **Alarm queries.** `alarm_events` has a composite `(unit_id, first_triggered_at DESC)` plus a partial `(tenant_id, unit_id, first_triggered_at DESC) WHERE state = 'active'` for the active-alarm board.
- **CHECK constraints.** Enum-like fields (`status`, `operating_profile`, `severity`, `state`, `kind`, `protocol`, `quality`, `source`, `action`, etc.) use SQL CHECK constraints rather than PostgreSQL `ENUM` types — easier to evolve via `ALTER TABLE … DROP CONSTRAINT … ADD CONSTRAINT …` in future phases.
- **Circular FK.** `jobs.commissioning_snapshot_id → commissioning_snapshots(id)` is added with `ALTER TABLE` after `commissioning_snapshots` exists, which is the standard PostgreSQL pattern for resolving cycles in a single DDL file.

## 5. Explicit notes

- **PostgreSQL baseline only.** The schema uses standard PostgreSQL types (`UUID`, `TIMESTAMPTZ`, `JSONB`, `NUMERIC`, `INET`, `BOOLEAN`) plus `gen_random_uuid()` from `pgcrypto`. No vendor-specific extensions beyond `pgcrypto` are required.
- **TimescaleDB not required.** F4.1 contains zero TimescaleDB-specific syntax: no `create_hypertable()`, no continuous aggregates, no `timescaledb` extension. `telemetry_readings` is a normal table with TimescaleDB-compatible columns and indexes, so it can be converted to a hypertable in a future phase without redesign.
- **LiveReading is projection only.** `live_readings_projection` is a `VIEW` over `telemetry_readings` using `DISTINCT ON`. It is explicitly marked as derived, not canonical, with comments stating the F4.6 owner gets to choose the final implementation (view, materialized view, upsert table, or application cache). Consumers must not treat it as a write target.
- **TransmitterDevice is a separate table.** `transmitter_devices` carries serial number, manufacturer, model, protocol, signal type, modbus address, register-map reference, channel, firmware version, calibration date / range / reference, battery status, installation status, installed_at, and removed_at. History is preserved by inserting new rows on replacement.
- **Per-unit alarm rules and envelopes are implemented.** `alarm_rules` is keyed by (`unit_id`, `canonical_tag_id`, `severity`); `unit_operating_envelopes` is keyed by `unit_id`. There is intentionally no global alarm-rule or global-envelope table. Settings cannot reach these tables.
- **AuditLog is append-only by architecture.** `audit_logs` is a single central table; SQL-level enforcement of append-only behavior is documented as a future hardening step (triggers or REVOKE on the application role).

## 6. Known limitations

- **No Prisma schema yet.** Generation of a Prisma schema that aligns with this DDL (and reconciles the F1 / F1.5 vocabulary already living in `apps/backend/prisma/schema.prisma`) is F4.2 work.
- **No migrations yet.** This file is a single complete-state DDL, not a migration; F4.2 produces the Prisma migration that will, in turn, govern future schema evolution.
- **No seed data yet.** No `EquipmentType` rows, no `CanonicalTag` dictionary entries, no HP-001 / LP-001 example units, no canonical alarm-rule rows. Those are F4.3.
- **No telemetry ingestion yet.** No `INSERT` path into `telemetry_readings`; ingestion is F4.6.
- **No runtime database connection yet.** This file is not executed against any environment. Connection strings, secrets and deployment are explicitly out of scope.
- **Immutability and append-only are documented, not enforced.** `commissioning_snapshots`, `telemetry_readings`, and `audit_logs` rely on application-layer discipline plus comments / flags. Hardening to true SQL-level immutability requires either `BEFORE UPDATE/DELETE` triggers that raise an exception, or a database role whose `UPDATE`/`DELETE` privileges on these tables are revoked. Either approach is deferred to a later phase and is intentionally not in F4.1.
- **Single-file DDL is convenient but not idempotent.** Running the file twice will fail on the second `CREATE TABLE`. This is acceptable for a foundation document; F4.2 introduces ordered migrations that handle re-application properly.
- **Existing F1 Prisma schema is unmodified.** `apps/backend/prisma/schema.prisma` and the three existing TimescaleDB-based migrations under `apps/backend/prisma/migrations/` use a different (earlier) vocabulary — `EquipmentUnit` / `JobSensorSnapshot` — and were not touched by F4.1. They will be reconciled with the F4 canonical model in F4.2.

## 7. Suggested next phase

**F4.2 — Prisma migration.** Translate the F4.1 SQL schema into a Prisma schema aligned with the F3 TypeScript domain types, produce the corresponding Prisma migration, and reconcile (or supersede) the existing F1 / F1.5 Prisma assets. The F3 API contract must remain unchanged; F4.4 will be the first phase where mock adapters in `lib/api-data/` are swapped for Prisma-backed implementations.
