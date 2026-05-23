import { cn } from '@rvf/ui';

import { SETTINGS_NAV, type SettingsSectionId } from './data/settings.mock';

/**
 * SettingsNav — slim industrial mini-nav for the configuration sections.
 *
 * Renders as a single horizontal segmented control above the main
 * configuration stack. Same chip-pushbutton language as the alarm
 * filter tabs and the unit selector — wide enough to communicate that
 * the platform has eight first-class configuration domains, tight
 * enough that it never competes with the section panels themselves.
 *
 * The active state is static in F2; the harness still renders anchor
 * links so keyboard navigation jumps to the matching section header.
 */
export interface SettingsNavProps {
  active: SettingsSectionId;
}

export const SettingsNav = ({ active }: SettingsNavProps) => (
  <nav
    aria-label="Configuration sections"
    className="bg-surface border border-border-subtle rounded-sm"
  >
    <ul className="flex items-stretch flex-wrap">
      {SETTINGS_NAV.map((item, i) => {
        const isActive = item.id === active;
        return (
          <li
            key={item.id}
            className={cn('flex-1 min-w-[120px]', i > 0 ? 'border-l border-border-subtle' : '')}
          >
            <a
              href={`#section-${item.id}`}
              aria-current={isActive ? 'true' : undefined}
              className={cn(
                'flex items-center justify-between gap-2 px-3 py-2 leading-none',
                'transition-colors duration-fast ease-industrial',
                'focus:outline-none focus-visible:bg-surface-raised',
                isActive
                  ? cn(
                      'bg-brand-primary text-text-on-accent',
                      'shadow-[inset_0_-2px_0_0_var(--brand-accent)]',
                    )
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised',
              )}
            >
              <span className="text-micro uppercase tracking-micro font-bold truncate">
                {item.label}
              </span>
              <span
                className={cn(
                  'font-mono text-micro tabular-nums shrink-0',
                  isActive ? 'text-text-on-accent/80' : 'text-text-muted',
                )}
              >
                {item.count.toString().padStart(2, '0')}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  </nav>
);
