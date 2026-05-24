/**
 * Connection-event helpers — F2A simulator.
 *
 * Lightweight, pure helpers for emitting CommunicationStatus messages on a
 * cadence the simulator chooses. Real backoff / jitter / reconnect logic is
 * a F2D concern.
 */
import type { CommunicationStatus, NormalizedTelemetryMessage } from '../models';

export const connectedNow = (nowIso: string): NormalizedTelemetryMessage => ({
  kind: 'connection',
  status: { kind: 'connected', since: nowIso } satisfies CommunicationStatus,
});

export const reconnecting = (lastDataTs: string | undefined): NormalizedTelemetryMessage => ({
  kind: 'connection',
  status: {
    kind: 'reconnecting',
    ...(lastDataTs !== undefined ? { lastDataTs } : {}),
  } satisfies CommunicationStatus,
});

export const disconnected = (lastDataTs: string | undefined): NormalizedTelemetryMessage => ({
  kind: 'connection',
  status: {
    kind: 'disconnected',
    ...(lastDataTs !== undefined ? { lastDataTs } : {}),
  } satisfies CommunicationStatus,
});

export const heartbeat = (nowIso: string): NormalizedTelemetryMessage => ({
  kind: 'heartbeat',
  ts: nowIso,
});
