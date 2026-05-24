import { brand } from '@rvf/types';
import { describe, expect, it } from 'vitest';

import { JOB_HP_HF, JOB_STALE } from '../jobs/snapshots.mock';
import { CANONICAL_TAGS } from '../telemetry/tags';

import { evaluateReading } from './evaluator';

import type { CommissioningSnapshot } from '../jobs/types';
import type { DataQuality, TelemetryReading } from '../telemetry/models';
import type { CanonicalTag, JobId } from '@rvf/types';

const FIXED_NOW = '2026-05-23T10:00:00Z';

const reading = (
  jobId: JobId,
  tag: CanonicalTag,
  value: number | null,
  quality: DataQuality = 'good',
): TelemetryReading => ({
  ts: FIXED_NOW,
  jobId,
  tag,
  value,
  unit: 'psi',
  quality,
});

const minimalSnapshot = (overrides?: Partial<CommissioningSnapshot>): CommissioningSnapshot => ({
  snapshotId: brand<string, 'CommissioningId'>('CS-TEST'),
  jobId: brand<string, 'JobId'>('JOB-TEST'),
  unitId: brand<string, 'EquipmentId'>('EQ-TEST'),
  wellId: brand<string, 'WellId'>('PZ-TEST'),
  tenantId: brand<string, 'TenantId'>('TN-TEST'),
  takenAt: '2026-05-23T00:00:00Z',
  sensors: [
    {
      sensorId: 'PS-T',
      canonicalTag: CANONICAL_TAGS.PInlet,
      enabled: true,
    },
  ],
  effectiveThresholds: {
    [CANONICAL_TAGS.PInlet]: {
      warningLow: 100,
      warningHigh: 200,
      alarmLow: 50,
      alarmHigh: 300,
      unit: 'psi',
      precision: 0,
    },
  },
  ...overrides,
});

describe('evaluateReading', () => {
  it('returns normal when value is inside warning bounds', () => {
    const snap = minimalSnapshot();
    const r = reading(snap.jobId, CANONICAL_TAGS.PInlet, 150);
    const result = evaluateReading(r, snap, { nowIso: FIXED_NOW });
    expect(result.state).toBe('normal');
    expect(result.thresholdHit).toBeUndefined();
    expect(result.thresholdsSource).toBe('commissioning_snapshot');
    expect(result.evaluatedAt).toBe(FIXED_NOW);
    expect(result.quality).toBe('good');
  });

  it('returns warning_high when value crosses warningHigh but not alarmHigh', () => {
    const snap = minimalSnapshot();
    const result = evaluateReading(reading(snap.jobId, CANONICAL_TAGS.PInlet, 220), snap, {
      nowIso: FIXED_NOW,
    });
    expect(result.state).toBe('warning_high');
    expect(result.thresholdHit).toBe('warningHigh');
  });

  it('returns warning_low when value crosses warningLow but not alarmLow', () => {
    const snap = minimalSnapshot();
    const result = evaluateReading(reading(snap.jobId, CANONICAL_TAGS.PInlet, 75), snap, {
      nowIso: FIXED_NOW,
    });
    expect(result.state).toBe('warning_low');
    expect(result.thresholdHit).toBe('warningLow');
  });

  it('alarmHigh wins over warningHigh at the same value', () => {
    const snap = minimalSnapshot();
    const result = evaluateReading(reading(snap.jobId, CANONICAL_TAGS.PInlet, 305), snap, {
      nowIso: FIXED_NOW,
    });
    expect(result.state).toBe('alarm_high');
    expect(result.thresholdHit).toBe('alarmHigh');
  });

  it('alarmLow wins over warningLow at the same value', () => {
    const snap = minimalSnapshot();
    const result = evaluateReading(reading(snap.jobId, CANONICAL_TAGS.PInlet, 40), snap, {
      nowIso: FIXED_NOW,
    });
    expect(result.state).toBe('alarm_low');
    expect(result.thresholdHit).toBe('alarmLow');
  });

  it('returns no_data for null value', () => {
    const snap = minimalSnapshot();
    const result = evaluateReading(reading(snap.jobId, CANONICAL_TAGS.PInlet, null), snap, {
      nowIso: FIXED_NOW,
    });
    expect(result.state).toBe('no_data');
    expect(result.thresholdHit).toBeUndefined();
  });

  it('returns no_data when quality is bad even if value is in band', () => {
    const snap = minimalSnapshot();
    const result = evaluateReading(reading(snap.jobId, CANONICAL_TAGS.PInlet, 150, 'bad'), snap, {
      nowIso: FIXED_NOW,
    });
    expect(result.state).toBe('no_data');
  });

  it('returns disabled when the sensor is disabled in the snapshot', () => {
    const snap = minimalSnapshot({
      sensors: [{ sensorId: 'PS-T', canonicalTag: CANONICAL_TAGS.PInlet, enabled: false }],
    });
    const result = evaluateReading(reading(snap.jobId, CANONICAL_TAGS.PInlet, 150), snap, {
      nowIso: FIXED_NOW,
    });
    expect(result.state).toBe('disabled');
  });

  it('returns disabled when no mapping exists for the tag', () => {
    const snap = minimalSnapshot({ sensors: [] });
    const result = evaluateReading(reading(snap.jobId, CANONICAL_TAGS.PInlet, 150), snap, {
      nowIso: FIXED_NOW,
    });
    expect(result.state).toBe('disabled');
  });

  it('returns disabled when no thresholds are defined for the tag', () => {
    const snap = minimalSnapshot({ effectiveThresholds: {} });
    const result = evaluateReading(reading(snap.jobId, CANONICAL_TAGS.PInlet, 150), snap, {
      nowIso: FIXED_NOW,
    });
    expect(result.state).toBe('disabled');
  });

  it('tolerates partial thresholds (no warningHigh defined)', () => {
    const snap = minimalSnapshot({
      effectiveThresholds: {
        [CANONICAL_TAGS.PInlet]: {
          alarmHigh: 300,
          unit: 'psi',
          precision: 0,
        },
      },
    });
    const ok = evaluateReading(reading(snap.jobId, CANONICAL_TAGS.PInlet, 250), snap, {
      nowIso: FIXED_NOW,
    });
    expect(ok.state).toBe('normal');
    const tripped = evaluateReading(reading(snap.jobId, CANONICAL_TAGS.PInlet, 305), snap, {
      nowIso: FIXED_NOW,
    });
    expect(tripped.state).toBe('alarm_high');
  });

  it('always reports thresholdsSource = commissioning_snapshot (ADR-005)', () => {
    const result = evaluateReading(
      reading(JOB_HP_HF.jobId, CANONICAL_TAGS.PInlet, 1500),
      JOB_HP_HF.snapshot,
      { nowIso: FIXED_NOW },
    );
    expect(result.thresholdsSource).toBe('commissioning_snapshot');
  });

  it('honors mock snapshot effective thresholds over catalog defaults', () => {
    // EMMAD-01.suggestedDefaults[p_inlet].warningHigh = 1800.
    // JOB_HP_HF.snapshot.effectiveThresholds[p_inlet].warningHigh = 1900.
    // A reading at 1850 is "below warning" per snapshot, but "above warning"
    // per catalog. The evaluator MUST use the snapshot.
    const result = evaluateReading(
      reading(JOB_HP_HF.jobId, CANONICAL_TAGS.PInlet, 1850),
      JOB_HP_HF.snapshot,
      { nowIso: FIXED_NOW },
    );
    expect(result.state).toBe('normal');
  });

  it('respects disabled sensors defined in a real mock snapshot', () => {
    // JOB_STALE.snapshot disables WaterCut.
    const result = evaluateReading(
      reading(JOB_STALE.jobId, CANONICAL_TAGS.WaterCut, 40),
      JOB_STALE.snapshot,
      { nowIso: FIXED_NOW },
    );
    expect(result.state).toBe('disabled');
  });
});
