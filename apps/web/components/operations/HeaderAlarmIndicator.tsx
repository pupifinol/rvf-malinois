/**
 * HeaderAlarmIndicator — F2B.
 *
 * Replaces the hardcoded "No active alarms" pill in the Topbar with a live
 * summary derived from the F2A telemetry store. When no jobs are bound or
 * no readings have arrived, the headline remains "No active alarms" so
 * non-Operations screens see exactly the same baseline as before.
 *
 * Lives in components/operations/ because the summary uses the Operations
 * job binding to know which jobs to scan. F2C will introduce a global
 * alarm subscription that doesn't depend on the Operations page being
 * mounted.
 */
'use client';

import { cn } from '@rvf/ui';
import { Bell } from 'lucide-react';

import { OPERATIONS_JOBS } from './data/operationsJobs';

import { useAlarmSummary } from '@/lib/hooks/useAlarmSummary';

const toneClass: Record<'normal' | 'warn' | 'alarm' | 'stale', string> = {
  normal: 'text-text-secondary hover:text-text-primary',
  warn: 'text-status-warn',
  alarm: 'text-status-alarm',
  stale: 'text-status-stale',
};

// Hoisted to module scope so the array reference is stable across every
// render — `useSyncExternalStore` would otherwise re-subscribe on every
// render of the Topbar, which mounts on every console route.
const HEADER_JOBS = OPERATIONS_JOBS.map((b) => b.job);

export const HeaderAlarmIndicator = () => {
  const summary = useAlarmSummary(HEADER_JOBS);

  return (
    <button
      type="button"
      className={cn('flex items-center gap-2', toneClass[summary.tone])}
      aria-label={`Alarm summary: ${summary.headline}`}
      data-alarm-tone={summary.tone}
    >
      <Bell className="w-4 h-4" aria-hidden="true" />
      <span className="text-micro uppercase tracking-micro font-medium">{summary.headline}</span>
    </button>
  );
};
