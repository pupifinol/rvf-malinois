import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TenantKind } from '@prisma/client';
import { z } from 'zod';

import { SystemContext } from '../common/caller-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

import { TenantsService } from './tenants.service';

const ListQuerySchema = z
  .object({
    kind: z.nativeEnum(TenantKind).optional(),
  })
  .strict();

@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  @ApiOperation({
    summary: 'List tenants',
    description: 'F1 read-only. Server-derived tenant scope (auth) lands in F1.5.',
  })
  @ApiQuery({ name: 'kind', enum: TenantKind, required: false })
  list(@Query(new ZodValidationPipe(ListQuerySchema)) query: z.infer<typeof ListQuerySchema>) {
    return this.tenants.findAll(SystemContext, query);
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get a tenant by its code' })
  @ApiParam({ name: 'code', example: 'repsol' })
  one(@Param('code') code: string) {
    return this.tenants.findByCode(SystemContext, code);
  }
}
