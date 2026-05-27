import { Module } from '@nestjs/common';

import { RealtimeEmitterService } from './realtime-emitter.service';
import { RealtimeGateway } from './realtime.gateway';

/**
 * RealtimeModule — F0/F2 scaffold + F4.6E.1 fan-out.
 *
 * Provides the Socket.IO `RealtimeGateway` (always-on; accepts connections,
 * serves the `connection` greeting, replies to `ping`, and — as of F4.6E.1 —
 * handles `subscribe` / `unsubscribe` for per-tenant rooms), plus the
 * `RealtimeEmitterService` that targets those rooms with business events
 * emitted by `TelemetryIngestionService` AFTER the per-sample
 * `prisma.$transaction` resolves.
 *
 * Both services are exported so the (conditionally registered)
 * `TelemetryIngestionModule` can inject the emitter without re-providing
 * either; `AppModule` imports `RealtimeModule` unconditionally so the
 * gateway is always addressable, regardless of `RVF_INGEST_ENABLED` /
 * `RVF_REALTIME_EMIT_ENABLED`.
 */
@Module({
  providers: [RealtimeGateway, RealtimeEmitterService],
  exports: [RealtimeGateway, RealtimeEmitterService],
})
export class RealtimeModule {}
