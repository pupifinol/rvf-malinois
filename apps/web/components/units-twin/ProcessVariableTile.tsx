import { cn } from '@rvf/ui';

import type { ProcessVariable } from './data/twin.mock';

import { Sparkline } from '@/components/operations/Sparkline';

/**
 * ProcessVariableTile — single telemetry tile attached to the process
 * twin. Mirrors the /operations VariableTile visually but carries an ISA
 * instrument tag (e.g. "PIT-100") so the operator can correlate the value
 * with the corresponding tag on the separator diagram.
 */
export interface ProcessVariableTileProps {
  variable: ProcessVariable;
  sparkColor?: string;
}

const formatValue = (v: number): string => {
  if (v >= 10000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (v >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(1);
};

export const ProcessVariableTile = ({
  variable,
  sparkColor = 'text-series-1',
}: ProcessVariableTileProps) => (
  <div className="flex flex-col gap-1.5 bg-surface-raised border border-border-subtle rounded-sm p-3">
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-micro uppercase tracking-micro font-medium text-text-secondary truncate">
        {variable.label}
      </span>
      {variable.tag ? (
        <span className="text-micro uppercase tracking-micro font-mono text-text-muted shrink-0">
          {variable.tag}
        </span>
      ) : null}
    </div>
    <div className="flex items-baseline gap-1.5 leading-none">
      <span className="text-2xl font-semibold tabular-nums text-text-primary leading-none">
        {formatValue(variable.value)}
      </span>
      <span className="text-xs text-text-muted tabular-nums">{variable.unit}</span>
    </div>
    <Sparkline
      data={variable.history}
      height={22}
      width={130}
      strokeWidth={1.1}
      className={cn('w-full opacity-75', sparkColor)}
    />
  </div>
);
