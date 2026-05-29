-- =============================================================================
-- RVF Malinois — F4.7.1 well-test job lifecycle — reverse migration
-- =============================================================================
-- Companion to migration.sql in the same directory.
--
-- Prisma does NOT auto-execute this file. It is shipped as documentation /
-- operational rollback. Operators may apply it via `psql` to undo F4.7.1 DDL
-- in a safe order. For a development environment where a destructive reset is
-- acceptable, prefer the documented procedure:
--
--     docker compose down -v && \
--     docker compose up -d postgres && \
--     pnpm --filter @rvf/backend exec prisma migrate dev
--
-- (which replays from the F4.2 baseline and skips F4.7.1).
--
-- F4.7.1 is non-destructive: a single new table is dropped. No existing
-- table is altered. The reverse order mirrors the forward migration:
--
--   1. Drop the `well_tests` indexes (transitively dropped by DROP TABLE,
--      named here for clarity).
--   2. Drop the `well_tests` table.

DROP INDEX IF EXISTS well_tests_unit_official_time_idx;
DROP INDEX IF EXISTS well_tests_unit_status_idx;
DROP INDEX IF EXISTS well_tests_well_idx;
DROP INDEX IF EXISTS well_tests_job_idx;
DROP INDEX IF EXISTS well_tests_tenant_idx;

DROP TABLE IF EXISTS well_tests;
