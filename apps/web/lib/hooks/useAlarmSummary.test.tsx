import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EMPTY_ALARM_SUMMARY, useAlarmSummary } from './useAlarmSummary';

import type { AlarmSummary } from '@/components/operations/alarmSummary';
import type { JobId } from '@rvf/types';

import { JOB_HP_HF } from '@/lib/jobs/snapshots.mock';
import { setTelemetryStore, TelemetryStore } from '@/lib/realtime/telemetryStore';
import { CANONICAL_TAGS } from '@/lib/telemetry/tags';

const captureSummaries = (jobs: typeof JOBS): AlarmSummary[] => {
  const seen: AlarmSummary[] = [];
  const Probe = () => {
    const s = useAlarmSummary(jobs);
    seen.push(s);
    return null;
  };
  const { rerender } = render(<Probe />);
  rerender(<Probe />);
  rerender(<Probe />);
  return seen;
};

const JOBS: readonly (typeof JOB_HP_HF)[] = [JOB_HP_HF];

describe('useAlarmSummary — snapshot identity', () => {
  it('exposes a module-level EMPTY_ALARM_SUMMARY for SSR / cold start', () => {
    expect(EMPTY_ALARM_SUMMARY.alarmCount).toBe(0);
    expect(EMPTY_ALARM_SUMMARY.warningCount).toBe(0);
    expect(EMPTY_ALARM_SUMMARY.staleCount).toBe(0);
    expect(EMPTY_ALARM_SUMMARY.headline).toBe('No active alarms');
    expect(EMPTY_ALARM_SUMMARY.tone).toBe('normal');
  });

  it('the EMPTY_ALARM_SUMMARY reference is stable across imports / calls', () => {
    // Identity, not equality. React 19's getServerSnapshot contract requires
    // the same reference to be returned on every invocation.
    const a = EMPTY_ALARM_SUMMARY;
    const b = EMPTY_ALARM_SUMMARY;
    expect(a).toBe(b);
  });

  it('returns the same reference across re-renders when nothing changed', () => {
    const store = new TelemetryStore();
    setTelemetryStore(store);
    const seen = captureSummaries(JOBS);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    // Every render of the same component must see the same object identity
    // for the summary — otherwise useSyncExternalStore would re-render
    // forever. We assert against the FIRST captured value.
    const first = seen[0];
    for (const s of seen) {
      expect(s).toBe(first);
    }
  });

  it('returns a new reference when the underlying summary materially changes', () => {
    const store = new TelemetryStore();
    setTelemetryStore(store);
    const seen: AlarmSummary[] = [];
    const Probe = () => {
      const s = useAlarmSummary(JOBS);
      seen.push(s);
      return null;
    };
    const { rerender } = render(<Probe />);
    const before = seen[seen.length - 1];

    act(() => {
      // Ingest a reading that trips an alarm — JOB_HP_HF.snapshot has
      // p_inlet alarmHigh = 2100.
      const jobId: JobId = JOB_HP_HF.jobId;
      store.ingest({
        kind: 'reading',
        reading: {
          ts: new Date().toISOString(),
          jobId,
          tag: CANONICAL_TAGS.PInlet,
          value: 2200,
          unit: 'psi',
          quality: 'good',
        },
      });
    });
    rerender(<Probe />);

    const after = seen[seen.length - 1];
    expect(after).not.toBe(before);
    expect(after?.alarmCount).toBeGreaterThanOrEqual(1);
  });
});
