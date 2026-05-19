import type { ReactNode } from 'react';

import { Providers } from '@/components/providers/Providers';

/**
 * (auth) layout.
 *
 * Houses login and any session-related flows. F0 only ships an empty page;
 * F1 wires Clerk/Auth0/WorkOS (engineering-architecture §15) behind a
 * httpOnly cookie session.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Providers theme="dark">
      <div className="min-h-screen flex items-center justify-center bg-canvas text-text-primary">
        {children}
      </div>
    </Providers>
  );
}
