import { Module } from '@nestjs/common';

import { LiveReadingsProjectionService } from '../projection/live-readings-projection.service';

import { TelemetryIngestionController } from './telemetry-ingestion.controller';
import { TelemetryIngestionService } from './telemetry-ingestion.service';

/**
 * TelemetryIngestionModule — F4.6B.1 + F4.6C.1.
 *
 * Carries the single internal `POST /api/v1/telemetry/ingest` endpoint, the
 * `TelemetryIngestionService` that owns the boundary's persistence +
 * quarantine logic, and (F4.6C.1) the `LiveReadingsProjectionService` that
 * maintains the `live_readings` upsert-projection from accepted `good`
 * telemetry.
 *
 * This module is **conditionally registered** in `AppModule.imports` based on
 * `process.env.RVF_INGEST_ENABLED === 'true'` (F4.6B-0 §8.2). When the flag is
 * unset, Nest never instantiates the module: the controller is not mounted,
 * neither service is constructed, and the route does not appear in Swagger.
 * The endpoint returns Nest's default 404 in that state.
 *
 * `PrismaService` is provided by the `@Global()` `PrismaModule` registered in
 * `AppModule`, so it is injected here without an explicit `imports` entry.
 *
 * **F4.6C.1 addition:** `LiveReadingsProjectionService` is provided as an
 * internal collaborator of `TelemetryIngestionService`. It has no controller
 * and no public API surface; consumers outside the ingestion flow do not
 * import it. F4.6D / F4.6E will introduce their own collaborators using the
 * same pattern when they arrive.
 *
 * This module deliberately does NOT import or wire:
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
  providers: [TelemetryIngestionService, LiveReadingsProjectionService],
  exports: [TelemetryIngestionService],
})
export class TelemetryIngestionModule {}
