import { cn } from '@rvf/ui';

import type { QueueItem, ReportRecord } from './data/reports.mock';

/**
 * ReportStatusStrip — six-cell ops counter strip directly under the
 * page header. Same label-over-value rhythm as the strips on /units
 * and /sensors. Calm by design — reports are an audit artifact, not
 * an alarm.
 */
export interface ReportStatusStripProps {
  reports: readonly ReportRecord[];
  queue: readonly QueueItem[];
}

/** A report counts as "today" if its YYYY-MM-DD prefix matches the
 *  newest record. Keeps the strip stable in mock-driven development. */
const today = (reports: readonly ReportRecord[]): string =>
  reports[0]?.generatedAt.slice(0, 10) ?? '';

export const ReportStatusStrip = ({ reports, queue }: ReportStatusStripProps) => {
  const day = today(reports);
  const reportsToday = reports.filter((r) => r.generatedAt.startsWith(day)).length;
  const ready = reports.filter((r) => r.state === 'READY').length;
  const pendingApproval = reports.filter((r) => r.state === 'PENDING_APPROVAL').length;
  const failed = reports.filter((r) => r.state === 'FAILED').length;
  const inPipeline = queue.length;

  // ETA average across in-flight queue items as a "typical generation
  // time" indicator. Falls back to a steady-state mock figure when the
  // queue is empty so the strip never reads "0m".
  const avgGenMin =
    queue.length === 0 ? 6 : Math.round(queue.reduce((a, q) => a + q.etaMin, 0) / queue.length);

  return (
    <div
      className="bg-surface border border-border-subtle rounded-sm grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-5 gap-y-2 p-3"
      aria-label="Reports operational summary"
    >
      <Cell label="Reports Today" value={reportsToday.toString()} />
      <Cell
        label="Ready"
        value={ready.toString()}
        tone={ready > 0 ? 'text-status-info' : 'text-text-secondary'}
      />
      <Cell
        label="In Pipeline"
        value={inPipeline.toString()}
        tone={inPipeline > 0 ? 'text-status-warn' : 'text-text-secondary'}
      />
      <Cell
        label="Failed"
        value={failed.toString()}
        tone={failed > 0 ? 'text-status-alarm' : 'text-text-secondary'}
      />
      <Cell
        label="Pending Approval"
        value={pendingApproval.toString()}
        tone={pendingApproval > 0 ? 'text-status-warn' : 'text-text-secondary'}
      />
      <Cell label="Avg Generation" value={`${avgGenMin} min`} />
    </div>
  );
};

const Cell = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <div className="min-w-0 flex flex-col gap-0.5 leading-none">
    <span className="text-micro uppercase tracking-micro text-text-muted">{label}</span>
    <span
      className={cn(
        'text-sm font-semibold font-mono tabular-nums truncate',
        tone ?? 'text-text-primary',
      )}
    >
      {value}
    </span>
  </div>
);
