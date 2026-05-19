'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * QueryProvider — TanStack Query for SERVER state.
 *
 * Engineering doc §16: three distinct kinds of state.
 *   - Server state  -> TanStack Query (historian, metadata, lists).
 *   - Realtime      -> Zustand + ring buffer (lib/realtime).
 *   - UI            -> local component state.
 *
 * The defaults here are tuned for an industrial dashboard:
 *   - `staleTime: 30s` so quick navigations don't refetch.
 *   - `refetchOnWindowFocus: false` so a 12-hour-shift operator never sees
 *     a refetch storm just because they tabbed to another window.
 *   - `retry: 2` with backoff — enough to ride out a single hiccup.
 */
export const QueryProvider = ({ children }: { children: ReactNode }) => {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 2,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};
