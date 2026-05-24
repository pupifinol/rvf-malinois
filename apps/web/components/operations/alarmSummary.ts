/**
 * Alarm summary — F2B pure logic.
 *
 * Given a list of active jobs and a telemetry store, returns:
 *
 *   - the count of (jobId, tag) pairs whose current evaluated state is
 *     an alarm (alarm_high | alarm_low),
 *   - the count of (jobId, tag) pairs whose current evaluated state is
 *     a warning (warning_high | warning_low),
 *   - the count of (jobId, tag) pairs that are stale or offline,
 *   - the headline label the header should render.
 *
 * No React, no module-level state. Hooks consume this via the store. The
 * function is pure over its inputs so the header text is testable from
 * fixtures, not from a live stream.
 */

import type { AlarmState } from '@/lib/alarms/types';
import type { ActiveJobSnapshot } from '@/lib/jobs/types';
import type { TelemetryStore } from '@/lib/realtime/telemetryStore';

import { evaluateReading } from '@/lib/alarms/evaluator';
import { computeStaleFromSnapshot } from '@/lib/quality/stale';

export interface AlarmSummary {
  alarmCount: number;
  warningCount: number;
  staleCount: number;
  /** Headline string the header renders. Stable across renders. */
  headline: string;
  /** Coarse tone for the header chip. */
  tone: 'normal' | 'warn' | 'alarm' | 'stale';
}

const computeStateForTag = (
  store: TelemetryStore,
  job: ActiveJobSnapshot,
  tagMappingEnabled: boolean,
  tag: ActiveJobSnapshot['snapshot']['sensors'][number]['canonicalTag'],
  nowMs: number,
): AlarmState => {
  if (!tagMappingEnabled) return 'disabled';
  const reading = store.getLatestReading(job.jobId, tag);
  const stale = computeStaleFromSnapshot({
    jobId: job.jobId,
    tag,
    lastTs: reading?.ts,
    nowMs,
    snapshot: job.snapshot,
  });
  if (stale.status === 'stale' || stale.status === 'offline') return 'no_data';
  if (!reading) return 'no_data';
  return evaluateReading(reading, job.snapshot, { nowIso: new Date(nowMs).toISOString() }).state;
};

export const summarizeAlarms = (
  store: TelemetryStore,
  jobs: readonly ActiveJobSnapshot[],
  nowMs: number = Date.now(),
): AlarmSummary => {
  let alarmCount = 0;
  let warningCount = 0;
  let staleCount = 0;

  for (const job of jobs) {
    for (const mapping of job.snapshot.sensors) {
      // Disabled mappings shouldn't count; the operator opted out of that sensor.
      if (!mapping.enabled) continue;

      const reading = store.getLatestReading(job.jobId, mapping.canonicalTag);
      const stale = computeStaleFromSnapshot({
        jobId: job.jobId,
        tag: mapping.canonicalTag,
        lastTs: reading?.ts,
        nowMs,
        snapshot: job.snapshot,
      });
      if (stale.status === 'stale' || stale.status === 'offline') {
        staleCount += 1;
        continue;
      }
      if (!reading) continue;

      const state = computeStateForTag(store, job, true, mapping.canonicalTag, nowMs);
      if (state === 'alarm_high' || state === 'alarm_low') alarmCount += 1;
      else if (state === 'warning_high' || state === 'warning_low') warningCount += 1;
    }
  }

  const headline = formatHeadline({ alarmCount, warningCount, staleCount });
  const tone: AlarmSummary['tone'] =
    alarmCount > 0 ? 'alarm' : warningCount > 0 ? 'warn' : staleCount > 0 ? 'stale' : 'normal';

  return { alarmCount, warningCount, staleCount, headline, tone };
};

const formatHeadline = (s: {
  alarmCount: number;
  warningCount: number;
  staleCount: number;
}): string => {
  if (s.alarmCount > 0) {
    const noun = s.alarmCount === 1 ? 'alarm' : 'alarms';
    if (s.warningCount > 0) {
      return `${String(s.alarmCount)} active ${noun} · ${String(s.warningCount)} warning${
        s.warningCount === 1 ? '' : 's'
      }`;
    }
    return `${String(s.alarmCount)} active ${noun}`;
  }
  if (s.warningCount > 0) {
    return `${String(s.warningCount)} warning${s.warningCount === 1 ? '' : 's'}`;
  }
  if (s.staleCount > 0) {
    return `${String(s.staleCount)} stale signal${s.staleCount === 1 ? '' : 's'}`;
  }
  return 'No active alarms';
};
