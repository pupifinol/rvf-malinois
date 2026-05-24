/**
 * GET /api/alarms/:id — F3 §12.
 *
 * Resolves an alarm configuration by stable id; 404 when missing.
 *
 * NOTE on error code: F3 §14 enumerates a fixed set that does NOT
 * include `ALARM_NOT_FOUND`. Until the doc adds the code we surface
 * this case through the canonical `{ error: { code, message } }`
 * envelope using `INVALID_PAYLOAD` for the malformed-id case and a
 * 404 with the same envelope for the missing-record case. The HTTP
 * status (404) is the contract; the code is reserved space.
 */
import { err, internalError, invalidPayload, methodNotAllowed, ok } from '@/lib/api/responses';
import { getAlarmById } from '@/lib/api-data';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const GET = async (_request: Request, context: RouteContext): Promise<Response> => {
  try {
    const { id } = await context.params;
    if (typeof id !== 'string' || id.trim().length === 0) {
      return invalidPayload('Alarm id must be a non-empty string', ['id is required']);
    }
    const alarm = await getAlarmById(id);
    if (!alarm) {
      return err(404, 'INVALID_PAYLOAD', `Alarm configuration not found: ${id}`);
    }
    return ok(alarm);
  } catch {
    return internalError('Failed to load alarm configuration');
  }
};

export const POST = (): Response => methodNotAllowed(['GET']);
export const PUT = (): Response => methodNotAllowed(['GET']);
export const DELETE = (): Response => methodNotAllowed(['GET']);
export const PATCH = (): Response => methodNotAllowed(['GET']);
