import { Gauge } from 'lucide-react';

import type { ProcessVariable } from './data/twin.mock';

import { Sparkline } from '@/components/operations/Sparkline';

/**
 * LinePressureCard — emphasised single-value card directly under the
 * diagram. Highlights the most safety-critical reading on the unit
 * (vessel line pressure) without breaking the visual rhythm.
 */
export const LinePressureCard = ({ variable }: { variable: ProcessVariable }) => (
  <div className="flex items-center gap-4 bg-surface border border-border-subtle rounded-sm p-4 border-l-2 border-l-status-info">
    <Gauge className="w-7 h-7 text-status-info shrink-0" aria-hidden="true" />
    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
      <span className="text-micro uppercase tracking-wide font-bold text-text-secondary flex items-center gap-2">
        Line Pressure
        {variable.tag ? (
          <span className="font-mono text-text-muted tracking-micro">· {variable.tag}</span>
        ) : null}
      </span>
      <div className="flex items-baseline gap-1.5 leading-none">
        <span className="text-3xl font-bold tabular-nums text-text-primary leading-none">
          {variable.value.toLocaleString('en-US')}
        </span>
        <span className="text-xs text-text-muted tabular-nums">{variable.unit}</span>
      </div>
    </div>
    <Sparkline
      data={variable.history}
      height={36}
      width={120}
      strokeWidth={1.2}
      className="text-status-info opacity-80 shrink-0"
    />
  </div>
);
