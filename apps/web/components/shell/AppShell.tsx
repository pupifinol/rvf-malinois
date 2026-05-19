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
 *   │ Sidebar │ Topbar                                        │
 *   │         ├───────────────────────────────────────────────┤
 *   │         │ ConnectionBanner (only when not connected)    │
 *   │         ├───────────────────────────────────────────────┤
 *   │         │                                               │
 *   │         │   <children — the active screen>              │
 *   │         │                                               │
 *   └─────────┴───────────────────────────────────────────────┘
 *
 * Client component because it consumes the realtime connection state. The
 * portal layout will reuse this pattern with a different default theme and
 * a slimmer sidebar in F1.
 */
export const AppShell = ({ children }: { children: ReactNode }) => {
  const connection = useConnectionState();
  return (
    <div className="min-h-screen flex bg-canvas text-text-primary">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar />
        <ConnectionBanner state={connection} />
        <main className="flex-1 min-w-0 p-7">{children}</main>
      </div>
    </div>
  );
};
