/**
 * F4.6C.2.1 — Latest-value adapter (data-source-aware) + UUID guardrail.
 *
 * Two layers (mirrors F4.5E telemetry-trends adapter):
 *
 *   1. Adapter function (`adapterGetTelemetryLatest`). Mock branch resolves
 *      from the deterministic `MOCK_F4_TELEMETRY_LATEST` map in
 *      `./mock-fixtures.ts`; api branch delegates to `getTelemetryLatest`
 *      from `@/lib/api/f4`.
 *
 *   2. `assertUuidShaped(unitId)` guard exported alongside the adapter so
 *      callers can pre-validate without re-implementing the regex. The
 *      api-mode branch runs this guard **before** issuing the HTTP call, so
 *      simulator catalog strings like `EMMAD-01` / `EMMAD-02` / `PSK-03`
 *      from `OPERATIONS_JOBS` never reach the backend (defends the F4.5G.2-0
 *      §9 UUID gap at the network boundary, matching the F4.5G.2.1 socket
 *      posture).
 *
 * Decisions (matching F4.6C.2-0 §8 / §9):
 *
 *   - At most one of `canonicalTagId` / `canonicalTagName` per call. Both
 *     together → `RvfApiError(400, …)` from the adapter in mock mode (mirrors
 *     the backend Zod XOR refine). The api branch delegates to the backend
 *     for this refine — sending both produces the same 400 from the server.
 *   - Mock mode resolves the canonical-tag lookup by id-or-name against the
 *     F4.5B canonical-tag dictionary; unknown tag → empty `values: []`.
 *   - Mock mode returns the empty envelope for any unknown unit id (matches
 *     the F4.4F empty-array posture; the API never returns 404 on a
 *     known-empty / unknown unit path).
 *   - `assertUuidShaped(unitId)` raises `RvfApiError(400, …)` **before** any
 *     fetch when called in api mode against a non-UUID identifier. Mock
 *     mode tolerates simulator strings (the empty envelope is the answer).
 */

import { MOCK_F4_CANONICAL_TAGS, MOCK_F4_TELEMETRY_LATEST } from './mock-fixtures';

import {
  type GetOptions,
  type GetTelemetryLatestParams,
  type TelemetryLatestResponse,
  type TelemetryLatestValue,
  RvfApiError,
  getTelemetryLatest,
  isApiSource,
} from '@/lib/api/f4';

// =============================================================================
// UUID guardrail
// =============================================================================

/** Canonical UUID-shape regex (lower-case hex with dashes). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Exported predicate so callers can mirror the F4.5G.2.1 posture. */
export const isUuidShaped = (value: string): boolean => UUID_RE.test(value);

/**
 * Throws a deterministic `RvfApiError(400, …, 'unitId must be UUID-shaped')`
 * when `unitId` is not UUID-shaped. The F4.6C.2.1 adapter calls this at the
 * entry of the **api-mode** branch only — mock mode tolerates simulator
 * catalog strings (the answer is the empty envelope).
 */
export const assertUuidShaped = (unitId: string, url: string): void => {
  if (!isUuidShaped(unitId)) {
    throw new RvfApiError(
      400,
      url,
      null,
      '`unitId` must be UUID-shaped (simulator catalog strings like `EMMAD-01` are rejected client-side; ' +
        'a backend `MeasurementUnit.id` UUID is required for the api-mode call)',
    );
  }
};

// =============================================================================
// Adapter
// =============================================================================

const MOCK_URL = 'mock:/telemetry/latest';
const API_URL_PATH = '/telemetry/latest';

const adapterGetTelemetryLatestMock = (
  params: GetTelemetryLatestParams,
): Promise<TelemetryLatestResponse> => {
  if (params.canonicalTagId && params.canonicalTagName) {
    return Promise.reject(
      new RvfApiError(
        400,
        MOCK_URL,
        null,
        'supplying both `canonicalTagId` and `canonicalTagName` is rejected as ambiguous; ' +
          'supply at most one, or omit both to receive all latest values for the unit',
      ),
    );
  }

  const generatedAt = new Date().toISOString();

  const fixture = MOCK_F4_TELEMETRY_LATEST[params.unitId];
  if (!fixture) {
    // Unknown unit → empty envelope (matches the F4.4F empty-array posture;
    // the API never returns 404 on this path).
    return Promise.resolve({
      unitId: params.unitId,
      generatedAt,
      source: 'live_readings',
      values: [],
    });
  }

  if (params.canonicalTagId === undefined && params.canonicalTagName === undefined) {
    return Promise.resolve({
      unitId: params.unitId,
      generatedAt,
      source: 'live_readings',
      values: [...fixture],
    });
  }

  let resolvedTagId: string | null = null;
  if (params.canonicalTagId) {
    const tag = MOCK_F4_CANONICAL_TAGS.find((t) => t.id === params.canonicalTagId);
    resolvedTagId = tag ? tag.id : null;
  } else if (params.canonicalTagName) {
    const tag = MOCK_F4_CANONICAL_TAGS.find((t) => t.name === params.canonicalTagName);
    resolvedTagId = tag ? tag.id : null;
  }

  if (!resolvedTagId) {
    return Promise.resolve({
      unitId: params.unitId,
      generatedAt,
      source: 'live_readings',
      values: [],
    });
  }

  const filtered = fixture.filter((row) => row.canonicalTag.id === resolvedTagId);
  return Promise.resolve({
    unitId: params.unitId,
    generatedAt,
    source: 'live_readings',
    values: filtered,
  });
};

export const adapterGetTelemetryLatest = async (
  params: GetTelemetryLatestParams,
  options?: GetOptions,
): Promise<TelemetryLatestResponse> => {
  if (isApiSource()) {
    // UUID guardrail — never let a simulator catalog string reach the backend.
    assertUuidShaped(params.unitId, API_URL_PATH);
    return getTelemetryLatest(params, options);
  }
  return adapterGetTelemetryLatestMock(params);
};

// Re-export the typed envelope so callers can import from a single location.
export type { TelemetryLatestResponse, TelemetryLatestValue };
