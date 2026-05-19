import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * `cn` — class-name merger.
 *
 * Combines `clsx` (conditional class lists) with `tailwind-merge` (resolves
 * conflicting Tailwind utilities so the last one wins). Use it whenever a
 * component composes its className from a base set and a caller override.
 *
 *   <button className={cn('bg-surface px-5', props.className)} />
 *
 * Caller can override surface with `className="bg-canvas"` without ending up
 * with both classes applied.
 */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
