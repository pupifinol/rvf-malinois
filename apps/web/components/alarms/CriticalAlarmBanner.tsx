import { cn } from '@rvf/ui';
import { AlertOctagon } from 'lucide-react';

import { formatActiveFor, type AlarmRecord } from './data/alarms.mock';

/**
 * CriticalAlarmBanner — the topmost element of /alarms.
 *
 * A full-width single-line urgent banner that surfaces the highest
 * priority active alarm. Reads at-a-glance from across the control
 * room: title, source, unit, "active for" duration, and an inline
 * acknowledge button.
 *
 * Visual depth is built from three restrained, industrial layers:
 *   - A 3-px alarm-toned left stripe carries severity from across the
 *     room.
 *   - A low-opacity `bg-gradient-to-r` from alarm-toned to surface
 *     gives the banner panel weight without ever filling it.
 *   - A 1-px top inner-highlight (via `box-shadow inset`) reads as a
 *     subtle metallic edge — the industrial-control-cabinet rim.
 *
 * Empty state ("no urgent active") collapses to a matching-height
 * quiet panel so the layout never jumps.
 */
export interface CriticalAlarmBannerProps {
  /** Highest-priority active alarm. Pass `null` when none exists. */
  alarm: AlarmRecord | null;
  onAck?: (id: string) => void;
}

export const CriticalAlarmBanner = ({ alarm, onAck }: CriticalAlarmBannerProps) => {
  if (alarm === null) {
    return (
      <section
        className={cn(
          'flex items-center gap-2.5 px-3.5 py-2 rounded-sm',
          'bg-surface border border-border-subtle border-l-[3px] border-l-status-normal',
        )}
        aria-label="Critical alarm banner"
      >
        <span
          aria-hidden="true"
          className="inline-block w-1.5 h-1.5 rounded-full bg-status-normal"
        />
        <span className="text-micro uppercase tracking-micro font-bold text-text-secondary">
          No urgent active alarms
        </span>
      </section>
    );
  }

  return (
    <section
      className={cn(
        'flex items-center gap-2.5 px-3.5 py-2 rounded-sm',
        'bg-gradient-to-r from-status-alarm/18 via-status-alarm/8 to-status-alarm/3',
        'border border-status-alarm/40 border-l-[3px] border-l-status-alarm',
      )}
      aria-label="Critical alarm banner"
      role="alert"
    >
      <AlertOctagon className="w-4 h-4 text-status-alarm shrink-0" aria-hidden="true" />

      <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
        <span
          className={cn(
            'inline-flex items-center px-1.5 h-4 rounded-xs text-micro uppercase tracking-micro font-bold shrink-0 leading-none',
            'bg-status-alarm text-status-fg',
          )}
        >
          Urgent
        </span>
        <span className="text-xs font-bold uppercase tracking-wide text-text-primary truncate leading-none">
          {alarm.title}
        </span>
        <span
          aria-hidden="true"
          className="hidden sm:inline-block w-px h-3 bg-status-alarm/40 shrink-0"
        />
        <span className="font-mono text-micro uppercase tracking-micro text-text-secondary leading-none">
          {alarm.source}
        </span>
        <span className="text-micro uppercase tracking-micro text-text-muted leading-none">
          · {alarm.unit}
        </span>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <div className="flex items-center gap-1.5 leading-none">
          <span className="text-micro uppercase tracking-micro text-text-muted">Active for</span>
          <span className="font-mono tabular-nums text-xs font-bold text-status-alarm leading-none">
            {formatActiveFor(alarm.activeSec)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onAck?.(alarm.id)}
          className={cn(
            'inline-flex items-center h-6 px-2.5 text-micro uppercase tracking-micro font-bold rounded-xs leading-none',
            'bg-status-alarm text-status-fg border border-status-alarm',
            'hover:bg-status-critical hover:border-status-critical',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
            'transition-colors duration-fast ease-industrial',
          )}
        >
          Acknowledge
        </button>
      </div>
    </section>
  );
};
