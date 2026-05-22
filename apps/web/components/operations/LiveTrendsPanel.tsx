import { TrendChart, type TrendSeries } from './TrendChart';

import type { UnitTelemetry } from './data/units.mock';

/**
 * LiveTrendsPanel — two compact line charts side by side, comparing every
 * active unit on the same axis. Today: Oil Rate (bopd) and Wellhead
 * Pressure (psi). The legend is derived from the unit list so adding a
 * third unit auto-extends the chart without any layout changes.
 *
 * Unit #1 uses series-1 (blue), Unit #2 uses series-2 (amber), and the
 * rest cycle through series-3..6.
 */
const PALETTE: readonly string[] = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
];

const colorAt = (i: number): string => PALETTE[i % PALETTE.length] ?? 'var(--series-1)';

const seriesFor = (
  units: readonly UnitTelemetry[],
  pick: (u: UnitTelemetry) => readonly number[],
): TrendSeries[] =>
  units.map((u, i) => ({
    name: `Unit #${u.unitNumber}`,
    color: colorAt(i),
    data: pick(u),
  }));

export interface LiveTrendsPanelProps {
  units: readonly UnitTelemetry[];
}

export const LiveTrendsPanel = ({ units }: LiveTrendsPanelProps) => {
  const oilSeries = seriesFor(units, (u) => u.oilRate.history);
  const pressureSeries = seriesFor(units, (u) => u.pressure.history);

  return (
    <section
      className="bg-surface border border-border-subtle rounded-sm p-4 flex flex-col gap-3"
      aria-label="Live trends"
    >
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-sm uppercase tracking-wide font-bold text-text-primary">
            Live Trends
          </h2>
          <span className="text-micro uppercase tracking-micro text-text-muted">Last 1 h</span>
        </div>
        <Legend units={units} />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TrendCard title="Oil Rate" unitLabel="bopd" series={oilSeries} />
        <TrendCard title="Wellhead Pressure" unitLabel="psi" series={pressureSeries} />
      </div>
    </section>
  );
};

const TrendCard = ({
  title,
  unitLabel,
  series,
}: {
  title: string;
  unitLabel: string;
  series: TrendSeries[];
}) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-baseline justify-between">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-primary">
        {title}
      </span>
      <span className="text-micro uppercase tracking-micro text-text-muted tabular-nums">
        {unitLabel}
      </span>
    </div>
    <TrendChart series={series} height={160} />
  </div>
);

const Legend = ({ units }: { units: readonly UnitTelemetry[] }) => (
  <ul className="flex items-center gap-4">
    {units.map((u, i) => (
      <li key={u.id} className="flex items-center gap-2 text-micro uppercase tracking-micro">
        <span
          aria-hidden="true"
          className="inline-block w-3 h-0.5"
          style={{ background: colorAt(i) }}
        />
        <span className="text-text-secondary">Unit #{u.unitNumber}</span>
      </li>
    ))}
  </ul>
);
