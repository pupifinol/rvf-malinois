-- =============================================================================
-- RVF Malinois — F4.2 baseline migration
-- =============================================================================
-- Phase:        F4.2B — Prisma Baseline Migration + Backend Insulation.
-- Hand-authored from:
--   database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql (commit a475066).
-- Strategy:     docs/architecture/RVF_Malinois_F4_2B_Insulation_Strategy_Confirmation.md
--               (commit a8862e2). Mode 1 — Module quarantine.
--
-- This migration creates the F4 canonical schema in one atomic batch:
--   - pgcrypto extension (for gen_random_uuid()).
--   - 20 tables, indexes, partial indexes, CHECK constraints, FKs.
--   - live_readings_projection view (derived, not canonical; consumers must
--     treat as read-only over telemetry_readings).
--
-- It does NOT:
--   - declare or enable timescaledb.
--   - create hypertables.
--   - insert seed / reference data (that is F4.3).
--   - add row-level security, GRANT/REVOKE, retention partitions, or
--     immutability-enforcing triggers (later hardening phase).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- =============================================================================
-- A. Tenancy and identity
-- =============================================================================

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
-- Lookup for currently installed device per sensor (partial index).
CREATE INDEX transmitter_devices_sensor_active_idx
    ON transmitter_devices (sensor_id)
    WHERE installation_status = 'installed';


-- =============================================================================
-- C. Canonical tag dictionary and sensor bindings (ADR-003)
-- =============================================================================

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
-- Partial unique: at most one currently active binding per sensor.
CREATE UNIQUE INDEX sensor_tag_bindings_sensor_active_uk
    ON sensor_tag_bindings (sensor_id)
    WHERE effective_to IS NULL;


-- =============================================================================
-- D. Per-unit operational configuration (F4 §E)
-- =============================================================================

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
-- Partial unique: at most one current configuration per unit.
CREATE UNIQUE INDEX unit_configurations_unit_current_uk
    ON unit_configurations (unit_id)
    WHERE is_current = TRUE;


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
CREATE UNIQUE INDEX alarm_rules_unit_tag_severity_current_uk
    ON alarm_rules (unit_id, canonical_tag_id, severity)
    WHERE is_current = TRUE;


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
    'Placeholder for complex / multi-step thresholds. Not required to be populated in F4.2; reserved for future use.';

CREATE INDEX alarm_thresholds_rule_idx
    ON alarm_thresholds (alarm_rule_id);


-- =============================================================================
-- F. Wells and jobs (catalog + operation)
-- =============================================================================

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
    'Immutable per-job frozen configuration (ADR-005). Source of truth for effective thresholds during the job. Trigger / GRANT-based hardening is a later concern; F4.2 documents the contract.';

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
-- Partial index for the active-alarm board.
CREATE INDEX alarm_events_active_idx
    ON alarm_events (tenant_id, unit_id, first_triggered_at DESC)
    WHERE state = 'active';


-- =============================================================================
-- H. Telemetry readings (canonical, append-only)
-- =============================================================================

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


-- =============================================================================
-- H.1 LiveReading projection — DERIVED, NOT CANONICAL.
-- =============================================================================
-- Purpose: power Units screen Live Instrument Readings and SeparatorDiagram
-- value chips (F3.1) without introducing a second source of truth.
-- F4.6 may replace this with a materialized view, an upsert-maintained
-- projection table, or an application cache. The Prisma schema intentionally
-- does NOT declare this view; consumers read it via $queryRaw or are migrated
-- to the replacement in F4.6.

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
-- End of F4.2 baseline. No data, no GRANTs, no triggers, no TimescaleDB.
-- =============================================================================
