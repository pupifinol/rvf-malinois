'use client';

import { cn } from '@rvf/ui';

import type { UnitTwin } from './data/twin.mock';

/**
 * UnitSelector — compact segmented selector that lives in the operational
 * header on /units. Mirrors the bordered chip language of `StatusChip` so
 * it sits naturally next to the existing PageHeader chips.
 *
 * Data shape:
 *   - The component is dumb. It receives `units` + `activeId` + `onSelect`.
 *   - When wired to live data (F2), the page replaces the static `twins`
 *     mock with the WebSocket-driven list — no changes here.
 *
 * Behavior:
 *   - Always renders the full unit list as buttons; the active one is
 *     filled, the rest are outlined. Operator always sees the full fleet
 *     at a glance, no dropdown chevron required.
 *   - Wide screens get the full label ("Multiphase Unit #1"); narrow
 *     screens fall back to "U1" via the secondary span so the selector
 *     never wraps.
 */
export interface UnitSelectorProps {
  units: readonly UnitTwin[];
  activeId: string;
  onSelect: (id: string) => void;
}

export const UnitSelector = ({ units, activeId, onSelect }: UnitSelectorProps) => (
  <div
    role="tablist"
    aria-label="Active unit"
    className="inline-flex items-stretch border border-border-subtle rounded-xs overflow-hidden"
  >
    {units.map((u, i) => {
      const isActive = u.id === activeId;
      return (
        <button
          key={u.id}
          type="button"
          role="tab"
          aria-selected={isActive}
          onClick={() => onSelect(u.id)}
          className={cn(
            'px-3 py-1 text-micro uppercase tracking-micro font-semibold transition-colors duration-fast ease-industrial',
            'focus:outline-none focus-visible:bg-surface-raised',
            i > 0 ? 'border-l border-border-subtle' : '',
            isActive
              ? 'bg-brand-primary text-text-on-accent'
              : 'bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-raised',
          )}
        >
          <span className="hidden sm:inline">Multiphase Unit #{u.unitNumber}</span>
          <span className="sm:hidden font-mono">U{u.unitNumber}</span>
        </button>
      );
    })}
  </div>
);
