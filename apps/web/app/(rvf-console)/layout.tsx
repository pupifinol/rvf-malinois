import type { ReactNode } from 'react';

import { Providers } from '@/components/providers/Providers';
import { AppShell } from '@/components/shell/AppShell';

/**
 * (rvf-console) layout.
 *
 * Route group for the internal RVF surface (engineering-architecture §5,
 * ui-ux-architecture §5). Dark theme by default — control-room context.
 *
 * Server-side guarding lives here in F1 (validate session, role >= rvf_*).
 */
export default function RvfConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <Providers theme="dark">
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
