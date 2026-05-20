import { Module } from '@nestjs/common';

import { CanonicalTagResolver } from './canonical-tag-resolver';
import { TelemetryController } from './telemetry.controller';
import { TelemetryValidator } from './telemetry.validator';
import { TrendsService } from './trends.service';
import { UnitConverter } from './unit-converter';

/**
 * TelemetryModule — F1.5 prep.
 *
 * Bundles the engineering foundations:
 *   - TelemetryValidator     (shape-only, no transform)
 *   - UnitConverter          (query-time conversion, never at ingest)
 *   - CanonicalTagResolver   (frozen-snapshot interpretation)
 *   - TrendsService          (read-only query routing: raw + 1m/15m/1h)
 *   - TelemetryController    (placeholder routes; all 501 until F2)
 *
 * No realtime, no ingest yet — see docs/architecture/telemetry-pipeline.md
 * for the F2 surface.
 */
@Module({
  controllers: [TelemetryController],
  providers: [TelemetryValidator, UnitConverter, CanonicalTagResolver, TrendsService],
  exports: [TelemetryValidator, UnitConverter, CanonicalTagResolver, TrendsService],
})
export class TelemetryModule {}
