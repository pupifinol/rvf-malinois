import type { Config } from 'tailwindcss';

import preset from '@rvf/ui/tailwind-preset';

/**
 * App-level Tailwind config.
 *
 * The preset from @rvf/ui owns ALL design decisions (colors, spacing,
 * typography, motion). This file only declares where to scan for class
 * names. Resist the temptation to extend colors here — that would defeat
 * the design-token discipline.
 */
const config: Config = {
  presets: [preset],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
