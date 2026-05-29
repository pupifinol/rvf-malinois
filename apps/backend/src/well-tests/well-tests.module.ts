import { Module } from '@nestjs/common';

import { WellTestsController } from './well-tests.controller';
import { WellTestsService } from './well-tests.service';

/**
 * WellTestsModule — F4.7.1.
 *
 * Wires the new `GET /api/v1/well-tests` (+ `/:id`, `/active`) read surface
 * and the small write + transition surface (`POST /well-tests` plus 6
 * lifecycle-transition endpoints) over the new `well_tests` table. No
 * non-Prisma dependency. Read-only access to the global `PrismaService` is
 * sufficient.
 *
 * Per F4.7-0 §12.3, this module does **not** import `TelemetryModule`,
 * `AlarmsModule`, or `JobsModule` — `WellTest` joins `Job` / `Well` /
 * `MeasurementUnit` purely through Prisma relations. No cross-module service
 * coupling is introduced.
 */
@Module({
  controllers: [WellTestsController],
  providers: [WellTestsService],
  exports: [WellTestsService],
})
export class WellTestsModule {}
