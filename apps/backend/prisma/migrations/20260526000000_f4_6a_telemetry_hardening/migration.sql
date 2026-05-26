-- =============================================================================
-- RVF Malinois — F4.6A.1 telemetry hardening migration
-- =============================================================================
-- Phase:    F4.6A.1 — Prisma Schema + Migration Implementation.
-- Source:   docs/architecture/RVF_Malinois_F4_6A_Schema_Hardening_Plan.md
--           (commit 014df37). Approved by F4.6A.0.
-- Anchors:  docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Architecture.md
--           (commit c12a29c)
--           docs/adr/ADR-008_RVF_Malinois_Telemetry_Persistence_Ingestion.md
--           (commit c12a29c)
--           apps/backend/prisma/migrations/20260524000000_f4_2_baseline/migration.sql
--           (F4.2B baseline, commit e37f7b5)
--
-- This migration adds the schema scaffolding F4.6B → F4.6E will populate. It
-- does NOT create any service, controller, route, simulator, WebSocket, alarm
-- evaluator, or external bridge. It writes no data into any table.
--
-- Concrete changes:
--
--   1. ALTER telemetry_readings ADD COLUMN integration_source_id (nullable).
--   2. CREATE telemetry_readings_integration_source_idx (partial lookup).
--   3. CREATE UNIQUE telemetry_readings_dedup_seq_uk
--                  (integration_source_id, sensor_id, canonical_tag_id, sequence)
--                  WHERE sequence IS NOT NULL AND integration_source_id IS NOT NULL.
--      Source-aware sequence dedup — sequence numbers are source-local.
--   4. CREATE UNIQUE telemetry_readings_dedup_ts_uk
--                  (sensor_id, canonical_tag_id, "timestamp")
--                  WHERE sequence IS NULL.
--      Canonical-instrument timestamp dedup — sensor + tag + ts is the
--      canonical identity of a normalized physical reading.
--   5. CREATE telemetry_readings_ingestion_id_idx (partial forensic).
--   6. CREATE TABLE telemetry_ingestion_errors (+ 4 indexes, 2 CHECK constraints).
--   7. CREATE TABLE live_readings           (+ 4 indexes, 2 CHECK + 1 UNIQUE constraint).
--
-- It does NOT:
--   - Drop, rename, or modify the existing live_readings_projection VIEW
--     (preserved per F4.6A.0 §5.E for non-destructive coexistence).
--   - Insert / update / delete any row in any table (no data writes).
--   - Add append-only triggers (deferred per F4.6A.0 §5.F).
--   - Touch tenants / users / equipment / sensors / canonical_tags / alarm_rules
--     / alarm_events / wells / jobs / commissioning_snapshots / integration_*
--     / audit_logs definitions beyond a single ALTER on telemetry_readings.
--
-- Reverse migration (manual): see sibling down.sql.
-- =============================================================================


-- =============================================================================
-- A. Add integration_source_id to telemetry_readings
-- =============================================================================

ALTER TABLE telemetry_readings
    ADD COLUMN integration_source_id UUID
        REFERENCES integration_sources(id) ON DELETE SET NULL;

COMMENT ON COLUMN telemetry_readings.integration_source_id IS
    'F4.6A.1 — scopes the source-aware sequence dedup index. Nullable for legacy / manual / simulator drafts that do not resolve a specific IntegrationSource row; such rows fall under the timestamp-based dedup key (Form B) instead.';

-- Lookup index for "which canonical telemetry rows came from this source?".
CREATE INDEX telemetry_readings_integration_source_idx
    ON telemetry_readings (integration_source_id)
    WHERE integration_source_id IS NOT NULL;


-- =============================================================================
-- B. Deduplication partial unique indexes
-- =============================================================================

-- Form A — sequence-based, source-aware. Sequence numbers are source-local
-- (replay, source migration, redundant publishers, future bridges all produce
-- legitimate overlapping sequence ranges across distinct IntegrationSource
-- rows). The dedup key MUST include source identity. Without this scoping
-- predicate, two distinct sources publishing the same `sequence` to the same
-- (sensor, canonical_tag) would silently collapse a legitimately-distinct
-- reading — a correctness bug.
CREATE UNIQUE INDEX telemetry_readings_dedup_seq_uk
    ON telemetry_readings (integration_source_id, sensor_id, canonical_tag_id, sequence)
    WHERE sequence IS NOT NULL AND integration_source_id IS NOT NULL;

-- Form B — timestamp-based, canonical-instrument-keyed. Once the boundary
-- normalizes source timestamps to UTC TIMESTAMPTZ, the tuple
-- (sensor_id, canonical_tag_id, timestamp) is the canonical identity of a
-- timestamped physical reading. Two sources reporting the same physical
-- event must resolve via the conflict-quarantine path, not coexist as
-- duplicate canonical rows.
CREATE UNIQUE INDEX telemetry_readings_dedup_ts_uk
    ON telemetry_readings (sensor_id, canonical_tag_id, "timestamp")
    WHERE sequence IS NULL;


-- =============================================================================
-- C. Forensic auxiliary index on ingestion_id
-- =============================================================================
-- Non-unique. Supports replay tools and operator forensics: "which canonical
-- rows correspond to this external identifier?". Does not affect dedup
-- correctness — dedup uniqueness is enforced by the two partial indexes above.

CREATE INDEX telemetry_readings_ingestion_id_idx
    ON telemetry_readings (ingestion_id, created_at DESC)
    WHERE ingestion_id IS NOT NULL;


-- =============================================================================
-- D. Quarantine surface — telemetry_ingestion_errors
-- =============================================================================
-- Diagnostic, not canonical. Rows record telemetry drafts that did NOT enter
-- telemetry_readings (late / unknown mapping / disabled mapping / unresolved
-- sensor or tag / invalid quality or value / unit mismatch / outside envelope
-- / dedup conflict / inactive context / source-resolution failure). Operator
-- triages via the read endpoints F4.6D will introduce.
--
-- No Jobs-specific reason is included. `closed_job` is excluded. The neutral
-- forward-looking `inactive_context` placeholder is the only reason that
-- gestures at operational-context wiring; F4.6 itself does not wire it.

CREATE TABLE telemetry_ingestion_errors (
    id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID         REFERENCES tenants(id) ON DELETE SET NULL,
    integration_source_id    UUID         REFERENCES integration_sources(id) ON DELETE SET NULL,
    integration_mapping_id   UUID         REFERENCES integration_mappings(id) ON DELETE SET NULL,
    unit_id                  UUID         REFERENCES measurement_units(id) ON DELETE SET NULL,
    sensor_id                UUID         REFERENCES sensors(id) ON DELETE SET NULL,
    canonical_tag_id         UUID         REFERENCES canonical_tags(id) ON DELETE SET NULL,
    external_identifier      TEXT,
    "timestamp"              TIMESTAMPTZ,
    ingestion_timestamp      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    reason                   TEXT         NOT NULL,
    reason_detail            TEXT,
    quality                  TEXT,
    engineering_unit         TEXT,
    value                    NUMERIC,
    raw_payload              JSONB,
    metadata                 JSONB,
    correlation_id           TEXT,
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT telemetry_ingestion_errors_reason_chk
        CHECK (reason IN (
            'late_outside_window',
            'future_timestamp',
            'unknown_source',
            'unknown_mapping',
            'disabled_mapping',
            'unresolved_sensor',
            'unresolved_tag',
            'tenant_mismatch',
            'invalid_quality',
            'invalid_value',
            'unit_mismatch',
            'outside_envelope',
            'conflict_dedup',
            'inactive_context',
            'mapping_engine_failure'
        )),
    CONSTRAINT telemetry_ingestion_errors_quality_chk
        CHECK (quality IS NULL OR quality IN ('good', 'uncertain', 'bad'))
);

COMMENT ON TABLE telemetry_ingestion_errors IS
    'F4.6A.1 — Quarantine surface for telemetry drafts that did not enter telemetry_readings. Diagnostic, not canonical. Rows may be pruned by a later operational retention job (default guidance: 30 days). No Jobs-specific reason is used; the F4.6 / ADR-008 Jobs deferral is preserved.';

CREATE INDEX telemetry_ingestion_errors_tenant_created_idx
    ON telemetry_ingestion_errors (tenant_id, created_at DESC);
CREATE INDEX telemetry_ingestion_errors_source_created_idx
    ON telemetry_ingestion_errors (integration_source_id, created_at DESC);
CREATE INDEX telemetry_ingestion_errors_reason_created_idx
    ON telemetry_ingestion_errors (reason, created_at DESC);
CREATE INDEX telemetry_ingestion_errors_external_identifier_idx
    ON telemetry_ingestion_errors (integration_source_id, external_identifier);


-- =============================================================================
-- E. Live readings projection table — live_readings
-- =============================================================================
-- Upsert-maintained projection of the latest reading per
-- (unit_id, sensor_id, canonical_tag_id). Derived from telemetry_readings;
-- NOT canonical. F4.6C will populate it from the ingestion boundary; F4.6A.1
-- only creates the table.
--
-- The pre-existing live_readings_projection SQL VIEW is preserved (see
-- F4.6A.0 §5.E). Coexistence is intentional and non-destructive.

CREATE TABLE live_readings (
    id                            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                     UUID         NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    unit_id                       UUID         NOT NULL REFERENCES measurement_units(id) ON DELETE RESTRICT,
    sensor_id                     UUID         NOT NULL REFERENCES sensors(id) ON DELETE RESTRICT,
    canonical_tag_id              UUID         NOT NULL REFERENCES canonical_tags(id) ON DELETE RESTRICT,
    latest_telemetry_reading_id   UUID         REFERENCES telemetry_readings(id) ON DELETE SET NULL,
    value                         NUMERIC      NOT NULL,
    engineering_unit              TEXT         NOT NULL,
    quality                       TEXT         NOT NULL,
    status                        TEXT,
    "timestamp"                   TIMESTAMPTZ  NOT NULL,
    source                        TEXT,
    ingestion_timestamp           TIMESTAMPTZ,
    created_at                    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at                    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT live_readings_quality_chk
        CHECK (quality IN ('good', 'uncertain', 'bad')),
    CONSTRAINT live_readings_source_chk
        CHECK (source IS NULL OR source IN (
            'mock', 'manual', 'field_gateway', 'historian',
            'plc', 'mqtt', 'node_red', 'opc_ua', 'modbus', 'edge_gateway'
        )),
    CONSTRAINT live_readings_unit_sensor_tag_uk
        UNIQUE (unit_id, sensor_id, canonical_tag_id)
);

COMMENT ON TABLE live_readings IS
    'F4.6A.1 — Upsert-maintained projection of the latest reading per (unit_id, sensor_id, canonical_tag_id). Derived from telemetry_readings; NOT canonical. F4.6C populates it. The pre-existing live_readings_projection VIEW is preserved for coexistence per F4.6A.0 §5.E.';

CREATE INDEX live_readings_tenant_unit_idx
    ON live_readings (tenant_id, unit_id);
CREATE INDEX live_readings_unit_idx
    ON live_readings (unit_id);
CREATE INDEX live_readings_sensor_idx
    ON live_readings (sensor_id);
CREATE INDEX live_readings_time_idx
    ON live_readings ("timestamp" DESC);


-- =============================================================================
-- F. Preservation of existing live_readings_projection VIEW
-- =============================================================================
-- IMPORTANT: F4.6A.1 intentionally does NOT drop, rename, or alter the
-- live_readings_projection VIEW created by the F4.2 baseline migration. The
-- VIEW continues to return DISTINCT ON (unit_id, sensor_id) over
-- telemetry_readings. Consumers may continue to read it until F4.6C cuts API
-- consumers to the new live_readings projection table. This preserves
-- non-destructive coexistence per F4.6A.0 plan §5.E.

-- =============================================================================
-- End of F4.6A.1 telemetry hardening migration.
-- =============================================================================
