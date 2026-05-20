import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JobStatus } from '@prisma/client';
import { z } from 'zod';

import { SystemContext } from '../common/caller-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

import { JobsService } from './jobs.service';

const ListQuerySchema = z
  .object({
    tenantCode: z.string().min(1).max(64).optional(),
    status: z.nativeEnum(JobStatus).optional(),
  })
  .strict();

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  @ApiOperation({
    summary: 'List jobs',
    description: 'F1 read-only. Filter by tenant and/or lifecycle status.',
  })
  @ApiQuery({ name: 'tenantCode', required: false, example: 'repsol' })
  @ApiQuery({ name: 'status', required: false, enum: JobStatus })
  list(@Query(new ZodValidationPipe(ListQuerySchema)) query: z.infer<typeof ListQuerySchema>) {
    return this.jobs.findAll(SystemContext, query);
  }

  @Get(':code')
  @ApiOperation({
    summary: 'Get a single job by code',
    description:
      'Includes its tenant, well, equipment unit, commissioning snapshot, frozen sensor snapshots and alarm rules.',
  })
  @ApiParam({ name: 'code', example: 'JOB-2026-0001' })
  one(@Param('code') code: string) {
    return this.jobs.findByCode(SystemContext, code);
  }
}
