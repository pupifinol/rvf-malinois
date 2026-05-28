import { z } from 'zod';

import { TELEMETRY_QUALITIES, type TelemetryQuality } from './trends';

/**
 * Latest-value read — query + response contracts (F4.6C.2.1).
 *
 * Canonical *current-value* read surface over the `live_readings` projection
 * populated by F4.6C.1 inside the ingestion transaction. This API exists
 * because:
 *
 *   - The historical trend API (F4.6F.1, `GET /telemetry/trends`) is
 *     range-scan-shaped. Calling `/trends?from=now-1m&to=now&limit=1` for a
 *     current value is wasteful per metric and conflates semantics — "last
 *     point in a window" is not "current value."
 *   - The realtime fan-out (F4.6E.1) is delivery / tail notification, not
 *     durable hydration. Subscribers that disconnect re-read via REST. The
 *     latest-value endpoint is that REST surface.
 *
 * F4.6C.2.1 scope (locked by F4.6C.2-0):
 *
 *   - Reads `live_readings` only — never `telemetry_readings`, never the
 *     `live_readings_projection` SQL VIEW, never the Socket.IO in-memory
 *     state, never frontend mock state.
 *   - Required `unitId` (UUID); optional `canonicalTagId` / `canonicalTagName`
 *     XOR for single-tag filtering. Omitting both returns every latest value
 *     for the unit (most useful shape for a tile grid).
 *   - Tenant scoping inherited from `CallerContext`; never trusted from the
 *     client (no `tenantId` query parameter).
 *   - Quality is always `good` by F4.6C.1 contract; the field is surfaced
 *     for forward compatibility (typed against the F4.4F quality union).
 *   - No `from` / `to` / `limit` / `source` / `jobId` / `quality` /
 *     `qualityPolicy` parameters — the projection is a point-in-time view
 *     and is already `good`-only.
 *   - Decimal-typed `value` serializes as a string via `Prisma.Decimal.toJSON`
 *     (matches the F4.4F raw-mode posture; consumers `Number(...)` if they
 *     need numeric math).
 *   - No-data behavior is `200 OK` with `values: []` — never 404 (matches
 *     the F4.4F empty-array posture).
 *
 * `tenantId`, `id`, `createdAt`, `updatedAt`, and the reserved `status`
 * column are intentionally **not** on the wire. Forward-compat seam: a future
 * phase can additively expose `status` (and any other projection column)
 * without breaking F4.6C.2.1 callers.
 */

// =============================================================================
// Request schema
// =============================================================================

/**
 * Latest-query schema for the controller's Zod pipe. UUIDs are required at the
 * call boundary; supplying both `canonicalTagId` and `canonicalTagName` is
 * rejected as ambiguous (clearer than precedence rules). Supplying neither
 * returns every latest value for the unit — the most useful shape for a tile
 * grid hydration call.
 */
export const LatestQuerySchema = z
  .object({
    unitId: z.string().uuid(),
    canonicalTagId: z.string().uuid().optional(),
    canonicalTagName: z.string().min(1).max(64).optional(),
  })
  .strict()
  .refine((q) => !(q.canonicalTagId !== undefined && q.canonicalTagName !== undefined), {
    message:
      'supplying both `canonicalTagId` and `canonicalTagName` is rejected as ambiguous; ' +
      'supply at most one, or omit both to receive all latest values for the unit',
    path: ['canonicalTagName'],
  });

export type LatestQuery = z.infer<typeof LatestQuerySchema>;

// =============================================================================
// Response shape
// =============================================================================

/**
 * One row of the latest-values response — a derived projection of one
 * `live_readings` row keyed by `(unitId, sensorId, canonicalTagId)`.
 *
 * The wire shape is a **derived view**, not a Prisma row dump:
 *   - `tenantId` is stripped (server-side concern).
 *   - The projection's primary `id` is stripped (the projection is
 *     rebuildable from `telemetry_readings`).
 *   - `createdAt` / `updatedAt` are stripped (operational metadata).
 *   - The reserved `status` column is stripped (unpopulated by F4.6C.1).
 *
 * `value` is a Prisma `Decimal` that JSON-serializes to a string via
 * `Decimal.toJSON`; consumers parse to `Number` when they need numeric
 * math. Matches the F4.4F raw-mode posture.
 */
export interface LatestValueRow {
  sensorId: string;
  canonicalTag: {
    id: string;
    name: string;
    displayName: string;
    canonicalUnit: string;
    category: string;
    precision: number;
  };
  /** Decimal — serialized as a string. Consumers `Number(...)` if needed. */
  value: unknown;
  engineeringUnit: string;
  /** Always `'good'` per F4.6C.1; surfaced for forward compatibility. */
  quality: TelemetryQuality;
  /** Canonical reading timestamp (the watermark). */
  timestamp: Date;
  /** Backend acceptance timestamp from the projection event. Nullable. */
  ingestionTimestamp: Date | null;
  /** E.g. 'mqtt', 'manual', 'mock'. Nullable in projection. */
  source: string | null;
  /** UUID of the `telemetry_readings` row this projection points at. Nullable. */
  latestTelemetryReadingId: string | null;
}

/**
 * Latest-values envelope.
 *
 * `generatedAt` is the server-side response-generation timestamp — lets the
 * frontend label a "last fetched at" without inferring it from network timing.
 * `source` is the constant string `'live_readings'` so the caller can label
 * the wire honestly (per ADR-005 "never lie about freshness").
 * `values` is zero or more rows — the empty array is the no-data answer for
 * both "known unit, no projection rows yet" and "unknown unit" (matches the
 * F4.4F empty-array posture; never 404 on the empty paths).
 */
export interface LatestResponse {
  unitId: string;
  generatedAt: Date;
  source: 'live_readings';
  values: LatestValueRow[];
}

/** Re-export to keep the quality union near its consumers. */
export { TELEMETRY_QUALITIES, type TelemetryQuality };
