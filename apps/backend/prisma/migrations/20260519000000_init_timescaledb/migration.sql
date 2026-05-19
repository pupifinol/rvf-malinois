-- RVF Malinois — Initial migration
--
-- Enables the TimescaleDB extension. No tables yet; domain tables come in F1
-- per docs/architecture/domain-model.md §21. The telemetry hypertable
-- (`telemetry`) and sensor_health hypertable come in F2.

CREATE EXTENSION IF NOT EXISTS "timescaledb";

-- A neutral marker row so the migration is observable (and so prisma migrate
-- has something to apply). Removed when the real schema arrives.
CREATE TABLE IF NOT EXISTS "_rvf_meta" (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO "_rvf_meta" (key, value)
VALUES ('schema_phase', 'F0')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
