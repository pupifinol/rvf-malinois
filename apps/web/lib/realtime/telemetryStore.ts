/**
 * Realtime telemetry store — F2A.
 *
 * Lives OUTSIDE React. The store accepts NormalizedTelemetryMessage objects
 * from any adapter (today: the simulator; tomorrow: the WebSocket), keeps a
 * ring buffer of recent readings per (jobId, tag), and notifies fine-grained
 * subscribers when something they care about changes.
 *
 * Subscription scopes:
 *
 *   - tag      — fires only when a new reading arrives for (jobId, tag).
 *   - job      — fires when any reading or alarm event for that jobId changes.
 *   - connection — fires when the wire-level CommunicationStatus changes.
 *
 * The store is intentionally framework-agnostic so it stays testable in
 * pure Node. React integration lives in `lib/hooks/`, where
 * useSyncExternalStore wraps these subscriptions.
 *
 * Per F2 doc §3 ("Regla de no acoplamiento"): UI never imports the store
 * directly. It goes through hooks. The store is the boundary between
 * "stream-shaped data" and "view-shaped data".
 */
import { RingBuffer } from './ringBuffer';

import type {
  AlarmEvent,
  CommunicationStatus,
  NormalizedTelemetryMessage,
  TelemetryReading,
} from '../telemetry/models';
import type { CanonicalTag, JobId } from '@rvf/types';

const DEFAULT_CAPACITY = 256;

type Listener = () => void;

const tagKey = (jobId: JobId, tag: CanonicalTag): string => `${String(jobId)}#${String(tag)}`;

export interface TelemetryStoreOptions {
  /** Ring buffer capacity per (jobId, tag). Default 256. */
  capacityPerTag?: number;
}

export class TelemetryStore {
  private readonly capacity: number;
  private readonly rings = new Map<string, RingBuffer<TelemetryReading>>();
  private readonly latestAlarms = new Map<string, AlarmEvent>();
  private readonly tagListeners = new Map<string, Set<Listener>>();
  private readonly jobListeners = new Map<string, Set<Listener>>();
  private readonly connListeners = new Set<Listener>();
  private connectionStatus: CommunicationStatus = { kind: 'disconnected' };

  constructor(options: TelemetryStoreOptions = {}) {
    this.capacity = options.capacityPerTag ?? DEFAULT_CAPACITY;
  }

  // -------------------------------------------------------------------------
  // Ingestion
  // -------------------------------------------------------------------------

  ingest(msg: NormalizedTelemetryMessage): void {
    switch (msg.kind) {
      case 'reading':
        this.ingestReading(msg.reading);
        return;
      case 'frame':
        for (const r of msg.frame.readings) this.ingestReading(r);
        return;
      case 'alarm':
        this.latestAlarms.set(tagKey(msg.alarm.jobId, msg.alarm.tag), msg.alarm);
        this.notifyTag(msg.alarm.jobId, msg.alarm.tag);
        this.notifyJob(msg.alarm.jobId);
        return;
      case 'connection':
        this.connectionStatus = msg.status;
        this.notifyConnection();
        return;
      case 'heartbeat':
      case 'snapshot-update':
        // F2A: heartbeats are useful for the stale detector but aren't stored
        // as readings. Snapshot updates are reserved for F2B/C/D — they
        // would hot-swap the active snapshot reference.
        return;
    }
  }

  private ingestReading(reading: TelemetryReading): void {
    const key = tagKey(reading.jobId, reading.tag);
    let ring = this.rings.get(key);
    if (!ring) {
      ring = new RingBuffer<TelemetryReading>(this.capacity);
      this.rings.set(key, ring);
    }
    ring.push(reading);
    this.notifyTag(reading.jobId, reading.tag);
    this.notifyJob(reading.jobId);
  }

  // -------------------------------------------------------------------------
  // Selectors
  // -------------------------------------------------------------------------

  getLatestReading(jobId: JobId, tag: CanonicalTag): TelemetryReading | undefined {
    return this.rings.get(tagKey(jobId, tag))?.latest();
  }

  getHistory(jobId: JobId, tag: CanonicalTag): readonly TelemetryReading[] {
    return this.rings.get(tagKey(jobId, tag))?.toArray() ?? [];
  }

  getLatestAlarm(jobId: JobId, tag: CanonicalTag): AlarmEvent | undefined {
    return this.latestAlarms.get(tagKey(jobId, tag));
  }

  /** Iterate the (jobId, tag) keys this store has data for. Order is insertion. */
  knownTagsForJob(jobId: JobId): CanonicalTag[] {
    const prefix = `${String(jobId)}#`;
    const out: CanonicalTag[] = [];
    for (const key of this.rings.keys()) {
      if (!key.startsWith(prefix)) continue;
      const tag = key.slice(prefix.length);
      out.push(tag as unknown as CanonicalTag);
    }
    return out;
  }

  getConnectionStatus(): CommunicationStatus {
    return this.connectionStatus;
  }

  // -------------------------------------------------------------------------
  // Subscriptions
  // -------------------------------------------------------------------------

  subscribeTag(jobId: JobId, tag: CanonicalTag, listener: Listener): () => void {
    const key = tagKey(jobId, tag);
    let set = this.tagListeners.get(key);
    if (!set) {
      set = new Set();
      this.tagListeners.set(key, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set?.size === 0) this.tagListeners.delete(key);
    };
  }

  subscribeJob(jobId: JobId, listener: Listener): () => void {
    const key = String(jobId);
    let set = this.jobListeners.get(key);
    if (!set) {
      set = new Set();
      this.jobListeners.set(key, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set?.size === 0) this.jobListeners.delete(key);
    };
  }

  subscribeConnection(listener: Listener): () => void {
    this.connListeners.add(listener);
    return () => {
      this.connListeners.delete(listener);
    };
  }

  // -------------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------------

  private notifyTag(jobId: JobId, tag: CanonicalTag): void {
    const set = this.tagListeners.get(tagKey(jobId, tag));
    if (!set) return;
    for (const l of set) l();
  }

  private notifyJob(jobId: JobId): void {
    const set = this.jobListeners.get(String(jobId));
    if (!set) return;
    for (const l of set) l();
  }

  private notifyConnection(): void {
    for (const l of this.connListeners) l();
  }

  /** Reset all rings + listeners. Intended for tests. */
  reset(): void {
    this.rings.clear();
    this.latestAlarms.clear();
    this.tagListeners.clear();
    this.jobListeners.clear();
    this.connListeners.clear();
    this.connectionStatus = { kind: 'disconnected' };
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton + adapter wiring
// ---------------------------------------------------------------------------
// The frontend uses one process-wide store. Hooks read from this singleton.
// Tests construct their own instances and never touch the singleton.

let singleton: TelemetryStore | null = null;

export const getTelemetryStore = (): TelemetryStore => {
  singleton ??= new TelemetryStore();
  return singleton;
};

/** Replace the singleton. Used by sim-demo + tests; not by app code. */
export const setTelemetryStore = (store: TelemetryStore): void => {
  singleton = store;
};

/**
 * Wire an adapter into a store. Returns the function that disconnects the
 * adapter from the store. The caller is responsible for starting/stopping
 * the adapter itself.
 */
export const connectAdapter = (
  store: TelemetryStore,
  adapter: {
    subscribe: (listener: (msg: NormalizedTelemetryMessage) => void) => () => void;
  },
): (() => void) => adapter.subscribe((msg) => store.ingest(msg));
