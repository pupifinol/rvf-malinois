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

import type { CanonicalTag } from '@rvf/types';
import type { LucideIcon } from 'lucide-react';

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
