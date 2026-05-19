'use client';

import { StatusDot, cn } from '@rvf/ui';
import { Bell, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useConnectionState } from '@/lib/realtime/RealtimeProvider';

/**
 * Topbar — persistent header.
 *
 * Slots required by UI/UX §4 and §19:
 *   - app name / brand
 *   - tenant selector (RVF staff only) [placeholder in F0]
 *   - global alarm banner counter      [placeholder in F0]
 *   - clock with shift                  [F0 shows the clock]
 *   - connection status                 [F0 shows the dot]
 *
 * The real alarm counter is a derived value from the realtime stream; F2
 * wires it up. For now the bell is purely a placeholder.
 */
const useClock = (): string => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now.toLocaleTimeString('en-GB', { hour12: false });
};

export const Topbar = () => {
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
        'h-12 shrink-0 sticky top-0 z-10',
        'bg-surface border-b border-border-subtle',
        'flex items-center justify-between gap-4 px-5',
      )}
    >
      {/* Left: page context will land here in F1 (breadcrumbs from UI/UX §4) */}
      <div className="text-sm text-text-secondary truncate">RVF Operations Console</div>

      {/* Right: clock, alarms placeholder, connection */}
      <div className="flex items-center gap-5">
        <button
          type="button"
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary"
          aria-label="Open alarm center"
        >
          <Bell className="w-4 h-4" aria-hidden="true" />
          <span className="text-xs uppercase tracking-micro font-medium">No active alarms</span>
        </button>

        <div className="flex items-center gap-2 text-text-secondary text-sm tabular-nums">
          <Clock className="w-4 h-4" aria-hidden="true" />
          <span>{time}</span>
        </div>

        <StatusDot
          kind={statusKind}
          size="sm"
          aria-label={`Realtime connection: ${connection.status}`}
        />
      </div>
    </header>
  );
};
