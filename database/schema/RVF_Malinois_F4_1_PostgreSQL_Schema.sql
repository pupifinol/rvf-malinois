-- =============================================================================
-- RVF Malinois — F4.1 PostgreSQL Schema Foundation
-- =============================================================================
-- Phase:        F4.1 — Schema Implementation (SQL foundation only).
-- Status:       PostgreSQL baseline; no Prisma, no migrations, no seed data,
--               no runtime connection, no telemetry ingestion.
-- Source of
-- truth:       docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md
--               (commit f36923a) and docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md
--               (commit 8147399).
--
-- Architectural decisions encoded here (binding, do not weaken):
--   1. RVF Malinois owns this schema as the canonical system of record
--      (ADR-006, ADR-007). No external IoT platform writes here directly.
--   2. PostgreSQL-compatible only. No TimescaleDB-specific syntax; no
--      hypertables. TimescaleDB is documented as a future optional
--      extension; telemetry_readings can be converted later without
--      redesign.
--   3. Multi-tenant isolation is enforced at the column level on every
--      operational / canonical table via tenant_id + FK to tenants.
--   4. TransmitterDevice is its own table (transmitter_devices). Modeling
--      it as JSON on sensors would collapse calibration / replacement
--      history that audits depend on.
--   5. LiveReading is NOT a canonical table. The latest-value concept is
--      exposed as a derived SQL view (live_readings_projection) so that
--      the canonical historical record in telemetry_readings remains the
--      single source of truth. The view implementation is provisional;
--      F4.6 chooses the final projection mechanism (view, materialized
--      view, or upsert table).
--   6. Alarm thresholds are per-unit, per-canonical-tag, never global.
--      There is intentionally no "global alarm thresholds" table; Settings
--      cannot impose per-unit limits (F4 §E).
--   7. CommissioningSnapshot is immutable by architecture. SQL alone
--      cannot fully enforce immutability without triggers or revoked
--      privileges; this baseline relies on application-layer discipline
--      plus the `immutable` flag and explanatory comments. Hardening with
--      triggers / GRANT revocation belongs to a later phase.
--   8. TelemetryReading is append-only by architecture. Same enforcement
--      note as (7).
--   9. AuditLog is append-only by architecture. Same enforcement note as
--      (7). The single central table model is per F4 §H.
--  10. UUID primary keys via pgcrypto's gen_random_uuid(). The application
--      may also provide UUIDs explicitly; defaults are convenience, not a
--      requirement.
--  11. No DROP, no TRUNCATE, no destructive statements. No credentials,
--      URLs, or environment-specific values.
--
-- Out of scope for F4.1 (handled in later F4.x phases):
--   - Prisma schema and Prisma migrations (F4.2).
--   - Seed / reference data — EquipmentType rows, CanonicalTag dictionary,
--     HP-001 / LP-001 example units (F4.3).
--   - API adaptation to a real database (F4.4).
--   - UI wiring (F4.5).
--   - Telemetry ingestion and LiveReading projection selection (F4.6).
--   - Row-level security, GRANT/REVOKE policies, retention partitions,
--     trigger-based immutability enforcement.
-- =============================================================================

-- Extension for UUID generation. pgcrypto is part of contrib and is the
-- standard choice for PostgreSQL-compatible deployments. No TimescaleDB
-- extension is required by F4.1.
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- =============================================================================
-- A. Tenancy and identity
-- =============================================================================

-- Tenant — multi-client root. Every operational entity belongs, directly or
-- transitively, to exactly one tenant (F4 §D Tenant, ADR-002 residency).
CREATE TABLE tenants (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT        NOT NULL,
    status            TEXT        NOT NULL DEFAULT 'active',
    residency_hint    TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tenants_status_chk
        CHECK (status IN ('active', 'inactive'))
);

COMMENT ON TABLE tenants IS
    'Multi-client root. Every canonical operational row carries a tenant_id FK back to this table.';


-- User (placeholder) — actor identity for audit references. Real
-- authentication is explicitly out of scope for F4 (ADR-007 §7).
CREATE TABLE users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    display_name  TEXT        NOT NULL,
    role          TEXT        NOT NULL DEFAULT 'viewer',
    status        TEXT        NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_role_chk
        CHECK (role IN ('system', 'admin', 'engineer', 'operator', 'viewer')),
    CONSTRAINT users_status_chk
        CHECK (status IN ('active', 'inactive'))
);

COMMENT ON TABLE users IS
    'Pre-auth placeholder. Exists so audit_logs.actor_id has a stable FK; populated by static system / admin rows until real authentication arrives.';

CREATE INDEX users_tenant_idx ON users (tenant_id);


-- =============================================================================
-- B. Equipment catalog and instrumentation
-- =============================================================================

-- EquipmentType — template for a class of equipment (EMMAD, EMGAD).
-- Templates are not tenant-scoped: the catalog of equipment classes is
-- shared across the platform (F4 §D EquipmentType, ADR-004).
CREATE TABLE equipment_types (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                     TEXT        NOT NULL UNIQUE,
    description              TEXT,
    default_sensor_template  JSONB,
    pid_reference            TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE equipment_types IS
    'Equipment template (EMMAD, EMGAD). Defines which loops a class brings. Not tenant-scoped; the template catalog is shared.';


-- MeasurementUnit — physical, reusable unit of measurement equipment in
-- RVF's catalog (EMMAD-01, EMMAD-02, EMGAD-01). The unit of the F4
-- vocabulary; central operational asset (F4 §D MeasurementUnit).
CREATE TABLE measurement_units (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    equipment_type_id   UUID        NOT NULL REFERENCES equipment_types(id) ON DELETE RESTRICT,
    code                TEXT        NOT NULL,
    serial_number       TEXT,
    name                TEXT        NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'active',
    operating_profile   TEXT        NOT NULL DEFAULT 'custom',
    location            TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT measurement_units_status_chk
        CHECK (status IN ('active', 'inactive', 'offline', 'maintenance')),
    CONSTRAINT measurement_units_operating_profile_chk
        CHECK (operating_profile IN ('high_pressure_high_flow', 'medium', 'low', 'custom')),
    CONSTRAINT measurement_units_tenant_code_uk
        UNIQUE (tenant_id, code)
);

COMMENT ON TABLE measurement_units IS
    'Equipment instance in RVF catalog (EMMAD-01, EMMAD-02). Unique by (tenant_id, code).';

CREATE INDEX measurement_units_tenant_idx
    ON measurement_units (tenant_id);
CREATE INDEX measurement_units_equipment_type_idx
    ON measurement_units (equipment_type_id);


-- Sensor — measurement point installed on a measurement_unit. The sensor
-- is the logical handle that survives transmitter replacement; bound to a
-- canonical_tag via sensor_tag_bindings (ADR-003).
CREATE TABLE sensors (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    unit_id           UUID        NOT NULL REFERENCES measurement_units(id) ON DELETE RESTRICT,
    type              TEXT        NOT NULL,
    name              TEXT        NOT NULL,
    instrument_tag    TEXT        NOT NULL,
    enabled           BOOLEAN     NOT NULL DEFAULT TRUE,
    min_range         NUMERIC,
    max_range         NUMERIC,
    engineering_unit  TEXT        NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT sensors_type_chk
        CHECK (type IN (
            'pressure', 'temperature', 'flow', 'vibration',
            'volume', 'level', 'gas_composition', 'digital_status'
        ))
);

COMMENT ON TABLE sensors IS
    'Logical measurement point on a measurement_unit. Persists across transmitter replacements.';

CREATE INDEX sensors_tenant_idx ON sensors (tenant_id);
CREATE INDEX sensors_unit_idx   ON sensors (unit_id);


-- TransmitterDevice — physical / digital device implementing a sensor.
-- Separate table so calibration, firmware, and replacement history are
-- captured per device, not collapsed into the sensor row (F4 §D Transmitter,
-- ADR-007 §3).
CREATE TABLE transmitter_devices (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    sensor_id                UUID        NOT NULL REFERENCES sensors(id) ON DELETE RESTRICT,
    serial_number            TEXT        NOT NULL,
    manufacturer             TEXT        NOT NULL,
    model                    TEXT        NOT NULL,
    protocol                 TEXT        NOT NULL,
    signal_type              TEXT        NOT NULL,
    modbus_address           INTEGER,
    register_map_reference   TEXT,
    channel                  TEXT,
    firmware_version         TEXT,
    calibration_date         DATE,
    calibration_range_min    NUMERIC,
    calibration_range_max    NUMERIC,
    calibration_reference    TEXT,
    battery_status           TEXT,
    installation_status      TEXT        NOT NULL DEFAULT 'installed',
    installed_at             TIMESTAMPTZ,
    removed_at               TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT transmitter_devices_protocol_chk
        CHECK (protocol IN ('4-20mA', 'HART', 'Modbus', 'OPC-UA', 'wireless')),
    CONSTRAINT transmitter_devices_installation_status_chk
        CHECK (installation_status IN ('installed', 'removed', 'on_bench', 'replaced'))
);

COMMENT ON TABLE transmitter_devices IS
    'Physical device implementing a sensor. One sensor has at most one currently installed device; history is preserved via rows with installation_status != installed and removed_at set.';

CREATE INDEX transmitter_devices_tenant_idx
    ON transmitter_devices (tenant_id);
CREATE INDEX transmitter_devices_sensor_idx
    ON transmitter_devices (sensor_id);
-- Lookup for currently installed device per sensor.
CREATE INDEX transmitter_devices_sensor_active_idx
    ON transmitter_devices (sensor_id)
    WHERE installation_status = 'installed';


-- =============================================================================
-- C. Canonical tag dictionary and sensor bindings (ADR-003)
-- =============================================================================

-- CanonicalTag — RVF's fixed measurement vocabulary (p_inlet, t_gas_out,
-- q_liquid, ...). Owned by RVF; globally unique; not tenant-scoped.
CREATE TABLE canonical_tags (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT        NOT NULL UNIQUE,
    display_name    TEXT        NOT NULL,
    canonical_unit  TEXT        NOT NULL,
    category        TEXT        NOT NULL,
    precision       INTEGER     NOT NULL DEFAULT 2,
    description     TEXT,
    deprecated      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE canonical_tags IS
    'Fixed RVF-owned vocabulary of measurement variables. Deprecation is a flag; rows are never deleted (ADR-003).';


-- SensorTagBinding — configurable mapping between a sensor and a canonical
-- tag. Effective-dated; re-binding closes the previous row and opens a new
-- one (ADR-003).
CREATE TABLE sensor_tag_bindings (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    sensor_id         UUID        NOT NULL REFERENCES sensors(id) ON DELETE RESTRICT,
    canonical_tag_id  UUID        NOT NULL REFERENCES canonical_tags(id) ON DELETE RESTRICT,
    effective_from    TIMESTAMPTZ NOT NULL,
    effective_to      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT sensor_tag_bindings_effective_range_chk
        CHECK (effective_to IS NULL OR effective_to > effective_from)
);

COMMENT ON TABLE sensor_tag_bindings IS
    'Effective-dated mapping from sensor to canonical tag (ADR-003). At most one row per sensor is currently active (effective_to IS NULL).';

CREATE INDEX sensor_tag_bindings_tenant_idx
    ON sensor_tag_bindings (tenant_id);
CREATE INDEX sensor_tag_bindings_sensor_idx
    ON sensor_tag_bindings (sensor_id);
CREATE INDEX sensor_tag_bindings_canonical_tag_idx
    ON sensor_tag_bindings (canonical_tag_id);
CREATE INDEX sensor_tag_bindings_effective_idx
    ON sensor_tag_bindings (effective_from, effective_to);
-- Partial index for resolving the currently-active binding per sensor.
CREATE UNIQUE INDEX sensor_tag_bindings_sensor_active_uk
    ON sensor_tag_bindings (sensor_id)
    WHERE effective_to IS NULL;


-- =============================================================================
-- D. Per-unit operational configuration (F4 §E)
-- =============================================================================
-- Settings (global) cannot define per-unit operating limits or alarm
-- thresholds. Those live exclusively in unit_configurations,
-- unit_operating_envelopes, and alarm_rules below.

-- UnitConfiguration — live operational configuration for a measurement
-- unit. New rows on change; only one row per unit may have is_current = TRUE.
CREATE TABLE unit_configurations (
    id                               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                        UUID        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    unit_id                          UUID        NOT NULL REFERENCES measurement_units(id) ON DELETE RESTRICT,
    version                          INTEGER     NOT NULL,
    configuration                    JSONB,
    enabled_sensors                  JSONB,
    engineering_unit_overrides       JSONB,
    display_precision_overrides      JSONB,
    is_current                       BOOLEAN     NOT NULL DEFAULT FALSE,
    created_by                       UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unit_configurations_unit_version_uk
        UNIQUE (unit_id, version)
);

COMMENT ON TABLE unit_configurations IS
    'Versioned per-unit operational configuration. History preserved by inserting new rows; legacy rows are immutable in spirit.';

CREATE INDEX unit_configurations_tenant_idx
    ON unit_configurations (tenant_id);
CREATE INDEX unit_configurations_unit_idx
    ON unit_configurations (unit_id);
-- At most one current configuration per unit.
CREATE UNIQUE INDEX unit_configurations_unit_current_uk
    ON unit_configurations (unit_id)
    WHERE is_current = TRUE;


-- UnitOperatingEnvelope — per-unit operating limits (F4 §D, §E). HP units
-- and LP units carry different envelopes; there is no global envelope.
CREATE TABLE unit_operating_envelopes (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    unit_id                     UUID        NOT NULL REFERENCES measurement_units(id) ON DELETE RESTRICT,
    version                     INTEGER     NOT NULL,
    max_pressure                NUMERIC,
    max_flow_rate               NUMERIC,
    max_temperature             NUMERIC,
    max_vibration               NUMERIC,
    max_differential_pressure   NUMERIC,
    max_volume                  NUMERIC,
    max_gas_rate                NUMERIC,
    engineering_unit_set        JSONB,
    is_current                  BOOLEAN     NOT NULL DEFAULT FALSE,
    created_by                  UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unit_operating_envelopes_unit_version_uk
        UNIQUE (unit_id, version)
);

COMMENT ON TABLE unit_operating_envelopes IS
    'Per-unit operating limits. Versioned with history. No global envelope table exists by design (F4 §E).';

CREATE INDEX unit_operating_envelopes_tenant_idx
    ON unit_operating_envelopes (tenant_id);
CREATE INDEX unit_operating_envelopes_unit_idx
    ON unit_operating_envelopes (unit_id);
CREATE UNIQUE INDEX unit_operating_envelopes_unit_current_uk
    ON unit_operating_envelopes (unit_id)
    WHERE is_current = TRUE;


-- =============================================================================
-- E. Alarm model (ADR-005, F4 §G)
-- =============================================================================

-- AlarmRule — per-unit, per-tag alarm rule. Versioned. There is no global
-- alarm rule table; per-unit configuration is the only place thresholds live.
CREATE TABLE alarm_rules (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    unit_id               UUID        NOT NULL REFERENCES measurement_units(id) ON DELETE RESTRICT,
    canonical_tag_id      UUID        NOT NULL REFERENCES canonical_tags(id) ON DELETE RESTRICT,
    severity              TEXT        NOT NULL,
    enabled               BOOLEAN     NOT NULL DEFAULT TRUE,
    low_low_threshold     NUMERIC,
    low_threshold         NUMERIC,
    high_threshold        NUMERIC,
    high_high_threshold   NUMERIC,
    deadband              NUMERIC,
    delay_seconds         INTEGER,
    message_template      TEXT,
    version               INTEGER     NOT NULL,
    is_current            BOOLEAN     NOT NULL DEFAULT FALSE,
    created_by            UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT alarm_rules_severity_chk
        CHECK (severity IN ('info', 'warning', 'critical')),
    CONSTRAINT alarm_rules_unit_tag_severity_version_uk
        UNIQUE (unit_id, canonical_tag_id, severity, version)
);

COMMENT ON TABLE alarm_rules IS
    'Per-unit, per-canonical-tag alarm rule (ADR-005). Versioned; only one row per (unit, canonical_tag, severity) may be current at a time.';

CREATE INDEX alarm_rules_tenant_idx ON alarm_rules (tenant_id);
CREATE INDEX alarm_rules_unit_idx   ON alarm_rules (unit_id);
CREATE INDEX alarm_rules_canonical_tag_idx
    ON alarm_rules (canonical_tag_id);
-- One current rule per (unit, canonical_tag, severity).
CREATE UNIQUE INDEX alarm_rules_unit_tag_severity_current_uk
    ON alarm_rules (unit_id, canonical_tag_id, severity)
    WHERE is_current = TRUE;


-- AlarmThreshold — normalized child for multi-step alarms / rate-of-change
-- (F4 §G placeholder). Today the four standard thresholds on alarm_rules
-- cover all live cases; this table is reserved so future complex alarms
-- have a home without restructuring.
CREATE TABLE alarm_thresholds (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    alarm_rule_id   UUID        NOT NULL REFERENCES alarm_rules(id) ON DELETE CASCADE,
    kind            TEXT        NOT NULL,
    value           NUMERIC     NOT NULL,
    deadband        NUMERIC,
    delay_seconds   INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT alarm_thresholds_kind_chk
        CHECK (kind IN ('low_low', 'low', 'high', 'high_high', 'rate_of_change'))
);

COMMENT ON TABLE alarm_thresholds IS
    'Placeholder for complex / multi-step thresholds. Not required to be populated in F4.1; reserved for future use.';

CREATE INDEX alarm_thresholds_rule_idx
    ON alarm_thresholds (alarm_rule_id);


-- =============================================================================
-- F. Wells and jobs (catalog + operation)
-- =============================================================================

-- Well — operational subject being tested (Modelo de Dominio).
CREATE TABLE wells (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    client_id       UUID,
    name            TEXT        NOT NULL,
    field_or_site   TEXT,
    location        TEXT,
    type            TEXT,
    fluid           TEXT,
    design_limits   JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE wells IS
    'Well being tested. client_id is reserved for future use when client identity is separated from tenant.';

CREATE INDEX wells_tenant_idx ON wells (tenant_id);


-- Job — deployment of a measurement_unit at a well for a period.
-- commissioning_snapshot_id is added after commissioning_snapshots is
-- created to break the circular FK at table-creation time.
CREATE TABLE jobs (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    well_id                     UUID        NOT NULL REFERENCES wells(id) ON DELETE RESTRICT,
    unit_id                     UUID        NOT NULL REFERENCES measurement_units(id) ON DELETE RESTRICT,
    commissioning_snapshot_id   UUID,
    engineer_id                 UUID        REFERENCES users(id) ON DELETE SET NULL,
    status                      TEXT        NOT NULL DEFAULT 'programmed',
    started_at                  TIMESTAMPTZ,
    closed_at                   TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT jobs_status_chk
        CHECK (status IN ('programmed', 'in_progress', 'closed'))
);

COMMENT ON TABLE jobs IS
    'Unit of work: deploying a measurement_unit at a well for a period. commissioning_snapshot_id FK is added below to break the circular dependency.';

CREATE INDEX jobs_tenant_idx ON jobs (tenant_id);
CREATE INDEX jobs_well_idx   ON jobs (well_id);
CREATE INDEX jobs_unit_idx   ON jobs (unit_id);


-- CommissioningSnapshot — immutable, frozen configuration at commissioning.
-- Per ADR-005, alarm evaluation during a job reads thresholds from the
-- snapshot, not from the live alarm_rules table.
--
-- IMMUTABILITY ENFORCEMENT NOTE: SQL alone cannot fully enforce
-- "no UPDATE / no DELETE after insert" without database triggers or
-- per-role privilege revocation. The `immutable` boolean and this comment
-- document the architectural intent; application-layer guards and a future
-- DB hardening pass (BEFORE UPDATE/DELETE trigger raising an exception,
-- or REVOKE UPDATE/DELETE from the application role) are how this is
-- truly enforced. Do not relax this rule.
CREATE TABLE commissioning_snapshots (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    job_id                   UUID        NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
    unit_id                  UUID        NOT NULL REFERENCES measurement_units(id) ON DELETE RESTRICT,
    taken_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_thresholds     JSONB       NOT NULL,
    sensor_mappings          JSONB       NOT NULL,
    engineering_envelope     JSONB       NOT NULL,
    rule_versions            JSONB       NOT NULL,
    immutable                BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT commissioning_snapshots_immutable_chk
        CHECK (immutable = TRUE)
);

COMMENT ON TABLE commissioning_snapshots IS
    'Immutable per-job frozen configuration (ADR-005). Source of truth for effective thresholds during the job. Trigger / GRANT-based hardening is a later concern; F4.1 documents the contract.';

CREATE INDEX commissioning_snapshots_tenant_idx
    ON commissioning_snapshots (tenant_id);
CREATE INDEX commissioning_snapshots_job_idx
    ON commissioning_snapshots (job_id);
CREATE INDEX commissioning_snapshots_unit_idx
    ON commissioning_snapshots (unit_id);

-- Close the circular dependency: jobs -> commissioning_snapshots.
ALTER TABLE jobs
    ADD CONSTRAINT jobs_commissioning_snapshot_fk
    FOREIGN KEY (commissioning_snapshot_id)
    REFERENCES commissioning_snapshots(id)
    ON DELETE SET NULL;

CREATE INDEX jobs_commissioning_snapshot_idx
    ON jobs (commissioning_snapshot_id);


-- =============================================================================
-- G. Alarm events (lifecycle)
-- =============================================================================

-- AlarmEvent — actual alarm occurrence. Lifecycle:
--   active -> acknowledged -> cleared.
-- rule_snapshot is a JSON copy of the rule at trigger time so that historical
-- alarms always reflect the rule that was in force when they fired
-- (redundant with commissioning_snapshots.effective_thresholds but useful
-- for off-job alarms and forensic queries).
CREATE TABLE alarm_events (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    unit_id              UUID        NOT NULL REFERENCES measurement_units(id) ON DELETE RESTRICT,
    canonical_tag_id     UUID        NOT NULL REFERENCES canonical_tags(id) ON DELETE RESTRICT,
    alarm_rule_id        UUID        REFERENCES alarm_rules(id) ON DELETE SET NULL,
    severity             TEXT        NOT NULL,
    triggered_value      NUMERIC     NOT NULL,
    threshold_violated   TEXT        NOT NULL,
    state                TEXT        NOT NULL DEFAULT 'active',
    first_triggered_at   TIMESTAMPTZ NOT NULL,
    acknowledged_at      TIMESTAMPTZ,
    acknowledged_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
    cleared_at           TIMESTAMPTZ,
    job_id               UUID        REFERENCES jobs(id) ON DELETE SET NULL,
    rule_snapshot        JSONB       NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT alarm_events_severity_chk
        CHECK (severity IN ('info', 'warning', 'critical')),
    CONSTRAINT alarm_events_state_chk
        CHECK (state IN ('active', 'acknowledged', 'cleared')),
    CONSTRAINT alarm_events_threshold_violated_chk
        CHECK (threshold_violated IN ('low_low', 'low', 'high', 'high_high', 'rate_of_change'))
);

COMMENT ON TABLE alarm_events IS
    'Persistent alarm occurrences. Lifecycle: active -> acknowledged -> cleared. Each transition is also logged in audit_logs (ADR-005).';

CREATE INDEX alarm_events_tenant_idx ON alarm_events (tenant_id);
CREATE INDEX alarm_events_unit_time_idx
    ON alarm_events (unit_id, first_triggered_at DESC);
CREATE INDEX alarm_events_canonical_tag_idx
    ON alarm_events (canonical_tag_id);
CREATE INDEX alarm_events_job_idx ON alarm_events (job_id);
-- Active-alarm board: cheap "what is firing right now" lookups.
CREATE INDEX alarm_events_active_idx
    ON alarm_events (tenant_id, unit_id, first_triggered_at DESC)
    WHERE state = 'active';


-- =============================================================================
-- H. Telemetry readings (canonical, append-only)
-- =============================================================================

-- TelemetryReading — canonical persisted telemetry. One row per
-- (timestamp, unit, sensor / canonical_tag, value). Append-only by
-- architecture; SQL-level UPDATE/DELETE restrictions are a later concern.
--
-- TIMESCALEDB NOTE: This is intentionally a plain PostgreSQL table. The
-- column layout and indexes are TimescaleDB-compatible, so the table can
-- be converted to a hypertable in a future phase without schema redesign.
-- F4.1 does NOT use any TimescaleDB-specific syntax.
CREATE TABLE telemetry_readings (
    id                 UUID        NOT NULL DEFAULT gen_random_uuid(),
    tenant_id          UUID        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    unit_id            UUID        NOT NULL REFERENCES measurement_units(id) ON DELETE RESTRICT,
    sensor_id          UUID        NOT NULL REFERENCES sensors(id) ON DELETE RESTRICT,
    canonical_tag_id   UUID        NOT NULL REFERENCES canonical_tags(id) ON DELETE RESTRICT,
    "timestamp"        TIMESTAMPTZ NOT NULL,
    value              NUMERIC     NOT NULL,
    engineering_unit   TEXT        NOT NULL,
    quality            TEXT        NOT NULL,
    source             TEXT        NOT NULL,
    ingestion_id       TEXT,
    sequence           BIGINT,
    job_id             UUID        REFERENCES jobs(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT telemetry_readings_pk PRIMARY KEY (id),
    CONSTRAINT telemetry_readings_quality_chk
        CHECK (quality IN ('good', 'uncertain', 'bad')),
    CONSTRAINT telemetry_readings_source_chk
        CHECK (source IN (
            'mock', 'manual', 'field_gateway', 'historian',
            'plc', 'mqtt', 'node_red', 'opc_ua', 'modbus', 'edge_gateway'
        ))
);

COMMENT ON TABLE telemetry_readings IS
    'Canonical append-only telemetry. Plain PostgreSQL table; convertible to a TimescaleDB hypertable later without redesign. UPDATE/DELETE are forbidden by architecture; hardening is a later phase.';

-- Critical access paths called out in F4 §F.
CREATE INDEX telemetry_readings_unit_tag_time_idx
    ON telemetry_readings (unit_id, canonical_tag_id, "timestamp" DESC);
CREATE INDEX telemetry_readings_tenant_time_idx
    ON telemetry_readings (tenant_id, "timestamp" DESC);
CREATE INDEX telemetry_readings_sensor_time_idx
    ON telemetry_readings (sensor_id, "timestamp" DESC);
-- Partial index for job-bound queries; skips the (large) off-job tail.
CREATE INDEX telemetry_readings_job_time_idx
    ON telemetry_readings (job_id, "timestamp" DESC)
    WHERE job_id IS NOT NULL;


-- LiveReading projection — DERIVED, NOT CANONICAL.
--
-- Purpose: power Units screen Live Instrument Readings and
-- SeparatorDiagram value chips (F3.1) without introducing a second source
-- of truth alongside telemetry_readings.
--
-- This view returns the latest reading per (unit_id, sensor_id) using
-- PostgreSQL's DISTINCT ON. It is correct but not necessarily the fastest
-- option for very high cardinality / high volume. F4.6 will choose the
-- final implementation among:
--   (a) this view,
--   (b) a materialized view refreshed on ingest,
--   (c) an upsert-maintained projection table,
--   (d) an application cache.
--
-- IMPORTANT: this view is NOT canonical state. If it is dropped or
-- replaced, no historical truth is lost.
CREATE OR REPLACE VIEW live_readings_projection AS
SELECT DISTINCT ON (tr.unit_id, tr.sensor_id)
    tr.tenant_id,
    tr.unit_id,
    tr.sensor_id,
    tr.canonical_tag_id,
    tr."timestamp"      AS "timestamp",
    tr.value,
    tr.engineering_unit,
    tr.quality,
    tr.source,
    tr.job_id
FROM telemetry_readings AS tr
ORDER BY tr.unit_id, tr.sensor_id, tr."timestamp" DESC;

COMMENT ON VIEW live_readings_projection IS
    'Derived projection (NOT canonical). Latest reading per (unit_id, sensor_id). Implementation may change in F4.6; consumers must treat this as a read-only view over telemetry_readings.';


-- =============================================================================
-- I. Integration metadata (placeholders, F4 §I)
-- =============================================================================
-- Integrations push telemetry through the ingestion service only; they
-- never write directly to canonical tables. These tables describe the
-- source and the translation rules.

-- IntegrationSource — future inbound integration channel.
CREATE TABLE integration_sources (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    kind                     TEXT        NOT NULL,
    name                     TEXT        NOT NULL,
    status                   TEXT        NOT NULL DEFAULT 'inactive',
    config                   JSONB       NOT NULL DEFAULT '{}'::jsonb,
    credentials_reference    TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT integration_sources_kind_chk
        CHECK (kind IN (
            'mqtt', 'node_red', 'thingsboard', 'opc_ua',
            'modbus', 'edge_gateway', 'plc', 'manual', 'historian'
        )),
    CONSTRAINT integration_sources_status_chk
        CHECK (status IN ('active', 'inactive'))
);

COMMENT ON TABLE integration_sources IS
    'Controlled placeholder. credentials_reference points at an external secret store; secrets are never stored inline (F4 §I).';

CREATE INDEX integration_sources_tenant_idx
    ON integration_sources (tenant_id);


-- IntegrationMapping — translation from external identifier to canonical
-- (unit, sensor, canonical_tag) triple.
CREATE TABLE integration_mappings (
    id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                     UUID        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    integration_source_id         UUID        NOT NULL REFERENCES integration_sources(id) ON DELETE RESTRICT,
    external_identifier           TEXT        NOT NULL,
    unit_id                       UUID        NOT NULL REFERENCES measurement_units(id) ON DELETE RESTRICT,
    sensor_id                     UUID        REFERENCES sensors(id) ON DELETE SET NULL,
    canonical_tag_id              UUID        REFERENCES canonical_tags(id) ON DELETE SET NULL,
    engineering_unit_override     TEXT,
    transformation_reference      TEXT,
    enabled                       BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT integration_mappings_source_external_uk
        UNIQUE (integration_source_id, external_identifier)
);

COMMENT ON TABLE integration_mappings IS
    'Controlled placeholder. external_identifier is unique per integration_source. Mapping changes are audited via audit_logs.';

CREATE INDEX integration_mappings_tenant_idx
    ON integration_mappings (tenant_id);
CREATE INDEX integration_mappings_source_idx
    ON integration_mappings (integration_source_id);
CREATE INDEX integration_mappings_unit_idx
    ON integration_mappings (unit_id);
CREATE INDEX integration_mappings_sensor_idx
    ON integration_mappings (sensor_id);
CREATE INDEX integration_mappings_canonical_tag_idx
    ON integration_mappings (canonical_tag_id);


-- =============================================================================
-- J. Audit log (append-only, central)
-- =============================================================================

-- AuditLog — single append-only audit table (F4 §H).
--
-- APPEND-ONLY ENFORCEMENT NOTE: same as commissioning_snapshots and
-- telemetry_readings, SQL alone cannot fully enforce append-only
-- semantics. The contract is documented here; runtime enforcement comes
-- from a future hardening pass (BEFORE UPDATE/DELETE trigger or
-- REVOKE UPDATE/DELETE from the application role). Per F4 §H, rows in
-- this table are never updated or deleted under normal operation.
CREATE TABLE audit_logs (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    actor_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
    action           TEXT        NOT NULL,
    entity_type      TEXT        NOT NULL,
    entity_id        UUID        NOT NULL,
    before           JSONB,
    after            JSONB,
    correlation_id   UUID,
    ip_address       INET,
    user_agent       TEXT,
    at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT audit_logs_action_chk
        CHECK (action IN (
            'created', 'updated', 'deleted',
            'acknowledged', 'cleared',
            'calibrated', 'replaced',
            'commissioned', 'closed'
        ))
);

COMMENT ON TABLE audit_logs IS
    'Single append-only audit table (F4 §H). action set is extensible; CHECK constraint must be widened in a future migration if new actions are added. before / after are jsonb snapshots of the affected entity.';

CREATE INDEX audit_logs_tenant_at_idx
    ON audit_logs (tenant_id, at DESC);
CREATE INDEX audit_logs_entity_idx
    ON audit_logs (entity_type, entity_id);
CREATE INDEX audit_logs_actor_idx
    ON audit_logs (actor_id);
CREATE INDEX audit_logs_correlation_idx
    ON audit_logs (correlation_id);

-- =============================================================================
-- End of F4.1 schema. No data, no GRANTs, no triggers, no Prisma artifacts.
-- =============================================================================
