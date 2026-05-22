/**
 * Sensor Events — mock diagnostics timeline.
 *
 * The events are intentionally heterogeneous: communication blips,
 * calibration milestones, warnings, alarms, firmware updates, RF
 * rerouting, and stale-sensor detection. The operator's read should be
 * "what happened to the field instrumentation in the last hour, and was
 * it normal."
 */
export type SensorEventKind =
  | 'COMM'
  | 'CALIBRATION'
  | 'WARNING'
  | 'ALARM'
  | 'FIRMWARE'
  | 'RF_REROUTE'
  | 'STALE';

export type SensorEventTone = 'normal' | 'warn' | 'alarm' | 'stale' | 'info';

export interface SensorEvent {
  id: string;
  at: string;
  kind: SensorEventKind;
  tag: string;
  message: string;
  tone: SensorEventTone;
}

export const sensorEvents: readonly SensorEvent[] = [
  {
    id: 'e1',
    at: '02m ago',
    kind: 'WARNING',
    tag: 'SF-104',
    message: 'Battery dropped below 20% — schedule replacement.',
    tone: 'warn',
  },
  {
    id: 'e2',
    at: '08m ago',
    kind: 'RF_REROUTE',
    tag: 'PIT-201',
    message: 'Telemetry route changed from GW-1 hop 3 → hop 2 (RSSI improved 9 dBm).',
    tone: 'info',
  },
  {
    id: 'e3',
    at: '14m ago',
    kind: 'STALE',
    tag: 'WR-202',
    message: 'Marked STALE after 3 min without telemetry.',
    tone: 'stale',
  },
  {
    id: 'e4',
    at: '22m ago',
    kind: 'ALARM',
    tag: 'SF-301',
    message: 'OFFLINE — last contact 71 min ago, last battery 12%.',
    tone: 'alarm',
  },
  {
    id: 'e5',
    at: '38m ago',
    kind: 'COMM',
    tag: 'GW-2',
    message: 'Gateway link degraded — uplink latency 180 ms over baseline.',
    tone: 'warn',
  },
  {
    id: 'e6',
    at: '48m ago',
    kind: 'COMM',
    tag: 'SF-103',
    message: 'RF link recovered after gateway re-pair (RSSI −62 dBm).',
    tone: 'normal',
  },
  {
    id: 'e7',
    at: '01h ago',
    kind: 'CALIBRATION',
    tag: 'FIT-300',
    message: 'Calibration verified by h.finol — drift 0.2% within band.',
    tone: 'normal',
  },
  {
    id: 'e8',
    at: '02h ago',
    kind: 'FIRMWARE',
    tag: 'SF-105',
    message: 'Firmware upgraded to v3.14.2 — no telemetry loss.',
    tone: 'info',
  },
  {
    id: 'e9',
    at: '03h ago',
    kind: 'WARNING',
    tag: 'DPIT-400',
    message: 'Drift exceeded soft band (1.2%) — flagged for next calibration window.',
    tone: 'warn',
  },
];

export const eventToneClass: Record<
  SensorEventTone,
  { border: string; text: string; chip: string }
> = {
  normal: {
    border: 'border-l-status-normal',
    text: 'text-status-normal',
    chip: 'bg-status-normal/15 text-status-normal',
  },
  warn: {
    border: 'border-l-status-warn',
    text: 'text-status-warn',
    chip: 'bg-status-warn/15 text-status-warn',
  },
  alarm: {
    border: 'border-l-status-alarm',
    text: 'text-status-alarm',
    chip: 'bg-status-alarm/15 text-status-alarm',
  },
  stale: {
    border: 'border-l-status-stale',
    text: 'text-status-stale',
    chip: 'bg-status-stale/15 text-status-stale',
  },
  info: {
    border: 'border-l-status-info',
    text: 'text-status-info',
    chip: 'bg-status-info/15 text-status-info',
  },
};
