import type { ReactNode } from 'react';

import { Providers } from '@/components/providers/Providers';
import { AppShell } from '@/components/shell/AppShell';
import { Wordmark } from '@/components/shell/Wordmark';

/**
 * (rvf-console) layout.
 *
 * Route group for the internal RVF surface (engineering-architecture §5,
 * ui-ux-architecture §5). Dark theme by default — control-room context.
 *
 * The dark-variant Wordmark is rendered server-side here and threaded into
 * AppShell as a slot prop — that keeps the SVG inlined in the SSR'd HTML
 * (so it picks up the page's Montserrat webfont) without making AppShell
 * read the filesystem.
 *
 * Server-side guarding lives here in F1 (validate session, role >= rvf_*).
 */
export default function RvfConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <Providers theme="dark">
      <AppShell wordmark={<Wordmark variant="dark" className="h-[52px] shrink-0" />}>
        {children}
      </AppShell>
    </Providers>
  );
}
