'use client';

import { useMemo, useState } from 'react';

import { activity, queue, reports, templates } from '@/components/reports/data/reports.mock';
import { GenerationQueuePanel } from '@/components/reports/GenerationQueuePanel';
import { ReportActionsPanel } from '@/components/reports/ReportActionsPanel';
import { ReportActivityPanel } from '@/components/reports/ReportActivityPanel';
import { ReportDetailPreview } from '@/components/reports/ReportDetailPreview';
import { ReportsArchiveTable } from '@/components/reports/ReportsArchiveTable';
import { ReportStatusStrip } from '@/components/reports/ReportStatusStrip';
import { ReportTemplatesPanel } from '@/components/reports/ReportTemplatesPanel';
import { PageHeader, StatusChip } from '@/components/shell/PageHeader';

/**
 * Reports — Operational Deliverables Archive.
 *
 * Layout (tuned for a 16:9 control room monitor, audit-document feel):
 *   1. PageHeader + at-a-glance chips
 *   2. 6-cell ReportStatusStrip — Today / Ready / In Pipeline / Failed /
 *      Pending Approval / Avg Generation
 *   3. Main 2-column grid:
 *        Left:  ReportsArchiveTable (selectable rows) + ReportDetailPreview
 *        Right: Generation Queue · Templates · Recent Activity · Actions
 *
 * Selection lives in client state so the archive can drive the detail
 * preview without a round-trip. Every panel reads from the same
 * `reports` / `queue` / `templates` / `activity` mocks; when F4 wires
 * the live generation pipeline, the mocks are swapped and nothing else
 * has to change.
 */
export default function ReportsPage() {
  const [selectedId, setSelectedId] = useState<string>(reports[0]?.id ?? '');

  const selected = useMemo(
    () => reports.find((r) => r.id === selectedId) ?? reports[0],
    [selectedId],
  );

  const ready = reports.filter((r) => r.state === 'READY').length;
  const pendingApproval = reports.filter((r) => r.state === 'PENDING_APPROVAL').length;
  const inPipeline = queue.length;
  const failed = reports.filter((r) => r.state === 'FAILED').length;

  return (
    <div className="flex flex-col gap-2.5">
      <PageHeader
        title="Operational Reports"
        subtitle="Well-test deliverables, daily ops summaries, and audit archives"
        right={
          <>
            <StatusChip>{reports.length} Archived</StatusChip>
            <StatusChip tone={ready > 0 ? 'info' : 'neutral'}>{ready} Ready</StatusChip>
            <StatusChip tone={inPipeline > 0 ? 'warn' : 'neutral'}>
              {inPipeline} In Pipeline
            </StatusChip>
            <StatusChip tone={pendingApproval > 0 ? 'warn' : 'neutral'}>
              {pendingApproval} Pending
            </StatusChip>
            {failed > 0 ? <StatusChip tone="alarm">{failed} Failed</StatusChip> : null}
          </>
        }
      />

      <ReportStatusStrip reports={reports} queue={queue} />

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(0,288px)] gap-2.5">
        <div className="flex flex-col gap-2.5 min-w-0">
          <ReportsArchiveTable
            rows={reports}
            selectedId={selected?.id ?? ''}
            onSelect={setSelectedId}
          />
          {selected ? (
            <ReportDetailPreview report={selected} />
          ) : (
            <div className="bg-surface border border-border-subtle rounded-sm p-4 text-xs text-text-muted">
              Select a report from the archive to preview its sections and metadata.
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-2.5 2xl:max-w-[288px]">
          <GenerationQueuePanel queue={queue} />
          <ReportTemplatesPanel templates={templates} />
          <ReportActivityPanel entries={activity} />
          <ReportActionsPanel />
        </aside>
      </div>
    </div>
  );
}
