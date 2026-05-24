/**
 * Alarm Center derivation — F2C pure tick.
 *
 * Folds the previous snapshot with the current state of the telemetry
 * store + the active job snapshots, producing the next snapshot. This is
 * a PURE function (no React, no module-level state, no Date.now()) so it
 * is trivially testable from fixtures and so the hook can wrap it without
 * surprises.
 *
 * Why fold-style: an alarm event has *identity over time* — `firstSeenAt`
 * is the moment the (jobId, tag, evaluatedState) tuple was first observed
 * to be abnormal. The pure function therefore needs the previous event
 * list so it can:
 *
 *   - keep stable ids for events that are still active,
 *   - bump `lastUpdatedAt` for unchanged-but-still-active events,
 *   - transition an event to CLEARED when its underlying state returns to
 *     normal (or to disabled),
 *   - transition an event to ACKED when its id is in the ack set,
 *   - mint a brand-new event (new id, new firstSeenAt) when a tag re-enters
 *     an abnormal band after clearing — exactly per the F2C spec.
 *
 * The function never mutates its inputs. The output `events` array is a
 * new list every call, but individual event objects whose state is
 * unchanged are reused by reference for cheaper React reconciliation.
 *
 * Threshold provenance: every process event carries the `thresholdValue`
 * read from `job.snapshot.effectiveThresholds[tag]`. Per ADR-005 regla 1
 * that value never comes from Units or Settings.
 */
import { evaluateReading } from '../evaluator';

import { severityFor, sourceFor } from './severity';

import type { AlarmCenterEvaluatedState, AlarmCenterSnapshot, LiveAlarmEvent } from './types';
import type { AlarmState, ThresholdHit } from '../types';
import type { ActiveJobSnapshot, VariableThresholds } from '@/lib/jobs/types';
import type { TelemetryStore } from '@/lib/realtime/telemetryStore';
import type { TelemetryReading, TelemetryStatus } from '@/lib/telemetry/models';
import type { CanonicalTag, JobId } from '@rvf/types';

import { computeStaleFromSnapshot } from '@/lib/quality/stale';

/** Resolves the canonical tag → human label. Caller-supplied so the
 *  view-model layer does not bake a hardcoded list. */
export type TagLabeller = (tag: CanonicalTag) => string;

export interface DeriveAlarmCenterInput {
  store: TelemetryStore;
  jobs: readonly ActiveJobSnapshot[];
  /** Previous snapshot (or undefined on first tick). */
  prev: AlarmCenterSnapshot | undefined;
  /** Local ack set — typically the live one from ackStore. */
  ackedIds: ReadonlySet<string>;
  /** Evaluation moment (ms since epoch). */
  nowMs: number;
  /** Maps a canonical tag to a UI label (Oil Rate / Inlet Pressure / …). */
  tagLabeller: TagLabeller;
  /**
   * How many CLEARED events to retain in the snapshot. Defaults to 50 —
   * enough to populate the history table for a full session without
   * unbounded growth.
   */
  maxClearedRetained?: number;
}

interface PerTagFinding {
  job: ActiveJobSnapshot;
  tag: CanonicalTag;
  /** undefined when the tag is normal/disabled — no event should exist. */
  evaluatedState?: AlarmCenterEvaluatedState;
  reading?: TelemetryReading;
  thresholdHit?: ThresholdHit;
  thresholdValue?: number;
  telemetryStatus: TelemetryStatus;
  unit: string;
}

const tagKey = (jobId: JobId, tag: CanonicalTag): string => `${String(jobId)}::${String(tag)}`;

const eventId = (
  jobId: JobId,
  tag: CanonicalTag,
  state: AlarmCenterEvaluatedState,
  firstSeenAt: string,
): string => `${String(jobId)}::${String(tag)}::${state}::${firstSeenAt}`;

const thresholdValueFor = (
  thresholds: VariableThresholds | undefined,
  hit: ThresholdHit | undefined,
): number | undefined => {
  if (!thresholds || !hit) return undefined;
  return thresholds[hit];
};

const findReadingForTag = (
  store: TelemetryStore,
  job: ActiveJobSnapshot,
  tag: CanonicalTag,
): TelemetryReading | undefined => store.getLatestReading(job.jobId, tag);

const evaluatedStateFrom = (
  state: AlarmState,
  telemetryStatus: TelemetryStatus,
): AlarmCenterEvaluatedState | undefined => {
  // Communication issues take precedence — a stale or offline signal cannot
  // produce a meaningful process state, so we surface the comms issue alone.
  if (telemetryStatus === 'offline') return 'offline';
  if (telemetryStatus === 'stale') return 'stale';
  switch (state) {
    case 'alarm_high':
    case 'alarm_low':
    case 'warning_high':
    case 'warning_low':
    case 'no_data':
      return state;
    case 'normal':
    case 'disabled':
      return undefined;
  }
};

const evaluateOne = (
  store: TelemetryStore,
  job: ActiveJobSnapshot,
  tag: CanonicalTag,
  nowMs: number,
): PerTagFinding => {
  const mapping = job.snapshot.sensors.find((s) => s.canonicalTag === tag);
  const thresholds = job.snapshot.effectiveThresholds[tag];

  // Disabled sensors never participate.
  if (!mapping?.enabled) {
    return { job, tag, telemetryStatus: 'live', unit: thresholds?.unit ?? '' };
  }

  const reading = findReadingForTag(store, job, tag);
  const stale = computeStaleFromSnapshot({
    jobId: job.jobId,
    tag,
    lastTs: reading?.ts,
    nowMs,
    snapshot: job.snapshot,
  });

  if (stale.status === 'offline' || stale.status === 'stale') {
    return {
      job,
      tag,
      evaluatedState: stale.status,
      reading,
      telemetryStatus: stale.status,
      unit: reading?.unit ?? thresholds?.unit ?? '',
    };
  }

  if (!reading) {
    // We have no reading and the status isn't yet stale — nothing to
    // surface, but also no event for this (job, tag) yet.
    return { job, tag, telemetryStatus: stale.status, unit: thresholds?.unit ?? '' };
  }

  const result = evaluateReading(reading, job.snapshot, {
    nowIso: new Date(nowMs).toISOString(),
  });
  const evaluatedState = evaluatedStateFrom(result.state, stale.status);
  return {
    job,
    tag,
    evaluatedState,
    reading,
    thresholdHit: result.thresholdHit,
    thresholdValue: thresholdValueFor(thresholds, result.thresholdHit),
    telemetryStatus: stale.status,
    unit: reading.unit ?? thresholds?.unit ?? '',
  };
};

const findingsForJobs = (
  store: TelemetryStore,
  jobs: readonly ActiveJobSnapshot[],
  nowMs: number,
): Map<string, PerTagFinding> => {
  const out = new Map<string, PerTagFinding>();
  for (const job of jobs) {
    for (const mapping of job.snapshot.sensors) {
      const finding = evaluateOne(store, job, mapping.canonicalTag, nowMs);
      out.set(tagKey(job.jobId, mapping.canonicalTag), finding);
    }
  }
  return out;
};

/**
 * Build a new event from a finding. Used when no prior active event
 * exists for the (job, tag, evaluatedState).
 */
const buildNewEvent = (
  finding: PerTagFinding,
  nowIso: string,
  tagLabeller: TagLabeller,
  ackedIds: ReadonlySet<string>,
): LiveAlarmEvent => {
  const evaluatedState = finding.evaluatedState;
  if (!evaluatedState) {
    throw new Error('buildNewEvent called on a finding with no evaluated state');
  }
  const firstSeenAt = finding.reading?.ts ?? nowIso;
  const id = eventId(finding.job.jobId, finding.tag, evaluatedState, firstSeenAt);
  const tagLabel = tagLabeller(finding.tag);
  const ackedNow = ackedIds.has(id);
  return {
    id,
    jobId: finding.job.jobId,
    wellId: finding.job.wellId,
    unitId: finding.job.unitId,
    tag: finding.tag,
    tagLabel,
    severity: severityFor(evaluatedState),
    source: sourceFor(evaluatedState),
    lifecycle: ackedNow ? 'ACKED' : 'ACTIVE',
    evaluatedState,
    value: finding.reading?.value ?? null,
    unit: finding.unit,
    ...(finding.thresholdHit ? { thresholdHit: finding.thresholdHit } : {}),
    ...(finding.thresholdValue !== undefined ? { thresholdValue: finding.thresholdValue } : {}),
    quality: finding.reading?.quality ?? 'uncertain',
    telemetryStatus: finding.telemetryStatus,
    firstSeenAt,
    lastUpdatedAt: nowIso,
    ...(ackedNow ? { ackedBy: 'You', ackedAt: nowIso } : {}),
  };
};

/**
 * Merge an existing active event with a fresh finding for the same
 * (job, tag, state). Returns the previous reference if nothing meaningful
 * changed, so React reconciliation stays cheap.
 */
const mergeActiveEvent = (
  prev: LiveAlarmEvent,
  finding: PerTagFinding,
  nowIso: string,
  ackedIds: ReadonlySet<string>,
): LiveAlarmEvent => {
  const ackedNow = ackedIds.has(prev.id);
  const nextLifecycle: LiveAlarmEvent['lifecycle'] = ackedNow
    ? 'ACKED'
    : prev.lifecycle === 'ACKED'
      ? 'ACKED'
      : 'ACTIVE';
  const nextValue = finding.reading?.value ?? null;
  const nextQuality = finding.reading?.quality ?? prev.quality;
  const nextStatus = finding.telemetryStatus;
  const lifecycleChanged = nextLifecycle !== prev.lifecycle;
  const valueChanged = nextValue !== prev.value;
  const qualityChanged = nextQuality !== prev.quality;
  const statusChanged = nextStatus !== prev.telemetryStatus;

  // Cheap fast path: if nothing the operator can see changed, reuse the
  // previous object reference. lastUpdatedAt is metadata; we bump it but
  // only on the new reference, never silently.
  if (!lifecycleChanged && !valueChanged && !qualityChanged && !statusChanged) {
    return prev;
  }

  return {
    ...prev,
    value: nextValue,
    quality: nextQuality,
    telemetryStatus: nextStatus,
    lifecycle: nextLifecycle,
    lastUpdatedAt: nowIso,
    ...(nextLifecycle === 'ACKED' && !prev.ackedAt ? { ackedBy: 'You', ackedAt: nowIso } : {}),
  };
};

const summarise = (events: readonly LiveAlarmEvent[]): AlarmCenterSnapshot['summary'] => {
  let urgent = 0;
  let high = 0;
  let medium = 0;
  let low = 0;
  let acked = 0;
  let cleared = 0;
  let dataQualityActive = 0;
  let communicationActive = 0;
  let activeUnacked = 0;
  let activeTotal = 0;

  for (const e of events) {
    if (e.lifecycle === 'CLEARED') {
      cleared += 1;
      continue;
    }
    if (e.lifecycle === 'ACKED') acked += 1;
    if (e.lifecycle === 'ACTIVE') activeUnacked += 1;

    activeTotal += 1;
    if (e.severity === 'URGENT') urgent += 1;
    else if (e.severity === 'HIGH') high += 1;
    else if (e.severity === 'MEDIUM') medium += 1;
    else if (e.severity === 'LOW') low += 1;

    if (e.source === 'DATA_QUALITY') dataQualityActive += 1;
    else if (e.source === 'COMMUNICATION') communicationActive += 1;
  }

  const ackPct = activeTotal === 0 ? 100 : Math.round((acked / activeTotal) * 100);

  return {
    urgent,
    high,
    medium,
    low,
    acked,
    cleared,
    totalEvents: events.length,
    dataQualityActive,
    communicationActive,
    activeUnacked,
    activeTotal,
    ackPct,
  };
};

/** Highest severity first → newest first within a band. */
const sortForDisplay = (events: LiveAlarmEvent[]): LiveAlarmEvent[] => {
  const lifecycleRank: Record<LiveAlarmEvent['lifecycle'], number> = {
    ACTIVE: 0,
    ACKED: 1,
    CLEARED: 2,
  };
  const sevRank: Record<LiveAlarmEvent['severity'], number> = {
    URGENT: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
  };
  return [...events].sort((a, b) => {
    const lc = lifecycleRank[a.lifecycle] - lifecycleRank[b.lifecycle];
    if (lc !== 0) return lc;
    const sv = sevRank[a.severity] - sevRank[b.severity];
    if (sv !== 0) return sv;
    // newer first
    return Date.parse(b.firstSeenAt) - Date.parse(a.firstSeenAt);
  });
};

export const deriveAlarmCenterSnapshot = (input: DeriveAlarmCenterInput): AlarmCenterSnapshot => {
  const { store, jobs, prev, ackedIds, nowMs, tagLabeller } = input;
  const maxCleared = input.maxClearedRetained ?? 50;
  const nowIso = new Date(nowMs).toISOString();

  const findings = findingsForJobs(store, jobs, nowMs);

  // Map of (jobId, tag) → previous ACTIVE/ACKED event (one at a time per tag).
  const prevActiveByTag = new Map<string, LiveAlarmEvent>();
  const carryCleared: LiveAlarmEvent[] = [];
  for (const e of prev?.events ?? []) {
    if (e.lifecycle === 'CLEARED') {
      carryCleared.push(e);
      continue;
    }
    prevActiveByTag.set(tagKey(e.jobId, e.tag), e);
  }

  const nextEvents: LiveAlarmEvent[] = [];

  // 1) For every (job, tag) that this tick has a finding for, decide
  //    whether to mint a new event, merge with the existing one, or
  //    transition the existing one to CLEARED.
  for (const finding of findings.values()) {
    const key = tagKey(finding.job.jobId, finding.tag);
    const prior = prevActiveByTag.get(key);

    if (!finding.evaluatedState) {
      // Tag returned to normal/disabled. If there was an active event,
      // clear it; otherwise nothing to do.
      if (prior) {
        nextEvents.push({
          ...prior,
          lifecycle: 'CLEARED',
          clearedAt: nowIso,
          lastUpdatedAt: nowIso,
        });
      }
      continue;
    }

    if (!prior) {
      nextEvents.push(buildNewEvent(finding, nowIso, tagLabeller, ackedIds));
      continue;
    }

    // Prior event exists. Same state → merge. Different state → close
    // the prior and mint a fresh one (new id, new firstSeenAt).
    if (prior.evaluatedState === finding.evaluatedState) {
      nextEvents.push(mergeActiveEvent(prior, finding, nowIso, ackedIds));
    } else {
      nextEvents.push({
        ...prior,
        lifecycle: 'CLEARED',
        clearedAt: nowIso,
        lastUpdatedAt: nowIso,
      });
      nextEvents.push(buildNewEvent(finding, nowIso, tagLabeller, ackedIds));
    }
  }

  // 2) Any previously-active event whose tag was NOT in `findings` (e.g.
  //    the snapshot dropped a sensor) is cleared so it does not linger.
  for (const [key, prior] of prevActiveByTag) {
    if (findings.has(key)) continue;
    nextEvents.push({
      ...prior,
      lifecycle: 'CLEARED',
      clearedAt: nowIso,
      lastUpdatedAt: nowIso,
    });
  }

  // 3) Carry forward older cleared events, trimmed to the retention cap.
  const trimmedCarry = carryCleared
    .sort(
      (a, b) =>
        Date.parse(b.clearedAt ?? b.lastUpdatedAt) - Date.parse(a.clearedAt ?? a.lastUpdatedAt),
    )
    .slice(0, maxCleared);
  nextEvents.push(...trimmedCarry);

  const sorted = sortForDisplay(nextEvents);
  return {
    events: sorted,
    summary: summarise(sorted),
    generatedAt: nowIso,
  };
};
