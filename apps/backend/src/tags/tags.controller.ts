import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { CanonicalTagsService } from './tags.service';

@ApiTags('canonical-tags')
@Controller('tags')
export class CanonicalTagsController {
  constructor(private readonly tags: CanonicalTagsService) {}

  @Get()
  @ApiOperation({
    summary: 'List the canonical tag dictionary',
    description:
      "RVF's global canonical tag list (telemetry-foundation §9). The dictionary is not tenant-scoped.",
  })
  list() {
    return this.tags.findAll();
  }

  @Get(':name')
  @ApiOperation({ summary: 'Get a single canonical tag by name' })
  @ApiParam({ name: 'name', example: 'p_inlet' })
  one(@Param('name') name: string) {
    return this.tags.findByName(name);
  }
}
