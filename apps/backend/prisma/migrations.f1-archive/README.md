# F1 / F1.5 Prisma migrations — archived

These three migrations represent the F1 (domain model) and F1.5 (TimescaleDB
telemetry hypertables) Prisma migration history. They were active until
phase **F4.2B — Prisma Baseline Migration + Backend Insulation**, at which
point the canonical schema was reset to align with the F4 PostgreSQL model
documented in:

- `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md` (commit `f36923a`)
- `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md` (commit `8147399`)
- `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql` (commit `a475066`)
- `docs/architecture/RVF_Malinois_F4_2A_Prisma_Reconciliation_Plan.md` (commit `7bd6103`)
- `docs/architecture/RVF_Malinois_F4_2B_Insulation_Strategy_Confirmation.md` (commit `a8862e2`)

## Status: do not apply

These migrations are preserved **for historical and forensic reference only**.

- They **must not** be replayed against any database.
- They are **not** part of the active migration history. The active history
  begins with the F4.2 baseline migration under `prisma/migrations/`.
- Local developers reset their dev database with
  `docker compose down -v && docker compose up -d postgres &&
  pnpm --filter @rvf/backend exec prisma migrate dev`
  which applies only the F4.2 baseline.

## What was in here

| Folder | Purpose |
|---|---|
| `20260519000000_init_timescaledb/` | Enabled the `timescaledb` extension and created the F0 marker table `_rvf_meta`. |
| `20260520174418_f1_domain_model/` | Created the F1 catalog + operation tables (`tenants`, `users`, `wells`, `equipment_types`, `equipment_units`, `canonical_tags`, `sensors`, `signalfire_devices`, `jobs`, `commissioning_snapshots`, `job_sensor_snapshots`, `alarm_rules`, `operational_events`, `audit_logs`). |
| `20260520185255_f1_5_telemetry_hypertables/` | Created `telemetry`, `sensor_health`, `late_telemetry_quarantine`; ran `create_hypertable(...)` to convert `telemetry` and `sensor_health` to TimescaleDB hypertables; added retention / compression policies. |

## Why F4.2 replaced them rather than evolved them

Per F4.2A §5 (Gap Analysis), the F1 and F4 schemas differ substantively, not
cosmetically:

- F4 uses UUID primary keys via `pgcrypto`; F1 used `cuid()`.
- F4 introduces tables F1 never had: `transmitter_devices`,
  `sensor_tag_bindings`, `unit_configurations`,
  `unit_operating_envelopes`, `alarm_thresholds`, `alarm_events`,
  `integration_sources`, `integration_mappings`.
- F4 collapses `job_sensor_snapshots` into JSONB inside
  `commissioning_snapshots`.
- F4 replaces `telemetry` (TimescaleDB hypertable, composite PK) with
  `telemetry_readings` (plain table, UUID PK).
- F4 drops the TimescaleDB extension dependency entirely.
- F4 uses CHECK constraints instead of PostgreSQL enums.

An incremental `prisma migrate diff` would have produced a long
sequence of `DROP` + `CREATE` statements that read like a reset anyway.
The clean F4.2 baseline is easier to read, audit, and roll back.

See `docs/architecture/RVF_Malinois_F4_2A_Prisma_Reconciliation_Plan.md`
§§5–7 for the full analysis and the decision rationale.

## Reactivation note

These migrations will not be reactivated. They are kept in git so that, if
a future phase needs to inspect the exact F1 schema shape (for instance,
during an F4.4 service-rewrite cross-check), the SQL is one click away.

`migration_lock.toml` from the original migrations directory is also
preserved here; the active history under `prisma/migrations/` has its
own copy.
