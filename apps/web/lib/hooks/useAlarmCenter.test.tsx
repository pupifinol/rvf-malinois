/**
 * useAlarmCenter — F2C snapshot-identity regression guard.
 *
 * `useAlarmCenter` wraps `deriveAlarmCenterSnapshot` (a pure fold that
 * always returns a fresh outer object) through `useSyncExternalStore`.
 * React 19 requires `getSnapshot` to return the same reference when no
 * logical state changed, otherwise it throws:
 *
 *   "The result of getSnapshot should be cached to avoid an infinite loop"
 *
 * These tests assert the hook returns the SAME object reference across
 * re-renders when nothing changed, and a DIFFERENT reference when:
 *
 *   - a new reading is ingested into the store, or
 *   - an alarm is acknowledged locally.
 *
 * Also asserts that `EMPTY_ALARM_CENTER_SNAPSHOT` is a stable, frozen,
 * module-level reference suitable for `getServerSnapshot`.
 */
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useAlarmCenter } from './useAlarmCenter';

import type { AlarmCenterSnapshot } from '@/lib/alarms';
import type { CanonicalTag } from '@rvf/types';

import { _resetAckStore, acknowledgeAlarm, EMPTY_ALARM_CENTER_SNAPSHOT } from '@/lib/alarms';
import { JOB_HP_HF } from '@/lib/jobs/snapshots.mock';
import { setTelemetryStore, TelemetryStore } from '@/lib/realtime/telemetryStore';
import { CANONICAL_TAGS } from '@/lib/telemetry/tags';

const FIXED_NOW_MS = Date.parse('2026-05-24T10:00:00Z');
const JOBS: readonly (typeof JOB_HP_HF)[] = [JOB_HP_HF];

const labeller = (tag: CanonicalTag): string => `Label:${String(tag)}`;

const ingestAlarmReading = (store: TelemetryStore, value: number, ageMs = 1_000): void => {
  store.ingest({
    kind: 'reading',
    reading: {
      ts: new Date(FIXED_NOW_MS - ageMs).toISOString(),
      jobId: JOB_HP_HF.jobId,
      tag: CANONICAL_TAGS.PInlet,
      value,
      unit: 'psi',
      quality: 'good',
    },
  });
};

const captureSnapshots = (): {
  seen: AlarmCenterSnapshot[];
  rerender: () => void;
} => {
  const seen: AlarmCenterSnapshot[] = [];
  const Probe = () => {
    seen.push(useAlarmCenter(JOBS, labeller));
    return null;
  };
  const { rerender } = render(<Probe />);
  return { seen, rerender: () => rerender(<Probe />) };
};

describe('EMPTY_ALARM_CENTER_SNAPSHOT', () => {
  it('is a frozen, identity-stable module-level reference', () => {
    expect(EMPTY_ALARM_CENTER_SNAPSHOT).toBe(EMPTY_ALARM_CENTER_SNAPSHOT);
    expect(Object.isFrozen(EMPTY_ALARM_CENTER_SNAPSHOT)).toBe(true);
    expect(EMPTY_ALARM_CENTER_SNAPSHOT.events).toHaveLength(0);
    expect(EMPTY_ALARM_CENTER_SNAPSHOT.summary.activeTotal).toBe(0);
    expect(EMPTY_ALARM_CENTER_SNAPSHOT.summary.ackPct).toBe(100);
  });
});

describe('useAlarmCenter — snapshot identity', () => {
  afterEach(() => {
    _resetAckStore();
  });

  it('returns the same reference across re-renders when nothing changed', () => {
    const store = new TelemetryStore();
    setTelemetryStore(store);
    act(() => {
      ingestAlarmReading(store, 2200); // alarm_high
    });

    const { seen, rerender } = captureSnapshots();
    rerender();
    rerender();

    // Filter out the SSR/pre-mount EMPTY_ALARM_CENTER_SNAPSHOT, which is
    // expected to appear once on the first render before useNowTick fires.
    const post = seen.filter((s) => s !== EMPTY_ALARM_CENTER_SNAPSHOT);
    expect(post.length).toBeGreaterThanOrEqual(2);
    const first = post[0];
    for (const s of post) {
      expect(s).toBe(first);
    }
  });

  it('returns the same reference across re-renders with an empty store', () => {
    // Empty store: derive will still produce a snapshot containing OFFLINE
    // events for every enabled sensor. Identity must still be stable.
    const store = new TelemetryStore();
    setTelemetryStore(store);

    const { seen, rerender } = captureSnapshots();
    rerender();
    rerender();

    const post = seen.filter((s) => s !== EMPTY_ALARM_CENTER_SNAPSHOT);
    expect(post.length).toBeGreaterThanOrEqual(2);
    const first = post[0];
    for (const s of post) {
      expect(s).toBe(first);
    }
  });

  it('returns a NEW reference when a new reading is ingested', () => {
    const store = new TelemetryStore();
    setTelemetryStore(store);
    act(() => {
      ingestAlarmReading(store, 2200);
    });

    const { seen, rerender } = captureSnapshots();
    const before = seen[seen.length - 1];

    act(() => {
      ingestAlarmReading(store, 2300, 500); // same band, new value
    });
    rerender();

    const after = seen[seen.length - 1];
    expect(after).not.toBe(before);
  });

  it('returns a NEW reference when acknowledgeAlarm is called', () => {
    const store = new TelemetryStore();
    setTelemetryStore(store);
    act(() => {
      ingestAlarmReading(store, 2200);
    });

    const { seen, rerender } = captureSnapshots();
    const before = seen[seen.length - 1];
    if (!before) throw new Error('expected captured snapshot');

    const eventToAck = before.events.find(
      (e) => e.tag === CANONICAL_TAGS.PInlet && e.lifecycle === 'ACTIVE',
    );
    expect(eventToAck).toBeDefined();
    if (!eventToAck) throw new Error('unreachable');

    act(() => {
      acknowledgeAlarm(eventToAck.id);
    });
    rerender();

    const after = seen[seen.length - 1];
    expect(after).not.toBe(before);
    const acked = after?.events.find((e) => e.id === eventToAck.id);
    expect(acked?.lifecycle).toBe('ACKED');
    expect(after?.summary.acked).toBeGreaterThanOrEqual(1);
  });
});
