import { cn } from '@rvf/ui';
import {
  AlertOctagon,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Info,
  type LucideIcon,
} from 'lucide-react';

import { alarmFeed, type AlarmFeedEvent, type FeedEventTone } from './data/alarms.mock';

import { Panel } from '@/components/shell/Panel';

/**
 * RealtimeAlarmFeed — right-rail live event stream.
 *
 * Newest first. Each row is a 3-column rhythm:
 *   - severity icon inside a small tonally-tinted square chip
 *   - title + meta (uppercase title, source · unit · monospace)
 *   - relative timestamp on the far right (mono, dimmed)
 *
 * F2C: accepts an `events` prop so the Alarm Center page can stream live
 * events derived from the F2A telemetry foundation. When omitted, the
 * component renders the static mock feed (preserves any back-compat
 * caller that still wants the visual baseline without live wiring).
 *
 * Panel meta has a pulsing green dot + "Live" label as the connected
 * indicator. No other animation.
 */
const ICONS: Record<FeedEventTone, LucideIcon> = {
  urgent: AlertOctagon,
  high: AlertTriangle,
  medium: AlertTriangle,
  low: Bell,
  info: Info,
  normal: CheckCircle2,
};

const TONE: Record<FeedEventTone, { border: string; chip: string; icon: string; title: string }> = {
  urgent: {
    border: 'border-l-alarm-urgent',
    chip: 'bg-alarm-urgent/15 border border-alarm-urgent/40',
    icon: 'text-alarm-urgent',
    title: 'text-alarm-urgent',
  },
  high: {
    border: 'border-l-alarm-high',
    chip: 'bg-alarm-high/15 border border-alarm-high/40',
    icon: 'text-alarm-high',
    title: 'text-alarm-high',
  },
  medium: {
    border: 'border-l-alarm-medium',
    chip: 'bg-alarm-medium/15 border border-alarm-medium/40',
    icon: 'text-alarm-medium',
    title: 'text-alarm-medium',
  },
  low: {
    border: 'border-l-alarm-low',
    chip: 'bg-alarm-low/15 border border-alarm-low/40',
    icon: 'text-alarm-low',
    title: 'text-text-primary',
  },
  info: {
    border: 'border-l-status-info',
    chip: 'bg-status-info/15 border border-status-info/40',
    icon: 'text-status-info',
    title: 'text-text-primary',
  },
  normal: {
    border: 'border-l-status-normal',
    chip: 'bg-status-normal/15 border border-status-normal/40',
    icon: 'text-status-normal',
    title: 'text-text-primary',
  },
};

export interface RealtimeAlarmFeedProps {
  /** Newest-first feed rows. Defaults to the static mock for back-compat. */
  events?: readonly AlarmFeedEvent[];
}

export const RealtimeAlarmFeed = ({ events = alarmFeed }: RealtimeAlarmFeedProps) => (
  <Panel
    title="Realtime Alarm Feed"
    density="compact"
    meta={
      <span className="inline-flex items-center gap-1.5 font-mono">
        <span
          aria-hidden="true"
          className="inline-block w-2 h-2 rounded-full bg-status-normal animate-pulse"
        />
        Live
      </span>
    }
  >
    <ul
      className="flex flex-col max-h-[420px] overflow-y-auto -mx-1 px-1 divide-y divide-border-subtle"
      aria-label="Live alarm event stream"
    >
      {events.length === 0 ? (
        <li className="py-2 text-xs text-text-muted">No events yet — waiting for telemetry.</li>
      ) : (
        events.map((e) => {
          const Icon = ICONS[e.tone];
          const t = TONE[e.tone];
          return (
            <li
              key={e.id}
              className={cn(
                'flex items-center gap-2 py-1 pl-2 pr-1 border-l-[3px] hover:bg-surface-raised/40 transition-colors duration-fast',
                t.border,
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'inline-flex items-center justify-center w-5 h-5 rounded-xs shrink-0 opacity-85',
                  t.chip,
                )}
              >
                <Icon className={cn('w-3 h-3', t.icon)} />
              </span>
              <div className="flex-1 min-w-0 flex flex-col leading-tight">
                <span
                  className={cn('text-xs font-bold uppercase tracking-micro truncate', t.title)}
                >
                  {e.title}
                </span>
                <span className="text-micro uppercase tracking-micro text-text-secondary truncate">
                  {e.unit} · <span className="font-mono">{e.source}</span>
                </span>
              </div>
              <span className="font-mono text-text-muted/70 shrink-0 tabular-nums leading-none text-[10px] uppercase tracking-micro">
                {e.at}
              </span>
            </li>
          );
        })
      )}
    </ul>
  </Panel>
);
