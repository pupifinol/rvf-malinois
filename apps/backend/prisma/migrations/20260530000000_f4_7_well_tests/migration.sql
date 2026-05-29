-- =============================================================================
-- RVF Malinois — F4.7.1 well-test job lifecycle migration
-- =============================================================================
-- Phase:    F4.7.1 — Well Test Job Lifecycle and Official Measurement Window
--                    Implementation.
-- Source:   docs/architecture/RVF_Malinois_F4_7_Well_Test_Job_Lifecycle_Official_Measurement_Window_Plan.md
--           (commit fc1747d). Approved by F4.7-0.
-- Anchors:  docs/architecture/RVF_Malinois_Master_Roadmap.md (commit b909a54)
--           apps/backend/prisma/migrations/20260524000000_f4_2_baseline/migration.sql
--           (F4.2B baseline, commit e37f7b5)
--           apps/backend/prisma/migrations/20260526000000_f4_6a_telemetry_hardening/
--           (F4.6A.1 telemetry hardening, commit 6be7842)
--
-- This migration is **additive only**. It introduces one new table
-- (`well_tests`) plus its indexes and CHECK constraints. No existing table,
-- column, index, constraint, FK, or CHECK is altered. `jobs.status` keeps its
-- F4.2 baseline CHECK (`'programmed' | 'in_progress' | 'closed'`) verbatim;
-- `alarm_events.job_id` / `telemetry_readings.job_id` FKs are unchanged.
--
-- The new model captures the per-test execution metadata the F4.7-0 plan
-- selected (Option B — `WellTest` linked to `Job`):
--
--   - test type (`fiscalizacion` certification 24 h fixed / `optimizacion`
--                analysis 12..24 h client-defined)
--   - report type (paired with test type)
--   - lifecycle status (8-state CHECK enum:
--         scheduled → connected → stabilizing → measuring → completed → closed
--         + aborted reachable from any non-terminal state)
--   - the official measurement window timestamps (`official_started_at`,
--     `official_ended_at`) — the source of truth for Reports certification.
--   - the stabilization window (`stabilization_started_at`,
--     `stabilization_ended_at` — equal to `official_started_at` at transition).
--   - the connection / disconnection lifecycle markers.
--   - operator-supplied free-form fields (`notes`, `client_reference`,
--     `abort_reason`).
--
-- Indexes target the F4.7-0 §14.4 access paths:
--   - tenant scoping
--   - list by job
--   - list by well
--   - **(unit_id, lifecycle_status)** — primary "current test for this unit"
--     access path for the future Operations Current-Test panel.
--   - **(unit_id, official_started_at DESC)** — Reports lookups by unit + time.

-- =============================================================================
-- A. Table
-- =============================================================================

CREATE TABLE well_tests (
    id                                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                           UUID        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    job_id                              UUID        NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
    well_id                             UUID        NOT NULL REFERENCES wells(id) ON DELETE RESTRICT,
    unit_id                             UUID        NOT NULL REFERENCES measurement_units(id) ON DELETE RESTRICT,
    test_type                           TEXT        NOT NULL,
    report_type                         TEXT        NOT NULL,
    lifecycle_status                    TEXT        NOT NULL DEFAULT 'scheduled',
    planned_official_duration_hours     INTEGER     NOT NULL,
    connected_at                        TIMESTAMPTZ,
    stabilization_started_at            TIMESTAMPTZ,
    stabilization_ended_at              TIMESTAMPTZ,
    official_started_at                 TIMESTAMPTZ,
    official_ended_at                   TIMESTAMPTZ,
    disconnected_at                     TIMESTAMPTZ,
    report_generated_at                 TIMESTAMPTZ,
    aborted_at                          TIMESTAMPTZ,
    abort_reason                        TEXT,
    notes                               TEXT,
    client_reference                    TEXT,
    created_by                          UUID        REFERENCES users(id) ON DELETE SET NULL,
    updated_by                          UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at                          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Enum CHECKs (mirrors of the application-side string unions).
    CONSTRAINT well_tests_test_type_chk
        CHECK (test_type IN ('fiscalizacion', 'optimizacion')),
    CONSTRAINT well_tests_report_type_chk
        CHECK (report_type IN ('fiscalizacion_pdf', 'optimizacion_pdf')),
    CONSTRAINT well_tests_lifecycle_status_chk
        CHECK (lifecycle_status IN (
            'scheduled',
            'connected',
            'stabilizing',
            'measuring',
            'completed',
            'closed',
            'aborted'
        )),

    -- Test-type ↔ report-type pairing (mirror of the Zod refine).
    CONSTRAINT well_tests_type_report_pair_chk
        CHECK (
            (test_type = 'fiscalizacion' AND report_type = 'fiscalizacion_pdf')
            OR (test_type = 'optimizacion' AND report_type = 'optimizacion_pdf')
        ),

    -- Test-type duration rules (F4.7-0 §6.3).
    CONSTRAINT well_tests_duration_chk
        CHECK (
            (test_type = 'fiscalizacion' AND planned_official_duration_hours = 24)
            OR (test_type = 'optimizacion' AND planned_official_duration_hours BETWEEN 12 AND 24)
        ),

    -- Free-form text length bounds (F4.7-0 §14 / §15.1).
    CONSTRAINT well_tests_abort_reason_length_chk
        CHECK (
            abort_reason IS NULL
            OR (char_length(abort_reason) BETWEEN 1 AND 240)
        ),
    CONSTRAINT well_tests_notes_length_chk
        CHECK (
            notes IS NULL
            OR (char_length(notes) BETWEEN 1 AND 2000)
        ),
    CONSTRAINT well_tests_client_reference_length_chk
        CHECK (
            client_reference IS NULL
            OR (char_length(client_reference) BETWEEN 1 AND 120)
        ),

    -- Per-status non-null rules (F4.7-0 §15.2).
    --
    -- The order each transition introduces a non-null timestamp:
    --     scheduled  → (no extra non-null requirement)
    --     connected  → connected_at NOT NULL
    --     stabilizing→ connected_at + stabilization_started_at NOT NULL
    --     measuring  → connected_at + stabilization_started_at +
    --                  stabilization_ended_at + official_started_at NOT NULL
    --                  AND stabilization_ended_at = official_started_at
    --     completed  → all of the above + official_ended_at NOT NULL
    --     closed     → completed conditions + disconnected_at NOT NULL
    --     aborted    → aborted_at + abort_reason NOT NULL
    CONSTRAINT well_tests_status_timestamps_chk
        CHECK (
            CASE lifecycle_status
                WHEN 'scheduled' THEN TRUE
                WHEN 'connected' THEN connected_at IS NOT NULL
                WHEN 'stabilizing' THEN
                    connected_at IS NOT NULL AND stabilization_started_at IS NOT NULL
                WHEN 'measuring' THEN
                    connected_at IS NOT NULL
                    AND stabilization_started_at IS NOT NULL
                    AND stabilization_ended_at IS NOT NULL
                    AND official_started_at IS NOT NULL
                    AND stabilization_ended_at = official_started_at
                WHEN 'completed' THEN
                    connected_at IS NOT NULL
                    AND stabilization_started_at IS NOT NULL
                    AND stabilization_ended_at IS NOT NULL
                    AND official_started_at IS NOT NULL
                    AND official_ended_at IS NOT NULL
                    AND stabilization_ended_at = official_started_at
                WHEN 'closed' THEN
                    connected_at IS NOT NULL
                    AND stabilization_started_at IS NOT NULL
                    AND stabilization_ended_at IS NOT NULL
                    AND official_started_at IS NOT NULL
                    AND official_ended_at IS NOT NULL
                    AND disconnected_at IS NOT NULL
                    AND stabilization_ended_at = official_started_at
                WHEN 'aborted' THEN
                    aborted_at IS NOT NULL AND abort_reason IS NOT NULL
                ELSE FALSE
            END
        ),

    -- Temporal ordering when both endpoints are present (F4.7-0 §15.2).
    -- Each rule is wrapped in a NULL-tolerant predicate so it never fires
    -- before the corresponding transition has populated the columns.
    CONSTRAINT well_tests_stabilization_after_connect_chk
        CHECK (
            stabilization_started_at IS NULL
            OR connected_at IS NULL
            OR stabilization_started_at >= connected_at
        ),
    CONSTRAINT well_tests_official_after_stabilization_chk
        CHECK (
            official_started_at IS NULL
            OR stabilization_started_at IS NULL
            OR official_started_at >= stabilization_started_at
        ),
    CONSTRAINT well_tests_official_window_chk
        CHECK (
            official_ended_at IS NULL
            OR official_started_at IS NULL
            OR official_ended_at >= official_started_at
        ),
    CONSTRAINT well_tests_stabilization_ended_equals_official_started_chk
        CHECK (
            stabilization_ended_at IS NULL
            OR official_started_at IS NULL
            OR stabilization_ended_at = official_started_at
        )
);

COMMENT ON TABLE well_tests IS
    'F4.7.1 — Official well test execution record. Linked to the existing Job (deployment ledger). Carries the test type, the planned official duration, the stabilization + official + connection / disconnection timestamps, the lifecycle status, and the report type. Source of truth for the eventual Reports PDF certification window (officialStartedAt..officialEndedAt). Never written by ingestion / projection / alarm-evaluation services.';

-- =============================================================================
-- B. Indexes
-- =============================================================================

CREATE INDEX well_tests_tenant_idx
    ON well_tests (tenant_id);

CREATE INDEX well_tests_job_idx
    ON well_tests (job_id);

CREATE INDEX well_tests_well_idx
    ON well_tests (well_id);

-- Primary access path: "current test for this unit". The Operations Current-Test
-- panel (deferred to F4.7.2) hits this index with
-- `WHERE unit_id = $1 AND lifecycle_status IN ('connected','stabilizing','measuring')`.
CREATE INDEX well_tests_unit_status_idx
    ON well_tests (unit_id, lifecycle_status);

-- Reports lookups by unit + time, newest first.
CREATE INDEX well_tests_unit_official_time_idx
    ON well_tests (unit_id, official_started_at DESC);
