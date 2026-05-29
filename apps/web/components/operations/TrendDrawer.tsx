/**
 * TrendDrawer — F4.5G.1 + F4.5G.2.2.2.
 *
 * Lightweight portal-based drawer that opens when an operator clicks a
 * `<LiveVariableTile>` (per F4.5G.2.2.2). Reuses the same
 * `useOperationsTrendSeries` hook the mini chart uses, so the mini chart
 * and the expanded view never diverge into separate data paths.
 *
 * F4.5G.2.2.2 — F2 history-buffer fallback. The trend adapter is keyed by
 * `(unitId, canonicalTag)` against either the backend (api mode) or the
 * mock fixture (mock mode). The mock fixture only ships data for a handful
 * of `(unit, tag)` pairs (HP-001 / p_inlet / q_gas), but the F2 simulator
 * pushes readings for every tag the snapshot defines — that's the buffer
 * powering the tile's mini sparkline. So when the trend adapter returns
 * empty AND we're not in a path where backend-empty is the honest answer,
 * we render the F2 ring buffer instead. Concretely:
 *
 *   - api mode + resolved backend unit (`hasBackendMatch === true`):
 *     trend adapter is authoritative. Empty ⇒ "No samples in window."
 *   - mock mode: trend adapter is fixture-based and incomplete. Empty ⇒
 *     fall back to the F2 ring buffer, label the chip "Simulator history".
 *   - api mode + no backend match (`hasBackendMatch === false`): no fake
 *     backend lookup. Trend adapter shouldn't have data; fall back to the
 *     F2 ring buffer, label the chip "Simulator history".
 *
 * Behavior matches F4.5G-0 §8:
 *
 *   - Right-side drawer on desktop (≥ md); bottom-up sheet on mobile.
 *   - Range pills: 15m / 1h / 6h / 24h / 7d. Default 1h.
 *   - Loading / empty / error states.
 *   - Latest value + timestamp (when available).
 *   - Freshness chip naming the data source (mock / api / simulator history).
 *   - Close on ESC, backdrop click, or the close button.
 *   - Uses `createPortal` only after `useEffect` confirms `document` exists
 *     so SSR remains side-effect-free.
 *
 * No new chart library; no new design-system primitive. When a second
 * screen needs a drawer, this implementation can graduate to `packages/ui`.
 */
'use client';

import { brand } from '@rvf/types';
import { cn } from '@rvf/ui';
import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { TrendChart } from './TrendChart';

import type { CanonicalTag, JobId } from '@rvf/types';

import { useHistoryBuffer } from '@/lib/hooks/useHistoryBuffer';
import {
  type TrendWindow,
  TREND_WINDOWS,
  WINDOW_MS,
  useOperationsTrendSeries,
} from '@/lib/hooks/useOperationsTrendSeries';

/** Sentinel pair for `useHistoryBuffer` when no fallback identity was supplied.
 * The F2 telemetry store returns an empty array for any unknown `(jobId, tag)`
 * pair, so this never produces phantom data — it just lets us call the hook
 * unconditionally without React-rules violations. */
const SENTINEL_JOB_ID = brand<string, 'JobId'>('__trend-drawer-fallback-noop__') as JobId;
const SENTINEL_TAG = brand<string, 'CanonicalTag'>(
  '__trend-drawer-fallback-noop__',
) as CanonicalTag;

export interface TrendDrawerProps {
  /** Render only when `open` flips to `true`. */
  open: boolean;
  onClose: () => void;
  /** Backend `MeasurementUnit.id` (or simulator id in mock mode). */
  unitId: string;
  /** Canonical tag identifier (e.g. `p_inlet`). */
  canonicalTagName: string;
  /** Title displayed at the top of the drawer (variable + unit, optional). */
  title: string;
  /** Subtitle below the title — typically the engineering unit label. */
  unitLabel: string;
  /** Optional accent color reference for the rendered series. */
  color?: string;
  /** Default window opened with. Defaults to 1h per F4.5G-0 §7.2. */
  defaultWindow?: TrendWindow;
  /**
   * F4.5G.2.2.2 — F2 history-buffer fallback identity. When the trend adapter
   * is empty AND we're not in an api+resolved-backend path, the drawer
   * renders the F2 ring buffer for `(fallbackJobId, fallbackTag)` instead.
   * Omitted ⇒ no fallback attempted (existing F4.5G.1 behavior). */
  fallbackJobId?: JobId;
  fallbackTag?: CanonicalTag;
  /**
   * F4.5G.2.2.2 — `true` when `unitId` resolved to a real backend asset.
   * When omitted, defaults to `true` so existing F4.5G.1 callers retain
   * "backend-empty is honest" behavior. The drawer only consults the
   * fallback when this is `false` OR `source === 'mock'`.
   */
  hasBackendMatch?: boolean;
}

const DEFAULT_COLOR = 'var(--series-1)';

const WINDOW_LABELS: Record<TrendWindow, string> = {
  '15m': '15m',
  '1h': '1h',
  '6h': '6h',
  '24h': '24h',
  '7d': '7d',
};

const formatTimestamp = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

export const TrendDrawer = ({
  open,
  onClose,
  unitId,
  canonicalTagName,
  title,
  unitLabel,
  color = DEFAULT_COLOR,
  defaultWindow = '1h',
  fallbackJobId,
  fallbackTag,
  hasBackendMatch = true,
}: TrendDrawerProps) => {
  const [mounted, setMounted] = useState(false);
  const [window, setWindow] = useState<TrendWindow>(defaultWindow);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset to default window every time the drawer reopens for a different
  // metric (so opening Inlet Pressure → closing → opening Liquid Flow
  // starts at the default window, not whatever the last user picked).
  useEffect(() => {
    if (open) {
      setWindow(defaultWindow);
    }
  }, [open, canonicalTagName, defaultWindow]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const result = useOperationsTrendSeries({
    unitId,
    canonicalTagName,
    window,
    name: title,
    color,
    enabled: open,
    // The expanded view does not need 30-second poll pacing; the user opens it
    // for a focused inspection. A 60-second refresh keeps it honest without
    // re-fetching every tick.
    refetchIntervalMs: 60_000,
  });

  // F4.5G.2.2.2 — F2 history-buffer fallback (see header docblock for policy).
  // Called unconditionally with sentinels when no identity supplied; the F2
  // store yields `EMPTY_HISTORY` for any unknown pair, so the call is harmless.
  const history = useHistoryBuffer(fallbackJobId ?? SENTINEL_JOB_ID, fallbackTag ?? SENTINEL_TAG);
  const fallbackEligible =
    open &&
    fallbackJobId !== undefined &&
    fallbackTag !== undefined &&
    (result.source === 'mock' || !hasBackendMatch);

  // Window-aware filter for the fallback series. Each `TelemetryReading`
  // carries an ISO-8601 `ts` (edge-measured), so we filter by `ts >= now -
  // WINDOW_MS[window]`. The F2 ring buffer caps at 256 readings at 1 Hz
  // (≈ 4 min), so for any range ≥ 15m the filter is effectively a passthrough
  // and `bufferCoversWindow` will be `false` — that's surfaced as the
  // honesty caveat next to the chip, so the operator isn't misled into
  // thinking the simulator owns deep history.
  const fallbackFilter = useMemo(() => {
    if (!fallbackEligible || history.length === 0) {
      return {
        data: [] as number[],
        latest: null as { value: number; timestamp: string } | null,
        oldestTs: null as string | null,
        newestTs: null as string | null,
        coversWindow: false,
      };
    }
    const fromEpoch = Date.now() - WINDOW_MS[window];
    const data: number[] = [];
    let latest: { value: number; timestamp: string } | null = null;
    let oldestTs: string | null = null;
    let newestTs: string | null = null;
    for (const r of history) {
      const tsMs = Date.parse(r.ts);
      if (Number.isNaN(tsMs) || tsMs < fromEpoch) continue;
      if (r.value !== null && Number.isFinite(r.value)) {
        data.push(r.value);
        latest = { value: r.value, timestamp: r.ts };
      }
      oldestTs = oldestTs ?? r.ts;
      newestTs = r.ts;
    }
    // Honest: the buffer covers the selected window only if the very first
    // stored reading sits at or before the window's `from` edge.
    const firstRaw = history[0];
    const firstStoredMs = firstRaw ? Date.parse(firstRaw.ts) : Number.NaN;
    const coversWindow =
      Number.isFinite(firstStoredMs) && firstStoredMs <= fromEpoch && data.length > 0;
    return { data, latest, oldestTs, newestTs, coversWindow };
  }, [fallbackEligible, history, window]);

  const fallbackSeries = useMemo(
    () => ({ name: title, color, data: fallbackFilter.data }),
    [title, color, fallbackFilter.data],
  );

  if (!open || !mounted || typeof document === 'undefined') return null;

  const fallbackUsable = fallbackEligible && result.isEmpty && fallbackSeries.data.length > 0;

  const renderedSeries = fallbackUsable ? fallbackSeries : result.series;
  const renderedLatest = fallbackUsable ? fallbackFilter.latest : result.latest;
  const renderedIsEmpty = fallbackUsable ? renderedSeries.data.length === 0 : result.isEmpty;
  const stats = computeSeriesStats(renderedSeries.data);
  const sourceLabel = fallbackUsable
    ? 'Simulator history'
    : result.source === 'api'
      ? 'Live backend'
      : 'Mock fixture';
  const fallbackShortLabel =
    fallbackUsable && !fallbackFilter.coversWindow
      ? 'Simulator buffer shorter than selected range'
      : '';
  const freshnessLabel = result.lastDataAt ? `Loaded ${formatTimestamp(result.lastDataAt)}` : '';

  const drawer = (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end"
      data-testid="trend-drawer-root"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close trend view"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 cursor-default"
        data-testid="trend-drawer-backdrop"
      />

      {/* Drawer panel */}
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Expanded trend view for ${title}`}
        className={cn(
          'relative bg-surface border border-border-subtle shadow-lg flex flex-col',
          'w-full h-[92vh] rounded-t-md',
          'md:rounded-none md:rounded-l-md md:h-full md:max-w-[880px] md:w-[95vw]',
        )}
      >
        <header className="flex items-start justify-between gap-3 p-4 border-b border-border-subtle">
          <div className="flex flex-col gap-1 min-w-0">
            <h2 className="text-sm uppercase tracking-wide font-bold text-text-primary truncate">
              {title}
            </h2>
            <div className="flex items-center gap-2 text-micro uppercase tracking-micro text-text-muted flex-wrap">
              <span>{unitLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{WINDOW_LABELS[result.window]}</span>
              <span aria-hidden="true">·</span>
              <span data-testid="trend-drawer-source">{sourceLabel}</span>
              {fallbackShortLabel ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-status-warn" data-testid="trend-drawer-short-buffer">
                    {fallbackShortLabel}
                  </span>
                </>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close trend view"
            className="text-text-muted hover:text-text-primary p-1 rounded"
            data-testid="trend-drawer-close"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </header>

        <div className="p-4 flex flex-col gap-3 flex-1 min-h-0">
          <RangeSelector value={window} onChange={setWindow} />

          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <LatestValue
              latest={renderedLatest}
              isLoading={result.isLoading && !fallbackUsable}
              unitLabel={unitLabel}
            />
            {freshnessLabel ? (
              <span
                className="text-micro uppercase tracking-micro text-text-muted"
                data-testid="trend-drawer-freshness"
              >
                {freshnessLabel}
              </span>
            ) : null}
          </div>

          {stats.count > 0 ? <StatsStrip stats={stats} unitLabel={unitLabel} /> : null}

          <div className="flex-1 min-h-0">
            {result.isLoading && !fallbackUsable ? (
              <LoadingState />
            ) : result.isError && !fallbackUsable ? (
              <ErrorState />
            ) : renderedIsEmpty ? (
              <EmptyState />
            ) : (
              <TrendChart series={[renderedSeries]} height={420} />
            )}
          </div>
        </div>
      </section>
    </div>
  );

  return createPortal(drawer, document.body);
};

const RangeSelector = ({
  value,
  onChange,
}: {
  value: TrendWindow;
  onChange: (next: TrendWindow) => void;
}) => (
  <div
    role="radiogroup"
    aria-label="Trend window range"
    className="flex items-center gap-1"
    data-testid="trend-drawer-range"
  >
    {TREND_WINDOWS.map((window) => {
      const selected = window === value;
      return (
        <button
          key={window}
          type="button"
          role="radio"
          aria-checked={selected}
          onClick={() => onChange(window)}
          className={cn(
            'px-2.5 py-1 rounded text-xs uppercase tracking-wide font-semibold',
            'border transition-colors',
            selected
              ? 'bg-surface-raised border-border-subtle text-text-primary'
              : 'bg-transparent border-transparent text-text-muted hover:text-text-primary',
          )}
          data-testid={`trend-drawer-range-${window}`}
        >
          {WINDOW_LABELS[window]}
        </button>
      );
    })}
  </div>
);

const LatestValue = ({
  latest,
  isLoading,
  unitLabel,
}: {
  latest: { value: number; timestamp: string } | null;
  isLoading: boolean;
  unitLabel: string;
}) => {
  if (isLoading) {
    return (
      <span className="text-xs text-text-muted" data-testid="trend-drawer-latest-loading">
        Loading…
      </span>
    );
  }
  if (!latest) return null;
  return (
    <div className="flex items-baseline gap-2" data-testid="trend-drawer-latest">
      <span className="text-2xl font-semibold tabular-nums text-text-primary">
        {latest.value.toLocaleString(undefined, { maximumFractionDigits: 3 })}
      </span>
      <span className="text-xs uppercase tracking-wide text-text-muted">{unitLabel}</span>
      <span className="text-micro uppercase tracking-micro text-text-muted">
        @ {formatTimestamp(latest.timestamp)}
      </span>
    </div>
  );
};

const LoadingState = () => (
  <div
    className="h-full min-h-[160px] flex items-center justify-center text-xs text-text-muted"
    data-testid="trend-drawer-loading"
  >
    Loading trend…
  </div>
);

const EmptyState = () => (
  <div
    className="h-full min-h-[160px] flex items-center justify-center text-xs text-text-muted"
    data-testid="trend-drawer-empty"
  >
    No samples in window.
  </div>
);

const ErrorState = () => (
  <div
    className="h-full min-h-[160px] flex items-center justify-center text-xs text-status-alarm"
    data-testid="trend-drawer-error"
  >
    Couldn&apos;t load trend.
  </div>
);

interface SeriesStats {
  count: number;
  min: number | null;
  max: number | null;
  avg: number | null;
}

/** Compact min / max / avg / count summary over the rendered series. Used by
 * both the api-mode trend response and the F2 fallback. Returns `null` for
 * the numeric fields when `count === 0` so the UI can skip them honestly. */
const computeSeriesStats = (data: readonly number[]): SeriesStats => {
  if (data.length === 0) return { count: 0, min: null, max: null, avg: null };
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  for (const v of data) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  if (!Number.isFinite(min)) return { count: 0, min: null, max: null, avg: null };
  return { count: data.length, min, max, avg: sum / data.length };
};

const formatStat = (v: number): string => {
  if (Math.abs(v) >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
};

const StatsStrip = ({ stats, unitLabel }: { stats: SeriesStats; unitLabel: string }) => (
  <dl
    className="grid grid-cols-4 gap-3 px-2 py-1.5 bg-surface-raised border border-border-subtle rounded-xs"
    data-testid="trend-drawer-stats"
  >
    <StatItem label={`Samples`} value={String(stats.count)} testId="trend-drawer-stat-count" />
    <StatItem
      label={`Min ${unitLabel}`}
      value={stats.min !== null ? formatStat(stats.min) : '—'}
      testId="trend-drawer-stat-min"
    />
    <StatItem
      label={`Max ${unitLabel}`}
      value={stats.max !== null ? formatStat(stats.max) : '—'}
      testId="trend-drawer-stat-max"
    />
    <StatItem
      label={`Avg ${unitLabel}`}
      value={stats.avg !== null ? formatStat(stats.avg) : '—'}
      testId="trend-drawer-stat-avg"
    />
  </dl>
);

const StatItem = ({ label, value, testId }: { label: string; value: string; testId: string }) => (
  <div className="flex flex-col gap-0.5 min-w-0">
    <dt className="text-micro uppercase tracking-micro text-text-muted truncate">{label}</dt>
    <dd className="text-xs font-semibold tabular-nums text-text-primary" data-testid={testId}>
      {value}
    </dd>
  </div>
);
