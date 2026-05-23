import { cn } from '@rvf/ui';

import type { OperatorSession } from './data/settings.mock';

import { Panel } from '@/components/shell/Panel';

/**
 * OperatorSessionPanel — right-rail card identifying the operator
 * currently driving the console, their effective role, and the tenant
 * they're scoped to. Uses the same banded `dl` rhythm as the report
 * detail preview.
 */
export interface OperatorSessionPanelProps {
  session: OperatorSession;
}

export const OperatorSessionPanel = ({ session }: OperatorSessionPanelProps) => {
  const sessionTone = {
    ACTIVE: 'text-status-normal',
    IDLE: 'text-status-warn',
    EXPIRED: 'text-status-alarm',
  }[session.session];

  const sessionDot = {
    ACTIVE: 'bg-status-normal',
    IDLE: 'bg-status-warn',
    EXPIRED: 'bg-status-alarm',
  }[session.session];

  return (
    <Panel title="Operator Session" density="compact">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        <Row label="User" value={session.user} />
        <Row label="Role" value={session.role} mono />
        <Row label="Tenant" value={session.tenant} />
        <div className="col-span-2 border-t border-border-subtle my-1" />
        <Row
          label="Session"
          value={
            <span className={cn('inline-flex items-center gap-1.5', sessionTone)}>
              <span
                aria-hidden="true"
                className={cn('inline-block w-1.5 h-1.5 rounded-full', sessionDot)}
              />
              {session.session}
            </span>
          }
        />
        <Row label="Last Login" value={session.lastLoginUtc} mono />
        <Row label="IP Address" value={session.ipAddress} mono />
      </dl>
    </Panel>
  );
};

const Row = ({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) => (
  <>
    <dt className="text-micro uppercase tracking-micro text-text-muted leading-none self-center">
      {label}
    </dt>
    <dd
      className={cn(
        'text-xs font-semibold text-text-primary truncate tabular-nums leading-none self-center',
        mono ? 'font-mono' : '',
      )}
    >
      {value}
    </dd>
  </>
);
