/**
 * BackendWebSocketTelemetryAdapter — F2A placeholder.
 *
 * This file exists so consumers can write `const adapter: NormalizedTelemetryAdapter`
 * declarations that will compile both today (with `SimulatedNormalizedTelemetryAdapter`)
 * and tomorrow (with this class). F2D will fill in the implementation:
 * connect, exponential backoff with jitter, REST catch-up, heartbeat.
 *
 * The class is intentionally INERT: calling `start()` is a no-op aside from
 * recording the intent. It does not open any sockets, does not touch any
 * industrial protocol, and does not import any transport library here. That
 * keeps F2A compliant with ADR-005's browser-boundary rule.
 */
import type { AdapterListener, NormalizedTelemetryAdapter } from '../adapter';

export interface BackendWebSocketAdapterOptions {
  url: string;
  /** Heartbeat interval in ms — only used when F2D wires up the real socket. */
  heartbeatMs?: number;
}

export class BackendWebSocketTelemetryAdapter implements NormalizedTelemetryAdapter {
  private readonly listeners = new Set<AdapterListener>();
  private started = false;

  constructor(private readonly options: BackendWebSocketAdapterOptions) {}

  start(): void {
    // F2D will: open the WebSocket against this.options.url, attach event
    // handlers, drive heartbeats, run catch-up over REST, and fan messages
    // into `this.listeners`. F2A intentionally does nothing on start so the
    // build cannot accidentally pull in a transport dependency.
    this.started = true;
  }

  stop(): void {
    this.started = false;
  }

  isStarted(): boolean {
    return this.started;
  }

  getUrl(): string {
    return this.options.url;
  }

  subscribe(listener: AdapterListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
