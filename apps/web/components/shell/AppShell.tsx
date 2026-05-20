'use client';

import { ConnectionBanner } from '@rvf/ui';

import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

import type { ReactNode } from 'react';

import { useConnectionState } from '@/lib/realtime/RealtimeProvider';

/**
 * AppShell — the persistent chrome for the RVF console.
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ Topbar (full width — brand + page context + readouts)   │
 *   ├─────────┬───────────────────────────────────────────────┤
 *   │         │ ConnectionBanner (only when not connected)    │
 *   │ Sidebar ├───────────────────────────────────────────────┤
 *   │         │                                               │
 *   │         │   <children — the active screen>              │
 *   │         │                                               │
 *   └─────────┴───────────────────────────────────────────────┘
 *
 * The brand mark lives in the Topbar and spans the full width — there is no
 * separate logo cell over the sidebar. Sidebar provides navigation only.
 *
 * Client component because it consumes the realtime connection state. The
 * `wordmark` slot is rendered by the parent route layout (a server
 * component) so the SVG can be inlined at SSR time without a fetch hop.
 */
interface AppShellProps {
  children: ReactNode;
  wordmark: ReactNode;
}

export const AppShell = ({ children, wordmark }: AppShellProps) => {
  const connection = useConnectionState();
  return (
    <div className="h-screen flex flex-col bg-canvas text-text-primary">
      <Topbar wordmark={wordmark} />
      <div className="flex-1 min-h-0 flex">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col overflow-y-auto">
          <ConnectionBanner state={connection} />
          <main className="flex-1 min-w-0 p-7">{children}</main>
        </div>
      </div>
    </div>
  );
};
