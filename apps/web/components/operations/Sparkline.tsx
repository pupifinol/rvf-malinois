import { cn } from '@rvf/ui';

/**
 * Sparkline — minimal SVG trend indicator for variable tiles.
 *
 * ISA-101 style: no axes, no grid, no labels. Just a line that lets the
 * operator see at a glance whether the variable is trending up, down, or
 * stable. The line uses currentColor so callers can theme it via Tailwind
 * (e.g. `text-series-1`, `text-status-warn`).
 *
 * Resilient to short series, flat series, and series with a single value.
 */
export interface SparklineProps {
  data: readonly number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  className?: string;
}

export const Sparkline = ({
  data,
  width = 140,
  height = 36,
  strokeWidth = 1.5,
  className,
}: SparklineProps) => {
  if (data.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={cn('text-text-muted', className)}
        aria-hidden="true"
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray="2 2"
        />
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;

  const points = data
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('text-series-1', className)}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
};
