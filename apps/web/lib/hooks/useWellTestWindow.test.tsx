/**
 * F4.7.2.1 — `deriveWellTestWindow` / `defaultPillForActiveWellTest` tests.
 *
 * Pure unit tests using a fixed `nowMs` so the derivations are
 * timezone-independent and clock-independent.
 *
 * Covers F4.7.2-0 §7 rules:
 *
 *   - `last_hour` always enabled; (now - 1h, now).
 *   - `stabilization` enabled iff `stabilizationStartedAt` is set.
 *   - `official_window` enabled iff `officialStartedAt` is set; clamped by
 *     lifecycle status.
 *   - `full_test` enabled iff `connectedAt || stabilizationStartedAt` is set.
 *   - Aborted-test posture per §7.5.
 *   - Defensive `null` and invariant-violation handling per §12.
 *   - `defaultPillForActiveWellTest` per §8.
 */
import { describe, expect, it } from 'vitest';

import { defaultPillForActiveWellTest, deriveWellTestWindow } from './useWellTestWindow';

import type { WellTestRow } from '@/lib/api/f4';

const NOW_MS = Date.UTC(2026, 4, 29, 10, 0, 0); // 2026-05-29T10:00:00.000Z

const ROW_BASE: WellTestRow = {
  id: '00000000-0000-0000-0000-000000007001',
  jobId: '00000000-0000-0000-0000-000000003001',
  wellId: '00000000-0000-0000-0000-000000002001',
  unitId: '00000000-0000-0000-0000-000000004411',
  testType: 'fiscalizacion',
  reportType: 'fiscalizacion_pdf',
  lifecycleStatus: 'scheduled',
  plannedOfficialDurationHours: 24,
  actualOfficialDurationSeconds: null,
  connectedAt: null,
  stabilizationStartedAt: null,
  stabilizationEndedAt: null,
  officialStartedAt: null,
  officialEndedAt: null,
  disconnectedAt: null,
  reportGeneratedAt: null,
  abortedAt: null,
  abortReason: null,
  notes: null,
  clientReference: null,
  createdAt: '2026-05-29T08:00:00.000Z',
  updatedAt: '2026-05-29T08:00:00.000Z',
};

const measuring = (overrides: Partial<WellTestRow> = {}): WellTestRow => ({
  ...ROW_BASE,
  lifecycleStatus: 'measuring',
  connectedAt: '2026-05-29T08:00:00.000Z',
  stabilizationStartedAt: '2026-05-29T08:05:00.000Z',
  stabilizationEndedAt: '2026-05-29T09:05:00.000Z',
  officialStartedAt: '2026-05-29T09:05:00.000Z',
  ...overrides,
});

const stabilizing = (overrides: Partial<WellTestRow> = {}): WellTestRow => ({
  ...ROW_BASE,
  lifecycleStatus: 'stabilizing',
  connectedAt: '2026-05-29T08:00:00.000Z',
  stabilizationStartedAt: '2026-05-29T08:05:00.000Z',
  ...overrides,
});

describe('deriveWellTestWindow — last_hour', () => {
  it('always enabled even when active is null', () => {
    const w = deriveWellTestWindow(null, 'last_hour', NOW_MS);
    expect(w.isDisabled).toBe(false);
    expect(w.kind).toBe('diagnostic');
    expect(w.badgeLabel).toBe('Diagnostic');
    expect(w.fromMs).toBe(NOW_MS - 60 * 60 * 1000);
    expect(w.toMs).toBe(NOW_MS);
    expect(w.fromIso).toBe('2026-05-29T09:00:00.000Z');
    expect(w.toIso).toBe('2026-05-29T10:00:00.000Z');
  });

  it('enabled when active is measuring (diagnostic escape hatch)', () => {
    const w = deriveWellTestWindow(measuring(), 'last_hour', NOW_MS);
    expect(w.isDisabled).toBe(false);
    expect(w.kind).toBe('diagnostic');
  });
});

describe('deriveWellTestWindow — stabilization', () => {
  it('disabled when active is null', () => {
    const w = deriveWellTestWindow(null, 'stabilization', NOW_MS);
    expect(w.isDisabled).toBe(true);
    expect(w.disabledReason).toMatch(/Stabilization has not started/i);
  });

  it('disabled when stabilizationStartedAt is null', () => {
    const w = deriveWellTestWindow(
      { ...ROW_BASE, lifecycleStatus: 'connected', connectedAt: '2026-05-29T08:00:00.000Z' },
      'stabilization',
      NOW_MS,
    );
    expect(w.isDisabled).toBe(true);
  });

  it('uses (stabilizationStartedAt, stabilizationEndedAt) when both set', () => {
    const w = deriveWellTestWindow(measuring(), 'stabilization', NOW_MS);
    expect(w.isDisabled).toBe(false);
    expect(w.fromIso).toBe('2026-05-29T08:05:00.000Z');
    expect(w.toIso).toBe('2026-05-29T09:05:00.000Z');
    expect(w.kind).toBe('stabilization');
  });

  it('uses (stabilizationStartedAt, officialStartedAt) when end is null but official started', () => {
    const w = deriveWellTestWindow(
      stabilizing({
        stabilizationEndedAt: null,
        officialStartedAt: '2026-05-29T09:05:00.000Z',
      }),
      'stabilization',
      NOW_MS,
    );
    expect(w.toIso).toBe('2026-05-29T09:05:00.000Z');
  });

  it('uses (stabilizationStartedAt, now) when both end and official are null', () => {
    const w = deriveWellTestWindow(stabilizing(), 'stabilization', NOW_MS);
    expect(w.toMs).toBe(NOW_MS);
  });
});

describe('deriveWellTestWindow — official_window', () => {
  it('disabled when active is null', () => {
    const w = deriveWellTestWindow(null, 'official_window', NOW_MS);
    expect(w.isDisabled).toBe(true);
    expect(w.disabledReason).toMatch(/No active well test/i);
  });

  it('disabled when officialStartedAt is null', () => {
    const w = deriveWellTestWindow(stabilizing(), 'official_window', NOW_MS);
    expect(w.isDisabled).toBe(true);
    expect(w.disabledReason).toMatch(/Official measurement has not started/i);
  });

  it('measuring → (officialStartedAt, now), badge Official Window in progress', () => {
    const w = deriveWellTestWindow(measuring(), 'official_window', NOW_MS);
    expect(w.isDisabled).toBe(false);
    expect(w.fromIso).toBe('2026-05-29T09:05:00.000Z');
    expect(w.toMs).toBe(NOW_MS);
    expect(w.kind).toBe('official');
    expect(w.badgeLabel).toBe('Official Window in progress');
    expect(w.aborted).toBe(false);
  });

  it('completed → (officialStartedAt, officialEndedAt), badge Official Window completed', () => {
    const w = deriveWellTestWindow(
      measuring({
        lifecycleStatus: 'completed',
        officialEndedAt: '2026-05-30T09:05:00.000Z',
      }),
      'official_window',
      NOW_MS,
    );
    expect(w.isDisabled).toBe(false);
    expect(w.toIso).toBe('2026-05-30T09:05:00.000Z');
    expect(w.badgeLabel).toBe('Official Window completed');
  });

  it('closed → (officialStartedAt, officialEndedAt), badge Official Window completed', () => {
    const w = deriveWellTestWindow(
      measuring({
        lifecycleStatus: 'closed',
        officialEndedAt: '2026-05-30T09:05:00.000Z',
      }),
      'official_window',
      NOW_MS,
    );
    expect(w.isDisabled).toBe(false);
    expect(w.badgeLabel).toBe('Official Window completed');
  });

  it('completed without officialEndedAt → disabled invariant violation', () => {
    const w = deriveWellTestWindow(
      measuring({ lifecycleStatus: 'completed', officialEndedAt: null }),
      'official_window',
      NOW_MS,
    );
    expect(w.isDisabled).toBe(true);
    expect(w.disabledReason).toMatch(/Official window missing end timestamp/i);
    expect(w.badgeLabel).toMatch(/data invariant violation/i);
  });

  it('aborted with officialStartedAt → (officialStartedAt, abortedAt), badge Official Window aborted, aborted=true', () => {
    const w = deriveWellTestWindow(
      measuring({
        lifecycleStatus: 'aborted',
        abortedAt: '2026-05-29T15:00:00.000Z',
      }),
      'official_window',
      NOW_MS,
    );
    expect(w.isDisabled).toBe(false);
    expect(w.toIso).toBe('2026-05-29T15:00:00.000Z');
    expect(w.badgeLabel).toBe('Official Window aborted');
    expect(w.aborted).toBe(true);
  });

  it('aborted with no abortedAt falls back to officialEndedAt then now', () => {
    const w = deriveWellTestWindow(
      measuring({
        lifecycleStatus: 'aborted',
        abortedAt: null,
        officialEndedAt: null,
      }),
      'official_window',
      NOW_MS,
    );
    expect(w.toMs).toBe(NOW_MS);
    expect(w.aborted).toBe(true);
  });
});

describe('deriveWellTestWindow — full_test', () => {
  it('disabled when active is null', () => {
    const w = deriveWellTestWindow(null, 'full_test', NOW_MS);
    expect(w.isDisabled).toBe(true);
  });

  it('disabled when connected/stabilization both null', () => {
    const w = deriveWellTestWindow(
      { ...ROW_BASE, lifecycleStatus: 'scheduled' },
      'full_test',
      NOW_MS,
    );
    expect(w.isDisabled).toBe(true);
    expect(w.disabledReason).toMatch(/has not been connected yet/i);
  });

  it('uses connectedAt as start when set, disconnectedAt as end when set', () => {
    const w = deriveWellTestWindow(
      measuring({
        lifecycleStatus: 'closed',
        officialEndedAt: '2026-05-30T09:05:00.000Z',
        disconnectedAt: '2026-05-30T10:00:00.000Z',
      }),
      'full_test',
      NOW_MS,
    );
    expect(w.fromIso).toBe('2026-05-29T08:00:00.000Z');
    expect(w.toIso).toBe('2026-05-30T10:00:00.000Z');
    expect(w.kind).toBe('full_test');
  });

  it('falls through to stabilizationStartedAt when connectedAt is null', () => {
    const w = deriveWellTestWindow(
      {
        ...ROW_BASE,
        lifecycleStatus: 'stabilizing',
        connectedAt: null,
        stabilizationStartedAt: '2026-05-29T08:05:00.000Z',
      },
      'full_test',
      NOW_MS,
    );
    expect(w.fromIso).toBe('2026-05-29T08:05:00.000Z');
    expect(w.toMs).toBe(NOW_MS);
  });

  it('end falls through to officialEndedAt then now', () => {
    const w = deriveWellTestWindow(
      measuring({
        lifecycleStatus: 'completed',
        officialEndedAt: '2026-05-30T09:05:00.000Z',
        disconnectedAt: null,
      }),
      'full_test',
      NOW_MS,
    );
    expect(w.toIso).toBe('2026-05-30T09:05:00.000Z');
  });

  it('marks aborted=true when the test is aborted', () => {
    const w = deriveWellTestWindow(
      measuring({
        lifecycleStatus: 'aborted',
        abortedAt: '2026-05-29T15:00:00.000Z',
      }),
      'full_test',
      NOW_MS,
    );
    expect(w.aborted).toBe(true);
  });
});

describe('defaultPillForActiveWellTest', () => {
  it('returns last_hour when active is null', () => {
    expect(defaultPillForActiveWellTest(null)).toBe('last_hour');
  });

  it('returns official_window for measuring', () => {
    expect(defaultPillForActiveWellTest(measuring())).toBe('official_window');
  });

  it('returns official_window for completed', () => {
    expect(
      defaultPillForActiveWellTest(
        measuring({ lifecycleStatus: 'completed', officialEndedAt: '2026-05-30T09:05:00.000Z' }),
      ),
    ).toBe('official_window');
  });

  it('returns official_window for closed', () => {
    expect(
      defaultPillForActiveWellTest(
        measuring({ lifecycleStatus: 'closed', officialEndedAt: '2026-05-30T09:05:00.000Z' }),
      ),
    ).toBe('official_window');
  });

  it('returns stabilization for stabilizing', () => {
    expect(defaultPillForActiveWellTest(stabilizing())).toBe('stabilization');
  });

  it('returns last_hour for connected', () => {
    expect(
      defaultPillForActiveWellTest({
        ...ROW_BASE,
        lifecycleStatus: 'connected',
        connectedAt: '2026-05-29T08:00:00.000Z',
      }),
    ).toBe('last_hour');
  });

  it('returns last_hour for scheduled', () => {
    expect(defaultPillForActiveWellTest({ ...ROW_BASE, lifecycleStatus: 'scheduled' })).toBe(
      'last_hour',
    );
  });

  it('returns official_window for aborted with officialStartedAt set', () => {
    expect(
      defaultPillForActiveWellTest(
        measuring({ lifecycleStatus: 'aborted', abortedAt: '2026-05-29T15:00:00.000Z' }),
      ),
    ).toBe('official_window');
  });

  it('returns last_hour for aborted with no officialStartedAt', () => {
    expect(
      defaultPillForActiveWellTest({
        ...ROW_BASE,
        lifecycleStatus: 'aborted',
        connectedAt: '2026-05-29T08:00:00.000Z',
        abortedAt: '2026-05-29T08:30:00.000Z',
      }),
    ).toBe('last_hour');
  });
});
