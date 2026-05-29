import { z } from 'zod';

/**
 * Alarm-events read — query + response contracts (F4.6D.2.1).
 *
 * Canonical *server-evaluated alarm state* read surface over the
 * `alarm_events` table populated transactionally by F4.6D.1's
 * `AlarmEvaluationService` (commit `d35a2b8`). This API exists because:
 *
 *   - The realtime fan-out (F4.6E.1) emits `alarm.event.created` only as
 *     tail / notification. Subscribers that disconnect, or panels that
 *     mount fresh, must re-read state via REST. F4.6D.2.1 is that REST.
 *   - The browser-side `evaluateReading(...)` path in `<LiveActiveAlarmsPanel>`
 *     is an ADR-005 violation (the browser must NOT evaluate alarms). The
 *     read API exposes server-evaluated `severity` / `state` /
 *     `thresholdViolated` directly so the panel migration can drop the
 *     in-browser evaluator (panel migration itself is a follow-up phase
 *     and is NOT part of F4.6D.2.1).
 *
 * F4.6D.2.1 scope (locked by F4.6D.2-0):
 *
 *   - Reads `alarm_events` only — never `telemetry_readings`, never
 *     `live_readings`, never the Socket.IO in-memory state, never frontend
 *     mock state.
 *   - All query parameters optional. Sensible defaults: `state='active'`
 *     (operator-meaningful; matches F4.6D.1's current write set) and
 *     `limit=100` (max 500).
 *   - `unitId` / `canonicalTagId` optional UUIDs; `canonicalTagName` XOR
 *     with `canonicalTagId`.
 *   - `severity` optional enum filter.
 *   - `from` / `to` optional time-window filter on `firstTriggeredAt`;
 *     both-or-neither, `from < to`.
 *   - Tenant scoping inherited from `CallerContext`; never trusted from the
 *     client (no `tenantId` query parameter).
 *   - `triggeredValue` is Decimal-serialized to string via
 *     `Prisma.Decimal.toJSON` (matches F4.4F raw-mode posture).
 *   - No-data behavior is `200 OK` with `events: []` — never 404 (matches
 *     F4.4F empty-array posture).
 *
 * `tenantId`, `ruleSnapshot`, `createdAt`, `updatedAt`, `jobId` are
 * intentionally **not** on the wire — see plan §9.3. Exposing
 * `ruleSnapshot` thresholds would invite browser-side re-interpretation
 * of severity / band, exactly the ADR-005 violation this API exists to
 * prevent. A future `thresholdContext` derived field can be added
 * additively if a consumer demands it.
 */

// =============================================================================
// Enums (mirror F4.6A.1 CHECK constraints)
// =============================================================================

/** State enum (matches `alarm_events.state` CHECK; F4.6D.1 writes only `'active'`). */
export const ALARM_EVENT_STATES = ['active', 'acknowledged', 'cleared'] as const;
export type AlarmEventState = (typeof ALARM_EVENT_STATES)[number];

/** Severity enum (matches `alarm_events.severity` CHECK). */
export const ALARM_EVENT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type AlarmEventSeverity = (typeof ALARM_EVENT_SEVERITIES)[number];

/** Threshold-band enum (matches `alarm_events.threshold_violated` CHECK). */
export const ALARM_EVENT_THRESHOLD_BANDS = ['low_low', 'low', 'high', 'high_high'] as const;
export type AlarmEventThresholdBand = (typeof ALARM_EVENT_THRESHOLD_BANDS)[number];

/** Default applied when the query omits `state`. Operator-meaningful. */
export const ALARM_EVENTS_STATE_DEFAULT: AlarmEventState = 'active';

/** Pagination bounds. */
export const ALARM_EVENTS_LIMIT_MAX = 500;
export const ALARM_EVENTS_LIMIT_DEFAULT = 100;

// =============================================================================
// Request schema
// =============================================================================

/**
 * Alarm-events query schema for the controller's Zod pipe. All parameters
 * optional; sensible defaults applied for `state` and `limit`. `from` and
 * `to` are coerced from ISO-8601 strings and must appear together with
 * `from < to`. `canonicalTagId` and `canonicalTagName` are XOR (supplying
 * both is rejected as ambiguous).
 */
export const AlarmEventsQuerySchema = z
  .object({
    unitId: z.string().uuid().optional(),
    canonicalTagId: z.string().uuid().optional(),
    canonicalTagName: z.string().min(1).max(64).optional(),
    state: z.enum(ALARM_EVENT_STATES).default(ALARM_EVENTS_STATE_DEFAULT),
    severity: z.enum(ALARM_EVENT_SEVERITIES).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(ALARM_EVENTS_LIMIT_MAX)
      .default(ALARM_EVENTS_LIMIT_DEFAULT),
  })
  .strict()
  .refine((q) => !(q.canonicalTagId !== undefined && q.canonicalTagName !== undefined), {
    message:
      'supplying both `canonicalTagId` and `canonicalTagName` is rejected as ambiguous; ' +
      'supply at most one, or omit both',
    path: ['canonicalTagName'],
  })
  .refine((q) => q.from === undefined || q.to !== undefined, {
    message: '`to` is required when `from` is supplied',
    path: ['to'],
  })
  .refine((q) => q.to === undefined || q.from !== undefined, {
    message: '`from` is required when `to` is supplied',
    path: ['from'],
  })
  .refine((q) => q.from === undefined || q.to === undefined || q.from.getTime() < q.to.getTime(), {
    message: '`from` must be strictly less than `to`',
    path: ['from'],
  });

export type AlarmEventsQuery = z.infer<typeof AlarmEventsQuerySchema>;

// =============================================================================
// Response shape
// =============================================================================

/**
 * One row of the alarm-events response — a derived projection of one
 * `alarm_events` row.
 *
 * The wire shape is a **derived view**, not a Prisma row dump:
 *   - `id` is renamed to `alarmEventId` (matches the F4.6E.1 envelope's
 *     `payload.alarmEventId` field — a panel can match by id across the
 *     REST + realtime streams).
 *   - `tenantId` / `ruleSnapshot` / `createdAt` / `updatedAt` / `jobId`
 *     are stripped (see plan §9.3 — none on the wire).
 *   - `canonicalTagId` is flattened into a `canonicalTag` nested summary
 *     (matches the F4.4F / F4.6F.1 / F4.6C.2.1 shape).
 *   - `triggeredValue` keeps the Prisma Decimal shape (JSON-serializes to
 *     a string).
 *   - `alarmRuleId` is nullable (the schema is `SetNull` on rule delete;
 *     events outlive their rules).
 *
 * Lifecycle columns (`acknowledgedAt` / `acknowledgedBy` / `clearedAt`) are
 * surfaced on the wire as `null` today — F4.6D.1 writes only `state='active'`
 * and leaves them unpopulated. Surfacing them now means F4.6D.3 can land the
 * lifecycle transitions without an additive contract bump.
 */
export interface AlarmEventRow {
  alarmEventId: string;
  unitId: string;
  canonicalTag: {
    id: string;
    name: string;
    displayName: string;
    canonicalUnit: string;
    category: string;
    precision: number;
  };
  /** Nullable — `SetNull` cascade when the referenced rule is deleted. */
  alarmRuleId: string | null;
  severity: AlarmEventSeverity;
  state: AlarmEventState;
  /** Decimal — serialized as a string via `Prisma.Decimal.toJSON`. */
  triggeredValue: unknown;
  thresholdViolated: AlarmEventThresholdBand;
  /** ISO-8601 — the reading's timestamp at trigger time. */
  firstTriggeredAt: Date;
  /** Reserved for F4.6D.3 lifecycle; `null` until that phase ships. */
  acknowledgedAt: Date | null;
  /** Reserved for F4.6D.3 lifecycle; `null` until that phase ships. */
  acknowledgedBy: string | null;
  /** Reserved for F4.6D.3 lifecycle; `null` until that phase ships. */
  clearedAt: Date | null;
}

/**
 * Alarm-events envelope.
 *
 * `generatedAt` is the server-side response-generation timestamp.
 * `source` is the constant string `'alarm_events'` so the caller can
 * label the wire honestly (per ADR-005 "never lie about freshness").
 * `state` echoes the parsed (defaulted) query state so the caller can label
 * "showing active events" / "showing cleared events" without re-reading the
 * query string.
 * `events` is zero or more rows ordered by `firstTriggeredAt DESC` — the
 * empty array is the no-data answer for both "known tenant, no events" and
 * "unknown unit" / "unknown canonical tag" (matches the F4.4F empty-array
 * posture; never 404 on the empty paths).
 */
export interface AlarmEventsResponse {
  generatedAt: Date;
  source: 'alarm_events';
  state: AlarmEventState;
  events: AlarmEventRow[];
}
