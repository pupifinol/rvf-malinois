import { cn } from '@rvf/ui';

import type { UnitTwin } from './data/twin.mock';

import { Panel } from '@/components/shell/Panel';

/**
 * CalibrationStatusPanel — recent calibration entries for the unit's
 * instruments, sorted by next-due. Overdue rows surface in alarm color.
 */
export const CalibrationStatusPanel = ({ twin }: { twin: UnitTwin }) => {
  const sorted = [...twin.calibrations].sort((a, b) => a.dueDays - b.dueDays);
  const overdue = sorted.filter((c) => c.dueDays < 0).length;

  return (
    <Panel
      title="Last Calibrations"
      meta={
        <span className={cn(overdue > 0 ? 'text-status-alarm font-semibold' : undefined)}>
          {overdue > 0 ? `${overdue} overdue` : 'On schedule'}
        </span>
      }
    >
      <ul className="flex flex-col text-xs">
        {sorted.map((c) => {
          const isOverdue = c.dueDays < 0;
          const isSoon = !isOverdue && c.dueDays <= 14;
          const tone = isOverdue
            ? 'text-status-alarm'
            : isSoon
              ? 'text-status-warn'
              : 'text-text-secondary';
          return (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2 py-1.5 border-b border-border-subtle last:border-b-0"
            >
              <span className="flex flex-col min-w-0">
                <span className="font-mono text-text-primary">{c.instrumentTag}</span>
                <span className="text-micro uppercase tracking-micro text-text-muted">
                  {c.date} · {c.by}
                </span>
              </span>
              <span
                className={cn(
                  'font-mono tabular-nums uppercase tracking-micro font-semibold',
                  tone,
                )}
              >
                {isOverdue ? `${Math.abs(c.dueDays)} d overdue` : `${c.dueDays} d`}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
};
