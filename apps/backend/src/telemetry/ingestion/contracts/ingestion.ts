import { z } from 'zod';

/**
 * Telemetry ingestion — wire contracts (F4.6B.1).
 *
 * Implements the F4.6B-0 plan (commit `c4ea18a`) and ADR-008 (Proposed, commit
 * `c12a29c`). Schemas / tuples / types here mirror the DB CHECK constraints
 * landed by F4.6A.1 (commit `6be7842`):
 *
 *   - `telemetry_readings.quality`           CHECK in ('good','uncertain','bad')
 *   - `telemetry_readings.source`            CHECK in (10 values)
 *   - `telemetry_ingestion_errors.reason`    CHECK in (15 values)
 *   - `telemetry_ingestion_errors.quality`   CHECK nullable in ('good','uncertain','bad')
 *
 * The application-side mirror tuples (`INGESTION_QUALITIES`,
 * `INGESTION_QUARANTINE_REASONS`) keep the wire contract and the DB constraint
 * in lockstep. New reasons or qualities require a follow-up migration to widen
 * the DB CHECK; F4.6B.1 does not author any such migration and the boundary
 * never emits a value not on the tuples below.
 *
 * F4.6B.1 conventions:
 *   - camelCase on the wire (consistent with the existing F4.4 surface).
 *   - Strict Zod schemas (`.strict()`); unknown fields cause request rejection.
 *   - `tenantId` is intentionally NOT a wire field: tenant is derived from
 *     IntegrationSource server-side (F4.6B-0 §9).
 *   - `source` (the CHECK-enum kind) is intentionally NOT a wire field: the
 *     boundary writes it from the resolved IntegrationSource.kind. Untrusted
 *     callers cannot lie about source kind.
 *   - The wire never carries operational-context fields (e.g. job references).
 *     Jobs remain deferred per ADR-008.
 */

// =============================================================================
// CHECK-enum mirror tuples (DB-truth lockstep)
// =============================================================================

/** Quality vocabulary — mirrors `telemetry_readings.quality` CHECK enum. */
export const INGESTION_QUALITIES = ['good', 'uncertain', 'bad'] as const;
export type IngestionQuality = (typeof INGESTION_QUALITIES)[number];

/**
 * Quarantine reason vocabulary — mirrors `telemetry_ingestion_errors.reason`
 * CHECK enum exactly as landed by F4.6A.1 (commit `6be7842`).
 *
 * **F4.6B.1 introduces no new reason value.** `closed_job` is intentionally
 * absent (Jobs deferred per ADR-008). `inactive_context` is the neutral
 * forward-looking placeholder for the operational-context-disabled case;
 * F4.6B.1 emits it when an `IntegrationSource.status` is not `'active'`.
 *
 * Any future reason value requires (a) a follow-up migration that widens
 * `telemetry_ingestion_errors_reason_chk`, (b) an extension of this tuple, and
 * (c) explicit review.
 */
export const INGESTION_QUARANTINE_REASONS = [
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
  'mapping_engine_failure',
] as const;
export type IngestionQuarantineReason = (typeof INGESTION_QUARANTINE_REASONS)[number];

/** Per-sample outcome vocabulary (F4.6B-0 §7.4). */
export const INGESTION_OUTCOMES = [
  'accepted',
  'duplicate',
  'conflict_quarantined',
  'rejected_quarantined',
  'rejected_request',
] as const;
export type IngestionOutcome = (typeof INGESTION_OUTCOMES)[number];

// =============================================================================
// Tunables
// =============================================================================

/** Max samples per batch (F4.6B-0 §6.3). Conservative; F4.6C+ may raise after profiling. */
export const INGEST_BATCH_MAX = 1_000;

/** Reject samples whose `timestamp` is later than `now() + this` (F4.6B-0 §11.1). */
export const INGESTION_MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

/** Quarantine samples whose `timestamp` is earlier than `now() - this` (F4.6B-0 §11.1). */
export const INGESTION_MAX_LATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;

// =============================================================================
// Request schemas (Zod)
// =============================================================================

/**
 * `value` — number or string-as-numeric. Number-valued JSON loses precision
 * past ~15 significant digits; upstream sources that need higher precision
 * should send the value as a string. The service stringifies before handing to
 * Prisma `Decimal`.
 */
const ValueSchema = z.union([
  z.number().finite(),
  z.string().regex(/^-?\d+(\.\d+)?$/, 'value must be a finite decimal string'),
]);

/** `sequence` — optional monotonic counter per channel. Number or numeric string. */
const SequenceSchema = z.union([
  z.number().int().nonnegative(),
  z.string().regex(/^\d+$/, 'sequence must be a non-negative integer string'),
]);

/** Single sample on the wire. Strict; rejects unknown fields. */
export const IngestTelemetrySampleInputSchema = z
  .object({
    externalIdentifier: z.string().min(1).max(256),
    timestamp: z.string().datetime({ offset: true }),
    value: ValueSchema,
    engineeringUnit: z.string().min(1).max(64),
    quality: z.enum(INGESTION_QUALITIES),
    sequence: SequenceSchema.optional(),
    rawPayload: z.unknown().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type IngestTelemetrySampleInput = z.infer<typeof IngestTelemetrySampleInputSchema>;

/** Full batch request body. Strict. */
export const IngestTelemetryBatchInputSchema = z
  .object({
    integrationSourceId: z.string().uuid(),
    correlationId: z.string().min(1).max(128).optional(),
    samples: z.array(IngestTelemetrySampleInputSchema).min(1).max(INGEST_BATCH_MAX),
  })
  .strict();

export type IngestTelemetryBatchInput = z.infer<typeof IngestTelemetryBatchInputSchema>;

// =============================================================================
// Response types (TypeScript only; not Zod-validated — these are emitted)
// =============================================================================

export interface IngestTelemetrySampleResult {
  sampleIndex: number;
  outcome: IngestionOutcome;
  /** Present when `outcome === 'accepted'`. */
  telemetryReadingId?: string;
  /** Present when `outcome` is `*_quarantined` or `rejected_request`. */
  telemetryIngestionErrorId?: string;
  /** Present when `outcome` is `*_quarantined` or `rejected_request`. */
  reason?: IngestionQuarantineReason;
  /** Free-form elaboration (e.g. `"existing.value=4123.4 incoming.value=4124.0"`). Bounded; never carries raw stack traces. */
  reasonDetail?: string;
}

export interface IngestTelemetryBatchResult {
  batchId: string;
  correlationId?: string;
  acceptedCount: number;
  duplicateCount: number;
  conflictQuarantinedCount: number;
  rejectedQuarantinedCount: number;
  rejectedRequestCount: number;
  results: IngestTelemetrySampleResult[];
}
