/**
 * Alarm log — mock data.
 *
 * ISA-18.2 alarm priorities: Urgent / High / Low. ACK indicates whether
 * the operator has acknowledged the alarm. Cleared alarms move to the
 * recent-history table.
 */
export type AlarmPriority = 'URGENT' | 'HIGH' | 'LOW';
export type AlarmState = 'ACTIVE' | 'ACKED' | 'CLEARED';

export interface AlarmRecord {
  id: string;
  priority: AlarmPriority;
  state: AlarmState;
  title: string;
  source: string;
  /** Absolute timestamp in UTC HH:MM format. */
  raisedUtc: string;
  /** Friendly relative age. */
  ageLabel: string;
  ackBy: string | null;
}

export const activeAlarms: AlarmRecord[] = [
  {
    id: 'al-1042',
    priority: 'URGENT',
    state: 'ACTIVE',
    title: 'High Pressure — Separator A',
    source: 'MU #1 · PZ-1023',
    raisedUtc: '10:38 UTC',
    ageLabel: '02 min',
    ackBy: null,
  },
  {
    id: 'al-1041',
    priority: 'HIGH',
    state: 'ACKED',
    title: 'Differential Pressure Drift',
    source: 'MU #2 · PZ-1045',
    raisedUtc: '10:24 UTC',
    ageLabel: '16 min',
    ackBy: 'h.finol',
  },
  {
    id: 'al-1040',
    priority: 'LOW',
    state: 'ACTIVE',
    title: 'Low Battery — Sensor SF-104',
    source: 'MU #2 · Sensor',
    raisedUtc: '10:29 UTC',
    ageLabel: '11 min',
    ackBy: null,
  },
];

export const recentAlarms: AlarmRecord[] = [
  {
    id: 'al-1039',
    priority: 'LOW',
    state: 'CLEARED',
    title: 'Mesh Hop Re-pair — SF-103',
    source: 'MU #1 · Sensor',
    raisedUtc: '09:52 UTC',
    ageLabel: '48 min',
    ackBy: 'h.finol',
  },
  {
    id: 'al-1038',
    priority: 'HIGH',
    state: 'CLEARED',
    title: 'Stable Above Setpoint — Pressure A',
    source: 'MU #1 · PZ-1023',
    raisedUtc: '08:11 UTC',
    ageLabel: '2 h',
    ackBy: 'd.rivera',
  },
  {
    id: 'al-1037',
    priority: 'URGENT',
    state: 'CLEARED',
    title: 'Gateway #1 Brief Disconnect',
    source: 'Gateway · GW-001',
    raisedUtc: '07:44 UTC',
    ageLabel: '2 h',
    ackBy: 'd.rivera',
  },
];
