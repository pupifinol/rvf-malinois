import { cn } from '@rvf/ui';

import {
  activity as defaultActivity,
  type ActivityEntry,
  type ActivityTone,
} from './data/reports.mock';

import { Panel } from '@/components/shell/Panel';

/**
 * ReportActivityPanel — audit-log timeline.
 *
 * Reads like an audit trail row: time · action · report-id · user. The
 * left accent stripe carries semantic tone (info / normal / warn /
 * alarm / stale) so the operator can scan for generation failures or
 * pending approvals at a glance.
 *
 * Different in spirit from /alarms' RealtimeAlarmFeed: this is a slow,
 * read-mostly audit ledger, not a live stream. No "Live" indicator,
 * no pulse.
 */
export interface ReportActivityPanelProps {
  entries?: readonly ActivityEntry[];
}

const TONE: Record<ActivityTone, { border: string; text: string }> = {
  info: { border: 'border-l-status-info', text: 'text-status-info' },
  normal: { border: 'border-l-status-normal', text: 'text-status-normal' },
  warn: { border: 'border-l-status-warn', text: 'text-status-warn' },
  alarm: { border: 'border-l-status-alarm', text: 'text-status-alarm' },
  stale: { border: 'border-l-status-stale', text: 'text-status-stale' },
};

export const ReportActivityPanel = ({ entries = defaultActivity }: ReportActivityPanelProps) => (
  <Panel
    title="Recent Activity"
    density="compact"
    meta={<span className="font-mono">{entries.length} entries</span>}
  >
    <ul
      className="flex flex-col max-h-[260px] overflow-y-auto -mx-1 px-1 divide-y divide-border-subtle"
      aria-label="Report activity audit log"
    >
      {entries.map((e) => {
        const t = TONE[e.tone];
        return (
          <li
            key={e.id}
            className={cn(
              'flex items-baseline gap-2 py-1.5 pl-2 pr-1 border-l-[3px] hover:bg-surface-raised/40 transition-colors duration-fast',
              t.border,
            )}
          >
            <span className="font-mono text-micro uppercase tracking-micro text-text-muted/80 shrink-0 tabular-nums w-[58px]">
              {e.at}
            </span>
            <div className="flex-1 min-w-0 flex flex-col leading-tight">
              <span className="text-xs text-text-primary truncate">{e.action}</span>
              <span className="text-micro uppercase tracking-micro text-text-secondary truncate">
                <span className="font-mono">{e.reportId}</span> ·{' '}
                <span className={cn('font-semibold', t.text)}>{e.user}</span>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  </Panel>
);
