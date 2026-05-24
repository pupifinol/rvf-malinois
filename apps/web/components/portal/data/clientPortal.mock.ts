/**
 * Client Portal — mock production data.
 *
 * Front-end-only source for the customer-facing Production Overview screen.
 * The shape mirrors the public read-model the F6 backend will eventually
 * expose (well identifier, current rates, recent trend), so swapping this
 * file for a fetcher later should not require layout changes.
 *
 * Deliberately narrower than the operations mock: no diagnostics, no
 * packet-loss, no sensor health. The client sees production, not plumbing.
 */

export type PortalWellStatus = 'TESTING' | 'ACTIVE' | 'STABILIZING';

export type ProductionVariableKey = 'oil' | 'gas' | 'waterCut';

export interface ProductionSeriesSpan {
  /** Tab label rendered in the chart range switcher. */
  label: '1H' | '6H' | '24H' | '7D';
  /** Number of samples to feed the chart for this range. */
  samples: number;
  /** Sub-label rendered under each chart (window covered by the series). */
  windowLabel: string;
}

export const RANGE_SPANS: readonly ProductionSeriesSpan[] = [
  { label: '1H', samples: 60, windowLabel: 'Last hour' },
  { label: '6H', samples: 72, windowLabel: 'Last 6 hours' },
  { label: '24H', samples: 144, windowLabel: 'Last 24 hours' },
  { label: '7D', samples: 168, windowLabel: 'Last 7 days' },
] as const;

export interface ProductionVariableSample {
  /** Latest numeric value, in `unit`. */
  value: number;
  /** Engineering unit (`bbl/d`, `MMSCFD`, `%`). */
  unit: string;
  /** Percentage delta vs. the start of the visible window (positive = up). */
  deltaPct: number;
}

export interface PortalWell {
  id: string;
  /** Surface label, e.g. `PZ-1023`. */
  name: string;
  /** Job context shown next to the well, e.g. `Multiphase Unit #1`. */
  jobLabel: string;
  status: PortalWellStatus;
  /** "Started at" shown as HH:MM in the local zone of the operation. */
  startedAt: string;
  oil: ProductionVariableSample;
  gas: ProductionVariableSample;
  waterCut: ProductionVariableSample;
}

interface SeededSeriesParams {
  /** Mean value the series oscillates around. */
  base: number;
  /** Half-amplitude of the slow oscillation. */
  amplitude: number;
  /** High-frequency jitter (smaller than amplitude). */
  noise: number;
  /** Deterministic offset so wells don't all draw the same line. */
  seed: number;
}

/**
 * Deterministic pseudo-series. We avoid Math.random so SSR and the first
 * client paint render identical SVGs (no hydration mismatch on the charts).
 */
const seededSeries = (n: number, p: SeededSeriesParams): number[] => {
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = i + p.seed;
    const slow = Math.sin(t * 0.18) * p.amplitude;
    const wobble = Math.sin(t * 0.71) * (p.amplitude * 0.35);
    const jitter = Math.sin(t * 1.7 + p.seed * 0.5) * p.noise;
    out.push(Math.max(0, p.base + slow + wobble + jitter));
  }
  return out;
};

interface VariableSpec {
  unit: string;
  params: SeededSeriesParams;
}

interface PortalWellSpec {
  id: string;
  name: string;
  jobLabel: string;
  status: PortalWellStatus;
  startedAt: string;
  oil: VariableSpec;
  gas: VariableSpec;
  waterCut: VariableSpec;
}

const WELL_SPECS: readonly PortalWellSpec[] = [
  {
    id: 'pz-1023',
    name: 'PZ-1023',
    jobLabel: 'Multiphase Unit #1',
    status: 'TESTING',
    startedAt: '08:42',
    oil: { unit: 'bbl/d', params: { base: 3178, amplitude: 95, noise: 32, seed: 11 } },
    gas: { unit: 'MMSCFD', params: { base: 6.5, amplitude: 0.22, noise: 0.08, seed: 4 } },
    waterCut: { unit: '%', params: { base: 32.7, amplitude: 0.9, noise: 0.4, seed: 19 } },
  },
  {
    id: 'pz-2041',
    name: 'PZ-2041',
    jobLabel: 'Multiphase Unit #1',
    status: 'ACTIVE',
    startedAt: '06:15',
    oil: { unit: 'bbl/d', params: { base: 2842, amplitude: 80, noise: 28, seed: 27 } },
    gas: { unit: 'MMSCFD', params: { base: 4.1, amplitude: 0.18, noise: 0.07, seed: 38 } },
    waterCut: { unit: '%', params: { base: 28.4, amplitude: 1.1, noise: 0.45, seed: 47 } },
  },
  {
    id: 'pz-2099',
    name: 'PZ-2099',
    jobLabel: 'Multiphase Unit #2',
    status: 'ACTIVE',
    startedAt: '09:08',
    oil: { unit: 'bbl/d', params: { base: 1956, amplitude: 70, noise: 22, seed: 55 } },
    gas: { unit: 'MMSCFD', params: { base: 3.02, amplitude: 0.14, noise: 0.06, seed: 61 } },
    waterCut: { unit: '%', params: { base: 41.2, amplitude: 1.4, noise: 0.5, seed: 73 } },
  },
] as const;

const buildSample = (spec: VariableSpec, samples: number): ProductionVariableSample => {
  const series = seededSeries(samples, spec.params);
  const value = series[series.length - 1] ?? spec.params.base;
  const start = series[0] ?? value;
  const deltaPct = start === 0 ? 0 : ((value - start) / start) * 100;
  return { value, unit: spec.unit, deltaPct };
};

export const buildPortalWells = (samples = 60): readonly PortalWell[] =>
  WELL_SPECS.map((spec) => ({
    id: spec.id,
    name: spec.name,
    jobLabel: spec.jobLabel,
    status: spec.status,
    startedAt: spec.startedAt,
    oil: buildSample(spec.oil, samples),
    gas: buildSample(spec.gas, samples),
    waterCut: buildSample(spec.waterCut, samples),
  }));

export const buildProductionHistory = (
  wellId: string,
  variable: ProductionVariableKey,
  samples: number,
): readonly number[] => {
  const spec = WELL_SPECS.find((w) => w.id === wellId);
  if (!spec) return [];
  return seededSeries(samples, spec[variable].params);
};

export interface PortalSnapshot {
  wells: readonly PortalWell[];
  /** Stable label rendered next to "Last update" — kept deterministic for SSR. */
  lastUpdateLabel: string;
  /** Footnote shown under the chart row (units of time, refresh cadence). */
  refreshNote: string;
}

export const buildPortalSnapshot = (samples = 60): PortalSnapshot => ({
  wells: buildPortalWells(samples),
  lastUpdateLabel: 'just now',
  refreshNote: 'All times shown in UTC. Data updates every 10 seconds.',
});

export const VARIABLE_META: Record<
  ProductionVariableKey,
  { title: string; unit: string; accent: string; areaAccent: string; seriesColor: string }
> = {
  oil: {
    title: 'Crude Oil Production',
    unit: 'bbl/d',
    accent: 'var(--phase-oil)',
    areaAccent: 'rgba(46, 138, 85, 0.16)',
    seriesColor: 'var(--status-normal)',
  },
  gas: {
    title: 'Gas Production',
    unit: 'MMSCFD',
    accent: 'var(--phase-gas)',
    areaAccent: 'rgba(184, 132, 25, 0.16)',
    seriesColor: 'var(--phase-gas)',
  },
  waterCut: {
    title: 'Water Cut',
    unit: '%',
    accent: 'var(--phase-water)',
    areaAccent: 'rgba(31, 95, 168, 0.14)',
    seriesColor: 'var(--phase-water)',
  },
};

export const sumWellsOil = (wells: readonly PortalWell[]): number =>
  wells.reduce((acc, w) => acc + w.oil.value, 0);

export const sumWellsGas = (wells: readonly PortalWell[]): number =>
  wells.reduce((acc, w) => acc + w.gas.value, 0);

export const averageWaterCut = (wells: readonly PortalWell[]): number => {
  if (wells.length === 0) return 0;
  const total = wells.reduce((acc, w) => acc + w.waterCut.value, 0);
  return total / wells.length;
};
