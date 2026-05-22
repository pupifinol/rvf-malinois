import { cn } from '@rvf/ui';

import { Panel } from '@/components/shell/Panel';

/**
 * CommunicationHealthPanel — pipe-level reachability strip.
 *
 * Each row is a logical hop in the telemetry chain (edge → cloud → store).
 * Green dot = the hop is reachable on its last check; red would mean the
 * hop is down; gray means stale (we have not checked recently). For F0
 * everything reads ONLINE.
 */
export type CommStatus = 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'STALE';

export interface CommNode {
  id: string;
  label: string;
  status: CommStatus;
}

const defaultNodes: CommNode[] = [
  { id: 'gw1', label: 'Gateway #1', status: 'ONLINE' },
  { id: 'gw2', label: 'Gateway #2', status: 'ONLINE' },
  { id: 'nodered', label: 'Node-RED Edge', status: 'ONLINE' },
  { id: 'tb', label: 'ThingsBoard Cloud', status: 'ONLINE' },
  { id: 'db', label: 'Database', status: 'ONLINE' },
  { id: 'ws', label: 'WebSocket Stream', status: 'ONLINE' },
];

const statusStyles: Record<CommStatus, { dot: string; text: string }> = {
  ONLINE: { dot: 'bg-status-normal', text: 'text-status-normal' },
  DEGRADED: { dot: 'bg-status-warn', text: 'text-status-warn' },
  OFFLINE: { dot: 'bg-status-alarm', text: 'text-status-alarm' },
  STALE: { dot: 'bg-status-stale', text: 'text-status-stale' },
};

export interface CommunicationHealthPanelProps {
  nodes?: readonly CommNode[];
}

export const CommunicationHealthPanel = ({
  nodes = defaultNodes,
}: CommunicationHealthPanelProps) => (
  <Panel
    title="Communication Health"
    meta={
      <span>
        {nodes.filter((n) => n.status === 'ONLINE').length}/{nodes.length}
      </span>
    }
  >
    <ul className="flex flex-col">
      {nodes.map((n) => {
        const s = statusStyles[n.status];
        return (
          <li
            key={n.id}
            className="flex items-center justify-between py-2 border-b border-border-subtle last:border-b-0"
          >
            <span className="flex items-center gap-2.5 text-xs text-text-primary">
              <span
                aria-hidden="true"
                className={cn('inline-block w-1.5 h-1.5 rounded-full', s.dot)}
              />
              {n.label}
            </span>
            <span
              className={cn(
                'text-micro uppercase tracking-micro font-semibold tabular-nums',
                s.text,
              )}
            >
              {n.status}
            </span>
          </li>
        );
      })}
    </ul>
  </Panel>
);
