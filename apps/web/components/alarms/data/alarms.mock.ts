/**
 * Alarm log — mock data.
 *
 * ISA-18.2 alarm priorities: Urgent (P1) / High (P2) / Medium (P3) /
 * Low (P4). ACK indicates whether the operator has acknowledged the
 * alarm. Cleared alarms move to the recent-history table.
 *
 * Records carry enough context to drive every panel on the /alarms
 * screen: critical banner, severity cards, alarm trend chart, the
 * active + history tables, the realtime feed, and the quick-actions
 * panel. Each record's `priority` maps directly to the platform's
 * `--alarm-urgent/high/medium/low` semantic tokens.
 */

export type AlarmPriority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AlarmState = 'ACTIVE' | 'ACKED' | 'CLEARED';
export type AlarmKind = 'PROCESS' | 'SENSOR' | 'COMMS' | 'CALIBRATION' | 'SAFETY' | 'BATTERY';

export interface AlarmRecord {
  id: string;
  priority: AlarmPriority;
  state: AlarmState;
  kind: AlarmKind;
  title: string;
  /** ISA tag or source identifier (e.g. "PIT-201", "SF-104", "GW-1"). */
  source: string;
  /** Owning unit, e.g. "MU #1". */
  unit: string;
  /** Absolute timestamp in UTC HH:MM format when the alarm was raised. */
  raisedUtc: string;
  /** Friendly relative age, e.g. "02 min", "1 h 14 m". */
  ageLabel: string;
  /** Seconds since raised. Used for sorting + active-duration display. */
  activeSec: number;
  /** When the alarm cleared (if state is CLEARED). */
  clearedUtc: string | null;
  /** Total alarm duration in seconds (for history rows). */
  durationSec: number | null;
  ackBy: string | null;
}

/* ----- active queue ----------------------------------------------------- */

export const activeAlarms: readonly AlarmRecord[] = [
  {
    id: 'al-1052',
    priority: 'URGENT',
    state: 'ACTIVE',
    kind: 'PROCESS',
    title: 'High Pressure — Separator A',
    source: 'PIT-201',
    unit: 'MU #1',
    raisedUtc: '10:38 UTC',
    ageLabel: '02 min',
    activeSec: 142,
    clearedUtc: null,
    durationSec: null,
    ackBy: null,
  },
  {
    id: 'al-1051',
    priority: 'HIGH',
    state: 'ACTIVE',
    kind: 'PROCESS',
    title: 'Differential Pressure Drift',
    source: 'DPIT-400',
    unit: 'MU #2',
    raisedUtc: '10:24 UTC',
    ageLabel: '16 min',
    activeSec: 960,
    clearedUtc: null,
    durationSec: null,
    ackBy: null,
  },
  {
    id: 'al-1050',
    priority: 'HIGH',
    state: 'ACKED',
    kind: 'PROCESS',
    title: 'Inlet Pressure Above Setpoint',
    source: 'PIT-100',
    unit: 'MU #1',
    raisedUtc: '10:18 UTC',
    ageLabel: '22 min',
    activeSec: 1320,
    clearedUtc: null,
    durationSec: null,
    ackBy: 'h.finol',
  },
  {
    id: 'al-1049',
    priority: 'MEDIUM',
    state: 'ACTIVE',
    kind: 'SENSOR',
    title: 'Water Cut Out-of-Band',
    source: 'WCIT-600',
    unit: 'MU #2',
    raisedUtc: '10:15 UTC',
    ageLabel: '25 min',
    activeSec: 1500,
    clearedUtc: null,
    durationSec: null,
    ackBy: null,
  },
  {
    id: 'al-1048',
    priority: 'MEDIUM',
    state: 'ACKED',
    kind: 'CALIBRATION',
    title: 'Calibration Overdue — TIT-200',
    source: 'TIT-200',
    unit: 'MU #2',
    raisedUtc: '10:08 UTC',
    ageLabel: '32 min',
    activeSec: 1920,
    clearedUtc: null,
    durationSec: null,
    ackBy: 'd.rivera',
  },
  {
    id: 'al-1047',
    priority: 'LOW',
    state: 'ACTIVE',
    kind: 'BATTERY',
    title: 'Low Battery — Sensor SF-104',
    source: 'SF-104',
    unit: 'MU #2',
    raisedUtc: '10:29 UTC',
    ageLabel: '11 min',
    activeSec: 660,
    clearedUtc: null,
    durationSec: null,
    ackBy: null,
  },
  {
    id: 'al-1046',
    priority: 'LOW',
    state: 'ACTIVE',
    kind: 'COMMS',
    title: 'Gateway Uplink Latency',
    source: 'GW-2',
    unit: 'MU #2',
    raisedUtc: '10:02 UTC',
    ageLabel: '38 min',
    activeSec: 2280,
    clearedUtc: null,
    durationSec: null,
    ackBy: null,
  },
  {
    id: 'al-1045',
    priority: 'LOW',
    state: 'ACKED',
    kind: 'SENSOR',
    title: 'RF Quality Degraded — SF-104',
    source: 'SF-104',
    unit: 'MU #2',
    raisedUtc: '09:54 UTC',
    ageLabel: '46 min',
    activeSec: 2760,
    clearedUtc: null,
    durationSec: null,
    ackBy: 'h.finol',
  },
  {
    id: 'al-1044',
    priority: 'LOW',
    state: 'ACTIVE',
    kind: 'SENSOR',
    title: 'Packet Loss Elevated',
    source: 'SF-201',
    unit: 'MU #1',
    raisedUtc: '09:48 UTC',
    ageLabel: '52 min',
    activeSec: 3120,
    clearedUtc: null,
    durationSec: null,
    ackBy: null,
  },
  {
    id: 'al-1043',
    priority: 'LOW',
    state: 'ACTIVE',
    kind: 'CALIBRATION',
    title: 'Drift Within Soft Band',
    source: 'DPIT-400',
    unit: 'MU #2',
    raisedUtc: '09:34 UTC',
    ageLabel: '1 h 06 m',
    activeSec: 3960,
    clearedUtc: null,
    durationSec: null,
    ackBy: null,
  },
];

/* ----- history --------------------------------------------------------- */

export const historyAlarms: readonly AlarmRecord[] = [
  {
    id: 'al-1042',
    priority: 'HIGH',
    state: 'CLEARED',
    kind: 'PROCESS',
    title: 'Stable Above Setpoint — Pressure A',
    source: 'PIT-101',
    unit: 'MU #1',
    raisedUtc: '08:11 UTC',
    ageLabel: '2 h ago',
    activeSec: 7140,
    clearedUtc: '10:09 UTC',
    durationSec: 7140,
    ackBy: 'd.rivera',
  },
  {
    id: 'al-1041',
    priority: 'URGENT',
    state: 'CLEARED',
    kind: 'COMMS',
    title: 'Gateway #1 Brief Disconnect',
    source: 'GW-1',
    unit: 'GW',
    raisedUtc: '07:44 UTC',
    ageLabel: '2 h ago',
    activeSec: 92,
    clearedUtc: '07:45 UTC',
    durationSec: 92,
    ackBy: 'd.rivera',
  },
  {
    id: 'al-1040',
    priority: 'MEDIUM',
    state: 'CLEARED',
    kind: 'SENSOR',
    title: 'Telemetry Rerouted — SF-103',
    source: 'SF-103',
    unit: 'MU #1',
    raisedUtc: '07:18 UTC',
    ageLabel: '3 h ago',
    activeSec: 320,
    clearedUtc: '07:23 UTC',
    durationSec: 320,
    ackBy: 'h.finol',
  },
  {
    id: 'al-1039',
    priority: 'LOW',
    state: 'CLEARED',
    kind: 'BATTERY',
    title: 'Battery Replaced — SF-201',
    source: 'SF-201',
    unit: 'MU #1',
    raisedUtc: '06:51 UTC',
    ageLabel: '3 h ago',
    activeSec: 5400,
    clearedUtc: '08:21 UTC',
    durationSec: 5400,
    ackBy: 'h.finol',
  },
  {
    id: 'al-1038',
    priority: 'HIGH',
    state: 'CLEARED',
    kind: 'PROCESS',
    title: 'Separator T. High — TIT-200',
    source: 'TIT-200',
    unit: 'MU #1',
    raisedUtc: '06:14 UTC',
    ageLabel: '4 h ago',
    activeSec: 2640,
    clearedUtc: '06:58 UTC',
    durationSec: 2640,
    ackBy: 'd.rivera',
  },
  {
    id: 'al-1037',
    priority: 'LOW',
    state: 'CLEARED',
    kind: 'COMMS',
    title: 'Comm Latency Recovered',
    source: 'GW-2',
    unit: 'MU #2',
    raisedUtc: '05:42 UTC',
    ageLabel: '5 h ago',
    activeSec: 480,
    clearedUtc: '05:50 UTC',
    durationSec: 480,
    ackBy: 'h.finol',
  },
  {
    id: 'al-1036',
    priority: 'MEDIUM',
    state: 'CLEARED',
    kind: 'SAFETY',
    title: 'ESD Bypass Cleared',
    source: 'ESD-01',
    unit: 'MU #1',
    raisedUtc: '04:30 UTC',
    ageLabel: '6 h ago',
    activeSec: 180,
    clearedUtc: '04:33 UTC',
    durationSec: 180,
    ackBy: 'd.rivera',
  },
  {
    id: 'al-1035',
    priority: 'URGENT',
    state: 'CLEARED',
    kind: 'PROCESS',
    title: 'High-High Pressure Lockout',
    source: 'PIT-201',
    unit: 'MU #1',
    raisedUtc: '03:18 UTC',
    ageLabel: '7 h ago',
    activeSec: 240,
    clearedUtc: '03:22 UTC',
    durationSec: 240,
    ackBy: 'h.finol',
  },
];

/* ----- realtime event feed ---------------------------------------------- */

export type FeedEventTone = 'urgent' | 'high' | 'medium' | 'low' | 'normal' | 'info';

export interface AlarmFeedEvent {
  id: string;
  tone: FeedEventTone;
  title: string;
  unit: string;
  source: string;
  at: string;
}

export const alarmFeed: readonly AlarmFeedEvent[] = [
  {
    id: 'f1',
    tone: 'urgent',
    title: 'HIGH PRESSURE raised',
    unit: 'MU #1',
    source: 'PIT-201',
    at: '02m ago',
  },
  {
    id: 'f2',
    tone: 'high',
    title: 'INLET PRESSURE acknowledged',
    unit: 'MU #1',
    source: 'PIT-100 · h.finol',
    at: '04m ago',
  },
  {
    id: 'f3',
    tone: 'medium',
    title: 'WATER CUT out-of-band',
    unit: 'MU #2',
    source: 'WCIT-600',
    at: '08m ago',
  },
  {
    id: 'f4',
    tone: 'low',
    title: 'GATEWAY uplink latency',
    unit: 'MU #2',
    source: 'GW-2',
    at: '12m ago',
  },
  {
    id: 'f5',
    tone: 'normal',
    title: 'TELEMETRY rerouted',
    unit: 'MU #1',
    source: 'SF-103',
    at: '18m ago',
  },
  {
    id: 'f6',
    tone: 'low',
    title: 'BATTERY low (18%)',
    unit: 'MU #2',
    source: 'SF-104',
    at: '24m ago',
  },
  {
    id: 'f7',
    tone: 'normal',
    title: 'COMM LATENCY cleared',
    unit: 'MU #2',
    source: 'GW-2 · d.rivera',
    at: '32m ago',
  },
  {
    id: 'f8',
    tone: 'medium',
    title: 'CALIBRATION overdue',
    unit: 'MU #2',
    source: 'TIT-200',
    at: '38m ago',
  },
  {
    id: 'f9',
    tone: 'high',
    title: 'DIFFERENTIAL drift detected',
    unit: 'MU #2',
    source: 'DPIT-400',
    at: '42m ago',
  },
  {
    id: 'f10',
    tone: 'normal',
    title: 'STABLE ABOVE SETPOINT cleared',
    unit: 'MU #1',
    source: 'PIT-101 · d.rivera',
    at: '01h ago',
  },
];

/* ----- 24h alarm-volume trend ------------------------------------------ */
/** Hourly alarm count over the trailing 24 hours; index 0 is 24 h ago,
 *  index 23 is the current hour. Used by the AlarmTrendCard sparkline. */
export const alarmTrend24h: readonly number[] = [
  2, 1, 0, 1, 3, 2, 1, 0, 0, 2, 4, 5, 3, 2, 1, 2, 3, 1, 2, 4, 6, 7, 5, 4,
];

/* ----- helpers --------------------------------------------------------- */

export const formatActiveFor = (sec: number): string => {
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

export const formatDuration = (sec: number | null): string => {
  if (sec === null) return '—';
  return formatActiveFor(sec);
};

/** Inventory tabs across the alarm queue. */
export const ALARM_TABS = [
  'ALL',
  'ACTIVE',
  'ACKED',
  'CLEARED',
  'URGENT',
  'HIGH',
  'MEDIUM',
  'LOW',
] as const;
export type AlarmTab = (typeof ALARM_TABS)[number];

/** Combined view of active + history for tabs that span both. */
export const allAlarms: readonly AlarmRecord[] = [...activeAlarms, ...historyAlarms];
