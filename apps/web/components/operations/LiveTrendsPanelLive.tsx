/**
 * LiveTrendsPanelLive — F2B.
 *
 * Two compact trend charts (inlet pressure, liquid flow), one line per
 * active Operations job. Data comes from the realtime store's ring
 * buffer. Hooks are called at fixed positions, not inside a loop — the
 * panel binds explicitly to the three jobs OPERATIONS_JOBS exposes
 * (OPERATIONS_JOBS is a typed 3-tuple).
 *
 * If a future binding adds a fourth job, extend the explicit position list
 * here. That trade-off keeps the trend logic React-rules-clean without
 * needing a render-prop fan-out.
 */
'use client';

import { OPERATIONS_JOBS } from './data/operationsJobs';
import { TrendChart, type TrendSeries } from './TrendChart';

import type { TelemetryReading } from '@/lib/telemetry/models';

import { useHistoryBuffer } from '@/lib/hooks';
import { CANONICAL_TAGS } from '@/lib/telemetry/tags';

const PALETTE: readonly string[] = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
];

const colorAt = (i: number): string => PALETTE[i % PALETTE.length] ?? 'var(--series-1)';

const toNumberSeries = (history: readonly TelemetryReading[]): number[] => {
  const out: number[] = [];
  for (const r of history.slice(-60)) {
    if (r.value !== null) out.push(r.value);
  }
  return out;
};

export const LiveTrendsPanelLive = () => {
  const [b0, b1, b2] = OPERATIONS_JOBS;

  const p0 = useHistoryBuffer(b0.job.jobId, CANONICAL_TAGS.PInlet);
  const p1 = useHistoryBuffer(b1.job.jobId, CANONICAL_TAGS.PInlet);
  const p2 = useHistoryBuffer(b2.job.jobId, CANONICAL_TAGS.PInlet);

  const q0 = useHistoryBuffer(b0.job.jobId, CANONICAL_TAGS.QLiquid);
  const q1 = useHistoryBuffer(b1.job.jobId, CANONICAL_TAGS.QLiquid);
  const q2 = useHistoryBuffer(b2.job.jobId, CANONICAL_TAGS.QLiquid);

  const pressureSeries: TrendSeries[] = [
    {
      name: b0.displayName ?? `Unit #${String(b0.displayNumber)}`,
      color: colorAt(0),
      data: toNumberSeries(p0),
    },
    {
      name: b1.displayName ?? `Unit #${String(b1.displayNumber)}`,
      color: colorAt(1),
      data: toNumberSeries(p1),
    },
    {
      name: b2.displayName ?? `Unit #${String(b2.displayNumber)}`,
      color: colorAt(2),
      data: toNumberSeries(p2),
    },
  ].filter((s) => s.data.length > 0);

  const flowSeries: TrendSeries[] = [
    {
      name: b0.displayName ?? `Unit #${String(b0.displayNumber)}`,
      color: colorAt(0),
      data: toNumberSeries(q0),
    },
    {
      name: b1.displayName ?? `Unit #${String(b1.displayNumber)}`,
      color: colorAt(1),
      data: toNumberSeries(q1),
    },
    {
      name: b2.displayName ?? `Unit #${String(b2.displayNumber)}`,
      color: colorAt(2),
      data: toNumberSeries(q2),
    },
  ].filter((s) => s.data.length > 0);

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
          <span className="text-micro uppercase tracking-micro text-text-muted">
            Last ~60 samples
          </span>
        </div>
        <Legend />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TrendCard title="Inlet Pressure" unitLabel="psi" series={pressureSeries} />
        <TrendCard title="Liquid Flow" unitLabel="bbl/d" series={flowSeries} />
      </div>
    </section>
  );
};

const Legend = () => (
  <ul className="flex items-center gap-4">
    {OPERATIONS_JOBS.map((b, i) => (
      <li
        key={String(b.job.jobId)}
        className="flex items-center gap-2 text-micro uppercase tracking-micro"
      >
        <span
          aria-hidden="true"
          className="inline-block w-3 h-0.5"
          style={{ background: colorAt(i) }}
        />
        <span className="text-text-secondary">
          {b.displayName ?? `Unit #${String(b.displayNumber)}`}
        </span>
      </li>
    ))}
  </ul>
);

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
