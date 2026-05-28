import { Module } from '@nestjs/common';

import { CanonicalTagResolver } from './canonical-tag-resolver';
import { LatestService } from './latest.service';
import { TelemetryController } from './telemetry.controller';
import { TrendsService } from './trends.service';
import { UnitConverter } from './unit-converter';

/**
 * TelemetryModule — F4.4F (read-only trends).
 *
 * Wires the single read endpoint `GET /api/v1/telemetry/trends` against
 * `telemetry_readings`. The F1 surface (validator + ingestion-adapter
 * contract + last-value cache + hypertable continuous aggregates) is
 * retired pending F4.6 (telemetry persistence / ingestion).
 *
 * `UnitConverter` is pure math (F4-clean, no Prisma) and is retained as a
 * provider so that future write- or projection-layer code can depend on it
 * without re-discovery; F4.4F's trend endpoint does not call it.
 */
@Module({
  controllers: [TelemetryController],
  providers: [CanonicalTagResolver, TrendsService, LatestService, UnitConverter],
  exports: [CanonicalTagResolver, TrendsService, LatestService, UnitConverter],
})
export class TelemetryModule {}
