import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { SystemContext } from '../../common/caller-context';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

import {
  IngestTelemetryBatchInputSchema,
  type IngestTelemetryBatchInput,
  type IngestTelemetryBatchResult,
} from './contracts/ingestion';
import { TelemetryIngestionService } from './telemetry-ingestion.service';

/**
 * TelemetryIngestionController — F4.6B.1.
 *
 * Mounts a single POST endpoint at `/api/v1/telemetry/ingest` (global `/api/v1`
 * prefix from `main.ts`, controller path `telemetry/ingest`). The controller
 * itself is **only registered when `RVF_INGEST_ENABLED === 'true'`** — that
 * guard lives in `AppModule.imports` per F4.6B-0 §8.2, so when the flag is
 * unset the route is not registered and Nest's default 404 applies.
 *
 * The controller is intentionally thin: it Zod-validates the request body,
 * passes the `SystemContext` (F1 no-auth seam) to the service, and returns the
 * service's per-sample result. Tenant scoping happens server-side from the
 * resolved `IntegrationSource` (F4.6B-0 §9); the wire never carries a
 * `tenantId`.
 */
@ApiTags('telemetry')
@Controller('telemetry')
export class TelemetryIngestionController {
  constructor(private readonly ingestion: TelemetryIngestionService) {}

  @Post('ingest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Internal-only telemetry ingestion (F4.6B.1).',
    description:
      'Accepts a batch of telemetry drafts and writes accepted samples to ' +
      '`telemetry_readings`. Drafts that fail validation, mapping resolution, ' +
      'or dedup are routed to `telemetry_ingestion_errors` (quarantine surface). ' +
      'Partial success is reported in `results[]`; the request is rejected with ' +
      'HTTP 400 only when the wire shape itself is malformed. ' +
      'Endpoint is registered only when `RVF_INGEST_ENABLED=true`; absent that ' +
      'flag, the route returns Nest 404. No authentication in F4.6B.1 — ' +
      'auth is deferred to a successor ADR (candidate ADR-009). ' +
      'No external bridges (MQTT / Modbus / OPC-UA / ThingsBoard / Node-RED / ' +
      'PLC / historian) are wired by F4.6B.1.',
  })
  @ApiBody({
    description:
      'Telemetry batch. `integrationSourceId` is required at the root; tenant is ' +
      'derived from the resolved `IntegrationSource` and never trusted from the ' +
      'request. `samples` carries 1..1000 drafts. Wire is camelCase; field shape ' +
      'is documented in `contracts/ingestion.ts`. `value` may be number or ' +
      'numeric string (string preserves precision past ~15 significant digits). ' +
      '`sequence` is an optional monotonic counter; when present, dedup uses ' +
      'the source-aware sequence index, otherwise the canonical-instrument ' +
      'timestamp index. `quality` is strictly one of `good | uncertain | bad`.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Batch processed. Per-sample outcomes are reported in `results[]`. ' +
      'Aggregate counts cover the five outcome categories. Partial success is ' +
      'expected and not an error condition.',
  })
  @ApiResponse({ status: 400, description: 'Request body did not match the ingest schema.' })
  ingest(
    @Body(new ZodValidationPipe(IngestTelemetryBatchInputSchema)) body: IngestTelemetryBatchInput,
  ): Promise<IngestTelemetryBatchResult> {
    return this.ingestion.ingestBatch(SystemContext, body);
  }
}
