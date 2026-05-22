import { cn } from '@rvf/ui';

import type { AlarmRecord } from './data/alarms.mock';

/**
 * AlarmSeverityCards — six compact ISA-style operational counters
 * directly under the critical banner.
 *
 * Each card is a single short stack: micro label, number + state on a
 * shared baseline. Subtle tonal gradient + a 2-px left accent stripe
 * carry priority colour. Designed for horizontal density — the
 * counters never compete with the alarm queue below.
 */
export interface AlarmSeverityCardsProps {
  alarms: readonly AlarmRecord[];
}

interface CardSpec {
  label: string;
  value: string;
  state: string;
  accent: string;
  surface: string;
  stateTone: string;
  stateDot: string;
}

export const AlarmSeverityCards = ({ alarms }: AlarmSeverityCardsProps) => {
  const active = alarms.filter((a) => a.state !== 'CLEARED');
  const urgent = active.filter((a) => a.priority === 'URGENT').length;
  const high = active.filter((a) => a.priority === 'HIGH').length;
  const medium = active.filter((a) => a.priority === 'MEDIUM').length;
  const low = active.filter((a) => a.priority === 'LOW').length;
  const acked = active.filter((a) => a.state === 'ACKED').length;
  const ackRate = active.length === 0 ? 100 : Math.round((acked / active.length) * 100);

  const cards: readonly CardSpec[] = [
    {
      label: 'Urgent',
      value: urgent.toString(),
      state: urgent > 0 ? 'Active' : 'Clear',
      accent: 'border-l-alarm-urgent',
      surface: 'bg-gradient-to-r from-alarm-urgent/15 via-alarm-urgent/4 to-surface',
      stateTone: urgent > 0 ? 'text-alarm-urgent' : 'text-status-normal',
      stateDot: urgent > 0 ? 'bg-alarm-urgent' : 'bg-status-normal',
    },
    {
      label: 'High',
      value: high.toString(),
      state: high > 0 ? 'Active' : 'Clear',
      accent: 'border-l-alarm-high',
      surface: 'bg-gradient-to-r from-alarm-high/15 via-alarm-high/4 to-surface',
      stateTone: high > 0 ? 'text-alarm-high' : 'text-status-normal',
      stateDot: high > 0 ? 'bg-alarm-high' : 'bg-status-normal',
    },
    {
      label: 'Medium',
      value: medium.toString(),
      state: medium > 0 ? 'Active' : 'Clear',
      accent: 'border-l-alarm-medium',
      surface: 'bg-gradient-to-r from-alarm-medium/15 via-alarm-medium/4 to-surface',
      stateTone: medium > 0 ? 'text-alarm-medium' : 'text-status-normal',
      stateDot: medium > 0 ? 'bg-alarm-medium' : 'bg-status-normal',
    },
    {
      label: 'Low',
      value: low.toString(),
      state: low > 0 ? 'Active' : 'Clear',
      accent: 'border-l-alarm-low',
      surface: 'bg-gradient-to-r from-alarm-low/15 via-alarm-low/4 to-surface',
      stateTone: low > 0 ? 'text-alarm-low' : 'text-status-normal',
      stateDot: low > 0 ? 'bg-alarm-low' : 'bg-status-normal',
    },
    {
      label: 'Acknowledged',
      value: acked.toString(),
      state: `${active.length - acked} pending`,
      accent: 'border-l-text-secondary',
      surface: 'bg-surface',
      stateTone: 'text-text-muted',
      stateDot: 'bg-text-muted',
    },
    {
      label: 'Ack Rate',
      value: `${ackRate}%`,
      state: ackRate >= 80 ? 'Healthy' : ackRate >= 50 ? 'Behind' : 'Critical',
      accent:
        ackRate >= 80
          ? 'border-l-status-normal'
          : ackRate >= 50
            ? 'border-l-status-warn'
            : 'border-l-status-alarm',
      surface:
        ackRate >= 80
          ? 'bg-gradient-to-r from-status-normal/10 via-status-normal/3 to-surface'
          : ackRate >= 50
            ? 'bg-gradient-to-r from-status-warn/10 via-status-warn/3 to-surface'
            : 'bg-gradient-to-r from-status-alarm/10 via-status-alarm/3 to-surface',
      stateTone:
        ackRate >= 80
          ? 'text-status-normal'
          : ackRate >= 50
            ? 'text-status-warn'
            : 'text-status-alarm',
      stateDot:
        ackRate >= 80 ? 'bg-status-normal' : ackRate >= 50 ? 'bg-status-warn' : 'bg-status-alarm',
    },
  ];

  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2"
      aria-label="Alarm severity counters"
    >
      {cards.map((c) => (
        <Card key={c.label} spec={c} />
      ))}
    </div>
  );
};

const Card = ({ spec }: { spec: CardSpec }) => (
  <div
    className={cn(
      'flex items-center justify-between gap-1.5 px-2.5 py-1.5 border border-border-subtle border-l-2 rounded-xs',
      spec.surface,
      spec.accent,
    )}
  >
    <div className="flex flex-col gap-0.5 min-w-0 leading-none">
      <span className="text-micro uppercase tracking-micro font-semibold text-text-muted truncate">
        {spec.label}
      </span>
      <span
        className={cn(
          'inline-flex items-center gap-1 text-micro uppercase tracking-micro font-semibold',
          spec.stateTone,
        )}
      >
        <span
          aria-hidden="true"
          className={cn('inline-block w-1 h-1 rounded-full', spec.stateDot)}
        />
        {spec.state}
      </span>
    </div>
    <span className="font-mono tabular-nums text-lg font-bold text-text-primary leading-none shrink-0">
      {spec.value}
    </span>
  </div>
);
