import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '../utils/cn';

/**
 * Button — industrial primitive.
 *
 * Deliberately NOT a SaaS-style pill: contained 4px radius, 1 px border,
 * solid color blocks. The variants map to operational intent, not whim.
 *
 *   primary    — the main action on the screen ("Acknowledge", "Save").
 *                Brand color. Use one per screen.
 *   secondary  — neutral. Default for most actions.
 *   ghost      — minimal. For toolbar / inline actions.
 *   danger     — destructive or alarm-related actions (rare in this product
 *                because the platform is monitoring-only).
 *
 * Accessibility: 2 px focus ring; respects reduced-motion.
 */
const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-2 select-none whitespace-nowrap',
    'rounded-sm border font-medium text-sm',
    'transition-colors duration-fast ease-industrial',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
    'disabled:opacity-50 disabled:cursor-not-allowed',
  ),
  {
    variants: {
      variant: {
        primary: cn(
          'bg-brand-primary border-brand-primary text-text-on-accent',
          'hover:bg-brand-primary-hover hover:border-brand-primary-hover',
        ),
        secondary: cn(
          'bg-surface border-border-strong text-text-primary',
          'hover:bg-surface-raised',
        ),
        ghost: cn(
          'bg-transparent border-transparent text-text-secondary',
          'hover:bg-surface-raised hover:text-text-primary',
        ),
        danger: cn(
          'bg-status-alarm border-status-alarm text-status-fg',
          'hover:bg-status-critical hover:border-status-critical',
        ),
      },
      size: {
        sm: 'h-7 px-3 text-xs',
        md: 'h-9 px-4 text-sm',
        lg: 'h-11 px-5 text-base',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(buttonVariants({ variant, size }), className)}
      {...rest}
    />
  );
});

export { buttonVariants };
