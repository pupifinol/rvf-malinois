/**
 * /api/telemetry — F3 §11, §12, §13.
 *
 * GET            list every stored record (seed + ingested).
 * GET ?unitId=…  filter by unit; 404 UNIT_NOT_FOUND on unknown unit.
 * POST           ingest a TelemetryPayload after the full §13 chain:
 *                  1. shape validation
 *                  2. unit exists
 *                  3. every sensor exists
 *                  4. every sensor.unitId === payload.unitId
 *                  5. timestamp parses as ISO
 *                  6. values are finite numbers
 *                  7. delegate to ingestTelemetry()
 *
 * Errors follow the standardized `{ error: { code, message } }`
 * envelope (F3 §14). The handler never throws an unhandled exception;
 * any unexpected failure routes through `internalError`.
 */
import type { TelemetryAcceptedResponse } from '@/types/api';

import {
  accepted,
  internalError,
  invalidPayload,
  methodNotAllowed,
  ok,
  sensorNotFound,
  sensorUnitMismatch,
  unitNotFound,
} from '@/lib/api/responses';
import { validateTelemetryPayload } from '@/lib/api/validation';
import {
  getSensorById,
  getTelemetry,
  getTelemetryByUnitId,
  getUnitById,
  ingestTelemetry,
} from '@/lib/api-data';

export const dynamic = 'force-dynamic';

export const GET = async (request: Request): Promise<Response> => {
  try {
    const url = new URL(request.url);
    const unitId = url.searchParams.get('unitId');
    if (unitId === null) {
      return ok(await getTelemetry());
    }
    if (unitId.trim().length === 0) {
      return invalidPayload('unitId must be a non-empty string', [
        'unitId query parameter cannot be empty',
      ]);
    }
    const unit = await getUnitById(unitId);
    if (!unit) return unitNotFound(unitId);
    return ok(await getTelemetryByUnitId(unitId));
  } catch {
    return internalError('Failed to load telemetry');
  }
};

export const POST = async (request: Request): Promise<Response> => {
  try {
    // ---- 1. Parse and shape-validate -----------------------------------
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return invalidPayload('Body must be valid JSON', ['failed to parse JSON']);
    }
    const validation = validateTelemetryPayload(raw);
    if (!validation.ok) {
      return invalidPayload(validation.message, validation.details);
    }
    const payload = validation.value;

    // ---- 2. Unit exists ------------------------------------------------
    const unit = await getUnitById(payload.unitId);
    if (!unit) return unitNotFound(payload.unitId);

    // ---- 3 + 4. Sensor existence + ownership ---------------------------
    for (const reading of payload.readings) {
      const sensor = await getSensorById(reading.sensorId);
      if (!sensor) return sensorNotFound(reading.sensorId);
      if (sensor.unitId !== payload.unitId) {
        return sensorUnitMismatch(reading.sensorId, payload.unitId);
      }
    }

    // ---- 5. Persist via adapter ----------------------------------------
    const result = await ingestTelemetry(payload);

    const body: TelemetryAcceptedResponse = {
      status: 'accepted',
      unitId: payload.unitId,
      readingsReceived: result.accepted,
      timestamp: payload.timestamp,
    };
    return accepted(body);
  } catch {
    return internalError('Failed to ingest telemetry payload');
  }
};

export const PUT = (): Response => methodNotAllowed(['GET', 'POST']);
export const DELETE = (): Response => methodNotAllowed(['GET', 'POST']);
export const PATCH = (): Response => methodNotAllowed(['GET', 'POST']);
