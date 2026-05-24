/**
 * Alarm Center view-model types — F2C.
 *
 * These types describe what the internal Alarm Center renders, derived
 * from F2A's evaluator + stale detector + active job snapshots. They are
 * NOT what the backend pushes — wire-level alarm events live in
 * `lib/telemetry/models.ts` as `AlarmEvent`. The view-model is the UI's
 * own shape: it carries identity (so React can key it), source-type
 * (process vs. data quality vs. communication), severity (ISA-18.2 chip),
 * and lifecycle (active / acked / cleared).
 *
 * Critically: per ADR-005 regla 1, every event still traces back to the
 * commissioning snapshot. The threshold value carried on the event is
 * the one captured at commissioning time for THAT job — never a default
 * or a value from the Units catalog.
 */
import type { AlarmState, ThresholdHit } from '../types';
import type { DataQuality, TelemetryStatus } from '@/lib/telemetry/models';
import type { CanonicalTag, EquipmentId, JobId, WellId } from '@rvf/types';

/**
 * ISA-18.2 priority. Preserved verbatim from the existing Alarms screen so
 * the visual palette (--alarm-urgent/high/medium/low) is reused as-is.
 */
export type AlarmCenterSeverity = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';

/** Lifecycle a row can be in within the operator's view. */
export type AlarmCenterLifecycle = 'ACTIVE' | 'ACKED' | 'CLEARED';

/**
 * Where the alarm came from:
 *   - PROCESS:        a process variable crossed a threshold in the snapshot.
 *   - DATA_QUALITY:   the reading arrived but its `quality` is bad/null.
 *   - COMMUNICATION:  no recent reading for this tag (stale or offline).
 *
 * Keeping these separated is an F2C requirement: data-quality and comms
 * issues are an instrumentation concern, NOT a process alarm. They must
 * not contaminate the urgent process queue.
 */
export type AlarmCenterSourceType = 'PROCESS' | 'DATA_QUALITY' | 'COMMUNICATION';

/**
 * Underlying evaluator/detector state captured at the moment the event
 * was registered. Used to drive copy + iconography in the UI, and to
 * decide whether a state-change clears the event.
 */
export type AlarmCenterEvaluatedState =
  | Exclude<AlarmState, 'normal' | 'disabled'>
  | 'stale'
  | 'offline';

/**
 * One row in the Alarm Center. Identity is `id`, which is deterministic
 * over (jobId, tag, evaluatedState, firstSeenAt). If the same tag re-enters
 * the same band after clearing, a new event is generated with a fresh
 * `firstSeenAt` and therefore a fresh `id` — matching the F2C requirement.
 */
export interface LiveAlarmEvent {
  /** Deterministic event identity. */
  id: string;
  jobId: JobId;
  wellId: WellId;
  unitId: EquipmentId;
  tag: CanonicalTag;
  /** Human-readable variable label, e.g. "Oil Rate", "Inlet Pressure". */
  tagLabel: string;
  /** ISA-18.2 priority shown in the chip. */
  severity: AlarmCenterSeverity;
  source: AlarmCenterSourceType;
  lifecycle: AlarmCenterLifecycle;
  /** Underlying state at the time this event was first registered. */
  evaluatedState: AlarmCenterEvaluatedState;
  /** Reading value at last update, or null if no value available. */
  value: number | null;
  /** Engineering unit (canonical). */
  unit: string;
  /** Threshold value crossed, when known (process events only). */
  thresholdValue?: number;
  thresholdHit?: ThresholdHit;
  /** Quality of the reading that triggered the event (or last reading). */
  quality: DataQuality;
  /** Connection status of the (job, tag) at last update. */
  telemetryStatus: TelemetryStatus;
  /** First time we observed this (state, tag, job). ISO-8601 UTC. */
  firstSeenAt: string;
  /** Latest tick when this event was still active. ISO-8601 UTC. */
  lastUpdatedAt: string;
  /** Operator that acknowledged locally (`'You'` in F2C). */
  ackedBy?: string;
  ackedAt?: string;
  /** Set when the underlying condition returned to normal. */
  clearedAt?: string;
}

/**
 * Aggregate counts the screen + header consume. All derived from the
 * current `events` list; never cached separately.
 */
export interface AlarmCenterSummary {
  /** Process alarms currently active (not acked, not cleared). */
  urgent: number;
  high: number;
  medium: number;
  low: number;
  /** Active rows the operator has acknowledged locally. */
  acked: number;
  /** Rows that have returned to normal during the session. */
  cleared: number;
  /** Total events the session has seen (active + acked + cleared). */
  totalEvents: number;
  /** Data-quality / communication issues currently active. */
  dataQualityActive: number;
  communicationActive: number;
  /** Active rows the operator has NOT yet acknowledged. */
  activeUnacked: number;
  /** Live total active (sum of all four severities, regardless of source). */
  activeTotal: number;
  ackPct: number;
}

export interface AlarmCenterSnapshot {
  events: readonly LiveAlarmEvent[];
  summary: AlarmCenterSummary;
  generatedAt: string;
}

export const EMPTY_ALARM_CENTER_SUMMARY: AlarmCenterSummary = Object.freeze({
  urgent: 0,
  high: 0,
  medium: 0,
  low: 0,
  acked: 0,
  cleared: 0,
  totalEvents: 0,
  dataQualityActive: 0,
  communicationActive: 0,
  activeUnacked: 0,
  activeTotal: 0,
  ackPct: 100,
});

/**
 * Stable, frozen, module-level baseline used as:
 *
 *   - `getServerSnapshot()` return for the F2C `useAlarmCenter` hook —
 *     React 19 requires server snapshots to be reference-stable across
 *     calls, otherwise it throws "The result of getServerSnapshot should
 *     be cached to avoid an infinite loop".
 *   - The very first cache value before the live tick fires.
 *
 * Frozen so accidental mutation in development surfaces as a runtime
 * TypeError rather than silently corrupting the shared baseline.
 */
export const EMPTY_ALARM_CENTER_SNAPSHOT: AlarmCenterSnapshot = Object.freeze({
  events: Object.freeze<LiveAlarmEvent[]>([]),
  summary: EMPTY_ALARM_CENTER_SUMMARY,
  generatedAt: '1970-01-01T00:00:00.000Z',
});
