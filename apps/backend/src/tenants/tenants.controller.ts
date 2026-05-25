import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { SystemContext } from '../common/caller-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

import { TENANT_STATUSES, TenantsService } from './tenants.service';

const ListQuerySchema = z
  .object({
    status: z.enum(TENANT_STATUSES).optional(),
  })
  .strict();

@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  @ApiOperation({
    summary: 'List tenants',
    description:
      'Read-only. Server-derived tenant scope (auth) lands in a later phase; ' +
      'until then every tenant is visible. Optional `status` filter mirrors the ' +
      'F4 CHECK constraint on tenants.status (active | inactive).',
  })
  @ApiQuery({ name: 'status', enum: TENANT_STATUSES, required: false })
  list(@Query(new ZodValidationPipe(ListQuerySchema)) query: z.infer<typeof ListQuerySchema>) {
    return this.tenants.findAll(SystemContext, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a tenant by its UUID' })
  @ApiParam({ name: 'id', example: '00000000-0000-0000-0000-000000000001', format: 'uuid' })
  one(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.tenants.findById(SystemContext, id);
  }
}
