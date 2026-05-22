import type { SensorRecord } from './data/sensors.mock';

import { Panel } from '@/components/shell/Panel';

/**
 * CalibrationStatusDial — right-rail circular health visualization.
 *
 * Stacks the inventory into four calibration buckets and renders each as
 * an arc on a single donut. The center value reads "% up-to-date". Each
 * arc uses the platform's semantic palette: normal / warn / alarm /
 * stale. No animation, no gradient — just solid arcs.
 */
export interface CalibrationStatusDialProps {
  sensors: readonly SensorRecord[];
}

interface Bucket {
  key: 'UP_TO_DATE' | 'DUE_SOON' | 'OVERDUE' | 'UNKNOWN';
  label: string;
  color: string;
  toneText: string;
}

const buckets: Bucket[] = [
  {
    key: 'UP_TO_DATE',
    label: 'Up to date',
    color: 'var(--status-normal)',
    toneText: 'text-status-normal',
  },
  { key: 'DUE_SOON', label: 'Due soon', color: 'var(--status-warn)', toneText: 'text-status-warn' },
  { key: 'OVERDUE', label: 'Overdue', color: 'var(--status-alarm)', toneText: 'text-status-alarm' },
  { key: 'UNKNOWN', label: 'Unknown', color: 'var(--status-stale)', toneText: 'text-status-stale' },
];

/** Arc opacity. Slightly muted against the dark canvas so the donut
 *  reads matte/industrial rather than chart-bright, while still using
 *  the platform's canonical status palette. */
const ARC_OPACITY = 0.82;

const bucketOf = (s: SensorRecord): Bucket['key'] => {
  if (s.status === 'OFFLINE') return 'UNKNOWN';
  if (s.calDueDays < 0) return 'OVERDUE';
  if (s.calDueDays <= 14) return 'DUE_SOON';
  return 'UP_TO_DATE';
};

export const CalibrationStatusDial = ({ sensors }: CalibrationStatusDialProps) => {
  const counts: Record<Bucket['key'], number> = {
    UP_TO_DATE: 0,
    DUE_SOON: 0,
    OVERDUE: 0,
    UNKNOWN: 0,
  };
  for (const s of sensors) counts[bucketOf(s)] += 1;

  const total = sensors.length || 1;
  const upToDatePct = Math.round((counts.UP_TO_DATE / total) * 100);

  // ----- donut geometry -----
  const size = 132;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  let cumulative = 0;
  const arcs = buckets.map((b) => {
    const value = counts[b.key];
    const length = (value / total) * circumference;
    const offset = circumference - cumulative;
    cumulative += length;
    return { ...b, value, length, offset };
  });

  return (
    <Panel title="Calibration Status" meta={<span className="font-mono">{total} sensors</span>}>
      <div className="flex items-center gap-4">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="shrink-0 -rotate-90"
          aria-hidden="true"
        >
          {/* Track */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            stroke="var(--border-subtle)"
            strokeWidth={stroke}
            fill="none"
          />
          {/* Arcs */}
          {arcs.map((a) =>
            a.value === 0 ? null : (
              <circle
                key={a.key}
                cx={cx}
                cy={cy}
                r={radius}
                stroke={a.color}
                strokeOpacity={ARC_OPACITY}
                strokeWidth={stroke}
                fill="none"
                strokeDasharray={`${a.length} ${circumference - a.length}`}
                strokeDashoffset={a.offset}
                strokeLinecap="butt"
              />
            ),
          )}
        </svg>

        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-micro uppercase tracking-micro text-text-muted">Up to date</span>
          <span className="text-2xl font-bold font-mono tabular-nums text-text-primary leading-none">
            {upToDatePct}%
          </span>
          <span className="text-micro uppercase tracking-micro text-text-muted">
            {counts.UP_TO_DATE} of {total}
          </span>
        </div>
      </div>

      <ul className="flex flex-col text-xs">
        {arcs.map((a) => (
          <li
            key={a.key}
            className="flex items-center justify-between py-1.5 border-b border-border-subtle last:border-b-0"
          >
            <span className="flex items-center gap-2 text-text-secondary">
              <span
                aria-hidden="true"
                className="inline-block w-2.5 h-2.5 rounded-xs"
                style={{ backgroundColor: a.color }}
              />
              {a.label}
            </span>
            <span className={`font-mono tabular-nums font-semibold ${a.toneText}`}>{a.value}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
};
