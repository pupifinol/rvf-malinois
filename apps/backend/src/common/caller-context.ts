/**
 * CallerContext — the seam for tenant scoping + RBAC.
 *
 * Telemetry-foundation §17 ("aislamiento desde el día uno") requires tenant
 * isolation to be designed in, not retrofitted. In F1 we don't have auth yet,
 * so:
 *   - Services *accept* a CallerContext as their first argument.
 *   - In F1 controllers always pass an empty object → endpoints serve every
 *     tenant's data.
 *   - In F1.5 (auth) controllers will derive the context from the validated
 *     session and the same service code starts filtering.
 *
 * The shape stays minimal until F1.5 fleshes it out. The seam is the value:
 * the wiring is decoupled today so the security boundary is one swap later.
 */
export interface CallerContext {
  /** Tenant scope — derived server-side. Undefined ⇒ no scope (F1 default). */
  tenantId?: string;
  /** Acting user id (audit attribution). */
  userId?: string;
  /** Role label — see `UserRole` in @prisma/client / packages/types. */
  role?: string;
}

/**
 * Empty context: every tenant's data is visible. F1 default. Do NOT use this
 * once auth lands — F1.5 always derives ctx from the validated session.
 */
export const SystemContext: CallerContext = Object.freeze({});
