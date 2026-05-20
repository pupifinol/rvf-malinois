import { Module } from '@nestjs/common';

import { CanonicalTagResolver } from './canonical-tag-resolver';
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
 *
 * F1.5.5 will mount the placeholder controller. No HTTP routes, no
 * realtime, no ingest yet.
 */
@Module({
  providers: [TelemetryValidator, UnitConverter, CanonicalTagResolver, TrendsService],
  exports: [TelemetryValidator, UnitConverter, CanonicalTagResolver, TrendsService],
})
export class TelemetryModule {}
