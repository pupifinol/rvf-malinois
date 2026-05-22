import { cn } from '@rvf/ui';

import { eventToneClass, sensorEvents, type SensorEventKind } from './data/events.mock';

import { Panel } from '@/components/shell/Panel';

/**
 * SensorEventsTimeline — bottom-right diagnostics log.
 *
 * Tightened to read like a SCADA event log, not a chat feed:
 *   - one row = one event
 *   - leftmost column is the timestamp (monospace, fixed width)
 *   - second column is a kind chip (COMM / CAL / WARN / ALARM / FW / RF / STALE)
 *   - third column is the sensor tag (monospace)
 *   - fourth column is the message
 *   - thin left accent border colors the row by tone
 *
 * The whole strip is scrollable in place; each row is one line tall on
 * wide screens so the operator can scan the last hour at a glance.
 */
const kindLabel: Record<SensorEventKind, string> = {
  COMM: 'COMM',
  CALIBRATION: 'CAL',
  WARNING: 'WARN',
  ALARM: 'ALARM',
  FIRMWARE: 'FW',
  RF_REROUTE: 'RF',
  STALE: 'STALE',
};

export const SensorEventsTimeline = () => (
  <Panel
    title="Sensor Events & Diagnostics"
    meta={<span className="font-mono">{sensorEvents.length} events · last 3 h</span>}
  >
    <ul
      className="flex flex-col max-h-[260px] overflow-y-auto -mx-1 px-1 divide-y divide-border-subtle"
      aria-label="Event log"
    >
      {sensorEvents.map((e) => {
        const tone = eventToneClass[e.tone];
        const critical = e.tone === 'alarm';
        return (
          <li
            key={e.id}
            className={cn(
              'grid grid-cols-[64px_56px_88px_minmax(0,1fr)] items-baseline gap-2',
              'py-1 pl-2 pr-1 border-l-2 hover:bg-surface-raised/40 transition-colors duration-fast',
              tone.border,
            )}
          >
            <span className="text-micro uppercase tracking-micro font-mono text-text-muted/70">
              {e.at}
            </span>
            <span
              className={cn(
                'inline-flex items-center justify-center px-1.5 py-0.5 rounded-xs text-micro uppercase tracking-micro font-bold',
                tone.chip,
              )}
            >
              {kindLabel[e.kind]}
            </span>
            <span
              className={cn(
                'font-mono text-xs truncate',
                critical ? 'text-status-alarm font-semibold' : 'text-text-primary',
              )}
            >
              {e.tag}
            </span>
            <span
              className={cn(
                'text-xs truncate',
                critical ? 'text-text-primary' : 'text-text-secondary',
              )}
              title={e.message}
            >
              {e.message}
            </span>
          </li>
        );
      })}
    </ul>
  </Panel>
);
