/**
 * GET /api/units/:id — F3 §12 detail endpoint.
 *
 * Resolves a unit by stable id (`unit-hp-001`, ...). Returns
 * `UNIT_NOT_FOUND` 404 when missing, per F3 §14.
 */
import {
  internalError,
  invalidPayload,
  methodNotAllowed,
  ok,
  unitNotFound,
} from '@/lib/api/responses';
import { getUnitById } from '@/lib/api-data';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const GET = async (_request: Request, context: RouteContext): Promise<Response> => {
  try {
    const { id } = await context.params;
    if (typeof id !== 'string' || id.trim().length === 0) {
      return invalidPayload('Unit id must be a non-empty string', ['id is required']);
    }
    const unit = await getUnitById(id);
    if (!unit) return unitNotFound(id);
    return ok(unit);
  } catch {
    return internalError('Failed to load measurement unit');
  }
};

export const POST = (): Response => methodNotAllowed(['GET']);
export const PUT = (): Response => methodNotAllowed(['GET']);
export const DELETE = (): Response => methodNotAllowed(['GET']);
export const PATCH = (): Response => methodNotAllowed(['GET']);
