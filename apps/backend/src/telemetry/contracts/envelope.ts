import { Quality } from '@prisma/client';
import { z } from 'zod';

/**
 * Inbound telemetry envelope schema — telemetry-foundation §4.
 *
 * One envelope ≡ one MQTT/REST/edge message containing N measurements taken
 * at the same instant. Each measurement becomes one row in the `telemetry`
 * hypertable (long format, domain-model §13).
 *
 * The schema validates SHAPE only. Per F1.5 guidance #7, no smoothing,
 * resampling, or value transformation happens at ingest. A row is stored
 * exactly as received, with its received unit, and converted to canonical
 * units at query time.
 *
 * Out-of-order ts is allowed (F1.5 guidance #8) — the validator only checks
 * the timestamp is a valid UTC ISO string. The hypertable accepts arbitrary
 * insertion order; idempotency is enforced on (unit_id, seq, tag) at the
 * adapter layer.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

/** ISO-8601 UTC timestamp with millisecond precision and trailing 'Z'. */
const utcIsoTimestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/, {
    message:
      'ts must be a UTC ISO-8601 string ending in Z (telemetry-foundation §4 — edge times never use local offset)',
  })
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'ts is not a parseable timestamp' });

/** Identifier — lowercase, no spaces (telemetry-foundation §8 — naming). */
const lowerKebabId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'identifier must be alphanumeric with - or _ only');

/** Per-measurement payload. Keys intentionally short to save satellite bytes (§4). */
export const MeasurementSchema = z
  .object({
    /** Raw value as measured. Stored as-is in `Telemetry.value`. */
    v: z.number().finite(),
    /** Engineering unit AS REPORTED. Stored as-is in `Telemetry.value_unit`. */
    u: z.string().min(1).max(40),
    /** Data quality (domain-model §14). */
    q: z.nativeEnum(Quality),
  })
  .strict();

export type Measurement = z.infer<typeof MeasurementSchema>;

// ─── Envelope ───────────────────────────────────────────────────────────────

export const TELEMETRY_ENVELOPE_SCHEMA = 'rvf.telemetry.v1' as const;

export const TelemetryEnvelopeSchema = z
  .object({
    schema: z.literal(TELEMETRY_ENVELOPE_SCHEMA),
    unit_id: lowerKebabId,
    well_id: z.string().min(1).max(64).optional(),
    job_id: z.string().min(1).max(64),
    ts: utcIsoTimestamp,
    seq: z.number().int().min(0),
    /** Map of canonical-tag-name → measurement. Must be non-empty. */
    measurements: z
      .record(
        z
          .string()
          .min(1)
          .max(64)
          .regex(/^[a-z][a-z0-9_]*$/, 'canonical tag must be lower_snake_case'),
        MeasurementSchema,
      )
      .refine((m) => Object.keys(m).length > 0, {
        message: 'envelope must contain at least one measurement',
      }),
    /** Optional sensor-tag → P&ID instrument tag map. When present, lets the
     *  adapter cross-check against the job's commissioning snapshot.
     *  Shape: `{ p_inlet: "PIT-003", t_outlet: "TIT-002" }`. */
    sensors: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export type TelemetryEnvelope = z.infer<typeof TelemetryEnvelopeSchema>;
