import type { ReactNode } from 'react';

/**
 * PageHeader — the canonical title strip used on every operational surface.
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ <H1 BOLD UPPERCASE>                  <right slot — chips>   │
 *   │ <subtitle, secondary text>                                  │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Visual baseline lives on /operations. Re-using this guarantees every
 * future surface (units, sensors, alarms, reports, settings) opens with
 * the same hierarchy and typographic discipline.
 */
export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /**
   * Right-aligned slot for small bordered chips (counts, status, last-saved).
   * The Operations Console uses two chips here ("N Active Units",
   * "All Systems Nominal"); other surfaces follow the same pattern.
   */
  right?: ReactNode;
}

export const PageHeader = ({ title, subtitle, right }: PageHeaderProps) => (
  <header className="flex items-end justify-between flex-wrap gap-3">
    <div className="min-w-0">
      <h1 className="text-lg font-bold tracking-tight uppercase text-text-primary">{title}</h1>
      {subtitle ? <p className="text-sm text-text-secondary">{subtitle}</p> : null}
    </div>
    {right ? (
      <div className="flex items-center gap-2 text-micro uppercase tracking-micro font-semibold">
        {right}
      </div>
    ) : null}
  </header>
);

/**
 * StatusChip — small bordered chip used inside PageHeader.right and inline
 * across surfaces. Stays neutral by default; pass `tone` to color the text
 * + the small leading dot.
 */
export interface StatusChipProps {
  /** Visible label (rendered uppercase via tracking-micro). */
  children: ReactNode;
  /** Tone determines text + dot color. Default = neutral. */
  tone?: 'neutral' | 'normal' | 'warn' | 'alarm' | 'info' | 'stale';
  /** Whether the leading dot is shown. Default true for non-neutral. */
  dot?: boolean;
}

const toneTextClass: Record<NonNullable<StatusChipProps['tone']>, string> = {
  neutral: 'text-text-secondary',
  normal: 'text-status-normal',
  warn: 'text-status-warn',
  alarm: 'text-status-alarm',
  info: 'text-status-info',
  stale: 'text-status-stale',
};

const toneDotClass: Record<NonNullable<StatusChipProps['tone']>, string> = {
  neutral: 'bg-text-secondary',
  normal: 'bg-status-normal',
  warn: 'bg-status-warn',
  alarm: 'bg-status-alarm',
  info: 'bg-status-info',
  stale: 'bg-status-stale',
};

export const StatusChip = ({ children, tone = 'neutral', dot }: StatusChipProps) => {
  const showDot = dot ?? tone !== 'neutral';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 border border-border-subtle rounded-xs tabular-nums ${toneTextClass[tone]}`}
    >
      {showDot ? (
        <span
          aria-hidden="true"
          className={`inline-block w-1.5 h-1.5 rounded-full ${toneDotClass[tone]}`}
        />
      ) : null}
      {children}
    </span>
  );
};
