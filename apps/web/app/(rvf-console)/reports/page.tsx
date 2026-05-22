import { cn } from '@rvf/ui';
import { Download, FileText, Plus } from 'lucide-react';

import {
  formatKb,
  queue,
  reports,
  templates,
  type ReportRecord,
  type ReportState,
} from '@/components/reports/data/reports.mock';
import { PageHeader, StatusChip } from '@/components/shell/PageHeader';
import { Panel } from '@/components/shell/Panel';

/**
 * Reports — Operational Deliverables.
 *
 * The archive + generation pipeline for end-of-job well-test reports,
 * daily-ops summaries, and other client deliverables. Reports here are
 * produced from the same telemetry stream the Operations Console renders.
 *
 * Visual language inherited from /operations.
 */
const stateStyles: Record<ReportState, { dot: string; text: string; label: string }> = {
  QUEUED: { dot: 'bg-status-stale', text: 'text-status-stale', label: 'Queued' },
  GENERATING: { dot: 'bg-status-warn', text: 'text-status-warn', label: 'Generating' },
  READY: { dot: 'bg-status-info', text: 'text-status-info', label: 'Ready' },
  DELIVERED: { dot: 'bg-status-normal', text: 'text-status-normal', label: 'Delivered' },
};

export default function ReportsPage() {
  const ready = reports.filter((r) => r.state === 'READY').length;
  const generating = queue.filter((q) => q.state === 'GENERATING').length;
  const queued = queue.filter((q) => q.state === 'QUEUED').length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Operational Reports"
        subtitle="Well-test deliverables, daily ops summaries, and audit archives"
        right={
          <>
            <StatusChip>{reports.length} Archived</StatusChip>
            <StatusChip tone={ready > 0 ? 'info' : 'neutral'}>{ready} Ready</StatusChip>
            <StatusChip tone={generating > 0 ? 'warn' : 'neutral'}>
              {generating + queued} In Pipeline
            </StatusChip>
          </>
        }
      />

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
        <Panel
          title="Reports Archive"
          meta={
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-border-subtle rounded-xs text-text-secondary hover:border-border-strong hover:text-text-primary transition-colors duration-fast"
            >
              <Plus className="w-3 h-3" aria-hidden="true" />
              <span className="text-micro uppercase tracking-micro font-semibold">Generate</span>
            </button>
          }
        >
          <div className="overflow-x-auto -m-1 p-1">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="text-micro uppercase tracking-micro text-text-muted">
                  <Th>Report</Th>
                  <Th>Kind</Th>
                  <Th>Well</Th>
                  <Th>Unit</Th>
                  <Th align="right">Generated</Th>
                  <Th align="right">Size</Th>
                  <Th align="right">State</Th>
                  <Th align="right"> </Th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <ReportRow key={r.id} report={r} />
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <aside className="flex flex-col gap-3 2xl:max-w-[320px]">
          <Panel title="Generation Queue" meta={<span>{queue.length} pending</span>}>
            <ul className="flex flex-col gap-2">
              {queue.map((q) => {
                const ss = stateStyles[q.state];
                return (
                  <li key={q.id} className="flex flex-col gap-0.5">
                    <span className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-text-primary truncate">{q.label}</span>
                      <span
                        className={cn('text-micro uppercase tracking-micro font-semibold', ss.text)}
                      >
                        {ss.label}
                      </span>
                    </span>
                    <span className="text-micro uppercase tracking-micro text-text-muted">
                      ETA {q.etaMin} min
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="Report Templates" meta={<span>{templates.length}</span>}>
            <ul className="flex flex-col">
              {templates.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between py-2 border-b border-border-subtle last:border-b-0"
                >
                  <span className="flex items-center gap-2 text-xs">
                    <FileText className="w-3.5 h-3.5 text-text-secondary" aria-hidden="true" />
                    <span className="text-text-primary">{t.name}</span>
                  </span>
                  <span className="text-micro uppercase tracking-micro text-text-muted tabular-nums">
                    {t.updated}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Recent Activity">
            <ul className="flex flex-col gap-2 text-xs">
              <ActivityLine time="08 min ago" text="r-1054 marked READY · J-0421" tone="info" />
              <ActivityLine time="4 h ago" text="r-1053 delivered to client portal" tone="normal" />
              <ActivityLine time="1 d ago" text="r-1050 audit closed by h.finol" tone="normal" />
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

const ReportRow = ({ report }: { report: ReportRecord }) => {
  const ss = stateStyles[report.state];
  const downloadable = report.state === 'READY' || report.state === 'DELIVERED';
  return (
    <tr className="hover:bg-surface-raised/40 transition-colors duration-fast">
      <Td className="font-mono text-text-primary">{report.id}</Td>
      <Td className="text-text-secondary">{report.kind}</Td>
      <Td className="font-mono text-text-primary">{report.well}</Td>
      <Td className="text-text-secondary">{report.unit}</Td>
      <Td align="right" className="text-text-secondary">
        {report.generatedAt}
      </Td>
      <Td align="right" className="text-text-secondary">
        {formatKb(report.sizeKb)}
      </Td>
      <Td align="right">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 font-semibold uppercase tracking-micro',
            ss.text,
          )}
        >
          <span
            aria-hidden="true"
            className={cn('inline-block w-1.5 h-1.5 rounded-full', ss.dot)}
          />
          {ss.label}
        </span>
      </Td>
      <Td align="right">
        {downloadable ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors duration-fast"
            aria-label={`Download ${report.id}`}
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </Td>
    </tr>
  );
};

const Th = ({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) => (
  <th
    className={cn(
      'px-2 py-2 font-semibold border-b border-border-subtle',
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
      'px-2 py-2 border-b border-border-subtle last:border-b-0',
      align === 'right' ? 'text-right' : 'text-left',
      className,
    )}
  >
    {children}
  </td>
);

const ActivityLine = ({
  time,
  text,
  tone,
}: {
  time: string;
  text: string;
  tone: 'info' | 'normal' | 'warn';
}) => {
  const toneClass = {
    info: 'border-l-status-info',
    normal: 'border-l-status-normal',
    warn: 'border-l-status-warn',
  }[tone];
  return (
    <li className={cn('pl-2 border-l-2 flex flex-col', toneClass)}>
      <span className="text-text-primary">{text}</span>
      <span className="text-micro uppercase tracking-micro text-text-muted">{time}</span>
    </li>
  );
};
