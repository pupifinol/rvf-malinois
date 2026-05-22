/**
 * CompositionBars — separator composition (gas / oil / water %).
 *
 * Three stacked horizontal bars, each labeled with phase + percentage.
 * Solid fills, no gradient, no decoration; the bar widths are the
 * communication device. Uses the same phase colors as the diagram —
 * gas = yellow, oil = dark, water = blue.
 */
export interface CompositionBarsProps {
  composition: { oilPct: number; waterPct: number; gasPct: number };
}

export const CompositionBars = ({ composition }: CompositionBarsProps) => (
  <div className="flex flex-col gap-2 bg-surface border border-border-subtle rounded-sm p-3">
    <h3 className="text-micro uppercase tracking-wide font-bold text-text-primary">
      Composición del Separador
    </h3>
    <Bar label="Gas" pct={composition.gasPct} fill="bg-phase-gas" />
    <Bar label="Crude / Oil" pct={composition.oilPct} fill="bg-phase-oil" ringed />
    <Bar label="Water" pct={composition.waterPct} fill="bg-phase-water" />
  </div>
);

const Bar = ({
  label,
  pct,
  fill,
  ringed = false,
}: {
  label: string;
  pct: number;
  fill: string;
  /** Outline the bar — used for oil/crude which is nearly black on dark canvas. */
  ringed?: boolean;
}) => (
  <div className="flex flex-col gap-0.5">
    <div className="flex items-baseline justify-between">
      <span className="text-micro uppercase tracking-micro font-semibold text-text-secondary">
        {label}
      </span>
      <span className="text-xs font-mono tabular-nums text-text-primary">{pct.toFixed(1)}%</span>
    </div>
    <div className="h-2 bg-surface-raised rounded-xs overflow-hidden border border-border-subtle">
      <div
        className={`${fill} h-full transition-all duration-base ease-industrial ${
          ringed ? 'border border-border-strong' : ''
        }`}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  </div>
);
