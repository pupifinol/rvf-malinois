/**
 * TrendDrawer — F4.5G.1.
 *
 * Lightweight portal-based drawer that opens when an operator clicks a
 * `<TrendCard>` in `<LiveTrendsPanelLive>`. Reuses the same
 * `useOperationsTrendSeries` hook the mini chart uses, so the mini chart
 * and the expanded view never diverge into separate data paths.
 *
 * Behavior matches F4.5G-0 §8:
 *
 *   - Right-side drawer on desktop (≥ md); bottom-up sheet on mobile.
 *   - Range pills: 15m / 1h / 6h / 24h / 7d. Default 1h.
 *   - Loading / empty / error states.
 *   - Latest value + timestamp (when available).
 *   - Freshness chip naming the data source (mock / api).
 *   - Close on ESC, backdrop click, or the close button.
 *   - Uses `createPortal` only after `useEffect` confirms `document` exists
 *     so SSR remains side-effect-free.
 *
 * No new chart library; no new design-system primitive. When a second
 * screen needs a drawer, this implementation can graduate to `packages/ui`.
 */
'use client';

import { cn } from '@rvf/ui';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { TrendChart } from './TrendChart';

import {
  type TrendWindow,
  TREND_WINDOWS,
  useOperationsTrendSeries,
} from '@/lib/hooks/useOperationsTrendSeries';

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

  if (!open || !mounted || typeof document === 'undefined') return null;

  const sourceLabel = result.source === 'api' ? 'Live backend' : 'Mock fixture';
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
            <div className="flex items-center gap-2 text-micro uppercase tracking-micro text-text-muted">
              <span>{unitLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{WINDOW_LABELS[result.window]}</span>
              <span aria-hidden="true">·</span>
              <span data-testid="trend-drawer-source">{sourceLabel}</span>
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
              latest={result.latest}
              isLoading={result.isLoading}
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

          <div className="flex-1 min-h-0">
            {result.isLoading ? (
              <LoadingState />
            ) : result.isError ? (
              <ErrorState />
            ) : result.isEmpty ? (
              <EmptyState />
            ) : (
              <TrendChart series={[result.series]} height={420} />
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
