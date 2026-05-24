/**
 * GET /api/sensors/:id — F3 §12.
 *
 * Resolves a sensor by stable id; `SENSOR_NOT_FOUND` 404 when missing.
 */
import {
  internalError,
  invalidPayload,
  methodNotAllowed,
  ok,
  sensorNotFound,
} from '@/lib/api/responses';
import { getSensorById } from '@/lib/api-data';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const GET = async (_request: Request, context: RouteContext): Promise<Response> => {
  try {
    const { id } = await context.params;
    if (typeof id !== 'string' || id.trim().length === 0) {
      return invalidPayload('Sensor id must be a non-empty string', ['id is required']);
    }
    const sensor = await getSensorById(id);
    if (!sensor) return sensorNotFound(id);
    return ok(sensor);
  } catch {
    return internalError('Failed to load sensor');
  }
};

export const POST = (): Response => methodNotAllowed(['GET']);
export const PUT = (): Response => methodNotAllowed(['GET']);
export const DELETE = (): Response => methodNotAllowed(['GET']);
export const PATCH = (): Response => methodNotAllowed(['GET']);
