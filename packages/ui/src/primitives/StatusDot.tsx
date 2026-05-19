import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '../utils/cn';

/**
 * StatusDot — the SINGLE point of truth for state-color semantics.
 *
 * Every screen that wants to show "this thing is in alarm / warning / stale"
 * uses this primitive. Centralizing it guarantees that the rule from
 * docs/ui/industrial-design-system.md §3 ("one color, one meaning, always")
 * cannot be broken by accident.
 *
 * In the normal state the dot is muted — health is communicated by the
 * ABSENCE of color, not by a sea of green (ISA-101).
 */
export type StatusKind = 'normal' | 'warn' | 'alarm' | 'critical' | 'stale' | 'info';
export type StatusSize = 'sm' | 'md' | 'lg';

export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  kind: StatusKind;
  size?: StatusSize;
  /** Optional textual label, rendered to the right of the dot. */
  label?: string;
  /** Forces an accessible name when no visible label is provided. */
  'aria-label'?: string;
}

const dotColorClass: Record<StatusKind, string> = {
  normal: 'bg-status-normal',
  warn: 'bg-status-warn',
  alarm: 'bg-status-alarm',
  critical: 'bg-status-critical',
  stale: 'bg-status-stale',
  info: 'bg-status-info',
};

const dotSizeClass: Record<StatusSize, string> = {
  sm: 'w-2 h-2',
  md: 'w-3 h-3',
  lg: 'w-4 h-4',
};

export const StatusDot = forwardRef<HTMLSpanElement, StatusDotProps>(function StatusDot(
  { kind, size = 'md', label, className, ...rest },
  ref,
) {
  const dot = (
    <span
      className={cn('inline-block rounded-full shrink-0', dotColorClass[kind], dotSizeClass[size])}
      aria-hidden={label ? 'true' : undefined}
    />
  );

  if (label) {
    return (
      <span
        ref={ref}
        className={cn('inline-flex items-center gap-2 text-text-primary', className)}
        {...rest}
      >
        {dot}
        <span className="text-sm">{label}</span>
      </span>
    );
  }

  return (
    <span
      ref={ref}
      role="status"
      className={cn('inline-block', className)}
      aria-label={rest['aria-label'] ?? `Status: ${kind}`}
      {...rest}
    >
      {dot}
    </span>
  );
});
