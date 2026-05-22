import { cn } from '@rvf/ui';
import { BatteryLow, ClipboardCheck, Wrench } from 'lucide-react';

import type { SensorRecord } from './data/sensors.mock';

import { Panel } from '@/components/shell/Panel';

/**
 * MaintenanceDuePanel — lists sensors that need a technician's attention
 * soon: low batteries, overdue calibrations, and any wireless node with
 * persistent degraded health.
 *
 * Each row has an icon + tag + reason + the urgency tag (days overdue
 * or battery %). The icons make the row's intent legible at a glance
 * without color alone (color-blind friendly).
 */
export interface MaintenanceDuePanelProps {
  sensors: readonly SensorRecord[];
}

type Reason = 'BATTERY' | 'CALIBRATION' | 'HEALTH';

interface DueItem {
  id: string;
  tag: string;
  location: string;
  reason: Reason;
  message: string;
  toneText: string;
  toneBg: string;
}

const reasonIcon: Record<Reason, typeof BatteryLow> = {
  BATTERY: BatteryLow,
  CALIBRATION: ClipboardCheck,
  HEALTH: Wrench,
};

const reasonLabel: Record<Reason, string> = {
  BATTERY: 'Battery',
  CALIBRATION: 'Calibration',
  HEALTH: 'Maintenance',
};

export const MaintenanceDuePanel = ({ sensors }: MaintenanceDuePanelProps) => {
  const items: DueItem[] = [];

  for (const s of sensors) {
    if (s.batteryPct >= 0 && s.batteryPct < 25) {
      items.push({
        id: `${s.id}-bat`,
        tag: s.tag,
        location: s.location,
        reason: 'BATTERY',
        message: `Battery ${s.batteryPct}%`,
        toneText: s.batteryPct < 10 ? 'text-status-alarm' : 'text-status-warn',
        toneBg: s.batteryPct < 10 ? 'bg-status-alarm/15' : 'bg-status-warn/15',
      });
    }
    if (s.calDueDays < 14) {
      const overdue = s.calDueDays < 0;
      items.push({
        id: `${s.id}-cal`,
        tag: s.tag,
        location: s.location,
        reason: 'CALIBRATION',
        message: overdue ? `${Math.abs(s.calDueDays)} d overdue` : `Due in ${s.calDueDays} d`,
        toneText: overdue ? 'text-status-alarm' : 'text-status-warn',
        toneBg: overdue ? 'bg-status-alarm/15' : 'bg-status-warn/15',
      });
    }
    if (s.status === 'DEGRADED' && s.healthPct < 70) {
      items.push({
        id: `${s.id}-hp`,
        tag: s.tag,
        location: s.location,
        reason: 'HEALTH',
        message: `Health ${s.healthPct}%`,
        toneText: 'text-status-warn',
        toneBg: 'bg-status-warn/15',
      });
    }
  }

  // Sort: alarm-toned first, then warn.
  items.sort((a, b) => {
    const aw = a.toneText.includes('alarm') ? 0 : 1;
    const bw = b.toneText.includes('alarm') ? 0 : 1;
    return aw - bw;
  });

  return (
    <Panel
      title="Maintenance Due"
      meta={
        <span className={items.length > 0 ? 'text-status-warn font-semibold' : undefined}>
          {items.length}
        </span>
      }
    >
      {items.length === 0 ? (
        <p className="text-xs text-text-muted">All sensors current.</p>
      ) : (
        <ul className="flex flex-col text-xs">
          {items.slice(0, 8).map((item) => {
            const Icon = reasonIcon[item.reason];
            return (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 py-1.5 border-b border-border-subtle last:border-b-0"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'inline-flex items-center justify-center w-5 h-5 rounded-xs shrink-0',
                      item.toneBg,
                      item.toneText,
                    )}
                  >
                    <Icon className="w-3 h-3" />
                  </span>
                  <span className="flex flex-col min-w-0">
                    <span className="font-mono text-text-primary truncate">{item.tag}</span>
                    <span className="text-micro uppercase tracking-micro text-text-muted truncate">
                      {reasonLabel[item.reason]} · {item.location}
                    </span>
                  </span>
                </span>
                <span
                  className={cn(
                    'font-mono tabular-nums uppercase tracking-micro font-semibold shrink-0',
                    item.toneText,
                  )}
                >
                  {item.message}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
};
