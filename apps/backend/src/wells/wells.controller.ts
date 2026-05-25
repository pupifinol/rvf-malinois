import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { SystemContext } from '../common/caller-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

import { WellsService } from './wells.service';

const ListQuerySchema = z
  .object({
    tenantId: z.string().uuid().optional(),
    fieldOrSite: z.string().min(1).max(200).optional(),
    type: z.string().min(1).max(60).optional(),
    fluid: z.string().min(1).max(60).optional(),
  })
  .strict();

@ApiTags('wells')
@Controller('wells')
export class WellsController {
  constructor(private readonly wells: WellsService) {}

  @Get()
  @ApiOperation({
    summary: 'List wells',
    description:
      'Read-only. Returns every well visible to the caller. Optional filters: ' +
      '`tenantId` (UUID), `fieldOrSite`, `type`, `fluid`. When a server-derived ' +
      'tenant scope is set on the caller context, the `tenantId` query parameter ' +
      'is ignored (the scope wins).',
  })
  @ApiQuery({ name: 'tenantId', required: false, description: 'UUID' })
  @ApiQuery({ name: 'fieldOrSite', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'fluid', required: false })
  list(@Query(new ZodValidationPipe(ListQuerySchema)) query: z.infer<typeof ListQuerySchema>) {
    return this.wells.findAll(SystemContext, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a well by its UUID' })
  @ApiParam({ name: 'id', example: '00000000-0000-0000-0000-000000004401', format: 'uuid' })
  one(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.wells.findById(SystemContext, id);
  }
}
