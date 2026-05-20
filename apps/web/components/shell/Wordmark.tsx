import fs from 'node:fs';
import path from 'node:path';

import { cn } from '@rvf/ui';

/**
 * Wordmark — the RVF Malinois lockup, inlined into the DOM.
 *
 * Server-only. Reads the SVG file at render time and emits it inline (not
 * via <img>) so the SVG's <text> elements ("MALINOIS" + the subtitle) can
 * resolve against page-level webfonts. With <img>, the SVG renders in an
 * isolated context that ignores page fonts, so MALINOIS falls back to the
 * system sans-serif. Inline rendering fixes that.
 *
 * The Montserrat font (referenced by the lockup) is loaded globally by the
 * root layout. The file is re-read on every render so dev hot-reloads pick
 * up SVG edits without a server restart; the cost is one ~6 KB read.
 */
const PUBLIC_BRANDING = path.join(process.cwd(), 'public', 'branding');

const FILENAMES = {
  dark: 'logo-rvf-malinois-dark.svg',
  light: 'logo-rvf-malinois.svg',
} as const;

const readWordmark = (variant: 'dark' | 'light'): string => {
  const raw = fs.readFileSync(path.join(PUBLIC_BRANDING, FILENAMES[variant]), 'utf8');
  return (
    raw
      .replace(/^<\?xml[^?]*\?>\s*/, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      // The Illustrator export uses a 1440×800 canvas, but the actual
      // artwork lives between roughly y=220 and y=600. Re-aim the viewBox
      // at that content band so the wordmark renders large enough to be
      // readable in the topbar without forcing the chrome to be 140 px
      // tall. The asset on disk is untouched.
      .replace(/viewBox="0 0 1440 800"/, 'viewBox="0 220 1440 380"')
      // Illustrator sometimes exports the secondary font-family as an
      // embedded subset name like 'VDHZR C+ Montserrat'. That subset isn't
      // available at runtime, so the SVG would fall back to the system
      // sans-serif. Rewrite any quoted Adobe-subset Montserrat fallback to
      // the plain "Montserrat" family that the root layout loads via
      // Google Fonts — that lets both dark and light variants resolve to
      // the correct typography.
      .replace(/'[^']*Montserrat'/g, 'Montserrat')
      .trim()
  );
};

interface WordmarkProps {
  variant: 'dark' | 'light';
  className?: string;
}

export const Wordmark = ({ variant, className }: WordmarkProps) => {
  const svg = readWordmark(variant);
  return (
    <span
      role="img"
      aria-label="RVF Malinois"
      className={cn(
        // inline-block so the SVG sizes off the explicit height the caller
        // sets via className; h-full only resolves on a sized parent.
        'inline-block [&>svg]:block [&>svg]:h-full [&>svg]:w-auto',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};
