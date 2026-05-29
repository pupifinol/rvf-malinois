/**
 * F4.6D.2.1 — Alarm-events adapter (data-source-aware).
 *
 * Mirrors the F4.6C.2.1 latest-value adapter. Two branches gated by
 * `NEXT_PUBLIC_RVF_DATA_SOURCE`:
 *
 *   1. Mock branch resolves from the deterministic `MOCK_F4_ALARM_EVENTS`
 *      map in `./mock-fixtures.ts`. Applies the same XOR refine the
 *      backend Zod schema does (rejecting both `canonicalTagId` and
 *      `canonicalTagName` together) and the same `from < to` time-window
 *      rule when supplied. Empty envelope for unknown / un-bound units —
 *      matches the F4.4F empty-array posture; the API never returns 404
 *      on these paths.
 *
 *   2. API branch delegates to `getAlarmEvents` from `@/lib/api/f4`. No
 *      `unitId` UUID guardrail is enforced — `unitId` is optional in
 *      F4.6D.2.1 (see plan §13.4); a non-UUID `unitId` would surface as
 *      the backend's Zod 400. The follow-up panel migration may add a
 *      defensive UUID assertion at its own boundary.
 *
 * Decisions match F4.6D.2-0 §13:
 *
 *   - All query parameters optional. Mock-mode default `state='active'`
 *     mirrors the backend Zod default.
 *   - Unknown unit → empty envelope.
 *   - Unknown canonical tag → empty envelope (mirrors the F4.6C.2.1 path).
 *   - Both tag identifiers together → `RvfApiError(400, …)` from the
 *     adapter in mock mode (mirrors the backend XOR refine). The api
 *     branch delegates to the backend for this refine — sending both
 *     produces the same 400 from the server.
 *   - `from` / `to` must appear together with `from < to` — same refine
 *     as the backend.
 */

import { MOCK_F4_ALARM_EVENTS, MOCK_F4_CANONICAL_TAGS } from './mock-fixtures';

import {
  type AlarmEventRow,
  type AlarmEventsResponse,
  type GetAlarmEventsParams,
  type GetOptions,
  RvfApiError,
  getAlarmEvents,
  isApiSource,
} from '@/lib/api/f4';

const MOCK_URL = 'mock:/alarms/events';

const toDate = (raw: Date | string): Date => (raw instanceof Date ? raw : new Date(raw));

const adapterGetAlarmEventsMock = (params: GetAlarmEventsParams): Promise<AlarmEventsResponse> => {
  // XOR refine — mirrors backend Zod.
  if (params.canonicalTagId !== undefined && params.canonicalTagName !== undefined) {
    return Promise.reject(
      new RvfApiError(
        400,
        MOCK_URL,
        null,
        'supplying both `canonicalTagId` and `canonicalTagName` is rejected as ambiguous; ' +
          'supply at most one, or omit both',
      ),
    );
  }

  // Both-or-neither time window — mirrors backend Zod.
  if ((params.from !== undefined) !== (params.to !== undefined)) {
    return Promise.reject(
      new RvfApiError(
        400,
        MOCK_URL,
        null,
        '`from` and `to` must appear together (supplied one without the other)',
      ),
    );
  }
  if (params.from !== undefined && params.to !== undefined) {
    const fromMs = toDate(params.from).getTime();
    const toMs = toDate(params.to).getTime();
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
      return Promise.reject(
        new RvfApiError(400, MOCK_URL, null, '`from` must be strictly less than `to`'),
      );
    }
  }

  const state = params.state ?? 'active';
  const generatedAt = new Date().toISOString();

  // The fixture is keyed by unitId. Without a unit we'd need a cross-unit
  // scan; in mock mode we collapse that to the union of all known unit
  // arrays — matches the cross-tenant `SystemContext` posture on the
  // backend without inventing a fake tenant filter.
  const candidateRows: AlarmEventRow[] = [];
  if (params.unitId !== undefined) {
    const fixture = MOCK_F4_ALARM_EVENTS[params.unitId];
    if (fixture) candidateRows.push(...fixture);
  } else {
    for (const rows of Object.values(MOCK_F4_ALARM_EVENTS)) {
      candidateRows.push(...rows);
    }
  }

  // Tag identifier resolution. Unknown tag → empty envelope (mirrors the
  // F4.6C.2.1 path; never 404).
  let resolvedTagId: string | null | undefined;
  if (params.canonicalTagId !== undefined) {
    const tag = MOCK_F4_CANONICAL_TAGS.find((t) => t.id === params.canonicalTagId);
    resolvedTagId = tag ? tag.id : null;
  } else if (params.canonicalTagName !== undefined) {
    const tag = MOCK_F4_CANONICAL_TAGS.find((t) => t.name === params.canonicalTagName);
    resolvedTagId = tag ? tag.id : null;
  }
  if (resolvedTagId === null) {
    return Promise.resolve({
      generatedAt,
      source: 'alarm_events',
      state,
      events: [],
    });
  }

  let filtered = candidateRows.filter((row) => row.state === state);

  if (resolvedTagId !== undefined) {
    filtered = filtered.filter((row) => row.canonicalTag.id === resolvedTagId);
  }
  if (params.severity !== undefined) {
    filtered = filtered.filter((row) => row.severity === params.severity);
  }
  if (params.from !== undefined && params.to !== undefined) {
    const fromMs = toDate(params.from).getTime();
    const toMs = toDate(params.to).getTime();
    filtered = filtered.filter((row) => {
      const ts = Date.parse(row.firstTriggeredAt);
      return Number.isFinite(ts) && ts >= fromMs && ts < toMs;
    });
  }

  // Ordering: firstTriggeredAt DESC (matches backend `orderBy`).
  filtered.sort((a, b) => Date.parse(b.firstTriggeredAt) - Date.parse(a.firstTriggeredAt));

  // Limit (server default applied in the backend Zod; mirror conservatively
  // here so mock callers see the same cap).
  const limit = params.limit ?? 100;
  const events = filtered.slice(0, limit);

  return Promise.resolve({
    generatedAt,
    source: 'alarm_events',
    state,
    events,
  });
};

export const adapterGetAlarmEvents = async (
  params: GetAlarmEventsParams,
  options?: GetOptions,
): Promise<AlarmEventsResponse> => {
  if (isApiSource()) {
    return getAlarmEvents(params, options);
  }
  return adapterGetAlarmEventsMock(params);
};

// Re-export the typed envelope so callers can import from a single location.
export type { AlarmEventRow, AlarmEventsResponse, GetAlarmEventsParams };
