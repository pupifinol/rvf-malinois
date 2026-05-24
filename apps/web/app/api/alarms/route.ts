/**
 * GET /api/alarms             — list all alarm configurations.
 * GET /api/alarms?unitId=...  — alarms belonging to that unit.
 *
 * F3 §12 + §10 domain rule: alarms are per-unit. An unknown `unitId`
 * returns `UNIT_NOT_FOUND` 404, never an empty list (would mask typos).
 */
import {
  internalError,
  invalidPayload,
  methodNotAllowed,
  ok,
  unitNotFound,
} from '@/lib/api/responses';
import { getAlarms, getAlarmsByUnitId, getUnitById } from '@/lib/api-data';

export const dynamic = 'force-dynamic';

export const GET = async (request: Request): Promise<Response> => {
  try {
    const url = new URL(request.url);
    const unitId = url.searchParams.get('unitId');
    if (unitId === null) {
      return ok(await getAlarms());
    }
    if (unitId.trim().length === 0) {
      return invalidPayload('unitId must be a non-empty string', [
        'unitId query parameter cannot be empty',
      ]);
    }
    const unit = await getUnitById(unitId);
    if (!unit) return unitNotFound(unitId);
    return ok(await getAlarmsByUnitId(unitId));
  } catch {
    return internalError('Failed to load alarm configurations');
  }
};

export const POST = (): Response => methodNotAllowed(['GET']);
export const PUT = (): Response => methodNotAllowed(['GET']);
export const DELETE = (): Response => methodNotAllowed(['GET']);
export const PATCH = (): Response => methodNotAllowed(['GET']);
