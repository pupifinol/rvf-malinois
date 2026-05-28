/**
 * LiveTrendsPanelLive — F2B + F4.5G.1.
 *
 * Two compact trend charts (inlet pressure, liquid flow), one line per
 * active Operations job. Behavior is data-source aware:
 *
 *   - `NEXT_PUBLIC_RVF_DATA_SOURCE !== 'api'` (mock / simulator path):
 *     mini chart series are sourced from the F2 realtime store's ring
 *     buffer via `useHistoryBuffer`. Visual layout and the per-job legend
 *     are preserved.
 *
 *   - `NEXT_PUBLIC_RVF_DATA_SOURCE === 'api'` (backend path):
 *     mini chart series are sourced from F4.6F.1 trend reads through the
 *     shared `useOperationsTrendSeries` hook (default 15-minute window).
 *     The hook drives both the mini chart and the expanded drawer, so
 *     they never read different data paths for the same metric.
 *
 * In both modes each `<TrendCard>` is clickable / keyboard-actionable —
 * activating it opens `<TrendDrawer>` for the selected (unit, tag) pair.
 *
 * Hooks are called at fixed positions, not inside a loop — the panel binds
 * explicitly to the three jobs OPERATIONS_JOBS exposes (a typed 3-tuple).
 * If a future binding adds a fourth job, extend the explicit position list
 * here.
 */
'use client';

import { cn } from '@rvf/ui';
import { useState } from 'react';

import { OPERATIONS_JOBS } from './data/operationsJobs';
import { TrendChart, type TrendSeries } from './TrendChart';
import { TrendDrawer } from './TrendDrawer';

import type { TelemetryReading } from '@/lib/telemetry/models';

import { getDataSource } from '@/lib/api/f4';
import {
  useHistoryBuffer,
  useOperationsTrendSeries,
  type UseOperationsTrendSeriesResult,
} from '@/lib/hooks';
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

interface DrawerSelection {
  unitId: string;
  canonicalTagName: string;
  title: string;
  unitLabel: string;
  color: string;
}

export const LiveTrendsPanelLive = () => {
  const source = getDataSource();
  const isApi = source === 'api';

  const [b0, b1, b2] = OPERATIONS_JOBS;

  // Simulator path — fixed-position ring-buffer hooks. Stays mounted in both
  // modes so the visual layout is byte-identical when a user toggles
  // NEXT_PUBLIC_RVF_DATA_SOURCE; tests that exercise mock mode keep passing.
  const p0 = useHistoryBuffer(b0.job.jobId, CANONICAL_TAGS.PInlet);
  const p1 = useHistoryBuffer(b1.job.jobId, CANONICAL_TAGS.PInlet);
  const p2 = useHistoryBuffer(b2.job.jobId, CANONICAL_TAGS.PInlet);

  const q0 = useHistoryBuffer(b0.job.jobId, CANONICAL_TAGS.QLiquid);
  const q1 = useHistoryBuffer(b1.job.jobId, CANONICAL_TAGS.QLiquid);
  const q2 = useHistoryBuffer(b2.job.jobId, CANONICAL_TAGS.QLiquid);

  // Backend path — same three positions, one TanStack Query call per (unit, tag).
  // Enabled only when the data-source switch is `api` so the mock-mode page
  // never issues a network request.
  const apiP0 = useOperationsTrendSeries({
    unitId: b0.job.unitId,
    canonicalTagName: CANONICAL_TAGS.PInlet,
    window: '15m',
    name: b0.displayName ?? `Unit #${String(b0.displayNumber)}`,
    color: colorAt(0),
    enabled: isApi,
  });
  const apiP1 = useOperationsTrendSeries({
    unitId: b1.job.unitId,
    canonicalTagName: CANONICAL_TAGS.PInlet,
    window: '15m',
    name: b1.displayName ?? `Unit #${String(b1.displayNumber)}`,
    color: colorAt(1),
    enabled: isApi,
  });
  const apiP2 = useOperationsTrendSeries({
    unitId: b2.job.unitId,
    canonicalTagName: CANONICAL_TAGS.PInlet,
    window: '15m',
    name: b2.displayName ?? `Unit #${String(b2.displayNumber)}`,
    color: colorAt(2),
    enabled: isApi,
  });

  const apiQ0 = useOperationsTrendSeries({
    unitId: b0.job.unitId,
    canonicalTagName: CANONICAL_TAGS.QLiquid,
    window: '15m',
    name: b0.displayName ?? `Unit #${String(b0.displayNumber)}`,
    color: colorAt(0),
    enabled: isApi,
  });
  const apiQ1 = useOperationsTrendSeries({
    unitId: b1.job.unitId,
    canonicalTagName: CANONICAL_TAGS.QLiquid,
    window: '15m',
    name: b1.displayName ?? `Unit #${String(b1.displayNumber)}`,
    color: colorAt(1),
    enabled: isApi,
  });
  const apiQ2 = useOperationsTrendSeries({
    unitId: b2.job.unitId,
    canonicalTagName: CANONICAL_TAGS.QLiquid,
    window: '15m',
    name: b2.displayName ?? `Unit #${String(b2.displayNumber)}`,
    color: colorAt(2),
    enabled: isApi,
  });

  const pressureSeries: TrendSeries[] = isApi
    ? collectApiSeries([apiP0, apiP1, apiP2])
    : [
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

  const flowSeries: TrendSeries[] = isApi
    ? collectApiSeries([apiQ0, apiQ1, apiQ2])
    : [
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

  const sourceLabel = isApi ? 'F4.6F.1 backend trends' : 'F2 simulated normalized stream';
  const sampleLabel = isApi ? 'Live ~15m window' : 'Last ~60 samples';

  const [selection, setSelection] = useState<DrawerSelection | null>(null);
  const openDrawer = (next: DrawerSelection) => setSelection(next);
  const closeDrawer = () => setSelection(null);

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
          <span className="text-micro uppercase tracking-micro text-text-muted">{sampleLabel}</span>
          <span
            className="text-micro uppercase tracking-micro text-text-muted"
            data-testid="live-trends-source"
          >
            · {sourceLabel}
          </span>
        </div>
        <Legend />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TrendCard
          title="Inlet Pressure"
          unitLabel="psi"
          series={pressureSeries}
          onOpen={() =>
            openDrawer({
              unitId: b0.job.unitId,
              canonicalTagName: CANONICAL_TAGS.PInlet,
              title: 'Inlet Pressure',
              unitLabel: 'psi',
              color: colorAt(0),
            })
          }
        />
        <TrendCard
          title="Liquid Flow"
          unitLabel="bbl/d"
          series={flowSeries}
          onOpen={() =>
            openDrawer({
              unitId: b0.job.unitId,
              canonicalTagName: CANONICAL_TAGS.QLiquid,
              title: 'Liquid Flow',
              unitLabel: 'bbl/d',
              color: colorAt(0),
            })
          }
        />
      </div>

      {selection ? (
        <TrendDrawer
          open
          onClose={closeDrawer}
          unitId={selection.unitId}
          canonicalTagName={selection.canonicalTagName}
          title={selection.title}
          unitLabel={selection.unitLabel}
          color={selection.color}
        />
      ) : null}
    </section>
  );
};

const collectApiSeries = (results: UseOperationsTrendSeriesResult[]): TrendSeries[] =>
  results
    .map((r) => ({ name: r.series.name, color: r.series.color, data: r.series.data }))
    .filter((s) => s.data.length > 0);

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
  onOpen,
}: {
  title: string;
  unitLabel: string;
  series: TrendSeries[];
  onOpen: () => void;
}) => (
  <button
    type="button"
    onClick={onOpen}
    aria-label={`Open expanded ${title} trend view`}
    className={cn(
      'flex flex-col gap-2 text-left',
      'bg-transparent border-0 p-0 cursor-pointer',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
      'focus-visible:outline-border-focus',
    )}
    data-testid={`trend-card-${title.replace(/\s+/g, '-').toLowerCase()}`}
  >
    <div className="flex items-baseline justify-between">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-primary">
        {title}
      </span>
      <span className="text-micro uppercase tracking-micro text-text-muted tabular-nums">
        {unitLabel}
      </span>
    </div>
    <TrendChart series={series} height={160} />
  </button>
);
