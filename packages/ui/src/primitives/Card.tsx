import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '../utils/cn';

/**
 * Card — base container primitive.
 *
 * Industrial discipline: separation is by 1 px border, NEVER by drop shadow.
 * The card stays flat. State is communicated by a small dot or a single 2 px
 * accent border, never by painting the whole card.
 *
 * docs/ui/industrial-design-system.md §13
 */
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional accent border to indicate the card represents an abnormal state. */
  accent?: 'normal' | 'warn' | 'alarm' | 'critical' | 'stale';
  /** Reduces padding for dense control-room contexts. */
  density?: 'comfortable' | 'compact';
}

const accentBorderClass: Record<NonNullable<CardProps['accent']>, string> = {
  normal: '',
  warn: 'border-l-2 border-l-status-warn',
  alarm: 'border-l-2 border-l-status-alarm',
  critical: 'border-l-2 border-l-status-critical',
  stale: 'border-l-2 border-l-status-stale',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, accent, density = 'comfortable', ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'bg-surface border border-border-subtle rounded-sm text-text-primary',
        density === 'compact' ? 'p-4' : 'p-5',
        accent ? accentBorderClass[accent] : undefined,
        className,
      )}
      {...rest}
    />
  );
});

/**
 * CardHeader — micro label + optional status slot.
 *
 * The header text is uppercase-micro (engineering doc / design-system §13)
 * and renders in muted text. The status slot is where a StatusDot or a
 * compact badge lives.
 */
export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, children, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn('flex items-center justify-between gap-3 mb-3', className)}
        {...rest}
      >
        {children}
      </div>
    );
  },
);

export const CardLabel = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(
  function CardLabel({ className, ...rest }, ref) {
    return (
      <span
        ref={ref}
        className={cn(
          'text-micro font-medium uppercase tracking-micro text-text-secondary',
          className,
        )}
        {...rest}
      />
    );
  },
);

export const CardBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardBody({ className, ...rest }, ref) {
    return <div ref={ref} className={cn('text-text-primary', className)} {...rest} />;
  },
);

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn('mt-3 pt-3 border-t border-border-subtle text-xs text-text-muted', className)}
        {...rest}
      />
    );
  },
);
