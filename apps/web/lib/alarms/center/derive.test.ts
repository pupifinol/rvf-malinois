import { describe, expect, it } from 'vitest';

import { deriveAlarmCenterSnapshot } from './derive';

import type { AlarmCenterSnapshot, LiveAlarmEvent } from './types';
import type { ActiveJobSnapshot } from '@/lib/jobs/types';
import type { TelemetryReading } from '@/lib/telemetry/models';
import type { CanonicalTag } from '@rvf/types';

import { JOB_HP_HF, JOB_STALE } from '@/lib/jobs/snapshots.mock';
import { TelemetryStore } from '@/lib/realtime/telemetryStore';
import { CANONICAL_TAGS } from '@/lib/telemetry/tags';

const NOW_MS = Date.parse('2026-05-24T10:00:00Z');

const labeller = (tag: CanonicalTag): string => `Label:${String(tag)}`;

const reading = (
  job: ActiveJobSnapshot,
  tag: CanonicalTag,
  value: number | null,
  options: Partial<{ ageMs: number; quality: TelemetryReading['quality']; unit: string }> = {},
): TelemetryReading => ({
  ts: new Date(NOW_MS - (options.ageMs ?? 1_000)).toISOString(),
  jobId: job.jobId,
  tag,
  value,
  unit: options.unit ?? 'psi',
  quality: options.quality ?? 'good',
});

const tick = (
  store: TelemetryStore,
  prev: AlarmCenterSnapshot | undefined,
  ackedIds: ReadonlySet<string> = new Set(),
  now = NOW_MS,
): AlarmCenterSnapshot =>
  deriveAlarmCenterSnapshot({
    store,
    jobs: [JOB_HP_HF],
    prev,
    ackedIds,
    nowMs: now,
    tagLabeller: labeller,
  });

/** Locate an event or fail the test if missing — narrows the type. */
const requireEvent = (
  snap: AlarmCenterSnapshot,
  predicate: (e: LiveAlarmEvent) => boolean,
  label: string,
): LiveAlarmEvent => {
  const found = snap.events.find(predicate);
  if (!found) {
    throw new Error(`Expected to find event: ${label}`);
  }
  return found;
};

describe('deriveAlarmCenterSnapshot — first tick', () => {
  it('emits an URGENT process event when a reading crosses alarmHigh', () => {
    const store = new TelemetryStore();
    // p_inlet.alarmHigh = 2100 on JOB_HP_HF
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_HP_HF, CANONICAL_TAGS.PInlet, 2200),
    });

    const snap = tick(store, undefined);
    const events = snap.events.filter((e) => e.tag === CANONICAL_TAGS.PInlet);
    expect(events).toHaveLength(1);
    const e = requireEvent(snap, (x) => x.tag === CANONICAL_TAGS.PInlet, 'p_inlet alarm_high');
    expect(e.severity).toBe('URGENT');
    expect(e.source).toBe('PROCESS');
    expect(e.evaluatedState).toBe('alarm_high');
    expect(e.lifecycle).toBe('ACTIVE');
    expect(e.value).toBe(2200);
    expect(e.thresholdValue).toBe(2100);
    expect(e.thresholdHit).toBe('alarmHigh');
    expect(snap.summary.urgent).toBe(1);
    expect(snap.summary.activeTotal).toBeGreaterThanOrEqual(1);
  });

  it('emits a HIGH process event for warning bands', () => {
    const store = new TelemetryStore();
    // p_inlet.warningHigh = 1900
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_HP_HF, CANONICAL_TAGS.PInlet, 1950),
    });
    const snap = tick(store, undefined);
    const e = requireEvent(snap, (x) => x.tag === CANONICAL_TAGS.PInlet, 'p_inlet warning_high');
    expect(e.severity).toBe('HIGH');
    expect(e.evaluatedState).toBe('warning_high');
    expect(e.source).toBe('PROCESS');
  });

  it('classifies an offline tag as HIGH communication, not as a process event', () => {
    const store = new TelemetryStore();
    // No reading at all — tag is offline (lastTs undefined).
    const snap = tick(store, undefined);
    const offline = requireEvent(
      snap,
      (e) => e.tag === CANONICAL_TAGS.PInlet && e.evaluatedState === 'offline',
      'p_inlet offline',
    );
    expect(offline.severity).toBe('HIGH');
    expect(offline.source).toBe('COMMUNICATION');
    expect(snap.summary.communicationActive).toBeGreaterThan(0);
    // Stale/offline must NOT count as process URGENT.
    expect(snap.summary.urgent).toBe(0);
  });

  it('classifies a bad-quality reading as MEDIUM data quality', () => {
    const store = new TelemetryStore();
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_HP_HF, CANONICAL_TAGS.PInlet, null, { quality: 'bad' }),
    });
    const snap = tick(store, undefined);
    const e = requireEvent(
      snap,
      (x) => x.tag === CANONICAL_TAGS.PInlet && x.evaluatedState === 'no_data',
      'p_inlet no_data',
    );
    expect(e.severity).toBe('MEDIUM');
    expect(e.source).toBe('DATA_QUALITY');
    expect(snap.summary.dataQualityActive).toBeGreaterThan(0);
  });

  it('does NOT emit events for normal readings', () => {
    const store = new TelemetryStore();
    // p_inlet.warningLow = 700, warningHigh = 1900 — 1500 is well inside.
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_HP_HF, CANONICAL_TAGS.PInlet, 1500),
    });
    const snap = tick(store, undefined);
    const e = snap.events.find((x) => x.tag === CANONICAL_TAGS.PInlet);
    // The tag should NOT appear as an event when it's normal.
    expect(e).toBeUndefined();
  });
});

describe('deriveAlarmCenterSnapshot — identity over time', () => {
  it('preserves the event id while the underlying state is unchanged', () => {
    const store = new TelemetryStore();
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_HP_HF, CANONICAL_TAGS.PInlet, 2200),
    });
    const first = tick(store, undefined);
    const firstEvent = requireEvent(first, (e) => e.tag === CANONICAL_TAGS.PInlet, 'first');

    // Another tick with another in-band reading — same state, new value.
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_HP_HF, CANONICAL_TAGS.PInlet, 2250),
    });
    const second = tick(store, first);
    const secondEvent = requireEvent(second, (e) => e.tag === CANONICAL_TAGS.PInlet, 'second');

    expect(secondEvent.id).toBe(firstEvent.id);
    expect(secondEvent.firstSeenAt).toBe(firstEvent.firstSeenAt);
    expect(secondEvent.value).toBe(2250);
  });

  it('clears the event when the value returns to normal', () => {
    const store = new TelemetryStore();
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_HP_HF, CANONICAL_TAGS.PInlet, 2200),
    });
    const first = tick(store, undefined);
    const firstEvent = requireEvent(first, (e) => e.tag === CANONICAL_TAGS.PInlet, 'first');

    // Now a healthy reading.
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_HP_HF, CANONICAL_TAGS.PInlet, 1500),
    });
    const second = tick(store, first);
    const same = requireEvent(second, (e) => e.id === firstEvent.id, 'cleared');
    expect(same.lifecycle).toBe('CLEARED');
    expect(same.clearedAt).toBeDefined();
    expect(second.summary.cleared).toBeGreaterThan(0);
  });

  it('mints a NEW event when the same tag re-enters an alarm band after clearing', () => {
    const store = new TelemetryStore();
    // t0: in alarm
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_HP_HF, CANONICAL_TAGS.PInlet, 2200, { ageMs: 30_000 }),
    });
    const first = tick(store, undefined);
    const firstEvent = requireEvent(first, (e) => e.tag === CANONICAL_TAGS.PInlet, 'first');

    // t1: heal
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_HP_HF, CANONICAL_TAGS.PInlet, 1500, { ageMs: 20_000 }),
    });
    const cleared = tick(store, first);

    // t2: re-alarm at a fresh wire timestamp — production behaviour
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_HP_HF, CANONICAL_TAGS.PInlet, 2400, { ageMs: 1_000 }),
    });
    const reAlarmed = tick(store, cleared);

    const active = requireEvent(
      reAlarmed,
      (e) => e.tag === CANONICAL_TAGS.PInlet && e.lifecycle === 'ACTIVE',
      'new active',
    );
    expect(active.id).not.toBe(firstEvent.id);
    // Previous event remains in the snapshot as cleared
    const stillCleared = reAlarmed.events.find((e) => e.id === firstEvent.id);
    expect(stillCleared?.lifecycle).toBe('CLEARED');
  });

  it('transitions an event to ACKED when its id is in the ack set', () => {
    const store = new TelemetryStore();
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_HP_HF, CANONICAL_TAGS.PInlet, 2200),
    });
    const first = tick(store, undefined);
    const firstEvent = requireEvent(first, (e) => e.tag === CANONICAL_TAGS.PInlet, 'first');
    expect(firstEvent.lifecycle).toBe('ACTIVE');

    // Acknowledge and tick again with another reading still in alarm band.
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_HP_HF, CANONICAL_TAGS.PInlet, 2250),
    });
    const second = tick(store, first, new Set([firstEvent.id]));
    const acked = requireEvent(second, (e) => e.id === firstEvent.id, 'acked');
    expect(acked.lifecycle).toBe('ACKED');
    expect(acked.ackedBy).toBe('You');
    expect(acked.ackedAt).toBeDefined();
    expect(second.summary.acked).toBeGreaterThanOrEqual(1);
    expect(second.summary.activeUnacked).toBe(second.summary.activeTotal - second.summary.acked);
  });
});

describe('deriveAlarmCenterSnapshot — sorting + summary', () => {
  it('sorts active before acked before cleared, then by severity', () => {
    const store = new TelemetryStore();
    // p_inlet alarm_high
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_HP_HF, CANONICAL_TAGS.PInlet, 2200),
    });
    // q_total_in warning_high (warningHigh=4400)
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_HP_HF, CANONICAL_TAGS.QTotalIn, 4500, { unit: 'bbl/d' }),
    });
    const snap = tick(store, undefined);
    const order = snap.events
      .filter((e) => e.lifecycle === 'ACTIVE' && e.source === 'PROCESS')
      .map((e) => e.severity);
    // URGENT must come before HIGH in the active section.
    const firstUrgent = order.indexOf('URGENT');
    const firstHigh = order.indexOf('HIGH');
    expect(firstUrgent).toBeGreaterThanOrEqual(0);
    expect(firstHigh).toBeGreaterThanOrEqual(0);
    expect(firstUrgent).toBeLessThan(firstHigh);
  });

  it('ackPct is a value 0..100', () => {
    const store = new TelemetryStore();
    const empty = tick(store, undefined);
    // The empty store still produces offline events for every enabled sensor.
    expect(empty.summary.ackPct).toBeGreaterThanOrEqual(0);
    expect(empty.summary.ackPct).toBeLessThanOrEqual(100);
  });
});

describe('deriveAlarmCenterSnapshot — stale handling for the dedicated stale job', () => {
  it('produces an OFFLINE event for the JOB_STALE p_inlet after its override window elapses', () => {
    // p_inlet override on JOB_STALE: offlineAfterSec=45. We simulate "60s of silence".
    const store = new TelemetryStore();
    // Put a reading 60 seconds ago so the detector marks it offline.
    store.ingest({
      kind: 'reading',
      reading: {
        ts: new Date(NOW_MS - 60_000).toISOString(),
        jobId: JOB_STALE.jobId,
        tag: CANONICAL_TAGS.PInlet,
        value: 800,
        unit: 'psi',
        quality: 'good',
      },
    });
    const snap = deriveAlarmCenterSnapshot({
      store,
      jobs: [JOB_STALE],
      prev: undefined,
      ackedIds: new Set(),
      nowMs: NOW_MS,
      tagLabeller: labeller,
    });
    const offline = snap.events.find(
      (e: LiveAlarmEvent) => e.tag === CANONICAL_TAGS.PInlet && e.evaluatedState === 'offline',
    );
    expect(offline).toBeDefined();
    if (!offline) throw new Error('unreachable');
    expect(offline.severity).toBe('HIGH');
    expect(offline.source).toBe('COMMUNICATION');
  });
});
