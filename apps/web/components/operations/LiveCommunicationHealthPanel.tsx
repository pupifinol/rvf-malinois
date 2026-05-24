/**
 * LiveCommunicationHealthPanel — F2B.
 *
 * Replaces the static communication panel for the Operations screen with
 * an HONEST view of what F2B actually does:
 *
 *   - "Normalized Stream"  — the in-browser pipe (live: connected to the
 *     simulator; reconnecting/disconnected if it has been torn down).
 *   - "F2 Simulated Source" — yes, this build is driven by the F2A simulator.
 *   - "Backend WebSocket"  — not wired up in F2B. Labeled "Not connected".
 *   - "Field Protocols"    — explicitly inactive (no MQTT, Modbus, OPC-UA, PLC).
 *
 * Per ADR-005 and the F2B brief: do NOT imply a real Gateway, Node-RED,
 * ThingsBoard, Database, MQTT broker, or Historian is connected in this
 * build. The legacy panel (CommunicationHealthPanel.tsx) is left in place;
 * Operations now renders this version instead.
 */
'use client';

import { cn } from '@rvf/ui';

import { Panel } from '@/components/shell/Panel';
import { useConnectionStatus } from '@/lib/hooks';

type RowStatus = 'normal' | 'warn' | 'stale' | 'info';

interface Row {
  id: string;
  label: string;
  status: RowStatus;
  value: string;
}

const statusStyles: Record<RowStatus, { dot: string; text: string }> = {
  normal: { dot: 'bg-status-normal', text: 'text-status-normal' },
  warn: { dot: 'bg-status-warn', text: 'text-status-warn' },
  stale: { dot: 'bg-status-stale', text: 'text-status-stale' },
  info: { dot: 'bg-status-info', text: 'text-status-info' },
};

export const LiveCommunicationHealthPanel = () => {
  const conn = useConnectionStatus();

  const streamRow: Row =
    conn.kind === 'connected'
      ? { id: 'stream', label: 'Normalized Stream', status: 'normal', value: 'ONLINE · SIMULATED' }
      : conn.kind === 'reconnecting'
        ? { id: 'stream', label: 'Normalized Stream', status: 'warn', value: 'RECONNECTING' }
        : { id: 'stream', label: 'Normalized Stream', status: 'stale', value: 'DISCONNECTED' };

  const rows: Row[] = [
    streamRow,
    {
      id: 'source',
      label: 'F2 Simulated Source',
      status: conn.kind === 'connected' ? 'info' : 'stale',
      value: conn.kind === 'connected' ? 'ACTIVE (DEV)' : 'IDLE',
    },
    {
      id: 'backend-ws',
      label: 'Backend WebSocket',
      status: 'stale',
      value: 'NOT CONNECTED',
    },
    {
      id: 'protocols',
      label: 'Field Protocols',
      status: 'stale',
      value: 'NOT ACTIVE IN BUILD',
    },
  ];

  return (
    <Panel title="Communication Health" meta={<span className="text-text-muted">F2B build</span>}>
      <ul className="flex flex-col">
        {rows.map((r) => {
          const s = statusStyles[r.status];
          return (
            <li
              key={r.id}
              className="flex items-center justify-between py-2 border-b border-border-subtle last:border-b-0"
            >
              <span className="flex items-center gap-2.5 text-xs text-text-primary">
                <span
                  aria-hidden="true"
                  className={cn('inline-block w-1.5 h-1.5 rounded-full', s.dot)}
                />
                {r.label}
              </span>
              <span
                className={cn(
                  'text-micro uppercase tracking-micro font-semibold tabular-nums',
                  s.text,
                )}
              >
                {r.value}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-micro uppercase tracking-micro text-text-muted mt-1">
        This build does not connect to MQTT, Modbus, OPC-UA, PLC, Node-RED, ThingsBoard, Gateway
        Stick or Historian. Real protocols are introduced in later phases.
      </p>
    </Panel>
  );
};
