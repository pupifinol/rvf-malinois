import type { ReactNode } from 'react';

import { Providers } from '@/components/providers/Providers';
import { BrandMark } from '@/components/shell/BrandMark';

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
      <div className="min-h-screen flex flex-col bg-canvas text-text-primary">
        <header className="h-[56px] shrink-0 sticky top-0 z-10 bg-surface border-b border-border-subtle flex items-center justify-between px-7">
          <div className="flex items-center gap-4 min-w-0">
            <BrandMark size="md" />
            <span aria-hidden="true" className="h-5 w-px bg-border-subtle" />
            <span className="text-micro uppercase tracking-micro font-medium text-text-secondary truncate">
              Client Portal
            </span>
          </div>
          <span className="text-micro uppercase tracking-micro px-2 py-0.5 border border-border-subtle text-text-secondary">
            Read only
          </span>
        </header>
        <main className="flex-1 min-w-0 p-7">{children}</main>
      </div>
    </Providers>
  );
}
