import { cn } from '@rvf/ui';

import { PortalProductionChart } from './PortalProductionChart';
import { ProductionGlyph } from './ProductionGlyph';

import type { ProductionGlyphVariant } from './ProductionGlyph';

/**
 * ProductionChartCard — one of the three protagonist charts on the Client
 * Portal (Oil, Gas, Water Cut). Each one is self-contained: title, current
 * value with engineering unit, delta-vs-window arrow, then the large
 * trend below.
 */
export interface ProductionChartCardProps {
  title: string;
  variant: ProductionGlyphVariant;
  value: number;
  unit: string;
  /** Formatted value (number of decimals depends on variable). */
  valueLabel: string;
  /** Delta vs. start of the window, as a percentage. */
  deltaPct: number;
  /** Series rendered as the chart line. */
  data: readonly number[];
  /** Color of the chart line + delta accent. */
  color: string;
  areaColor: string;
  /** Footer label shown under the chart line. */
  legendLabel: string;
  /** Time-axis labels (5 ticks typical). */
  xTicks: readonly string[];
  className?: string;
}

export const ProductionChartCard = ({
  title,
  variant,
  unit,
  valueLabel,
  deltaPct,
  data,
  color,
  areaColor,
  legendLabel,
  xTicks,
  className,
}: ProductionChartCardProps) => {
  return (
    <article
      className={cn(
        'bg-surface border border-border-subtle rounded-sm p-5 flex flex-col gap-4 min-w-0',
        className,
      )}
      aria-label={title}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <ProductionGlyph variant={variant} size={40} />
          <div className="min-w-0">
            <div className="text-micro uppercase tracking-micro text-text-muted">{title}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-display font-semibold text-text-primary tabular-nums leading-tight">
                {valueLabel}
              </span>
              <span className="text-sm text-text-secondary">{unit}</span>
            </div>
          </div>
        </div>
        <DeltaPill deltaPct={deltaPct} />
      </header>

      <PortalProductionChart
        data={data}
        unit={unit}
        legendLabel={legendLabel}
        color={color}
        areaColor={areaColor}
        xTicks={xTicks}
        height={180}
      />
    </article>
  );
};

const DeltaPill = ({ deltaPct }: { deltaPct: number }) => {
  const sign = deltaPct >= 0 ? '+' : '−';
  const magnitude = Math.abs(deltaPct);
  const tone = deltaPct >= 0 ? 'text-status-normal' : 'text-status-warn';
  const arrow = deltaPct >= 0 ? '▲' : '▼';
  return (
    <span
      className={cn(
        'shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums',
        tone,
      )}
    >
      <span aria-hidden="true">{arrow}</span>
      <span>
        {sign}
        {magnitude.toFixed(1)} %
      </span>
    </span>
  );
};
