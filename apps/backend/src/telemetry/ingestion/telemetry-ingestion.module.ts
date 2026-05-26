import { Module } from '@nestjs/common';

import { TelemetryIngestionController } from './telemetry-ingestion.controller';
import { TelemetryIngestionService } from './telemetry-ingestion.service';

/**
 * TelemetryIngestionModule — F4.6B.1.
 *
 * Carries the single internal `POST /api/v1/telemetry/ingest` endpoint and the
 * `TelemetryIngestionService` that owns the boundary's persistence + quarantine
 * logic.
 *
 * This module is **conditionally registered** in `AppModule.imports` based on
 * `process.env.RVF_INGEST_ENABLED === 'true'` (F4.6B-0 §8.2). When the flag is
 * unset, Nest never instantiates the module: the controller is not mounted,
 * the service is not constructed, and the route does not appear in Swagger.
 * The endpoint returns Nest's default 404 in that state.
 *
 * `PrismaService` is provided by the `@Global()` `PrismaModule` registered in
 * `AppModule`, so it is injected here without an explicit `imports` entry.
 *
 * F4.6B.1 deliberately does NOT import or wire:
 *   - any projection module / live-readings updater (owned by F4.6C);
 *   - any alarm evaluator / alarm-events writer (owned by F4.6D);
 *   - any realtime / WebSocket / SSE publisher (owned by F4.6E);
 *   - any external adapter / bridge (MQTT / Modbus / OPC-UA / ThingsBoard /
 *     Node-RED / PLC / historian — each is its own future phase).
 *
 * It also does NOT introduce no-op stand-in providers for the above seams;
 * that wiring belongs to the phase that owns the concern (F4.6B-0 §14).
 */
@Module({
  controllers: [TelemetryIngestionController],
  providers: [TelemetryIngestionService],
  exports: [TelemetryIngestionService],
})
export class TelemetryIngestionModule {}
