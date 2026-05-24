/**
 * GET /api/units — F3 §12 list endpoint.
 *
 * Returns every measurement unit from the canonical adapter. No
 * filtering parameters in F3; pagination + filters arrive with the
 * real database in a later phase.
 */
import { internalError, methodNotAllowed, ok } from '@/lib/api/responses';
import { getUnits } from '@/lib/api-data';

export const dynamic = 'force-dynamic';

export const GET = async (): Promise<Response> => {
  try {
    const units = await getUnits();
    return ok(units);
  } catch {
    return internalError('Failed to load measurement units');
  }
};

export const POST = (): Response => methodNotAllowed(['GET']);
export const PUT = (): Response => methodNotAllowed(['GET']);
export const DELETE = (): Response => methodNotAllowed(['GET']);
export const PATCH = (): Response => methodNotAllowed(['GET']);
