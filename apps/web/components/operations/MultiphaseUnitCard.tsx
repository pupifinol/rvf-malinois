'use client';

import { cn } from '@rvf/ui';
import {
  ArrowDownUp,
  Droplet,
  Flame,
  Gauge,
  Signal,
  SignalHigh,
  SignalLow,
  SignalMedium,
  SignalZero,
  Thermometer,
  Waves,
} from 'lucide-react';

import { formatDuration, type UnitStatus, type UnitTelemetry } from './data/units.mock';
import { UnitImage } from './UnitImage';
import { VariableTile } from './VariableTile';

/**
 * MultiphaseUnitCard — the hero card of the Operations Console.
 *
 * One card per active multiphase well-testing unit. Status is communicated
 * by (1) a left accent border, (2) a status chip in the header, never by
 * coloring the whole card. The card body is identical regardless of N so
 * the operator builds muscle memory for "where is oil rate on unit 3".
 *
 * `density` shrinks the variable tiles and hides the thumbnail so a 5-unit
 * deployment can render in a 3-column grid without losing the numbers.
 */
export interface MultiphaseUnitCardProps {
  unit: UnitTelemetry;
  density?: 'comfortable' | 'compact';
}

const statusStyles: Record<UnitStatus, { chip: string; accent: string; dot: string }> = {
  TESTING: {
    chip: 'bg-status-info/15 text-status-info border-status-info/50',
    accent: 'border-l-status-info',
    dot: 'bg-status-info',
  },
  STABILIZING: {
    chip: 'bg-status-warn/15 text-status-warn border-status-warn/50',
    accent: 'border-l-status-warn',
    dot: 'bg-status-warn',
  },
  ALARM: {
    chip: 'bg-status-alarm/15 text-status-alarm border-status-alarm/50',
    accent: 'border-l-status-alarm',
    dot: 'bg-status-alarm',
  },
  OFFLINE: {
    chip: 'bg-status-stale/15 text-status-stale border-status-stale/50',
    accent: 'border-l-status-stale',
    dot: 'bg-status-stale',
  },
};

const SignalIcon = ({ signal }: { signal: UnitTelemetry['signal'] }) => {
  const cls = 'w-4 h-4 text-text-secondary';
  switch (signal) {
    case 'STRONG':
      return <SignalHigh className={cls} aria-label="Signal strong" />;
    case 'OK':
      return <SignalMedium className={cls} aria-label="Signal OK" />;
    case 'WEAK':
      return <SignalLow className={cls} aria-label="Signal weak" />;
    case 'NONE':
      return <SignalZero className={cls} aria-label="No signal" />;
    default:
      return <Signal className={cls} aria-hidden="true" />;
  }
};

export const MultiphaseUnitCard = ({ unit, density = 'comfortable' }: MultiphaseUnitCardProps) => {
  const compact = density === 'compact';
  const styles = statusStyles[unit.status];

  const qualityKind: 'good' | 'warn' | 'bad' =
    unit.dataQualityPct >= 97 ? 'good' : unit.dataQualityPct >= 90 ? 'warn' : 'bad';
  const qualityClass =
    qualityKind === 'good'
      ? 'text-status-normal'
      : qualityKind === 'warn'
        ? 'text-status-warn'
        : 'text-status-alarm';

  return (
    <article
      className={cn(
        'flex flex-col',
        'bg-surface border border-border-subtle rounded-sm',
        'border-l-2',
        styles.accent,
        compact ? 'p-3 gap-3' : 'p-4 gap-3.5',
        // Restrained hover — border brightness only, no surface lift, no transform.
        // A control screen should not respond to the mouse with motion.
        'transition-colors duration-fast ease-industrial',
        'hover:border-border-strong',
      )}
      aria-label={`Multiphase Unit ${unit.unitNumber}`}
    >
      {/* Header */}
      <header className="flex items-start gap-3">
        {!compact && <UnitImage className="w-14 h-9" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold tracking-wide uppercase text-text-primary">
              Multiphase Unit #{unit.unitNumber}
            </h3>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-xs',
                'text-micro uppercase tracking-micro font-bold border',
                styles.chip,
              )}
            >
              <span
                aria-hidden="true"
                className={cn('inline-block w-1.5 h-1.5 rounded-full', styles.dot)}
              />
              {unit.status}
            </span>
            <span className="ml-auto">
              <SignalIcon signal={unit.signal} />
            </span>
          </div>

          <dl className="mt-2 grid grid-cols-4 gap-x-3 gap-y-0.5 text-xs">
            <MetaItem label="Well" value={unit.well} mono />
            <MetaItem label="Job" value={unit.job} />
            <MetaItem label="Duration" value={formatDuration(unit.durationSec)} mono />
            <MetaItem label="Started" value={unit.startedUtc} mono />
          </dl>
        </div>
      </header>

      {/* Variables — 3 across, 2 rows */}
      <div className="grid grid-cols-3 gap-2">
        <VariableTile
          label="Oil Rate"
          icon={Droplet}
          value={unit.oilRate.value}
          unit={unit.oilRate.unit}
          history={unit.oilRate.history}
          sparkColor="text-series-1"
          density={density}
        />
        <VariableTile
          label="Gas Rate"
          icon={Flame}
          value={unit.gasRate.value}
          unit={unit.gasRate.unit}
          history={unit.gasRate.history}
          sparkColor="text-series-2"
          density={density}
        />
        <VariableTile
          label="Water Cut"
          icon={Waves}
          value={unit.waterCut.value}
          unit={unit.waterCut.unit}
          history={unit.waterCut.history}
          sparkColor="text-series-6"
          density={density}
        />
        <VariableTile
          label="Pressure"
          icon={Gauge}
          value={unit.pressure.value}
          unit={unit.pressure.unit}
          history={unit.pressure.history}
          sparkColor="text-series-1"
          density={density}
        />
        <VariableTile
          label="Temperature"
          icon={Thermometer}
          value={unit.temperature.value}
          unit={unit.temperature.unit}
          history={unit.temperature.history}
          sparkColor="text-series-2"
          density={density}
        />
        <VariableTile
          label="Differential P."
          icon={ArrowDownUp}
          value={unit.differentialPressure.value}
          unit={unit.differentialPressure.unit}
          history={unit.differentialPressure.history}
          sparkColor="text-series-5"
          density={density}
        />
      </div>

      {/* Footer — data quality strip */}
      <footer className="grid grid-cols-4 gap-3 pt-2.5 border-t border-border-subtle">
        <FooterMetric
          label="Data Quality"
          value={`${unit.dataQualityPct.toFixed(1)}%`}
          valueClass={qualityClass}
        />
        <FooterMetric
          label="Sensor Health"
          value={unit.sensorHealth}
          valueClass={
            unit.sensorHealth === 'GOOD'
              ? 'text-status-normal'
              : unit.sensorHealth === 'DEGRADED'
                ? 'text-status-warn'
                : 'text-status-alarm'
          }
        />
        <FooterMetric label="Packet Loss" value={`${unit.packetLossPct.toFixed(1)}%`} />
        <FooterMetric label="Latency" value={`${unit.latencyMs} ms`} />
      </footer>
    </article>
  );
};

const MetaItem = ({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) => (
  <div className="min-w-0">
    <dt className="text-micro uppercase tracking-micro text-text-muted">{label}</dt>
    <dd
      className={cn('text-text-primary truncate', mono ? 'font-mono tabular-nums' : 'font-medium')}
    >
      {value}
    </dd>
  </div>
);

const FooterMetric = ({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) => (
  <div className="flex flex-col gap-0.5 min-w-0">
    <span className="text-micro uppercase tracking-micro text-text-muted">{label}</span>
    <span className={cn('text-sm font-semibold tabular-nums', valueClass ?? 'text-text-primary')}>
      {value}
    </span>
  </div>
);
