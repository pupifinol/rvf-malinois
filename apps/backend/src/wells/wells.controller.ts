import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { SystemContext } from '../common/caller-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

import { WellsService } from './wells.service';

const ListQuerySchema = z
  .object({
    tenantCode: z.string().min(1).max(64).optional(),
  })
  .strict();

@ApiTags('wells')
@Controller('wells')
export class WellsController {
  constructor(private readonly wells: WellsService) {}

  @Get()
  @ApiOperation({ summary: 'List wells (optionally filtered by tenant)' })
  @ApiQuery({ name: 'tenantCode', required: false, example: 'repsol' })
  list(@Query(new ZodValidationPipe(ListQuerySchema)) query: z.infer<typeof ListQuerySchema>) {
    return this.wells.findAll(SystemContext, query);
  }

  @Get(':tenantCode/:code')
  @ApiOperation({
    summary: 'Get a single well',
    description: 'Well codes are unique per tenant, so the path requires both.',
  })
  @ApiParam({ name: 'tenantCode', example: 'repsol' })
  @ApiParam({ name: 'code', example: 'CN-014' })
  one(@Param('tenantCode') tenantCode: string, @Param('code') code: string) {
    return this.wells.findByCode(SystemContext, tenantCode, code);
  }
}
