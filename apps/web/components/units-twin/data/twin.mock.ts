/**
 * Unit Process Twin — mock data.
 *
 * Models the physical instrumentation of a horizontal three-phase
 * separator as actually plumbed in the RVF Malinois fleet:
 *
 *   - One multiphase INLET line. Gas + crude + water enter together.
 *     Instruments: PIT, TIT, FIT (multiphase total).
 *   - Vessel internals: PIT (line), TIT, DPIT (across the weir), LIT (level).
 *   - One GAS OUTLET line, top of vessel. Instruments: PIT, TIT, FIT.
 *   - One LIQUID OUTLET line, lower side of vessel. Oil + water leave
 *     through this single pipe. Instruments: PIT, TIT, FIT, WCIT (water
 *     cut analyzer, % water in the liquid stream).
 *
 * The phase visualization inside the vessel (gas top yellow, oil middle
 * dark, water bottom blue) is internal separation only — the platform
 * never implies a separate dedicated water-only outlet.
 *
 * Exported as an array (`twins`) so the /units screen can switch between
 * multiphase units via the in-header selector.
 */

export type TwinStatus = 'TESTING' | 'STABILIZING' | 'ALARM' | 'OFFLINE';
export type InstrumentKind = 'PIT' | 'TIT' | 'FIT' | 'DPIT' | 'LIT' | 'WCIT';
export type InstrumentHealth = 'GOOD' | 'DEGRADED' | 'BAD';

export interface Instrument {
  id: string;
  /** ISA-style loop number, e.g. "100" → tag is "PIT-100". */
  loop: string;
  kind: InstrumentKind;
  description: string;
  reading: string;
  health: InstrumentHealth;
}

export interface ProcessVariable {
  label: string;
  value: number;
  unit: string;
  /** Last ~24 samples for the bottom trends row. */
  history: readonly number[];
  /** Optional ISA tag the variable is sourced from. */
  tag?: string;
}

export interface CalibrationEntry {
  id: string;
  instrumentTag: string;
  date: string;
  by: string;
  /** Days until next calibration is due. Negative = overdue. */
  dueDays: number;
}

export interface UnitTwin {
  /** Stable identifier — used as React key and selector value. */
  id: string;
  unitNumber: number;
  status: TwinStatus;
  well: string;
  job: string;
  startedUtc: string;
  durationSec: number;
  dataQualityPct: number;
  comm: 'ONLINE' | 'DEGRADED' | 'OFFLINE';

  /** Separator vessel level distribution — must sum to 100. Used only
   *  for the in-vessel phase visualization, not for any external piping. */
  levels: {
    gasPct: number;
    oilPct: number;
    waterPct: number;
  };

  /** Headline vessel line pressure (PIT-101). */
  linePressure: ProcessVariable;

  /** Bulk composition of the liquid that has settled inside the vessel. */
  composition: {
    oilPct: number;
    waterPct: number;
    gasPct: number;
  };

  /** INLET line — single multiphase line entering the vessel. */
  inlet: {
    pressure: ProcessVariable; // PIT-100
    temperature: ProcessVariable; // TIT-100
    flow: ProcessVariable; // FIT-300 (multiphase total)
  };

  /** Internal vessel state (no piping). */
  separation: {
    pressure: ProcessVariable; // PIT-201
    temperature: ProcessVariable; // TIT-200
    differentialPressure: ProcessVariable; // DPIT-400 across the weir
  };

  /** GAS OUTLET line — top-of-vessel, dedicated gas pipe. */
  gasOutlet: {
    pressure: ProcessVariable; // PIT-501
    temperature: ProcessVariable; // TIT-501
    flow: ProcessVariable; // FIT-501
  };

  /** LIQUID OUTLET line — single pipe carrying oil + water together.
   *  `waterCut` is the inline analyzer reading (% water in the liquid
   *  stream); water does NOT have a dedicated pipe. */
  liquidOutlet: {
    pressure: ProcessVariable; // PIT-601
    temperature: ProcessVariable; // TIT-601
    flow: ProcessVariable; // FIT-601 (total liquid)
    waterCut: ProcessVariable; // WCIT-600 (%)
  };

  instruments: readonly Instrument[];
  calibrations: readonly CalibrationEntry[];
}

const drift = (base: number, jitter: number, n = 24): number[] => {
  const out: number[] = [];
  let v = base - jitter / 2;
  for (let i = 0; i < n; i += 1) {
    v += (Math.sin(i * 0.7) + (i % 3 === 0 ? 0.4 : -0.2)) * (jitter / 6);
    out.push(Math.max(0, v));
  }
  return out;
};

const unit1: UnitTwin = {
  id: 'unit-1',
  unitNumber: 1,
  status: 'TESTING',
  well: 'PZ-1023',
  job: 'FLOW TEST',
  startedUtc: '08:27 UTC',
  durationSec: 2 * 3600 + 14 * 60,
  dataQualityPct: 98.2,
  comm: 'ONLINE',

  levels: { gasPct: 32, oilPct: 41, waterPct: 27 },

  linePressure: {
    label: 'Line Pressure',
    value: 1650,
    unit: 'psi',
    history: drift(1640, 30),
    tag: 'PIT-101',
  },

  composition: { oilPct: 56, waterPct: 32, gasPct: 12 },

  inlet: {
    pressure: {
      label: 'Inlet Pressure',
      value: 1820,
      unit: 'psi',
      history: drift(1810, 30),
      tag: 'PIT-100',
    },
    temperature: {
      label: 'Inlet T.',
      value: 156,
      unit: '°F',
      history: drift(155, 2),
      tag: 'TIT-100',
    },
    flow: {
      label: 'Inlet Flow',
      value: 4220,
      unit: 'bopd',
      history: drift(4200, 120),
      tag: 'FIT-300',
    },
  },

  separation: {
    pressure: {
      label: 'Separator P.',
      value: 3150,
      unit: 'psi',
      history: drift(3120, 60),
      tag: 'PIT-201',
    },
    temperature: {
      label: 'Separator T.',
      value: 148,
      unit: '°F',
      history: drift(147, 2),
      tag: 'TIT-200',
    },
    differentialPressure: {
      label: 'Differential P.',
      value: 245,
      unit: 'psi',
      history: drift(240, 10),
      tag: 'DPIT-400',
    },
  },

  gasOutlet: {
    pressure: {
      label: 'Gas Out P.',
      value: 1610,
      unit: 'psi',
      history: drift(1600, 25),
      tag: 'PIT-501',
    },
    temperature: {
      label: 'Gas Out T.',
      value: 138,
      unit: '°F',
      history: drift(137, 1.5),
      tag: 'TIT-501',
    },
    flow: {
      label: 'Gas Flow',
      value: 6.2,
      unit: 'MMSCFD',
      history: drift(6.1, 0.3),
      tag: 'FIT-501',
    },
  },

  liquidOutlet: {
    pressure: {
      label: 'Liquid Out P.',
      value: 1580,
      unit: 'psi',
      history: drift(1570, 22),
      tag: 'PIT-601',
    },
    temperature: {
      label: 'Liquid Out T.',
      value: 142,
      unit: '°F',
      history: drift(141, 1.5),
      tag: 'TIT-601',
    },
    flow: {
      label: 'Liquid Flow',
      value: 4252,
      unit: 'blpd',
      history: drift(4240, 90),
      tag: 'FIT-601',
    },
    waterCut: {
      label: 'Water Cut',
      value: 32,
      unit: '%',
      history: drift(31, 1.8),
      tag: 'WCIT-600',
    },
  },

  instruments: [
    {
      id: 'u1-i1',
      loop: '100',
      kind: 'PIT',
      description: 'Inlet Pressure',
      reading: '1,820 psi',
      health: 'GOOD',
    },
    {
      id: 'u1-i2',
      loop: '100',
      kind: 'TIT',
      description: 'Inlet Temp',
      reading: '156 °F',
      health: 'GOOD',
    },
    {
      id: 'u1-i3',
      loop: '101',
      kind: 'PIT',
      description: 'Line Pressure',
      reading: '1,650 psi',
      health: 'GOOD',
    },
    {
      id: 'u1-i4',
      loop: '200',
      kind: 'TIT',
      description: 'Separator Temp',
      reading: '148 °F',
      health: 'GOOD',
    },
    {
      id: 'u1-i5',
      loop: '201',
      kind: 'PIT',
      description: 'Separator Press',
      reading: '3,150 psi',
      health: 'GOOD',
    },
    {
      id: 'u1-i6',
      loop: '300',
      kind: 'FIT',
      description: 'Inlet Flow',
      reading: '4,220 bopd',
      health: 'GOOD',
    },
    {
      id: 'u1-i7',
      loop: '400',
      kind: 'DPIT',
      description: 'Differential P.',
      reading: '245 psi',
      health: 'DEGRADED',
    },
    {
      id: 'u1-i8',
      loop: '500',
      kind: 'LIT',
      description: 'Vessel Level',
      reading: '68 %',
      health: 'GOOD',
    },
    {
      id: 'u1-i9',
      loop: '501',
      kind: 'PIT',
      description: 'Gas Out Pressure',
      reading: '1,610 psi',
      health: 'GOOD',
    },
    {
      id: 'u1-i10',
      loop: '501',
      kind: 'TIT',
      description: 'Gas Out Temp',
      reading: '138 °F',
      health: 'GOOD',
    },
    {
      id: 'u1-i11',
      loop: '501',
      kind: 'FIT',
      description: 'Gas Flow',
      reading: '6.2 MMSCFD',
      health: 'GOOD',
    },
    {
      id: 'u1-i12',
      loop: '601',
      kind: 'PIT',
      description: 'Liquid Out Pressure',
      reading: '1,580 psi',
      health: 'GOOD',
    },
    {
      id: 'u1-i13',
      loop: '601',
      kind: 'TIT',
      description: 'Liquid Out Temp',
      reading: '142 °F',
      health: 'GOOD',
    },
    {
      id: 'u1-i14',
      loop: '601',
      kind: 'FIT',
      description: 'Liquid Flow',
      reading: '4,252 blpd',
      health: 'GOOD',
    },
    {
      id: 'u1-i15',
      loop: '600',
      kind: 'WCIT',
      description: 'Water Cut',
      reading: '32 %',
      health: 'GOOD',
    },
  ],

  calibrations: [
    { id: 'u1-c1', instrumentTag: 'PIT-100', date: '2026-04-12', by: 'h.finol', dueDays: 31 },
    { id: 'u1-c2', instrumentTag: 'TIT-200', date: '2026-04-04', by: 'd.rivera', dueDays: 23 },
    { id: 'u1-c3', instrumentTag: 'FIT-300', date: '2026-03-28', by: 'h.finol', dueDays: 16 },
    { id: 'u1-c4', instrumentTag: 'DPIT-400', date: '2026-02-22', by: 'd.rivera', dueDays: -8 },
    { id: 'u1-c5', instrumentTag: 'WCIT-600', date: '2026-04-22', by: 'h.finol', dueDays: 41 },
  ],
};

const unit2: UnitTwin = {
  id: 'unit-2',
  unitNumber: 2,
  status: 'STABILIZING',
  well: 'PZ-2041',
  job: 'WELL CLEANUP',
  startedUtc: '11:42 UTC',
  durationSec: 3600 + 38 * 60,
  dataQualityPct: 95.4,
  comm: 'ONLINE',

  levels: { gasPct: 28, oilPct: 38, waterPct: 34 },

  linePressure: {
    label: 'Line Pressure',
    value: 1480,
    unit: 'psi',
    history: drift(1470, 25),
    tag: 'PIT-101',
  },

  composition: { oilPct: 48, waterPct: 41, gasPct: 11 },

  inlet: {
    pressure: {
      label: 'Inlet Pressure',
      value: 1640,
      unit: 'psi',
      history: drift(1620, 35),
      tag: 'PIT-100',
    },
    temperature: {
      label: 'Inlet T.',
      value: 148,
      unit: '°F',
      history: drift(147, 2.5),
      tag: 'TIT-100',
    },
    flow: {
      label: 'Inlet Flow',
      value: 3680,
      unit: 'bopd',
      history: drift(3650, 140),
      tag: 'FIT-300',
    },
  },

  separation: {
    pressure: {
      label: 'Separator P.',
      value: 2870,
      unit: 'psi',
      history: drift(2840, 80),
      tag: 'PIT-201',
    },
    temperature: {
      label: 'Separator T.',
      value: 138,
      unit: '°F',
      history: drift(137, 2.5),
      tag: 'TIT-200',
    },
    differentialPressure: {
      label: 'Differential P.',
      value: 218,
      unit: 'psi',
      history: drift(215, 12),
      tag: 'DPIT-400',
    },
  },

  gasOutlet: {
    pressure: {
      label: 'Gas Out P.',
      value: 1450,
      unit: 'psi',
      history: drift(1440, 22),
      tag: 'PIT-501',
    },
    temperature: {
      label: 'Gas Out T.',
      value: 128,
      unit: '°F',
      history: drift(127, 1.8),
      tag: 'TIT-501',
    },
    flow: {
      label: 'Gas Flow',
      value: 5.4,
      unit: 'MMSCFD',
      history: drift(5.3, 0.4),
      tag: 'FIT-501',
    },
  },

  liquidOutlet: {
    pressure: {
      label: 'Liquid Out P.',
      value: 1420,
      unit: 'psi',
      history: drift(1410, 20),
      tag: 'PIT-601',
    },
    temperature: {
      label: 'Liquid Out T.',
      value: 134,
      unit: '°F',
      history: drift(133, 1.8),
      tag: 'TIT-601',
    },
    flow: {
      label: 'Liquid Flow',
      value: 3895,
      unit: 'blpd',
      history: drift(3870, 110),
      tag: 'FIT-601',
    },
    waterCut: {
      label: 'Water Cut',
      value: 41,
      unit: '%',
      history: drift(40, 2.2),
      tag: 'WCIT-600',
    },
  },

  instruments: [
    {
      id: 'u2-i1',
      loop: '100',
      kind: 'PIT',
      description: 'Inlet Pressure',
      reading: '1,640 psi',
      health: 'GOOD',
    },
    {
      id: 'u2-i2',
      loop: '100',
      kind: 'TIT',
      description: 'Inlet Temp',
      reading: '148 °F',
      health: 'GOOD',
    },
    {
      id: 'u2-i3',
      loop: '101',
      kind: 'PIT',
      description: 'Line Pressure',
      reading: '1,480 psi',
      health: 'GOOD',
    },
    {
      id: 'u2-i4',
      loop: '200',
      kind: 'TIT',
      description: 'Separator Temp',
      reading: '138 °F',
      health: 'DEGRADED',
    },
    {
      id: 'u2-i5',
      loop: '201',
      kind: 'PIT',
      description: 'Separator Press',
      reading: '2,870 psi',
      health: 'GOOD',
    },
    {
      id: 'u2-i6',
      loop: '300',
      kind: 'FIT',
      description: 'Inlet Flow',
      reading: '3,680 bopd',
      health: 'GOOD',
    },
    {
      id: 'u2-i7',
      loop: '400',
      kind: 'DPIT',
      description: 'Differential P.',
      reading: '218 psi',
      health: 'GOOD',
    },
    {
      id: 'u2-i8',
      loop: '500',
      kind: 'LIT',
      description: 'Vessel Level',
      reading: '72 %',
      health: 'GOOD',
    },
    {
      id: 'u2-i9',
      loop: '501',
      kind: 'PIT',
      description: 'Gas Out Pressure',
      reading: '1,450 psi',
      health: 'GOOD',
    },
    {
      id: 'u2-i10',
      loop: '501',
      kind: 'TIT',
      description: 'Gas Out Temp',
      reading: '128 °F',
      health: 'GOOD',
    },
    {
      id: 'u2-i11',
      loop: '501',
      kind: 'FIT',
      description: 'Gas Flow',
      reading: '5.4 MMSCFD',
      health: 'GOOD',
    },
    {
      id: 'u2-i12',
      loop: '601',
      kind: 'PIT',
      description: 'Liquid Out Pressure',
      reading: '1,420 psi',
      health: 'GOOD',
    },
    {
      id: 'u2-i13',
      loop: '601',
      kind: 'TIT',
      description: 'Liquid Out Temp',
      reading: '134 °F',
      health: 'GOOD',
    },
    {
      id: 'u2-i14',
      loop: '601',
      kind: 'FIT',
      description: 'Liquid Flow',
      reading: '3,895 blpd',
      health: 'GOOD',
    },
    {
      id: 'u2-i15',
      loop: '600',
      kind: 'WCIT',
      description: 'Water Cut',
      reading: '41 %',
      health: 'GOOD',
    },
  ],

  calibrations: [
    { id: 'u2-c1', instrumentTag: 'PIT-100', date: '2026-04-18', by: 'd.rivera', dueDays: 37 },
    { id: 'u2-c2', instrumentTag: 'TIT-200', date: '2026-03-10', by: 'h.finol', dueDays: -2 },
    { id: 'u2-c3', instrumentTag: 'FIT-300', date: '2026-04-02', by: 'd.rivera', dueDays: 20 },
    { id: 'u2-c4', instrumentTag: 'FIT-601', date: '2026-04-08', by: 'h.finol', dueDays: 27 },
    { id: 'u2-c5', instrumentTag: 'WCIT-600', date: '2026-03-30', by: 'd.rivera', dueDays: 18 },
  ],
};

/**
 * Ordered list of units the operator can switch between. Append a unit to
 * this array and the selector + page bind to it automatically — no page
 * code changes needed.
 *
 * Typed as a non-empty tuple so `twins[0]` is statically guaranteed
 * defined under `noUncheckedIndexedAccess`.
 */
export const twins: readonly [UnitTwin, ...UnitTwin[]] = [unit1, unit2];

/** Convenience alias for code that still imports a single twin. */
export const twin = unit1;

export const formatDuration = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
};
