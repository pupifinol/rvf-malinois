import { cn } from '@rvf/ui';

import type { PlatformService, ServiceState } from './data/settings.mock';

import { Panel } from '@/components/shell/Panel';

/**
 * PlatformHealthPanel — right-rail summary of the backend services
 * powering the console (API, realtime stream, historian, object
 * storage, report service). Each row carries a status dot + state
 * label + monospace latency, in the same row rhythm as the Comm
 * Health panels on /operations and /units.
 */
const TONE: Record<ServiceState, { text: string; dot: string }> = {
  ONLINE: { text: 'text-status-normal', dot: 'bg-status-normal' },
  DEGRADED: { text: 'text-status-warn', dot: 'bg-status-warn' },
  OFFLINE: { text: 'text-status-alarm', dot: 'bg-status-alarm' },
};

export interface PlatformHealthPanelProps {
  services: readonly PlatformService[];
}

export const PlatformHealthPanel = ({ services }: PlatformHealthPanelProps) => {
  const online = services.filter((s) => s.state === 'ONLINE').length;
  return (
    <Panel
      title="Platform Health"
      density="compact"
      meta={
        <span className="font-mono tabular-nums">
          {online}/{services.length}
        </span>
      }
    >
      <ul className="flex flex-col">
        {services.map((s) => {
          const t = TONE[s.state];
          return (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 py-1.5 border-b border-border-subtle last:border-b-0"
            >
              <span className="flex items-center gap-2 min-w-0 text-xs text-text-primary">
                <span
                  aria-hidden="true"
                  className={cn('inline-block w-1.5 h-1.5 rounded-full shrink-0', t.dot)}
                />
                <span className="truncate">{s.label}</span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span
                  className={cn(
                    'text-micro uppercase tracking-micro font-bold tabular-nums',
                    t.text,
                  )}
                >
                  {s.state}
                </span>
                {s.latencyMs !== null ? (
                  <span className="font-mono text-micro tabular-nums text-text-muted w-10 text-right">
                    {s.latencyMs} ms
                  </span>
                ) : (
                  <span className="font-mono text-micro tabular-nums text-text-muted w-10 text-right">
                    —
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
};
