import type { ReactNode } from 'react';

import { Providers } from '@/components/providers/Providers';

/**
 * (client-portal) layout.
 *
 * The customer-facing surface (Repsol today, others tomorrow). Light theme
 * by default — closer to a professional report than to a control room. F1
 * will add the slimmer customer sidebar; F0 just frames the page.
 *
 * Tenant scoping (engineering-architecture §6, telemetry-foundation §17)
 * is enforced server-side. The browser never decides which tenant it is —
 * that comes from the validated session in F1.
 */
export default function ClientPortalLayout({ children }: { children: ReactNode }) {
  return (
    <Providers theme="light">
      <div className="min-h-screen bg-canvas text-text-primary">
        <header className="h-12 px-7 border-b border-border-subtle flex items-center justify-between">
          <div className="font-semibold">RVF Malinois — Client Portal</div>
          <div className="text-xs uppercase tracking-micro text-text-muted">Read only</div>
        </header>
        <main className="p-7">{children}</main>
      </div>
    </Providers>
  );
}
