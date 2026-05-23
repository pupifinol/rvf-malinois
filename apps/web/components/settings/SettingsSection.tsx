import { cn } from '@rvf/ui';

import type { ReactNode } from 'react';

/**
 * SettingsSection — titled configuration band rendered inside the main
 * settings column. Visually a Panel-grade surface, but the title strip
 * is enriched with a small section tag (e.g. "§ DISPLAY") so the
 * column reads as an organized configuration manifest rather than a
 * stack of generic cards.
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ § 01 · DISPLAY                       6 settings · synced   │
 *   │ ─────────────────────────────────────────────────────────  │
 *   │ <rows>                                                     │
 *   └────────────────────────────────────────────────────────────┘
 */
export interface SettingsSectionProps {
  /** Two-digit ordinal rendered before the title (e.g. "01"). */
  ordinal: string;
  title: string;
  /** Optional short subtitle below the title strip. */
  subtitle?: string;
  /** Optional one-line helper sentence rendered as a muted band below
   *  the title strip. Use for guidance that doesn't fit the inline
   *  micro-uppercase subtitle (e.g. "Platform-wide default thresholds.
   *  Unit-specific limits override these defaults."). */
  description?: ReactNode;
  /** Right-aligned meta text (e.g. "6 settings · synced"). */
  meta?: ReactNode;
  /** Anchor id so the mini-nav can scroll to this section. */
  anchorId?: string;
  className?: string;
  children: ReactNode;
}

export const SettingsSection = ({
  ordinal,
  title,
  subtitle,
  description,
  meta,
  anchorId,
  className,
  children,
}: SettingsSectionProps) => (
  <section
    id={anchorId}
    aria-label={title}
    className={cn(
      'bg-surface border border-border-subtle rounded-sm flex flex-col scroll-mt-4',
      className,
    )}
  >
    <header className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border-subtle">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-micro uppercase tracking-micro text-text-muted shrink-0">
          § {ordinal}
        </span>
        <span aria-hidden="true" className="h-3 w-px bg-border-subtle shrink-0" />
        <h2 className="text-micro uppercase tracking-wide font-bold text-text-primary truncate">
          {title}
        </h2>
        {subtitle ? (
          <span className="text-micro uppercase tracking-micro text-text-muted truncate hidden sm:inline">
            · {subtitle}
          </span>
        ) : null}
      </div>
      {meta ? (
        <div className="text-micro uppercase tracking-micro text-text-muted font-mono tabular-nums shrink-0">
          {meta}
        </div>
      ) : null}
    </header>
    {description ? (
      <p className="px-3 py-1.5 text-xs text-text-secondary border-b border-border-subtle bg-canvas/40">
        {description}
      </p>
    ) : null}
    <ul className="flex flex-col">{children}</ul>
  </section>
);
