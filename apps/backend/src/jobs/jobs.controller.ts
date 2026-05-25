import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { SystemContext } from '../common/caller-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

import { JOB_STATUSES, JobsService } from './jobs.service';

const ListQuerySchema = z
  .object({
    tenantId: z.string().uuid().optional(),
    wellId: z.string().uuid().optional(),
    unitId: z.string().uuid().optional(),
    status: z.enum(JOB_STATUSES).optional(),
  })
  .strict();

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  @ApiOperation({
    summary: 'List jobs',
    description:
      'F4 §F Job; ADR-005. Read-only. Optional filters: `tenantId` (UUID), ' +
      '`wellId` (UUID), `unitId` (UUID), `status` (programmed | in_progress | ' +
      'closed). When a server-derived tenant scope is set on the caller ' +
      'context, the `tenantId` query parameter is ignored. Ordered by ' +
      '`startedAt desc nulls last` then `createdAt desc`. The list endpoint ' +
      'returns a small `tenant` / `well` / `unit` summary per row; the full ' +
      'detail (well design limits, equipment type, engineer, current ' +
      'commissioning snapshot) comes back on the by-id endpoint.',
  })
  @ApiQuery({ name: 'tenantId', required: false, description: 'UUID' })
  @ApiQuery({ name: 'wellId', required: false, description: 'UUID' })
  @ApiQuery({ name: 'unitId', required: false, description: 'UUID' })
  @ApiQuery({ name: 'status', required: false, enum: JOB_STATUSES })
  list(@Query(new ZodValidationPipe(ListQuerySchema)) query: z.infer<typeof ListQuerySchema>) {
    return this.jobs.findAll(SystemContext, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a job by its UUID',
    description:
      'Detail response includes: tenant summary, well (with design limits), ' +
      'measurement unit (with its equipment type), engineer placeholder, and ' +
      'the current commissioning snapshot (the row pointed at by ' +
      '`jobs.commissioning_snapshot_id`). Telemetry readings, live readings, ' +
      'alarm events, and reports are NOT included (F4.4F / F4.6 own those reads).',
  })
  @ApiParam({ name: 'id', example: '00000000-0000-0000-0000-000000004444', description: 'UUID' })
  one(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.jobs.findById(SystemContext, id);
  }
}
