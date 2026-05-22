import { cn } from '@rvf/ui';

import type { Instrument, UnitTwin } from './data/twin.mock';

import { Panel } from '@/components/shell/Panel';

/**
 * InstrumentSummaryPanel — the unit's ISA tag inventory + reading.
 *
 * Mirrors the at-a-glance pattern used by /sensors but scoped to one
 * unit. Each instrument row shows its tag, description, current reading,
 * and health dot.
 */
const healthStyle: Record<Instrument['health'], { text: string; dot: string }> = {
  GOOD: { text: 'text-status-normal', dot: 'bg-status-normal' },
  DEGRADED: { text: 'text-status-warn', dot: 'bg-status-warn' },
  BAD: { text: 'text-status-alarm', dot: 'bg-status-alarm' },
};

export const InstrumentSummaryPanel = ({ twin }: { twin: UnitTwin }) => {
  const total = twin.instruments.length;
  const healthy = twin.instruments.filter((i) => i.health === 'GOOD').length;

  return (
    <Panel
      title="Instrument Summary"
      meta={
        <span>
          {healthy}/{total}
        </span>
      }
    >
      <ul className="flex flex-col text-xs">
        {twin.instruments.map((i) => {
          const h = healthStyle[i.health];
          return (
            <li
              key={i.id}
              className="flex items-center justify-between gap-2 py-1.5 border-b border-border-subtle last:border-b-0"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  aria-hidden="true"
                  className={cn('inline-block w-1.5 h-1.5 rounded-full shrink-0', h.dot)}
                />
                <span className="font-mono text-text-primary shrink-0">
                  {i.kind}-{i.loop}
                </span>
                <span className="text-text-muted truncate hidden sm:inline">{i.description}</span>
              </span>
              <span className={cn('font-mono tabular-nums shrink-0', h.text)}>{i.reading}</span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
};
