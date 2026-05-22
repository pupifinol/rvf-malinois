import { cn } from '@rvf/ui';

/**
 * TrendChart — restrained, multi-series SVG line chart for the
 * "Live Trends" panel. Two or more series share a single Y axis; the chart
 * is unitless on screen because the panel's title carries the variable
 * name + engineering units (ISA-101 §7).
 *
 * Pure SVG by design — the project has no chart library installed, and a
 * trend strip in a SCADA UI must not pull in a 200 kB dependency.
 */
export interface TrendSeries {
  name: string;
  color: string;
  data: readonly number[];
}

export interface TrendChartProps {
  series: readonly TrendSeries[];
  height?: number;
  yTicks?: number;
  className?: string;
}

const PADDING = { top: 8, right: 8, bottom: 18, left: 36 } as const;

export const TrendChart = ({ series, height = 140, yTicks = 4, className }: TrendChartProps) => {
  const allValues = series.flatMap((s) => s.data);
  if (allValues.length === 0) {
    return (
      <div
        className={cn('flex items-center justify-center text-xs text-text-muted', className)}
        style={{ height }}
      >
        No data
      </div>
    );
  }

  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  // viewBox is fluid in X via preserveAspectRatio='none'; we lay out using
  // a 1000-wide coordinate system so paths look correct at any container width.
  const vbWidth = 1000;
  const vbHeight = height;
  const plotW = vbWidth - PADDING.left - PADDING.right;
  const plotH = vbHeight - PADDING.top - PADDING.bottom;

  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => {
    return min + (range * i) / yTicks;
  });

  return (
    <svg
      viewBox={`0 0 ${vbWidth} ${vbHeight}`}
      preserveAspectRatio="none"
      className={cn('w-full block', className)}
      style={{ height }}
      aria-hidden="true"
    >
      {/* Gridlines + Y-axis labels */}
      {yTickValues.map((v, i) => {
        const y = PADDING.top + plotH - ((v - min) / range) * plotH;
        return (
          <g key={i}>
            <line
              x1={PADDING.left}
              y1={y}
              x2={vbWidth - PADDING.right}
              y2={y}
              stroke="var(--border-subtle)"
              strokeWidth={1}
              strokeDasharray={i === 0 || i === yTicks ? undefined : '2 4'}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={PADDING.left - 6}
              y={y + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--text-secondary)"
              fontFamily="var(--font-mono)"
            >
              {formatTick(v)}
            </text>
          </g>
        );
      })}

      {/* Series lines */}
      {series.map((s) => {
        if (s.data.length === 0) return null;
        const stepX = s.data.length > 1 ? plotW / (s.data.length - 1) : 0;
        const points = s.data
          .map((v, i) => {
            const x = PADDING.left + i * stepX;
            const y = PADDING.top + plotH - ((v - min) / range) * plotH;
            return `${x.toFixed(2)},${y.toFixed(2)}`;
          })
          .join(' ');
        return (
          <polyline
            key={s.name}
            points={points}
            fill="none"
            stroke={s.color}
            strokeWidth={1.6}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
};

const formatTick = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toFixed(0);
  if (abs >= 10) return v.toFixed(1);
  return v.toFixed(2);
};
