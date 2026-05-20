import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

/**
 * Root layout.
 *
 * Sets the default theme (dark — control-room context) at the HTML level so
 * the first paint uses the correct tokens with no flash. Route-group layouts
 * (e.g. (client-portal)/layout.tsx) override this client-side via the
 * ThemeProvider.
 *
 * No providers are mounted here — the providers tree is intentionally pushed
 * into each route group's layout, because the console and the portal each
 * want a different default theme.
 */
export const metadata: Metadata = {
  title: 'RVF Malinois',
  description: 'Industrial operational monitoring platform for Well Testing',
  applicationName: 'RVF Malinois',
  robots: { index: false, follow: false },
  icons: { icon: '/branding/favicon.ico' },
};

export const viewport: Viewport = {
  // Browser address-bar color. Mirrors `--bg-canvas` from the dark theme.
  // This is one of the few legitimate uses of a hex literal: Next.js writes
  // this into a <meta> tag at SSR time, before any CSS is loaded, so a
  // var(--bg-canvas) reference would resolve to nothing.
  // eslint-disable-next-line no-restricted-syntax -- non-CSS context, see comment above
  themeColor: '#0e1620',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/*
         * Montserrat is loaded as a literal-named webfont so the inline brand
         * SVG (which references `font-family: Montserrat-Bold, Montserrat`)
         * resolves the lockup's MALINOIS title and the subtitle to the
         * intended typography. next/font randomises family names and would
         * not match the SVG's literal reference, so the <link> form stays.
         */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-canvas text-text-primary antialiased">{children}</body>
    </html>
  );
}
