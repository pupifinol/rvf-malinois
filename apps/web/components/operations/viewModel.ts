/**
 * Operations view-model mapping — F2B.
 *
 * The canonical tag dictionary (ADR-003) is fixed; the human-readable
 * labels we show on the Operations card are a UI concern. This file is the
 * ONE place where the two layers meet: a small table mapping each tile
 * the operator sees to the canonical tag the evaluator works against.
 *
 * Adding a new tile is editing this list — no scattered string literals
 * across JSX. Removing a sensor from a snapshot is handled by the
 * evaluator/selectors (they return `disabled` / `no_data`); the table
 * here doesn't need to know.
 */
import { ArrowDownUp, Droplet, Flame, Gauge, Thermometer, Waves } from 'lucide-react';

import type { AlarmState } from '@/lib/alarms/types';
import type { TelemetryStatus } from '@/lib/telemetry/models';
import type { CanonicalTag } from '@rvf/types';
import type { LucideIcon } from 'lucide-react';

import { higher } from '@/lib/alarms/priority';
import { CANONICAL_TAGS } from '@/lib/telemetry/tags';

export interface OperationsTileDescriptor {
  /** Stable id used as React key and test target. */
  id: string;
  /** UI label, e.g. "Oil Rate". Kept short for ISA-101 tiles. */
  label: string;
  /** Canonical tag the evaluator + store work against. */
  tag: CanonicalTag;
  /** Engineering unit fallback when the live reading isn't available. */
  fallbackUnit: string;
  /** Tile icon. */
  icon: LucideIcon;
  /** Tailwind text-color class for the sparkline accent. */
  sparkColor: string;
}

/**
 * The six tiles the Operations Console renders per unit, in display order.
 * Operations layout is a 3x2 grid; the order below matches that grid.
 */
export const OPERATIONS_TILES: readonly OperationsTileDescriptor[] = [
  {
    id: 'q_liquid',
    label: 'Oil Rate',
    tag: CANONICAL_TAGS.QLiquid,
    fallbackUnit: 'bbl/d',
    icon: Droplet,
    sparkColor: 'text-series-1',
  },
  {
    id: 'q_gas',
    label: 'Gas Rate',
    tag: CANONICAL_TAGS.QGas,
    fallbackUnit: 'MMSCFD',
    icon: Flame,
    sparkColor: 'text-series-2',
  },
  {
    id: 'water_cut',
    label: 'Water Cut',
    tag: CANONICAL_TAGS.WaterCut,
    fallbackUnit: '%',
    icon: Waves,
    sparkColor: 'text-series-6',
  },
  {
    id: 'p_inlet',
    label: 'Pressure',
    tag: CANONICAL_TAGS.PInlet,
    fallbackUnit: 'psi',
    icon: Gauge,
    sparkColor: 'text-series-1',
  },
  {
    id: 't_inlet',
    label: 'Temperature',
    tag: CANONICAL_TAGS.TInlet,
    fallbackUnit: '°F',
    icon: Thermometer,
    sparkColor: 'text-series-2',
  },
  {
    id: 'dp_weir',
    label: 'Differential P.',
    tag: CANONICAL_TAGS.DpWeir,
    fallbackUnit: 'psi',
    icon: ArrowDownUp,
    sparkColor: 'text-series-5',
  },
];

/** Lookup by display label — small helper, used by tests. */
export const findTileByLabel = (label: string): OperationsTileDescriptor | undefined =>
  OPERATIONS_TILES.find((t) => t.label === label);

/** Lookup by canonical tag — used by the live alarms panel to label rows. */
export const findTileByTag = (tag: CanonicalTag): OperationsTileDescriptor | undefined =>
  OPERATIONS_TILES.find((t) => t.tag === tag);

// ---------------------------------------------------------------------------
// Unit-card status rollup (the badge on each LiveMultiphaseUnitCard)
// ---------------------------------------------------------------------------

/**
 * Visible badge on an Operations unit card. The badge must reflect what the
 * operator actually sees on the six tiles, not the nominal job lifecycle:
 *
 *   ALARM     — at least one process alarm band is active.
 *   OFFLINE   — none of the tiles the operator sees are reporting live data.
 *   DEGRADED  — some tiles report, some are stale/offline/no-data.
 *   TESTING   — every connected tile is reporting live data, no process alarm.
 *
 * Spec note: warnings (`warning_high` / `warning_low`) do NOT downgrade the
 * badge — they remain TESTING-with-attention. Process alarms (`alarm_high` /
 * `alarm_low`) are the only signal that drives the ALARM badge.
 */
export type UnitBadgeStatus = 'TESTING' | 'ALARM' | 'DEGRADED' | 'OFFLINE';

export interface UnitBadgeRollup {
  status: UnitBadgeStatus;
  /** Highest-priority alarm state observed across the considered tags. */
  worstAlarm: AlarmState;
  /** Number of considered tags currently stale, offline, or `no_data`. */
  staleCount: number;
  /** Number of considered tags currently reporting trustworthy live data. */
  liveCount: number;
  /** Number of enabled (non-`disabled`) tags considered. */
  enabledCount: number;
}

interface TagViewState {
  alarm: AlarmState;
  stale: TelemetryStatus;
}

/**
 * Roll a unit's tile-level state up to a single badge.
 *
 *   `byTag`  — the snapshot from `useUnitTelemetrySnapshot`. Keys are
 *              canonical tag strings.
 *   `tagsToConsider` — optional list of tags to score. When omitted we
 *              consider every entry in `byTag`. The Operations card passes
 *              `OPERATIONS_TILES.map(t => t.tag)` so the badge stays in
 *              sync with the six tiles the operator actually sees — a tag
 *              that exists in the snapshot but is NOT shown on screen
 *              must not pull the badge to TESTING just because the
 *              simulator happens to be emitting it.
 *
 *   Disabled mappings (`alarm === 'disabled'`) are skipped: the operator
 *   intentionally turned them off for this job, so they should not bias
 *   the rollup toward OFFLINE / DEGRADED.
 *
 *   A tile counts as "reporting live" iff its telemetry status is `live`
 *   or `delayed` AND its evaluator state is not `no_data`. Anything else
 *   (`stale`, `offline`, or a `no_data` evaluator state) counts toward
 *   `staleCount`. A tag the snapshot does not know about at all (no
 *   `byTag` entry) is treated as enabled-but-offline so a missing sensor
 *   in the snapshot does not silently downgrade to TESTING.
 */
export const rollUpUnitStatus = (
  byTag: Record<string, TagViewState | undefined> | UnitBadgeByTag,
  tagsToConsider?: readonly CanonicalTag[],
): UnitBadgeRollup => {
  const keys: readonly string[] = tagsToConsider
    ? tagsToConsider.map((t) => String(t))
    : Object.keys(byTag);

  let worst: AlarmState = 'normal';
  let staleCount = 0;
  let liveCount = 0;
  let enabledCount = 0;

  for (const k of keys) {
    const v = byTag[k];
    if (!v) {
      // Snapshot has no entry for this displayed tile — treat as an
      // enabled-but-offline channel so the rollup honours the operator
      // perspective ("the tile shows no data → unit is degraded/offline").
      enabledCount += 1;
      staleCount += 1;
      continue;
    }
    if (v.alarm === 'disabled') continue;
    enabledCount += 1;
    worst = higher(worst, v.alarm);
    const reporting = (v.stale === 'live' || v.stale === 'delayed') && v.alarm !== 'no_data';
    if (reporting) liveCount += 1;
    else staleCount += 1;
  }

  // 1. Process alarm wins.
  if (worst === 'alarm_high' || worst === 'alarm_low') {
    return { status: 'ALARM', worstAlarm: worst, staleCount, liveCount, enabledCount };
  }
  // 2. No connected, live channels at all → OFFLINE.
  if (enabledCount === 0 || liveCount === 0) {
    return { status: 'OFFLINE', worstAlarm: worst, staleCount, liveCount, enabledCount };
  }
  // 3. Partial: some live, some stale/offline/no-data.
  if (staleCount > 0) {
    return { status: 'DEGRADED', worstAlarm: worst, staleCount, liveCount, enabledCount };
  }
  // 4. Everything connected is reporting; warnings don't downgrade the badge.
  return { status: 'TESTING', worstAlarm: worst, staleCount, liveCount, enabledCount };
};

/**
 * The shape `useUnitTelemetrySnapshot` returns. The viewModel only depends
 * on `alarm` + `stale`, so we accept any wider object too. Exposing the
 * narrow shape lets callers pass `unitSnap.byTag` directly.
 */
export type UnitBadgeByTag = Readonly<Record<string, TagViewState | undefined>>;
