'use client';

import { cn } from '@rvf/ui';
import { Download, Plus } from 'lucide-react';

import { formatDuration, formatKb, type ReportRecord, type ReportState } from './data/reports.mock';
import { ReportKindChip } from './ReportKindChip';

import { Panel } from '@/components/shell/Panel';

/**
 * ReportsArchiveTable — the operational hero of /reports.
 *
 * A read-mostly audit archive: rows are reports the system has produced.
 * Each row shows enough operational context to decide "do I want to
 * open this report?" without leaving the screen — run duration, alarm
 * count, average line pressure, average water cut, approver, size, and
 * state. Row click promotes the report into the detail preview below.
 *
 * Visual language matches /alarms — restrained chips, monospace IDs,
 * compact density, tabular-nums everywhere. Reports stay calmer than
 * alarms: no per-row tonal washes, only a 2-px left accent stripe
 * when the row is failed or pending approval.
 */
export interface ReportsArchiveTableProps {
  rows: readonly ReportRecord[];
  selectedId: string;
  onSelect: (id: string) => void;
  onGenerate?: () => void;
  onDownload?: (id: string) => void;
}

const STATE_STYLE: Record<ReportState, { dot: string; text: string; label: string }> = {
  QUEUED: { dot: 'bg-status-stale', text: 'text-status-stale', label: 'Queued' },
  GENERATING: { dot: 'bg-status-warn', text: 'text-status-warn', label: 'Generating' },
  READY: { dot: 'bg-status-info', text: 'text-status-info', label: 'Ready' },
  PENDING_APPROVAL: { dot: 'bg-status-warn', text: 'text-status-warn', label: 'Pending Approval' },
  DELIVERED: { dot: 'bg-status-normal', text: 'text-status-normal', label: 'Delivered' },
  FAILED: { dot: 'bg-status-alarm', text: 'text-status-alarm', label: 'Failed' },
};

export const ReportsArchiveTable = ({
  rows,
  selectedId,
  onSelect,
  onGenerate,
  onDownload,
}: ReportsArchiveTableProps) => (
  <Panel
    title="Reports Archive"
    density="compact"
    meta={
      <span className="inline-flex items-center gap-3 font-mono">
        <span>{rows.length} archived</span>
        <button
          type="button"
          onClick={onGenerate}
          className={cn(
            'inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-xs',
            'border border-border-strong/70 bg-surface-raised',
            'text-text-secondary',
            'hover:border-border-focus hover:text-text-primary hover:bg-surface',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
            'transition-colors duration-fast ease-industrial',
          )}
          aria-label="Generate report"
        >
          <Plus className="w-2.5 h-2.5" aria-hidden="true" />
          <span className="text-micro uppercase tracking-micro font-bold">Generate</span>
        </button>
      </span>
    }
  >
    <div className="overflow-x-auto max-h-[380px] -mx-1 px-1">
      <table className="w-full text-xs tabular-nums">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="text-micro uppercase tracking-micro text-text-muted">
            <Th>Report</Th>
            <Th>Kind</Th>
            <Th>Well</Th>
            <Th>Unit</Th>
            <Th align="right">Generated</Th>
            <Th align="right">Duration</Th>
            <Th align="right">Alarms</Th>
            <Th align="right">Avg P. (psi)</Th>
            <Th align="right">Avg WC (%)</Th>
            <Th>Approved By</Th>
            <Th align="right">Size</Th>
            <Th align="right">State</Th>
            <Th align="right"> </Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={13} className="px-2 py-6 text-center text-text-muted">
                No reports in the archive.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <ReportRow
                key={r.id}
                report={r}
                selected={r.id === selectedId}
                onSelect={onSelect}
                onDownload={onDownload}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  </Panel>
);

const ReportRow = ({
  report,
  selected,
  onSelect,
  onDownload,
}: {
  report: ReportRecord;
  selected: boolean;
  onSelect: (id: string) => void;
  onDownload?: (id: string) => void;
}) => {
  const ss = STATE_STYLE[report.state];
  const downloadable = report.state === 'READY' || report.state === 'DELIVERED';
  // Only failed + pending-approval rows pick up a left accent stripe;
  // delivered/ready rows stay neutral so the archive reads calm.
  const accent =
    report.state === 'FAILED'
      ? 'border-l-status-alarm'
      : report.state === 'PENDING_APPROVAL'
        ? 'border-l-status-warn'
        : 'border-l-transparent';
  return (
    <tr
      onClick={() => onSelect(report.id)}
      className={cn(
        'cursor-pointer transition-colors duration-fast border-l-2',
        accent,
        selected ? 'bg-brand-primary/15 hover:bg-brand-primary/25' : 'hover:bg-surface-raised/75',
      )}
    >
      <Td className="font-mono text-text-primary font-semibold">{report.id}</Td>
      <Td>
        <ReportKindChip kind={report.kind} />
      </Td>
      <Td className="font-mono text-text-secondary">{report.well ?? '—'}</Td>
      <Td className="text-text-secondary">{report.unit}</Td>
      <Td align="right" className="font-mono text-text-secondary whitespace-nowrap">
        {report.generatedAt}
      </Td>
      <Td align="right" className="font-mono text-text-secondary">
        {formatDuration(report.durationSec)}
      </Td>
      <Td
        align="right"
        className={cn(
          'font-mono',
          report.alarmCount >= 25
            ? 'text-status-alarm'
            : report.alarmCount >= 10
              ? 'text-status-warn'
              : 'text-text-secondary',
        )}
      >
        {report.alarmCount}
      </Td>
      <Td align="right" className="font-mono text-text-secondary">
        {report.avgPressurePsi === 0 ? '—' : report.avgPressurePsi.toLocaleString('en-US')}
      </Td>
      <Td align="right" className="font-mono text-text-secondary">
        {report.avgWaterCutPct === 0 ? '—' : report.avgWaterCutPct.toFixed(1)}
      </Td>
      <Td className="font-mono text-text-secondary whitespace-nowrap">
        {report.approvedBy ?? <span className="text-text-muted">—</span>}
      </Td>
      <Td align="right" className="text-text-secondary font-mono">
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
            onClick={(e) => {
              e.stopPropagation();
              onDownload?.(report.id);
            }}
            className="inline-flex items-center text-text-secondary hover:text-text-primary transition-colors duration-fast"
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
      'px-2 py-2 font-semibold border-b border-border-subtle whitespace-nowrap',
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
      'px-2 py-1.5 border-b border-border-subtle last:border-b-0',
      align === 'right' ? 'text-right' : 'text-left',
      className,
    )}
  >
    {children}
  </td>
);
