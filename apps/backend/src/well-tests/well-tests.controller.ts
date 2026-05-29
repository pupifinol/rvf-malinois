import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';

import { SystemContext } from '../common/caller-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

import {
  AbortWellTestSchema,
  CloseWellTestSchema,
  CreateWellTestSchema,
  TransitionWellTestSchema,
  WELL_TESTS_LIMIT_DEFAULT,
  WELL_TESTS_LIMIT_MAX,
  WELL_TEST_LIFECYCLE_STATUSES,
  WELL_TEST_TYPES,
  WellTestsActiveQuerySchema,
  WellTestsListQuerySchema,
  type AbortWellTestInput,
  type CloseWellTestInput,
  type CreateWellTestInput,
  type TransitionWellTestInput,
  type WellTestsActiveQuery,
  type WellTestsListQuery,
} from './contracts/well-tests';
import { WellTestsService } from './well-tests.service';

@ApiTags('well-tests')
@Controller('well-tests')
export class WellTestsController {
  constructor(private readonly wellTests: WellTestsService) {}

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  @Get('active')
  @ApiOperation({
    summary: 'Current active well test for a unit',
    description:
      'F4.7.1 read of the most recent `well_tests` row in ' +
      "`'connected' | 'stabilizing' | 'measuring'` for the supplied `unitId`. " +
      'When no row matches, returns `200 OK` with `{ active: null }` — never 404.',
  })
  @ApiQuery({ name: 'unitId', required: true, description: 'UUID' })
  active(@Query(new ZodValidationPipe(WellTestsActiveQuerySchema)) query: WellTestsActiveQuery) {
    return this.wellTests.getActive(SystemContext, query.unitId);
  }

  @Get()
  @ApiOperation({
    summary: 'List well tests',
    description:
      'F4.7.1 read-only list with optional filters. Ordered by `createdAt DESC`. ' +
      'Empty list returns `200 OK` with `{ wellTests: [] }` — never 404. ' +
      'Tenant scoping is server-derived from the `CallerContext`; no ' +
      '`tenantId` query parameter is accepted. `from` and `to` (ISO-8601) ' +
      'must appear together with `from < to` and filter by ' +
      '`officialStartedAt`.',
  })
  @ApiQuery({ name: 'unitId', required: false, description: 'UUID' })
  @ApiQuery({ name: 'wellId', required: false, description: 'UUID' })
  @ApiQuery({ name: 'jobId', required: false, description: 'UUID' })
  @ApiQuery({ name: 'lifecycleStatus', required: false, enum: WELL_TEST_LIFECYCLE_STATUSES })
  @ApiQuery({ name: 'testType', required: false, enum: WELL_TEST_TYPES })
  @ApiQuery({ name: 'from', required: false, description: 'ISO-8601 timestamp' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO-8601 timestamp' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: `1..${String(WELL_TESTS_LIMIT_MAX)} (default ${String(WELL_TESTS_LIMIT_DEFAULT)})`,
  })
  list(@Query(new ZodValidationPipe(WellTestsListQuerySchema)) query: WellTestsListQuery) {
    return this.wellTests.list(SystemContext, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a well test by its UUID',
    description:
      'Detail response includes `job` / `well` / `unit` nested summaries plus ' +
      'the derived `actualOfficialDurationSeconds`. Cross-tenant lookups return ' +
      '404 (matches the F4.4E Jobs read API posture).',
  })
  @ApiParam({ name: 'id', example: '00000000-0000-0000-0000-000000007001', description: 'UUID' })
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.wellTests.getById(SystemContext, id);
  }

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  @Post()
  @ApiOperation({
    summary: 'Create a well test in `scheduled` status',
    description:
      'F4.7.1 create. Fiscalización requires `plannedOfficialDurationHours === ' +
      "24` and `reportType === 'fiscalizacion_pdf'`. Optimización requires " +
      '`plannedOfficialDurationHours BETWEEN 12 AND 24` and `reportType === ' +
      "'optimizacion_pdf'`. `wellId` / `unitId` must match the referenced " +
      "Job's `wells.id` / `measurement_units.id`. `tenantId` is server-derived " +
      'from the Job (no wire field).',
  })
  @ApiBody({ schema: { description: 'CreateWellTestInput (see contracts/well-tests.ts)' } })
  create(@Body(new ZodValidationPipe(CreateWellTestSchema)) body: CreateWellTestInput) {
    return this.wellTests.create(SystemContext, body);
  }

  // ---------------------------------------------------------------------------
  // Transitions
  // ---------------------------------------------------------------------------

  @Post(':id/connect')
  @ApiOperation({
    summary: 'Transition: scheduled → connected',
    description:
      'Marks the unit as connected to the well via the three-valve bypass. ' +
      'Records `connectedAt = now()` server-side. Rejected with `409 Conflict` ' +
      'when the unit already has another active test row (in `connected | ' +
      'stabilizing | measuring`).',
  })
  @ApiParam({ name: 'id', description: 'UUID' })
  connect(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(TransitionWellTestSchema)) body: TransitionWellTestInput,
  ) {
    return this.wellTests.connect(SystemContext, id, body);
  }

  @Post(':id/start-stabilization')
  @ApiOperation({
    summary: 'Transition: connected → stabilizing',
    description: 'Records `stabilizationStartedAt = now()` server-side.',
  })
  @ApiParam({ name: 'id', description: 'UUID' })
  startStabilization(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(TransitionWellTestSchema)) body: TransitionWellTestInput,
  ) {
    return this.wellTests.startStabilization(SystemContext, id, body);
  }

  @Post(':id/start-official')
  @ApiOperation({
    summary: 'Transition: stabilizing → measuring',
    description:
      'Records `officialStartedAt = now()` and sets ' +
      '`stabilizationEndedAt = officialStartedAt` per the F4.7-0 §7.1 ' +
      'definition. Rejects when the server clock is earlier than ' +
      '`stabilizationStartedAt` (clock-skew defense).',
  })
  @ApiParam({ name: 'id', description: 'UUID' })
  startOfficial(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(TransitionWellTestSchema)) body: TransitionWellTestInput,
  ) {
    return this.wellTests.startOfficial(SystemContext, id, body);
  }

  @Post(':id/end-official')
  @ApiOperation({
    summary: 'Transition: measuring → completed',
    description:
      'Records `officialEndedAt = now()` server-side. The derived ' +
      '`actualOfficialDurationSeconds` becomes non-null at this point.',
  })
  @ApiParam({ name: 'id', description: 'UUID' })
  endOfficial(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(TransitionWellTestSchema)) body: TransitionWellTestInput,
  ) {
    return this.wellTests.endOfficial(SystemContext, id, body);
  }

  @Post(':id/abort')
  @ApiOperation({
    summary: 'Transition: any non-terminal → aborted',
    description:
      'Marks the test as aborted with an operator-supplied `abortReason` ' +
      '(1..240 chars). Records `abortedAt = now()`. Allowed from `scheduled`, ' +
      '`connected`, `stabilizing`, `measuring`. Terminal states (`completed`, ' +
      '`closed`, `aborted`) are rejected with `409 Conflict`.',
  })
  @ApiParam({ name: 'id', description: 'UUID' })
  abort(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(AbortWellTestSchema)) body: AbortWellTestInput,
  ) {
    return this.wellTests.abort(SystemContext, id, body);
  }

  @Post(':id/close')
  @ApiOperation({
    summary: 'Transition: completed → closed',
    description:
      'Marks the test as closed; records `disconnectedAt = now()`. Optionally ' +
      'accepts `reportGeneratedAt` (ISO-8601) when a Reports PDF has already ' +
      'been generated upstream.',
  })
  @ApiParam({ name: 'id', description: 'UUID' })
  close(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CloseWellTestSchema)) body: CloseWellTestInput,
  ) {
    return this.wellTests.close(SystemContext, id, body);
  }
}
