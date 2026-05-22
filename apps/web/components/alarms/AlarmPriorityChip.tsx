import { cn } from '@rvf/ui';

import type { AlarmPriority } from './data/alarms.mock';

/**
 * AlarmPriorityChip — single-source-of-truth visual rendering for an
 * ISA-18.2 priority. Used by every alarm table + feed row so the
 * platform speaks one color language for alarm priority.
 *
 *   Urgent  → red    (--alarm-urgent / --status-alarm)
 *   High    → amber  (--alarm-high / --status-warn)
 *   Medium  → yellow (--alarm-medium)
 *   Low     → blue   (--alarm-low / --status-info)
 */
export const PRIORITY_STYLE: Record<
  AlarmPriority,
  { row: string; text: string; dot: string; label: string }
> = {
  URGENT: {
    row: 'border-l-alarm-urgent',
    text: 'text-alarm-urgent',
    dot: 'bg-alarm-urgent',
    label: 'Urgent',
  },
  HIGH: {
    row: 'border-l-alarm-high',
    text: 'text-alarm-high',
    dot: 'bg-alarm-high',
    label: 'High',
  },
  MEDIUM: {
    row: 'border-l-alarm-medium',
    text: 'text-alarm-medium',
    dot: 'bg-alarm-medium',
    label: 'Medium',
  },
  LOW: {
    row: 'border-l-alarm-low',
    text: 'text-alarm-low',
    dot: 'bg-alarm-low',
    label: 'Low',
  },
};

export const AlarmPriorityChip = ({ priority }: { priority: AlarmPriority }) => {
  const ps = PRIORITY_STYLE[priority];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-semibold uppercase tracking-micro',
        ps.text,
      )}
    >
      <span aria-hidden="true" className={cn('inline-block w-1.5 h-1.5 rounded-full', ps.dot)} />
      {ps.label}
    </span>
  );
};
