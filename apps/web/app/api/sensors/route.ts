/**
 * GET /api/sensors            — list all sensors.
 * GET /api/sensors?unitId=...  — sensors belonging to that unit.
 *
 * F3 §12: when `unitId` is supplied it must be a non-empty string and
 * the unit must exist (`UNIT_NOT_FOUND` otherwise). An unknown unit
 * never silently returns an empty list — that would mask a typo.
 */
import {
  internalError,
  invalidPayload,
  methodNotAllowed,
  ok,
  unitNotFound,
} from '@/lib/api/responses';
import { getSensors, getSensorsByUnitId, getUnitById } from '@/lib/api-data';

export const dynamic = 'force-dynamic';

export const GET = async (request: Request): Promise<Response> => {
  try {
    const url = new URL(request.url);
    const unitId = url.searchParams.get('unitId');
    if (unitId === null) {
      return ok(await getSensors());
    }
    if (unitId.trim().length === 0) {
      return invalidPayload('unitId must be a non-empty string', [
        'unitId query parameter cannot be empty',
      ]);
    }
    const unit = await getUnitById(unitId);
    if (!unit) return unitNotFound(unitId);
    return ok(await getSensorsByUnitId(unitId));
  } catch {
    return internalError('Failed to load sensors');
  }
};

export const POST = (): Response => methodNotAllowed(['GET']);
export const PUT = (): Response => methodNotAllowed(['GET']);
export const DELETE = (): Response => methodNotAllowed(['GET']);
export const PATCH = (): Response => methodNotAllowed(['GET']);
