/**
 * GET /api/telemetry/latest?unitId=… — F3 §12.
 *
 * Returns the most recent stored record per sensor for the given unit,
 * or an empty array if the unit exists but has no telemetry yet.
 * `unitId` is REQUIRED here — unlike the listing endpoints, "latest
 * across the whole platform" is not a meaningful query.
 */
import {
  internalError,
  invalidPayload,
  methodNotAllowed,
  ok,
  unitNotFound,
} from '@/lib/api/responses';
import { validateUnitIdParam } from '@/lib/api/validation';
import { getLatestTelemetryByUnitId, getUnitById } from '@/lib/api-data';

export const dynamic = 'force-dynamic';

export const GET = async (request: Request): Promise<Response> => {
  try {
    const url = new URL(request.url);
    const validation = validateUnitIdParam(url.searchParams.get('unitId'));
    if (!validation.ok) {
      return invalidPayload(validation.message, validation.details);
    }
    const unitId = validation.value;
    const unit = await getUnitById(unitId);
    if (!unit) return unitNotFound(unitId);
    return ok(await getLatestTelemetryByUnitId(unitId));
  } catch {
    return internalError('Failed to load latest telemetry');
  }
};

export const POST = (): Response => methodNotAllowed(['GET']);
export const PUT = (): Response => methodNotAllowed(['GET']);
export const DELETE = (): Response => methodNotAllowed(['GET']);
export const PATCH = (): Response => methodNotAllowed(['GET']);
