'use client';

import { StatusDot, cn } from '@rvf/ui';

import { ProductionGlyph } from './ProductionGlyph';

import type { PortalWell, PortalWellStatus } from './data/clientPortal.mock';

/**
 * WellOverviewCard — compact, customer-friendly summary of a single well.
 *
 * Used in the top "wells overview" strip of the Client Portal. Each card is
 * a button so the client can pick which well the main charts focus on.
 * Selection is communicated by a small check mark and a brand-colored left
 * accent border — never by flooding the card with color (ISA-101 carries
 * over even to the customer surface: color stays a meaning signal).
 */
export interface WellOverviewCardProps {
  well: PortalWell;
  selected?: boolean;
  onSelect?: (wellId: string) => void;
  updatedLabel?: string;
}

const STATUS_LABEL: Record<PortalWellStatus, string> = {
  TESTING: 'Testing',
  ACTIVE: 'Active',
  STABILIZING: 'Stabilizing',
};

export const WellOverviewCard = ({
  well,
  selected = false,
  onSelect,
  updatedLabel = 'Last update: 30 sec ago',
}: WellOverviewCardProps) => {
  const handleClick = () => onSelect?.(well.id);

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={selected}
      className={cn(
        'group text-left bg-surface border border-border-subtle rounded-sm p-5 flex flex-col gap-4',
        'transition-colors duration-base ease-industrial',
        'hover:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
        selected && 'border-l-2 border-l-brand-primary',
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h3 className="text-md font-semibold text-text-primary truncate">{well.name}</h3>
            <span className="text-xs text-text-muted truncate">{well.jobLabel}</span>
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs text-text-secondary">
            <StatusDot
              kind={well.status === 'TESTING' ? 'normal' : 'info'}
              size="sm"
              label={STATUS_LABEL[well.status]}
              className="text-text-secondary"
            />
            <span aria-hidden="true" className="text-text-muted">
              ·
            </span>
            <span className="text-text-muted">{updatedLabel}</span>
          </div>
        </div>
        <SelectionMark selected={selected} />
      </header>

      <div className="grid grid-cols-3 gap-3">
        <MicroStat
          variant="oil"
          value={well.oil.value}
          unit={well.oil.unit}
          format={(v) => formatNumber(v, 0)}
        />
        <MicroStat
          variant="gas"
          value={well.gas.value}
          unit={well.gas.unit}
          format={(v) => formatNumber(v, 2)}
        />
        <MicroStat
          variant="waterCut"
          value={well.waterCut.value}
          unit={well.waterCut.unit}
          format={(v) => formatNumber(v, 1)}
        />
      </div>
    </button>
  );
};

const MicroStat = ({
  variant,
  value,
  unit,
  format,
}: {
  variant: 'oil' | 'gas' | 'waterCut';
  value: number;
  unit: string;
  format: (v: number) => string;
}) => (
  <div className="flex items-center gap-2 min-w-0">
    <ProductionGlyph variant={variant} className="shrink-0" />
    <div className="min-w-0">
      <div className="text-base font-semibold text-text-primary tabular-nums leading-tight">
        {format(value)}
      </div>
      <div className="text-micro uppercase tracking-micro text-text-muted truncate">{unit}</div>
    </div>
  </div>
);

const SelectionMark = ({ selected }: { selected: boolean }) => (
  <span
    aria-hidden="true"
    className={cn(
      'shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full border transition-colors duration-base',
      selected
        ? 'bg-brand-primary border-brand-primary text-text-on-accent'
        : 'border-border-subtle text-transparent group-hover:border-border-strong',
    )}
  >
    <svg
      viewBox="0 0 12 12"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="2.5,6.5 5,9 9.5,3.5" />
    </svg>
  </span>
);

const formatNumber = (v: number, digits: number): string =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
