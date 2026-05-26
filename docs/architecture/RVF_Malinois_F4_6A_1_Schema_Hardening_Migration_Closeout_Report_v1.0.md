# RVF Malinois F4.6A.1 — Schema Hardening Migration Closeout Report v1.0

> Phase **F4.6A.1 — Prisma Schema + Migration Implementation**. First runtime-adjacent change in the F4.6 arc: schema only.
>
> Upstream references:
> - F4.6 architecture: `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Architecture.md` (commit `c12a29c`)
> - ADR-008: `docs/adr/ADR-008_RVF_Malinois_Telemetry_Persistence_Ingestion.md` (commit `c12a29c`)
> - F4.6 closeout: `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Closeout_Report_v1.0.md` (commit `334bfc5`)
> - F4.6A.0 plan (the gate this phase implements): `docs/architecture/RVF_Malinois_F4_6A_Schema_Hardening_Plan.md` (commit `014df37`)
> - F4 architecture: `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md` (commit `f36923a`)
> - ADR-007: `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md` (commit `8147399`)
> - F4.2B Prisma baseline: `apps/backend/prisma/migrations/20260524000000_f4_2_baseline/migration.sql` (commit `e37f7b5`)

## 1. Executive Summary

F4.6A.1 implements the schema-hardening migration approved by the F4.6A.0 plan. The phase is **schema-only**: it ships one Prisma schema update (two new models plus one new optional field on `TelemetryReading` plus the corresponding backrefs) and one new Prisma migration directory carrying the forward SQL and a sibling operational reverse SQL. **No backend service, controller, route, worker, simulator, adapter, WebSocket channel, alarm evaluator, or external bridge is created.** No frontend file is touched. No package, lockfile, config, or test file is modified. No row is written to any canonical table.

The two new models close the F4 schema gaps that ADR-008 and the F4.6A.0 plan identified:

- `live_readings` — upsert-maintained projection of the latest reading per `(unit_id, sensor_id, canonical_tag_id)`. **Derived, not canonical.** The pre-existing `live_readings_projection` SQL `VIEW` is preserved (non-destructive coexistence per F4.6A.0 §5.E). F4.6C populates the new table from the ingestion boundary; until then it is empty.
- `telemetry_ingestion_errors` — quarantine surface for telemetry drafts that did not enter `telemetry_readings`. Diagnostic, not canonical. CHECK enum of 15 reasons; **no Jobs-specific reason** (no `closed_job`; `inactive_context` is the neutral forward-looking placeholder).

`telemetry_readings` gains a nullable `integration_source_id` column (FK to `integration_sources`, `ON DELETE SET NULL`) so the F4.6A.0 source-aware sequence-based dedup partial unique index can be created. Two partial unique indexes enforce the deduplication discipline at the DB layer:

- `telemetry_readings_dedup_seq_uk` on `(integration_source_id, sensor_id, canonical_tag_id, sequence) WHERE sequence IS NOT NULL AND integration_source_id IS NOT NULL` — source-aware because sequence numbers are source-local.
- `telemetry_readings_dedup_ts_uk` on `(sensor_id, canonical_tag_id, "timestamp") WHERE sequence IS NULL` — canonical-instrument-keyed because, once normalized, the `(sensor, tag, timestamp)` tuple is the canonical identity of a physical reading.

Plus the optional forensic auxiliary index `telemetry_readings_ingestion_id_idx` on `(ingestion_id, created_at DESC) WHERE ingestion_id IS NOT NULL` to support replay tools / operator forensics without affecting dedup correctness.

All quality gates pass: `prisma format`, `prisma validate`, `prisma generate`, backend `lint / typecheck / build / test` (69 / 69 across 10 spec files), and workspace-wide `lint / typecheck / build`.

ADR-008 remains **Proposed**. Moving it to `Accepted` is appropriate only after at least one downstream sub-phase (F4.6B+) has shipped runtime code that exercises the schema introduced here.

## 2. Commit Context

This report records the *intended* commit for F4.6A.1. The phase has been authored, validated, and verified at the working-tree level but **has not been committed** at the time of writing per the brief.

| Commit | Title |
|---|---|
| `c12a29c` | Add F4.6 telemetry persistence architecture ADR |
| `334bfc5` | Add F4.6 telemetry persistence closeout report |
| `014df37` | Add F4.6A schema hardening plan |
| *(pending)* | Add F4.6A.1 telemetry hardening migration (this work) |

## 3. Files Changed

| Path | Change | Notes |
|---|---|---|
| `apps/backend/prisma/schema.prisma` | **Modified** | Adds `integrationSourceId` field on `TelemetryReading` + `IntegrationSource? @relation`; adds new `LiveReading` model; adds new `TelemetryIngestionError` model; adds reciprocal backrefs on `Tenant`, `MeasurementUnit`, `Sensor`, `CanonicalTag`, `TelemetryReading` (for the `LiveReading.latestTelemetryReading` relation), `IntegrationSource`, `IntegrationMapping`. Updates the NOTE comment about `live_readings_projection` to record that the VIEW is preserved alongside the new table. |
| `apps/backend/prisma/migrations/20260526000000_f4_6a_telemetry_hardening/migration.sql` | **New** | Forward migration. ~155 lines. |
| `apps/backend/prisma/migrations/20260526000000_f4_6a_telemetry_hardening/down.sql` | **New** | Operational reverse migration. Not auto-executed by Prisma; ships as documentation-quality rollback artifact per F4.6A.0 §5.G. |
| `docs/architecture/RVF_Malinois_F4_6A_1_Schema_Hardening_Migration_Closeout_Report_v1.0.md` | **New** | This document. |

**No other file modified, created, or deleted.** Explicitly:

- No file under `apps/backend/src/`.
- No file under `apps/web/`.
- No file under `packages/`.
- No `apps/backend/prisma/seed.f4.ts` change.
- No spec / test file change.
- No `package.json`, lockfile, `turbo.json`, `tsconfig*.json`, `vitest.config.ts`, `eslint.config.mjs`, `docker-compose.yml` change.
- No CI / workflow file change.

## 4. Migration Created

**Path:** `apps/backend/prisma/migrations/20260526000000_f4_6a_telemetry_hardening/migration.sql`

The forward migration executes in six DDL sections (see §6 and §7 for details):

| Section | DDL summary |
|---|---|
| A | `ALTER TABLE telemetry_readings ADD COLUMN integration_source_id UUID REFERENCES integration_sources(id) ON DELETE SET NULL;` + `COMMENT ON COLUMN` + partial lookup index `telemetry_readings_integration_source_idx`. |
| B | Two partial unique indexes on `telemetry_readings`: `telemetry_readings_dedup_seq_uk` (source-aware sequence form) and `telemetry_readings_dedup_ts_uk` (canonical-instrument timestamp form). |
| C | Auxiliary partial non-unique index `telemetry_readings_ingestion_id_idx`. |
| D | `CREATE TABLE telemetry_ingestion_errors` with `reason` CHECK (15 values, **no Jobs-specific reason**) and `quality` CHECK (nullable, three values); four indexes; `COMMENT ON TABLE`. |
| E | `CREATE TABLE live_readings` with `quality` CHECK, `source` CHECK (nullable, ten values), and a `UNIQUE` constraint on `(unit_id, sensor_id, canonical_tag_id)`; four indexes; `COMMENT ON TABLE`. |
| F | Explicit comment block recording that the F4.2 baseline `live_readings_projection` VIEW is **intentionally not modified or dropped** by F4.6A.1. |

**No `INSERT`, no `UPDATE`, no `DELETE`, no `COPY`.** No data writes.

**No trigger DDL.** Append-only enforcement remains at the application layer per F4.6A.0 §5.F.

## 5. Prisma Schema Changes

### 5.1 `TelemetryReading`

Added one optional FK field and two relations:

- `integrationSourceId String? @map("integration_source_id") @db.Uuid` — nullable; legacy / manual / simulator drafts may carry NULL.
- `integrationSource IntegrationSource? @relation(fields: [integrationSourceId], references: [id], onDelete: SetNull)` — primary direction of the new relation.
- `liveReadings LiveReading[] @relation("LiveReadingLatestTelemetry")` — backref for `LiveReading.latestTelemetryReading`.

The model's `///` doc comment was updated to record the new column's semantics and the new partial indexes.

### 5.2 New model — `LiveReading`

Maps to `live_readings`. Fields:

- `id` (UUID PK), `tenantId`, `unitId`, `sensorId`, `canonicalTagId`, `latestTelemetryReadingId?` (FK to `TelemetryReading`, `SetNull`), `value` (Decimal), `engineeringUnit`, `quality`, `status?`, `timestamp`, `source?`, `ingestionTimestamp?`, `createdAt`, `updatedAt`.

Relations: `tenant`, `unit`, `sensor`, `canonicalTag` (all `Restrict`), `latestTelemetryReading` (`SetNull`).

`@@unique([unitId, sensorId, canonicalTagId], map: "live_readings_unit_sensor_tag_uk")` — the upsert natural key.

Four `@@index` entries: `(tenantId, unitId)`, `(unitId)`, `(sensorId)`, `(timestamp DESC)`.

The `///` doc comment documents the CHECK constraints (which live in raw SQL per the F4 convention).

### 5.3 New model — `TelemetryIngestionError`

Maps to `telemetry_ingestion_errors`. Fields (19 columns):

- `id` (UUID PK).
- All FK fields nullable with `SetNull`: `tenantId`, `integrationSourceId`, `integrationMappingId`, `unitId`, `sensorId`, `canonicalTagId`.
- Source-side fields: `externalIdentifier?`, `timestamp?`, `quality?`, `engineeringUnit?`, `value?` (Decimal).
- Boundary-side metadata: `ingestionTimestamp` (default `now()`), `reason` (NOT NULL), `reasonDetail?`, `rawPayload?` (JSONB), `metadata?` (JSONB), `correlationId?` (TEXT, free-form to accept non-UUID correlation IDs from upstream sources), `createdAt` (default `now()`).

Six relations (all optional, all `SetNull`): `tenant`, `integrationSource`, `integrationMapping`, `unit`, `sensor`, `canonicalTag`.

Four `@@index` entries: `(tenantId, createdAt DESC)`, `(integrationSourceId, createdAt DESC)`, `(reason, createdAt DESC)`, `(integrationSourceId, externalIdentifier)`.

The `///` doc comment lists the 15 allowed `reason` values and the three allowed `quality` values, and reiterates that `closed_job` is not in the CHECK and that Jobs remain deferred.

### 5.4 Reciprocal backrefs added on existing models

| Model | Backrefs added |
|---|---|
| `Tenant` | `liveReadings LiveReading[]`, `telemetryIngestionErrors TelemetryIngestionError[]` |
| `MeasurementUnit` | `liveReadings LiveReading[]`, `telemetryIngestionErrors TelemetryIngestionError[]` |
| `Sensor` | `liveReadings LiveReading[]`, `telemetryIngestionErrors TelemetryIngestionError[]` |
| `CanonicalTag` | `liveReadings LiveReading[]`, `telemetryIngestionErrors TelemetryIngestionError[]` |
| `IntegrationSource` | `telemetryReadings TelemetryReading[]`, `telemetryIngestionErrors TelemetryIngestionError[]` |
| `IntegrationMapping` | `telemetryIngestionErrors TelemetryIngestionError[]` |
| `TelemetryReading` | `liveReadings LiveReading[] @relation("LiveReadingLatestTelemetry")` |

No existing field was renamed. No existing column type was changed.

### 5.5 What did NOT change in the Prisma schema

- The `generator client` block (provider, preview features, binary targets) is untouched.
- The `datasource db` block (provider, url, extensions) is untouched. `extensions = [pgcrypto]` is preserved; TimescaleDB remains not declared.
- No existing model lost any field. No `@map` / `@@map` / `@@index` value was renamed.
- No new `enum` block was added. Allowed-value sets remain documented inline via `///` comments; CHECK constraints live in the migration SQL per F4 convention.

## 6. Tables Added

| Table | Purpose | Canonical? | Indexes | Constraints |
|---|---|---|---|---|
| `live_readings` | Upsert-maintained projection of the latest reading per `(unit_id, sensor_id, canonical_tag_id)`. | **No** — derived, rebuildable from `telemetry_readings`. | 4: `(tenant_id, unit_id)`, `(unit_id)`, `(sensor_id)`, `(timestamp DESC)`. | `live_readings_quality_chk`; `live_readings_source_chk`; `live_readings_unit_sensor_tag_uk` UNIQUE. |
| `telemetry_ingestion_errors` | Quarantine surface for telemetry drafts that did not enter `telemetry_readings`. | **No** — diagnostic, not canonical. | 4: `(tenant_id, created_at DESC)`, `(integration_source_id, created_at DESC)`, `(reason, created_at DESC)`, `(integration_source_id, external_identifier)`. | `telemetry_ingestion_errors_reason_chk` (15 values); `telemetry_ingestion_errors_quality_chk` (nullable, three values). |

Both tables are empty after the migration applies — no seed.

## 7. Indexes Added

### 7.1 New indexes on `telemetry_readings`

| Name | Columns | Predicate | Type |
|---|---|---|---|
| `telemetry_readings_integration_source_idx` | `(integration_source_id)` | `WHERE integration_source_id IS NOT NULL` | partial, non-unique |
| `telemetry_readings_dedup_seq_uk` | `(integration_source_id, sensor_id, canonical_tag_id, sequence)` | `WHERE sequence IS NOT NULL AND integration_source_id IS NOT NULL` | partial, **UNIQUE** |
| `telemetry_readings_dedup_ts_uk` | `(sensor_id, canonical_tag_id, "timestamp")` | `WHERE sequence IS NULL` | partial, **UNIQUE** |
| `telemetry_readings_ingestion_id_idx` | `(ingestion_id, created_at DESC)` | `WHERE ingestion_id IS NOT NULL` | partial, non-unique |

The two unique indexes implement the F4.6A.0 plan §5.A dedup decision. The asymmetry — source-aware sequence vs. canonical-instrument timestamp — is binding per the plan and matches ADR-008 decision 8.

### 7.2 New indexes on `live_readings` (table indexes)

| Name | Columns | Predicate |
|---|---|---|
| `live_readings_tenant_unit_idx` | `(tenant_id, unit_id)` | none |
| `live_readings_unit_idx` | `(unit_id)` | none |
| `live_readings_sensor_idx` | `(sensor_id)` | none |
| `live_readings_time_idx` | `(timestamp DESC)` | none |

### 7.3 New indexes on `telemetry_ingestion_errors` (table indexes)

| Name | Columns | Predicate |
|---|---|---|
| `telemetry_ingestion_errors_tenant_created_idx` | `(tenant_id, created_at DESC)` | none |
| `telemetry_ingestion_errors_source_created_idx` | `(integration_source_id, created_at DESC)` | none |
| `telemetry_ingestion_errors_reason_created_idx` | `(reason, created_at DESC)` | none |
| `telemetry_ingestion_errors_external_identifier_idx` | `(integration_source_id, external_identifier)` | none |

**No existing index on any pre-existing table was renamed, dropped, or modified.**

## 8. Existing `live_readings_projection` VIEW — Preservation

The F4.2 baseline `live_readings_projection` SQL `VIEW` is **preserved verbatim**. F4.6A.1 does **not**:

- Drop the VIEW.
- Rename the VIEW.
- Alter the VIEW's definition.
- Modify any consumer of the VIEW.

The VIEW continues to return `DISTINCT ON (unit_id, sensor_id)` over `telemetry_readings`. Because no row exists in `telemetry_readings`, the VIEW returns zero rows today; identical behavior to before F4.6A.1.

Non-destructive coexistence with the new `live_readings` table is intentional and matches F4.6A.0 §5.E. F4.6C decides the VIEW's final fate (drop, rename to `live_readings_view`, or keep as a fallback for ad-hoc SQL); F4.6F may remove it once consumer parity is confirmed.

Schema-level evidence: `migration.sql` §F contains an explicit comment block recording that the VIEW is intentionally untouched. `down.sql` step 7 records that the VIEW is also untouched on rollback.

## 9. Reverse Migration Notes

`apps/backend/prisma/migrations/20260526000000_f4_6a_telemetry_hardening/down.sql` ships alongside the forward migration as a documentation-quality, **operationally-applied** rollback artifact.

- **Prisma does not auto-execute `down.sql`.** Prisma's migration runtime is forward-only; this file is a manual operator artifact.
- **Preferred dev rollback path:** `docker compose down -v && docker compose up -d postgres && pnpm --filter @rvf/backend exec prisma migrate dev` — returns the local volume to the F4.2 baseline (the F4.6A.1 migration is not replayed).
- **Manual rollback path:** `psql $DATABASE_URL -f apps/backend/prisma/migrations/20260526000000_f4_6a_telemetry_hardening/down.sql` followed by `pnpm --filter @rvf/backend exec prisma migrate resolve --rolled-back 20260526000000_f4_6a_telemetry_hardening`.

Rollback order in `down.sql`:

1. `DROP TABLE IF EXISTS live_readings CASCADE;`
2. `DROP TABLE IF EXISTS telemetry_ingestion_errors CASCADE;`
3. `DROP INDEX IF EXISTS telemetry_readings_dedup_seq_uk; DROP INDEX IF EXISTS telemetry_readings_dedup_ts_uk;`
4. `DROP INDEX IF EXISTS telemetry_readings_ingestion_id_idx;`
5. `DROP INDEX IF EXISTS telemetry_readings_integration_source_idx;`
6. `ALTER TABLE telemetry_readings DROP COLUMN IF EXISTS integration_source_id;`
7. `live_readings_projection` VIEW — **do not touch**.

**No data-loss risk for canonical telemetry.** F4.6A.1 itself never populates `telemetry_readings.integration_source_id`; rollback inside the F4.6A.1 window is safe. A future sub-phase that begins populating the column raises the rollback's blast radius; operators must confirm before applying.

## 10. Validation Performed

| Command | Result |
|---|---|
| `pnpm --filter @rvf/backend exec prisma format` | `Formatted prisma/schema.prisma in 26ms 🚀` (whitespace normalization only; no semantic change). |
| `pnpm --filter @rvf/backend exec prisma validate` | `The schema at prisma/schema.prisma is valid 🚀` |
| `pnpm --filter @rvf/backend exec prisma generate` | `✔ Generated Prisma Client (v5.22.0) … in 138ms`. Client now exposes `prisma.liveReading`, `prisma.telemetryIngestionError`, and `TelemetryReading.integrationSource` / `integrationSourceId`. |
| `pnpm --filter @rvf/backend run lint` | clean exit (no warnings). |
| `pnpm --filter @rvf/backend run typecheck` | clean exit (src + prisma/tsconfig). |
| `pnpm --filter @rvf/backend run build` | clean exit (`nest build`). |
| `pnpm --filter @rvf/backend run test` | **69 passed / 69**, 10 spec files. |
| `pnpm run lint` (workspace) | 4 / 4 successful. |
| `pnpm run typecheck` (workspace) | 4 / 4 successful. |
| `pnpm run build` (workspace) | 2 / 2 successful (`FULL TURBO`). |

**No database connection was opened.** `prisma migrate dev` was **not** executed. F4.6A.1 ships the migration file; replaying it against a real database is a developer / operator choice and out of scope for this phase.

## 11. Explicit Non-Implementation Confirmation

F4.6A.1 explicitly did NOT:

- Modify backend runtime code (no file under `apps/backend/src/`).
- Modify frontend code (no file under `apps/web/`).
- Add or modify a service, controller, route, DTO, hook, or test.
- Add a worker, scheduler, simulator, or alarm engine.
- Add WebSocket / SSE / Socket.IO handlers.
- Add MQTT / Modbus / OPC-UA / ThingsBoard / Node-RED / PLC / edge-gateway / historian integration of any kind.
- Add a Jobs flow, Jobs UI, active-job state machine, or any Jobs-bound logic. `closed_job` is not in the quarantine CHECK enum.
- Add API authentication / API keys / HMAC / OAuth.
- Add TimescaleDB extension declaration, hypertable conversion, or continuous aggregate.
- Add SQL triggers (append-only enforcement remains at the application layer per F4.6A.0 §5.F).
- Run a database migration against any environment.
- Write a single row to any canonical table.
- Modify any package, lockfile, config, or test file.
- Touch CI / workflow files.

## 12. Deferred Work

The following remain explicitly deferred per ADR-008 and the F4.6 roadmap:

- **F4.6B** — Telemetry Ingestion Boundary Interface / Service Skeleton. The schema introduced here is the substrate F4.6B writes against. F4.6B's first deliverable should be a service skeleton with a candidate batch-ingest method, an env-flag-guarded internal HTTP endpoint, and dedup + quarantine writes against the new tables — **without** any external protocol integration (MQTT / Modbus / OPC-UA / ThingsBoard / Node-RED / PLC remain deferred).
- **F4.6C** — Live readings projection write path + latest-value endpoint. Populates `live_readings` from the ingestion boundary; decides the fate of the F4.2 baseline `live_readings_projection` VIEW.
- **F4.6D** — Alarm evaluation, `alarm_events` writes, alarm endpoints, and the operational-context lookup mechanism that drives `CommissioningSnapshot.effective_thresholds` vs current `alarm_rules`.
- **F4.6E** — WebSocket / SSE fan-out.
- **F4.6F** — Consolidated closeout.
- **Operational-context / Jobs wiring** — `inactive_context` is the placeholder; the actual wiring lives in a future ADR (candidate ADR-012 per F4.6 closeout §8).
- **Production authentication** — candidate ADR-009.
- **Retention / archival / TimescaleDB** — candidate ADR-010.
- **Historical correction workflow** — candidate ADR-011.
- **Append-only triggers** and DB-role separation — operational hardening, scheduled when production deployment lands.
- **`telemetry_ingestion_errors` retention pruner** — default guidance is 30 days; operational job not authored here.
- **`live_readings_projection` VIEW removal** — F4.6C or F4.6F decision.

ADR-008 status remains **Proposed**. The principles are now exercised at the schema layer; they will be validated against runtime behavior starting in F4.6B.

## 13. Recommended Next Phase

**F4.6B — Telemetry Ingestion Boundary Interface / Service Skeleton.**

F4.6B's recommended scope:

1. A new backend module (candidate path: `apps/backend/src/telemetry/ingestion/`) carrying the ingestion service with a candidate batch-ingest method.
2. An internal HTTP endpoint (candidate: `POST /api/v1/telemetry/ingest`) guarded by an env flag (candidate: `RVF_INGEST_ENABLED`).
3. `IntegrationSource` / `IntegrationMapping` resolution.
4. Dedup against the partial unique indexes F4.6A.1 introduced; the `conflict_dedup` and `unknown_mapping` etc. quarantine paths use the new `telemetry_ingestion_errors` table.
5. Quality normalization at the boundary.
6. Stubs (no-op hooks) for the projection upsert (F4.6C) and the alarm evaluator (F4.6D).
7. Backend unit tests with mocked Prisma covering `accepted` / `duplicate` / `conflict` / `quarantined` / `rejected` outcomes.

**Important constraint for F4.6B:**

F4.6B **should still avoid external protocol integrations unless separately approved.** Specifically, F4.6B does NOT introduce MQTT, Modbus, OPC-UA, ThingsBoard, Node-RED, PLC, edge-gateway, or historian clients. The only entry point F4.6B mounts is the internal HTTP endpoint (env-flag-guarded) and an optional in-process simulator adapter. Bridge adapters for specific external protocols are F4.6B+ work, each subject to separate review and (likely) its own ADR.

Parallel work that does not depend on F4.6B / F4.6A.1:

- **F4.5G+** — per-screen migration of Wells / Equipment / Catalog from the F3 mock adapter to the corresponding F4.5B / F4.5C adapter, following the F4.5F template. Cero dependencia con F4.6.

---

*F4.6A.1 closeout. Schema is in place. The ingestion boundary substrate is ready. F4.6B is the next step — boundary interface + service skeleton, no external integrations.*
