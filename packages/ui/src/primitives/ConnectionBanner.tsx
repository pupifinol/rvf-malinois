import { cn } from '../utils/cn';

import type { ConnectionState } from '@rvf/types';

/**
 * ConnectionBanner — never lie about data freshness.
 *
 * Banner that surfaces the WebSocket connection state. Sits at the top of
 * the app shell, persistent across screens. Engineering doc §24: "the
 * operator always knows if what they see is current."
 *
 *   connected     -> banner is silent (renders nothing).
 *   connecting    -> neutral hint.
 *   reconnecting  -> warning color, shows attempt + age of last data.
 *   disconnected  -> stale color, shows age of last data.
 *
 * This component is presentation only. The actual connection state machine
 * lives in apps/web/lib/realtime; that hook hands the state in here.
 */
export interface ConnectionBannerProps {
  state: ConnectionState;
  className?: string;
}

const formatAge = (lastDataAt: string | null): string => {
  if (!lastDataAt) return 'no data yet';
  const ageMs = Date.now() - new Date(lastDataAt).getTime();
  const ageSec = Math.round(ageMs / 1000);
  if (ageSec < 60) return `${ageSec}s ago`;
  const ageMin = Math.round(ageSec / 60);
  if (ageMin < 60) return `${ageMin} min ago`;
  const ageHr = Math.round(ageMin / 60);
  return `${ageHr} h ago`;
};

export const ConnectionBanner = ({ state, className }: ConnectionBannerProps) => {
  if (state.status === 'connected') return null;

  let tone: 'info' | 'warn' | 'stale' = 'info';
  let label = '';

  if (state.status === 'connecting') {
    label = 'Connecting…';
  } else if (state.status === 'reconnecting') {
    tone = 'warn';
    label = `Reconnecting (attempt ${state.attempt}) — last data ${formatAge(state.lastDataAt)}`;
  } else {
    tone = 'stale';
    label = `Offline — last data ${formatAge(state.lastDataAt)}`;
  }

  const toneClass = {
    info: 'bg-status-info text-status-fg',
    warn: 'bg-status-warn text-status-fg',
    stale: 'bg-status-stale text-status-fg',
  }[tone];

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('w-full px-5 py-2 text-sm font-medium tabular-nums', toneClass, className)}
    >
      {label}
    </div>
  );
};
