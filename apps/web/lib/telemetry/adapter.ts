/**
 * NormalizedTelemetryAdapter — the single seam between the frontend and
 * "the source of telemetry", whatever that source is.
 *
 * Per ADR-005, this is the ONLY interface the frontend ever talks to. F2A
 * provides the simulated implementation. F2D will add a WebSocket-backed
 * implementation pointing at the real backend. Nothing else in the
 * frontend changes — that's the whole point of having this seam.
 */
import type { NormalizedTelemetryMessage } from './models';

export type AdapterListener = (msg: NormalizedTelemetryMessage) => void;

export interface NormalizedTelemetryAdapter {
  /** Begin emitting messages. Idempotent. */
  start(): void;
  /** Stop emitting messages and release any timers. Idempotent. */
  stop(): void;
  /** Subscribe to inbound messages. Returns an unsubscribe function. */
  subscribe(listener: AdapterListener): () => void;
}
