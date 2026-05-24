import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EMPTY_HISTORY, useHistoryBuffer } from './useHistoryBuffer';

import type { TelemetryReading } from '@/lib/telemetry/models';
import type { JobId } from '@rvf/types';

import { JOB_HP_HF } from '@/lib/jobs/snapshots.mock';
import { setTelemetryStore, TelemetryStore } from '@/lib/realtime/telemetryStore';
import { CANONICAL_TAGS } from '@/lib/telemetry/tags';

const JOB_ID: JobId = JOB_HP_HF.jobId;
const TAG = CANONICAL_TAGS.PInlet;

const makeReading = (ageMs: number, value: number, seq: number): TelemetryReading => ({
  ts: new Date(Date.now() - ageMs).toISOString(),
  jobId: JOB_ID,
  tag: TAG,
  value,
  unit: 'psi',
  quality: 'good',
  seq,
});

describe('useHistoryBuffer — snapshot identity', () => {
  it('exposes a frozen, module-level EMPTY_HISTORY', () => {
    expect(EMPTY_HISTORY).toEqual([]);
    // Reference stability is what React 19's getServerSnapshot demands.
    expect(EMPTY_HISTORY).toBe(EMPTY_HISTORY);
    expect(Object.isFrozen(EMPTY_HISTORY)).toBe(true);
  });

  it('returns the same EMPTY_HISTORY reference across renders for an empty store', () => {
    const store = new TelemetryStore();
    setTelemetryStore(store);
    const seen: (readonly TelemetryReading[])[] = [];
    const Probe = () => {
      seen.push(useHistoryBuffer(JOB_ID, TAG));
      return null;
    };
    const { rerender } = render(<Probe />);
    rerender(<Probe />);
    rerender(<Probe />);

    expect(seen.length).toBeGreaterThanOrEqual(3);
    for (const s of seen) {
      expect(s).toBe(EMPTY_HISTORY);
    }
  });

  it('returns the same array reference across renders when the ring buffer has not changed', () => {
    const store = new TelemetryStore();
    setTelemetryStore(store);

    const seen: (readonly TelemetryReading[])[] = [];
    const Probe = () => {
      seen.push(useHistoryBuffer(JOB_ID, TAG));
      return null;
    };

    // Seed the buffer first so the cache has something concrete to hold on to.
    act(() => {
      store.ingest({ kind: 'reading', reading: makeReading(2_000, 1500, 1) });
    });

    const { rerender } = render(<Probe />);
    rerender(<Probe />);
    rerender(<Probe />);

    expect(seen.length).toBeGreaterThanOrEqual(3);
    const first = seen[0];
    expect(first?.length).toBe(1);
    for (const s of seen) {
      expect(s).toBe(first);
    }
  });

  it('returns a new array reference when a new reading is ingested', () => {
    const store = new TelemetryStore();
    setTelemetryStore(store);

    const seen: (readonly TelemetryReading[])[] = [];
    const Probe = () => {
      seen.push(useHistoryBuffer(JOB_ID, TAG));
      return null;
    };

    act(() => {
      store.ingest({ kind: 'reading', reading: makeReading(2_000, 1500, 1) });
    });

    const { rerender } = render(<Probe />);
    const before = seen[seen.length - 1];

    act(() => {
      store.ingest({ kind: 'reading', reading: makeReading(1_000, 1510, 2) });
    });
    rerender(<Probe />);

    const after = seen[seen.length - 1];
    expect(after).not.toBe(before);
    expect(after?.length).toBe(2);
    // Older entry's identity should be preserved across the rebuild.
    expect(after?.[0]).toBe(before?.[0]);
  });
});
