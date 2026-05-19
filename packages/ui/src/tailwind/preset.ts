import type { Config } from 'tailwindcss';

/**
 * RVF Malinois Tailwind preset.
 *
 * Every color, spacing value, radius, and font on this preset points at a
 * CSS variable defined in `src/tokens/tokens.css`. Components writing
 * `className="bg-status-alarm"` resolve through the token; the theme decides
 * the actual hex.
 *
 * Why this preset is so opinionated:
 *   - It deletes Tailwind's default color palette. Industrial discipline
 *     means there is no `text-blue-500` waiting to be misused; the only
 *     colors that exist are the ones with operational meaning.
 *   - It maps fonts, spacing, radii, motion, and typography to the same
 *     tokens, so the design system has a single source of truth.
 */
const preset: Partial<Config> = {
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',

      // Surfaces
      canvas: 'var(--bg-canvas)',
      surface: 'var(--bg-surface)',
      'surface-raised': 'var(--bg-surface-raised)',
      overlay: 'var(--bg-overlay)',

      // Text
      'text-primary': 'var(--text-primary)',
      'text-secondary': 'var(--text-secondary)',
      'text-muted': 'var(--text-muted)',
      'text-inverse': 'var(--text-inverse)',
      'text-on-accent': 'var(--text-on-accent)',

      // Borders (also usable as colors for divider lines, focus rings)
      'border-subtle': 'var(--border-subtle)',
      'border-strong': 'var(--border-strong)',
      'border-focus': 'var(--border-focus)',

      // Brand
      'brand-primary': 'var(--brand-primary)',
      'brand-primary-hover': 'var(--brand-primary-hover)',
      'brand-accent': 'var(--brand-accent)',

      // Status (semantic — these and only these for state colors)
      'status-normal': 'var(--status-normal)',
      'status-warn': 'var(--status-warn)',
      'status-alarm': 'var(--status-alarm)',
      'status-critical': 'var(--status-critical)',
      'status-stale': 'var(--status-stale)',
      'status-info': 'var(--status-info)',
      'status-fg': 'var(--status-fg)',

      // Quality of data (engineering doc §22)
      'quality-good': 'var(--quality-good)',
      'quality-estimated': 'var(--quality-estimated)',
      'quality-uncertain': 'var(--quality-uncertain)',
      'quality-bad': 'var(--quality-bad)',
      'quality-stale': 'var(--quality-stale)',

      // Chart series
      'series-1': 'var(--series-1)',
      'series-2': 'var(--series-2)',
      'series-3': 'var(--series-3)',
      'series-4': 'var(--series-4)',
      'series-5': 'var(--series-5)',
      'series-6': 'var(--series-6)',
    },

    spacing: {
      0: 'var(--space-0)',
      1: 'var(--space-1)',
      2: 'var(--space-2)',
      3: 'var(--space-3)',
      4: 'var(--space-4)',
      5: 'var(--space-5)',
      6: 'var(--space-6)',
      7: 'var(--space-7)',
      8: 'var(--space-8)',
      9: 'var(--space-9)',
      10: 'var(--space-10)',
      11: 'var(--space-11)',
      px: '1px',
    },

    borderRadius: {
      none: 'var(--radius-none)',
      xs: 'var(--radius-xs)',
      sm: 'var(--radius-sm)',
      md: 'var(--radius-md)',
    },

    borderWidth: {
      DEFAULT: 'var(--border-width-thin)',
      0: '0',
      1: 'var(--border-width-thin)',
      2: 'var(--border-width-emphasis)',
    },

    boxShadow: {
      none: 'none',
      surface: 'var(--elevation-surface)',
      overlay: 'var(--elevation-overlay)',
    },

    fontFamily: {
      sans: 'var(--font-sans)',
      mono: 'var(--font-mono)',
    },

    fontSize: {
      micro: ['var(--text-size-micro)', { lineHeight: 'var(--text-line-normal)' }],
      xs: ['var(--text-size-xs)', { lineHeight: 'var(--text-line-normal)' }],
      sm: ['var(--text-size-sm)', { lineHeight: 'var(--text-line-normal)' }],
      base: ['var(--text-size-base)', { lineHeight: 'var(--text-line-normal)' }],
      md: ['var(--text-size-md)', { lineHeight: 'var(--text-line-normal)' }],
      lg: ['var(--text-size-lg)', { lineHeight: 'var(--text-line-tight)' }],
      xl: ['var(--text-size-xl)', { lineHeight: 'var(--text-line-tight)' }],
      display: ['var(--text-size-display)', { lineHeight: 'var(--text-line-tight)' }],
      'display-lg': ['var(--text-size-display-lg)', { lineHeight: 'var(--text-line-tight)' }],
    },

    fontWeight: {
      regular: 'var(--text-weight-regular)',
      medium: 'var(--text-weight-medium)',
      semibold: 'var(--text-weight-semibold)',
      bold: 'var(--text-weight-bold)',
    },

    letterSpacing: {
      tight: 'var(--text-tracking-tight)',
      normal: 'var(--text-tracking-normal)',
      wide: 'var(--text-tracking-wide)',
      micro: 'var(--text-tracking-micro)',
    },

    transitionDuration: {
      fast: 'var(--motion-fast)',
      base: 'var(--motion-base)',
      slow: 'var(--motion-slow)',
    },

    transitionTimingFunction: {
      industrial: 'var(--motion-easing)',
    },

    extend: {
      // Tabular numerals — every live-updating numeric value uses this.
      // Engineering doc §11.
      fontVariantNumeric: {
        tabular: 'tabular-nums',
      },
    },
  },
  plugins: [],
};

export default preset;
