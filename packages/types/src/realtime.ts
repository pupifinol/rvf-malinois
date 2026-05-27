import type { JobId, WellId } from './domain';
import type { AlarmMessage, SensorHealthSample, TelemetryMessage } from './telemetry';

/**
 * The single WebSocket channel multiplexes several message kinds, each tagged
 * by `kind`. The browser subscribes to a set of (well, tag) pairs; the server
 * decides what scope the user is allowed to subscribe to. Engineering doc §13.
 */
export type RealtimeMessage =
  | { kind: 'telemetry'; payload: TelemetryMessage }
  | { kind: 'alarm'; payload: AlarmMessage }
  | { kind: 'sensor_health'; payload: SensorHealthSample }
  | { kind: 'connection'; payload: ConnectionState };

/**
 * Connection state surfaced to the UI by the WebSocket client.
 *
 * The `ConnectionBanner` primitive consumes this so the operator always knows
 * whether the data they are seeing is live, stale, or offline. Never lie about
 * freshness — engineering doc §24.
 */
export type ConnectionState =
  | { status: 'connecting' }
  | { status: 'connected'; since: string }
  | { status: 'reconnecting'; attempt: number; lastDataAt: string | null }
  | { status: 'disconnected'; lastDataAt: string | null };

/**
 * Client -> server subscription requests. The browser asks for the wells/tags
 * it can render; the server validates scope against the authenticated session.
 */
export interface SubscribeRequest {
  kind: 'subscribe';
  job_id?: JobId;
  well_ids?: WellId[];
  tags?: string[];
}

export interface UnsubscribeRequest {
  kind: 'unsubscribe';
  job_id?: JobId;
  well_ids?: WellId[];
}

export type ClientMessage = SubscribeRequest | UnsubscribeRequest;

// ---------------------------------------------------------------------------
// F4.6E.1 fan-out — server → client events
//
// Discriminated union of the three event kinds the backend emits AFTER the
// per-sample ingestion transaction commits successfully (telemetry insert +
// live_readings projection upsert + alarm evaluation). Per F4.6E-0 §7 / §8.
//
// Shape NOTE: this union is distinct from the F0/F2 `RealtimeMessage` above.
// The F4 events carry an explicit `schema` version + `emittedAt` so future
// payload evolution doesn't break older clients. Frontend consumers narrow
// on `kind`.
// ---------------------------------------------------------------------------

/** Schema version for every F4.6E.1 fan-out event envelope. */
export type RealtimeF4EventSchemaVersion = 'rvf.realtime.v1';

/**
 * `telemetry.reading.accepted` — emitted once per accepted canonical
 * telemetry_readings insert, regardless of quality.
 */
export interface TelemetryReadingAcceptedPayload {
  telemetryReadingId: string;
  tenantId: string;
  unitId: string;
  sensorId: string;
  canonicalTagId: string;
  /** Decimal serialized as string to preserve precision. */
  value: string;
  engineeringUnit: string;
  quality: 'good' | 'uncertain' | 'bad';
  /** ISO-8601 — the reading's timestamp. */
  timestamp: string;
  /** IntegrationSource.kind (e.g. 'manual', 'mqtt'). */
  source: string;
  /** bigint sequence serialized as string, or null when omitted. */
  sequence: string | null;
}

/**
 * `live_reading.updated` — emitted once per projection outcome of `created`
 * or `updated`. Skipped for `skipped_stale`, `skipped_equal_timestamp`,
 * `skipped_quality`.
 */
export interface LiveReadingUpdatedPayload {
  /** UUID for outcome 'created'; null for outcome 'updated'. */
  liveReadingId: string | null;
  tenantId: string;
  unitId: string;
  sensorId: string;
  canonicalTagId: string;
  value: string;
  engineeringUnit: string;
  /** Always 'good' by construction (projection is quality-gated). */
  quality: 'good';
  timestamp: string;
  source: string;
  /** ISO-8601 — when the backend accepted the reading. */
  ingestionTimestamp: string;
  outcome: 'created' | 'updated';
}

/**
 * `alarm.event.created` — emitted once per per-rule outcome of `triggered`.
 * Skipped for `skipped_duplicate_active` and `no_threshold_violated`.
 */
export interface AlarmEventCreatedPayload {
  alarmEventId: string;
  tenantId: string;
  unitId: string;
  canonicalTagId: string;
  alarmRuleId: string;
  severity: 'info' | 'warning' | 'critical';
  /** Decimal serialized as string. */
  triggeredValue: string;
  thresholdViolated: 'low_low' | 'low' | 'high' | 'high_high';
  /** F4.6E.1 only emits creations; lifecycle deferred. */
  state: 'active';
  /** ISO-8601 — equal to the reading's timestamp. */
  firstTriggeredAt: string;
}

/**
 * RealtimeF4Event — server → client envelope union for F4.6E.1.
 * Distinct from the legacy F0/F2 `RealtimeMessage` so adding kinds here
 * never forces an exhaustive-switch change in F2-era consumers.
 */
export type RealtimeF4Event =
  | {
      schema: RealtimeF4EventSchemaVersion;
      kind: 'telemetry.reading.accepted';
      emittedAt: string;
      payload: TelemetryReadingAcceptedPayload;
    }
  | {
      schema: RealtimeF4EventSchemaVersion;
      kind: 'live_reading.updated';
      emittedAt: string;
      payload: LiveReadingUpdatedPayload;
    }
  | {
      schema: RealtimeF4EventSchemaVersion;
      kind: 'alarm.event.created';
      emittedAt: string;
      payload: AlarmEventCreatedPayload;
    };

/**
 * F4.6E.1 subscribe / unsubscribe request bodies. Per F4.6E-0 §9.2.
 *
 * The legacy F2-era `SubscribeRequest` / `UnsubscribeRequest` above stay in
 * place for backward compatibility but are NOT used by F4.6E.1. F4.6E.1
 * Socket.IO event names are 'subscribe' and 'unsubscribe'; the body is the
 * shape below (no inner `kind` field — the event name discriminates).
 */
export interface SubscribeF4Request {
  tenantId: string;
  unitIds?: string[];
}

export interface UnsubscribeF4Request {
  /** Omit BOTH fields to leave every room the socket has joined. */
  tenantId?: string;
  unitIds?: string[];
}

/** Server → client ack returned via the Socket.IO callback after a subscribe. */
export interface SubscribeF4Acknowledgement {
  kind: 'subscribed';
  tenantRoom: string;
  unitRooms: string[];
}

/** Server → client ack returned via the Socket.IO callback after an unsubscribe. */
export interface UnsubscribeF4Acknowledgement {
  kind: 'unsubscribed';
  rooms: string[];
}

/** Returned when the request body is malformed. */
export interface SubscribeF4Error {
  kind: 'subscribe_error';
  reason: string;
}
