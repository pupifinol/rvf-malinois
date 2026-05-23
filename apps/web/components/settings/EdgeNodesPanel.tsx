import { cn } from '@rvf/ui';

import type { EdgeNode, ServiceState } from './data/settings.mock';

import { Panel } from '@/components/shell/Panel';

/**
 * EdgeNodesPanel — right-rail roster of OT-side gateways and edge
 * compute nodes. Same row treatment as PlatformHealthPanel, with the
 * site/equipment context promoted under the label so the operator can
 * tell which physical asset the gateway lives on.
 */
const TONE: Record<ServiceState, { text: string; dot: string }> = {
  ONLINE: { text: 'text-status-normal', dot: 'bg-status-normal' },
  DEGRADED: { text: 'text-status-warn', dot: 'bg-status-warn' },
  OFFLINE: { text: 'text-status-alarm', dot: 'bg-status-alarm' },
};

export interface EdgeNodesPanelProps {
  nodes: readonly EdgeNode[];
}

export const EdgeNodesPanel = ({ nodes }: EdgeNodesPanelProps) => {
  const online = nodes.filter((n) => n.state === 'ONLINE').length;
  return (
    <Panel
      title="Edge Nodes"
      density="compact"
      meta={
        <span className="font-mono tabular-nums">
          {online}/{nodes.length}
        </span>
      }
    >
      <ul className="flex flex-col">
        {nodes.map((n) => {
          const t = TONE[n.state];
          return (
            <li
              key={n.id}
              className="flex items-center justify-between gap-2 py-1.5 border-b border-border-subtle last:border-b-0"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  aria-hidden="true"
                  className={cn('inline-block w-1.5 h-1.5 rounded-full shrink-0', t.dot)}
                />
                <span className="flex flex-col leading-tight min-w-0">
                  <span className="text-xs text-text-primary truncate">{n.label}</span>
                  <span className="font-mono text-micro uppercase tracking-micro text-text-muted truncate">
                    {n.site}
                  </span>
                </span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span
                  className={cn(
                    'text-micro uppercase tracking-micro font-bold tabular-nums',
                    t.text,
                  )}
                >
                  {n.state}
                </span>
                <span className="font-mono text-micro tabular-nums text-text-muted w-10 text-right">
                  {n.latencyMs} ms
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
};
