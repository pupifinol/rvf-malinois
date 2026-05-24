/**
 * Telemetry domain models — F2A foundation.
 *
 * These are PURE types. No React, no IO, no module-level state. They define
 * the contract the frontend speaks with the normalized backend stream
 * (today: the simulator; tomorrow: the WebSocket gateway). Per ADR-005, the
 * browser never sees MQTT / Modbus / OPC-UA / PLC / historian payloads —
 * everything reaching the frontend is normalized into the shapes below.
 *
 * Naming follows the F2 architecture document verbatim (section 5).
 */
import type { AlarmState } from '../alarms/types';
import type { CommissioningSnapshot } from '../jobs/types';
import type { CanonicalTag, JobId } from '@rvf/types';

// ---------------------------------------------------------------------------
// Data quality
// ---------------------------------------------------------------------------
// Per-reading quality, set at the edge. Distinct from telemetry STATUS
// (live/delayed/stale/offline) which is computed by the frontend from the
// age of the last reading. A reading with quality 'bad' is data we received
// but cannot trust; a 'stale' status means we received nothing recently.

export type DataQuality = 'good' | 'estimated' | 'uncertain' | 'bad';

// ---------------------------------------------------------------------------
// Telemetry readings + frames
// ---------------------------------------------------------------------------

export interface TelemetryReading {
  /** ISO-8601 UTC. Measured at the edge — never use cloud arrival time. */
  ts: string;
  /** Master key of the model. Every reading is anchored to a job. */
  jobId: JobId;
  tag: CanonicalTag;
  /** Numeric value in canonical units. `null` when quality === 'bad'. */
  value: number | null;
  /** Canonical unit string (psi, °F, bbl/d...). */
  unit: string;
  quality: DataQuality;
  /** Source sensor — preserves ADR-004 traceability. */
  sensorId?: string;
  /** Monotonic counter for loss detection. */
  seq?: number;
}

/** Several tags of the same job at the same timestamp — optional network optimization. */
export interface TelemetryFrame {
  ts: string;
  jobId: JobId;
  readings: TelemetryReading[];
}

// ---------------------------------------------------------------------------
// Alarm events on the wire
// ---------------------------------------------------------------------------
// A normalized alarm event the backend can push. F2A doesn't push these from
// the simulator routinely, but the message type must exist so the contract is
// complete and contract tests can validate it.

export type WireAlarmKind =
  | 'normal'
  | 'warning_low'
  | 'warning_high'
  | 'alarm_low'
  | 'alarm_high'
  | 'no_data';

export interface AlarmEvent {
  jobId: JobId;
  tag: CanonicalTag;
  ts: string;
  state: WireAlarmKind;
  value: number | null;
  threshold?: number;
  /** Always 'commissioning_snapshot' — see ADR-005, regla 1. */
  thresholdsSource: 'commissioning_snapshot';
}

// ---------------------------------------------------------------------------
// Communication status
// ---------------------------------------------------------------------------
// Coarse-grained connection state, surfaced from the adapter. F2A uses this
// to drive a connection banner without hardcoding socket semantics.

export type CommunicationStatus =
  | { kind: 'connected'; since: string }
  | { kind: 'reconnecting'; lastDataTs?: string }
  | { kind: 'disconnected'; lastDataTs?: string };

// ---------------------------------------------------------------------------
// The single multiplexed message the frontend ever sees
// ---------------------------------------------------------------------------
// The `snapshot-update` kind references CommissioningSnapshot from lib/jobs;
// it's imported at the top of this file. The shape isn't redeclared here to
// avoid drift.

export type NormalizedTelemetryMessage =
  | { kind: 'reading'; reading: TelemetryReading }
  | { kind: 'frame'; frame: TelemetryFrame }
  | { kind: 'alarm'; alarm: AlarmEvent }
  | { kind: 'snapshot-update'; snapshot: CommissioningSnapshot }
  | { kind: 'heartbeat'; ts: string }
  | { kind: 'connection'; status: CommunicationStatus };

// ---------------------------------------------------------------------------
// Stale / offline status — computed by the frontend, not pushed by the wire
// ---------------------------------------------------------------------------

export type TelemetryStatus = 'live' | 'delayed' | 'stale' | 'offline';

export interface StaleState {
  jobId: JobId;
  tag: CanonicalTag;
  status: TelemetryStatus;
  /** Timestamp of the last reading the store has for this (jobId, tag). */
  lastTs?: string;
  /** Age of the last reading, in seconds, at evaluation time. */
  ageSec?: number;
}

// ---------------------------------------------------------------------------
// Per-job, per-tag rolled-up view consumed by UI components
// ---------------------------------------------------------------------------
// The `AlarmState` type is imported at the top of this file; we surface it
// here as part of the UnitTelemetrySnapshot shape, so a UI component never
// has to import both `lib/telemetry` and `lib/alarms` to render a tile.

/**
 * A convenience reading-shaped value handed back by useLiveValue. Mirrors
 * the wire shape but only what the UI tends to consume. Distinct type so
 * widening the wire later doesn't accidentally widen the hook contract.
 */
export interface SensorReading {
  jobId: JobId;
  tag: CanonicalTag;
  value: number | null;
  unit: string;
  quality: DataQuality;
  ts?: string;
  status: TelemetryStatus;
}

export interface UnitTelemetrySnapshot {
  jobId: JobId;
  generatedAt: string;
  byTag: Record<
    CanonicalTag,
    {
      reading?: TelemetryReading;
      alarm: AlarmState;
      stale: TelemetryStatus;
    }
  >;
}
