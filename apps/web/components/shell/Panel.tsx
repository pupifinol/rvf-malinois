import { cn } from '@rvf/ui';

import type { ReactNode } from 'react';

/**
 * Panel — the canonical titled section container. Used on every surface
 * for right-rail boxes, grouped settings, and any "this is a labeled block"
 * region. The visual treatment (matte surface, 1 px subtle border, micro
 * uppercase bold title, optional right-aligned meta slot) is the platform's
 * baseline language.
 *
 *   ┌────────────────────────────────────────────────────────┐
 *   │ SECTION TITLE                              meta/count  │
 *   │                                                        │
 *   │ <body>                                                 │
 *   └────────────────────────────────────────────────────────┘
 */
export interface PanelProps {
  title: string;
  /** Right-aligned slot in the header (count, last-updated, legend). */
  meta?: ReactNode;
  /** Accessible label override. Defaults to the title. */
  'aria-label'?: string;
  /** Padding scale. `compact` is used inside dense tables. */
  density?: 'comfortable' | 'compact';
  className?: string;
  children: ReactNode;
}

export const Panel = ({
  title,
  meta,
  density = 'comfortable',
  className,
  children,
  ...rest
}: PanelProps) => (
  <section
    aria-label={rest['aria-label'] ?? title}
    className={cn(
      'bg-surface border border-border-subtle rounded-sm flex flex-col gap-3',
      density === 'compact' ? 'p-3' : 'p-4',
      className,
    )}
  >
    <header className="flex items-center justify-between gap-3">
      <h2 className="text-micro uppercase tracking-wide font-bold text-text-primary">{title}</h2>
      {meta ? <div className="text-xs text-text-muted tabular-nums">{meta}</div> : null}
    </header>
    {children}
  </section>
);
