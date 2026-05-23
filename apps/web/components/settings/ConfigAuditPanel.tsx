import { cn } from '@rvf/ui';

import type { AuditEntry, AuditTone } from './data/settings.mock';

import { Panel } from '@/components/shell/Panel';

/**
 * ConfigAuditPanel — right-rail audit ledger of configuration changes.
 *
 * Same row shape as the /reports activity feed (mono timestamp + line
 * of action + scope · user) so the two surfaces feel like sibling
 * audit logs. No "Live" indicator — this is a read-mostly compliance
 * trail, not a streaming console.
 */
const TONE: Record<AuditTone, { border: string; text: string }> = {
  info: { border: 'border-l-status-info', text: 'text-status-info' },
  normal: { border: 'border-l-status-normal', text: 'text-status-normal' },
  warn: { border: 'border-l-status-warn', text: 'text-status-warn' },
  stale: { border: 'border-l-status-stale', text: 'text-status-stale' },
};

export interface ConfigAuditPanelProps {
  entries: readonly AuditEntry[];
}

export const ConfigAuditPanel = ({ entries }: ConfigAuditPanelProps) => (
  <Panel
    title="Configuration Audit"
    density="compact"
    meta={<span className="font-mono">{entries.length} entries</span>}
  >
    <ul
      className="flex flex-col max-h-[220px] overflow-y-auto -mx-1 px-1 divide-y divide-border-subtle"
      aria-label="Configuration audit log"
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
            <span className="font-mono text-micro uppercase tracking-micro text-text-muted/80 shrink-0 tabular-nums w-[40px]">
              {e.at}
            </span>
            <div className="flex-1 min-w-0 flex flex-col leading-tight">
              <span className="text-xs text-text-primary truncate">{e.action}</span>
              <span className="text-micro uppercase tracking-micro text-text-secondary truncate">
                <span className="font-mono">{e.scope}</span> ·{' '}
                <span className={cn('font-semibold', t.text)}>{e.user}</span>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  </Panel>
);
