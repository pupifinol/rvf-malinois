import { Module } from '@nestjs/common';

import { CanonicalTagsController } from './tags.controller';
import { CanonicalTagsService } from './tags.service';

@Module({
  controllers: [CanonicalTagsController],
  providers: [CanonicalTagsService],
  exports: [CanonicalTagsService],
})
export class CanonicalTagsModule {}
