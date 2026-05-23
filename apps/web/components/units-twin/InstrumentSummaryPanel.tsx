import { cn } from '@rvf/ui';

import type { Instrument, UnitTwin } from './data/twin.mock';

import { Panel } from '@/components/shell/Panel';

/**
 * InstrumentSummaryPanel — the unit's ISA tag inventory + reading.
 *
 * Mirrors the at-a-glance pattern used by /sensors but scoped to one
 * unit. Each instrument row shows its tag, description, current reading,
 * and health dot. Disabled sensors render with muted typography and an
 * "OFF" chip so the operator can tell at a glance which sensors are
 * excluded from this unit's active telemetry + alarm evaluation.
 */
const healthStyle: Record<Instrument['health'], { text: string; dot: string }> = {
  GOOD: { text: 'text-status-normal', dot: 'bg-status-normal' },
  DEGRADED: { text: 'text-status-warn', dot: 'bg-status-warn' },
  BAD: { text: 'text-status-alarm', dot: 'bg-status-alarm' },
};

export const InstrumentSummaryPanel = ({ twin }: { twin: UnitTwin }) => {
  const total = twin.instruments.length;
  const enabled = twin.instruments.filter((i) => i.enabled).length;
  const healthy = twin.instruments.filter((i) => i.enabled && i.health === 'GOOD').length;

  return (
    <Panel
      title="Assigned Sensors"
      meta={
        <span className="font-mono tabular-nums">
          {healthy}/{enabled} · {total} total
        </span>
      }
    >
      <ul className="flex flex-col text-xs">
        {twin.instruments.map((i) => {
          const h = healthStyle[i.health];
          const isOff = !i.enabled;
          return (
            <li
              key={i.id}
              className={cn(
                'flex items-center justify-between gap-2 py-1.5 border-b border-border-subtle last:border-b-0',
                isOff ? 'opacity-60' : '',
              )}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-block w-1.5 h-1.5 rounded-full shrink-0',
                    isOff ? 'bg-text-muted' : h.dot,
                  )}
                />
                <span
                  className={cn(
                    'font-mono shrink-0',
                    isOff ? 'text-text-muted' : 'text-text-primary',
                  )}
                >
                  {i.kind}-{i.loop}
                </span>
                <span className="text-text-muted truncate hidden sm:inline">{i.description}</span>
                {isOff ? (
                  <span className="inline-flex items-center px-1.5 py-0 rounded-xs border border-border-subtle bg-canvas text-text-muted text-micro uppercase tracking-micro font-bold shrink-0">
                    Off
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  'font-mono tabular-nums shrink-0',
                  isOff ? 'text-text-muted' : h.text,
                )}
              >
                {i.reading}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
};
