import { brand } from '@rvf/types';
import { describe, expect, it } from 'vitest';

import { CANONICAL_TAGS } from '../telemetry/tags';

import {
  computeStaleFromSnapshot,
  computeStaleState,
  DEFAULT_STALE_TIMINGS,
  resolveTimings,
} from './stale';

import type { CommissioningSnapshot } from '../jobs/types';
import type { JobId } from '@rvf/types';

const JOB = brand<string, 'JobId'>('JOB-STALE-T') as JobId;

const snapshot = (): CommissioningSnapshot => ({
  snapshotId: brand<string, 'CommissioningId'>('CS-T'),
  jobId: JOB,
  unitId: brand<string, 'EquipmentId'>('EQ-T'),
  wellId: brand<string, 'WellId'>('PZ-T'),
  tenantId: brand<string, 'TenantId'>('TN-T'),
  takenAt: '2026-05-23T00:00:00Z',
  sensors: [{ sensorId: 'PS-T', canonicalTag: CANONICAL_TAGS.PInlet, enabled: true }],
  effectiveThresholds: {},
  staleTimings: {
    [CANONICAL_TAGS.PInlet]: {
      delayedAfterSec: 5,
      staleAfterSec: 15,
      offlineAfterSec: 45,
    },
  },
});

describe('resolveTimings', () => {
  it('returns defaults when no overrides are provided', () => {
    expect(resolveTimings(CANONICAL_TAGS.PInlet, undefined)).toEqual(DEFAULT_STALE_TIMINGS);
  });

  it('falls back per-field when the override is partial', () => {
    const t = resolveTimings(CANONICAL_TAGS.PInlet, {
      [CANONICAL_TAGS.PInlet]: { delayedAfterSec: 1 },
    });
    expect(t.delayedAfterSec).toBe(1);
    expect(t.staleAfterSec).toBe(DEFAULT_STALE_TIMINGS.staleAfterSec);
    expect(t.offlineAfterSec).toBe(DEFAULT_STALE_TIMINGS.offlineAfterSec);
  });

  it('uses defaults for tags without an entry in overrides', () => {
    expect(
      resolveTimings(CANONICAL_TAGS.QGas, {
        [CANONICAL_TAGS.PInlet]: { delayedAfterSec: 1 },
      }),
    ).toEqual(DEFAULT_STALE_TIMINGS);
  });
});

describe('computeStaleState (defaults)', () => {
  const T0 = Date.parse('2026-05-23T10:00:00Z');
  it('returns offline when no reading was ever seen', () => {
    expect(computeStaleState({ jobId: JOB, tag: CANONICAL_TAGS.PInlet, nowMs: T0 })).toEqual({
      jobId: JOB,
      tag: CANONICAL_TAGS.PInlet,
      status: 'offline',
    });
  });

  it('returns live for a recent reading (< delayed)', () => {
    const s = computeStaleState({
      jobId: JOB,
      tag: CANONICAL_TAGS.PInlet,
      lastTs: new Date(T0 - 1_000).toISOString(),
      nowMs: T0,
    });
    expect(s.status).toBe('live');
  });

  it('returns delayed at the boundary', () => {
    const s = computeStaleState({
      jobId: JOB,
      tag: CANONICAL_TAGS.PInlet,
      lastTs: new Date(T0 - 10_000).toISOString(),
      nowMs: T0,
    });
    expect(s.status).toBe('delayed');
  });

  it('returns stale at the boundary', () => {
    const s = computeStaleState({
      jobId: JOB,
      tag: CANONICAL_TAGS.PInlet,
      lastTs: new Date(T0 - 30_000).toISOString(),
      nowMs: T0,
    });
    expect(s.status).toBe('stale');
  });

  it('returns offline at the boundary', () => {
    const s = computeStaleState({
      jobId: JOB,
      tag: CANONICAL_TAGS.PInlet,
      lastTs: new Date(T0 - 120_000).toISOString(),
      nowMs: T0,
    });
    expect(s.status).toBe('offline');
  });

  it('returns offline for an unparseable timestamp', () => {
    const s = computeStaleState({
      jobId: JOB,
      tag: CANONICAL_TAGS.PInlet,
      lastTs: 'not-a-date',
      nowMs: T0,
    });
    expect(s.status).toBe('offline');
    expect(s.lastTs).toBe('not-a-date');
  });
});

describe('computeStaleFromSnapshot (overrides)', () => {
  const T0 = Date.parse('2026-05-23T10:00:00Z');
  it('uses snapshot override (5s delayed) before global default (10s)', () => {
    const s = computeStaleFromSnapshot({
      jobId: JOB,
      tag: CANONICAL_TAGS.PInlet,
      lastTs: new Date(T0 - 7_000).toISOString(),
      nowMs: T0,
      snapshot: snapshot(),
    });
    // 7s > 5s override delayed boundary, < 15s stale.
    expect(s.status).toBe('delayed');
  });

  it('uses snapshot override (45s offline) before global default (120s)', () => {
    const s = computeStaleFromSnapshot({
      jobId: JOB,
      tag: CANONICAL_TAGS.PInlet,
      lastTs: new Date(T0 - 60_000).toISOString(),
      nowMs: T0,
      snapshot: snapshot(),
    });
    expect(s.status).toBe('offline');
  });

  it('falls back to defaults for tags without an override entry', () => {
    const s = computeStaleFromSnapshot({
      jobId: JOB,
      tag: CANONICAL_TAGS.QGas,
      lastTs: new Date(T0 - 12_000).toISOString(),
      nowMs: T0,
      snapshot: snapshot(),
    });
    // 12s > 10s default delayed boundary, < 30s default stale.
    expect(s.status).toBe('delayed');
  });
});
