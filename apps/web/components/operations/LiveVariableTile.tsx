/**
 * LiveVariableTile — F2B + F4.5G.2.2.1.
 *
 * Visual twin of VariableTile. F2 behavior (icon row + big number +
 * sparkline + alarm-band shell) preserved verbatim in mock mode; F4.5G.2.2.1
 * adds an api-mode branch that binds the primary value to the F4.6C.2.1
 * latest-value endpoint via `useOperationsLatestValues`, with the F4.5G.2.1
 * realtime hook's `getSlotValue` overlaid as a fresher tail update when its
 * timestamp is strictly newer than the REST row.
 *
 * Per F4.5G.2.2-0 §11.1 / §11.2 / §12:
 *
 *   - REST is primary; realtime is best-effort tail.
 *   - Browser does NOT evaluate alarms. Tile shell color stays on the F2
 *     evaluator path against the commissioning snapshot (snapshot-as-source-
 *     of-truth posture inherited from ADR-005).
 *   - Per-tile chip names the active source honestly:
 *       'Mock fixture' / 'Live backend' / 'Reconnecting' /
 *       'Disconnected · last value HH:MM:SS UTC' / 'Loading…' /
 *       'Couldn't load latest' / 'No latest value' / 'No backend unit match'.
 *   - Mock mode / unresolved backend unit → F2 simulator path verbatim.
 *
 * The sparkline data source stays on the F2 ring buffer in both modes —
 * trend history via REST is a future concern. Tile primary number is the
 * field this phase migrates.
 */
'use client';

import { cn } from '@rvf/ui';
import { Expand } from 'lucide-react';

import { useOperationsTrendDrawer } from './OperationsTrendDrawer';
import { Sparkline } from './Sparkline';

import type { OperationsTileDescriptor } from './viewModel';
import type { AlarmState } from '@/lib/alarms/types';
import type { TelemetryLatestValue } from '@/lib/api/f4';
import type {
  OperationsRealtimeConnection,
  SlotLiveValue,
  UseOperationsLatestValuesResult,
} from '@/lib/hooks';
import type { CommissioningSnapshot } from '@/lib/jobs/types';
import type { JobId } from '@rvf/types';
import type { LucideIcon } from 'lucide-react';

import { useAlarmState, useHistoryBuffer, useLiveValue, useNowTick } from '@/lib/hooks';

export interface LiveVariableTileProps {
  jobId: JobId;
  snapshot: CommissioningSnapshot;
  tile: OperationsTileDescriptor;
  density?: 'comfortable' | 'compact';
  /**
   * F4.5G.2.2.1 — backend `MeasurementUnit.id` UUID (resolved upstream by
   * `<LiveMultiphaseUnitCard>` via `useResolveBackendUnitId`). `null` ⇒ no
   * backend match for this card's binding; tile renders F2 simulator path
   * with the `No backend unit match` chip.
   */
  backendUnitId?: string | null;
  /**
   * F4.5G.2.2.1 — shared latest-values hook output (one fetch per card,
   * shared across the card's six tiles). Undefined ⇒ no api-mode binding
   * (mock mode, or backendUnitId === null).
   */
  latestValues?: UseOperationsLatestValuesResult;
  /**
   * F4.5G.2.2.1 — realtime overlay slot lookup. Undefined ⇒ no overlay.
   * The card hands the same getter down to all six tiles; the tile looks up
   * its own canonical-tag-id from the latest row.
   */
  realtimeConnection?: OperationsRealtimeConnection;
  realtimeGetSlotValue?: (unitId: string, canonicalTagId: string) => SlotLiveValue | undefined;
  /**
   * F4.5G.2.2.2 — drawer identity. Set by `<LiveMultiphaseUnitCard>` so the
   * tile knows which `(unitId, unitTitle)` to dispatch when clicked.
   *
   *   - `drawerUnitId`: the id passed to `useOperationsTrendSeries`. In api+
   *     resolved mode this is a backend `MeasurementUnit.id` UUID; in mock
   *     mode with a `backendUnitCode` annotation it is the mock fixture UUID
   *     (resolved via `MOCK_F4_MEASUREMENT_UNITS`); for unresolved bindings
   *     it falls back to the simulator job's unit id.
   *   - `unitTitle`: the card's display name, e.g. `'Multiphase Unit #1'`.
   *   - `hasBackendMatch`: false when the binding has no `backendUnitCode`
   *     (or no fixture / unit list match); the drawer renders honestly.
   *
   * Optional only for backward-compatible test harnesses; the live Operations
   * screen always supplies them.
   */
  drawerUnitId?: string;
  drawerUnitTitle?: string;
  drawerHasBackendMatch?: boolean;
}

const formatValue = (v: number | null): string => {
  if (v === null) return '—';
  if (Math.abs(v) >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
};

const formatHHMMSS = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss} UTC`;
};

const shellByState: Record<AlarmState, { ring: string; value: string }> = {
  normal: { ring: 'border-border-subtle', value: 'text-text-primary' },
  warning_low: { ring: 'border-status-warn/50', value: 'text-status-warn' },
  warning_high: { ring: 'border-status-warn/50', value: 'text-status-warn' },
  alarm_low: { ring: 'border-status-alarm/60', value: 'text-status-alarm' },
  alarm_high: { ring: 'border-status-alarm/60', value: 'text-status-alarm' },
  no_data: { ring: 'border-border-subtle', value: 'text-text-muted' },
  disabled: { ring: 'border-border-subtle', value: 'text-text-muted' },
};

const TileIcon = ({ Icon, compact }: { Icon: LucideIcon; compact: boolean }) => (
  <Icon className={cn(compact ? 'w-3 h-3' : 'w-3.5 h-3.5')} aria-hidden="true" />
);

interface MergedTileValue {
  value: number | null;
  unit: string;
  /** ISO-8601 timestamp of the chosen value, or null. */
  timestamp: string | null;
  /** Where the value came from (for the source chip). */
  origin: 'rest' | 'realtime';
}

const mergeApiTileValue = (
  rest: TelemetryLatestValue | undefined,
  realtime: SlotLiveValue | undefined,
  fallbackUnit: string,
): MergedTileValue | null => {
  if (!rest && !realtime) return null;
  if (rest && realtime && Date.parse(realtime.timestamp) > Date.parse(rest.timestamp)) {
    return {
      value: parseDecimal(realtime.value),
      unit: realtime.engineeringUnit || fallbackUnit,
      timestamp: realtime.timestamp,
      origin: 'realtime',
    };
  }
  if (rest) {
    return {
      value: parseDecimal(rest.value),
      unit: rest.engineeringUnit || fallbackUnit,
      timestamp: rest.timestamp,
      origin: 'rest',
    };
  }
  if (realtime) {
    return {
      value: parseDecimal(realtime.value),
      unit: realtime.engineeringUnit || fallbackUnit,
      timestamp: realtime.timestamp,
      origin: 'realtime',
    };
  }
  return null;
};

const parseDecimal = (raw: string): number | null => {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

export const LiveVariableTile = ({
  jobId,
  snapshot,
  tile,
  density = 'comfortable',
  backendUnitId,
  latestValues,
  realtimeConnection,
  realtimeGetSlotValue,
  drawerUnitId,
  drawerUnitTitle,
  drawerHasBackendMatch,
}: LiveVariableTileProps) => {
  const compact = density === 'compact';
  const now = useNowTick(5000);
  const drawer = useOperationsTrendDrawer();

  // F2 substrate — always called at fixed positions for React-rules cleanliness;
  // the tile chooses between F2 and api-mode branches at the value-resolution
  // step below.
  const live = useLiveValue(tile.tag, { jobId, snapshot, nowMs: now });
  const alarm = useAlarmState(tile.tag, { jobId, snapshot, nowMs: now });
  const history = useHistoryBuffer(jobId, tile.tag);

  // API-mode branch is active when the card resolved a backend UUID AND
  // wired the latest-values hook + realtime overlay down to this tile.
  const apiResolved =
    backendUnitId !== null && backendUnitId !== undefined && latestValues !== undefined;

  // Map the tile's canonical-tag string to the latest-values row by name.
  // The hook keys by `canonicalTag.name`; OperationsTileDescriptor.tag is the
  // same canonical-tag string (e.g. 'p_inlet').
  const restRow = apiResolved ? latestValues.valuesByTagName.get(String(tile.tag)) : undefined;

  // Realtime slot lookup by `(unitId, canonicalTagId)`. We can only look this
  // up once REST has resolved (the realtime envelope uses UUIDs; we need
  // `restRow.canonicalTag.id` to match).
  const realtimeSlot =
    apiResolved && backendUnitId && realtimeGetSlotValue && restRow
      ? realtimeGetSlotValue(backendUnitId, restRow.canonicalTag.id)
      : undefined;

  const merged = apiResolved ? mergeApiTileValue(restRow, realtimeSlot, tile.fallbackUnit) : null;

  // Alarm state still comes from the F2 evaluator path against the
  // commissioning snapshot (ADR-005-compliant: snapshot is the source of
  // truth, not a live browser computation).
  const state: AlarmState = alarm?.state ?? 'no_data';
  const shell = shellByState[state];

  // Resolve the displayed primary value:
  //   - api-mode + merged row → merged.value
  //   - api-mode + no merged row → null (chip will say 'No latest value')
  //   - mock-mode or unresolved backend → F2 live.value
  const displayValue = apiResolved ? (merged?.value ?? null) : (live?.value ?? null);
  const displayUnit = apiResolved
    ? (merged?.unit ?? tile.fallbackUnit)
    : (live?.unit ?? tile.fallbackUnit);
  const status = live?.status ?? 'offline';

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

  const sourceChip = deriveSourceChip({
    apiResolved,
    backendUnitId,
    latestValues,
    merged,
    realtimeConnection,
  });

  // F4.5G.2.2.2 — drawer dispatch. Each tile is the primary entry point to
  // the expanded `<TrendDrawer>` for its own `(unit, canonical tag)` slot.
  // The card supplies the resolved drawer identity; if the host did not
  // (older test harnesses), the click is a no-op via the provider-less
  // fallback in `useOperationsTrendDrawer`.
  const canOpenDrawer = drawerUnitId !== undefined && drawerUnitTitle !== undefined;
  const handleClick = canOpenDrawer
    ? () => {
        drawer.open({
          unitId: drawerUnitId,
          canonicalTagName: String(tile.tag),
          variableTitle: tile.label,
          unitTitle: drawerUnitTitle,
          unitLabel: displayUnit,
          color: tile.sparkColor.replace(/^text-/, 'var(--') + ')',
          hasBackendMatch: drawerHasBackendMatch ?? true,
          // F4.5G.2.2.2 — same `(jobId, tag)` the tile's mini sparkline reads
          // from. The drawer uses this to render the simulator history when
          // the trend adapter is empty in mock / unresolved paths.
          fallbackJobId: jobId,
          fallbackTag: tile.tag,
        });
      }
    : undefined;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!canOpenDrawer}
      aria-label={`Open expanded ${tile.label} trend view for ${drawerUnitTitle ?? 'this unit'}`}
      className={cn(
        'flex flex-col bg-surface-raised border rounded-sm text-left',
        'transition-colors duration-fast ease-industrial',
        compact ? 'p-2 gap-1' : 'p-3 gap-1.5',
        shell.ring,
        canOpenDrawer
          ? 'cursor-pointer hover:border-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus'
          : 'cursor-default',
      )}
      data-state={state}
      data-status={status}
      data-tile={tile.id}
      data-source-chip={sourceChip}
      data-testid={`tile-${tile.id}`}
    >
      <div className="flex items-center gap-1.5 text-text-secondary">
        <TileIcon Icon={tile.icon} compact={compact} />
        <span className="text-micro uppercase tracking-micro font-medium truncate">
          {tile.label}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {statusLabel ? (
            <span className="text-micro uppercase tracking-micro text-text-muted">
              {statusLabel}
            </span>
          ) : null}
          {canOpenDrawer ? (
            <Expand
              className="w-3 h-3 text-text-muted"
              aria-hidden="true"
              data-testid={`tile-expand-${tile.id}`}
            />
          ) : null}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5 leading-none">
        <span
          className={cn(
            'font-semibold tabular-nums leading-none',
            compact ? 'text-lg' : 'text-2xl',
            shell.value,
          )}
        >
          {formatValue(displayValue)}
        </span>
        <span className="text-xs text-text-muted tabular-nums">{displayUnit}</span>
      </div>
      <span
        className="text-micro uppercase tracking-micro text-text-muted truncate"
        data-testid={`tile-source-${tile.id}`}
      >
        {sourceChip}
      </span>
      <Sparkline
        data={sparkData}
        height={compact ? 18 : 22}
        width={compact ? 90 : 130}
        strokeWidth={1.1}
        className={cn('w-full', sparkOpacity, sparkClass)}
      />
    </button>
  );
};

const deriveSourceChip = (args: {
  apiResolved: boolean;
  backendUnitId: string | null | undefined;
  latestValues: UseOperationsLatestValuesResult | undefined;
  merged: MergedTileValue | null;
  realtimeConnection: OperationsRealtimeConnection | undefined;
}): string => {
  const { apiResolved, backendUnitId, latestValues, merged, realtimeConnection } = args;

  // Mock mode (no backend binding wired down) → honest mock label.
  if (!apiResolved || latestValues === undefined) {
    return backendUnitId === null ? 'No backend unit match' : 'Mock fixture';
  }

  if (latestValues.isLoading) return 'Loading…';
  if (latestValues.isError) return "Couldn't load latest";
  if (merged === null) return 'No latest value';

  // Realtime overlay state controls the chip nuance even when REST is fresh.
  switch (realtimeConnection?.kind) {
    case 'reconnecting':
      return 'Reconnecting';
    case 'disconnected': {
      const ts = merged.timestamp ?? realtimeConnection.lastDataAt;
      return ts ? `Disconnected · last value ${formatHHMMSS(ts)}` : 'Disconnected';
    }
    case 'connected':
    case 'connecting':
    case 'disabled':
    case undefined:
    default:
      return 'Live backend';
  }
};
