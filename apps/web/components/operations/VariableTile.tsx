import { cn } from '@rvf/ui';

import { Sparkline } from './Sparkline';

import type { LucideIcon } from 'lucide-react';

/**
 * VariableTile — one operational variable inside a MultiphaseUnitCard.
 *
 * Format: small icon + uppercase-micro label on top, then a LARGE value
 * with engineering units to the right, then a sparkline. No gauges, no
 * progress bars — the operator's eye is trained on the number.
 *
 * `accent` is reserved for future alarm-band coloring; for now every tile
 * uses the default text color (ISA-101: gray is OK).
 */
export interface VariableTileProps {
  label: string;
  value: number;
  unit: string;
  history: readonly number[];
  icon: LucideIcon;
  /** Tailwind text-color class applied to the sparkline. */
  sparkColor?: string;
  density?: 'comfortable' | 'compact';
}

const formatValue = (v: number): string => {
  if (v >= 10000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (v >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(1);
};

export const VariableTile = ({
  label,
  value,
  unit,
  history,
  icon: Icon,
  sparkColor = 'text-series-1',
  density = 'comfortable',
}: VariableTileProps) => {
  const compact = density === 'compact';
  return (
    <div
      className={cn(
        'flex flex-col bg-surface-raised border border-border-subtle rounded-sm',
        compact ? 'p-2 gap-1' : 'p-3 gap-1.5',
      )}
    >
      <div className="flex items-center gap-1.5 text-text-secondary">
        <Icon className={cn(compact ? 'w-3 h-3' : 'w-3.5 h-3.5')} aria-hidden="true" />
        <span className="text-micro uppercase tracking-micro font-medium truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5 leading-none">
        <span
          className={cn(
            'font-semibold tabular-nums text-text-primary leading-none',
            compact ? 'text-lg' : 'text-2xl',
          )}
        >
          {formatValue(value)}
        </span>
        <span className="text-xs text-text-muted tabular-nums">{unit}</span>
      </div>
      <Sparkline
        data={history}
        height={compact ? 18 : 22}
        width={compact ? 90 : 130}
        strokeWidth={1.1}
        className={cn('w-full opacity-75', sparkColor)}
      />
    </div>
  );
};
