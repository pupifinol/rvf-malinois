/**
 * Field instrumentation — mock data.
 *
 * The SignalFire wireless (and wired) sensor inventory across every
 * deployed unit. Distinguishes "sensor dead" from "well dead" — the
 * operator must trust the variable on /operations only as far as the
 * underlying sensor.
 *
 * Each record carries enough context to drive every panel on the Sensors
 * screen: status strip, inventory table, instrumentation overview,
 * detail preview, maintenance list, and the events timeline.
 */
export type SensorStatus = 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'STALE';
export type SensorKind =
  | 'PRESSURE'
  | 'TEMPERATURE'
  | 'FLOW'
  | 'WATER_CUT'
  | 'LEVEL'
  | 'DENSITY'
  | 'GAS';
export type SensorSource = 'SignalFire' | 'Wired' | 'Modbus' | 'HART';

export interface SensorRecord {
  id: string;
  tag: string;
  kind: SensorKind;
  /** e.g. "MU #1 · Inlet" — combines unit + nozzle/location. */
  location: string;
  source: SensorSource;
  status: SensorStatus;
  /** Battery percentage. -1 if line-powered. */
  batteryPct: number;
  /** RF link quality 0-100. null for wired/line-powered sensors. */
  rfQualityPct: number | null;
  /** Raw RF signal strength in dBm. null for wired/line-powered sensors. */
  rfDbm: number | null;
  /** Wireless hops back to the gateway; null if wired. */
  hops: number | null;
  /** Roll-up health score 0-100, used by the inventory bar. */
  healthPct: number;
  /** Telemetry latency in ms. */
  latencyMs: number;
  /** Telemetry packet loss percentage over the last reporting window. */
  packetLossPct: number;
  /** Seconds since last successful report. */
  lastReportSec: number;
  /** Which gateway carries this sensor's traffic. */
  gateway: string;
  /** Calibration due in days. Negative = overdue. */
  calDueDays: number;
  /** Date of last successful calibration, ISO yyyy-mm-dd. */
  lastCalDate: string;
  /** Current reading + units + history for the detail-preview sparkline. */
  reading: {
    label: string;
    value: number;
    unit: string;
    history: readonly number[];
  };
}

/* ----- generators -------------------------------------------------------- */

const drift = (base: number, jitter: number, n = 24): number[] => {
  const out: number[] = [];
  let v = base - jitter / 2;
  for (let i = 0; i < n; i += 1) {
    v += (Math.sin(i * 0.7) + (i % 3 === 0 ? 0.4 : -0.2)) * (jitter / 6);
    out.push(Math.max(0, v));
  }
  return out;
};

/* ----- inventory --------------------------------------------------------- */

export const sensors: readonly SensorRecord[] = [
  {
    id: 'sn-001',
    tag: 'PIT-100',
    kind: 'PRESSURE',
    location: 'MU #1 · Inlet',
    source: 'Wired',
    status: 'ONLINE',
    batteryPct: -1,
    rfQualityPct: null,
    rfDbm: null,
    hops: null,
    healthPct: 99,
    latencyMs: 38,
    packetLossPct: 0.2,
    lastReportSec: 2,
    gateway: 'GW-1',
    calDueDays: 31,
    lastCalDate: '2026-04-12',
    reading: { label: 'Inlet Pressure', value: 1820, unit: 'psi', history: drift(1810, 30) },
  },
  {
    id: 'sn-002',
    tag: 'TIT-100',
    kind: 'TEMPERATURE',
    location: 'MU #1 · Inlet',
    source: 'Wired',
    status: 'ONLINE',
    batteryPct: -1,
    rfQualityPct: null,
    rfDbm: null,
    hops: null,
    healthPct: 98,
    latencyMs: 41,
    packetLossPct: 0.2,
    lastReportSec: 2,
    gateway: 'GW-1',
    calDueDays: 24,
    lastCalDate: '2026-04-04',
    reading: { label: 'Inlet T.', value: 156, unit: '°F', history: drift(155, 2) },
  },
  {
    id: 'sn-003',
    tag: 'PIT-101',
    kind: 'PRESSURE',
    location: 'MU #1 · Vessel',
    source: 'SignalFire',
    status: 'ONLINE',
    batteryPct: 94,
    rfQualityPct: 92,
    rfDbm: -62,
    hops: 1,
    healthPct: 96,
    latencyMs: 58,
    packetLossPct: 0.5,
    lastReportSec: 4,
    gateway: 'GW-1',
    calDueDays: 22,
    lastCalDate: '2026-04-08',
    reading: { label: 'Line Pressure', value: 1650, unit: 'psi', history: drift(1640, 30) },
  },
  {
    id: 'sn-004',
    tag: 'PIT-201',
    kind: 'PRESSURE',
    location: 'MU #1 · Vessel',
    source: 'SignalFire',
    status: 'ONLINE',
    batteryPct: 88,
    rfQualityPct: 84,
    rfDbm: -68,
    hops: 2,
    healthPct: 91,
    latencyMs: 72,
    packetLossPct: 0.6,
    lastReportSec: 5,
    gateway: 'GW-1',
    calDueDays: 19,
    lastCalDate: '2026-04-02',
    reading: { label: 'Separator P.', value: 3150, unit: 'psi', history: drift(3120, 60) },
  },
  {
    id: 'sn-005',
    tag: 'TIT-200',
    kind: 'TEMPERATURE',
    location: 'MU #1 · Vessel',
    source: 'SignalFire',
    status: 'ONLINE',
    batteryPct: 76,
    rfQualityPct: 78,
    rfDbm: -71,
    hops: 2,
    healthPct: 89,
    latencyMs: 81,
    packetLossPct: 0.7,
    lastReportSec: 6,
    gateway: 'GW-1',
    calDueDays: 23,
    lastCalDate: '2026-04-04',
    reading: { label: 'Separator T.', value: 148, unit: '°F', history: drift(147, 2) },
  },
  {
    id: 'sn-006',
    tag: 'FIT-300',
    kind: 'FLOW',
    location: 'MU #1 · Inlet',
    source: 'Wired',
    status: 'ONLINE',
    batteryPct: -1,
    rfQualityPct: null,
    rfDbm: null,
    hops: null,
    healthPct: 97,
    latencyMs: 44,
    packetLossPct: 0.3,
    lastReportSec: 3,
    gateway: 'GW-1',
    calDueDays: 16,
    lastCalDate: '2026-03-28',
    reading: { label: 'Inlet Flow', value: 4220, unit: 'bopd', history: drift(4200, 120) },
  },
  {
    id: 'sn-007',
    tag: 'DPIT-400',
    kind: 'PRESSURE',
    location: 'MU #1 · Weir',
    source: 'SignalFire',
    status: 'DEGRADED',
    batteryPct: 22,
    rfQualityPct: 56,
    rfDbm: -82,
    hops: 3,
    healthPct: 64,
    latencyMs: 184,
    packetLossPct: 2.8,
    lastReportSec: 12,
    gateway: 'GW-1',
    calDueDays: -8,
    lastCalDate: '2026-02-22',
    reading: { label: 'Differential P.', value: 245, unit: 'psi', history: drift(240, 10) },
  },
  {
    id: 'sn-008',
    tag: 'LIT-500',
    kind: 'LEVEL',
    location: 'MU #1 · Vessel',
    source: 'HART',
    status: 'ONLINE',
    batteryPct: -1,
    rfQualityPct: null,
    rfDbm: null,
    hops: null,
    healthPct: 98,
    latencyMs: 51,
    packetLossPct: 0.2,
    lastReportSec: 3,
    gateway: 'GW-1',
    calDueDays: 41,
    lastCalDate: '2026-04-22',
    reading: { label: 'Vessel Level', value: 68, unit: '%', history: drift(67, 1.5) },
  },
  {
    id: 'sn-009',
    tag: 'PIT-501',
    kind: 'PRESSURE',
    location: 'MU #1 · Gas Outlet',
    source: 'SignalFire',
    status: 'ONLINE',
    batteryPct: 81,
    rfQualityPct: 88,
    rfDbm: -66,
    hops: 1,
    healthPct: 94,
    latencyMs: 62,
    packetLossPct: 0.4,
    lastReportSec: 4,
    gateway: 'GW-1',
    calDueDays: 27,
    lastCalDate: '2026-04-09',
    reading: { label: 'Gas Out P.', value: 1610, unit: 'psi', history: drift(1600, 25) },
  },
  {
    id: 'sn-010',
    tag: 'FIT-501',
    kind: 'GAS',
    location: 'MU #1 · Gas Outlet',
    source: 'SignalFire',
    status: 'ONLINE',
    batteryPct: 72,
    rfQualityPct: 81,
    rfDbm: -69,
    hops: 2,
    healthPct: 90,
    latencyMs: 79,
    packetLossPct: 0.7,
    lastReportSec: 5,
    gateway: 'GW-1',
    calDueDays: 11,
    lastCalDate: '2026-03-20',
    reading: { label: 'Gas Flow', value: 6.2, unit: 'MMSCFD', history: drift(6.1, 0.3) },
  },
  {
    id: 'sn-011',
    tag: 'FIT-601',
    kind: 'FLOW',
    location: 'MU #1 · Liquid Outlet',
    source: 'Wired',
    status: 'ONLINE',
    batteryPct: -1,
    rfQualityPct: null,
    rfDbm: null,
    hops: null,
    healthPct: 97,
    latencyMs: 48,
    packetLossPct: 0.2,
    lastReportSec: 3,
    gateway: 'GW-1',
    calDueDays: 18,
    lastCalDate: '2026-04-08',
    reading: { label: 'Liquid Flow', value: 4252, unit: 'blpd', history: drift(4240, 90) },
  },
  {
    id: 'sn-012',
    tag: 'WCIT-600',
    kind: 'WATER_CUT',
    location: 'MU #1 · Liquid Outlet',
    source: 'Modbus',
    status: 'ONLINE',
    batteryPct: -1,
    rfQualityPct: null,
    rfDbm: null,
    hops: null,
    healthPct: 95,
    latencyMs: 96,
    packetLossPct: 0.4,
    lastReportSec: 5,
    gateway: 'GW-1',
    calDueDays: 41,
    lastCalDate: '2026-04-22',
    reading: { label: 'Water Cut', value: 32, unit: '%', history: drift(31, 1.8) },
  },
  {
    id: 'sn-013',
    tag: 'WR-201',
    kind: 'DENSITY',
    location: 'MU #1 · Liquid Outlet',
    source: 'Wired',
    status: 'ONLINE',
    batteryPct: -1,
    rfQualityPct: null,
    rfDbm: null,
    hops: null,
    healthPct: 96,
    latencyMs: 46,
    packetLossPct: 0.2,
    lastReportSec: 3,
    gateway: 'GW-1',
    calDueDays: 12,
    lastCalDate: '2026-03-22',
    reading: { label: 'Liquid Density', value: 824, unit: 'kg/m³', history: drift(820, 6) },
  },
  {
    id: 'sn-014',
    tag: 'SF-104',
    kind: 'GAS',
    location: 'MU #2 · Gas Outlet',
    source: 'SignalFire',
    status: 'DEGRADED',
    batteryPct: 18,
    rfQualityPct: 47,
    rfDbm: -82,
    hops: 3,
    healthPct: 58,
    latencyMs: 212,
    packetLossPct: 3.4,
    lastReportSec: 12,
    gateway: 'GW-2',
    calDueDays: 11,
    lastCalDate: '2026-03-20',
    reading: { label: 'Gas Flow', value: 5.4, unit: 'MMSCFD', history: drift(5.3, 0.4) },
  },
  {
    id: 'sn-015',
    tag: 'PIT-100',
    kind: 'PRESSURE',
    location: 'MU #2 · Inlet',
    source: 'Wired',
    status: 'ONLINE',
    batteryPct: -1,
    rfQualityPct: null,
    rfDbm: null,
    hops: null,
    healthPct: 97,
    latencyMs: 43,
    packetLossPct: 0.2,
    lastReportSec: 2,
    gateway: 'GW-2',
    calDueDays: 37,
    lastCalDate: '2026-04-18',
    reading: { label: 'Inlet Pressure', value: 1640, unit: 'psi', history: drift(1620, 35) },
  },
  {
    id: 'sn-016',
    tag: 'TIT-200',
    kind: 'TEMPERATURE',
    location: 'MU #2 · Vessel',
    source: 'SignalFire',
    status: 'DEGRADED',
    batteryPct: 31,
    rfQualityPct: 61,
    rfDbm: -78,
    hops: 2,
    healthPct: 71,
    latencyMs: 148,
    packetLossPct: 1.9,
    lastReportSec: 9,
    gateway: 'GW-2',
    calDueDays: -2,
    lastCalDate: '2026-03-10',
    reading: { label: 'Separator T.', value: 138, unit: '°F', history: drift(137, 2.5) },
  },
  {
    id: 'sn-017',
    tag: 'FIT-601',
    kind: 'FLOW',
    location: 'MU #2 · Liquid Outlet',
    source: 'Wired',
    status: 'ONLINE',
    batteryPct: -1,
    rfQualityPct: null,
    rfDbm: null,
    hops: null,
    healthPct: 96,
    latencyMs: 52,
    packetLossPct: 0.3,
    lastReportSec: 4,
    gateway: 'GW-2',
    calDueDays: 27,
    lastCalDate: '2026-04-08',
    reading: { label: 'Liquid Flow', value: 3895, unit: 'blpd', history: drift(3870, 110) },
  },
  {
    id: 'sn-018',
    tag: 'WCIT-600',
    kind: 'WATER_CUT',
    location: 'MU #2 · Liquid Outlet',
    source: 'Modbus',
    status: 'ONLINE',
    batteryPct: -1,
    rfQualityPct: null,
    rfDbm: null,
    hops: null,
    healthPct: 92,
    latencyMs: 108,
    packetLossPct: 0.5,
    lastReportSec: 6,
    gateway: 'GW-2',
    calDueDays: 18,
    lastCalDate: '2026-03-30',
    reading: { label: 'Water Cut', value: 41, unit: '%', history: drift(40, 2.2) },
  },
  {
    id: 'sn-019',
    tag: 'WR-202',
    kind: 'LEVEL',
    location: 'MU #2 · Vessel',
    source: 'SignalFire',
    status: 'STALE',
    batteryPct: 9,
    rfQualityPct: 12,
    rfDbm: -94,
    hops: 4,
    healthPct: 22,
    latencyMs: 0,
    packetLossPct: 8.4,
    lastReportSec: 184,
    gateway: 'GW-2',
    calDueDays: -22,
    lastCalDate: '2026-02-14',
    reading: { label: 'Vessel Level', value: 72, unit: '%', history: drift(70, 2) },
  },
  {
    id: 'sn-020',
    tag: 'SF-301',
    kind: 'PRESSURE',
    location: 'MU #2 · Manifold',
    source: 'SignalFire',
    status: 'OFFLINE',
    batteryPct: 0,
    rfQualityPct: 0,
    rfDbm: null,
    hops: null,
    healthPct: 0,
    latencyMs: 0,
    packetLossPct: 100,
    lastReportSec: 4280,
    gateway: 'GW-2',
    calDueDays: 8,
    lastCalDate: '2026-03-18',
    reading: { label: 'Manifold P.', value: 0, unit: 'psi', history: [] },
  },
];

/* ----- helpers ----------------------------------------------------------- */

export const formatLastReport = (sec: number): string => {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
};

/** Category labels for the inventory tabs. Order is meaningful. */
export const SENSOR_CATEGORIES = [
  'ALL',
  'PRESSURE',
  'TEMPERATURE',
  'FLOW',
  'WATER_CUT',
  'LEVEL',
  'DENSITY',
  'GAS',
] as const;
export type SensorCategory = (typeof SENSOR_CATEGORIES)[number];

export const categoryLabel = (c: SensorCategory): string => (c === 'WATER_CUT' ? 'WATER CUT' : c);
