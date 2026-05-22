import type { ProcessVariable, UnitTwin } from './data/twin.mock';

import { TrendChart } from '@/components/operations/TrendChart';
import { Panel } from '@/components/shell/Panel';

/**
 * ProcessTrendsPanel — the bottom strip of /units.
 *
 * Five compact line charts: Separator Pressure, Separator Temperature,
 * Gas Flow, Oil Flow, Water Flow. Reuses the /operations TrendChart so
 * the visual language stays identical — same gridline density, same
 * monospaced Y-tick labels, same line weight.
 */
export interface ProcessTrendsPanelProps {
  twin: UnitTwin;
}

export const ProcessTrendsPanel = ({ twin }: ProcessTrendsPanelProps) => {
  const cards: { title: string; v: ProcessVariable; color: string }[] = [
    { title: 'Separator Pressure', v: twin.separation.pressure, color: 'var(--series-1)' },
    { title: 'Separator Temperature', v: twin.separation.temperature, color: 'var(--series-2)' },
    { title: 'Gas Flow', v: twin.gasOutlet.flow, color: 'var(--phase-gas)' },
    { title: 'Liquid Flow', v: twin.liquidOutlet.flow, color: 'var(--series-2)' },
    { title: 'Water Cut', v: twin.liquidOutlet.waterCut, color: 'var(--phase-water)' },
  ];

  return (
    <Panel title="Live Trends" meta={<span>Last 1 h</span>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {cards.map((c) => (
          <MiniTrend
            key={c.title}
            title={c.title}
            value={c.v.value}
            unit={c.v.unit}
            tag={c.v.tag}
            data={c.v.history}
            color={c.color}
          />
        ))}
      </div>
    </Panel>
  );
};

const MiniTrend = ({
  title,
  value,
  unit,
  tag,
  data,
  color,
}: {
  title: string;
  value: number;
  unit: string;
  tag?: string;
  data: readonly number[];
  color: string;
}) => (
  <div className="flex flex-col gap-1.5 bg-surface-raised border border-border-subtle rounded-sm p-3">
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-micro uppercase tracking-micro font-semibold text-text-primary truncate">
        {title}
      </span>
      {tag ? (
        <span className="text-micro uppercase tracking-micro font-mono text-text-muted shrink-0">
          {tag}
        </span>
      ) : null}
    </div>
    <div className="flex items-baseline gap-1.5 leading-none">
      <span className="text-base font-semibold tabular-nums text-text-primary leading-none">
        {formatValue(value)}
      </span>
      <span className="text-xs text-text-muted tabular-nums">{unit}</span>
    </div>
    <TrendChart series={[{ name: title, color, data }]} height={70} yTicks={2} />
  </div>
);

const formatValue = (v: number): string => {
  if (v >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(1);
};
