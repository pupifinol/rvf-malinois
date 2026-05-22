'use client';

import { cn } from '@rvf/ui';

import { AlarmPriorityChip, PRIORITY_STYLE } from './AlarmPriorityChip';
import { formatActiveFor, type AlarmRecord, type AlarmState } from './data/alarms.mock';

import { Panel } from '@/components/shell/Panel';

/**
 * ActiveAlarmsTable — primary operational area of /alarms.
 *
 * Each row carries a 3-px left accent stripe in the alarm's priority
 * tone. URGENT rows additionally pick up a faint horizontal tint
 * (`bg-gradient-to-r from-alarm-urgent/8 to-transparent`) so they read
 * as the dominant rows from across the control room without ever
 * fully filling the row.
 *
 * Row brightness encodes state:
 *   - ACTIVE: full-bright title, slight tonal wash on the row.
 *   - ACKED: title steps back to `text-text-secondary`, no wash.
 *
 * Row click selects. The Ack column carries either the operator's
 * initials (for ACKED rows) or an inline Ack button (for ACTIVE rows).
 * Sticky header on a `max-h-[440px] overflow-x-auto` body.
 */
export interface ActiveAlarmsTableProps {
  rows: readonly AlarmRecord[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAck: (id: string) => void;
}

const STATE_STYLE: Record<AlarmState, { text: string; cls: string; dot: string }> = {
  ACTIVE: { text: 'Active', cls: 'text-status-alarm', dot: 'bg-status-alarm' },
  ACKED: { text: 'Acked', cls: 'text-status-warn', dot: 'bg-status-warn' },
  CLEARED: { text: 'Cleared', cls: 'text-text-muted', dot: 'bg-text-muted' },
};

export const ActiveAlarmsTable = ({
  rows,
  selectedId,
  onSelect,
  onAck,
}: ActiveAlarmsTableProps) => (
  <Panel
    title="Active Alarms"
    density="compact"
    meta={
      <span className="font-mono">
        {rows.filter((r) => r.state === 'ACTIVE').length} active · {rows.length} total
      </span>
    }
  >
    <div className="overflow-x-auto max-h-[600px] -mx-1 px-1">
      <table className="w-full text-xs tabular-nums">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="text-micro uppercase tracking-micro text-text-muted">
            <Th width="w-[6.5rem]">Priority</Th>
            <Th>Title</Th>
            <Th width="w-24">Source</Th>
            <Th width="w-16">Unit</Th>
            <Th align="right" width="w-20">
              Raised
            </Th>
            <Th align="right" width="w-20">
              Active For
            </Th>
            <Th align="right" width="w-20">
              State
            </Th>
            <Th align="right" width="w-20">
              Ack
            </Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-2 py-8 text-center text-text-muted">
                No alarms match the current filters.
              </td>
            </tr>
          ) : (
            rows.map((a) => (
              <ActiveAlarmRow
                key={a.id}
                alarm={a}
                selected={a.id === selectedId}
                onSelect={onSelect}
                onAck={onAck}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  </Panel>
);

const ActiveAlarmRow = ({
  alarm,
  selected,
  onSelect,
  onAck,
}: {
  alarm: AlarmRecord;
  selected: boolean;
  onSelect: (id: string) => void;
  onAck: (id: string) => void;
}) => {
  const ps = PRIORITY_STYLE[alarm.priority];
  const ss = STATE_STYLE[alarm.state];
  const acked = alarm.state === 'ACKED';
  const urgentActive = alarm.priority === 'URGENT' && alarm.state === 'ACTIVE';
  const highActive = alarm.priority === 'HIGH' && alarm.state === 'ACTIVE';

  return (
    <tr
      onClick={() => onSelect(alarm.id)}
      className={cn(
        'cursor-pointer transition-colors duration-fast border-l-[3px]',
        ps.row,
        // URGENT/HIGH active rows pick up a faint horizontal tint so they
        // visually dominate the queue from across the room.
        urgentActive && 'bg-gradient-to-r from-alarm-urgent/10 via-alarm-urgent/4 to-transparent',
        highActive &&
          !urgentActive &&
          'bg-gradient-to-r from-alarm-high/8 via-alarm-high/3 to-transparent',
        selected ? 'bg-brand-primary/20 hover:bg-brand-primary/25' : 'hover:bg-surface-raised/60',
      )}
    >
      <Td>
        <AlarmPriorityChip priority={alarm.priority} />
      </Td>
      <Td
        className={cn(
          'truncate max-w-[18rem]',
          acked ? 'text-text-secondary' : 'text-text-primary font-semibold',
        )}
      >
        {alarm.title}
      </Td>
      <Td className="text-text-secondary font-mono">{alarm.source}</Td>
      <Td className="text-text-secondary">{alarm.unit}</Td>
      <Td align="right" className="text-text-secondary font-mono">
        {alarm.raisedUtc}
      </Td>
      <Td
        align="right"
        className={cn(
          'font-mono tabular-nums font-semibold',
          urgentActive ? 'text-status-alarm' : 'text-text-primary',
        )}
      >
        {formatActiveFor(alarm.activeSec)}
      </Td>
      <Td align="right">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 font-semibold uppercase tracking-micro',
            ss.cls,
          )}
        >
          <span
            aria-hidden="true"
            className={cn('inline-block w-1.5 h-1.5 rounded-full', ss.dot)}
          />
          {ss.text}
        </span>
      </Td>
      <Td align="right">
        {alarm.ackBy ? (
          <span className="font-mono text-text-secondary">{alarm.ackBy}</span>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAck(alarm.id);
            }}
            className={cn(
              'px-2.5 py-1 text-micro uppercase tracking-micro font-bold rounded-xs',
              urgentActive
                ? 'bg-status-alarm text-status-fg border border-status-alarm hover:bg-status-critical hover:border-status-critical'
                : 'bg-surface-raised border border-border-strong text-text-primary hover:bg-surface hover:border-text-secondary',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
              'transition-colors duration-fast ease-industrial',
            )}
          >
            Ack
          </button>
        )}
      </Td>
    </tr>
  );
};

const Th = ({
  children,
  align = 'left',
  width,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  width?: string;
}) => (
  <th
    className={cn(
      'px-2.5 py-2 font-semibold border-b border-border-subtle whitespace-nowrap',
      width,
      align === 'right' ? 'text-right' : 'text-left',
    )}
  >
    {children}
  </th>
);

const Td = ({
  children,
  align = 'left',
  className,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) => (
  <td
    className={cn(
      'px-2.5 py-1.5 border-b border-border-subtle last:border-b-0',
      align === 'right' ? 'text-right' : 'text-left',
      className,
    )}
  >
    {children}
  </td>
);
