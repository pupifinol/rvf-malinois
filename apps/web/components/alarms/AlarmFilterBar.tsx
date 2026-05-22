'use client';

import { cn } from '@rvf/ui';

import { ALARM_TABS, type AlarmTab } from './data/alarms.mock';

/**
 * AlarmFilterBar — operational filter row above the active alarms table.
 *
 * Composition:
 *   - Tabs that span state + priority dimensions (ALL / ACTIVE / ACKED /
 *     CLEARED / URGENT / HIGH / MEDIUM / LOW). One row, segmented, the
 *     same chip language used on `/units` and `/sensors`.
 *   - Three subtle `<select>` dropdowns for Units / Sources / States.
 *   - A muted "Clear filters" link that only appears when something is
 *     filtered.
 *
 * All controls are controlled — the page owns state. This keeps the bar
 * dumb and reusable across the active + history tables.
 */
export interface AlarmFilterBarProps {
  tab: AlarmTab;
  onTabChange: (next: AlarmTab) => void;

  units: readonly string[];
  unit: string;
  onUnitChange: (next: string) => void;

  sources: readonly string[];
  source: string;
  onSourceChange: (next: string) => void;

  states: readonly string[];
  state: string;
  onStateChange: (next: string) => void;

  onClearFilters: () => void;
}

export const AlarmFilterBar = ({
  tab,
  onTabChange,
  units,
  unit,
  onUnitChange,
  sources,
  source,
  onSourceChange,
  states,
  state,
  onStateChange,
  onClearFilters,
}: AlarmFilterBarProps) => {
  const anyFilterActive = unit !== 'ALL' || source !== 'ALL' || state !== 'ALL';

  return (
    <section className="flex flex-col gap-1.5" aria-label="Alarm filters">
      {/* Tabs — segmented control. Tighter than a dashboard tab strip;
          active tab carries a 2-px bottom inset stroke so it reads as
          a depressed pushbutton, not a hover link. */}
      <div
        role="tablist"
        aria-label="Alarm queue"
        className="flex items-stretch border border-border-subtle rounded-xs overflow-hidden flex-wrap bg-surface"
      >
        {ALARM_TABS.map((t, i) => {
          const isActive = t === tab;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(t)}
              className={cn(
                'flex-1 min-w-0 px-3 py-1.5 text-micro uppercase tracking-micro font-semibold transition-colors duration-fast ease-industrial',
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

      {/* Dropdown filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterSelect
          label="Unit"
          value={unit}
          onChange={onUnitChange}
          options={[
            { value: 'ALL', label: 'All units' },
            ...units.map((u) => ({ value: u, label: u })),
          ]}
        />
        <FilterSelect
          label="Source"
          value={source}
          onChange={onSourceChange}
          options={[
            { value: 'ALL', label: 'Any source' },
            ...sources.map((s) => ({ value: s, label: s })),
          ]}
        />
        <FilterSelect
          label="State"
          value={state}
          onChange={onStateChange}
          options={[
            { value: 'ALL', label: 'Any state' },
            ...states.map((s) => ({
              value: s,
              label: s.charAt(0) + s.slice(1).toLowerCase(),
            })),
          ]}
        />
        {anyFilterActive && (
          <button
            type="button"
            className="ml-auto text-micro uppercase tracking-micro text-text-muted hover:text-text-primary transition-colors duration-fast"
            onClick={onClearFilters}
          >
            Clear filters
          </button>
        )}
      </div>
    </section>
  );
};

const FilterSelect = ({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
}) => {
  const active = value !== 'ALL';
  return (
    <label className="inline-flex items-center gap-1.5 text-micro uppercase tracking-micro text-text-muted">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'bg-canvas border border-border-subtle rounded-xs px-2 py-1',
          'text-micro uppercase tracking-micro font-semibold text-text-primary font-mono',
          'focus:outline-none focus-visible:border-border-focus',
          'cursor-pointer hover:border-border-strong transition-colors duration-fast',
          active ? 'border-l-2 border-l-brand-accent' : '',
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
};
