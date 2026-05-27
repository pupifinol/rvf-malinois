import { Module } from '@nestjs/common';

import { AlarmEvaluationService } from '../../alarms/alarm-evaluation.service';
import { RealtimeModule } from '../../realtime/realtime.module';
import { LiveReadingsProjectionService } from '../projection/live-readings-projection.service';

import { TelemetryIngestionController } from './telemetry-ingestion.controller';
import { TelemetryIngestionService } from './telemetry-ingestion.service';

/**
 * TelemetryIngestionModule — F4.6B.1 + F4.6C.1 + F4.6D.1.
 *
 * Carries the single internal `POST /api/v1/telemetry/ingest` endpoint, the
 * `TelemetryIngestionService` that owns the boundary's persistence +
 * quarantine logic, the `LiveReadingsProjectionService` (F4.6C.1) that
 * maintains the `live_readings` upsert-projection from accepted `good`
 * telemetry, and the `AlarmEvaluationService` (F4.6D.1) that evaluates the
 * same accepted readings against `alarm_rules` and persists `alarm_events`.
 *
 * This module is **conditionally registered** in `AppModule.imports` based on
 * `process.env.RVF_INGEST_ENABLED === 'true'` (F4.6B-0 §8.2). When the flag is
 * unset, Nest never instantiates the module: the controller is not mounted,
 * none of the services are constructed, and the route does not appear in
 * Swagger. The endpoint returns Nest's default 404 in that state.
 *
 * `PrismaService` is provided by the `@Global()` `PrismaModule` registered in
 * `AppModule`, so it is injected here without an explicit `imports` entry.
 *
 * **F4.6D.1 addition:** `AlarmEvaluationService` is provided as an internal
 * collaborator of `TelemetryIngestionService`, alongside
 * `LiveReadingsProjectionService`. It has no controller and no public API
 * surface (per F4.6D-0 §11). Consumers outside the ingestion flow do not
 * import it. F4.6E will introduce its own collaborator using the same
 * pattern when it arrives.
 *
 * This module deliberately does NOT import or wire:
 *   - any realtime / WebSocket / SSE publisher (owned by F4.6E);
 *   - any alarm-lifecycle / acknowledge / clear logic (deferred);
 *   - any notification / escalation / webhook sender (deferred);
 *   - any external adapter / bridge (MQTT / Modbus / OPC-UA / ThingsBoard /
 *     Node-RED / PLC / historian — each is its own future phase).
 *
 * It also does NOT introduce no-op stand-in providers for the above seams;
 * that wiring belongs to the phase that owns the concern (F4.6B-0 §14).
 */
@Module({
  imports: [RealtimeModule],
  controllers: [TelemetryIngestionController],
  providers: [TelemetryIngestionService, LiveReadingsProjectionService, AlarmEvaluationService],
  exports: [TelemetryIngestionService],
})
export class TelemetryIngestionModule {}
