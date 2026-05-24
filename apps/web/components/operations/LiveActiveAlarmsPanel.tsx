/**
 * LiveActiveAlarmsPanel — F2B.
 *
 * Walks the active jobs the Operations screen is showing, asks the
 * evaluator + stale detector what each (jobId, tag) currently looks like,
 * and renders one row per alarming or warning channel. Empty state mirrors
 * the static ActiveAlarmsPanel.
 *
 * F2C will replace this with a true Alarm Center (acknowledge, timeline,
 * audit). For F2B this is a faithful, derived snapshot — no extra storage.
 */
'use client';

import { cn } from '@rvf/ui';
import { AlertOctagon, AlertTriangle, WifiOff, type LucideIcon } from 'lucide-react';

import { findTileByTag } from './viewModel';

import type { AlarmState } from '@/lib/alarms/types';
import type { ActiveJobSnapshot } from '@/lib/jobs/types';
import type { TelemetryStore } from '@/lib/realtime/telemetryStore';

import { Panel } from '@/components/shell/Panel';
import { evaluateReading } from '@/lib/alarms/evaluator';
import { useNowTick, useTelemetryStore } from '@/lib/hooks';
import { computeStaleFromSnapshot } from '@/lib/quality/stale';

type Severity = 'alarm' | 'warn' | 'stale';

interface DerivedEntry {
  id: string;
  severity: Severity;
  title: string;
  source: string;
  timeAgo: string;
  icon: LucideIcon;
}

const formatAge = (ageSec: number | undefined): string => {
  if (ageSec === undefined) return '—';
  if (ageSec < 60) return `${String(Math.floor(ageSec))} s ago`;
  return `${String(Math.floor(ageSec / 60))} min ago`;
};

const severityClass: Record<Severity, { row: string; icon: string; title: string }> = {
  alarm: {
    row: 'border-l-status-alarm bg-status-alarm/5',
    icon: 'text-status-alarm',
    title: 'text-status-alarm',
  },
  warn: {
    row: 'border-l-status-warn bg-status-warn/5',
    icon: 'text-status-warn',
    title: 'text-status-warn',
  },
  stale: {
    row: 'border-l-status-stale bg-status-stale/5',
    icon: 'text-status-stale',
    title: 'text-status-stale',
  },
};

const deriveEntries = (
  store: TelemetryStore,
  jobs: readonly ActiveJobSnapshot[],
  nowMs: number,
): DerivedEntry[] => {
  const out: DerivedEntry[] = [];
  for (const job of jobs) {
    for (const mapping of job.snapshot.sensors) {
      if (!mapping.enabled) continue;
      const reading = store.getLatestReading(job.jobId, mapping.canonicalTag);
      const stale = computeStaleFromSnapshot({
        jobId: job.jobId,
        tag: mapping.canonicalTag,
        lastTs: reading?.ts,
        nowMs,
        snapshot: job.snapshot,
      });
      const tileLabel = findTileByTag(mapping.canonicalTag)?.label ?? String(mapping.canonicalTag);

      if (stale.status === 'offline' || stale.status === 'stale') {
        out.push({
          id: `${String(job.jobId)}::${String(mapping.canonicalTag)}::${stale.status}`,
          severity: 'stale',
          title: stale.status === 'offline' ? 'OFFLINE SIGNAL' : 'STALE SIGNAL',
          source: `${tileLabel} · ${String(job.wellId)}`,
          timeAgo: formatAge(stale.ageSec),
          icon: WifiOff,
        });
        continue;
      }
      if (!reading) continue;

      const evalResult: { state: AlarmState } = evaluateReading(reading, job.snapshot, {
        nowIso: new Date(nowMs).toISOString(),
      });

      if (evalResult.state === 'alarm_high' || evalResult.state === 'alarm_low') {
        out.push({
          id: `${String(job.jobId)}::${String(mapping.canonicalTag)}::${evalResult.state}`,
          severity: 'alarm',
          title: evalResult.state === 'alarm_high' ? 'HIGH ALARM' : 'LOW ALARM',
          source: `${tileLabel} · ${String(job.wellId)}`,
          timeAgo: formatAge((nowMs - Date.parse(reading.ts)) / 1000),
          icon: AlertOctagon,
        });
      } else if (evalResult.state === 'warning_high' || evalResult.state === 'warning_low') {
        out.push({
          id: `${String(job.jobId)}::${String(mapping.canonicalTag)}::${evalResult.state}`,
          severity: 'warn',
          title: evalResult.state === 'warning_high' ? 'HIGH WARNING' : 'LOW WARNING',
          source: `${tileLabel} · ${String(job.wellId)}`,
          timeAgo: formatAge((nowMs - Date.parse(reading.ts)) / 1000),
          icon: AlertTriangle,
        });
      }
    }
  }
  // Highest severity first: alarm > warn > stale.
  const rank: Record<Severity, number> = { alarm: 3, warn: 2, stale: 1 };
  out.sort((a, b) => rank[b.severity] - rank[a.severity]);
  return out;
};

export interface LiveActiveAlarmsPanelProps {
  jobs: readonly ActiveJobSnapshot[];
}

export const LiveActiveAlarmsPanel = ({ jobs }: LiveActiveAlarmsPanelProps) => {
  const store = useTelemetryStore();
  const now = useNowTick(5000);
  const entries = deriveEntries(store, jobs, now);

  const alarmCount = entries.filter((e) => e.severity === 'alarm').length;

  return (
    <Panel
      title="Active Alarms"
      meta={
        <span
          className={cn(
            'tabular-nums font-semibold',
            alarmCount > 0
              ? 'text-status-alarm'
              : entries.length > 0
                ? 'text-status-warn'
                : 'text-text-muted',
          )}
        >
          ({entries.length})
        </span>
      }
    >
      {entries.length === 0 ? (
        <p className="text-xs text-text-muted">No active alarms.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((a) => {
            const Icon = a.icon;
            const sc = severityClass[a.severity];
            return (
              <li
                key={a.id}
                className={cn('flex items-start gap-2.5 p-2.5 border-l-2 rounded-xs', sc.row)}
              >
                <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', sc.icon)} aria-hidden="true" />
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <p
                    className={cn(
                      'text-xs font-semibold uppercase tracking-micro leading-tight',
                      sc.title,
                    )}
                  >
                    {a.title}
                  </p>
                  <p className="text-xs text-text-secondary truncate leading-tight">{a.source}</p>
                  <p className="text-micro uppercase tracking-micro text-text-muted">{a.timeAgo}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
};
