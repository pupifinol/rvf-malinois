import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AlarmEvaluationService } from '../../alarms/alarm-evaluation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LiveReadingsProjectionService } from '../projection/live-readings-projection.service';

import {
  INGESTION_MAX_FUTURE_SKEW_MS,
  INGESTION_MAX_LATE_WINDOW_MS,
  type IngestTelemetryBatchInput,
  type IngestTelemetryBatchResult,
  type IngestTelemetrySampleInput,
  type IngestTelemetrySampleResult,
  type IngestionQuarantineReason,
} from './contracts/ingestion';

import type { CallerContext } from '../../common/caller-context';
import type { IntegrationMapping, IntegrationSource } from '@prisma/client';

/**
 * TelemetryIngestionService — F4.6B.1 ingestion boundary.
 *
 * The single controlled write path into `telemetry_readings` (ADR-008 decision
 * 2 / 3). Per-sample independence with partial-success outcomes; per-sample
 * transactional unit (one short-lived transaction per sample, not a batch
 * transaction — partial-success is the wire contract, F4.6B-0 §6.6).
 *
 * **What this service does (F4.6B.1):**
 *   1. Resolves `IntegrationSource` (source of the batch). Server-derives the
 *      tenant from it; the wire never carries a tenantId.
 *   2. Resolves `IntegrationMapping` per sample by
 *      `(integrationSourceId, externalIdentifier)`.
 *   3. Resolves `(sensor_id, canonical_tag_id)` from the mapping, with
 *      `SensorTagBinding` fallback when one of them is null on the mapping.
 *   4. Normalizes the sample (timestamp window, value parseability, unit
 *      check vs the mapping's expected unit). No unit conversion at ingest.
 *   5. Inserts into `telemetry_readings`. On a Prisma `P2002` (partial unique
 *      dedup index violation from F4.6A.1), classifies as `duplicate` (no row
 *      written) or `conflict_quarantined` (one quarantine row written).
 *   6. Writes a `telemetry_ingestion_errors` row for every non-acceptance
 *      outcome with one of the 15 F4.6A.1 CHECK-enum reasons.
 *
 * **What this service explicitly does NOT do (F4.6B-0 §14.2, §17):**
 *   - **No `live_readings` mutation.** Delegated to `LiveReadingsProjectionService`
 *     (F4.6C.1). The ingestion service never calls `prisma.liveReading.*`
 *     directly.
 *   - **No `alarm_events` mutation.** Delegated to `AlarmEvaluationService`
 *     (F4.6D.1). The ingestion service never calls `prisma.alarmEvent.*`
 *     directly.
 *   - **No realtime / WebSocket / SSE emission.** Owned by F4.6E.
 *   - **No external bridge (MQTT / Modbus / OPC-UA / ThingsBoard / Node-RED /
 *     PLC / edge-gateway / historian) wiring.** Each future bridge is its own
 *     phase, with its own ADR if needed.
 *   - **No Jobs lookup or active-context resolution.** Jobs remain deferred.
 *   - **No engineering-unit conversion at ingest time.** Mismatch quarantined
 *     as `unit_mismatch`.
 *   - **No quality aliasing** (e.g. `suspect` → `uncertain`). Wire enum is
 *     strictly the three F4.6A.1 CHECK values.
 *   - **No payload-trust for canonical identity.** `tenantId`, `unitId`,
 *     `sensorId`, `canonicalTagId`, `source.kind` are all resolved
 *     server-side from `IntegrationSource` and `IntegrationMapping`.
 *
 * Tenant scoping seam: identical posture to F4.4 — the existing `CallerContext`
 * is accepted as the first argument for forward compatibility, but in F4.6B.1
 * the tenant always derives from `IntegrationSource.tenant_id`. A future
 * `ctx.tenantId` passed by an authenticated caller would only be cross-checked
 * against the source's tenant; mismatches quarantine as `tenant_mismatch`.
 */
@Injectable()
export class TelemetryIngestionService {
  private readonly logger = new Logger(TelemetryIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projection: LiveReadingsProjectionService,
    private readonly alarms: AlarmEvaluationService,
  ) {}

  /**
   * Process a batch of telemetry drafts. Returns one outcome per sample plus
   * aggregate counts. Never throws for per-sample failures — quarantine is
   * the normal failure mode and is reported in `results[i]`.
   *
   * @param ctx Forward-compat seam (`CallerContext`). Tenant is derived from
   *            the resolved `IntegrationSource`, not from `ctx`.
   * @param input Validated batch request.
   * @param now Optional clock override (test seam). Defaults to `new Date()`.
   */
  async ingestBatch(
    ctx: CallerContext,
    input: IngestTelemetryBatchInput,
    now: Date = new Date(),
  ): Promise<IngestTelemetryBatchResult> {
    // Forward-compat seam: ctx is accepted but tenant scoping derives from the
    // source. Touching ctx here prevents a future "unused parameter" lint
    // regression when the seam is wired to real auth.
    void ctx;

    const batchId = randomUUID();
    const results: IngestTelemetrySampleResult[] = [];

    // Source lookup is the only batch-level pre-step. If it fails, every
    // sample in the batch quarantines under the same reason (the boundary
    // cannot resolve mapping or tenant without the source).
    const source = await this.prisma.integrationSource.findUnique({
      where: { id: input.integrationSourceId },
    });

    if (!source) {
      for (const [i, sample] of input.samples.entries()) {
        const errId = await this.writeQuarantine({
          reason: 'unknown_source',
          reasonDetail: `IntegrationSource not found: id=${input.integrationSourceId}`,
          sample,
          correlationId: input.correlationId,
          tenantId: null,
          integrationSourceId: null,
          integrationMappingId: null,
          unitId: null,
          sensorId: null,
          canonicalTagId: null,
        });
        results.push({
          sampleIndex: i,
          outcome: 'rejected_quarantined',
          telemetryIngestionErrorId: errId,
          reason: 'unknown_source',
        });
      }
      return this.aggregate(batchId, input.correlationId, results);
    }

    if (source.status !== 'active') {
      for (const [i, sample] of input.samples.entries()) {
        const errId = await this.writeQuarantine({
          reason: 'inactive_context',
          reasonDetail: `IntegrationSource.status=${source.status}`,
          sample,
          correlationId: input.correlationId,
          tenantId: source.tenantId,
          integrationSourceId: source.id,
          integrationMappingId: null,
          unitId: null,
          sensorId: null,
          canonicalTagId: null,
        });
        results.push({
          sampleIndex: i,
          outcome: 'rejected_quarantined',
          telemetryIngestionErrorId: errId,
          reason: 'inactive_context',
        });
      }
      return this.aggregate(batchId, input.correlationId, results);
    }

    for (const [i, sample] of input.samples.entries()) {
      try {
        const result = await this.processSample({
          sample,
          sampleIndex: i,
          source,
          correlationId: input.correlationId,
          now,
        });
        results.push(result);
      } catch (err) {
        // Unexpected internal failure. Log server-side; never echo raw errors.
        this.logger.error(
          {
            sampleIndex: i,
            integrationSourceId: source.id,
            err: err instanceof Error ? { name: err.name, message: err.message } : String(err),
          },
          'unexpected_ingestion_failure',
        );
        const errId = await this.writeQuarantine({
          reason: 'mapping_engine_failure',
          reasonDetail: 'unexpected internal failure during sample processing',
          sample,
          correlationId: input.correlationId,
          tenantId: source.tenantId,
          integrationSourceId: source.id,
          integrationMappingId: null,
          unitId: null,
          sensorId: null,
          canonicalTagId: null,
        });
        results.push({
          sampleIndex: i,
          outcome: 'rejected_quarantined',
          telemetryIngestionErrorId: errId,
          reason: 'mapping_engine_failure',
        });
      }
    }

    return this.aggregate(batchId, input.correlationId, results);
  }

  // =========================================================================
  // Per-sample processing
  // =========================================================================

  private async processSample(args: {
    sample: IngestTelemetrySampleInput;
    sampleIndex: number;
    source: IntegrationSource;
    correlationId: string | undefined;
    now: Date;
  }): Promise<IngestTelemetrySampleResult> {
    const { sample, sampleIndex, source, correlationId, now } = args;
    const tenantId = source.tenantId;

    // -----------------------------------------------------------------------
    // 1. Mapping resolution
    // -----------------------------------------------------------------------
    const mapping = await this.prisma.integrationMapping.findUnique({
      where: {
        integrationSourceId_externalIdentifier: {
          integrationSourceId: source.id,
          externalIdentifier: sample.externalIdentifier,
        },
      },
    });

    if (!mapping) {
      return this.quarantineResult({
        sampleIndex,
        reason: 'unknown_mapping',
        reasonDetail: `no IntegrationMapping for externalIdentifier=${sample.externalIdentifier}`,
        sample,
        correlationId,
        tenantId,
        integrationSourceId: source.id,
        integrationMappingId: null,
        unitId: null,
        sensorId: null,
        canonicalTagId: null,
      });
    }

    if (!mapping.enabled) {
      return this.quarantineResult({
        sampleIndex,
        reason: 'disabled_mapping',
        reasonDetail: 'IntegrationMapping.enabled=false',
        sample,
        correlationId,
        tenantId,
        integrationSourceId: source.id,
        integrationMappingId: mapping.id,
        unitId: mapping.unitId,
        sensorId: mapping.sensorId,
        canonicalTagId: mapping.canonicalTagId,
      });
    }

    if (mapping.tenantId !== source.tenantId) {
      return this.quarantineResult({
        sampleIndex,
        reason: 'tenant_mismatch',
        reasonDetail: `mapping.tenantId=${mapping.tenantId} != source.tenantId=${source.tenantId}`,
        sample,
        correlationId,
        tenantId,
        integrationSourceId: source.id,
        integrationMappingId: mapping.id,
        unitId: mapping.unitId,
        sensorId: mapping.sensorId,
        canonicalTagId: mapping.canonicalTagId,
      });
    }

    // -----------------------------------------------------------------------
    // 2. Sensor / canonical_tag resolution (with SensorTagBinding fallback)
    // -----------------------------------------------------------------------
    const resolution = await this.resolveSensorAndTag(mapping);
    if (resolution.error) {
      return this.quarantineResult({
        sampleIndex,
        reason: resolution.error.reason,
        reasonDetail: resolution.error.detail,
        sample,
        correlationId,
        tenantId,
        integrationSourceId: source.id,
        integrationMappingId: mapping.id,
        unitId: mapping.unitId,
        sensorId: mapping.sensorId ?? resolution.sensorId ?? null,
        canonicalTagId: mapping.canonicalTagId ?? resolution.canonicalTagId ?? null,
      });
    }
    const { sensorId, canonicalTagId } = resolution;

    // -----------------------------------------------------------------------
    // 3. Unit check (no conversion in F4.6B.1)
    // -----------------------------------------------------------------------
    const canonicalTag = await this.prisma.canonicalTag.findUnique({
      where: { id: canonicalTagId },
      select: { canonicalUnit: true },
    });
    if (!canonicalTag) {
      return this.quarantineResult({
        sampleIndex,
        reason: 'mapping_engine_failure',
        reasonDetail: `CanonicalTag id=${canonicalTagId} not found`,
        sample,
        correlationId,
        tenantId,
        integrationSourceId: source.id,
        integrationMappingId: mapping.id,
        unitId: mapping.unitId,
        sensorId,
        canonicalTagId,
      });
    }
    const expectedUnit = mapping.engineeringUnitOverride ?? canonicalTag.canonicalUnit;
    if (sample.engineeringUnit !== expectedUnit) {
      return this.quarantineResult({
        sampleIndex,
        reason: 'unit_mismatch',
        reasonDetail: `sample.engineeringUnit=${sample.engineeringUnit} != expected=${expectedUnit}`,
        sample,
        correlationId,
        tenantId,
        integrationSourceId: source.id,
        integrationMappingId: mapping.id,
        unitId: mapping.unitId,
        sensorId,
        canonicalTagId,
      });
    }

    // -----------------------------------------------------------------------
    // 4. Temporal normalization
    // -----------------------------------------------------------------------
    const sampleTs = new Date(sample.timestamp);
    const delta = sampleTs.getTime() - now.getTime();
    if (delta > INGESTION_MAX_FUTURE_SKEW_MS) {
      return this.quarantineResult({
        sampleIndex,
        reason: 'future_timestamp',
        reasonDetail: `sample.timestamp is ${delta}ms in the future (max ${INGESTION_MAX_FUTURE_SKEW_MS}ms)`,
        sample,
        correlationId,
        tenantId,
        integrationSourceId: source.id,
        integrationMappingId: mapping.id,
        unitId: mapping.unitId,
        sensorId,
        canonicalTagId,
      });
    }
    if (-delta > INGESTION_MAX_LATE_WINDOW_MS) {
      return this.quarantineResult({
        sampleIndex,
        reason: 'late_outside_window',
        reasonDetail: `sample.timestamp is ${-delta}ms old (max ${INGESTION_MAX_LATE_WINDOW_MS}ms)`,
        sample,
        correlationId,
        tenantId,
        integrationSourceId: source.id,
        integrationMappingId: mapping.id,
        unitId: mapping.unitId,
        sensorId,
        canonicalTagId,
      });
    }

    // -----------------------------------------------------------------------
    // 5. Value normalization. Zod already validated finiteness; this is a
    //    defensive recheck for the string variant (parses to finite).
    // -----------------------------------------------------------------------
    const valueStr = typeof sample.value === 'number' ? String(sample.value) : sample.value;
    if (!Number.isFinite(Number(valueStr))) {
      return this.quarantineResult({
        sampleIndex,
        reason: 'invalid_value',
        reasonDetail: `value=${valueStr} did not parse as finite numeric`,
        sample,
        correlationId,
        tenantId,
        integrationSourceId: source.id,
        integrationMappingId: mapping.id,
        unitId: mapping.unitId,
        sensorId,
        canonicalTagId,
      });
    }

    // -----------------------------------------------------------------------
    // 6. Canonical insert + dedup catch
    // -----------------------------------------------------------------------
    const sequenceBig =
      sample.sequence !== undefined
        ? typeof sample.sequence === 'number'
          ? BigInt(sample.sequence)
          : BigInt(sample.sequence)
        : null;

    // The canonical insert, the live_readings projection update, and the
    // alarm evaluation step share the same transactional unit
    // (F4.6C-0 §7.3 / F4.6D-0 §6.1 / ADR-008 §3 decision 5). On any failure
    // inside the transaction — including the projection writer's or the
    // alarm evaluator's own unexpected errors — the canonical row is rolled
    // back, and the outer catch surfaces the sample as
    // `rejected_quarantined` with `mapping_engine_failure` (no new reason
    // value introduced).
    //
    // The projection updater AND the alarm evaluator are both invoked only
    // for `accepted` + `quality === 'good'`. Each service also enforces the
    // gate defensively, but the call-site gate keeps non-good samples out
    // of both paths entirely (avoids needless DB work).
    //
    // P2002 from the canonical insert (the F4.6A.1 dedup indexes) still
    // surfaces via the outer catch and is classified as `duplicate` vs
    // `conflict_quarantined` by `classifyDedup`. The projection's own race
    // path (P2002 on `live_readings_unit_sensor_tag_uk`) is handled inside
    // the projection service so it does not leak into the dedup classifier.
    // The alarm evaluator does not have an analogous race path (no UNIQUE
    // constraint on the active-event composite key); its duplicate-active
    // guard is the explicit `findFirst` inside `AlarmEvaluationService`.
    const valueDecimal = new Prisma.Decimal(valueStr);
    const ingestionTimestamp = now;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.telemetryReading.create({
          data: {
            tenantId,
            unitId: mapping.unitId,
            sensorId,
            canonicalTagId,
            integrationSourceId: source.id,
            timestamp: sampleTs,
            value: valueDecimal,
            engineeringUnit: sample.engineeringUnit,
            quality: sample.quality,
            source: source.kind,
            ingestionId: sample.externalIdentifier,
            sequence: sequenceBig,
            jobId: null,
          },
          select: { id: true },
        });

        if (sample.quality === 'good') {
          await this.projection.updateFromAcceptedTelemetry(
            {
              telemetryReadingId: row.id,
              tenantId,
              unitId: mapping.unitId,
              sensorId,
              canonicalTagId,
              value: valueDecimal,
              engineeringUnit: sample.engineeringUnit,
              quality: 'good',
              timestamp: sampleTs,
              source: source.kind,
              ingestionTimestamp,
            },
            tx,
          );

          // F4.6D.1: alarm evaluation runs after the projection upsert, inside
          // the same per-sample transaction. The evaluator owns every read
          // and write against `alarm_rules` / `alarm_events`; the ingestion
          // service never touches those tables directly.
          await this.alarms.evaluate(
            {
              telemetryReadingId: row.id,
              tenantId,
              unitId: mapping.unitId,
              sensorId,
              canonicalTagId,
              value: valueDecimal,
              engineeringUnit: sample.engineeringUnit,
              quality: 'good',
              timestamp: sampleTs,
              source: source.kind,
            },
            tx,
          );
        }

        return row;
      });
      return {
        sampleIndex,
        outcome: 'accepted',
        telemetryReadingId: created.id,
      };
    } catch (err) {
      if (!isUniqueViolation(err)) {
        throw err;
      }
      return this.classifyDedup({
        sample,
        sampleIndex,
        source,
        mapping,
        sensorId,
        canonicalTagId,
        sampleTs,
        valueStr,
        sequenceBig,
        correlationId,
      });
    }
  }

  // =========================================================================
  // Sensor / canonical-tag resolution helper (F4.6B-0 §10.2)
  // =========================================================================

  private async resolveSensorAndTag(mapping: IntegrationMapping): Promise<
    | { sensorId: string; canonicalTagId: string; error?: undefined }
    | {
        sensorId?: string | null;
        canonicalTagId?: string | null;
        error: { reason: IngestionQuarantineReason; detail: string };
      }
  > {
    const { sensorId, canonicalTagId, unitId } = mapping;

    if (sensorId && canonicalTagId) {
      return { sensorId, canonicalTagId };
    }

    if (!sensorId && canonicalTagId) {
      // Find a sensor on the mapping's unit whose active binding matches the
      // canonical_tag_id.
      const candidates = await this.prisma.sensor.findMany({
        where: {
          unitId,
          sensorTagBindings: {
            some: {
              canonicalTagId,
              effectiveTo: null,
            },
          },
        },
        select: { id: true },
        take: 2,
      });
      if (candidates.length === 0) {
        return {
          canonicalTagId,
          error: {
            reason: 'unresolved_sensor',
            detail: `no active SensorTagBinding for canonical_tag_id=${canonicalTagId} on unit_id=${unitId}`,
          },
        };
      }
      if (candidates.length > 1) {
        return {
          canonicalTagId,
          error: {
            reason: 'mapping_engine_failure',
            detail: `multiple active SensorTagBindings for canonical_tag_id=${canonicalTagId} on unit_id=${unitId} (expected one, found ${candidates.length})`,
          },
        };
      }
      const [first] = candidates;
      if (!first) {
        return {
          canonicalTagId,
          error: {
            reason: 'mapping_engine_failure',
            detail: `candidate sensor list unexpectedly empty after non-empty check for canonical_tag_id=${canonicalTagId}`,
          },
        };
      }
      return { sensorId: first.id, canonicalTagId };
    }

    if (sensorId && !canonicalTagId) {
      const binding = await this.prisma.sensorTagBinding.findFirst({
        where: { sensorId, effectiveTo: null },
        select: { canonicalTagId: true },
      });
      if (!binding) {
        return {
          sensorId,
          error: {
            reason: 'unresolved_tag',
            detail: `no active SensorTagBinding for sensor_id=${sensorId}`,
          },
        };
      }
      return { sensorId, canonicalTagId: binding.canonicalTagId };
    }

    // Both null on the mapping: cannot resolve.
    return {
      error: {
        reason: 'unresolved_sensor',
        detail: 'IntegrationMapping has neither sensor_id nor canonical_tag_id set',
      },
    };
  }

  // =========================================================================
  // Dedup classification (F4.6B-0 §12)
  // =========================================================================

  private async classifyDedup(args: {
    sample: IngestTelemetrySampleInput;
    sampleIndex: number;
    source: IntegrationSource;
    mapping: IntegrationMapping;
    sensorId: string;
    canonicalTagId: string;
    sampleTs: Date;
    valueStr: string;
    sequenceBig: bigint | null;
    correlationId: string | undefined;
  }): Promise<IngestTelemetrySampleResult> {
    const {
      sample,
      sampleIndex,
      source,
      mapping,
      sensorId,
      canonicalTagId,
      sampleTs,
      valueStr,
      sequenceBig,
      correlationId,
    } = args;

    const existing =
      sequenceBig !== null
        ? await this.prisma.telemetryReading.findFirst({
            where: {
              integrationSourceId: source.id,
              sensorId,
              canonicalTagId,
              sequence: sequenceBig,
            },
          })
        : await this.prisma.telemetryReading.findFirst({
            where: {
              sensorId,
              canonicalTagId,
              timestamp: sampleTs,
              sequence: null,
            },
          });

    if (!existing) {
      // Unique violation but no matching row found via the dedup key. Should
      // not happen given the partial unique indexes; treat conservatively as a
      // conflict so the operator can investigate.
      const errId = await this.writeQuarantine({
        reason: 'conflict_dedup',
        reasonDetail: 'unique violation raised but no matching canonical row found via dedup key',
        sample,
        correlationId,
        tenantId: source.tenantId,
        integrationSourceId: source.id,
        integrationMappingId: mapping.id,
        unitId: mapping.unitId,
        sensorId,
        canonicalTagId,
      });
      return {
        sampleIndex,
        outcome: 'conflict_quarantined',
        telemetryIngestionErrorId: errId,
        reason: 'conflict_dedup',
        reasonDetail: 'unique violation raised but no matching canonical row found via dedup key',
      };
    }

    const incomingSource = source.kind;
    const existingValueStr = existing.value.toString();
    const identical =
      existing.engineeringUnit === sample.engineeringUnit &&
      existing.quality === sample.quality &&
      existing.source === incomingSource &&
      existingValueStr === valueStr;

    if (identical) {
      return { sampleIndex, outcome: 'duplicate' };
    }

    const conflictDetail = `existing.value=${existingValueStr} incoming.value=${valueStr}`;
    const errId = await this.writeQuarantine({
      reason: 'conflict_dedup',
      reasonDetail: conflictDetail,
      sample,
      correlationId,
      tenantId: source.tenantId,
      integrationSourceId: source.id,
      integrationMappingId: mapping.id,
      unitId: mapping.unitId,
      sensorId,
      canonicalTagId,
      metadataOverride: {
        existing: {
          telemetryReadingId: existing.id,
          value: existingValueStr,
          engineeringUnit: existing.engineeringUnit,
          quality: existing.quality,
          source: existing.source,
          timestamp: existing.timestamp.toISOString(),
        },
        incoming: {
          value: valueStr,
          engineeringUnit: sample.engineeringUnit,
          quality: sample.quality,
          source: incomingSource,
          timestamp: sampleTs.toISOString(),
        },
      },
    });
    return {
      sampleIndex,
      outcome: 'conflict_quarantined',
      telemetryIngestionErrorId: errId,
      reason: 'conflict_dedup',
      reasonDetail: conflictDetail,
    };
  }

  // =========================================================================
  // Quarantine writes
  // =========================================================================

  private async writeQuarantine(args: {
    reason: IngestionQuarantineReason;
    reasonDetail: string;
    sample: IngestTelemetrySampleInput;
    correlationId: string | undefined;
    tenantId: string | null;
    integrationSourceId: string | null;
    integrationMappingId: string | null;
    unitId: string | null;
    sensorId: string | null;
    canonicalTagId: string | null;
    metadataOverride?: Prisma.InputJsonValue;
  }): Promise<string> {
    const {
      reason,
      reasonDetail,
      sample,
      correlationId,
      tenantId,
      integrationSourceId,
      integrationMappingId,
      unitId,
      sensorId,
      canonicalTagId,
      metadataOverride,
    } = args;

    // value: store only when it parses to a finite number; otherwise leave
    // null on the quarantine row so the Decimal CHECK is not violated.
    const valueStr = typeof sample.value === 'number' ? String(sample.value) : sample.value;
    const valueIsNumeric = Number.isFinite(Number(valueStr));

    // timestamp: store only when it parses; otherwise null.
    let storedTimestamp: Date | null = null;
    const parsedTs = new Date(sample.timestamp);
    if (!Number.isNaN(parsedTs.getTime())) {
      storedTimestamp = parsedTs;
    }

    const baseMetadata: Record<string, unknown> = {};
    if (sample.metadata !== undefined) {
      baseMetadata.sample = sample.metadata;
    }
    if (metadataOverride !== undefined) {
      baseMetadata.dedup = metadataOverride;
    }
    const metadataValue: Prisma.InputJsonValue | undefined =
      Object.keys(baseMetadata).length > 0 ? (baseMetadata as Prisma.InputJsonValue) : undefined;

    const rawPayloadValue =
      sample.rawPayload !== undefined ? (sample.rawPayload as Prisma.InputJsonValue) : undefined;

    const created = await this.prisma.telemetryIngestionError.create({
      data: {
        tenantId,
        integrationSourceId,
        integrationMappingId,
        unitId,
        sensorId,
        canonicalTagId,
        externalIdentifier: sample.externalIdentifier,
        timestamp: storedTimestamp,
        reason,
        reasonDetail,
        quality: sample.quality,
        engineeringUnit: sample.engineeringUnit,
        value: valueIsNumeric ? new Prisma.Decimal(valueStr) : null,
        rawPayload: rawPayloadValue ?? Prisma.JsonNull,
        metadata: metadataValue ?? Prisma.JsonNull,
        correlationId: correlationId ?? null,
      },
      select: { id: true },
    });
    return created.id;
  }

  private async quarantineResult(args: {
    sampleIndex: number;
    reason: IngestionQuarantineReason;
    reasonDetail: string;
    sample: IngestTelemetrySampleInput;
    correlationId: string | undefined;
    tenantId: string | null;
    integrationSourceId: string | null;
    integrationMappingId: string | null;
    unitId: string | null;
    sensorId: string | null;
    canonicalTagId: string | null;
  }): Promise<IngestTelemetrySampleResult> {
    const errId = await this.writeQuarantine(args);
    return {
      sampleIndex: args.sampleIndex,
      outcome: 'rejected_quarantined',
      telemetryIngestionErrorId: errId,
      reason: args.reason,
      reasonDetail: args.reasonDetail,
    };
  }

  // =========================================================================
  // Aggregation
  // =========================================================================

  private aggregate(
    batchId: string,
    correlationId: string | undefined,
    results: IngestTelemetrySampleResult[],
  ): IngestTelemetryBatchResult {
    let acceptedCount = 0;
    let duplicateCount = 0;
    let conflictQuarantinedCount = 0;
    let rejectedQuarantinedCount = 0;
    let rejectedRequestCount = 0;
    for (const r of results) {
      switch (r.outcome) {
        case 'accepted':
          acceptedCount++;
          break;
        case 'duplicate':
          duplicateCount++;
          break;
        case 'conflict_quarantined':
          conflictQuarantinedCount++;
          break;
        case 'rejected_quarantined':
          rejectedQuarantinedCount++;
          break;
        case 'rejected_request':
          rejectedRequestCount++;
          break;
      }
    }
    return {
      batchId,
      correlationId,
      acceptedCount,
      duplicateCount,
      conflictQuarantinedCount,
      rejectedQuarantinedCount,
      rejectedRequestCount,
      results,
    };
  }
}

// =============================================================================
// Helpers
// =============================================================================

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
