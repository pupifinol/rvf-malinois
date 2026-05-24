/**
 * GET /api/health — F3 liveness / readiness.
 *
 * Returns 200 with the canonical service identity and a fresh timestamp.
 * Used by deployment probes and contract tests; F3 §12 mandates the
 * exact response shape, so do not change it without a version bump.
 */
import { methodNotAllowed, ok } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

export const GET = (): Response =>
  ok({
    status: 'ok',
    service: 'rvf-malinois-api',
    version: 'F3',
    timestamp: new Date().toISOString(),
  });

export const POST = (): Response => methodNotAllowed(['GET']);
export const PUT = (): Response => methodNotAllowed(['GET']);
export const DELETE = (): Response => methodNotAllowed(['GET']);
export const PATCH = (): Response => methodNotAllowed(['GET']);
