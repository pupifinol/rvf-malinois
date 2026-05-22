import { cn } from '@rvf/ui';

import { AlarmPriorityChip, PRIORITY_STYLE } from './AlarmPriorityChip';
import { formatDuration, type AlarmRecord } from './data/alarms.mock';

import { Panel } from '@/components/shell/Panel';

/**
 * AlarmHistoryTable — lower-emphasis archive of cleared alarms below
 * the active queue.
 *
 * Reuses the priority chip + accent stripe so a Critical-priority entry
 * still reads as critical, but the table itself opacity-steps down so
 * the operator's eye stays on the live queue above. Columns shift from
 * "Active For" to "Cleared / Duration" — history is reviewed by how
 * long it lasted, not how long it's been ringing.
 */
export interface AlarmHistoryTableProps {
  rows: readonly AlarmRecord[];
}

export const AlarmHistoryTable = ({ rows }: AlarmHistoryTableProps) => (
  <Panel
    title="Alarm History"
    density="compact"
    meta={<span className="font-mono">{rows.length} entries · last 24 h</span>}
  >
    <div className="overflow-x-auto max-h-[168px] -mx-1 px-1">
      <table className="w-full text-xs tabular-nums opacity-90">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="text-micro uppercase tracking-micro text-text-muted">
            <Th>Priority</Th>
            <Th>Title</Th>
            <Th>Source</Th>
            <Th>Unit</Th>
            <Th align="right">Raised</Th>
            <Th align="right">Cleared</Th>
            <Th align="right">Duration</Th>
            <Th align="right">State</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-2 py-6 text-center text-text-muted">
                No history entries match the current filters.
              </td>
            </tr>
          ) : (
            rows.map((a) => {
              const ps = PRIORITY_STYLE[a.priority];
              return (
                <tr
                  key={a.id}
                  className={cn(
                    'border-l-[3px]',
                    ps.row,
                    'hover:bg-surface-raised/40 transition-colors duration-fast',
                  )}
                >
                  <Td>
                    <AlarmPriorityChip priority={a.priority} />
                  </Td>
                  <Td className="text-text-secondary">{a.title}</Td>
                  <Td className="text-text-secondary font-mono">{a.source}</Td>
                  <Td className="text-text-secondary">{a.unit}</Td>
                  <Td align="right" className="text-text-muted font-mono">
                    {a.raisedUtc}
                  </Td>
                  <Td align="right" className="text-text-muted font-mono">
                    {a.clearedUtc ?? '—'}
                  </Td>
                  <Td align="right" className="font-mono text-text-secondary">
                    {formatDuration(a.durationSec)}
                  </Td>
                  <Td align="right">
                    <span className="text-text-muted font-semibold uppercase tracking-micro">
                      Cleared
                    </span>
                  </Td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  </Panel>
);

const Th = ({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) => (
  <th
    className={cn(
      'px-2.5 py-2 font-semibold border-b border-border-subtle whitespace-nowrap',
      align === 'right' ? 'text-right' : 'text-left',
    )}
  >
    {children}
  </th>
);

const Td = ({
  children,
  align = 'left',
  className,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) => (
  <td
    className={cn(
      'px-2.5 py-1.5 border-b border-border-subtle last:border-b-0',
      align === 'right' ? 'text-right' : 'text-left',
      className,
    )}
  >
    {children}
  </td>
);
