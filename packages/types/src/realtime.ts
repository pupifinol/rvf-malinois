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
