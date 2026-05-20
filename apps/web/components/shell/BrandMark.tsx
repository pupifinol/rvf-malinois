'use client';

import { cn } from '@rvf/ui';

import { useTheme } from '@/lib/theme/ThemeProvider';

/**
 * BrandMark — the RVF Malinois brand asset.
 *
 * Two variants:
 *   "wordmark" — full RVF Malinois lockup. Theme-swapped (dark variant on
 *                dark surfaces, light variant on light surfaces).
 *   "initials" — the compact "RVF" letterform used in tight chrome (e.g.
 *                the sidebar corner). One file only — does not theme-swap.
 *
 * App-local (not in @rvf/ui) because the SVG assets live in this app's
 * /public/branding directory. Height is the anchor; width is intrinsic.
 * The shell does not use next/image, so this stays an <img> for parity.
 */
export type BrandMarkSize = 'sm' | 'md' | 'lg';
export type BrandMarkVariant = 'wordmark' | 'initials';

interface BrandMarkProps {
  variant?: BrandMarkVariant;
  size?: BrandMarkSize;
  className?: string;
}

const sizeClass: Record<BrandMarkSize, string> = {
  sm: 'h-6',
  md: 'h-8',
  lg: 'h-12',
};

export const BrandMark = ({ variant = 'wordmark', size = 'md', className }: BrandMarkProps) => {
  const { theme } = useTheme();

  const src =
    variant === 'initials'
      ? '/branding/rvf-letras.svg'
      : theme === 'dark'
        ? '/branding/logo-rvf-malinois-dark.svg'
        : '/branding/logo-rvf-malinois.svg';

  const alt = variant === 'initials' ? 'RVF' : 'RVF Malinois';

  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      className={cn('w-auto max-w-full select-none', sizeClass[size], className)}
    />
  );
};
