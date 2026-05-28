/**
 * F4.5E — Telemetry trends data-source-aware adapter + numeric-conversion
 * helpers.
 *
 * Two layers (mirrors F4.5C / F4.5D):
 *
 *   1. Adapter function (`adapterGetTelemetryTrends`). Mock branch resolves
 *      from the deterministic synthetic trace map in `./mock-fixtures.ts`
 *      and applies the standard filter set locally (`from / to` range +
 *      optional `jobId / quality / source / limit`); api branch delegates
 *      to `getTelemetryTrends` from `@/lib/api/f4`.
 *
 *   2. View-model helpers
 *      (`toNumericTelemetryPoint`, `toNumericTelemetrySeries`,
 *       `isTelemetryTrendEmpty`). Backend serializes `points[].value` as a
 *      Prisma-`Decimal` string; future chart code wants a JS `number`. These
 *      helpers convert once at the adapter boundary so consumers don't
 *      repeat the conversion logic.
 *
 * Decisions:
 *
 *   - Exactly one of `canonicalTagId` / `canonicalTagName` must be provided.
 *     Supplying both raises `RvfApiError(400, 'mock:/telemetry/trends', null, …)`
 *     in mock mode (mirrors the F4.4F backend's Zod XOR refine, which raises
 *     400 with a structured message; the api branch delegates to the wrapper
 *     and the backend produces the actual 400).
 *   - Mock mode resolves `canonicalTagId` by id-lookup in the F4.5B canonical
 *     tag dictionary; if the id is unknown it surfaces as the empty-trend
 *     envelope (NOT 404 — matches F4.4F behavior where an unknown tag id
 *     returns 404, but for the mock-mode adapter we prefer the empty-envelope
 *     shape so a chart consumer sees a predictable structure).
 *   - Mock mode `from / to` filtering uses half-open `[from, to)` ranges
 *     (matches the F4.4F backend's `timestamp: { gte: from, lt: to }`).
 *   - Mock mode `limit` caps the returned `points.length`. F4.5E does NOT
 *     enforce the backend's max-5000 ceiling; the wrapper / backend Zod
 *     schema handles that for api mode.
 *   - `from >= to` raises `RvfApiError(400, …)` in mock mode (matches the
 *     backend Zod refine).
 *   - `toNumericTelemetryPoint`: returns `value: number` on a parseable
 *     Decimal string, `value: null` on `NaN` (defensive — chart code can
 *     gap-skip null points rather than crash).
 *   - `toNumericTelemetrySeries`: shape-preserving map; surfaces `validCount`
 *     so consumers can detect "every point was NaN".
 */

import { MOCK_F4_CANONICAL_TAGS, MOCK_F4_TELEMETRY_TRENDS, mockTrendsKey } from './mock-fixtures';

import {
  type CanonicalTagSummary,
  type GetOptions,
  type GetTelemetryTrendsParams,
  type TelemetryPoint,
  type TelemetryQuality,
  type TelemetrySource,
  type TelemetryTrendsResponse,
  RvfApiError,
  getTelemetryTrends,
  isApiSource,
} from '@/lib/api/f4';

// =============================================================================
// Adapter
// =============================================================================

const MOCK_URL = 'mock:/telemetry/trends';

function resolveMockTagSummary(params: GetTelemetryTrendsParams): CanonicalTagSummary | null {
  if (params.canonicalTagName) {
    const tag = MOCK_F4_CANONICAL_TAGS.find((t) => t.name === params.canonicalTagName);
    return tag
      ? {
          id: tag.id,
          name: tag.name,
          displayName: tag.displayName,
          canonicalUnit: tag.canonicalUnit,
          category: tag.category,
          precision: tag.precision,
        }
      : null;
  }
  if (params.canonicalTagId) {
    const tag = MOCK_F4_CANONICAL_TAGS.find((t) => t.id === params.canonicalTagId);
    return tag
      ? {
          id: tag.id,
          name: tag.name,
          displayName: tag.displayName,
          canonicalUnit: tag.canonicalUnit,
          category: tag.category,
          precision: tag.precision,
        }
      : null;
  }
  return null;
}

function applyMockFilters(
  points: readonly TelemetryPoint[],
  params: GetTelemetryTrendsParams,
): TelemetryPoint[] {
  const fromMs = typeof params.from === 'string' ? Date.parse(params.from) : params.from.getTime();
  const toMs = typeof params.to === 'string' ? Date.parse(params.to) : params.to.getTime();
  let out: TelemetryPoint[] = points.filter((p) => {
    const ts = Date.parse(p.timestamp);
    return ts >= fromMs && ts < toMs;
  });
  if (params.quality) {
    const wanted: TelemetryQuality = params.quality;
    out = out.filter((p) => p.quality === wanted);
  }
  if (params.source) {
    const wanted: TelemetrySource = params.source;
    out = out.filter((p) => p.source === wanted);
  }
  if (params.limit !== undefined && out.length > params.limit) {
    out = out.slice(0, params.limit);
  }
  return out;
}

const adapterGetTelemetryTrendsMock = (
  params: GetTelemetryTrendsParams,
): Promise<TelemetryTrendsResponse> => {
  const bothProvided = Boolean(params.canonicalTagId) && Boolean(params.canonicalTagName);
  const neitherProvided = !params.canonicalTagId && !params.canonicalTagName;
  if (bothProvided || neitherProvided) {
    return Promise.reject(
      new RvfApiError(
        400,
        MOCK_URL,
        null,
        'exactly one of `canonicalTagId` or `canonicalTagName` must be provided',
      ),
    );
  }

  // F4.6F.1 refines — mirror them client-side so a mock-mode caller fails the
  // same way the backend would in api mode.
  if (params.bucket !== undefined && params.aggregate === undefined) {
    return Promise.reject(
      new RvfApiError(400, MOCK_URL, null, '`aggregate` is required when `bucket` is provided'),
    );
  }
  if (params.aggregate !== undefined && params.bucket === undefined) {
    return Promise.reject(
      new RvfApiError(400, MOCK_URL, null, '`bucket` is required when `aggregate` is provided'),
    );
  }
  if (params.qualityPolicy !== undefined && params.bucket === undefined) {
    return Promise.reject(
      new RvfApiError(400, MOCK_URL, null, '`qualityPolicy` requires `bucket` to be provided'),
    );
  }

  const fromIso = typeof params.from === 'string' ? params.from : params.from.toISOString();
  const toIso = typeof params.to === 'string' ? params.to : params.to.toISOString();
  if (Date.parse(fromIso) >= Date.parse(toIso)) {
    return Promise.reject(
      new RvfApiError(400, MOCK_URL, null, '`from` must be strictly less than `to`'),
    );
  }

  const tagSummary = resolveMockTagSummary(params);

  if (!tagSummary) {
    // Unknown tag → empty envelope (preserves a predictable shape for chart
    // consumers; the api branch surfaces the backend's 404).
    const placeholder: CanonicalTagSummary = {
      id: params.canonicalTagId ?? '',
      name: params.canonicalTagName ?? '',
      displayName: '',
      canonicalUnit: '',
      category: '',
      precision: 0,
    };
    return Promise.resolve({
      unitId: params.unitId,
      canonicalTag: placeholder,
      range: { from: fromIso, to: toIso },
      points: [],
    });
  }

  const key = mockTrendsKey(params.unitId, tagSummary.name);
  const fixture = MOCK_F4_TELEMETRY_TRENDS[key];
  if (!fixture) {
    // Known tag, no fixture for this (unitId, tag) combination → empty.
    return Promise.resolve({
      unitId: params.unitId,
      canonicalTag: tagSummary,
      range: { from: fromIso, to: toIso },
      points: [],
    });
  }

  const filtered = applyMockFilters(fixture.points, params);
  return Promise.resolve({
    unitId: params.unitId,
    canonicalTag: tagSummary,
    range: { from: fromIso, to: toIso },
    points: filtered,
  });
};

export const adapterGetTelemetryTrends = async (
  params: GetTelemetryTrendsParams,
  options?: GetOptions,
): Promise<TelemetryTrendsResponse> => {
  if (isApiSource()) {
    return getTelemetryTrends(params, options);
  }
  return adapterGetTelemetryTrendsMock(params);
};

// =============================================================================
// Numeric-conversion / view-model helpers
// =============================================================================

export interface NumericTelemetryPoint {
  timestamp: string;
  /** `null` when the Decimal-string failed `Number(...)` parsing. */
  value: number | null;
  engineeringUnit: string;
  quality: TelemetryQuality;
  source: TelemetrySource;
}

/**
 * Convert one trend point's `value` (Prisma `Decimal` string) to a JS
 * `number`. Returns `value: null` when the input is not parseable — chart
 * consumers can gap-skip null points rather than crashing on NaN.
 */
export const toNumericTelemetryPoint = (point: TelemetryPoint): NumericTelemetryPoint => {
  const parsed = Number(point.value);
  return {
    timestamp: point.timestamp,
    value: Number.isFinite(parsed) ? parsed : null,
    engineeringUnit: point.engineeringUnit,
    quality: point.quality,
    source: point.source,
  };
};

export interface NumericTelemetrySeries {
  unitId: string;
  canonicalTag: CanonicalTagSummary;
  range: { from: string; to: string };
  points: NumericTelemetryPoint[];
  /** Number of points whose `value` parsed cleanly to a finite number. */
  validCount: number;
}

/**
 * Map a full `TelemetryTrendsResponse` to its numeric view-model. Preserves
 * `canonicalTag` and `range`; replaces `points` with `NumericTelemetryPoint[]`
 * and adds `validCount`.
 */
export const toNumericTelemetrySeries = (
  response: TelemetryTrendsResponse,
): NumericTelemetrySeries => {
  const points = response.points.map(toNumericTelemetryPoint);
  const validCount = points.reduce((acc, p) => (p.value !== null ? acc + 1 : acc), 0);
  return {
    unitId: response.unitId,
    canonicalTag: response.canonicalTag,
    range: response.range,
    points,
    validCount,
  };
};

/** `true` when the response carries zero points (covers both the F4.2-baseline
 *  empty case and an over-filtered mock query). */
export const isTelemetryTrendEmpty = (response: TelemetryTrendsResponse): boolean =>
  response.points.length === 0;

// Re-export the synthetic-trace range metadata so screen-readiness fixtures /
// Storybook stories can pick a sensible default `from / to`.
export { MOCK_F4_TRENDS_RANGE } from './mock-fixtures';
