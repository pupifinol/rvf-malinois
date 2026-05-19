'use client';

import type { ReactNode } from 'react';

import { publicEnv } from '@/lib/env';
import { QueryProvider } from '@/lib/query/QueryProvider';
import { RealtimeProvider } from '@/lib/realtime/RealtimeProvider';
import { ThemeProvider, type Theme } from '@/lib/theme/ThemeProvider';

/**
 * Providers — single client boundary that owns all global runtime state.
 *
 * Order matters:
 *   ThemeProvider     — must apply the data-theme attribute before children
 *                       render so the first paint uses the right tokens.
 *   QueryProvider     — server state cache, used by everything that fetches.
 *   RealtimeProvider  — opens the WebSocket; depends on no other provider but
 *                       sits inside Query so the connection banner can call
 *                       a REST catch-up endpoint later.
 */
export const Providers = ({ children, theme }: { children: ReactNode; theme: Theme }) => {
  return (
    <ThemeProvider initial={theme}>
      <QueryProvider>
        <RealtimeProvider url={publicEnv.wsUrl}>{children}</RealtimeProvider>
      </QueryProvider>
    </ThemeProvider>
  );
};
