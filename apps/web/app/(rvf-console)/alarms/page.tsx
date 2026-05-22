import { cn } from '@rvf/ui';

import {
  activeAlarms,
  recentAlarms,
  type AlarmPriority,
  type AlarmRecord,
  type AlarmState,
} from '@/components/alarms/data/alarms.mock';
import { PageHeader, StatusChip } from '@/components/shell/PageHeader';
import { Panel } from '@/components/shell/Panel';

/**
 * Alarms — ISA-18.2 Alarm Center.
 *
 * Full alarm queue: active alarms at the top (triage), recent history
 * below (audit). Per ISA-18.2, priority drives ordering and acknowledged
 * state drives row treatment.
 *
 * Visual language inherited from /operations.
 */
const priorityStyles: Record<
  AlarmPriority,
  { row: string; text: string; dot: string; label: string }
> = {
  URGENT: {
    row: 'border-l-status-alarm',
    text: 'text-status-alarm',
    dot: 'bg-status-alarm',
    label: 'Urgent',
  },
  HIGH: {
    row: 'border-l-status-warn',
    text: 'text-status-warn',
    dot: 'bg-status-warn',
    label: 'High',
  },
  LOW: {
    row: 'border-l-status-info',
    text: 'text-status-info',
    dot: 'bg-status-info',
    label: 'Low',
  },
};

const stateLabel: Record<AlarmState, { text: string; cls: string }> = {
  ACTIVE: { text: 'Active', cls: 'text-status-alarm' },
  ACKED: { text: 'Acked', cls: 'text-status-warn' },
  CLEARED: { text: 'Cleared', cls: 'text-text-muted' },
};

export default function AlarmsPage() {
  const urgent = activeAlarms.filter((a) => a.priority === 'URGENT').length;
  const high = activeAlarms.filter((a) => a.priority === 'HIGH').length;
  const low = activeAlarms.filter((a) => a.priority === 'LOW').length;
  const ackPct =
    activeAlarms.length === 0
      ? 100
      : Math.round(
          (activeAlarms.filter((a) => a.state === 'ACKED').length / activeAlarms.length) * 100,
        );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Alarm Center"
        subtitle="ISA-18.2 prioritised queue across the deployed fleet"
        right={
          <>
            <StatusChip tone={urgent > 0 ? 'alarm' : 'normal'}>
              {activeAlarms.length} Active
            </StatusChip>
            <StatusChip>Ack {ackPct}%</StatusChip>
          </>
        }
      />

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
        <div className="flex flex-col gap-4 min-w-0">
          <Panel title="Active Alarms" meta={<span>{activeAlarms.length} entries</span>}>
            <AlarmTable rows={activeAlarms} showAck />
          </Panel>

          <Panel title="Recent History" meta={<span>last 4 h</span>}>
            <AlarmTable rows={recentAlarms} />
          </Panel>
        </div>

        <aside className="flex flex-col gap-3 2xl:max-w-[320px]">
          <Panel title="Alarm Statistics">
            <ul className="flex flex-col">
              <StatRow label="Urgent" value={urgent} tone="text-status-alarm" />
              <StatRow label="High" value={high} tone="text-status-warn" />
              <StatRow label="Low" value={low} tone="text-status-info" />
              <StatRow label="Ack rate" value={`${ackPct}%`} tone="text-text-primary" />
            </ul>
          </Panel>

          <Panel title="Recent Activity">
            <ul className="flex flex-col gap-2 text-xs">
              <ActivityLine time="02 min ago" text="HIGH PRESSURE raised on MU #1" tone="alarm" />
              <ActivityLine time="16 min ago" text="h.finol acknowledged AL-1041" tone="warn" />
              <ActivityLine time="48 min ago" text="MESH HOP RE-PAIR cleared" tone="normal" />
            </ul>
          </Panel>

          <Panel title="Notification Channels">
            <ul className="flex flex-col text-xs">
              <ChannelRow label="Console banner" enabled />
              <ChannelRow label="SMS · on-call" enabled />
              <ChannelRow label="Email digest" enabled={false} />
              <ChannelRow label="Teams webhook" enabled={false} />
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

const AlarmTable = ({
  rows,
  showAck = false,
}: {
  rows: readonly AlarmRecord[];
  showAck?: boolean;
}) => (
  <div className="overflow-x-auto -m-1 p-1">
    <table className="w-full text-xs tabular-nums">
      <thead>
        <tr className="text-micro uppercase tracking-micro text-text-muted">
          <Th>Priority</Th>
          <Th>Title</Th>
          <Th>Source</Th>
          <Th align="right">Raised</Th>
          <Th align="right">Age</Th>
          <Th align="right">State</Th>
          {showAck ? <Th align="right">Ack</Th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => {
          const ps = priorityStyles[a.priority];
          const ss = stateLabel[a.state];
          return (
            <tr
              key={a.id}
              className={cn('border-l-2', ps.row, a.state === 'CLEARED' ? 'opacity-75' : undefined)}
            >
              <Td>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 font-semibold uppercase tracking-micro',
                    ps.text,
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn('inline-block w-1.5 h-1.5 rounded-full', ps.dot)}
                  />
                  {ps.label}
                </span>
              </Td>
              <Td className="text-text-primary">{a.title}</Td>
              <Td className="text-text-secondary">{a.source}</Td>
              <Td align="right" className="text-text-secondary">
                {a.raisedUtc}
              </Td>
              <Td align="right" className="text-text-secondary">
                {a.ageLabel}
              </Td>
              <Td align="right">
                <span className={cn('font-semibold uppercase tracking-micro', ss.cls)}>
                  {ss.text}
                </span>
              </Td>
              {showAck ? (
                <Td align="right" className="text-text-secondary">
                  {a.ackBy ?? '—'}
                </Td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const Th = ({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) => (
  <th
    className={cn(
      'px-2 py-2 font-semibold border-b border-border-subtle',
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
      'px-2 py-2 border-b border-border-subtle last:border-b-0',
      align === 'right' ? 'text-right' : 'text-left',
      className,
    )}
  >
    {children}
  </td>
);

const StatRow = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: string;
}) => (
  <li className="flex items-center justify-between py-2 border-b border-border-subtle last:border-b-0">
    <span className="text-xs text-text-secondary">{label}</span>
    <span className={`text-sm font-semibold tabular-nums ${tone}`}>{value}</span>
  </li>
);

const ActivityLine = ({
  time,
  text,
  tone,
}: {
  time: string;
  text: string;
  tone: 'alarm' | 'warn' | 'normal';
}) => {
  const toneClass = {
    alarm: 'border-l-status-alarm',
    warn: 'border-l-status-warn',
    normal: 'border-l-status-normal',
  }[tone];
  return (
    <li className={cn('pl-2 border-l-2 flex flex-col', toneClass)}>
      <span className="text-text-primary">{text}</span>
      <span className="text-micro uppercase tracking-micro text-text-muted">{time}</span>
    </li>
  );
};

const ChannelRow = ({ label, enabled }: { label: string; enabled: boolean }) => (
  <li className="flex items-center justify-between py-1.5 border-b border-border-subtle last:border-b-0">
    <span className="text-text-primary">{label}</span>
    <span
      className={cn(
        'text-micro uppercase tracking-micro font-semibold',
        enabled ? 'text-status-normal' : 'text-text-muted',
      )}
    >
      {enabled ? 'Enabled' : 'Off'}
    </span>
  </li>
);
