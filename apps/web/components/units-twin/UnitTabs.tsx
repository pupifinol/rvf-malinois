'use client';

import { cn } from '@rvf/ui';

/**
 * UnitTabs — slim industrial tab strip for the unit screen.
 *
 * Same chip-pushbutton language as the alarm filter bar and the
 * settings mini-nav. The harness only renders the Overview view in
 * F2; the remaining tabs are visible-but-inert scaffolding so the
 * page communicates that a multiphase unit has multiple operational
 * views (process, sensors, alarms, configuration) — not just a
 * single dashboard.
 */
export const UNIT_TABS = ['Overview', 'Process', 'Sensors', 'Alarms', 'Configuration'] as const;
export type UnitTab = (typeof UNIT_TABS)[number];

export interface UnitTabsProps {
  active: UnitTab;
  onSelect?: (tab: UnitTab) => void;
}

export const UnitTabs = ({ active, onSelect }: UnitTabsProps) => (
  <div
    role="tablist"
    aria-label="Unit views"
    className="flex items-stretch border border-border-subtle rounded-sm overflow-hidden bg-surface flex-wrap"
  >
    {UNIT_TABS.map((t, i) => {
      const isActive = t === active;
      return (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={isActive}
          onClick={() => onSelect?.(t)}
          className={cn(
            'flex-1 min-w-[120px] px-3 py-1.5 text-micro uppercase tracking-micro font-bold leading-none',
            'transition-colors duration-fast ease-industrial',
            'focus:outline-none focus-visible:bg-surface-raised',
            i > 0 ? 'border-l border-border-subtle' : '',
            isActive
              ? cn(
                  'bg-brand-primary text-text-on-accent',
                  'shadow-[inset_0_-2px_0_0_var(--brand-accent)]',
                )
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised',
          )}
        >
          {t}
        </button>
      );
    })}
  </div>
);
