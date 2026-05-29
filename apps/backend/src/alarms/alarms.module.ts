import { Module } from '@nestjs/common';

import { TelemetryModule } from '../telemetry/telemetry.module';

import { AlarmEventsReadService } from './alarm-events-read.service';
import { AlarmsController } from './alarms.controller';

/**
 * AlarmsModule — F4.6D.2.1.
 *
 * Wires the new read-only `GET /api/v1/alarms/events` endpoint against
 * `alarm_events`. Imports `TelemetryModule` to reuse the existing
 * `CanonicalTagResolver` (the `canonicalTagName` resolution path mirrors
 * trends / latest).
 *
 * Intentionally does **not** re-register `AlarmEvaluationService` (F4.6D.1)
 * — that service remains provided by `TelemetryIngestionModule` so the
 * ingestion transaction can inject it directly. F4.6D.2-0 §6.2 names this
 * as a deliberate decision to avoid churn against F4.6D.1's existing wiring
 * and tests. The new `AlarmEventsReadService` is the **second** backend
 * collaborator authorized to touch `prisma.alarmEvent.*` — **read-only**.
 */
@Module({
  imports: [TelemetryModule],
  controllers: [AlarmsController],
  providers: [AlarmEventsReadService],
  exports: [AlarmEventsReadService],
})
export class AlarmsModule {}
