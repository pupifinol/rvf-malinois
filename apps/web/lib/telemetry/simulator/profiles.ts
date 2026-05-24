/**
 * Simulation profiles — F2A.
 *
 * A profile is a recipe that produces realistic NormalizedTelemetryMessage
 * sequences for a given (job, tag) set. Profiles encode:
 *
 *   - Per-tag drift spec (base, amplitude, noise, period).
 *   - Whether the profile should occasionally trip a warning or alarm
 *     (by anchoring the base near a threshold).
 *   - Whether the profile should pause emissions to exercise stale/offline.
 *
 * Profiles never read globals — all stateful behavior lives in the simulator
 * that consumes them.
 */
import { CANONICAL_TAGS } from '../tags';

import type { DriftSpec } from './drift';
import type { CanonicalTag } from '@rvf/types';

export type ProfileKind =
  | 'normal'
  | 'warning'
  | 'alarm'
  | 'stale'
  | 'high_pressure'
  | 'low_pressure';

export interface TagDriftEntry {
  tag: CanonicalTag;
  unit: string;
  /** Quality mix: weights per quality kind, summing to ~1. */
  qualityMix?: { good: number; estimated: number; uncertain: number; bad: number };
  drift: DriftSpec;
  /** Per-tag override for emission pause (stale drill, etc.). */
  pauseEmissions?: boolean;
}

export interface SimulationProfile {
  kind: ProfileKind;
  /** Sample period in ms. Default 1000. */
  intervalMs?: number;
  /** Pause ALL emissions (offline drill). */
  paused?: boolean;
  tags: TagDriftEntry[];
}

// ---------------------------------------------------------------------------
// HP/HF — "normal" steady operation around the middle of the band
// ---------------------------------------------------------------------------

export const PROFILE_HP_HF_NORMAL: SimulationProfile = {
  kind: 'normal',
  intervalMs: 1000,
  tags: [
    {
      tag: CANONICAL_TAGS.PInlet,
      unit: 'psi',
      drift: { base: 1300, amplitude: 80, noise: 6, period: 180 },
    },
    {
      tag: CANONICAL_TAGS.TInlet,
      unit: '°F',
      drift: { base: 140, amplitude: 6, noise: 0.5, period: 360 },
    },
    {
      tag: CANONICAL_TAGS.QTotalIn,
      unit: 'bbl/d',
      drift: { base: 3200, amplitude: 220, noise: 18, period: 240 },
    },
    {
      tag: CANONICAL_TAGS.PSep,
      unit: 'psi',
      drift: { base: 1500, amplitude: 60, noise: 5, period: 220 },
    },
    {
      tag: CANONICAL_TAGS.TSep,
      unit: '°F',
      drift: { base: 150, amplitude: 4, noise: 0.4, period: 360 },
    },
    {
      tag: CANONICAL_TAGS.DpWeir,
      unit: 'psi',
      drift: { base: 220, amplitude: 25, noise: 2, period: 200 },
    },
    {
      tag: CANONICAL_TAGS.QGas,
      unit: 'MMSCFD',
      drift: { base: 6.4, amplitude: 0.5, noise: 0.05, period: 240 },
    },
    {
      tag: CANONICAL_TAGS.QLiquid,
      unit: 'bbl/d',
      drift: { base: 3100, amplitude: 200, noise: 16, period: 240 },
    },
    {
      tag: CANONICAL_TAGS.WaterCut,
      unit: '%',
      drift: { base: 32, amplitude: 3, noise: 0.4, period: 360 },
    },
    {
      tag: CANONICAL_TAGS.PGasOut,
      unit: 'psi',
      drift: { base: 1300, amplitude: 50, noise: 4, period: 220 },
    },
  ],
};

// ---------------------------------------------------------------------------
// HP/HF — "warning": pressure base anchored near warningHigh
// ---------------------------------------------------------------------------

export const PROFILE_HP_HF_WARNING: SimulationProfile = {
  kind: 'warning',
  intervalMs: 1000,
  tags: PROFILE_HP_HF_NORMAL.tags.map((t) =>
    t.tag === CANONICAL_TAGS.PInlet
      ? { ...t, drift: { base: 1880, amplitude: 60, noise: 6, period: 180 } }
      : t,
  ),
};

// ---------------------------------------------------------------------------
// HP/HF — "alarm": pressure base above alarmHigh
// ---------------------------------------------------------------------------

export const PROFILE_HP_HF_ALARM: SimulationProfile = {
  kind: 'alarm',
  intervalMs: 1000,
  tags: PROFILE_HP_HF_NORMAL.tags.map((t) =>
    t.tag === CANONICAL_TAGS.PInlet
      ? { ...t, drift: { base: 2150, amplitude: 40, noise: 6, period: 180 } }
      : t,
  ),
};

// ---------------------------------------------------------------------------
// MP — medium pressure normal
// ---------------------------------------------------------------------------

export const PROFILE_MP_NORMAL: SimulationProfile = {
  kind: 'normal',
  intervalMs: 1000,
  tags: [
    {
      tag: CANONICAL_TAGS.PInlet,
      unit: 'psi',
      drift: { base: 1000, amplitude: 80, noise: 6, period: 200 },
    },
    {
      tag: CANONICAL_TAGS.TInlet,
      unit: '°F',
      drift: { base: 120, amplitude: 6, noise: 0.5, period: 320 },
    },
    {
      tag: CANONICAL_TAGS.QTotalIn,
      unit: 'bbl/d',
      drift: { base: 2200, amplitude: 200, noise: 14, period: 240 },
    },
    {
      tag: CANONICAL_TAGS.QGas,
      unit: 'MMSCFD',
      drift: { base: 4.0, amplitude: 0.4, noise: 0.04, period: 240 },
    },
    {
      tag: CANONICAL_TAGS.WaterCut,
      unit: '%',
      drift: { base: 45, amplitude: 4, noise: 0.4, period: 320 },
    },
  ],
};

// ---------------------------------------------------------------------------
// LP/LF — low-pressure portable
// ---------------------------------------------------------------------------

export const PROFILE_LP_NORMAL: SimulationProfile = {
  kind: 'low_pressure',
  intervalMs: 1000,
  tags: [
    {
      tag: CANONICAL_TAGS.PInlet,
      unit: 'psi',
      drift: { base: 420, amplitude: 60, noise: 4, period: 200 },
    },
    {
      tag: CANONICAL_TAGS.TInlet,
      unit: '°F',
      drift: { base: 95, amplitude: 4, noise: 0.4, period: 320 },
    },
    {
      tag: CANONICAL_TAGS.QTotalIn,
      unit: 'bbl/d',
      drift: { base: 600, amplitude: 80, noise: 8, period: 240 },
    },
    {
      tag: CANONICAL_TAGS.WaterCut,
      unit: '%',
      drift: { base: 55, amplitude: 5, noise: 0.5, period: 320 },
    },
  ],
};

// ---------------------------------------------------------------------------
// Stale drill — one specific tag paused so the detector trips through
// delayed → stale → offline; other tags keep emitting.
// ---------------------------------------------------------------------------

export const PROFILE_STALE_DRILL: SimulationProfile = {
  kind: 'stale',
  intervalMs: 1000,
  tags: [
    {
      tag: CANONICAL_TAGS.PInlet,
      unit: 'psi',
      pauseEmissions: true,
      drift: { base: 1000, amplitude: 0, noise: 0, period: 1 },
    },
    {
      tag: CANONICAL_TAGS.QTotalIn,
      unit: 'bbl/d',
      drift: { base: 2000, amplitude: 150, noise: 12, period: 240 },
    },
  ],
};
