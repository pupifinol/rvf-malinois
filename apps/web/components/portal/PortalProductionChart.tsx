import { cn } from '@rvf/ui';

/**
 * PortalProductionChart — large, single-variable trend chart for the
 * Client Portal. Soft area fill + line, faint gridlines, time labels at the
 * bottom, no axis crosshair. The protagonist of the page (oil, gas, water
 * cut), so it is sized generously and stripped of any control-room chrome.
 *
 * Pure SVG by design — keeps bundle size honest and matches the discipline
 * of operations/TrendChart, but uses softer fills and clearer X labels for
 * a customer-facing surface.
 */
export interface PortalProductionChartProps {
  /** Time-series of equally spaced samples covering the visible window. */
  data: readonly number[];
  /** Engineering unit, rendered in the floor caption and legend (`bbl/d`). */
  unit: string;
  /** Legend label rendered under the chart, e.g. `Oil (bbl/d)`. */
  legendLabel: string;
  /** Line/area color (CSS color or var). */
  color: string;
  /** Fill color for the area under the line (CSS color or var). */
  areaColor: string;
  /** Number of evenly spaced X-axis labels to render. */
  xTicks?: readonly string[];
  height?: number;
  className?: string;
}

const PADDING = { top: 10, right: 10, bottom: 24, left: 40 } as const;
const VB_WIDTH = 1000;
const Y_TICKS = 4;

export const PortalProductionChart = ({
  data,
  unit,
  legendLabel,
  color,
  areaColor,
  xTicks,
  height = 200,
  className,
}: PortalProductionChartProps) => {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Chart
        data={data}
        height={height}
        color={color}
        areaColor={areaColor}
        xTicks={xTicks ?? defaultXTicks(data.length)}
      />
      <Legend label={legendLabel} unit={unit} color={color} />
    </div>
  );
};

const Chart = ({
  data,
  height,
  color,
  areaColor,
  xTicks,
}: {
  data: readonly number[];
  height: number;
  color: string;
  areaColor: string;
  xTicks: readonly string[];
}) => {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-text-muted border border-border-subtle rounded-sm"
        style={{ height }}
      >
        No production data yet
      </div>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const pad = (max - min) * 0.15 || Math.max(Math.abs(max), 1) * 0.05;
  const yMin = Math.max(0, min - pad);
  const yMax = max + pad;
  const range = yMax - yMin || 1;

  const plotW = VB_WIDTH - PADDING.left - PADDING.right;
  const plotH = height - PADDING.top - PADDING.bottom;

  const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;

  const projected = data.map((v, i) => {
    const x = PADDING.left + i * stepX;
    const y = PADDING.top + plotH - ((v - yMin) / range) * plotH;
    return { x, y };
  });

  const linePath = projected
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');

  const areaPath = `${linePath} L ${(PADDING.left + plotW).toFixed(2)} ${
    PADDING.top + plotH
  } L ${PADDING.left.toFixed(2)} ${PADDING.top + plotH} Z`;

  const yTickValues = Array.from({ length: Y_TICKS + 1 }, (_, i) => yMin + (range * i) / Y_TICKS);

  const xTickPositions = xTicks.map((_, i) => {
    if (xTicks.length === 1) return PADDING.left + plotW / 2;
    return PADDING.left + (plotW * i) / (xTicks.length - 1);
  });

  return (
    <svg
      viewBox={`0 0 ${VB_WIDTH} ${height}`}
      preserveAspectRatio="none"
      className="w-full block"
      style={{ height }}
      role="img"
      aria-hidden="true"
    >
      {/* Horizontal gridlines + Y labels */}
      {yTickValues.map((v, i) => {
        const y = PADDING.top + plotH - ((v - yMin) / range) * plotH;
        const isAxis = i === 0;
        return (
          <g key={`y-${i}`}>
            <line
              x1={PADDING.left}
              y1={y}
              x2={VB_WIDTH - PADDING.right}
              y2={y}
              stroke="var(--border-subtle)"
              strokeWidth={1}
              strokeDasharray={isAxis ? undefined : '2 4'}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={PADDING.left - 8}
              y={y + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--text-muted)"
              fontFamily="var(--font-mono)"
            >
              {formatTick(v)}
            </text>
          </g>
        );
      })}

      {/* Area fill */}
      <path d={areaPath} fill={areaColor} />

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />

      {/* X tick labels */}
      {xTicks.map((label, i) => (
        <text
          key={`x-${i}`}
          x={xTickPositions[i]}
          y={height - 6}
          textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
          fontSize="11"
          fill="var(--text-muted)"
          fontFamily="var(--font-mono)"
        >
          {label}
        </text>
      ))}
    </svg>
  );
};

const Legend = ({ label, unit, color }: { label: string; unit: string; color: string }) => (
  <div className="flex items-center justify-center gap-2 pt-1">
    <span aria-hidden="true" className="inline-block w-3 h-0.5" style={{ background: color }} />
    <span className="text-xs text-text-secondary tracking-wide">
      {label} ({unit})
    </span>
  </div>
);

const formatTick = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toFixed(0);
  if (abs >= 100) return v.toFixed(0);
  if (abs >= 10) return v.toFixed(1);
  return v.toFixed(2);
};

const defaultXTicks = (n: number): readonly string[] => {
  if (n === 0) return [];
  return ['', '', '', '', ''];
};
