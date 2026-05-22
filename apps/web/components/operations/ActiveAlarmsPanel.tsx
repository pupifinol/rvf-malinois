import { cn } from '@rvf/ui';
import { AlertOctagon, BatteryLow, type LucideIcon } from 'lucide-react';

import { Panel } from '@/components/shell/Panel';

/**
 * ActiveAlarmsPanel — right-rail summary of currently-asserted alarms.
 *
 * Red for critical (`alarm`), amber for warnings. Anything below "warning"
 * does not belong here — this is the eyes-up panel an operator scans every
 * 60 seconds. Drill-down belongs in /alarms (F4).
 */
export type AlarmSeverity = 'alarm' | 'warn';

export interface AlarmEntry {
  id: string;
  severity: AlarmSeverity;
  title: string;
  source: string;
  timeAgo: string;
  icon: LucideIcon;
}

const defaultAlarms: AlarmEntry[] = [
  {
    id: 'a1',
    severity: 'alarm',
    title: 'HIGH PRESSURE',
    source: 'Unit #1 · PZ-1023',
    timeAgo: '02 min ago',
    icon: AlertOctagon,
  },
  {
    id: 'a2',
    severity: 'warn',
    title: 'LOW BATTERY',
    source: 'Sensor SF-104 · Unit #2',
    timeAgo: '11 min ago',
    icon: BatteryLow,
  },
];

const severityClass: Record<AlarmSeverity, { row: string; icon: string; title: string }> = {
  alarm: {
    row: 'border-l-status-alarm bg-status-alarm/5',
    icon: 'text-status-alarm',
    title: 'text-status-alarm',
  },
  warn: {
    row: 'border-l-status-warn bg-status-warn/5',
    icon: 'text-status-warn',
    title: 'text-status-warn',
  },
};

export interface ActiveAlarmsPanelProps {
  alarms?: readonly AlarmEntry[];
}

export const ActiveAlarmsPanel = ({ alarms = defaultAlarms }: ActiveAlarmsPanelProps) => (
  <Panel
    title="Active Alarms"
    meta={
      <span
        className={cn(
          'tabular-nums font-semibold',
          alarms.length > 0 ? 'text-status-alarm' : 'text-text-muted',
        )}
      >
        ({alarms.length})
      </span>
    }
  >
    {alarms.length === 0 ? (
      <p className="text-xs text-text-muted">No active alarms.</p>
    ) : (
      <ul className="flex flex-col gap-2">
        {alarms.map((a) => {
          const Icon = a.icon;
          const sc = severityClass[a.severity];
          return (
            <li
              key={a.id}
              className={cn('flex items-start gap-2.5 p-2.5 border-l-2 rounded-xs', sc.row)}
            >
              <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', sc.icon)} aria-hidden="true" />
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <p
                  className={cn(
                    'text-xs font-semibold uppercase tracking-micro leading-tight',
                    sc.title,
                  )}
                >
                  {a.title}
                </p>
                <p className="text-xs text-text-secondary truncate leading-tight">{a.source}</p>
                <p className="text-micro uppercase tracking-micro text-text-muted">{a.timeAgo}</p>
              </div>
            </li>
          );
        })}
      </ul>
    )}
  </Panel>
);
