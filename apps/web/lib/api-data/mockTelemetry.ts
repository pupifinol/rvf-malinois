/**
 * Mock telemetry — F3 seed + in-memory ingestion buffer.
 *
 * The seed array gives every endpoint something to return on a cold
 * dev server. The mutable `INGESTED` array receives whatever the
 * `/api/telemetry` POST validates and stores. Both are read by the
 * adapter's `getTelemetry*` functions, so the API surface looks the
 * same whether you're asking for seed history or "what we just
 * received this session".
 *
 * The in-memory buffer is intentionally process-local: F3 does not
 * implement persistence (no Postgres, no TimescaleDB). A page refresh
 * keeps the seed; restarting the Next.js dev server resets the
 * buffer. That's the F3 contract.
 */
import type { TelemetryRecord } from '@/types/api';

const ISO_2026_05_24_T00 = '2026-05-24T00:00:00.000Z';

/**
 * Seed history. Each record has provenance `mock` so a client can tell
 * seed data from data ingested at runtime.
 */
export const MOCK_TELEMETRY_SEED: readonly TelemetryRecord[] = [
  // HP-001
  {
    id: 'tel-seed-hp-pi-001',
    unitId: 'unit-hp-001',
    sensorId: 'sensor-pressure-inlet-hp-001',
    timestamp: ISO_2026_05_24_T00,
    value: 3250,
    unit: 'psi',
    quality: 'good',
    source: 'mock',
  },
  {
    id: 'tel-seed-hp-ps-001',
    unitId: 'unit-hp-001',
    sensorId: 'sensor-pressure-separator-hp-001',
    timestamp: ISO_2026_05_24_T00,
    value: 2850,
    unit: 'psi',
    quality: 'good',
    source: 'mock',
  },
  {
    id: 'tel-seed-hp-ti-001',
    unitId: 'unit-hp-001',
    sensorId: 'sensor-temperature-inlet-hp-001',
    timestamp: ISO_2026_05_24_T00,
    value: 78,
    unit: 'degC',
    quality: 'good',
    source: 'mock',
  },
  {
    id: 'tel-seed-hp-fm-001',
    unitId: 'unit-hp-001',
    sensorId: 'sensor-flow-main-hp-001',
    timestamp: ISO_2026_05_24_T00,
    value: 1850,
    unit: 'bpd',
    quality: 'good',
    source: 'mock',
  },

  // MP-001
  {
    id: 'tel-seed-mp-pi-001',
    unitId: 'unit-mp-001',
    sensorId: 'sensor-pressure-inlet-mp-001',
    timestamp: ISO_2026_05_24_T00,
    value: 1400,
    unit: 'psi',
    quality: 'good',
    source: 'mock',
  },
  {
    id: 'tel-seed-mp-ti-001',
    unitId: 'unit-mp-001',
    sensorId: 'sensor-temperature-inlet-mp-001',
    timestamp: ISO_2026_05_24_T00,
    value: 62,
    unit: 'degC',
    quality: 'good',
    source: 'mock',
  },
  {
    id: 'tel-seed-mp-fm-001',
    unitId: 'unit-mp-001',
    sensorId: 'sensor-flow-main-mp-001',
    timestamp: ISO_2026_05_24_T00,
    value: 980,
    unit: 'bpd',
    quality: 'good',
    source: 'mock',
  },

  // LP-001 (pressure sensor offline, no record)
  {
    id: 'tel-seed-lp-ti-001',
    unitId: 'unit-lp-001',
    sensorId: 'sensor-temperature-inlet-lp-001',
    timestamp: ISO_2026_05_24_T00,
    value: 45,
    unit: 'degC',
    quality: 'good',
    source: 'mock',
  },
  {
    id: 'tel-seed-lp-fm-001',
    unitId: 'unit-lp-001',
    sensorId: 'sensor-flow-main-lp-001',
    timestamp: ISO_2026_05_24_T00,
    value: 240,
    unit: 'bpd',
    quality: 'good',
    source: 'mock',
  },
];

/**
 * Mutable in-memory buffer for records ingested via POST /api/telemetry.
 * Exported for the adapter to push into; route handlers MUST go through
 * the adapter (`ingestTelemetry`), never touch this array directly.
 */
export const INGESTED: TelemetryRecord[] = [];

/** Test-only reset. The adapter exposes `_resetTelemetryBuffer()` for it. */
export const _resetIngested = (): void => {
  INGESTED.length = 0;
};
