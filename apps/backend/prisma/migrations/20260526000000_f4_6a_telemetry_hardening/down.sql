-- =============================================================================
-- RVF Malinois — F4.6A.1 telemetry hardening — reverse migration
-- =============================================================================
-- Companion to migration.sql in the same directory.
--
-- Prisma does NOT auto-execute this file. It is shipped as documentation /
-- operational rollback per F4.6A.0 plan §5.G. Operators may apply it via
-- `psql` to undo F4.6A.1 DDL in a safe order. For a development environment
-- where a destructive reset is acceptable, prefer the documented procedure:
--
--     docker compose down -v && \
--     docker compose up -d postgres && \
--     pnpm --filter @rvf/backend exec prisma migrate dev
--
-- (which replays from the F4.2 baseline and skips F4.6A.1).
--
-- F4.6A.1 is non-destructive:
--   - telemetry_readings rows are preserved (only a column is removed).
--   - live_readings_projection VIEW is preserved (not modified by F4.6A.1).
--   - No other table is altered.
--
-- IMPORTANT — if telemetry_readings.integration_source_id has been populated
-- by a downstream phase before rollback, those values are lost when the
-- column is dropped. F4.6A.1 itself never populates the column, so a rollback
-- inside the F4.6A.1 window is data-loss-free.
-- =============================================================================


-- =============================================================================
-- 1. Drop the new live_readings table.
-- =============================================================================
-- CASCADE removes the table's indexes, the FK to telemetry_readings, and the
-- unique constraint. Rows in live_readings are lost; the projection is
-- rebuildable from telemetry_readings by a future deterministic query.

DROP TABLE IF EXISTS live_readings CASCADE;


-- =============================================================================
-- 2. Drop the quarantine table.
-- =============================================================================
-- CASCADE removes its indexes, CHECK constraints, and FKs. Quarantine rows
-- are diagnostic, not canonical; losing them on rollback is acceptable.

DROP TABLE IF EXISTS telemetry_ingestion_errors CASCADE;


-- =============================================================================
-- 3. Drop the new partial unique dedup indexes on telemetry_readings.
-- =============================================================================

DROP INDEX IF EXISTS telemetry_readings_dedup_seq_uk;
DROP INDEX IF EXISTS telemetry_readings_dedup_ts_uk;


-- =============================================================================
-- 4. Drop the auxiliary forensic index on telemetry_readings.
-- =============================================================================

DROP INDEX IF EXISTS telemetry_readings_ingestion_id_idx;


-- =============================================================================
-- 5. Drop the lookup index for integration_source_id.
-- =============================================================================

DROP INDEX IF EXISTS telemetry_readings_integration_source_idx;


-- =============================================================================
-- 6. Drop the integration_source_id column on telemetry_readings.
-- =============================================================================
-- Safe inside the F4.6A.1 window: F4.6A.1 itself never populates the column.
-- A later sub-phase that begins populating the column raises this rollback's
-- impact; operators should confirm before applying.

ALTER TABLE telemetry_readings DROP COLUMN IF EXISTS integration_source_id;


-- =============================================================================
-- 7. live_readings_projection VIEW — DO NOT TOUCH.
-- =============================================================================
-- The F4.2 baseline VIEW is preserved by F4.6A.1 and remains intact under
-- rollback. No DROP VIEW statement here by design.

-- =============================================================================
-- End of F4.6A.1 reverse migration.
-- =============================================================================
