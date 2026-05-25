import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { SystemContext } from '../common/caller-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

import {
  TELEMETRY_QUALITIES,
  TELEMETRY_SOURCES,
  TRENDS_LIMIT_DEFAULT,
  TRENDS_LIMIT_MAX,
  TrendsQuerySchema,
  type TrendsQuery,
} from './contracts/trends';
import { TrendsService } from './trends.service';

@ApiTags('telemetry')
@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly trends: TrendsService) {}

  @Get('trends')
  @ApiOperation({
    summary: 'Range scan against `telemetry_readings` for a single canonical tag',
    description:
      'F4.4F read-only. Returns raw points in their stored engineering unit ' +
      '(no conversion at read time). Exactly one of `canonicalTagId` or ' +
      '`canonicalTagName` must be provided; supplying both is rejected as ' +
      'ambiguous. `from` must be strictly less than `to`. Optional filters: ' +
      '`jobId`, `quality`, `source`. The endpoint returns ' +
      '`{ unitId, canonicalTag, range, points: [...] }`; on an F4.2 baseline ' +
      'without telemetry data (F4.3 does not seed `telemetry_readings`) ' +
      '`points` will be `[]`. F4.6 lands the ingestion path that populates ' +
      'the table.',
  })
  @ApiQuery({ name: 'unitId', required: true, description: 'UUID' })
  @ApiQuery({ name: 'from', required: true, description: 'ISO-8601 timestamp' })
  @ApiQuery({ name: 'to', required: true, description: 'ISO-8601 timestamp' })
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
  @ApiQuery({ name: 'jobId', required: false, description: 'UUID' })
  @ApiQuery({ name: 'quality', required: false, enum: TELEMETRY_QUALITIES })
  @ApiQuery({ name: 'source', required: false, enum: TELEMETRY_SOURCES })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: `1..${String(TRENDS_LIMIT_MAX)} (default ${String(TRENDS_LIMIT_DEFAULT)})`,
  })
  series(@Query(new ZodValidationPipe(TrendsQuerySchema)) query: TrendsQuery) {
    return this.trends.query(SystemContext, query);
  }
}
