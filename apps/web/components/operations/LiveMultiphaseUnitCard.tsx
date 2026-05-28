/**
 * LiveMultiphaseUnitCard — F2B.
 *
 * Live-data twin of MultiphaseUnitCard. Same visual shell (left accent
 * border, header chip, 3x2 variable tile grid, footer strip) but every
 * tile and the worst-state chip are driven by the F2A hooks against the
 * job's commissioning snapshot.
 *
 * The card derives its TESTING/STABILIZING/ALARM/OFFLINE chip from the
 * highest-priority evaluated state across the job's enabled tags; this
 * keeps the chip honest with the tile colors. No alarm logic in JSX — it
 * all goes through `summarizeAlarms` and the evaluator.
 */
'use client';

import { cn } from '@rvf/ui';
import { Signal, SignalHigh, SignalLow, SignalMedium, SignalZero } from 'lucide-react';
import { useMemo } from 'react';

import { LiveVariableTile } from './LiveVariableTile';
import { UnitImage } from './UnitImage';
import { OPERATIONS_TILES, rollUpUnitStatus, type UnitBadgeStatus } from './viewModel';

import type { TrackedSlot } from '@/lib/hooks';
import type { ActiveJobSnapshot } from '@/lib/jobs/types';
import type { CommunicationStatus } from '@/lib/telemetry/models';

import {
  useNowTick,
  useOperationsLatestValues,
  useOperationsRealtimeF4,
  useResolveBackendUnitId,
  useUnitTelemetrySnapshot,
} from '@/lib/hooks';

type SignalStrength = 'STRONG' | 'OK' | 'WEAK' | 'NONE';

const statusStyles: Record<UnitBadgeStatus, { chip: string; accent: string; dot: string }> = {
  TESTING: {
    chip: 'bg-status-info/15 text-status-info border-status-info/50',
    accent: 'border-l-status-info',
    dot: 'bg-status-info',
  },
  // DEGRADED keeps the amber tone that previously belonged to STABILIZING:
  // the operator's eye expects "attention but not critical" in amber across
  // every Operations surface (ISA-101). The label is what changed.
  DEGRADED: {
    chip: 'bg-status-warn/15 text-status-warn border-status-warn/50',
    accent: 'border-l-status-warn',
    dot: 'bg-status-warn',
  },
  ALARM: {
    chip: 'bg-status-alarm/15 text-status-alarm border-status-alarm/50',
    accent: 'border-l-status-alarm',
    dot: 'bg-status-alarm',
  },
  OFFLINE: {
    chip: 'bg-status-stale/15 text-status-stale border-status-stale/50',
    accent: 'border-l-status-stale',
    dot: 'bg-status-stale',
  },
};

// The six tags that the card actually renders. The badge rolls up against
// THIS list — not against every sensor the snapshot happens to know about —
// so the badge stays in sync with what the operator sees on screen.
const DISPLAYED_TAGS = OPERATIONS_TILES.map((t) => t.tag);

const SignalIcon = ({ signal }: { signal: SignalStrength }) => {
  const cls = 'w-4 h-4 text-text-secondary';
  switch (signal) {
    case 'STRONG':
      return <SignalHigh className={cls} aria-label="Signal strong" />;
    case 'OK':
      return <SignalMedium className={cls} aria-label="Signal OK" />;
    case 'WEAK':
      return <SignalLow className={cls} aria-label="Signal weak" />;
    case 'NONE':
      return <SignalZero className={cls} aria-label="No signal" />;
    default:
      return <Signal className={cls} aria-hidden="true" />;
  }
};

export interface LiveMultiphaseUnitCardProps {
  /** The active job to render. */
  job: ActiveJobSnapshot;
  /** Display number for the header (e.g. "Multiphase Unit #2"). */
  displayNumber: number;
  /** Optional name override; falls back to the numbered label. */
  displayName?: string;
  /** Communication state (used for the signal icon + connection footer). */
  connectionStatus: CommunicationStatus;
  density?: 'comfortable' | 'compact';
  /**
   * F4.5G.2.2.1 — explicit declaration of which backend `MeasurementUnit.code`
   * this card's simulator job stands in for. Resolved upstream by
   * `useResolveBackendUnitId` to a backend UUID; threaded through to each
   * `<LiveVariableTile>` for the api-mode binding. Undefined / unresolvable
   * → tiles render the F2 simulator path with the `No backend unit match`
   * chip per F4.5G.2.2-0 §12.
   */
  backendUnitCode?: string;
}

const formatHHMM = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
};

const formatDurationSec = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
};

const formatLastUpdate = (ts: string | undefined, nowMs: number): string => {
  if (!ts) return '—';
  const ageMs = Math.max(0, nowMs - Date.parse(ts));
  const s = Math.floor(ageMs / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${String(s)} s ago`;
  const m = Math.floor(s / 60);
  return `${String(m)} min ago`;
};

const signalFromConnection = (conn: CommunicationStatus): SignalStrength => {
  switch (conn.kind) {
    case 'connected':
      return 'STRONG';
    case 'reconnecting':
      return 'WEAK';
    case 'disconnected':
      return 'NONE';
  }
};

export const LiveMultiphaseUnitCard = ({
  job,
  displayNumber,
  displayName,
  connectionStatus,
  density = 'comfortable',
  backendUnitCode,
}: LiveMultiphaseUnitCardProps) => {
  const now = useNowTick(5000);
  const unitSnap = useUnitTelemetrySnapshot({
    jobId: job.jobId,
    snapshot: job.snapshot,
    nowMs: now,
  });
  const compact = density === 'compact';

  // F4.5G.2.2.1 — resolve the backend `MeasurementUnit.id` UUID for this card
  // from `backendUnitCode` via the existing F4.4D units list. `null` ⇒ no
  // match (omitted binding, or the seed has no asset with that code).
  const resolver = useResolveBackendUnitId(backendUnitCode);
  const backendUnitId = resolver.unitId;

  // Latest-value REST hydration — disabled when `backendUnitId === null`.
  const latestValues = useOperationsLatestValues({ unitId: backendUnitId });

  // Realtime overlay — track the six tile slots for this card's resolved unit.
  // The realtime hook's `isUuidShaped` predicate provides defense in depth;
  // we still gate `trackedSlots` here so non-resolved cards never push slot
  // entries.
  const trackedSlots = useMemo<TrackedSlot[]>(() => {
    if (backendUnitId === null) return [];
    const slots: TrackedSlot[] = [];
    for (const tile of OPERATIONS_TILES) {
      const row = latestValues.valuesByTagName.get(String(tile.tag));
      if (!row) continue;
      slots.push({
        unitId: backendUnitId,
        canonicalTagId: row.canonicalTag.id,
        canonicalTagName: row.canonicalTag.name,
      });
    }
    return slots;
  }, [backendUnitId, latestValues.valuesByTagName]);

  const realtime = useOperationsRealtimeF4({ trackedSlots });

  const roll = rollUpUnitStatus(unitSnap.byTag, DISPLAYED_TAGS);
  const styles = statusStyles[roll.status];

  // Newest tag timestamp = "last update".
  let newestTs: string | undefined;
  for (const v of Object.values(unitSnap.byTag)) {
    const t = v.reading?.ts;
    if (!t) continue;
    if (!newestTs || Date.parse(t) > Date.parse(newestTs)) newestTs = t;
  }
  const startedSec = Math.max(0, Math.floor((now - Date.parse(job.startedAt)) / 1000));

  return (
    <article
      className={cn(
        'flex flex-col',
        'bg-surface border border-border-subtle rounded-sm',
        'border-l-2',
        styles.accent,
        compact ? 'p-3 gap-3' : 'p-4 gap-3.5',
        'transition-colors duration-fast ease-industrial',
        'hover:border-border-strong',
      )}
      aria-label={`Multiphase Unit ${String(displayNumber)}`}
      data-job-id={String(job.jobId)}
      data-card-status={roll.status}
    >
      <header className="flex items-start gap-3">
        {!compact && <UnitImage className="w-14 h-9" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold tracking-wide uppercase text-text-primary">
              {displayName ?? `Multiphase Unit #${String(displayNumber)}`}
            </h3>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-xs',
                'text-micro uppercase tracking-micro font-bold border',
                styles.chip,
              )}
            >
              <span
                aria-hidden="true"
                className={cn('inline-block w-1.5 h-1.5 rounded-full', styles.dot)}
              />
              {roll.status}
            </span>
            <span className="ml-auto">
              <SignalIcon signal={signalFromConnection(connectionStatus)} />
            </span>
          </div>

          <dl className="mt-2 grid grid-cols-4 gap-x-3 gap-y-0.5 text-xs">
            <MetaItem label="Well" value={String(job.wellId)} mono />
            <MetaItem label="Job" value={String(job.jobId)} mono />
            <MetaItem label="Unit" value={String(job.unitId)} mono />
            <MetaItem label="Started" value={formatHHMM(job.startedAt)} mono />
          </dl>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2">
        {OPERATIONS_TILES.map((t) => (
          <LiveVariableTile
            key={t.id}
            jobId={job.jobId}
            snapshot={job.snapshot}
            tile={t}
            density={density}
            backendUnitId={backendUnitId}
            latestValues={latestValues}
            realtimeConnection={realtime.connection}
            realtimeGetSlotValue={realtime.getSlotValue}
          />
        ))}
      </div>

      <footer className="grid grid-cols-4 gap-3 pt-2.5 border-t border-border-subtle">
        <FooterMetric label="Duration" value={formatDurationSec(startedSec)} />
        <FooterMetric
          label="Last Update"
          value={formatLastUpdate(newestTs, now)}
          valueClass={
            !newestTs || now - Date.parse(newestTs) > 30_000
              ? 'text-status-stale'
              : 'text-text-primary'
          }
        />
        <FooterMetric
          label="Active Alarms"
          value={
            roll.worstAlarm === 'alarm_high' || roll.worstAlarm === 'alarm_low'
              ? '1+'
              : roll.worstAlarm === 'warning_high' || roll.worstAlarm === 'warning_low'
                ? 'Warn'
                : '0'
          }
          valueClass={
            roll.status === 'ALARM'
              ? 'text-status-alarm'
              : roll.worstAlarm === 'warning_high' || roll.worstAlarm === 'warning_low'
                ? 'text-status-warn'
                : 'text-status-normal'
          }
        />
        <FooterMetric
          label="Stale Signals"
          value={String(roll.staleCount)}
          valueClass={roll.staleCount > 0 ? 'text-status-stale' : 'text-text-primary'}
        />
      </footer>
    </article>
  );
};

const MetaItem = ({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) => (
  <div className="min-w-0">
    <dt className="text-micro uppercase tracking-micro text-text-muted">{label}</dt>
    <dd
      className={cn('text-text-primary truncate', mono ? 'font-mono tabular-nums' : 'font-medium')}
    >
      {value}
    </dd>
  </div>
);

const FooterMetric = ({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) => (
  <div className="flex flex-col gap-0.5 min-w-0">
    <span className="text-micro uppercase tracking-micro text-text-muted">{label}</span>
    <span className={cn('text-sm font-semibold tabular-nums', valueClass ?? 'text-text-primary')}>
      {value}
    </span>
  </div>
);
