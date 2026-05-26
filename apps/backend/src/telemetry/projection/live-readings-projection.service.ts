import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Input the projection service receives after a canonical telemetry_readings
 * row has been inserted. Caller (the ingestion service) is responsible for
 * resolving every field from the accepted row + the resolved source/mapping
 * context.
 */
export interface AcceptedTelemetryProjectionInput {
  telemetryReadingId: string;
  tenantId: string;
  unitId: string;
  sensorId: string;
  canonicalTagId: string;
  value: Prisma.Decimal;
  engineeringUnit: string;
  /// Caller must only invoke with 'good'. The service enforces the quality
  /// gate defensively as a second line.
  quality: 'good' | 'uncertain' | 'bad';
  timestamp: Date;
  source: string;
  ingestionTimestamp: Date;
}

/**
 * Internal per-call outcome. NOT a public API type; consumers are only the
 * ingestion service and the service's spec.
 */
export type LiveReadingProjectionResult =
  | { outcome: 'created'; liveReadingId: string }
  | { outcome: 'updated' }
  | { outcome: 'skipped_quality' }
  | { outcome: 'skipped_stale' }
  | { outcome: 'skipped_equal_timestamp' };

/**
 * LiveReadingsProjectionService — F4.6C.1.
 *
 * Backend-owned upsert-maintainer for the `live_readings` projection table
 * introduced by F4.6A.1. Implements the F4.6C-0 plan: only `quality === 'good'`
 * updates the projection; a strict `new.timestamp > stored.timestamp` watermark
 * gates every update; the projection key is `(unit_id, sensor_id,
 * canonical_tag_id)` (matching the F4.6A.1 `live_readings_unit_sensor_tag_uk`
 * UNIQUE constraint); the upsert sequence is race-safe by composing
 * `updateMany` (timestamp-gated) → `findUnique` → `create` with P2002 retry.
 *
 * **First phase authorized to write `prisma.liveReading.*`.** Every other
 * backend phase to date has left this table empty; F4.6B.1's isolation
 * invariants (no `live_readings` mutation outside this scope) carry forward.
 *
 * **What this service does NOT do:**
 *   - **No alarm evaluation.** Owned by F4.6D.
 *   - **No realtime / WebSocket / SSE emission.** Owned by F4.6E.
 *   - **No external integration.**
 *   - **No Jobs lookup.**
 *   - **No new HTTP endpoint or public API.** Internal-only.
 *   - **No DB triggers.**
 *   - **No `live_readings_projection` VIEW modification.** The F4.2B VIEW
 *     remains preserved per F4.6A.0 §5.E.
 *   - **No schema or migration change.** All columns come from the F4.6A.1
 *     `live_readings` schema.
 *
 * The service accepts a `Prisma.TransactionClient` so it can participate in
 * the same per-sample transactional unit as the canonical `telemetry_readings`
 * insert. The ingestion service always supplies `tx`; if no client is
 * supplied, the constructor-injected `PrismaService` is used (test seam).
 */
@Injectable()
export class LiveReadingsProjectionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Apply an accepted telemetry reading to the `live_readings` projection.
   *
   * Returns an internal outcome describing what happened. Never throws for
   * normal operational outcomes (stale / equal-timestamp / non-good quality);
   * those return a `skipped_*` outcome. Throws only on truly unexpected DB
   * failures so the surrounding transaction can roll back and the ingestion
   * boundary can report `mapping_engine_failure` per its existing outcome
   * contract.
   *
   * @param input  Accepted-reading projection data resolved by the caller.
   * @param client Optional transaction client. When the ingestion service
   *               calls this from within a `prisma.$transaction(async (tx) => ...)`
   *               block, `tx` is passed so the upsert and the canonical insert
   *               commit atomically. Tests may pass any client-shaped object.
   */
  async updateFromAcceptedTelemetry(
    input: AcceptedTelemetryProjectionInput,
    client?: Prisma.TransactionClient,
  ): Promise<LiveReadingProjectionResult> {
    // Defensive quality gate. F4.6C-0 §8 / DoD §16 — only `good` updates the
    // projection. Caller (the ingestion service) is expected to already gate
    // this, but the projection service double-checks.
    if (input.quality !== 'good') {
      return { outcome: 'skipped_quality' };
    }

    const db = client ?? this.prisma;

    const updateData = {
      latestTelemetryReadingId: input.telemetryReadingId,
      value: input.value,
      engineeringUnit: input.engineeringUnit,
      quality: 'good',
      timestamp: input.timestamp,
      source: input.source,
      ingestionTimestamp: input.ingestionTimestamp,
    };

    // Step 1 — watermark-gated update. If a row exists and its stored
    // timestamp is strictly older than the incoming sample's timestamp, the
    // row is updated. `updateMany` is used (not `update`) so that a stale
    // incoming reading produces `count === 0` instead of throwing
    // RecordNotFound.
    const updateResult = await db.liveReading.updateMany({
      where: {
        unitId: input.unitId,
        sensorId: input.sensorId,
        canonicalTagId: input.canonicalTagId,
        timestamp: { lt: input.timestamp },
      },
      data: updateData,
    });

    if (updateResult.count === 1) {
      return { outcome: 'updated' };
    }

    // Step 2 — count === 0. Either no row exists yet, or a row exists whose
    // stored timestamp is >= incoming (stale or equal). Disambiguate.
    const existing = await db.liveReading.findUnique({
      where: {
        unitId_sensorId_canonicalTagId: {
          unitId: input.unitId,
          sensorId: input.sensorId,
          canonicalTagId: input.canonicalTagId,
        },
      },
      select: { timestamp: true },
    });

    if (existing) {
      // Row exists; stored timestamp is >= incoming. Distinguish equal vs
      // strictly newer ("stale incoming").
      if (existing.timestamp.getTime() === input.timestamp.getTime()) {
        return { outcome: 'skipped_equal_timestamp' };
      }
      return { outcome: 'skipped_stale' };
    }

    // Step 3 — no row exists; create. Race window: another transaction may
    // create the row between Step 2 and Step 3. Handle the P2002 conflict.
    try {
      const created = await db.liveReading.create({
        data: {
          tenantId: input.tenantId,
          unitId: input.unitId,
          sensorId: input.sensorId,
          canonicalTagId: input.canonicalTagId,
          latestTelemetryReadingId: input.telemetryReadingId,
          value: input.value,
          engineeringUnit: input.engineeringUnit,
          quality: 'good',
          timestamp: input.timestamp,
          source: input.source,
          ingestionTimestamp: input.ingestionTimestamp,
        },
        select: { id: true },
      });
      return { outcome: 'created', liveReadingId: created.id };
    } catch (err) {
      if (!isUniqueViolation(err)) {
        // Unexpected DB error. Propagate so the surrounding transaction can
        // roll back and the ingestion boundary classifies the sample as
        // `mapping_engine_failure`.
        throw err;
      }

      // Race lost: another transaction created the row between Step 2 and
      // Step 3. Re-run the watermark-gated update against the row that
      // committed first.
      const retryResult = await db.liveReading.updateMany({
        where: {
          unitId: input.unitId,
          sensorId: input.sensorId,
          canonicalTagId: input.canonicalTagId,
          timestamp: { lt: input.timestamp },
        },
        data: updateData,
      });

      if (retryResult.count === 1) {
        return { outcome: 'updated' };
      }

      // Still 0 after the race-creator's row landed → the race-creator's row
      // is either newer than incoming (stale) or equal (no-op).
      const after = await db.liveReading.findUnique({
        where: {
          unitId_sensorId_canonicalTagId: {
            unitId: input.unitId,
            sensorId: input.sensorId,
            canonicalTagId: input.canonicalTagId,
          },
        },
        select: { timestamp: true },
      });

      if (after?.timestamp.getTime() === input.timestamp.getTime()) {
        return { outcome: 'skipped_equal_timestamp' };
      }
      return { outcome: 'skipped_stale' };
    }
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
