/**
 * LiveVariableTile — F2B.
 *
 * Visual twin of VariableTile, but reads from the F2A hooks instead of a
 * static `value` prop. Keeps the existing tile look (icon row + big
 * number + sparkline) and adds alarm-band / stale styling.
 *
 * Alarm-band styling is applied to the tile shell so an alarming pressure
 * isn't telegraphed only by the number — ISA-101 §10 wants the eye to find
 * the abnormal thing without inspecting digits.
 */
'use client';

import { cn } from '@rvf/ui';

import { Sparkline } from './Sparkline';

import type { OperationsTileDescriptor } from './viewModel';
import type { AlarmState } from '@/lib/alarms/types';
import type { CommissioningSnapshot } from '@/lib/jobs/types';
import type { JobId } from '@rvf/types';
import type { LucideIcon } from 'lucide-react';

import { useAlarmState, useHistoryBuffer, useLiveValue, useNowTick } from '@/lib/hooks';

export interface LiveVariableTileProps {
  jobId: JobId;
  snapshot: CommissioningSnapshot;
  tile: OperationsTileDescriptor;
  density?: 'comfortable' | 'compact';
}

const formatValue = (v: number | null): string => {
  if (v === null) return '—';
  if (Math.abs(v) >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
};

const shellByState: Record<AlarmState, { ring: string; value: string }> = {
  normal: {
    ring: 'border-border-subtle',
    value: 'text-text-primary',
  },
  warning_low: {
    ring: 'border-status-warn/50',
    value: 'text-status-warn',
  },
  warning_high: {
    ring: 'border-status-warn/50',
    value: 'text-status-warn',
  },
  alarm_low: {
    ring: 'border-status-alarm/60',
    value: 'text-status-alarm',
  },
  alarm_high: {
    ring: 'border-status-alarm/60',
    value: 'text-status-alarm',
  },
  no_data: {
    ring: 'border-border-subtle',
    value: 'text-text-muted',
  },
  disabled: {
    ring: 'border-border-subtle',
    value: 'text-text-muted',
  },
};

const TileIcon = ({ Icon, compact }: { Icon: LucideIcon; compact: boolean }) => (
  <Icon className={cn(compact ? 'w-3 h-3' : 'w-3.5 h-3.5')} aria-hidden="true" />
);

export const LiveVariableTile = ({
  jobId,
  snapshot,
  tile,
  density = 'comfortable',
}: LiveVariableTileProps) => {
  const compact = density === 'compact';
  const now = useNowTick(5000);
  const live = useLiveValue(tile.tag, { jobId, snapshot, nowMs: now });
  const alarm = useAlarmState(tile.tag, { jobId, snapshot, nowMs: now });
  const history = useHistoryBuffer(jobId, tile.tag);

  const state: AlarmState = alarm?.state ?? 'no_data';
  const shell = shellByState[state];
  const unit = live?.unit ?? tile.fallbackUnit;
  const status = live?.status ?? 'offline';

  // Show the most recent values for the sparkline; muted on stale/offline.
  const sparkData = history
    .slice(-32)
    .map((r) => r.value)
    .filter((v): v is number => v !== null);
  const isDataPath = state !== 'no_data' && state !== 'disabled';
  const sparkClass = isDataPath ? tile.sparkColor : 'text-text-muted';
  const sparkOpacity = status === 'stale' || status === 'offline' ? 'opacity-40' : 'opacity-75';

  const statusLabel: string =
    state === 'disabled'
      ? 'Disabled'
      : state === 'no_data' && (status === 'stale' || status === 'offline')
        ? status === 'stale'
          ? 'Stale'
          : 'Offline'
        : '';

  return (
    <div
      className={cn(
        'flex flex-col bg-surface-raised border rounded-sm',
        compact ? 'p-2 gap-1' : 'p-3 gap-1.5',
        shell.ring,
      )}
      data-state={state}
      data-status={status}
      data-tile={tile.id}
    >
      <div className="flex items-center gap-1.5 text-text-secondary">
        <TileIcon Icon={tile.icon} compact={compact} />
        <span className="text-micro uppercase tracking-micro font-medium truncate">
          {tile.label}
        </span>
        {statusLabel ? (
          <span className="ml-auto text-micro uppercase tracking-micro text-text-muted">
            {statusLabel}
          </span>
        ) : null}
      </div>
      <div className="flex items-baseline gap-1.5 leading-none">
        <span
          className={cn(
            'font-semibold tabular-nums leading-none',
            compact ? 'text-lg' : 'text-2xl',
            shell.value,
          )}
        >
          {formatValue(live?.value ?? null)}
        </span>
        <span className="text-xs text-text-muted tabular-nums">{unit}</span>
      </div>
      <Sparkline
        data={sparkData}
        height={compact ? 18 : 22}
        width={compact ? 90 : 130}
        strokeWidth={1.1}
        className={cn('w-full', sparkOpacity, sparkClass)}
      />
    </div>
  );
};
