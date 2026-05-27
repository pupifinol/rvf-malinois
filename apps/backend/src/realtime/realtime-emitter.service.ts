import { Injectable, Logger } from '@nestjs/common';

import { RealtimeGateway } from './realtime.gateway';

import type {
  AlarmEventCreatedPayload,
  LiveReadingUpdatedPayload,
  RealtimeF4Event,
  TelemetryReadingAcceptedPayload,
} from '@rvf/types';

/**
 * Discriminated union of in-memory emit descriptors collected by the ingestion
 * service inside `prisma.$transaction` and handed to `emitMany` AFTER the
 * transaction has successfully committed (F4.6E-0 §10).
 *
 * Distinct from the wire envelope `RealtimeF4Event` in `@rvf/types`: this is
 * the internal contract between `TelemetryIngestionService` and
 * `RealtimeEmitterService`; the wire envelope wraps it with `schema` and
 * `emittedAt` at fan-out time.
 */
export type PendingRealtimeEmit =
  | { kind: 'telemetry.reading.accepted'; payload: TelemetryReadingAcceptedPayload }
  | { kind: 'live_reading.updated'; payload: LiveReadingUpdatedPayload }
  | { kind: 'alarm.event.created'; payload: AlarmEventCreatedPayload };

/**
 * RealtimeEmitterService — F4.6E.1.
 *
 * Backend-owned fan-out collaborator. **First backend collaborator authorized
 * to emit business events from `RealtimeGateway.server`.** Implements the
 * F4.6E-0 plan:
 *   - emits **only** after the per-sample ingestion transaction successfully
 *     commits (the caller is responsible for collecting descriptors inside
 *     the transaction and invoking `emitMany` after `$transaction` resolves);
 *   - emits to **per-tenant rooms only** (`tenant:${tenantId}`) — per-unit
 *     rooms are joined on subscribe but not yet used as a fan-out target
 *     (forward-compat seam per F4.6E-0 §9.1);
 *   - **best-effort**: per-event try/catch; a single bad emit cannot block
 *     the rest of the batch and nothing is thrown out to the caller — the
 *     persisted state is the source of truth (ADR-008 §3 decision 5);
 *   - **env-gated** by `RVF_REALTIME_EMIT_ENABLED`. When the env var is not
 *     the string `'true'`, `emitMany` no-ops (one-time logged warning). The
 *     gateway itself stays addressable: subscribers can still connect, the
 *     `connection` greeting still fires, and `ping`/`pong` still works.
 *     Mirrors the F4.6B.1 `RVF_INGEST_ENABLED` env-gate posture.
 *
 * **What this service does NOT do:**
 *   - **No Prisma access.** Every field on the emit descriptor comes from
 *     the caller (the ingestion service) inside the transaction.
 *   - **No alarm-lifecycle, no acknowledge/clear emits.** F4.6E.1 only
 *     surfaces `alarm.event.created` for `state='active'` rows. Lifecycle
 *     transitions are owned by a future F4.6D.3 sub-phase.
 *   - **No SSE.** Socket.IO over WebSocket is the only transport per
 *     F4.6E-0 §6. SSE remains a candidate F4.6E.2 if a use case appears.
 *   - **No multi-replica adapter (Redis et al).** Single-process emit only.
 *     A future F4.6E.3 sub-phase adds `@socket.io/redis-adapter` when a
 *     second replica appears.
 *   - **No replay buffer / last-event-id resync.** REST reconnect against
 *     `telemetry_readings` / `live_readings` / `alarm_events` is the
 *     recovery path. See F4.6E-0 §12.
 *   - **No coalescing / throttling / batching.** Future F4.6E.4 if real
 *     backpressure is observed.
 *   - **No auth / per-channel authorization.** Inherits the project-wide
 *     no-auth posture; candidate ADR-009 + dedicated phase owns auth.
 */
@Injectable()
export class RealtimeEmitterService {
  private readonly logger = new Logger(RealtimeEmitterService.name);
  private warnedDisabled = false;

  constructor(private readonly gateway: RealtimeGateway) {}

  /**
   * Fan out a batch of post-commit emit descriptors. Best-effort.
   *
   * @param events Descriptors collected by the caller inside the per-sample
   *               `prisma.$transaction`, after the transaction has resolved
   *               successfully. The caller must NOT invoke this method on
   *               failure paths (rollback / duplicate / conflict / rejected).
   */
  emitMany(events: readonly PendingRealtimeEmit[]): void {
    if (!isEmissionEnabled()) {
      if (!this.warnedDisabled && events.length > 0) {
        this.logger.warn(
          'RVF_REALTIME_EMIT_ENABLED is not "true" — fan-out is disabled. ' +
            'Gateway remains addressable; subscribers still get the connection greeting and ping/pong. ' +
            'Suppressing this warning for subsequent emits.',
        );
        this.warnedDisabled = true;
      }
      return;
    }

    const emittedAt = new Date().toISOString();

    for (const event of events) {
      try {
        const envelope: RealtimeF4Event = wrapEnvelope(event, emittedAt);
        const room = `tenant:${event.payload.tenantId}`;
        this.gateway.server.to(room).emit(event.kind, envelope);
      } catch (err) {
        // Per F4.6E-0 §10.4 — emit is best-effort. Logging only; never thrown
        // out so the ingestion outcome the caller sees stays accurate.
        this.logger.error(
          {
            err: err instanceof Error ? { name: err.name, message: err.message } : String(err),
            kind: event.kind,
            tenantId: event.payload.tenantId,
          },
          'realtime_emit_failed',
        );
      }
    }
  }
}

function isEmissionEnabled(): boolean {
  return process.env.RVF_REALTIME_EMIT_ENABLED === 'true';
}

/**
 * Wrap an in-memory emit descriptor in the wire envelope (`schema`, `kind`,
 * `emittedAt`, `payload`). Pure; no side effects.
 */
function wrapEnvelope(event: PendingRealtimeEmit, emittedAt: string): RealtimeF4Event {
  switch (event.kind) {
    case 'telemetry.reading.accepted':
      return {
        schema: 'rvf.realtime.v1',
        kind: 'telemetry.reading.accepted',
        emittedAt,
        payload: event.payload,
      };
    case 'live_reading.updated':
      return {
        schema: 'rvf.realtime.v1',
        kind: 'live_reading.updated',
        emittedAt,
        payload: event.payload,
      };
    case 'alarm.event.created':
      return {
        schema: 'rvf.realtime.v1',
        kind: 'alarm.event.created',
        emittedAt,
        payload: event.payload,
      };
  }
}
