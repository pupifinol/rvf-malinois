/**
 * TrendDrawer — F4.5G.1 + F4.5G.2.2.2 + F4.7.2.1.
 *
 * Lightweight portal-based drawer that opens when an operator clicks a
 * `<LiveVariableTile>` (per F4.5G.2.2.2). Reuses the same
 * `useOperationsTrendSeries` hook the mini chart uses, so the mini chart
 * and the expanded view never diverge into separate data paths.
 *
 * F4.7.2.1 — WellTest official measurement window pills. The drawer now
 * surfaces two range-pill rows:
 *
 *   1. **Primary row** — `Last Hour | Stabilization | Official Window |
 *      Full Test`. Backed by `useActiveWellTest` + `useWellTestWindow`.
 *      The `Official Window` pill is the default whenever a `measuring` /
 *      `completed` / `closed` WellTest exists; `Stabilization` is the
 *      default while the WellTest is `stabilizing`. Disabled pills carry
 *      an honest tooltip reason. The badge palette names the kind of
 *      range so a diagnostic `Last Hour` view can never be mistaken for
 *      a certified Official Window.
 *
 *   2. **Diagnostic row** — `15m | 1h | 6h | 24h | 7d`. Existing F4.5G.1
 *      generic ranges, preserved unchanged for diagnostic inspection. The
 *      `Diagnostic ranges` header makes their role explicit.
 *
 * The drawer derives `(fromMs, toMs)` from `useWellTestWindow` when a
 * primary pill is selected and forwards it through the new
 * `useOperationsTrendSeries` `windowRange` input. The trend backend API
 * (F4.6F.1) is unchanged — it already accepts arbitrary `from` / `to`.
 *
 * F4.5G.2.2.2 — F2 history-buffer fallback (preserved). The fallback
 * remains active for the `Last Hour` primary pill and for the diagnostic
 * row in mock-mode / unresolved-backend paths. The three official-window
 * pills (`Stabilization` / `Official Window` / `Full Test`) intentionally
 * do **not** activate the simulator fallback — simulator history would
 * lie about what was certified.
 *
 * Behavior matches F4.5G-0 §8 + F4.7.2-0 §10:
 *
 *   - Right-side drawer on desktop (≥ md); bottom-up sheet on mobile.
 *   - Two pill rows (primary + diagnostic).
 *   - Window summary line: `Official Window: HH:MM → now`.
 *   - Badge naming the range kind.
 *   - Reports footnote when an active WellTest exists.
 *   - Loading / empty / error states.
 *   - Latest value + timestamp (when available).
 *   - Freshness chip naming the data source (mock / api / simulator history).
 *   - Close on ESC, backdrop click, or the close button.
 *   - Uses `createPortal` only after `useEffect` confirms `document` exists
 *     so SSR remains side-effect-free.
 */
'use client';

import { brand } from '@rvf/types';
import { cn } from '@rvf/ui';
import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { TrendChart } from './TrendChart';

import type { WellTestRow } from '@/lib/api/f4';
import type { CanonicalTag, JobId } from '@rvf/types';

import { useActiveWellTest } from '@/lib/hooks/useActiveWellTest';
import { useHistoryBuffer } from '@/lib/hooks/useHistoryBuffer';
import {
  type TrendWindow,
  TREND_WINDOWS,
  WINDOW_MS,
  useOperationsTrendSeries,
} from '@/lib/hooks/useOperationsTrendSeries';
import {
  type DerivedWellTestWindow,
  type WellTestPillId,
  defaultPillForActiveWellTest,
  useWellTestWindow,
} from '@/lib/hooks/useWellTestWindow';

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
  /** Default *diagnostic* window opened with. Used only when no active WellTest
   *  is resolved (primary pill defaults override this when a WellTest exists). */
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

const PRIMARY_PILLS: readonly WellTestPillId[] = [
  'last_hour',
  'stabilization',
  'official_window',
  'full_test',
];

const formatTimestamp = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

/** Local time of day, `HH:MM`. Used by the window summary line. */
const formatHhmm = (iso: string | null): string => {
  if (iso === null) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

type Selection =
  | { kind: 'primary'; pillId: WellTestPillId }
  | { kind: 'diagnostic'; window: TrendWindow };

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

  useEffect(() => {
    setMounted(true);
  }, []);

  // F4.7.2.1 — resolve the active WellTest for the unit so the primary
  // pill row can derive `(fromMs, toMs)` from the official measurement
  // window. The hook tolerates `null` / non-fixture strings honestly.
  const activeWellTest = useActiveWellTest({ unitId });
  const active = activeWellTest.active;

  const computeInitialSelection = (): Selection =>
    active !== null
      ? { kind: 'primary', pillId: defaultPillForActiveWellTest(active) }
      : { kind: 'diagnostic', window: defaultWindow };

  const [selection, setSelection] = useState<Selection>(computeInitialSelection);

  // Re-sync the selection ONLY when the drawer opens, the metric changes,
  // or the WellTest identity / lifecycle changes. Re-syncing on every
  // render (which is what `initialSelection` in the deps array would do)
  // would silently undo operator clicks because the memoized object gets
  // a fresh identity on every render of the parent.
  const activeId = active?.id ?? null;
  const activeLifecycle = active?.lifecycleStatus ?? null;
  useEffect(() => {
    if (open) {
      setSelection(computeInitialSelection());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canonicalTagName, activeId, activeLifecycle, defaultWindow]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Always derive both the primary descriptor and the diagnostic window
  // shape so the trend hook signature stays stable across renders. The
  // hook ignores `windowRange` when undefined.
  const primaryPillId: WellTestPillId =
    selection.kind === 'primary' ? selection.pillId : 'last_hour';
  const derivedWindow: DerivedWellTestWindow = useWellTestWindow({
    active,
    pillId: primaryPillId,
  });

  const diagnosticWindow: TrendWindow =
    selection.kind === 'diagnostic' ? selection.window : defaultWindow;

  const windowRange = (() => {
    if (selection.kind !== 'primary' || derivedWindow.isDisabled) return undefined;
    const { fromMs, toMs, pillId } = derivedWindow;
    if (fromMs === null || toMs === null) return undefined;
    return { fromMs, toMs, pillId };
  })();

  const result = useOperationsTrendSeries({
    unitId,
    canonicalTagName,
    window: diagnosticWindow,
    windowRange,
    name: title,
    color,
    // Disable the fetch when the operator selected a primary pill whose
    // derived window is disabled (e.g. Stabilization before
    // `stabilizationStartedAt` is set — defensive only; the default-pill
    // rule normally prevents this state).
    enabled: open && !(selection.kind === 'primary' && derivedWindow.isDisabled),
    // The expanded view does not need 30-second poll pacing; the user opens
    // it for a focused inspection. A 60-second refresh keeps it honest
    // without re-fetching every tick.
    refetchIntervalMs: 60_000,
  });

  // F4.5G.2.2.2 — F2 history-buffer fallback (preserved). Eligibility per
  // F4.7.2-0 §9: only `Last Hour` (primary or generic diagnostic) and the
  // diagnostic row activate it. The three official pills NEVER fall back
  // to simulator history — simulator would lie about what was certified.
  const history = useHistoryBuffer(fallbackJobId ?? SENTINEL_JOB_ID, fallbackTag ?? SENTINEL_TAG);
  const fallbackEligibleSelection =
    selection.kind === 'diagnostic' ||
    (selection.kind === 'primary' && selection.pillId === 'last_hour');
  const fallbackEligible =
    open &&
    fallbackJobId !== undefined &&
    fallbackTag !== undefined &&
    fallbackEligibleSelection &&
    (result.source === 'mock' || !hasBackendMatch);

  // Effective fallback-window width:
  //   - diagnostic row → WINDOW_MS[selection.window]
  //   - primary Last Hour → 1 h (same as the diagnostic `1h`).
  const fallbackWindowMs =
    selection.kind === 'diagnostic' ? WINDOW_MS[selection.window] : WINDOW_MS['1h'];

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
    const fromEpoch = Date.now() - fallbackWindowMs;
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
    const firstRaw = history[0];
    const firstStoredMs = firstRaw ? Date.parse(firstRaw.ts) : Number.NaN;
    const coversWindow =
      Number.isFinite(firstStoredMs) && firstStoredMs <= fromEpoch && data.length > 0;
    return { data, latest, oldestTs, newestTs, coversWindow };
  }, [fallbackEligible, history, fallbackWindowMs]);

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

  // Window summary line — `<Label>: HH:MM → HH:MM | now`.
  // The right edge reads literally `now` when the descriptor's right boundary
  // is the wall clock — `last_hour`, `official_window` while measuring,
  // `stabilization`/`full_test` whose end timestamps are not yet set, and
  // any diagnostic generic range (their `to` always slides forward).
  const summaryLabel: string =
    selection.kind === 'primary' ? derivedWindow.label : WINDOW_LABELS[selection.window];
  const summaryFromIso: string | null =
    selection.kind === 'primary'
      ? derivedWindow.fromIso
      : new Date(Date.now() - WINDOW_MS[selection.window]).toISOString();
  const summaryEndsAtNow: boolean = selection.kind === 'primary' ? derivedWindow.endsAtNow : true;
  const summaryRightLabel: string = summaryEndsAtNow
    ? 'now'
    : formatHhmm(selection.kind === 'primary' ? derivedWindow.toIso : null);
  const summaryLeftLabel: string = formatHhmm(summaryFromIso);

  // Badge — names the kind of range so the operator can tell at a glance
  // what they are looking at.
  const badgeLabel: string =
    selection.kind === 'primary'
      ? active === null
        ? selection.pillId === 'last_hour'
          ? 'No active well test'
          : derivedWindow.badgeLabel
        : derivedWindow.badgeLabel
      : 'Diagnostic';

  const showReportsFootnote = active !== null;

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
              <span data-testid="trend-drawer-badge">{badgeLabel}</span>
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
          {/* F4.7.2.1 — Primary (official) pill row. */}
          <PrimaryPillRow
            active={active}
            selection={selection}
            onSelect={(pillId) => setSelection({ kind: 'primary', pillId })}
          />

          {/* F4.7.2.1 — Secondary diagnostic pill row (F4.5G.1 generic ranges). */}
          <DiagnosticRangeRow
            value={selection.kind === 'diagnostic' ? selection.window : null}
            onChange={(window) => setSelection({ kind: 'diagnostic', window })}
          />

          {/* Window summary line. */}
          <div
            className="text-micro uppercase tracking-micro text-text-muted"
            data-testid="trend-drawer-window-summary"
          >
            {summaryLabel}: {summaryLeftLabel} → {summaryRightLabel}
          </div>

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
              <EmptyState
                selection={selection}
                source={result.source}
                fallbackUsable={fallbackUsable}
              />
            ) : (
              <TrendChart series={[renderedSeries]} height={420} />
            )}
          </div>

          {showReportsFootnote ? (
            <p
              className="text-micro uppercase tracking-micro text-text-muted"
              data-testid="trend-drawer-reports-note"
            >
              Official reports use the official measurement window only.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );

  return createPortal(drawer, document.body);
};

const PrimaryPillRow = ({
  active,
  selection,
  onSelect,
}: {
  active: WellTestRow | null;
  selection: Selection;
  onSelect: (pillId: WellTestPillId) => void;
}) => (
  <div
    role="radiogroup"
    aria-label="Trend window — primary"
    className="flex items-center gap-1 flex-wrap"
    data-testid="trend-drawer-primary"
  >
    {PRIMARY_PILLS.map((pillId) => (
      <PrimaryPill
        key={pillId}
        pillId={pillId}
        active={active}
        selected={selection.kind === 'primary' && selection.pillId === pillId}
        onSelect={onSelect}
      />
    ))}
  </div>
);

const PrimaryPill = ({
  pillId,
  active,
  selected,
  onSelect,
}: {
  pillId: WellTestPillId;
  active: WellTestRow | null;
  selected: boolean;
  onSelect: (pillId: WellTestPillId) => void;
}) => {
  // Derive the disabled state without depending on the consuming hook's
  // memoization — this row is rendered once per pill, and a disabled state
  // is a pure function of `(active, pillId)`.
  const descriptor = useWellTestWindow({ active, pillId });
  const isDisabled = descriptor.isDisabled;
  const label = descriptor.label;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={isDisabled || undefined}
      disabled={isDisabled}
      title={isDisabled ? descriptor.disabledReason : undefined}
      onClick={() => {
        if (!isDisabled) onSelect(pillId);
      }}
      className={cn(
        'px-2.5 py-1 rounded text-xs uppercase tracking-wide font-semibold',
        'border transition-colors',
        selected
          ? 'bg-surface-raised border-border-subtle text-text-primary'
          : 'bg-transparent border-transparent text-text-muted hover:text-text-primary',
        isDisabled && 'opacity-50 cursor-not-allowed hover:text-text-muted',
      )}
      data-testid={`trend-drawer-pill-${pillId}`}
    >
      {label}
    </button>
  );
};

const DiagnosticRangeRow = ({
  value,
  onChange,
}: {
  /** `null` when the operator has not selected a diagnostic range yet. */
  value: TrendWindow | null;
  onChange: (next: TrendWindow) => void;
}) => (
  <div className="flex flex-col gap-1">
    <div className="text-micro uppercase tracking-micro text-text-muted">Diagnostic ranges</div>
    <div
      role="radiogroup"
      aria-label="Trend window — diagnostic ranges"
      className="flex items-center gap-1 flex-wrap"
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

const EmptyState = ({
  selection,
  source,
  fallbackUsable,
}: {
  selection: Selection;
  source: 'mock' | 'api';
  fallbackUsable: boolean;
}) => {
  // F4.7.2.1 — empty-state copy names the pill kind so the operator can
  // tell at a glance which window has no samples. Source is appended so a
  // production deployment cannot be mistaken for a mock-mode demo.
  const kind: string =
    selection.kind === 'primary'
      ? selection.pillId === 'official_window'
        ? 'official measurement window'
        : selection.pillId === 'stabilization'
          ? 'stabilization window'
          : selection.pillId === 'full_test'
            ? 'full test window'
            : 'last hour'
      : 'window';
  const sourceTail = fallbackUsable
    ? ' (Simulator history exhausted.)'
    : source === 'api'
      ? ' (Live backend.)'
      : ' (Mock fixture.)';
  return (
    <div
      className="h-full min-h-[160px] flex items-center justify-center text-xs text-text-muted text-center px-4"
      data-testid="trend-drawer-empty"
    >
      No samples in {kind}.{sourceTail}
    </div>
  );
};

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
