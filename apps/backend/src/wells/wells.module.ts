import { Module } from '@nestjs/common';

import { WellsController } from './wells.controller';
import { WellsService } from './wells.service';

@Module({
  controllers: [WellsController],
  providers: [WellsService],
  exports: [WellsService],
})
export class WellsModule {}
