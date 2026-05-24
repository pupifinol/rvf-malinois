import { cn } from '@rvf/ui';

/**
 * ProductionGlyph — tiny, monochrome variable badge for the Client Portal.
 *
 * Three glyphs map 1:1 to the three protagonist variables (oil, gas, water
 * cut). Each renders as a soft tinted square so the row of KPIs reads as
 * "icon — value — unit" without resorting to colored typography (the design
 * system keeps state colors reserved for state).
 */
export type ProductionGlyphVariant = 'oil' | 'gas' | 'waterCut';

interface VariantSpec {
  /** Background tint (CSS color or var). */
  background: string;
  /** Stroke/fill color used by the glyph mark. */
  ink: string;
  /** SVG path drawn on top of the background. */
  path: string;
}

const VARIANTS: Record<ProductionGlyphVariant, VariantSpec> = {
  oil: {
    background: 'rgba(46, 138, 85, 0.12)',
    ink: 'var(--status-normal)',
    path: 'M12 3.2 C8 8.2 6 11.4 6 14.2 a6 6 0 0 0 12 0 c0 -2.8 -2 -6 -6 -11Z',
  },
  gas: {
    background: 'rgba(184, 132, 25, 0.14)',
    ink: 'var(--phase-gas)',
    path: 'M12 2.5 C13.4 6.1 16.2 7.4 16.2 11.2 a4.2 4.2 0 0 1 -8.4 0 c0 -2.7 1.8 -4.1 2.6 -6 C10.8 7 12.4 7.6 12 4Z',
  },
  waterCut: {
    background: 'rgba(31, 95, 168, 0.14)',
    ink: 'var(--phase-water)',
    path: 'M12 3.2 C8 8.2 6 11.4 6 14.2 a6 6 0 0 0 12 0 c0 -2.8 -2 -6 -6 -11Z',
  },
};

export interface ProductionGlyphProps {
  variant: ProductionGlyphVariant;
  size?: number;
  className?: string;
}

export const ProductionGlyph = ({ variant, size = 32, className }: ProductionGlyphProps) => {
  const spec = VARIANTS[variant];
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex items-center justify-center rounded-sm', className)}
      style={{ background: spec.background, width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size * 0.55}
        height={size * 0.55}
        fill={spec.ink}
        stroke="none"
      >
        <path d={spec.path} />
      </svg>
    </span>
  );
};
