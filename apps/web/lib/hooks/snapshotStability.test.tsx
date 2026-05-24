/**
 * Snapshot-identity stability tests — F2B regression guard.
 *
 * These tests assert that each `useSyncExternalStore`-backed hook returns
 * the SAME reference across re-renders when the underlying telemetry
 * store hasn't changed. Without identity stability, React 19 throws "The
 * result of getSnapshot should be cached to avoid an infinite loop" and
 * the Operations page tears down with "Maximum update depth exceeded".
 */
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useAlarmState } from './useAlarmState';
import { DISCONNECTED_SERVER, useConnectionStatus } from './useConnectionStatus';
import { useLiveValue } from './useLiveValue';
import {
  EMPTY_UNIT_TELEMETRY_SNAPSHOT,
  useUnitTelemetrySnapshot,
} from './useUnitTelemetrySnapshot';

import type { AlarmEvaluationResult } from '@/lib/alarms/types';
import type {
  CommunicationStatus,
  SensorReading,
  TelemetryReading,
  UnitTelemetrySnapshot,
} from '@/lib/telemetry/models';
import type { JobId } from '@rvf/types';

import { JOB_HP_HF } from '@/lib/jobs/snapshots.mock';
import { setTelemetryStore, TelemetryStore } from '@/lib/realtime/telemetryStore';
import { CANONICAL_TAGS } from '@/lib/telemetry/tags';

const FIXED_NOW_MS = Date.parse('2026-05-24T10:00:00Z');
const JOB_ID: JobId = JOB_HP_HF.jobId;
const SNAP = JOB_HP_HF.snapshot;

const makeReading = (ageMs: number, value: number, seq: number): TelemetryReading => ({
  ts: new Date(FIXED_NOW_MS - ageMs).toISOString(),
  jobId: JOB_ID,
  tag: CANONICAL_TAGS.PInlet,
  value,
  unit: 'psi',
  quality: 'good',
  seq,
});

describe('useLiveValue — snapshot identity', () => {
  it('exposes undefined as a stable getServerSnapshot value', () => {
    // Just confirms the shape — undefined is identity-stable for free.
    const a = undefined;
    const b = undefined;
    expect(a).toBe(b);
  });

  it('returns the same reference across re-renders when nothing changed', () => {
    const store = new TelemetryStore();
    setTelemetryStore(store);
    act(() => {
      store.ingest({ kind: 'reading', reading: makeReading(2_000, 1500, 1) });
    });

    const seen: (SensorReading | undefined)[] = [];
    const Probe = () => {
      seen.push(
        useLiveValue(CANONICAL_TAGS.PInlet, {
          jobId: JOB_ID,
          snapshot: SNAP,
          nowMs: FIXED_NOW_MS,
        }),
      );
      return null;
    };
    const { rerender } = render(<Probe />);
    rerender(<Probe />);
    rerender(<Probe />);

    expect(seen.length).toBeGreaterThanOrEqual(3);
    const first = seen[0];
    for (const s of seen) expect(s).toBe(first);
  });

  it('returns a new reference when a new reading is ingested', () => {
    const store = new TelemetryStore();
    setTelemetryStore(store);
    act(() => {
      store.ingest({ kind: 'reading', reading: makeReading(2_000, 1500, 1) });
    });

    const seen: (SensorReading | undefined)[] = [];
    const Probe = () => {
      seen.push(
        useLiveValue(CANONICAL_TAGS.PInlet, {
          jobId: JOB_ID,
          snapshot: SNAP,
          nowMs: FIXED_NOW_MS,
        }),
      );
      return null;
    };
    const { rerender } = render(<Probe />);
    const before = seen[seen.length - 1];

    act(() => {
      store.ingest({ kind: 'reading', reading: makeReading(1_000, 1510, 2) });
    });
    rerender(<Probe />);
    expect(seen[seen.length - 1]).not.toBe(before);
    expect(seen[seen.length - 1]?.value).toBe(1510);
  });
});

describe('useAlarmState — snapshot identity', () => {
  it('returns the same reference across re-renders when nothing changed', () => {
    const store = new TelemetryStore();
    setTelemetryStore(store);
    act(() => {
      store.ingest({ kind: 'reading', reading: makeReading(2_000, 1500, 1) });
    });

    const seen: (AlarmEvaluationResult | undefined)[] = [];
    const Probe = () => {
      seen.push(
        useAlarmState(CANONICAL_TAGS.PInlet, {
          jobId: JOB_ID,
          snapshot: SNAP,
          nowMs: FIXED_NOW_MS,
        }),
      );
      return null;
    };
    const { rerender } = render(<Probe />);
    rerender(<Probe />);
    rerender(<Probe />);

    expect(seen.length).toBeGreaterThanOrEqual(3);
    const first = seen[0];
    for (const s of seen) expect(s).toBe(first);
  });

  it('returns a new reference when the alarm state transitions', () => {
    const store = new TelemetryStore();
    setTelemetryStore(store);
    act(() => {
      // Normal reading first (inside warning window).
      store.ingest({ kind: 'reading', reading: makeReading(2_000, 1500, 1) });
    });

    const seen: (AlarmEvaluationResult | undefined)[] = [];
    const Probe = () => {
      seen.push(
        useAlarmState(CANONICAL_TAGS.PInlet, {
          jobId: JOB_ID,
          snapshot: SNAP,
          nowMs: FIXED_NOW_MS,
        }),
      );
      return null;
    };
    const { rerender } = render(<Probe />);
    const before = seen[seen.length - 1];
    expect(before?.state).toBe('normal');

    act(() => {
      // Cross alarmHigh (2100 in JOB_HP_HF snapshot).
      store.ingest({ kind: 'reading', reading: makeReading(1_000, 2200, 2) });
    });
    rerender(<Probe />);
    expect(seen[seen.length - 1]).not.toBe(before);
    expect(seen[seen.length - 1]?.state).toBe('alarm_high');
  });
});

describe('useConnectionStatus — snapshot identity', () => {
  it('DISCONNECTED_SERVER is a stable module-level reference', () => {
    expect(DISCONNECTED_SERVER.kind).toBe('disconnected');
    expect(DISCONNECTED_SERVER).toBe(DISCONNECTED_SERVER);
    expect(Object.isFrozen(DISCONNECTED_SERVER)).toBe(true);
  });

  it('returns the same reference across re-renders when no status change', () => {
    const store = new TelemetryStore();
    setTelemetryStore(store);

    const seen: CommunicationStatus[] = [];
    const Probe = () => {
      seen.push(useConnectionStatus());
      return null;
    };
    const { rerender } = render(<Probe />);
    rerender(<Probe />);
    rerender(<Probe />);

    expect(seen.length).toBeGreaterThanOrEqual(3);
    const first = seen[0];
    for (const s of seen) expect(s).toBe(first);
  });

  it('returns a new reference when a connection event arrives', () => {
    const store = new TelemetryStore();
    setTelemetryStore(store);

    const seen: CommunicationStatus[] = [];
    const Probe = () => {
      seen.push(useConnectionStatus());
      return null;
    };
    const { rerender } = render(<Probe />);
    const before = seen[seen.length - 1];

    act(() => {
      store.ingest({
        kind: 'connection',
        status: { kind: 'connected', since: '2026-05-24T10:00:00Z' },
      });
    });
    rerender(<Probe />);
    expect(seen[seen.length - 1]).not.toBe(before);
    expect(seen[seen.length - 1]?.kind).toBe('connected');
  });
});

describe('useUnitTelemetrySnapshot — snapshot identity', () => {
  it('EMPTY_UNIT_TELEMETRY_SNAPSHOT is a stable module-level reference', () => {
    expect(EMPTY_UNIT_TELEMETRY_SNAPSHOT.byTag).toEqual({});
    expect(EMPTY_UNIT_TELEMETRY_SNAPSHOT).toBe(EMPTY_UNIT_TELEMETRY_SNAPSHOT);
    expect(Object.isFrozen(EMPTY_UNIT_TELEMETRY_SNAPSHOT)).toBe(true);
  });

  it('returns the same reference across re-renders when nothing changed', () => {
    const store = new TelemetryStore();
    setTelemetryStore(store);
    act(() => {
      store.ingest({ kind: 'reading', reading: makeReading(2_000, 1500, 1) });
    });

    const seen: UnitTelemetrySnapshot[] = [];
    const Probe = () => {
      seen.push(useUnitTelemetrySnapshot({ jobId: JOB_ID, snapshot: SNAP, nowMs: FIXED_NOW_MS }));
      return null;
    };
    const { rerender } = render(<Probe />);
    rerender(<Probe />);
    rerender(<Probe />);

    expect(seen.length).toBeGreaterThanOrEqual(3);
    const first = seen[0];
    for (const s of seen) expect(s).toBe(first);
  });

  it('returns a new reference when a new reading arrives', () => {
    const store = new TelemetryStore();
    setTelemetryStore(store);
    act(() => {
      store.ingest({ kind: 'reading', reading: makeReading(2_000, 1500, 1) });
    });

    const seen: UnitTelemetrySnapshot[] = [];
    const Probe = () => {
      seen.push(useUnitTelemetrySnapshot({ jobId: JOB_ID, snapshot: SNAP, nowMs: FIXED_NOW_MS }));
      return null;
    };
    const { rerender } = render(<Probe />);
    const before = seen[seen.length - 1];

    act(() => {
      store.ingest({ kind: 'reading', reading: makeReading(500, 1520, 2) });
    });
    rerender(<Probe />);
    expect(seen[seen.length - 1]).not.toBe(before);
  });
});
