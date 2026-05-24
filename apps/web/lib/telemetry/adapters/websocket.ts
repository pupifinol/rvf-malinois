/**
 * BackendWebSocketTelemetryAdapter — F2D.
 *
 * Implements `NormalizedTelemetryAdapter` against a backend that pushes the
 * SAME normalized message contract the F2A simulator emits today. Per
 * ADR-005 this is the ONLY transport the browser ever speaks: WebSocket
 * for live telemetry/alarms + heartbeats + connection events. No MQTT, no
 * Modbus, no OPC-UA, no PLC, no Node-RED, no ThingsBoard, no Gateway Stick
 * — those live in the edge/backend, never in the browser. If the future
 * brings extra origins, they enter at the backend boundary; this adapter
 * stays oblivious.
 *
 * ### What the adapter owns
 *
 *   - Connecting/reconnecting to a single normalized WebSocket URL.
 *   - Exponential backoff with jitter on disconnect (capped at 30 s).
 *   - Heartbeat-timeout supervision (close+reconnect if the server stops
 *     sending anything for `heartbeatTimeoutMs`).
 *   - Strict parsing of inbound JSON against the NormalizedTelemetryMessage
 *     contract; malformed or unknown frames are dropped silently in prod
 *     and logged via `console.warn` in development. Listeners never see a
 *     malformed message.
 *   - Surfacing `CommunicationStatus` (connected / reconnecting /
 *     disconnected) so the existing F2A `useConnectionStatus` hook keeps
 *     working without any changes.
 *
 * ### What the adapter intentionally does NOT do
 *
 *   - It does NOT call any REST endpoint. `onCatchUp` is exposed as a
 *     placeholder so a future phase can wire REST catch-up after a
 *     reconnect without touching this file. F2D ships the seam, not the
 *     call.
 *   - It does NOT speak any industrial protocol. The URL must be a
 *     normalized backend WebSocket served by the RVF API gateway.
 *   - It does NOT mutate readings. Whatever the backend sends, that is
 *     what hits the store — the store is the only place readings are kept.
 *   - It does NOT depend on React. start/stop/subscribe are framework-
 *     agnostic; a React wrapper would live in `components/telemetry/` if
 *     we ever needed one, but the shared runtime is enough.
 *
 * ### React 19 strict mode + HMR safety
 *
 *   - `start()` is idempotent: a second call while running is a no-op.
 *   - `stop()` is idempotent: a second call while stopped is a no-op.
 *   - `stop()` sets an intentional-stop flag the reconnect timer reads
 *     before opening a new socket — so a Strict-Mode double-mount cannot
 *     leave a zombie socket behind.
 *   - `subscribe()` keeps a Set, dedupes the listener identity, and
 *     returns a stable unsubscribe.
 *
 * Tests inject a `createSocket` function so the adapter never touches the
 * real `WebSocket` global, and a `setTimeout`/`clearTimeout` pair so
 * reconnect timing is deterministic. See `websocket.test.ts`.
 */
import { connectedNow, disconnected, reconnecting } from '../simulator/connection';

import type { AdapterListener, NormalizedTelemetryAdapter } from '../adapter';
import type {
  AlarmEvent,
  CommunicationStatus,
  DataQuality,
  NormalizedTelemetryMessage,
  TelemetryFrame,
  TelemetryReading,
} from '../models';
import type { CanonicalTag, JobId } from '@rvf/types';

// ---------------------------------------------------------------------------
// Minimal WebSocket shape — narrow enough for tests to fake without pulling
// in the DOM lib type. Matches the subset of `WebSocket` we actually use.
// ---------------------------------------------------------------------------

export interface WebSocketLike {
  readonly readyState: number;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

export type CreateWebSocket = (url: string) => WebSocketLike;

/**
 * Timer handle is opaque — production uses `setTimeout`'s Node `Timeout`,
 * tests use a numeric id. The adapter never introspects the handle; it
 * only passes it back to `clearTimer`, so making it `unknown` lets any
 * implementation plug in.
 */
type TimerHandle = unknown;
type TimerSet = (cb: () => void, ms: number) => TimerHandle;
type TimerClear = (handle: TimerHandle) => void;

// ---------------------------------------------------------------------------
// Backoff
// ---------------------------------------------------------------------------

const BACKOFF_STEPS_MS: readonly number[] = [500, 1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

const backoffFor = (attempt: number, rng: () => number): number => {
  const idx = Math.min(attempt, BACKOFF_STEPS_MS.length - 1);
  const base = BACKOFF_STEPS_MS[idx] ?? 30_000;
  // 0..25% jitter on top, never below `base`.
  const jitter = base * 0.25 * rng();
  return Math.round(base + jitter);
};

// ---------------------------------------------------------------------------
// Strict parser for the normalized message contract
// ---------------------------------------------------------------------------

const isObj = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x);

const isValidIso = (s: unknown): s is string =>
  typeof s === 'string' && !Number.isNaN(Date.parse(s));

const isQuality = (q: unknown): q is DataQuality =>
  q === 'good' || q === 'estimated' || q === 'uncertain' || q === 'bad';

const parseReading = (x: unknown): TelemetryReading | null => {
  if (!isObj(x)) return null;
  if (!isValidIso(x.ts)) return null;
  if (typeof x.jobId !== 'string') return null;
  if (typeof x.tag !== 'string') return null;
  if (typeof x.unit !== 'string') return null;
  if (!isQuality(x.quality)) return null;
  if (x.value !== null && typeof x.value !== 'number') return null;
  const r: TelemetryReading = {
    ts: x.ts,
    jobId: x.jobId as unknown as JobId,
    tag: x.tag as unknown as CanonicalTag,
    value: x.value,
    unit: x.unit,
    quality: x.quality,
  };
  if (typeof x.sensorId === 'string') r.sensorId = x.sensorId;
  if (typeof x.seq === 'number') r.seq = x.seq;
  return r;
};

const parseFrame = (x: unknown): TelemetryFrame | null => {
  if (!isObj(x)) return null;
  if (!isValidIso(x.ts)) return null;
  if (typeof x.jobId !== 'string') return null;
  if (!Array.isArray(x.readings)) return null;
  const readings: TelemetryReading[] = [];
  for (const r of x.readings) {
    const parsed = parseReading(r);
    if (!parsed) return null;
    readings.push(parsed);
  }
  return { ts: x.ts, jobId: x.jobId as unknown as JobId, readings };
};

const isWireAlarmKind = (k: unknown): k is AlarmEvent['state'] =>
  k === 'normal' ||
  k === 'warning_low' ||
  k === 'warning_high' ||
  k === 'alarm_low' ||
  k === 'alarm_high' ||
  k === 'no_data';

const parseAlarm = (x: unknown): AlarmEvent | null => {
  if (!isObj(x)) return null;
  if (!isValidIso(x.ts)) return null;
  if (typeof x.jobId !== 'string') return null;
  if (typeof x.tag !== 'string') return null;
  if (!isWireAlarmKind(x.state)) return null;
  if (x.value !== null && typeof x.value !== 'number') return null;
  if (x.thresholdsSource !== 'commissioning_snapshot') return null;
  const ev: AlarmEvent = {
    ts: x.ts,
    jobId: x.jobId as unknown as JobId,
    tag: x.tag as unknown as CanonicalTag,
    state: x.state,
    value: x.value,
    thresholdsSource: 'commissioning_snapshot',
  };
  if (typeof x.threshold === 'number') ev.threshold = x.threshold;
  return ev;
};

const parseConnection = (x: unknown): CommunicationStatus | null => {
  if (!isObj(x)) return null;
  switch (x.kind) {
    case 'connected':
      return isValidIso(x.since) ? { kind: 'connected', since: x.since } : null;
    case 'reconnecting':
      return {
        kind: 'reconnecting',
        ...(isValidIso(x.lastDataTs) ? { lastDataTs: x.lastDataTs } : {}),
      };
    case 'disconnected':
      return {
        kind: 'disconnected',
        ...(isValidIso(x.lastDataTs) ? { lastDataTs: x.lastDataTs } : {}),
      };
    default:
      return null;
  }
};

/**
 * Parse a raw inbound payload into a NormalizedTelemetryMessage, or return
 * null when the payload is malformed or claims an unknown `kind`. Pure;
 * no IO, no side effects.
 */
export const parseNormalizedMessage = (raw: unknown): NormalizedTelemetryMessage | null => {
  let x: unknown = raw;
  if (typeof raw === 'string') {
    try {
      x = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isObj(x)) return null;
  switch (x.kind) {
    case 'reading': {
      const r = parseReading(x.reading);
      return r ? { kind: 'reading', reading: r } : null;
    }
    case 'frame': {
      const f = parseFrame(x.frame);
      return f ? { kind: 'frame', frame: f } : null;
    }
    case 'alarm': {
      const a = parseAlarm(x.alarm);
      return a ? { kind: 'alarm', alarm: a } : null;
    }
    case 'heartbeat':
      return isValidIso(x.ts) ? { kind: 'heartbeat', ts: x.ts } : null;
    case 'connection': {
      const s = parseConnection(x.status);
      return s ? { kind: 'connection', status: s } : null;
    }
    // 'snapshot-update' is intentionally NOT parsed by the wire boundary
    // today: snapshots travel over REST (ADR-005). If a server ever pushes
    // one we treat it as unknown and drop it rather than half-validate.
    default:
      return null;
  }
};

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export interface BackendWebSocketAdapterOptions {
  /** Normalized backend WebSocket URL (`wss://...`). */
  url: string;
  /**
   * Inactivity timeout. If no message of any kind arrives within this
   * window the adapter closes the socket and reconnects. Default 30 s.
   */
  heartbeatTimeoutMs?: number;
  /**
   * Optional catch-up hook. Invoked on every successful reconnect with
   * the timestamp of the last reading the adapter delivered (undefined
   * if none yet). F2D ships the seam; the implementation lives in a
   * future phase against a REST endpoint that does not exist yet.
   */
  onCatchUp?: (sinceIso: string | undefined) => void;
  /** Injection points for tests — never used in production. */
  createSocket?: CreateWebSocket;
  setTimer?: TimerSet;
  clearTimer?: TimerClear;
  now?: () => number;
  random?: () => number;
}

const DEFAULT_HEARTBEAT_TIMEOUT_MS = 30_000;

const defaultCreateSocket: CreateWebSocket = (url) => {
  const Ctor = (globalThis as { WebSocket?: new (url: string) => WebSocketLike }).WebSocket;
  if (!Ctor) {
    throw new Error('WebSocket is not available in this environment — cannot open ' + url);
  }
  return new Ctor(url);
};

export class BackendWebSocketTelemetryAdapter implements NormalizedTelemetryAdapter {
  private readonly listeners = new Set<AdapterListener>();
  private readonly url: string;
  private readonly heartbeatTimeoutMs: number;
  private readonly onCatchUp: ((sinceIso: string | undefined) => void) | undefined;
  private readonly createSocket: CreateWebSocket;
  private readonly setTimer: TimerSet;
  private readonly clearTimer: TimerClear;
  private readonly now: () => number;
  private readonly random: () => number;

  private socket: WebSocketLike | null = null;
  private running = false;
  /** True between `stop()` and the next `start()`. Prevents zombie reconnects. */
  private intentionallyStopped = false;
  /** Timer handles are opaque; `null` sentinel means "no timer armed". */
  private reconnectTimer: TimerHandle = null;
  private heartbeatTimer: TimerHandle = null;
  private reconnectAttempt = 0;
  private lastDataTs: string | undefined;

  constructor(options: BackendWebSocketAdapterOptions) {
    this.url = options.url;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;
    this.onCatchUp = options.onCatchUp;
    this.createSocket = options.createSocket ?? defaultCreateSocket;
    this.setTimer = options.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimer =
      options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.now = options.now ?? (() => Date.now());
    this.random = options.random ?? Math.random;
  }

  // ---- public API ---------------------------------------------------------

  start(): void {
    if (this.running) return;
    this.running = true;
    this.intentionallyStopped = false;
    this.reconnectAttempt = 0;
    if (!this.url) {
      // No URL configured — never open a socket. Surface a stable
      // `disconnected` status and stop. This is the safe local-dev path
      // when the factory was asked for `websocket` but no URL was wired.
      this.emit(disconnected(this.lastDataTs));
      return;
    }
    // Emit a `reconnecting` status BEFORE the socket actually opens so
    // any UI subscribed to connection status renders the right banner.
    this.emit(reconnecting(this.lastDataTs));
    this.openSocket();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.intentionallyStopped = true;
    this.clearReconnectTimer();
    this.clearHeartbeatTimer();
    this.closeSocket();
    this.emit(disconnected(this.lastDataTs));
  }

  subscribe(listener: AdapterListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ---- introspection (test + dev only) ------------------------------------

  isStarted(): boolean {
    return this.running;
  }

  getUrl(): string {
    return this.url;
  }

  // ---- socket lifecycle ---------------------------------------------------

  private openSocket(): void {
    if (this.intentionallyStopped) return;
    let ws: WebSocketLike;
    try {
      ws = this.createSocket(this.url);
    } catch {
      // Constructor failure — schedule a reconnect attempt rather than crash.
      this.scheduleReconnect();
      return;
    }
    this.socket = ws;

    ws.onopen = () => {
      // Server accepted the upgrade. Reset backoff, surface connected
      // status, kick off catch-up, and arm the heartbeat watchdog.
      this.reconnectAttempt = 0;
      const sinceIso = new Date(this.now()).toISOString();
      this.emit(connectedNow(sinceIso));
      if (this.onCatchUp) {
        // We intentionally do not await this — catch-up is a placeholder
        // for a future REST call. Errors there must not crash the
        // adapter; that's the future implementation's responsibility.
        try {
          this.onCatchUp(this.lastDataTs);
        } catch {
          // ignore — placeholder.
        }
      }
      this.armHeartbeat();
    };

    ws.onmessage = (ev) => {
      this.armHeartbeat();
      const parsed = parseNormalizedMessage(ev.data);
      if (!parsed) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[BackendWebSocketTelemetryAdapter] dropped malformed message');
        }
        return;
      }
      this.trackLastData(parsed);
      this.emit(parsed);
    };

    ws.onerror = () => {
      // No state change here — `onclose` will follow and drive reconnect.
    };

    ws.onclose = () => {
      this.clearHeartbeatTimer();
      this.socket = null;
      if (this.intentionallyStopped) return;
      this.emit(reconnecting(this.lastDataTs));
      this.scheduleReconnect();
    };
  }

  private closeSocket(): void {
    if (!this.socket) return;
    try {
      this.socket.close();
    } catch {
      // ignore — best effort
    }
    this.socket = null;
  }

  private scheduleReconnect(): void {
    if (this.intentionallyStopped) return;
    this.clearReconnectTimer();
    const delay = backoffFor(this.reconnectAttempt, this.random);
    this.reconnectAttempt += 1;
    this.reconnectTimer = this.setTimer(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === null) return;
    this.clearTimer(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  // ---- heartbeat watchdog -------------------------------------------------

  private armHeartbeat(): void {
    this.clearHeartbeatTimer();
    this.heartbeatTimer = this.setTimer(() => {
      // No message for `heartbeatTimeoutMs`. Treat the socket as dead:
      // close it (onclose will fire, scheduleReconnect runs), and surface
      // a `reconnecting` status now so the UI immediately reflects it.
      this.heartbeatTimer = null;
      if (this.intentionallyStopped) return;
      this.emit(reconnecting(this.lastDataTs));
      this.closeSocket();
      this.scheduleReconnect();
    }, this.heartbeatTimeoutMs);
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer === null) return;
    this.clearTimer(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  // ---- helpers ------------------------------------------------------------

  private trackLastData(msg: NormalizedTelemetryMessage): void {
    if (msg.kind === 'reading') this.lastDataTs = msg.reading.ts;
    else if (msg.kind === 'frame') this.lastDataTs = msg.frame.ts;
    else if (msg.kind === 'heartbeat') this.lastDataTs = msg.ts;
  }

  private emit(msg: NormalizedTelemetryMessage): void {
    for (const l of this.listeners) {
      try {
        l(msg);
      } catch {
        // A subscriber throwing must not derail the adapter. Drop and
        // continue — the surviving listeners still get the message.
      }
    }
  }
}
