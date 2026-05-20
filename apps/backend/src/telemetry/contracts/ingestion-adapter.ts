import type { TelemetryEnvelope } from './envelope';
import type { Quality, LateTelemetryReason } from '@prisma/client';

/**
 * IngestionAdapter — the contract every future telemetry source implements.
 *
 * F1.5 ships zero adapters. The interface is fixed in code so F2's
 * concrete adapters (MQTT, Node-RED, REST bridge, ThingsBoard export,
 * direct edge gateway) compete on the same surface and the rest of the
 * platform (validation, dedup, hypertable insert) doesn't need to know
 * which one wrote each row.
 *
 * Per F1.5 guidance #9, storage MUST stay transport-agnostic. The adapter
 * is the only place a particular wire format is allowed to leak in; from
 * `accept()` onward the system speaks `TelemetryEnvelope`.
 *
 * Per guidance #7, the adapter MUST NOT smooth, filter, interpolate, or
 * resample. Its job is to:
 *   1. Parse the wire format into envelopes (one envelope ≡ one §4 message).
 *   2. Tag each with its `sourceAdapter` id for audit.
 *   3. Hand off to the future `TelemetryIngestionService` which owns
 *      dedup + quarantine + hypertable insert.
 */
export interface IngestionAdapter {
  /** Stable id stored on every row written through this adapter. E.g.
   *  'mqtt', 'rest-bridge', 'thingsboard-export', 'edge-direct'. */
  readonly id: string;

  /** One-shot lifecycle. Called once at boot. Should attach to its transport
   *  (subscribe to MQTT topic, open a long poll, register a webhook). */
  start(): Promise<void>;

  /** Inverse of start; called on shutdown. Adapter must drain any in-flight
   *  buffers and stop accepting new messages. */
  stop(): Promise<void>;

  /** The async stream of envelopes the adapter produces. The ingestion
   *  service consumes this and routes to insert / quarantine. */
  envelopes(): AsyncIterable<AdapterEnvelope>;
}

/** Adapter output: an envelope plus the raw wire payload (for quarantine /
 *  audit if validation fails). */
export interface AdapterEnvelope {
  envelope: unknown;
  rawPayload?: unknown;
  receivedAt: Date;
  /** Adapter-specific id for tracing one message end-to-end (e.g. MQTT
   *  packet id, REST request id). */
  transportId?: string;
}

/**
 * Outcome of routing one adapter envelope through the future ingestion
 * service. The service guarantees one of these for every input — silent
 * drops are forbidden (F1.5 guidance #1).
 */
export type IngestOutcome =
  | { kind: 'accepted'; rowsWritten: number }
  | { kind: 'duplicate'; suppressed: number }
  | { kind: 'quarantined'; reason: LateTelemetryReason; quarantineId: string }
  | { kind: 'rejected'; reason: string };

/**
 * Future TelemetryIngestionService contract. Not implemented in F1.5; the
 * type is here so concrete adapters can be authored against a stable shape.
 *
 * Idempotency note: the implementation will guard via a pre-INSERT existence
 * check on (unit_id, seq, canonical_tag_name) because Timescale rejects
 * UNIQUE indexes that don't include the partitioning column. A replay of the
 * same (unit, seq, tag) triple returns `{ kind: 'duplicate' }`.
 */
export interface TelemetryIngestionService {
  /** Validate, dedup, route. Returns one outcome per envelope. */
  ingest(message: AdapterEnvelope): Promise<IngestOutcome>;

  /** Read-side helper for adapters that need the active job on a unit. */
  resolveActiveJob(unitId: string): Promise<{ jobId: string; jobCode: string }>;
}

// ─── Re-exports for ergonomic imports ──────────────────────────────────────
export type { TelemetryEnvelope, Quality };

/** Sentinel of the wire-protocol version this F1.5 was built against.
 *  Adapters that emit a different schema string must be ranged separately. */
export const SUPPORTED_ENVELOPE_SCHEMA = 'rvf.telemetry.v1' as const;
