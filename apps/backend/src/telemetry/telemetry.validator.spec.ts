import { describe, expect, it } from 'vitest';

import { TelemetryValidator } from './telemetry.validator';

const v = new TelemetryValidator();

const validEnvelope = {
  schema: 'rvf.telemetry.v1',
  unit_id: 'emmad-01',
  well_id: 'CN-014',
  job_id: 'JOB-2026-0001',
  ts: '2026-05-18T14:32:05.000Z',
  seq: 184432,
  measurements: {
    p_inlet: { v: 1245.7, u: 'psi', q: 'good' },
    t_outlet: { v: 71.9, u: 'degC', q: 'good' },
    water_cut: { v: 12.4, u: 'pct', q: 'estimated' },
  },
};

describe('TelemetryValidator (F1.5.2)', () => {
  it('accepts the canonical telemetry-foundation §4 envelope shape', () => {
    const result = v.validate(validEnvelope);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.unit_id).toBe('emmad-01');
      expect(Object.keys(result.envelope.measurements)).toHaveLength(3);
    }
  });

  it('accepts every Quality enum value', () => {
    for (const q of ['good', 'estimated', 'uncertain', 'bad', 'stale']) {
      const result = v.validate({
        ...validEnvelope,
        measurements: { p_inlet: { v: 100, u: 'psi', q } },
      });
      expect(result.ok).toBe(true);
    }
  });

  it('tolerates out-of-order timestamps (no monotonic check at the validator)', () => {
    const past = v.validate({ ...validEnvelope, ts: '2020-01-01T00:00:00.000Z' });
    expect(past.ok).toBe(true);
  });

  it('rejects non-UTC timestamps (no offset accepted — telemetry-foundation §4)', () => {
    const offset = v.validate({ ...validEnvelope, ts: '2026-05-18T14:32:05+02:00' });
    expect(offset.ok).toBe(false);
    if (!offset.ok) expect(offset.reason).toMatch(/UTC/);
  });

  it('rejects naïve timestamps (no Z, no offset)', () => {
    const naive = v.validate({ ...validEnvelope, ts: '2026-05-18T14:32:05' });
    expect(naive.ok).toBe(false);
  });

  it('rejects the wrong schema version', () => {
    const wrong = v.validate({ ...validEnvelope, schema: 'rvf.telemetry.v2' });
    expect(wrong.ok).toBe(false);
  });

  it('rejects an empty measurements map', () => {
    const empty = v.validate({ ...validEnvelope, measurements: {} });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toMatch(/at least one measurement/);
  });

  it('rejects negative seq', () => {
    const neg = v.validate({ ...validEnvelope, seq: -1 });
    expect(neg.ok).toBe(false);
  });

  it('rejects non-finite measurement values', () => {
    const inf = v.validate({
      ...validEnvelope,
      measurements: { p_inlet: { v: Infinity, u: 'psi', q: 'good' } },
    });
    expect(inf.ok).toBe(false);
  });

  it('rejects unknown quality strings', () => {
    const weird = v.validate({
      ...validEnvelope,
      measurements: { p_inlet: { v: 100, u: 'psi', q: 'spicy' } },
    });
    expect(weird.ok).toBe(false);
  });

  it('rejects extra root-level keys (strict mode)', () => {
    const extra = v.validate({ ...validEnvelope, weird_extra: 1 });
    expect(extra.ok).toBe(false);
  });

  it('returns structured issues on failure', () => {
    const bad = v.validate({ schema: 'rvf.telemetry.v1' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.issues.length).toBeGreaterThan(0);
      expect(bad.reason).toContain(':');
    }
  });
});
