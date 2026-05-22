import { cn } from '@rvf/ui';

import { kindLabel, type ReportKind } from './data/reports.mock';

/**
 * ReportKindChip — single-source-of-truth visual for report kinds.
 *
 * Restrained outlined chip with a small leading dot. Kind colors are
 * subtle — reports are calmer than alarms; the dot encodes the kind,
 * the chip outline stays neutral.
 *
 *   Well Test → info (blue)
 *   Daily Ops → secondary (neutral muted text + dot)
 *   Buildup   → series-5 (calm purple — distinct from process tones)
 *   Audit     → stale (gray)
 *   Incident  → alarm (red — incident reports inherit the alarm palette)
 */
export const KIND_DOT: Record<ReportKind, string> = {
  WELL_TEST: 'bg-status-info',
  DAILY_OPS: 'bg-text-secondary',
  BUILDUP: 'bg-series-5',
  AUDIT: 'bg-status-stale',
  INCIDENT: 'bg-status-alarm',
};

export const ReportKindChip = ({ kind }: { kind: ReportKind }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-xs',
      'border border-border-subtle bg-surface',
      'text-micro uppercase tracking-micro font-semibold text-text-secondary',
    )}
  >
    <span
      aria-hidden="true"
      className={cn('inline-block w-1.5 h-1.5 rounded-full', KIND_DOT[kind])}
    />
    {kindLabel(kind)}
  </span>
);
