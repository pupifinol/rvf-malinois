import { brand } from '@rvf/types';
import { describe, expect, it, vi } from 'vitest';

import { JOB_HP_HF } from '../jobs/snapshots.mock';
import { CANONICAL_TAGS } from '../telemetry/tags';

import { TelemetryStore } from './telemetryStore';

import type {
  AlarmEvent,
  CommunicationStatus,
  NormalizedTelemetryMessage,
  TelemetryReading,
} from '../telemetry/models';
import type { CanonicalTag, JobId } from '@rvf/types';

const otherJob = brand<string, 'JobId'>('JOB-OTHER') as JobId;

const reading = (
  jobId: JobId,
  tag: CanonicalTag,
  value: number,
  seq: number,
): TelemetryReading => ({
  ts: new Date(1_700_000_000_000 + seq * 1_000).toISOString(),
  jobId,
  tag,
  value,
  unit: 'psi',
  quality: 'good',
  seq,
});

describe('TelemetryStore', () => {
  it('returns undefined latest for a (jobId, tag) it has never seen', () => {
    const store = new TelemetryStore();
    expect(store.getLatestReading(JOB_HP_HF.jobId, CANONICAL_TAGS.PInlet)).toBeUndefined();
    expect(store.getHistory(JOB_HP_HF.jobId, CANONICAL_TAGS.PInlet)).toEqual([]);
  });

  it('stores readings per (jobId, tag) and returns the latest', () => {
    const store = new TelemetryStore();
    const r1 = reading(JOB_HP_HF.jobId, CANONICAL_TAGS.PInlet, 1100, 1);
    const r2 = reading(JOB_HP_HF.jobId, CANONICAL_TAGS.PInlet, 1120, 2);
    store.ingest({ kind: 'reading', reading: r1 });
    store.ingest({ kind: 'reading', reading: r2 });
    expect(store.getLatestReading(JOB_HP_HF.jobId, CANONICAL_TAGS.PInlet)).toEqual(r2);
    expect(store.getHistory(JOB_HP_HF.jobId, CANONICAL_TAGS.PInlet)).toEqual([r1, r2]);
  });

  it('respects ring capacity', () => {
    const store = new TelemetryStore({ capacityPerTag: 3 });
    for (let i = 0; i < 5; i += 1) {
      store.ingest({
        kind: 'reading',
        reading: reading(JOB_HP_HF.jobId, CANONICAL_TAGS.PInlet, 1000 + i, i),
      });
    }
    expect(store.getHistory(JOB_HP_HF.jobId, CANONICAL_TAGS.PInlet).length).toBe(3);
    expect(store.getLatestReading(JOB_HP_HF.jobId, CANONICAL_TAGS.PInlet)?.value).toBe(1004);
  });

  it('ingests frames as a batch of readings', () => {
    const store = new TelemetryStore();
    const r1 = reading(JOB_HP_HF.jobId, CANONICAL_TAGS.PInlet, 1100, 1);
    const r2 = reading(JOB_HP_HF.jobId, CANONICAL_TAGS.QGas, 6.1, 2);
    store.ingest({
      kind: 'frame',
      frame: { ts: r1.ts, jobId: JOB_HP_HF.jobId, readings: [r1, r2] },
    });
    expect(store.getLatestReading(JOB_HP_HF.jobId, CANONICAL_TAGS.PInlet)).toEqual(r1);
    expect(store.getLatestReading(JOB_HP_HF.jobId, CANONICAL_TAGS.QGas)).toEqual(r2);
  });

  it('only notifies tag subscribers when their tag changes', () => {
    const store = new TelemetryStore();
    const cbP = vi.fn();
    const cbQ = vi.fn();
    store.subscribeTag(JOB_HP_HF.jobId, CANONICAL_TAGS.PInlet, cbP);
    store.subscribeTag(JOB_HP_HF.jobId, CANONICAL_TAGS.QGas, cbQ);
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_HP_HF.jobId, CANONICAL_TAGS.PInlet, 1100, 1),
    });
    expect(cbP).toHaveBeenCalledTimes(1);
    expect(cbQ).not.toHaveBeenCalled();
  });

  it('isolates jobs from each other', () => {
    const store = new TelemetryStore();
    const cb = vi.fn();
    store.subscribeJob(JOB_HP_HF.jobId, cb);
    // Ingest into another job — no notification.
    store.ingest({
      kind: 'reading',
      reading: reading(otherJob, CANONICAL_TAGS.PInlet, 100, 1),
    });
    expect(cb).not.toHaveBeenCalled();
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_HP_HF.jobId, CANONICAL_TAGS.PInlet, 1100, 2),
    });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops further notifications', () => {
    const store = new TelemetryStore();
    const cb = vi.fn();
    const off = store.subscribeTag(JOB_HP_HF.jobId, CANONICAL_TAGS.PInlet, cb);
    off();
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_HP_HF.jobId, CANONICAL_TAGS.PInlet, 1100, 1),
    });
    expect(cb).not.toHaveBeenCalled();
  });

  it('updates connection status and notifies connection subscribers only', () => {
    const store = new TelemetryStore();
    const cbConn = vi.fn();
    const cbTag = vi.fn();
    store.subscribeConnection(cbConn);
    store.subscribeTag(JOB_HP_HF.jobId, CANONICAL_TAGS.PInlet, cbTag);
    const status: CommunicationStatus = { kind: 'connected', since: '2026-05-23T10:00:00Z' };
    store.ingest({ kind: 'connection', status });
    expect(store.getConnectionStatus()).toEqual(status);
    expect(cbConn).toHaveBeenCalledTimes(1);
    expect(cbTag).not.toHaveBeenCalled();
  });

  it('stores and surfaces alarm events without confusing them for readings', () => {
    const store = new TelemetryStore();
    const alarm: AlarmEvent = {
      jobId: JOB_HP_HF.jobId,
      tag: CANONICAL_TAGS.PInlet,
      ts: '2026-05-23T10:00:00Z',
      state: 'alarm_high',
      value: 2200,
      threshold: 2100,
      thresholdsSource: 'commissioning_snapshot',
    };
    store.ingest({ kind: 'alarm', alarm });
    expect(store.getLatestAlarm(JOB_HP_HF.jobId, CANONICAL_TAGS.PInlet)).toEqual(alarm);
    expect(store.getLatestReading(JOB_HP_HF.jobId, CANONICAL_TAGS.PInlet)).toBeUndefined();
  });

  it('heartbeat and snapshot-update are accepted without side effects on stores', () => {
    const store = new TelemetryStore();
    const cb = vi.fn();
    store.subscribeJob(JOB_HP_HF.jobId, cb);
    const heartbeat: NormalizedTelemetryMessage = {
      kind: 'heartbeat',
      ts: '2026-05-23T10:00:00Z',
    };
    store.ingest(heartbeat);
    expect(cb).not.toHaveBeenCalled();
  });

  it('knownTagsForJob lists what was ingested', () => {
    const store = new TelemetryStore();
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_HP_HF.jobId, CANONICAL_TAGS.PInlet, 1100, 1),
    });
    store.ingest({
      kind: 'reading',
      reading: reading(JOB_HP_HF.jobId, CANONICAL_TAGS.QGas, 6.0, 2),
    });
    const tags = store.knownTagsForJob(JOB_HP_HF.jobId).map((t) => String(t));
    expect(tags).toContain(String(CANONICAL_TAGS.PInlet));
    expect(tags).toContain(String(CANONICAL_TAGS.QGas));
  });
});
