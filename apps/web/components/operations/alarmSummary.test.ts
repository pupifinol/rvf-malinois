import { describe, expect, it } from 'vitest';

import { summarizeAlarms } from './alarmSummary';

import type { ActiveJobSnapshot } from '@/lib/jobs/types';
import type { TelemetryReading } from '@/lib/telemetry/models';
import type { CanonicalTag } from '@rvf/types';

import { JOB_HP_HF, JOB_MP, JOB_STALE } from '@/lib/jobs/snapshots.mock';
import { TelemetryStore } from '@/lib/realtime/telemetryStore';
import { CANONICAL_TAGS } from '@/lib/telemetry/tags';

const NOW_MS = Date.parse('2026-05-24T10:00:00Z');

const reading = (
  job: ActiveJobSnapshot,
  tag: CanonicalTag,
  value: number,
  ageMs = 1_000,
): TelemetryReading => ({
  ts: new Date(NOW_MS - ageMs).toISOString(),
  jobId: job.jobId,
  tag,
  value,
  unit: 'psi',
  quality: 'good',
});

describe('summarizeAlarms', () => {
  it('returns the "No active alarms" baseline when no jobs are bound', () => {
    const store = new TelemetryStore();
    const s = summarizeAlarms(store, [], NOW_MS);
    expect(s.alarmCount).toBe(0);
    expect(s.warningCount).toBe(0);
    expect(s.staleCount).toBe(0);
    expect(s.headline).toBe('No active alarms');
    expect(s.tone).toBe('normal');
  });

  it('reports every enabled tag of a bound job as stale until the first reading arrives', () => {
    // ADR-005 anti-mentira: a tag we have never seen is offline, not normal.
    const store = new TelemetryStore();
    const s = summarizeAlarms(store, [JOB_HP_HF], NOW_MS);
    expect(s.alarmCount).toBe(0);
    expect(s.warningCount).toBe(0);
    expect(s.staleCount).toBeGreaterThan(0);
    expect(s.tone).toBe('stale');
    expect(s.headline).toMatch(/stale signal/);
  });

  it('counts an alarm_high (over snapshot alarmHigh) as an alarm', () => {
    const store = new TelemetryStore();
    // JOB_HP_HF.snapshot.effectiveThresholds.p_inlet.alarmHigh = 2100.
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_HP_HF, CANONICAL_TAGS.PInlet, 2200),
    });
    const s = summarizeAlarms(store, [JOB_HP_HF], NOW_MS);
    expect(s.alarmCount).toBe(1);
    expect(s.warningCount).toBe(0);
    expect(s.tone).toBe('alarm');
    expect(s.headline).toBe('1 active alarm');
  });

  it('counts a warning_high (between warning and alarm) as a warning', () => {
    const store = new TelemetryStore();
    // warningHigh = 1900, alarmHigh = 2100 → 2000 is warning, not alarm.
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_HP_HF, CANONICAL_TAGS.PInlet, 2000),
    });
    const s = summarizeAlarms(store, [JOB_HP_HF], NOW_MS);
    expect(s.alarmCount).toBe(0);
    expect(s.warningCount).toBe(1);
    expect(s.tone).toBe('warn');
    expect(s.headline).toBe('1 warning');
  });

  it('rolls "alarm + warning" into the alarm tone', () => {
    const store = new TelemetryStore();
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_HP_HF, CANONICAL_TAGS.PInlet, 2200),
    });
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_MP, CANONICAL_TAGS.PInlet, 1550),
    });
    const s = summarizeAlarms(store, [JOB_HP_HF, JOB_MP], NOW_MS);
    expect(s.alarmCount).toBe(1);
    expect(s.warningCount).toBe(1);
    expect(s.tone).toBe('alarm');
    expect(s.headline).toBe('1 active alarm · 1 warning');
  });

  it('counts a paused (stale-by-age) tag as a stale signal, not normal', () => {
    const store = new TelemetryStore();
    // JOB_STALE overrides p_inlet stale to {delayed:5, stale:15, offline:45}.
    // Reading is 60s old → stale or offline.
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_STALE, CANONICAL_TAGS.PInlet, 1000, 60_000),
    });
    const s = summarizeAlarms(store, [JOB_STALE], NOW_MS);
    expect(s.alarmCount).toBe(0);
    expect(s.warningCount).toBe(0);
    expect(s.staleCount).toBeGreaterThanOrEqual(1);
    expect(s.tone).toBe('stale');
    expect(s.headline).toMatch(/stale signal/);
  });

  it('disabled sensors do not contribute to any count', () => {
    const store = new TelemetryStore();
    // JOB_STALE disables WaterCut in its snapshot; even if a reading
    // arrived, the summarizer should ignore it.
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_STALE, CANONICAL_TAGS.WaterCut, 200),
    });
    const s = summarizeAlarms(store, [JOB_STALE], NOW_MS);
    expect(s.alarmCount).toBe(0);
    expect(s.warningCount).toBe(0);
  });
});
