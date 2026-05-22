import { cn } from '@rvf/ui';

import { kindLabel, stageLabel, type QueueItem } from './data/reports.mock';
import { KIND_DOT } from './ReportKindChip';

import { Panel } from '@/components/shell/Panel';

/**
 * GenerationQueuePanel — right-rail pipeline view.
 *
 * Each row is a report in-flight or queued. Shows the current pipeline
 * stage, the ETA, and a thin restrained progress bar. The bar is the
 * only visual that moves on this page — and it doesn't animate, just
 * grows / shrinks with progress.
 *
 * QUEUED rows render with a muted dot and no progress fill; GENERATING
 * rows pick up an amber dot and the partial bar.
 */
export interface GenerationQueuePanelProps {
  queue: readonly QueueItem[];
}

export const GenerationQueuePanel = ({ queue }: GenerationQueuePanelProps) => (
  <Panel
    title="Generation Queue"
    density="compact"
    meta={<span className="font-mono">{queue.length} in pipeline</span>}
  >
    {queue.length === 0 ? (
      <p className="text-xs text-text-muted">Pipeline idle.</p>
    ) : (
      <ul className="flex flex-col gap-2">
        {queue.map((q) => (
          <QueueRow key={q.id} item={q} />
        ))}
      </ul>
    )}
  </Panel>
);

const QueueRow = ({ item }: { item: QueueItem }) => {
  const isGenerating = item.state === 'GENERATING';
  return (
    <li className="flex flex-col gap-1.5 py-1.5 px-2 bg-surface-raised border border-border-subtle rounded-xs">
      <div className="flex items-baseline justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <span
            aria-hidden="true"
            className={cn('inline-block w-1.5 h-1.5 rounded-full shrink-0', KIND_DOT[item.kind])}
          />
          <span className="text-xs text-text-primary truncate">{item.label}</span>
        </span>
        <span
          className={cn(
            'text-micro uppercase tracking-micro font-semibold shrink-0',
            isGenerating ? 'text-status-warn' : 'text-text-muted',
          )}
        >
          {isGenerating ? 'Generating' : 'Queued'}
        </span>
      </div>

      {/* Progress bar — restrained but operationally legible.
          Background uses canvas tone (deeper than surface) so the fill
          carries strong contrast without a saturated glow. */}
      <div
        className="h-1.5 w-full bg-canvas border border-border-subtle rounded-xs overflow-hidden"
        aria-label={`Progress ${item.progressPct}%`}
        role="progressbar"
        aria-valuenow={item.progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            'h-full transition-all duration-base ease-industrial',
            isGenerating ? 'bg-status-warn' : 'bg-text-secondary/50',
          )}
          style={{ width: `${Math.max(0, Math.min(100, item.progressPct))}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-micro uppercase tracking-micro font-mono text-text-muted">
        <span>
          {stageLabel(item.stage)} ·{' '}
          <span className="text-text-secondary">{kindLabel(item.kind)}</span>
        </span>
        <span className="tabular-nums">
          {isGenerating ? `${item.progressPct}% · ` : ''}ETA {item.etaMin}m
        </span>
      </div>
    </li>
  );
};
