/**
 * OperationsHeaderRight — F2B.
 *
 * Right-aligned status chips for the Operations PageHeader. Mirrors the
 * legacy "{N} Active Units · All Systems Nominal" pair but derives the
 * second chip's label and tone from the live alarm summary.
 */
'use client';

import { OPERATIONS_JOBS } from './data/operationsJobs';

import { StatusChip } from '@/components/shell/PageHeader';
import { useAlarmSummary } from '@/lib/hooks/useAlarmSummary';

const headlineForChip = (h: string): string => {
  // Keep the chip text concise even when the underlying headline is verbose.
  if (h === 'No active alarms') return 'All Systems Nominal';
  return h;
};

// Hoisted to module scope so the array reference is stable across renders —
// see `HeaderAlarmIndicator` for the same reasoning.
const HEADER_JOBS = OPERATIONS_JOBS.map((b) => b.job);

export const OperationsHeaderRight = () => {
  const summary = useAlarmSummary(HEADER_JOBS);

  return (
    <>
      <StatusChip>{`${String(OPERATIONS_JOBS.length)} Active Units`}</StatusChip>
      <StatusChip tone={summary.tone}>{headlineForChip(summary.headline)}</StatusChip>
    </>
  );
};
