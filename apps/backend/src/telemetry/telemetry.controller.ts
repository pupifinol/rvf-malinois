import {
  Controller,
  Get,
  HttpStatus,
  NotImplementedException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';

import { BucketSizeSchema } from './contracts/trends';

/**
 * TelemetryController — F1.5.5 placeholder.
 *
 * Surfaces the FUTURE telemetry endpoints in /api/docs without shipping any
 * runtime behaviour. F2 wires the bodies; until then every route returns
 * 501 Not Implemented with a structured message pointing at the milestone
 * that owns the implementation.
 *
 * The route shapes are committed contracts:
 *   GET  /api/v1/telemetry/jobs/:code/series  — trend query (TrendsService)
 *   GET  /api/v1/telemetry/jobs/:code/last    — last-value cache (F2)
 *   POST /api/v1/telemetry                    — generic adapter ingest (F2)
 */

const SeriesQuerySchema = z.object({
  tag: z.string().min(1).max(64),
  from: z.coerce.date(),
  to: z.coerce.date(),
  bucket: BucketSizeSchema.default('raw'),
  limit: z.coerce.number().int().min(1).max(50_000).default(5_000),
});
type SeriesQuery = z.infer<typeof SeriesQuerySchema>;

const LastQuerySchema = z.object({
  tag: z.string().min(1).max(64),
});

@ApiTags('telemetry')
@ApiExtraModels()
@Controller('telemetry')
export class TelemetryController {
  // ─── GET /telemetry/jobs/:code/series ────────────────────────────────────

  @Get('jobs/:code/series')
  @ApiOperation({
    summary: '(F2) Trend series for one canonical tag on one job',
    description:
      'Routes the request to the TrendsService. F1.5 ships the service but ' +
      'leaves this route as 501 until F2 wires auth + tenant scoping. The ' +
      'response shape is committed: { samples: RawSample[], aggregates: BucketAggregate[] }.',
  })
  @ApiParam({ name: 'code', example: 'JOB-2026-0001' })
  @ApiQuery({ name: 'tag', example: 'p_inlet' })
  @ApiQuery({ name: 'from', example: '2026-05-18T00:00:00.000Z' })
  @ApiQuery({ name: 'to', example: '2026-05-18T01:00:00.000Z' })
  @ApiQuery({ name: 'bucket', enum: ['raw', '1m', '15m', '1h'], required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: HttpStatus.NOT_IMPLEMENTED, description: 'Wiring lands in F2.' })
  series(
    @Param('code') code: string,
    @Query(new ZodValidationPipe(SeriesQuerySchema)) _query: SeriesQuery,
  ): never {
    throw new NotImplementedException(
      `Telemetry trend series for ${code} lands in F2 (ingest + auth). The TrendsService already exists in F1.5.`,
    );
  }

  // ─── GET /telemetry/jobs/:code/last ──────────────────────────────────────

  @Get('jobs/:code/last')
  @ApiOperation({
    summary: '(F2) Last-known value per tag for a job',
    description:
      'Fast cached lookup used by the realtime dashboard. Backed by an ' +
      'in-memory cache primed from the most recent raw row in the hypertable.',
  })
  @ApiParam({ name: 'code', example: 'JOB-2026-0001' })
  @ApiQuery({ name: 'tag', example: 'p_inlet' })
  @ApiResponse({ status: HttpStatus.NOT_IMPLEMENTED, description: 'Wiring lands in F2.' })
  last(
    @Param('code') code: string,
    @Query(new ZodValidationPipe(LastQuerySchema)) _query: { tag: string },
  ): never {
    throw new NotImplementedException(`Last-value cache for ${code} lands in F2.`);
  }

  // ─── POST /telemetry ─────────────────────────────────────────────────────

  @Post()
  @ApiOperation({
    summary: '(F2) Generic adapter ingest endpoint',
    description:
      'Accepts a TelemetryEnvelope (telemetry-foundation §4). F2 routes the ' +
      'body through TelemetryValidator + TelemetryIngestionService. F1.5 ' +
      'ships the schema + validator but leaves the network ingest path off ' +
      'until tenant scoping (auth) lands. Edge adapters that need a path ' +
      'today should use the MQTT or REST-bridge ingestion adapters when they ' +
      'arrive; the schema is identical.',
  })
  @ApiResponse({ status: HttpStatus.NOT_IMPLEMENTED, description: 'Wiring lands in F2.' })
  ingest(): never {
    throw new NotImplementedException(
      'Telemetry ingest lands in F2. The contract (TelemetryEnvelopeSchema in contracts/envelope.ts) is stable.',
    );
  }
}
