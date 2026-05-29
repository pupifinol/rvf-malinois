/**
 * OperationsTrendDrawer — F4.5G.2.2.2.
 *
 * Page-level orchestration for the expanded trend drawer. Replaces the
 * previous F4.5G.1 wiring where the only click target was the global
 * `<LiveTrendsPanelLive>` mini chart — which displayed "No samples in
 * window" for `Liquid Flow` because the mock-mode trend fixture is keyed by
 * `(HP_001_ID, 'p_inlet'|'q_gas')` only and the global panel was passing
 * the simulator catalog string `'EMMAD-01'` plus `'q_liquid'`.
 *
 * Operational target post-fix:
 *
 *   - Each variable tile inside `<LiveMultiphaseUnitCard>` is the **primary**
 *     drawer entry point. The tile dispatches `openOperationsTrendDrawer(...)`
 *     with the resolved `(unitId, canonicalTagName)` and the unit / tile
 *     identity metadata.
 *   - One drawer instance per Operations page (single inspection focus at
 *     a time). State is owned here, not on each card.
 *   - The global `<LiveTrendsPanelLive>` retains its visual chrome but its
 *     mini-charts are no longer click-to-expand — they were aggregating
 *     across all OPERATIONS_JOBS cards and were not the operationally
 *     useful target.
 *
 * Mock / api / unresolved unit semantics are decided by the call site (the
 * tile / card pair). This provider only owns "which slot is currently
 * selected" — the drawer body itself is the existing F4.5G.1 `<TrendDrawer>`
 * unchanged.
 */
'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { TrendDrawer } from './TrendDrawer';

import type { TrendWindow } from '@/lib/hooks/useOperationsTrendSeries';
import type { CanonicalTag, JobId } from '@rvf/types';

export interface OperationsTrendDrawerSelection {
  /**
   * The id passed to `useOperationsTrendSeries`. In api+resolved mode this
   * is a backend `MeasurementUnit.id` UUID; in mock mode with a known
   * backend code annotation it is the deterministic mock fixture UUID
   * (e.g. `HP_001_ID`); for unresolved bindings it falls back to the
   * simulator job's unit id (the chart will be empty — honest).
   */
  unitId: string;
  /** Canonical tag identifier (e.g. `p_inlet`, `q_liquid`). */
  canonicalTagName: string;
  /** Variable label, e.g. `'Pressure'` / `'Oil Rate'`. */
  variableTitle: string;
  /** Unit context label, e.g. `'Multiphase Unit #1'`. Surfaced in the drawer header. */
  unitTitle: string;
  /** Engineering unit fallback, e.g. `'psi'`. */
  unitLabel: string;
  /** Optional accent color. */
  color?: string;
  /** Optional starting range pill. Defaults to F4.5G-0 §7.2 (`1h`). */
  defaultWindow?: TrendWindow;
  /**
   * `true` when the card binding has no matching backend unit. The drawer
   * still opens (so the operator can inspect the simulator history honestly),
   * but the subtitle includes the `No backend unit match` caveat.
   */
  hasBackendMatch: boolean;
  /**
   * F4.5G.2.2.2 — F2 history-buffer fallback identity. Mirrors the tile's
   * own `useHistoryBuffer(jobId, tile.tag)` so when the trend adapter is
   * empty AND we're in mock mode or an unresolved binding, the drawer
   * renders the same series the tile's mini sparkline is reading from.
   */
  fallbackJobId?: JobId;
  fallbackTag?: CanonicalTag;
}

interface OperationsTrendDrawerContextValue {
  open: (selection: OperationsTrendDrawerSelection) => void;
  close: () => void;
}

const OperationsTrendDrawerContext = createContext<OperationsTrendDrawerContextValue | undefined>(
  undefined,
);

/**
 * Wraps the Operations page. Exposes `useOperationsTrendDrawer()` to any
 * descendant (the `<LiveVariableTile>` is the primary caller). Renders one
 * `<TrendDrawer>` based on the current selection.
 */
export const OperationsTrendDrawerProvider = ({ children }: { children: ReactNode }) => {
  const [selection, setSelection] = useState<OperationsTrendDrawerSelection | null>(null);

  const open = useCallback((next: OperationsTrendDrawerSelection) => {
    setSelection(next);
  }, []);
  const close = useCallback(() => {
    setSelection(null);
  }, []);

  const value = useMemo<OperationsTrendDrawerContextValue>(() => ({ open, close }), [open, close]);

  return (
    <OperationsTrendDrawerContext.Provider value={value}>
      {children}
      {selection ? (
        <TrendDrawer
          open
          onClose={close}
          unitId={selection.unitId}
          canonicalTagName={selection.canonicalTagName}
          title={
            selection.hasBackendMatch
              ? `${selection.variableTitle} — ${selection.unitTitle}`
              : `${selection.variableTitle} — ${selection.unitTitle} · No backend unit match`
          }
          unitLabel={selection.unitLabel}
          color={selection.color}
          defaultWindow={selection.defaultWindow}
          fallbackJobId={selection.fallbackJobId}
          fallbackTag={selection.fallbackTag}
          hasBackendMatch={selection.hasBackendMatch}
        />
      ) : null}
    </OperationsTrendDrawerContext.Provider>
  );
};

/**
 * Open / close handles for the page's expanded trend drawer. Returns a
 * `disabled` adapter when no provider is mounted so unrelated callers
 * (tests / Storybook / preview screens) do not crash.
 */
export const useOperationsTrendDrawer = (): OperationsTrendDrawerContextValue => {
  const ctx = useContext(OperationsTrendDrawerContext);
  if (!ctx) {
    return {
      open: () => {
        /* no-op when no provider is mounted */
      },
      close: () => {
        /* no-op when no provider is mounted */
      },
    };
  }
  return ctx;
};
