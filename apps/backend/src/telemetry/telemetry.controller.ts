import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { SystemContext } from '../common/caller-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

import {
  TELEMETRY_QUALITIES,
  TELEMETRY_SOURCES,
  TRENDS_AGGREGATES,
  TRENDS_BUCKETS,
  TRENDS_BUCKETS_MAX,
  TRENDS_LIMIT_DEFAULT,
  TRENDS_LIMIT_MAX,
  TRENDS_QUALITY_POLICIES,
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
      'F4.4F read-only baseline; F4.6F.1 extended with optional server-side bucketing. ' +
      'Exactly one of `canonicalTagId` or `canonicalTagName` must be provided; ' +
      'supplying both is rejected as ambiguous. `from` must be strictly less than `to`. ' +
      'Optional row filters: `jobId`, `quality`, `source`. ' +
      '**Raw mode (no `bucket`):** returns raw points sorted ascending in their ' +
      'stored engineering unit (no conversion at read time); `limit` caps the row ' +
      'count (1..' +
      String(TRENDS_LIMIT_MAX) +
      `, default ${String(TRENDS_LIMIT_DEFAULT)}). Response shape is byte-identical to F4.4F. ` +
      '**Bucketed mode (`bucket` + `aggregate` both supplied; F4.6F.1):** returns one ' +
      'row per fixed-width bucket from `from` to `to` (empty buckets emitted with ' +
      '`sampleCount=0, value=null`). Bucket sizes: ' +
      TRENDS_BUCKETS.join(' / ') +
      '. Aggregates: ' +
      TRENDS_AGGREGATES.join(' / ') +
      `. Bucket count is capped at ${String(TRENDS_BUCKETS_MAX)} per request (rejected at ` +
      'validation time, before any DB call). `qualityPolicy` (bucketed-mode only) ' +
      'governs which rows enter the aggregator; default `good_only` matches the ' +
      'F4.6C.1 projection convention. On an F4.2 baseline without telemetry data ' +
      '(F4.3 does not seed `telemetry_readings`) raw-mode `points` is `[]` and ' +
      'bucketed-mode `buckets[].sampleCount` is `0` for every bucket. F4.6B.1 ' +
      'lands the ingestion path that populates the table.',
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
    description: `1..${String(TRENDS_LIMIT_MAX)} (default ${String(TRENDS_LIMIT_DEFAULT)}); raw-mode row cap`,
  })
  @ApiQuery({
    name: 'bucket',
    required: false,
    enum: TRENDS_BUCKETS,
    description:
      'F4.6F.1. Switches the endpoint to bucketed mode. Requires `aggregate`. ' +
      `Bucket count capped at ${String(TRENDS_BUCKETS_MAX)} per request.`,
  })
  @ApiQuery({
    name: 'aggregate',
    required: false,
    enum: TRENDS_AGGREGATES,
    description: 'F4.6F.1. Required when `bucket` is present; rejected when `bucket` is absent.',
  })
  @ApiQuery({
    name: 'qualityPolicy',
    required: false,
    enum: TRENDS_QUALITY_POLICIES,
    description:
      'F4.6F.1. Bucketed-mode only (rejected without `bucket`). Default `good_only` ' +
      'matches the F4.6C.1 projection convention.',
  })
  series(@Query(new ZodValidationPipe(TrendsQuerySchema)) query: TrendsQuery) {
    return this.trends.query(SystemContext, query);
  }
}
