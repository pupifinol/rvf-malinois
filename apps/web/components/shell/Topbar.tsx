'use client';

import { StatusDot, cn } from '@rvf/ui';
import { Bell, Clock } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { useConnectionState } from '@/lib/realtime/RealtimeProvider';

/**
 * Topbar — persistent header. Spans the full width above the sidebar.
 *
 * Slots required by UI/UX §4 and §19:
 *   - app brand mark (left)             [the inline wordmark slot]
 *   - page context label                [F0 shows "Operations Console"]
 *   - global alarm banner counter       [placeholder in F0]
 *   - clock with shift                  [F0 shows the clock]
 *   - connection status                 [F0 shows the dot]
 *
 * The wordmark is rendered by a server component (Wordmark.tsx) and passed
 * in as a ReactNode prop — that lets the SVG be inlined at SSR so its
 * <text> elements pick up the page's Montserrat webfont.
 */
const useClock = (): string => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now.toLocaleTimeString('en-GB', { hour12: false });
};

interface TopbarProps {
  wordmark: ReactNode;
}

export const Topbar = ({ wordmark }: TopbarProps) => {
  const time = useClock();
  const connection = useConnectionState();

  const statusKind: 'normal' | 'warn' | 'stale' =
    connection.status === 'connected'
      ? 'normal'
      : connection.status === 'reconnecting'
        ? 'warn'
        : 'stale';

  return (
    <header
      className={cn(
        'h-[80px] shrink-0',
        // Canvas fill (matte graphite/navy) instead of surface — drops the
        // "glowing band" feel in favor of a quiet control-room header. Same
        // height, layout, and spacing as before.
        'bg-canvas border-b border-border-subtle',
        'flex items-center justify-between gap-6 px-6',
      )}
    >
      {/* Left: brand mark + page context (breadcrumbs land here in F1, §4) */}
      <div className="flex items-center gap-6 min-w-0">
        {wordmark}
        <span aria-hidden="true" className="h-8 w-px bg-border-subtle" />
        <span className="text-sm uppercase tracking-micro font-semibold text-text-secondary truncate">
          Operations Console
        </span>
      </div>

      {/* Right: alarms placeholder, clock, connection */}
      <div className="flex items-center gap-5">
        <button
          type="button"
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary"
          aria-label="Open alarm center"
        >
          <Bell className="w-4 h-4" aria-hidden="true" />
          <span className="text-micro uppercase tracking-micro font-medium">No active alarms</span>
        </button>

        <div className="flex items-center gap-2 text-text-primary tabular-nums">
          <Clock className="w-4 h-4 text-text-secondary" aria-hidden="true" />
          <span className="text-sm font-medium">{time}</span>
        </div>

        <span aria-hidden="true" className="h-5 w-px bg-border-subtle" />

        <StatusDot
          kind={statusKind}
          size="sm"
          aria-label={`Realtime connection: ${connection.status}`}
        />
      </div>
    </header>
  );
};
