/**
 * Operations Console — mock unit telemetry.
 *
 * This is the single source of truth for the /operations screen until the
 * F2 telemetry pipeline lands. The page renders by mapping over the array,
 * so adding a unit here is enough to ship a 3-, 4-, or 5-unit deployment
 * to production without touching the layout code.
 */

export type UnitStatus = 'TESTING' | 'STABILIZING' | 'ALARM' | 'OFFLINE';
export type SignalStrength = 'STRONG' | 'OK' | 'WEAK' | 'NONE';
export type SensorHealth = 'GOOD' | 'DEGRADED' | 'BAD';

export interface UnitVariableSample {
  /** Numeric value in the engineering unit shown on screen. */
  value: number;
  /** Engineering unit, rendered to the right of the value. */
  unit: string;
  /** Recent history for the sparkline. ~20 samples works well at 140 px wide. */
  history: readonly number[];
}

export interface UnitTelemetry {
  id: string;
  unitNumber: number;
  status: UnitStatus;
  signal: SignalStrength;
  well: string;
  job: string;
  /** Duration in seconds since the test started. */
  durationSec: number;
  /** UTC HH:MM the test started. */
  startedUtc: string;

  oilRate: UnitVariableSample;
  gasRate: UnitVariableSample;
  waterCut: UnitVariableSample;
  pressure: UnitVariableSample;
  temperature: UnitVariableSample;
  differentialPressure: UnitVariableSample;

  dataQualityPct: number;
  sensorHealth: SensorHealth;
  packetLossPct: number;
  latencyMs: number;
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

export const unit1: UnitTelemetry = {
  id: 'mu-01',
  unitNumber: 1,
  status: 'TESTING',
  signal: 'STRONG',
  well: 'PZ-1023',
  job: 'FLOW TEST',
  durationSec: 2 * 3600 + 14 * 60,
  startedUtc: '08:27 UTC',

  oilRate: { value: 4220, unit: 'bopd', history: drift(4200, 120) },
  gasRate: { value: 6.2, unit: 'MMSCFD', history: drift(6.1, 0.3) },
  waterCut: { value: 32, unit: '%', history: drift(31, 1.5) },
  pressure: { value: 1820, unit: 'psi', history: drift(1810, 30) },
  temperature: { value: 148, unit: '°F', history: drift(147, 2) },
  differentialPressure: { value: 245, unit: 'psi', history: drift(240, 10) },

  dataQualityPct: 98.2,
  sensorHealth: 'GOOD',
  packetLossPct: 0.2,
  latencyMs: 320,
};

export const unit2: UnitTelemetry = {
  id: 'mu-02',
  unitNumber: 2,
  status: 'STABILIZING',
  signal: 'OK',
  well: 'PZ-1045',
  job: 'BUILDUP TEST',
  durationSec: 1 * 3600 + 47 * 60,
  startedUtc: '08:54 UTC',

  oilRate: { value: 3150, unit: 'bopd', history: drift(3100, 100) },
  gasRate: { value: 4.8, unit: 'MMSCFD', history: drift(4.7, 0.25) },
  waterCut: { value: 28, unit: '%', history: drift(27.5, 1.2) },
  pressure: { value: 1650, unit: 'psi', history: drift(1640, 25) },
  temperature: { value: 142, unit: '°F', history: drift(141, 1.5) },
  differentialPressure: { value: 210, unit: 'psi', history: drift(205, 8) },

  dataQualityPct: 95.6,
  sensorHealth: 'GOOD',
  packetLossPct: 0.6,
  latencyMs: 350,
};

export const units: UnitTelemetry[] = [unit1, unit2];

export const formatDuration = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
};
