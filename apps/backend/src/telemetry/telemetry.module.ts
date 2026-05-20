import { Module } from '@nestjs/common';

import { CanonicalTagResolver } from './canonical-tag-resolver';
import { TelemetryValidator } from './telemetry.validator';
import { UnitConverter } from './unit-converter';

/**
 * TelemetryModule — F1.5 prep.
 *
 * Bundles the three engineering foundations:
 *   - TelemetryValidator     (shape-only, no transform)
 *   - UnitConverter          (query-time conversion, never at ingest)
 *   - CanonicalTagResolver   (frozen-snapshot interpretation)
 *
 * F1.5.3 will add TrendsService. F1.5.5 will mount the placeholder
 * controller. No HTTP routes, no realtime, no ingest yet.
 */
@Module({
  providers: [TelemetryValidator, UnitConverter, CanonicalTagResolver],
  exports: [TelemetryValidator, UnitConverter, CanonicalTagResolver],
})
export class TelemetryModule {}
