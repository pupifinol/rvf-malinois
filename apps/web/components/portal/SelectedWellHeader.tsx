'use client';

import { StatusDot, cn } from '@rvf/ui';

import type { PortalWell, PortalWellStatus, ProductionSeriesSpan } from './data/clientPortal.mock';

/**
 * SelectedWellHeader — sits above the three protagonist charts. Identifies
 * which well the charts focus on and exposes the time-range tabs used by
 * the chart row.
 */
export interface SelectedWellHeaderProps {
  well: PortalWell;
  spans: readonly ProductionSeriesSpan[];
  activeSpan: ProductionSeriesSpan['label'];
  onSelectSpan: (label: ProductionSeriesSpan['label']) => void;
}

const STATUS_LABEL: Record<PortalWellStatus, string> = {
  TESTING: 'Testing',
  ACTIVE: 'Active',
  STABILIZING: 'Stabilizing',
};

export const SelectedWellHeader = ({
  well,
  spans,
  activeSpan,
  onSelectSpan,
}: SelectedWellHeaderProps) => {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <h2 className="text-lg font-semibold text-text-primary truncate">{well.name}</h2>
        <span className="text-sm text-text-secondary truncate">{well.jobLabel}</span>
        <StatusDot
          kind={well.status === 'TESTING' ? 'normal' : 'info'}
          size="sm"
          label={STATUS_LABEL[well.status]}
          className="text-text-secondary"
        />
      </div>
      <div
        role="tablist"
        aria-label="Trend range"
        className="inline-flex items-center bg-surface border border-border-subtle rounded-sm p-0.5"
      >
        {spans.map((span) => {
          const isActive = span.label === activeSpan;
          return (
            <button
              key={span.label}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelectSpan(span.label)}
              className={cn(
                'min-w-[44px] px-3 py-1 text-xs font-semibold rounded-xs transition-colors duration-fast ease-industrial',
                isActive
                  ? 'bg-brand-primary text-text-on-accent'
                  : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {span.label}
            </button>
          );
        })}
      </div>
    </header>
  );
};
