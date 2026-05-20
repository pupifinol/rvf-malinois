-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('online', 'degraded', 'offline');

-- CreateEnum
CREATE TYPE "LateTelemetryReason" AS ENUM ('beyond_late_window', 'missing_active_job', 'unknown_canonical_tag', 'duplicate_seq', 'invalid_envelope');

-- CreateTable
CREATE TABLE "telemetry" (
    "ts" TIMESTAMPTZ(6) NOT NULL,
    "job_id" TEXT NOT NULL,
    "canonical_tag_name" VARCHAR(64) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "value_unit" VARCHAR(40) NOT NULL,
    "quality" "Quality" NOT NULL,
    "seq" BIGINT NOT NULL,
    "unit_id" VARCHAR(64) NOT NULL,
    "sensor_instrument_tag" VARCHAR(64) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_adapter" VARCHAR(40),

    CONSTRAINT "telemetry_pkey" PRIMARY KEY ("ts","job_id","canonical_tag_name")
);

-- CreateTable
CREATE TABLE "sensor_health" (
    "ts" TIMESTAMPTZ(6) NOT NULL,
    "job_id" TEXT NOT NULL,
    "unit_id" VARCHAR(64) NOT NULL,
    "sensor_instrument_tag" VARCHAR(64) NOT NULL,
    "status" "HealthStatus" NOT NULL,
    "battery_pct" DOUBLE PRECISION,
    "rssi_dbm" DOUBLE PRECISION,
    "mesh_hops" INTEGER,
    "last_reading_age_s" INTEGER,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_adapter" VARCHAR(40),
    "seq" BIGINT NOT NULL,

    CONSTRAINT "sensor_health_pkey" PRIMARY KEY ("ts","job_id","sensor_instrument_tag")
);

-- CreateTable
CREATE TABLE "late_telemetry_quarantine" (
    "id" TEXT NOT NULL,
    "reason" "LateTelemetryReason" NOT NULL,
    "envelope" JSONB NOT NULL,
    "source_adapter" VARCHAR(40),
    "original_ts" TIMESTAMPTZ(6),
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "job_id" TEXT,
    "unit_id" VARCHAR(64),
    "sensor_instrument_tag" VARCHAR(64),
    "notes" TEXT,

    CONSTRAINT "late_telemetry_quarantine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "telemetry_unit_id_seq_canonical_tag_name_idx" ON "telemetry"("unit_id", "seq", "canonical_tag_name");

-- CreateIndex
CREATE INDEX "telemetry_job_id_canonical_tag_name_ts_idx" ON "telemetry"("job_id", "canonical_tag_name", "ts" DESC);

-- CreateIndex
CREATE INDEX "sensor_health_unit_id_seq_sensor_instrument_tag_idx" ON "sensor_health"("unit_id", "seq", "sensor_instrument_tag");

-- CreateIndex
CREATE INDEX "sensor_health_job_id_sensor_instrument_tag_ts_idx" ON "sensor_health"("job_id", "sensor_instrument_tag", "ts" DESC);

-- CreateIndex
CREATE INDEX "late_telemetry_quarantine_reason_received_at_idx" ON "late_telemetry_quarantine"("reason", "received_at");

-- CreateIndex
CREATE INDEX "late_telemetry_quarantine_job_id_received_at_idx" ON "late_telemetry_quarantine"("job_id", "received_at");

-- =============================================================================
-- TimescaleDB layer
-- =============================================================================
-- Hand-authored Timescale DDL. Prisma does not model hypertables, compression
-- policies, retention policies or continuous aggregates; they are layered on
-- top of the regular tables above. Statements are written for re-application
-- (IF NOT EXISTS / if_not_exists => TRUE) so `prisma migrate reset` rebuilds
-- the same end state.
--
-- Idempotency note: Timescale rejects UNIQUE indexes that don't include the
-- partitioning column. The dedup constraint on (unit_id, seq, *_tag) is
-- therefore enforced at the application/adapter layer; the lookup index
-- defined above keeps that pre-INSERT existence check cheap.

-- Hypertable conversion. chunk_time_interval = 1 day matches the §11
-- store-and-forward window and keeps each chunk in Timescale's preferred
-- 25M–100M row band under full deployment.
SELECT create_hypertable(
    'telemetry',
    'ts',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists       => TRUE,
    migrate_data        => TRUE
);
SELECT create_hypertable(
    'sensor_health',
    'ts',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists       => TRUE,
    migrate_data        => TRUE
);

-- Compression. Trend queries slice by (job, tag) within a time range, so
-- segmenting by both yields good decompression locality.
ALTER TABLE telemetry SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'job_id, canonical_tag_name',
    timescaledb.compress_orderby   = 'ts DESC'
);
ALTER TABLE sensor_health SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'job_id, sensor_instrument_tag',
    timescaledb.compress_orderby   = 'ts DESC'
);

-- Compression policy: chunks older than 7 days. Aligned with the edge
-- store-and-forward buffer (telemetry-foundation §11).
SELECT add_compression_policy('telemetry',     INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_compression_policy('sensor_health', INTERVAL '7 days', if_not_exists => TRUE);

-- Retention: 90 days for raw telemetry (telemetry-foundation §19). Beyond
-- that, only continuous aggregates remain (kept indefinitely). Sensor health
-- stays raw for now — low volume, useful for ADR-001 long-term audit.
SELECT add_retention_policy('telemetry', INTERVAL '90 days', if_not_exists => TRUE);

-- =============================================================================
-- Continuous aggregates — 1m / 15m / 1h
-- =============================================================================
-- Quality-aware bucketing per domain-model §14: min/max/avg/first/last are
-- computed ONLY from `good` rows; count_<quality> columns preserve the full
-- mix so a consumer can re-derive raw stats if needed.
--
-- GROUP BY value_unit surfaces any mid-job unit drift instead of silently
-- averaging across heterogeneous units (F1.5 guidance #6 — raw fidelity).

CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_1m
    WITH (timescaledb.continuous) AS
SELECT
    time_bucket(INTERVAL '1 minute', ts) AS bucket,
    job_id,
    canonical_tag_name,
    value_unit,
    COUNT(*)                                          AS sample_count,
    COUNT(*) FILTER (WHERE quality = 'good')          AS good_count,
    COUNT(*) FILTER (WHERE quality = 'estimated')     AS estimated_count,
    COUNT(*) FILTER (WHERE quality = 'uncertain')     AS uncertain_count,
    COUNT(*) FILTER (WHERE quality = 'bad')           AS bad_count,
    COUNT(*) FILTER (WHERE quality = 'stale')         AS stale_count,
    MIN(value)   FILTER (WHERE quality = 'good')      AS value_min,
    MAX(value)   FILTER (WHERE quality = 'good')      AS value_max,
    AVG(value)   FILTER (WHERE quality = 'good')      AS value_avg,
    first(value, ts) FILTER (WHERE quality = 'good')  AS value_first,
    last(value, ts)  FILTER (WHERE quality = 'good')  AS value_last
FROM telemetry
GROUP BY bucket, job_id, canonical_tag_name, value_unit
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_15m
    WITH (timescaledb.continuous) AS
SELECT
    time_bucket(INTERVAL '15 minutes', ts) AS bucket,
    job_id,
    canonical_tag_name,
    value_unit,
    COUNT(*)                                          AS sample_count,
    COUNT(*) FILTER (WHERE quality = 'good')          AS good_count,
    COUNT(*) FILTER (WHERE quality = 'estimated')     AS estimated_count,
    COUNT(*) FILTER (WHERE quality = 'uncertain')     AS uncertain_count,
    COUNT(*) FILTER (WHERE quality = 'bad')           AS bad_count,
    COUNT(*) FILTER (WHERE quality = 'stale')         AS stale_count,
    MIN(value)   FILTER (WHERE quality = 'good')      AS value_min,
    MAX(value)   FILTER (WHERE quality = 'good')      AS value_max,
    AVG(value)   FILTER (WHERE quality = 'good')      AS value_avg,
    first(value, ts) FILTER (WHERE quality = 'good')  AS value_first,
    last(value, ts)  FILTER (WHERE quality = 'good')  AS value_last
FROM telemetry
GROUP BY bucket, job_id, canonical_tag_name, value_unit
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_1h
    WITH (timescaledb.continuous) AS
SELECT
    time_bucket(INTERVAL '1 hour', ts) AS bucket,
    job_id,
    canonical_tag_name,
    value_unit,
    COUNT(*)                                          AS sample_count,
    COUNT(*) FILTER (WHERE quality = 'good')          AS good_count,
    COUNT(*) FILTER (WHERE quality = 'estimated')     AS estimated_count,
    COUNT(*) FILTER (WHERE quality = 'uncertain')     AS uncertain_count,
    COUNT(*) FILTER (WHERE quality = 'bad')           AS bad_count,
    COUNT(*) FILTER (WHERE quality = 'stale')         AS stale_count,
    MIN(value)   FILTER (WHERE quality = 'good')      AS value_min,
    MAX(value)   FILTER (WHERE quality = 'good')      AS value_max,
    AVG(value)   FILTER (WHERE quality = 'good')      AS value_avg,
    first(value, ts) FILTER (WHERE quality = 'good')  AS value_first,
    last(value, ts)  FILTER (WHERE quality = 'good')  AS value_last
FROM telemetry
GROUP BY bucket, job_id, canonical_tag_name, value_unit
WITH NO DATA;

-- Refresh policies. end_offset = 5 min leaves the most recent samples
-- un-aggregated long enough for the edge store-and-forward window
-- (telemetry-foundation §11) to deliver late packets into the raw chunk.
SELECT add_continuous_aggregate_policy(
    'telemetry_1m',
    start_offset      => INTERVAL '1 hour',
    end_offset        => INTERVAL '5 minutes',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists     => TRUE
);
SELECT add_continuous_aggregate_policy(
    'telemetry_15m',
    start_offset      => INTERVAL '6 hours',
    end_offset        => INTERVAL '5 minutes',
    schedule_interval => INTERVAL '5 minutes',
    if_not_exists     => TRUE
);
SELECT add_continuous_aggregate_policy(
    'telemetry_1h',
    start_offset      => INTERVAL '7 days',
    end_offset        => INTERVAL '1 hour',
    schedule_interval => INTERVAL '15 minutes',
    if_not_exists     => TRUE
);

-- Schema-phase marker bump.
INSERT INTO "_rvf_meta" (key, value)
VALUES ('schema_phase', 'F1.5')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
