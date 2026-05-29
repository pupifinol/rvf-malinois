import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { SystemContext } from '../common/caller-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

import { AlarmEventsReadService } from './alarm-events-read.service';
import {
  ALARM_EVENTS_LIMIT_DEFAULT,
  ALARM_EVENTS_LIMIT_MAX,
  ALARM_EVENT_SEVERITIES,
  ALARM_EVENT_STATES,
  AlarmEventsQuerySchema,
  type AlarmEventsQuery,
} from './contracts/events';

@ApiTags('alarms')
@Controller('alarms')
export class AlarmsController {
  constructor(private readonly alarmEventsRead: AlarmEventsReadService) {}

  @Get('events')
  @ApiOperation({
    summary: 'Server-evaluated alarm events from `alarm_events`',
    description:
      'F4.6D.2.1 read-only surface over the `alarm_events` table populated ' +
      "transactionally by F4.6D.1's `AlarmEvaluationService`. Returns " +
      'server-evaluated alarm rows ordered by `firstTriggeredAt DESC`. ' +
      "All query parameters are optional. `state` defaults to `'active'` " +
      '(operator-meaningful; matches the current F4.6D.1 write set). ' +
      'At most one of `canonicalTagId` / `canonicalTagName` may be supplied ' +
      '(XOR — both is rejected as ambiguous). `from` and `to` must appear ' +
      'together with `from < to`. `limit` defaults to ' +
      String(ALARM_EVENTS_LIMIT_DEFAULT) +
      ', max ' +
      String(ALARM_EVENTS_LIMIT_MAX) +
      '. Tenant scoping is derived from the server-side `CallerContext`; ' +
      'no `tenantId` query parameter is accepted. No-data behavior is ' +
      '`200 OK` with `events: []` (known tenant with no events, unknown ' +
      'unit, unknown canonical tag) — never 404 on these paths, matching ' +
      'the F4.4F empty-array posture. Response envelope: ' +
      "`{ generatedAt, source: 'alarm_events', state, events: " +
      'AlarmEventRow[] }`. `tenantId` / `ruleSnapshot` / `createdAt` / ' +
      '`updatedAt` / `jobId` are intentionally not on the wire (plan §9.3 — ' +
      'exposing `ruleSnapshot` would invite browser-side threshold ' +
      're-interpretation, exactly the ADR-005 violation this API exists to ' +
      'prevent). Lifecycle columns (`acknowledgedAt` / `acknowledgedBy` / ' +
      '`clearedAt`) are surfaced as `null` until F4.6D.3 ships the ' +
      'lifecycle transitions.',
  })
  @ApiQuery({ name: 'unitId', required: false, description: 'UUID' })
  @ApiQuery({
    name: 'canonicalTagId',
    required: false,
    description: 'UUID (XOR with canonicalTagName)',
  })
  @ApiQuery({
    name: 'canonicalTagName',
    required: false,
    description: 'e.g. `p_inlet` (XOR with canonicalTagId)',
  })
  @ApiQuery({
    name: 'state',
    required: false,
    enum: ALARM_EVENT_STATES,
    description: "Defaults to 'active'",
  })
  @ApiQuery({ name: 'severity', required: false, enum: ALARM_EVENT_SEVERITIES })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'ISO-8601 timestamp (required together with `to`; `from < to`)',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'ISO-8601 timestamp (required together with `from`; `from < to`)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: `1..${String(ALARM_EVENTS_LIMIT_MAX)} (default ${String(ALARM_EVENTS_LIMIT_DEFAULT)})`,
  })
  alarmEvents(@Query(new ZodValidationPipe(AlarmEventsQuerySchema)) query: AlarmEventsQuery) {
    return this.alarmEventsRead.query(SystemContext, query);
  }
}
