# RVF Malinois F4.6A.0 — Schema Hardening Plan

> Phase **F4.6A.0 — Schema Hardening Plan**. Plan-only / documentation-only.
> Translates the F4.6 telemetry persistence architecture into a concrete schema-hardening proposal that will gate F4.6A.1 (the actual Prisma schema + migration implementation). **No migration is authored, no Prisma schema is modified, and no runtime code is touched in F4.6A.0.**
>
> Upstream references:
> - F4 architecture: `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md` (commit `f36923a`)
> - ADR-007 (database foundation): `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md` (commit `8147399`)
> - F4.1 PostgreSQL schema: `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql` (commit `a475066`)
> - F4.2B Prisma baseline: `docs/architecture/RVF_Malinois_F4_2B_Prisma_Baseline_Migration_Report.md` (commit `e37f7b5`)
> - F4.6 architecture: `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Architecture.md` (commit `c12a29c`)
> - ADR-008: `docs/adr/ADR-008_RVF_Malinois_Telemetry_Persistence_Ingestion.md` (commit `c12a29c`)
> - F4.6 closeout: `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Closeout_Report_v1.0.md` (commit `334bfc5`)

## 1. Purpose

F4.6A.0 translates the F4.6 telemetry persistence architecture into a concrete schema-hardening proposal. F4.6 explicitly left names, predicates, columns, and inclusion choices as candidates so that the F4.6A sub-phase could lock them down with the benefit of a reviewable plan before any DDL is authored.

This document locks those choices. It does **not** implement them. The Prisma schema edits, the new migration directory, the new Prisma models, and the corresponding raw SQL are the responsibility of F4.6A.1 — which may only begin after this plan is reviewed and approved.

## 2. Current Scope

F4.6A.0 is strictly:

- **Plan-only.** A single new documentation file under `docs/architecture/`.
- **No Prisma schema change** (`apps/backend/prisma/schema.prisma` untouched).
- **No migration added** (`apps/backend/prisma/migrations/` untouched).
- **No runtime code.** No file under `apps/backend/src/`, `apps/web/`, `packages/`, or root config is modified.
- **No backend / frontend changes.** No new service, controller, route, hook, component, or test.
- **No WebSocket / SSE work.** `apps/backend/src/realtime/` untouched.
- **No ingestion service.** No `TelemetryIngestionService` or equivalent module added.
- **No external integrations.** No MQTT / Node-RED / ThingsBoard / OPC-UA / Modbus / PLC / edge-gateway / historian client touched, configured, or referenced beyond ADR-008's existing enumeration.
- **No Jobs model.** The F4 schema's `Job` and `CommissioningSnapshot` entities remain as-is; F4.6A.0 introduces no Jobs flow, no Jobs UI, and no Jobs-bound persistence or alarm logic.

## 3. Inputs Reviewed

The following project artifacts were reviewed before authoring this plan:

| Artifact | Path |
|---|---|
| F4 Telemetry Persistence Architecture | `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Architecture.md` |
| ADR-008 | `docs/adr/ADR-008_RVF_Malinois_Telemetry_Persistence_Ingestion.md` |
| F4.6 Closeout Report | `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Closeout_Report_v1.0.md` |
| F4 Database Foundation Architecture | `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md` |
| ADR-007 (database foundation) | `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md` |
| F4.1 PostgreSQL schema (canonical SQL) | `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql` |
| F4.2B Prisma baseline migration | `apps/backend/prisma/migrations/20260524000000_f4_2_baseline/migration.sql` |
| Current Prisma schema | `apps/backend/prisma/schema.prisma` |
| Current migration state | `apps/backend/prisma/migrations/` (one baseline directory; F1/F1.5 migrations archived under `migrations.f1-archive/`) |
| F4.3 seed | `apps/backend/prisma/seed.f4.ts` |
| F4.4F telemetry trends report | `docs/architecture/RVF_Malinois_F4_4F_Telemetry_API_Reactivation_Report.md` |
| F4.5E telemetry adapter | `apps/web/lib/api-data/f4/telemetry.ts` |

## 4. Existing Schema Baseline

This section enumerates only what currently exists in the repository. Nothing here is fabricated; absent items are explicitly called out as absent.

### 4.1 `telemetry_readings`

Present in `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql` and mirrored in the F4.2B baseline Prisma migration. Columns:

`id (UUID PK, gen_random_uuid())`, `tenant_id (UUID, NOT NULL, FK)`, `unit_id (UUID, NOT NULL, FK)`, **`sensor_id (UUID, NOT NULL, FK)`**, **`canonical_tag_id (UUID, NOT NULL, FK)`**, `timestamp (TIMESTAMPTZ, NOT NULL)`, `value (NUMERIC, NOT NULL)`, `engineering_unit (TEXT, NOT NULL)`, `quality (TEXT, NOT NULL, CHECK ∈ {good, uncertain, bad})`, `source (TEXT, NOT NULL, CHECK ∈ {mock, manual, field_gateway, historian, plc, mqtt, node_red, opc_ua, modbus, edge_gateway})`, `ingestion_id (TEXT, nullable)`, `sequence (BIGINT, nullable)`, `job_id (UUID, nullable, FK)`, `created_at (TIMESTAMPTZ, NOT NULL DEFAULT now())`.

Existing indexes on `telemetry_readings`:

| Index | Columns | Predicate |
|---|---|---|
| `telemetry_readings_unit_tag_time_idx` | `(unit_id, canonical_tag_id, timestamp DESC)` | none |
| `telemetry_readings_tenant_time_idx` | `(tenant_id, timestamp DESC)` | none |
| `telemetry_readings_sensor_time_idx` | `(sensor_id, timestamp DESC)` | none |
| `telemetry_readings_job_time_idx` | `(job_id, timestamp DESC)` | `WHERE job_id IS NOT NULL` |

**Gaps relevant to F4.6A.1:**

1. **No unique constraint enforces dedup** on `telemetry_readings`. `ingestion_id` and `sequence` are declared but unindexed.
2. **No `integration_source_id (UUID)` column** is carried on `telemetry_readings`. The `source (TEXT)` CHECK enum identifies the *kind* of source (`mqtt`, `manual`, …), not the specific `integration_sources.id` row. The `ingestion_id (TEXT)` column already carries the `external_identifier` copy for forensic traceability, but the source-row UUID is not present. F4.6A.1 must add `integration_source_id` so the sequence-based dedup key can be source-aware (see §5.A).

The table contains **zero rows** in any environment (F4.3 seed does not write to it).

### 4.2 `live_readings_projection` (VIEW)

Present as a SQL `VIEW` defined in the F4.2B baseline migration:

```sql
CREATE OR REPLACE VIEW live_readings_projection AS
SELECT DISTINCT ON (tr.unit_id, tr.sensor_id)
    tr.tenant_id, tr.unit_id, tr.sensor_id, tr.canonical_tag_id,
    tr."timestamp", tr.value, tr.engineering_unit, tr.quality,
    tr.source, tr.job_id
FROM telemetry_readings AS tr
ORDER BY tr.unit_id, tr.sensor_id, tr."timestamp" DESC;
```

Not modeled in Prisma (kept out of `schema.prisma` per the F4.2B-0 strategy). **No consumer queries this view today.** Returns zero rows because the underlying table is empty.

### 4.3 Sensors / canonical tags / transmitters / units

All present per F4.1 / F4.2B:

- `measurement_units` — unique `(tenant_id, code)`. F4.3 seeds HP-001 and LP-001.
- `sensors` — F4.3 seeds 14 sensors (7 per unit). `sensors.unit_id` is `NOT NULL FK`. `sensors.type` CHECK enum.
- `transmitter_devices` — F4.3 seeds 14 devices (one per sensor). Partial index on `(sensor_id) WHERE installation_status = 'installed'`.
- `canonical_tags` — F4.3 seeds 22 canonical tags. `canonical_tags.name` is globally `UNIQUE`. `deprecated` flag (no deletes).
- `sensor_tag_bindings` — F4.3 seeds 14 active bindings (one per sensor). Partial unique index `(sensor_id) WHERE effective_to IS NULL` enforces one active binding per sensor.

### 4.4 `integration_sources` and `integration_mappings`

Both present per F4.1 / F4.2B:

- `integration_sources` — `kind` CHECK matches `telemetry_readings.source` exactly. `status ∈ {active, inactive}`. `credentials_reference (TEXT)` for external secret store. F4.3 seeds **one inactive source** for shape verification.
- `integration_mappings` — has `UNIQUE (integration_source_id, external_identifier)`. Columns: `unit_id (NOT NULL FK)`, `sensor_id (nullable FK)`, `canonical_tag_id (nullable FK)`, `engineering_unit_override (nullable)`, `transformation_reference (nullable)`, `enabled (BOOLEAN DEFAULT FALSE)`. F4.3 seeds **one disabled mapping**.

### 4.5 Quarantine / ingestion-error surface

**Not present.** No `telemetry_ingestion_errors` table, no `late_telemetry_quarantine` table, no equivalent. The F1 `LateTelemetryQuarantine` model was removed in F4.2B; nothing has replaced it. F4.6A.1 is the proposed sub-phase that introduces one.

### 4.6 Alarm tables

Present per F4.1 / F4.2B but unrelated to F4.6A.0's schema-hardening scope:

- `alarm_rules`, `alarm_thresholds`, `alarm_events`, `commissioning_snapshots` — all provisioned, F4.3 seeds rules + one snapshot. No `alarm_events` row has ever been written by production code.

### 4.7 Audit

`audit_logs` present per F4.1 / F4.2B. F4.6A.1 will reuse it for mapping / source change audit; F4.6A.0 makes no change.

## 5. Schema Decisions to Finalize

### A. Deduplication partial indexes — **decision**

**Final key form: sensor-first AND source-aware for the sequence-based key; sensor-first (canonical-instrument-keyed) for the timestamp-based key.** The two dedup forms are intentionally asymmetric, for the reason explained below.

#### Why sequence and timestamp dedup must be keyed differently

- **Sequence numbers are source-local.** They are generated upstream by the integration source / gateway / publisher; they have no canonical meaning outside that source's namespace. Two independent integration sources can legitimately publish the same `sequence` value for what they each consider their own channel — and after mapping resolution, both can resolve to the **same** `(sensor_id, canonical_tag_id)` pair. This scenario is operationally realistic: replay tools, source migration, redundant publisher topology, future bridge integrations, and any case where two `IntegrationSource` rows feed the same logical instrument all produce overlapping sequence ranges. A dedup key keyed only on `(sensor_id, canonical_tag_id, sequence)` would treat those legitimately-distinct readings as duplicates and drop one of them silently — a correctness bug. **The sequence-based key must therefore include source identity.**
- **Timestamps are canonical once normalized.** After the boundary normalizes the source timestamp to UTC `TIMESTAMPTZ`, the tuple `(sensor_id, canonical_tag_id, timestamp)` is the canonical identity of "the measurement on that physical instrument at that exact moment". Two independent sources reporting the same `(sensor, tag, timestamp)` are, by definition, two reports of the same physical event; one must give way. The conflict resolution (same key + same value → no-op; same key + different value → quarantine as `conflict_dedup`) is the correct behavior. **The timestamp-based key is canonical-instrument-keyed and does not need source identity in its predicate.**

#### Final indexes proposed for F4.6A.1 (Phase 1)

| Name | Columns | Predicate |
|---|---|---|
| `telemetry_readings_dedup_seq_uk` | `(integration_source_id, sensor_id, canonical_tag_id, sequence)` | `WHERE sequence IS NOT NULL AND integration_source_id IS NOT NULL` |
| `telemetry_readings_dedup_ts_uk` | `(sensor_id, canonical_tag_id, "timestamp")` | `WHERE sequence IS NULL` |

**Forensic / observability auxiliary index (recommended, non-unique):**

| Name | Columns | Predicate |
|---|---|---|
| `telemetry_readings_ingestion_id_idx` | `(ingestion_id, created_at DESC)` | `WHERE ingestion_id IS NOT NULL` |

The auxiliary index supports replay tools and operator forensics ("which canonical rows correspond to this external identifier?") without affecting dedup correctness. It is optional; F4.6A.1 may include it or defer.

#### Required schema column addition for F4.6A.1

The current `telemetry_readings` table does **not** carry an `integration_source_id (UUID)` column (see §4.1 gap #2). F4.6A.1 must add it so the sequence-based dedup index above can be implemented:

```sql
ALTER TABLE telemetry_readings
    ADD COLUMN integration_source_id UUID
        REFERENCES integration_sources(id) ON DELETE SET NULL;

CREATE INDEX telemetry_readings_integration_source_idx
    ON telemetry_readings (integration_source_id)
    WHERE integration_source_id IS NOT NULL;
```

The column is **nullable**: legacy / manual / simulator drafts that do not resolve a specific `IntegrationSource` row may carry `NULL`. The partial unique index's `WHERE integration_source_id IS NOT NULL` predicate handles that case naturally — NULL-source readings fall under the timestamp-based dedup key (Form B) instead, which is correct because such drafts have no upstream sequence namespace to disambiguate against.

The existing `ingestion_id (TEXT, nullable)` column already carries the `external_identifier` copy for forensic traceability per F4 architecture; F4.6A.1 does **not** rename or alter it.

#### Why the sensor-first / transmitter-first principle is preserved

1. Both indexes lead with the **physical-instrument identity** (`sensor_id`) and the **canonical measurement identity** (`canonical_tag_id`). Telemetry continues to belong to configured physical instruments, never to free-form labels.
2. The sequence-based index adds `integration_source_id` as a **scoping predicate**, not as a primary identity. The dedup is still "this physical sensor, this canonical measurement", scoped to the source that emitted the counter.
3. `unit_id` remains omitted from both keys. `sensors.unit_id` is a strict `NOT NULL FK`; resolving the unit from the sensor is a single join with no information loss. Including `unit_id` would be pure denormalization.
4. Including `canonical_tag_id` alongside `sensor_id` remains defensive against `SensorTagBinding` rebinding history: a sensor may have been bound to a different canonical tag in a past effective-dated window; including both means a legitimate rebinding does not collapse old and new readings.

#### Future refinement (post-F4.6A, not in scope for F4.6A.1)

If a later sub-phase formalizes `ingestion_id` (or a renamed `external_identifier`) as a canonical forensic field that **must** be present alongside `sequence`, the sequence-based dedup key can tighten to the strongest form:

```
telemetry_readings_dedup_seq_uk (future):
  (integration_source_id, external_identifier, sensor_id, canonical_tag_id, sequence)
  WHERE sequence IS NOT NULL
    AND integration_source_id IS NOT NULL
    AND external_identifier IS NOT NULL
```

That refinement requires `telemetry_readings.ingestion_id` (or its renamed counterpart) to be non-null whenever `sequence` is non-null — a boundary-contract decision that belongs to F4.6B (when the ingestion service decides whether `ingestion_id` is mandatory alongside `sequence`) or to a later phase. It is **not** part of F4.6A.1.

#### Phased fallback note

`sensor_id` and `canonical_tag_id` are both `NOT NULL` on `telemetry_readings` today. The only schema gap is the missing `integration_source_id (UUID)` column, which F4.6A.1 closes via the `ALTER TABLE` above. No further phasing is required for the F4.6A.1 indexes.

### B. Quarantine table — **decision**

**Final name: `telemetry_ingestion_errors`.**

A dedicated quarantine table for rejected / conflicted / late / unmapped drafts. Rows are diagnostic, never canonical. Retention is operational, not historical.

**Final proposed columns (F4.6A.1 to implement):**

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `UUID` | NOT NULL, PK | `DEFAULT gen_random_uuid()`. |
| `tenant_id` | `UUID` | nullable, FK to `tenants` `ON DELETE SET NULL` | Null only when `reason ∈ {unknown_source, tenant_mismatch}` and no tenant could be resolved. |
| `integration_source_id` | `UUID` | nullable, FK to `integration_sources` `ON DELETE SET NULL` | Null only when the source itself could not be resolved (reason `unknown_source`). |
| `integration_mapping_id` | `UUID` | nullable, FK to `integration_mappings` `ON DELETE SET NULL` | Null when no mapping resolved. |
| `unit_id` | `UUID` | nullable, FK to `measurement_units` `ON DELETE SET NULL` | Null when unresolved. |
| `sensor_id` | `UUID` | nullable, FK to `sensors` `ON DELETE SET NULL` | Null when unresolved. |
| `canonical_tag_id` | `UUID` | nullable, FK to `canonical_tags` `ON DELETE SET NULL` | Null when unresolved. |
| `external_identifier` | `TEXT` | nullable | Copy of the draft's external identifier. |
| `timestamp` | `TIMESTAMPTZ` | nullable | Source timestamp from the draft. Null when unparseable. |
| `ingestion_timestamp` | `TIMESTAMPTZ` | NOT NULL `DEFAULT now()` | Wall clock at the boundary (= `receivedAt`). |
| `reason` | `TEXT` | NOT NULL, CHECK | See enum below. |
| `reason_detail` | `TEXT` | nullable | Free-form human-readable elaboration (e.g. `"value '4.2e+99' overflows NUMERIC"`). |
| `quality` | `TEXT` | nullable, CHECK | Same enum as `telemetry_readings.quality`. Null when unparseable. |
| `engineering_unit` | `TEXT` | nullable | Source-declared unit. |
| `value` | `NUMERIC` | nullable | Source-declared value. Null when unparseable. |
| `raw_payload` | `JSONB` | NOT NULL | Verbatim opaque copy of the draft as received. |
| `metadata` | `JSONB` | nullable | Boundary-side notes (resolved IDs, dedup-conflict snapshots `{existing_value, incoming_value}`, etc.). |
| `correlation_id` | `UUID` | nullable | Batch correlation; matches `audit_logs.correlation_id` when relevant. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL `DEFAULT now()` | Row creation time (= `ingestion_timestamp` in practice, kept for schema-consistency with other tables). |

**Final `reason` CHECK enum:**

```
late_outside_window | future_timestamp | unknown_source |
unknown_mapping | disabled_mapping | unresolved_sensor |
unresolved_tag | tenant_mismatch | invalid_quality |
invalid_value | unit_mismatch | outside_envelope |
conflict_dedup | inactive_context | mapping_engine_failure
```

`closed_job` and any other Jobs-specific reason are **explicitly excluded** per F4.6. `inactive_context` is the neutral forward-looking placeholder for the eventual operational-context wiring; it will not be exercised by F4.6A.1 itself.

**Final proposed indexes:**

| Name | Columns | Predicate | Purpose |
|---|---|---|---|
| `telemetry_ingestion_errors_tenant_time_idx` | `(tenant_id, created_at DESC)` | none | Operator dashboard "what's been quarantined for this tenant lately?". |
| `telemetry_ingestion_errors_source_time_idx` | `(integration_source_id, created_at DESC)` | none | Per-source troubleshooting. |
| `telemetry_ingestion_errors_reason_time_idx` | `(reason, created_at DESC)` | none | "Show me everything currently failing for reason X." |
| `telemetry_ingestion_errors_external_idx` | `(integration_source_id, external_identifier)` | none, non-unique | Forensic lookup of all errors for a given external identifier. |

**Retention guidance (default, not enforced by F4.6A.1):**

- **Default retention: 30 days.** Operators triage within that window.
- **Mechanism:** future operational pruner job (out of scope for F4.6A.1).
- **Override:** per-deployment via a future config flag; not implemented now.

**Append-only?** Quarantine rows are diagnostic and may be archived / pruned. They are **not** append-only in the same hard sense as `telemetry_readings`; deleting old quarantine rows is acceptable operational hygiene.

### C. Live reading projection strategy — **decision**

**Final recommendation: upsert-maintained table `live_readings`.** Implemented at F4.6A.1 (table creation) and populated at F4.6B / F4.6C (boundary-side upsert hook).

**Why a table, not a view or materialized view:**

1. **Fast UI reads.** A primary-key lookup on `live_readings` is O(1); a `DISTINCT ON` over `telemetry_readings` scales linearly with telemetry volume. At F4.3 baseline this difference is invisible; at production volume it becomes the hot path.
2. **Alarm fan-out and WebSocket / SSE later.** F4.6D's alarm evaluator and F4.6E's realtime emitter both need the "latest value" cheaply and atomically with the canonical insert. A table makes that an upsert; a view forces a re-scan per event.
3. **Restart safety.** A backend redeploy does not blank the dashboard; the table survives. A pure in-memory cache would lose state.
4. **Late-arrival semantics are explicit.** A late `good` reading whose timestamp is older than the stored row's timestamp **does not** overwrite (gated by `new.timestamp > stored.timestamp`). A view's `ORDER BY timestamp DESC` accomplishes the same naturally; a table enforces it explicitly, which is fine — explicit is better than implicit.
5. **Quality watermarking is explicit.** Only `good` readings update the projection. `uncertain` and `bad` leave the last `good` value in place (preserving the dashboard from flapping under transient bad-quality runs).
6. **Rebuildable.** If the projection table is ever lost, it can be reconstructed deterministically from `telemetry_readings` with a one-shot `INSERT … SELECT DISTINCT ON …`. F4.6C ships the rebuild query; F4.6A.1 needs only the table.

### D. Live reading projection key — **decision**

**Final PK: `(unit_id, sensor_id, canonical_tag_id)`.**

**Rationale.**

1. **Transmitter-first.** The natural address of a current measurement is "this canonical measurement on this instrument on this unit". `sensor_id` carries the physical-instrument identity that survives transmitter replacement.
2. **Two sensors on the same unit may represent related or repeated measurements.** EMMAD-class units typically carry a pair of pressure transmitters (inlet + outlet); both legitimately publish a `pressure` family of readings, distinguished by canonical tag (`p_inlet` vs `p_outlet`). The PK preserves that distinction without the UI having to disambiguate post-hoc.
3. **`unit_id` is denormalized but valuable for query convenience.** Tenant-scoped dashboards filter by unit; carrying `unit_id` on the projection row avoids a join on every read. The cost is a 16-byte column duplication per row, which is negligible.
4. **Stability under rebinding.** A future re-binding of a sensor from canonical tag A to canonical tag B does not leave a stale projection row for the old tag if F4.6C's update logic deletes the prior `(unit, sensor, tag-A)` row when a new `(unit, sensor, tag-B)` reading arrives — but that cleanup is an F4.6C decision, not an F4.6A.0 one.
5. **No `canonical_tag_id` stability concern in F4.** `canonical_tags.id` is server-generated and stable. The deprecation flag (`canonical_tags.deprecated`) marks retired tags without deleting them, so the PK never breaks under tag evolution.

**Phased fallback:** none required. `canonical_tag_id` is stable today; the long-term direction is the same as the immediate direction.

### E. Existing `live_readings_projection` VIEW — **decision**

**Final recommendation: keep the existing view in place temporarily; introduce the new `live_readings` table alongside it; defer the view's removal to F4.6C or later.**

**Reasoning.**

1. The view is **not currently queried by any consumer**. The F4.4F telemetry trends endpoint reads `telemetry_readings` directly; the F4.5 frontend adapter reads the trends endpoint or a synthetic mock. Removing the view today would break nothing.
2. However, the safer and more reversible move is **non-destructive coexistence**: introduce the new table without touching the view. F4.6C cuts consumers to the table; once parity is confirmed, F4.6F (or later) drops or renames the view.
3. The new table is named `live_readings`; the existing view is named `live_readings_projection`. **No name collision.** Both can coexist throughout F4.6A.1 → F4.6C.
4. If F4.6C decides to keep the view as a permanent fallback (e.g. for ad-hoc SQL queries by analysts), that is acceptable. The view is read-only and cheap to maintain when no rows exist in `telemetry_readings`; it becomes more expensive only when the table grows, but by then F4.6C will have moved consumers to the projection table anyway.

**F4.6A.1 should not drop, rename, or modify the existing view.** That is an F4.6C decision.

### F. Append-only triggers — **decision**

**Final recommendation: defer SQL-level append-only triggers (and `REVOKE UPDATE, DELETE` role hardening). Enforce append-only first at the API / service boundary.**

**Reasoning.**

1. F4.6A.1 has no production deployment, no operational role separation, and no auth boundary. SQL-level triggers added now would protect an empty database from a workload that does not exist.
2. The ingestion boundary (F4.6B) is structurally the only path that writes `telemetry_readings`. As long as code review enforces "no `prisma.telemetryReading.create` outside the boundary service", append-only is enforced at the application layer where it can also emit useful audit / log signals.
3. SQL triggers add operational complexity (they fire on bulk operations, on Prisma migration replay, on test fixtures, on backup restores). The cost is real.
4. The right time to add triggers + role separation is when production deployment and role-based DB access are designed — a successor ADR (candidate ADR-009 for auth, or a separate role-separation ADR). F4.6A.1 leaves the seam clean by not committing to triggers prematurely.

**What F4.6A.1 does instead:** documents in the `telemetry_readings` and `commissioning_snapshots` table comments that the table is append-only by architecture, that updates and deletes are forbidden by application code, and that trigger-based hardening is scheduled for a later phase. The F4.1 SQL file already contains those comments; F4.6A.1 preserves them.

### G. Rollback plan — **decision**

F4.6A.1's migration must be cleanly reversible. The proposed rollback shape:

1. **Drop the new partial unique indexes** on `telemetry_readings`. `DROP INDEX IF EXISTS telemetry_readings_dedup_seq_uk; DROP INDEX IF EXISTS telemetry_readings_dedup_ts_uk;` plus the auxiliary `telemetry_readings_ingestion_id_idx` and `telemetry_readings_integration_source_idx` if included.
2. **Drop the new `integration_source_id` column** on `telemetry_readings`. `ALTER TABLE telemetry_readings DROP COLUMN IF EXISTS integration_source_id;` — safe because F4.6A.1 does not write any row to `telemetry_readings`, so no canonical telemetry data is at risk. The reverse-migration SQL ships alongside the forward migration per §6.
3. **Drop the new quarantine table.** `DROP TABLE IF EXISTS telemetry_ingestion_errors CASCADE;` — cascades cover its indexes. Any rows present at rollback time are lost; this is acceptable because quarantine rows are diagnostic, not canonical.
4. **Drop the new `live_readings` table.** `DROP TABLE IF EXISTS live_readings CASCADE;` — cascades cover its indexes. Any rows present at rollback time are lost; this is acceptable because the projection is rebuildable from `telemetry_readings`.
5. **Do not touch `live_readings_projection` (VIEW).** F4.6A.1 does not modify it; rollback does not either.
6. **Do not modify existing `telemetry_readings` rows.** No row is added, modified, or removed by F4.6A.1; rollback preserves all historical telemetry data (today: zero rows) without exception. Only the new column added by F4.6A.1 is removed on rollback.
7. **Do not touch any other table.** No FK touches a canonical table in a way that requires reciprocal cleanup.

**Operational rollback procedure (Prisma):**

- `prisma migrate resolve --rolled-back <migration-name>` is the standard Prisma path for unsuccessful migrations.
- For dev environments where a destructive reset is acceptable: `docker compose down -v && docker compose up -d postgres && pnpm --filter @rvf/backend exec prisma migrate dev` returns the local volume to the F4.2 baseline (the F4.6A.1 migration is not replayed).
- For environments with data we want to preserve: an explicit reverse-migration SQL file shipped alongside F4.6A.1 (Prisma does not auto-generate `down` migrations; F4.6A.1 should author one as a sibling file).

**No data-loss risk for canonical history.** F4.6A.1 does not modify `telemetry_readings`, so any rows present (zero today) survive rollback intact.

## 6. Proposed F4.6A.1 Migration Scope

F4.6A.1 — implemented in a follow-up phase after this plan is reviewed — should include exactly the following. Nothing more.

**Prisma schema updates (`apps/backend/prisma/schema.prisma`):**

- **Add an `integrationSourceId` field on the existing `TelemetryReading` model** (`String? @map("integration_source_id") @db.Uuid`), plus a `@relation` to `IntegrationSource` with `onDelete: SetNull` and a reciprocal `telemetryReadings TelemetryReading[]` backref on `IntegrationSource`. Required by the source-aware sequence dedup key per §5.A.
- Add a `LiveReading` Prisma model mapping to `live_readings` (columns and PK per §5.D, with appropriate `@map` / `@db.Uuid` / `@db.Timestamptz(6)` / `@db.Decimal` annotations consistent with the F4.2B baseline).
- Add a `TelemetryIngestionError` Prisma model mapping to `telemetry_ingestion_errors` (columns per §5.B).
- Relations: both new models declare the appropriate `@relation` blocks to `Tenant`, `MeasurementUnit`, `Sensor`, `CanonicalTag`, and (for `TelemetryIngestionError`) `IntegrationSource`, `IntegrationMapping`. Reciprocal backrefs are added on those existing models.
- No change to any other existing model. No change to the `extensions = [pgcrypto]` datasource block.

**New migration (`apps/backend/prisma/migrations/<timestamp>_f4_6a_telemetry_hardening/migration.sql`):**

- `ALTER TABLE telemetry_readings ADD COLUMN integration_source_id UUID REFERENCES integration_sources(id) ON DELETE SET NULL;`
- `CREATE INDEX telemetry_readings_integration_source_idx ON telemetry_readings (integration_source_id) WHERE integration_source_id IS NOT NULL;`
- `CREATE TABLE telemetry_ingestion_errors (…)` with all CHECK constraints from §5.B.
- `CREATE INDEX` statements for the four indexes in §5.B.
- `CREATE TABLE live_readings (…)` with the PK and CHECK from §5.D.
- `CREATE INDEX live_readings_tenant_unit_idx ON live_readings (tenant_id, unit_id);` (tenant-scoped lookups).
- `CREATE UNIQUE INDEX telemetry_readings_dedup_seq_uk ON telemetry_readings (integration_source_id, sensor_id, canonical_tag_id, sequence) WHERE sequence IS NOT NULL AND integration_source_id IS NOT NULL;`
- `CREATE UNIQUE INDEX telemetry_readings_dedup_ts_uk ON telemetry_readings (sensor_id, canonical_tag_id, "timestamp") WHERE sequence IS NULL;`
- *Optional, F4.6A.1's call:* `CREATE INDEX telemetry_readings_ingestion_id_idx ON telemetry_readings (ingestion_id, created_at DESC) WHERE ingestion_id IS NOT NULL;`
- `COMMENT ON TABLE` for both new tables documenting their role and the architectural rules from F4.6 / ADR-008.
- `COMMENT ON COLUMN telemetry_readings.integration_source_id` documenting that it scopes the sequence-based dedup key and is nullable for legacy / manual / simulator drafts.
- **No `DROP VIEW`, no `RENAME VIEW`.** The existing `live_readings_projection` view stays in place.
- **No data writes.** No `INSERT`, no `UPDATE`, no `COPY`.
- **No trigger DDL.** Append-only enforcement remains at the application layer.
- **Reverse-migration SQL** sibling file (`<timestamp>_f4_6a_telemetry_hardening/down.sql` or equivalent) covering every DDL step in inverse order per §5.G — including `ALTER TABLE telemetry_readings DROP COLUMN integration_source_id;`.

**Non-destructive coexistence with the existing projection / view:** explicitly preserved per §5.E.

**No runtime ingestion service:** F4.6A.1 ships zero changes under `apps/backend/src/`. The ingestion service, REST endpoint, simulator adapter, dedup logic, quarantine writes, projection upsert, alarm evaluator, and WebSocket fan-out are all deferred to F4.6B / F4.6C / F4.6D / F4.6E.

**F4.6A.1 closeout report** at `docs/architecture/RVF_Malinois_F4_6A_Schema_Hardening_Closeout_Report.md` documenting the migration commit, the `prisma validate` / `generate` / lint / typecheck / build / test outcomes, and the gate to F4.6B.

## 7. Out of Scope for F4.6A

Explicitly **not** part of F4.6A.0 (this plan) or F4.6A.1 (the migration sub-phase):

- Telemetry ingestion service implementation.
- API endpoint implementation (no `POST /telemetry/ingest`, no `GET /telemetry/latest`, no `GET /alarms/*`).
- WebSocket / SSE fan-out.
- Alarm rule engine implementation.
- `alarm_events` write path.
- Operations trend API extensions.
- Units current-value API changes.
- MQTT integration.
- Modbus integration.
- OPC-UA integration.
- ThingsBoard integration.
- Node-RED integration.
- PLC adapters.
- Edge-gateway adapters.
- Historian adapters.
- Jobs model wiring.
- Jobs UI.
- Operational-context lookup mechanism (deferred to F4.6D).
- Frontend changes of any kind.
- Production authentication (deferred to a successor ADR).
- TimescaleDB conversion.
- Append-only SQL triggers.
- Quarantine retention / pruner job.
- Replay tooling for quarantined rows.

## 8. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Wrong dedup key collapses legitimate readings from independent sources sharing the same `sequence` namespace (e.g. replay tools, redundant publishers, or two `IntegrationSource` rows feeding the same logical instrument). | medium (before correction) → very low (after §5.A correction) | high (silent data loss if uncorrected) | The sequence-based key includes `integration_source_id` as a scoping predicate, so two distinct sources publishing the same `sequence` to the same `(sensor, canonical_tag)` no longer collide. Documented explicitly in §5.A "Why sequence and timestamp dedup must be keyed differently". |
| Wrong dedup key collapses legitimate readings within the same `timestamp` resolution under Form B (a sensor emitting two valid readings inside the same microsecond). | low | medium | `timestamp` is `TIMESTAMPTZ` with microsecond precision in PostgreSQL; collisions at that resolution from a single sensor are operationally implausible. If they happen, the second reading goes to quarantine as `conflict_dedup` — visible, not silent. Mitigated further when the source emits `sequence` (Form A applies, with source-awareness). |
| Live projection diverges from historical telemetry. | medium | medium | Projection upsert (F4.6C) shares the same transactional unit as the canonical insert; either both commit or both fail. A deterministic rebuild query lets F4.6C recompute the projection from `telemetry_readings` if drift is ever detected. The rebuild stays within the canonical record. |
| F4.6A.1 migration breaks current UI adapters. | very low | high | No consumer reads `live_readings_projection` today; the F4.4F trends endpoint reads `telemetry_readings` directly. The new table coexists with the view (§5.E). Frontend adapters (F4.5B → F4.5E) are unaffected because the existing trends shape does not change. |
| Overcommitting to external integration assumptions during schema-hardening. | low | medium | F4.6A.1 only adds tables / indexes; it does not commit to any bridge library, broker, or vendor SDK. ADR-008's neutrality (all ten `source` values supported equally) is preserved. |
| Adding Jobs concepts too early through a hidden dependency. | low | medium | The new schemas (`telemetry_ingestion_errors`, `live_readings`) **explicitly do not carry** a `job_id` column. The `inactive_context` quarantine reason is a forward-looking placeholder, not an active code path. Reviewers must reject any subsequent PR that smuggles Jobs wiring into F4.6A.1. |
| Migration rollback complexity. | low | medium | All three additions (two indexes, two tables, optional aux index) are `DROP`-cleanly-reversible. `telemetry_readings` is not modified. The existing view is not modified. A reverse-migration SQL sibling file ships with F4.6A.1 per §5.G. |
| Quarantine table grows unbounded. | low | low | Retention default (30 days) documented in §5.B. F4.6A.1 does not implement the pruner; a later operational task does. In the interim, an empty quarantine table is the F4.6B baseline. |
| `live_readings` PK choice (`(unit_id, sensor_id, canonical_tag_id)`) clashes with a future shape. | very low | medium | If a later requirement demands a tag-agnostic latest-value lookup, an additional secondary index (or a separate `live_unit_summary` projection) is a follow-up — not a redesign. The chosen PK is the safest starting point. |
| Schema additions conflict with future TimescaleDB conversion. | very low | low | The new tables are independent of `telemetry_readings`'s hypertable potential. Converting `telemetry_readings` later does not affect `live_readings` or `telemetry_ingestion_errors`. ADR-007 §4 stance preserved. |

## 9. Acceptance Criteria for F4.6A.0

F4.6A.0 is considered complete when all of the following are true:

| # | Criterion |
|---|---|
| 1 | Plan document created at `docs/architecture/RVF_Malinois_F4_6A_Schema_Hardening_Plan.md`. |
| 2 | Each schema decision in §5 (A–G) is documented with a final recommendation and explicit rationale. |
| 3 | The final dedup keys are **sensor-first AND source-aware where needed**: the sequence-based key `(integration_source_id, sensor_id, canonical_tag_id, sequence) WHERE sequence IS NOT NULL AND integration_source_id IS NOT NULL` (source-aware because sequence numbers are source-local); the timestamp-based key `(sensor_id, canonical_tag_id, "timestamp") WHERE sequence IS NULL` (canonical-instrument-keyed, no source scoping needed). Named indexes and predicates fixed. |
| 4 | The quarantine table name (`telemetry_ingestion_errors`), columns, CHECK enum, and indexes are fixed. **No Jobs-specific reason** appears in the CHECK enum. |
| 5 | The live projection strategy is fixed as an upsert-maintained table (`live_readings`), with the PK `(unit_id, sensor_id, canonical_tag_id)` fixed. |
| 6 | The existing `live_readings_projection` VIEW is documented as preserved temporarily; F4.6A.1 does not drop or rename it. |
| 7 | Append-only SQL triggers are explicitly deferred. |
| 8 | A rollback plan is documented. |
| 9 | The F4.6A.1 migration scope (§6) is fixed and bounded — Prisma model edits + one migration directory + non-destructive coexistence. |
| 10 | No runtime code changed by F4.6A.0. |
| 11 | No Prisma schema changed by F4.6A.0. |
| 12 | No migration added by F4.6A.0. |
| 13 | No frontend changed by F4.6A.0. |
| 14 | No backend service / controller / route / WebSocket / external integration added by F4.6A.0. |
| 15 | Jobs remain deferred; no Jobs flow, lookup, table, or UI is introduced. |
| 16 | RVF Malinois reaffirmed as canonical system of record. PostgreSQL reaffirmed as baseline. TimescaleDB / ThingsBoard / Node-RED / MQTT / Modbus / OPC-UA / PLC / historian remain optional, non-mandatory. |
| 17 | Transmitter-first / sensor-first direction preserved in every schema decision. |
| 18 | Historical telemetry vs live projection distinction preserved. |
| 19 | F4.6A.1 can be started only after this plan is reviewed and approved. |

## 10. Recommended Next Step

**F4.6A.1 — Prisma Schema + Migration Implementation.**

After this plan is reviewed and approved, F4.6A.1 may begin. F4.6A.1 implements exactly the scope fixed in §6 of this document and produces:

- An updated `apps/backend/prisma/schema.prisma` carrying the two new models.
- A new migration directory under `apps/backend/prisma/migrations/` with `migration.sql` and a sibling reverse-migration SQL file per §5.G.
- A closeout report at `docs/architecture/RVF_Malinois_F4_6A_Schema_Hardening_Closeout_Report.md`.
- Green quality gates (`prisma validate`, `prisma generate`, backend `lint / typecheck / build / test`).

F4.6A.1 **must not** begin until F4.6A.0 is reviewed and approved. Approval is the gate; this plan exists precisely to make that review feasible without arguing about names, predicates, columns, or rollback in a migration PR diff.

Parallel work that does **not** depend on F4.6A.0 / F4.6A.1 and may proceed independently:

- **F4.5G+** — per-screen migration of Wells / Equipment / Catalog from the F3 mock adapter to the corresponding F4.5B / F4.5C adapter, following the F4.5F template. Cero dependencia con F4.6A.

---

*F4.6A.0 plan. The decisions above are locked. F4.6A.1 implements them.*
