import { Module } from '@nestjs/common';

import { CommissioningService } from './commissioning.service';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  controllers: [JobsController],
  providers: [JobsService, CommissioningService],
  exports: [JobsService, CommissioningService],
})
export class JobsModule {}
