import { cn } from '@rvf/ui';

import { alarmTrend24h } from './data/alarms.mock';

import { Sparkline } from '@/components/operations/Sparkline';

/**
 * AlarmTrendCard — compact 24-hour alarm-volume secondary widget.
 *
 * Lives alongside the severity counters, not above the alarm queue.
 * Thin trend line + a 3-stat row underneath; no chart chrome. The
 * widget reads as a single short panel, never as a hero chart.
 */
export interface AlarmTrendCardProps {
  /** Defaults to the last-24h hourly counts from the mock. */
  trend?: readonly number[];
}

export const AlarmTrendCard = ({ trend = alarmTrend24h }: AlarmTrendCardProps) => {
  const total = trend.reduce((acc, n) => acc + n, 0);
  const peak = trend.reduce((acc, n) => Math.max(acc, n), 0);
  const lastHour = trend[trend.length - 1] ?? 0;

  return (
    <section
      aria-label="Alarm trend, last 24 hours"
      className="flex flex-col gap-1.5 bg-surface border border-border-subtle rounded-sm px-2.5 py-1.5"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-micro uppercase tracking-wide font-bold text-text-primary">
          Alarm Trend
        </h2>
        <span className="text-micro uppercase tracking-micro text-text-muted font-mono">24 h</span>
      </header>

      <Sparkline
        data={trend}
        height={28}
        width={400}
        strokeWidth={1.1}
        className="w-full text-status-alarm opacity-65"
      />

      <dl className="grid grid-cols-3 gap-1.5 text-xs">
        <Stat label="Total" value={total.toString()} />
        <Stat label="Peak / h" value={peak.toString()} />
        <Stat
          label="Last h"
          value={lastHour.toString()}
          tone={lastHour > 0 ? 'text-status-alarm' : 'text-text-primary'}
        />
      </dl>
    </section>
  );
};

const Stat = ({
  label,
  value,
  tone = 'text-text-primary',
}: {
  label: string;
  value: string;
  tone?: string;
}) => (
  <div className="flex items-baseline justify-between gap-1 leading-none">
    <dt className="text-micro uppercase tracking-micro text-text-muted">{label}</dt>
    <dd className={cn('font-mono tabular-nums text-xs font-bold leading-none', tone)}>{value}</dd>
  </div>
);
