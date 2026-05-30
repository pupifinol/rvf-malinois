/**
 * useWellTestWindow / deriveWellTestWindow — F4.7.2.1.
 *
 * Pure derivation of `(fromMs, toMs)` for the four primary `<TrendDrawer>`
 * pills introduced by F4.7.2.1, plus a thin React hook that quantizes
 * `Date.now()` to a 15-second bucket so successive renders in the same
 * bucket share a TanStack Query cache entry.
 *
 * Per F4.7.2-0 §7:
 *
 *   - `last_hour` — diagnostic; always enabled; `(now - 1h, now)`.
 *   - `stabilization` — `(stabilizationStartedAt, stabilizationEndedAt ??
 *     officialStartedAt ?? now)`. Disabled when `stabilizationStartedAt` is
 *     null. No simulator-history fallback in the consuming drawer.
 *   - `official_window` — `(officialStartedAt, …)`:
 *       - `'measuring'` → end = `now`.
 *       - `'completed' | 'closed'` → end = `officialEndedAt`. If null:
 *         invariant violation → disabled with the explicit reason from
 *         F4.7.2-0 §7.3.
 *       - `'aborted'` → end = `abortedAt ?? officialEndedAt ?? now`. Badge
 *         `Official Window aborted`.
 *       - `'scheduled' | 'connected' | 'stabilizing'` → unreachable because
 *         the availability gate already disabled the pill; the function
 *         still returns a disabled descriptor for defensive callers.
 *   - `full_test` — `(connectedAt ?? stabilizationStartedAt ??
 *     officialStartedAt, disconnectedAt ?? officialEndedAt ?? now)`.
 *     Disabled when no `connectedAt` and no `stabilizationStartedAt` are set.
 *
 * Hard rules:
 *
 *   - No mutation of `WellTest`. The input row is treated as opaque.
 *   - No backend calls; no Date.now() at module load.
 *   - Aborted tests surface honestly via `kind: 'official'` plus an
 *     `aborted` flag on the descriptor; the drawer uses the flag to render
 *     the `Official Window aborted` badge.
 *   - `last_hour` is always enabled even when an active WellTest exists —
 *     it's the diagnostic escape hatch.
 */
'use client';

import { useMemo } from 'react';

import type { WellTestRow } from '@/lib/api/f4';

/** Quantize a `nowMs` epoch to a 15-second bucket so successive calls in
 *  the same bucket return identical `(fromMs, toMs)` values — matches the
 *  CACHE_BUCKET_MS pattern in `useOperationsTrendSeries.ts`. Exported for
 *  hook-internal use only. */
const CACHE_BUCKET_MS = 15 * 1000;

const quantize = (nowMs: number): number => Math.floor(nowMs / CACHE_BUCKET_MS) * CACHE_BUCKET_MS;

/** The four primary pill identifiers introduced by F4.7.2.1. */
export type WellTestPillId = 'last_hour' | 'stabilization' | 'official_window' | 'full_test';

/** Coarse classification used by the drawer to render the badge / source
 *  label. `diagnostic` covers `last_hour` and any future diagnostic-only
 *  pill; `official` is the only kind future Reports PDF phases certify
 *  against. */
export type WellTestWindowKind = 'diagnostic' | 'stabilization' | 'official' | 'full_test';

export interface DerivedWellTestWindow {
  pillId: WellTestPillId;
  /** Human label for the pill row + window summary. */
  label: string;
  /** False ⇒ pill is selectable. */
  isDisabled: boolean;
  /** Operator-facing reason when disabled; empty string when not disabled. */
  disabledReason: string;
  /** Epoch ms inclusive lower bound. `null` when disabled. */
  fromMs: number | null;
  /** Epoch ms exclusive upper bound. `null` when disabled. */
  toMs: number | null;
  /** ISO-8601 mirror of `fromMs`. `null` when disabled. */
  fromIso: string | null;
  /** ISO-8601 mirror of `toMs`. `null` when disabled. */
  toIso: string | null;
  /** Coarse classification — drives the badge palette in the drawer. */
  kind: WellTestWindowKind;
  /** Badge label rendered next to the source chip. */
  badgeLabel: string;
  /**
   * True ⇒ the descriptor represents an aborted official window.
   * The drawer surfaces this via the `Official Window aborted` badge so the
   * partial measurement window cannot be mistaken for a certified output.
   */
  aborted: boolean;
  /**
   * True ⇒ `toMs` is `nowMs` (i.e., the right edge is the wall clock, not a
   * pinned WellTest timestamp). The drawer surfaces this as the literal
   * string `now` in the window summary line so an operator can see at a
   * glance that the window is still growing.
   */
  endsAtNow: boolean;
}

const parseIso = (raw: string | null | undefined): number | null => {
  if (raw === null || raw === undefined) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
};

const toIso = (ms: number | null): string | null =>
  ms === null ? null : new Date(ms).toISOString();

const ONE_HOUR_MS = 60 * 60 * 1000;

const lastHourWindow = (nowMs: number): DerivedWellTestWindow => {
  const fromMs = nowMs - ONE_HOUR_MS;
  return {
    pillId: 'last_hour',
    label: 'Last Hour',
    isDisabled: false,
    disabledReason: '',
    fromMs,
    toMs: nowMs,
    fromIso: toIso(fromMs),
    toIso: toIso(nowMs),
    kind: 'diagnostic',
    badgeLabel: 'Diagnostic',
    aborted: false,
    endsAtNow: true,
  };
};

const disabledDescriptor = (
  pillId: WellTestPillId,
  label: string,
  reason: string,
  kind: WellTestWindowKind,
  badgeLabel: string,
): DerivedWellTestWindow => ({
  pillId,
  label,
  isDisabled: true,
  disabledReason: reason,
  fromMs: null,
  toMs: null,
  fromIso: null,
  toIso: null,
  kind,
  badgeLabel,
  aborted: false,
  endsAtNow: false,
});

const stabilizationWindow = (active: WellTestRow | null, nowMs: number): DerivedWellTestWindow => {
  if (active?.stabilizationStartedAt == null) {
    return disabledDescriptor(
      'stabilization',
      'Stabilization',
      'Stabilization has not started.',
      'stabilization',
      'Stabilization phase',
    );
  }
  const fromMs = parseIso(active.stabilizationStartedAt);
  if (fromMs === null) {
    return disabledDescriptor(
      'stabilization',
      'Stabilization',
      'Stabilization start timestamp is invalid.',
      'stabilization',
      'Stabilization phase',
    );
  }
  const stabEndMs = parseIso(active.stabilizationEndedAt);
  const officialStartMs = parseIso(active.officialStartedAt);
  const toMs = stabEndMs ?? officialStartMs ?? nowMs;
  const endsAtNow = stabEndMs === null && officialStartMs === null;
  return {
    pillId: 'stabilization',
    label: 'Stabilization',
    isDisabled: false,
    disabledReason: '',
    fromMs,
    toMs,
    fromIso: toIso(fromMs),
    toIso: toIso(toMs),
    kind: 'stabilization',
    badgeLabel: 'Stabilization phase',
    aborted: false,
    endsAtNow,
  };
};

const officialWindow = (active: WellTestRow | null, nowMs: number): DerivedWellTestWindow => {
  if (active === null) {
    return disabledDescriptor(
      'official_window',
      'Official Window',
      'No active well test.',
      'official',
      'Official Window',
    );
  }
  if (active.officialStartedAt === null) {
    return disabledDescriptor(
      'official_window',
      'Official Window',
      'Official measurement has not started.',
      'official',
      'Official Window',
    );
  }
  const fromMs = parseIso(active.officialStartedAt);
  if (fromMs === null) {
    return disabledDescriptor(
      'official_window',
      'Official Window',
      'Official start timestamp is invalid.',
      'official',
      'Official Window',
    );
  }

  switch (active.lifecycleStatus) {
    case 'measuring': {
      return {
        pillId: 'official_window',
        label: 'Official Window',
        isDisabled: false,
        disabledReason: '',
        fromMs,
        toMs: nowMs,
        fromIso: toIso(fromMs),
        toIso: toIso(nowMs),
        kind: 'official',
        badgeLabel: 'Official Window in progress',
        aborted: false,
        endsAtNow: true,
      };
    }
    case 'completed':
    case 'closed': {
      const endMs = parseIso(active.officialEndedAt);
      if (endMs === null) {
        // Data-invariant violation: completed / closed rows must carry
        // `officialEndedAt`. Refuse to silently substitute `now` — surface
        // the disabled state honestly per F4.7.2-0 §7.3 / §12.
        return disabledDescriptor(
          'official_window',
          'Official Window',
          'Official window missing end timestamp.',
          'official',
          'Official Window data invariant violation',
        );
      }
      return {
        pillId: 'official_window',
        label: 'Official Window',
        isDisabled: false,
        disabledReason: '',
        fromMs,
        toMs: endMs,
        fromIso: toIso(fromMs),
        toIso: toIso(endMs),
        kind: 'official',
        badgeLabel: 'Official Window completed',
        aborted: false,
        endsAtNow: false,
      };
    }
    case 'aborted': {
      const abortMs = parseIso(active.abortedAt);
      const officialEndMs = parseIso(active.officialEndedAt);
      const endMs = abortMs ?? officialEndMs ?? nowMs;
      return {
        pillId: 'official_window',
        label: 'Official Window',
        isDisabled: false,
        disabledReason: '',
        fromMs,
        toMs: endMs,
        fromIso: toIso(fromMs),
        toIso: toIso(endMs),
        kind: 'official',
        badgeLabel: 'Official Window aborted',
        aborted: true,
        endsAtNow: abortMs === null && officialEndMs === null,
      };
    }
    case 'scheduled':
    case 'connected':
    case 'stabilizing':
      // Unreachable in practice (the availability gate handles these), but
      // defensive: any row whose `officialStartedAt` is non-null while in a
      // pre-measuring status is treated as the in-progress case.
      return {
        pillId: 'official_window',
        label: 'Official Window',
        isDisabled: false,
        disabledReason: '',
        fromMs,
        toMs: nowMs,
        fromIso: toIso(fromMs),
        toIso: toIso(nowMs),
        kind: 'official',
        badgeLabel: 'Official Window in progress',
        aborted: false,
        endsAtNow: true,
      };
  }
};

const fullTestWindow = (active: WellTestRow | null, nowMs: number): DerivedWellTestWindow => {
  if (active === null) {
    return disabledDescriptor(
      'full_test',
      'Full Test',
      'No active well test.',
      'full_test',
      'Full Test',
    );
  }
  if (active.connectedAt === null && active.stabilizationStartedAt === null) {
    return disabledDescriptor(
      'full_test',
      'Full Test',
      'Well test has not been connected yet.',
      'full_test',
      'Full Test',
    );
  }
  const startMs =
    parseIso(active.connectedAt) ??
    parseIso(active.stabilizationStartedAt) ??
    parseIso(active.officialStartedAt);
  if (startMs === null) {
    return disabledDescriptor(
      'full_test',
      'Full Test',
      'Well test has no valid start timestamp.',
      'full_test',
      'Full Test',
    );
  }
  const disconnectMs = parseIso(active.disconnectedAt);
  const officialEndMs = parseIso(active.officialEndedAt);
  const endMs = disconnectMs ?? officialEndMs ?? nowMs;
  return {
    pillId: 'full_test',
    label: 'Full Test',
    isDisabled: false,
    disabledReason: '',
    fromMs: startMs,
    toMs: endMs,
    fromIso: toIso(startMs),
    toIso: toIso(endMs),
    kind: 'full_test',
    badgeLabel: 'Full Test',
    aborted: active.lifecycleStatus === 'aborted',
    endsAtNow: disconnectMs === null && officialEndMs === null,
  };
};

/**
 * Pure derivation: given a well test (or `null`) and a pill id, return the
 * `(fromMs, toMs)` window plus presentation metadata. `nowMs` is provided
 * externally so the function stays pure and timezone-independent.
 */
export const deriveWellTestWindow = (
  active: WellTestRow | null,
  pillId: WellTestPillId,
  nowMs: number,
): DerivedWellTestWindow => {
  switch (pillId) {
    case 'last_hour':
      return lastHourWindow(nowMs);
    case 'stabilization':
      return stabilizationWindow(active, nowMs);
    case 'official_window':
      return officialWindow(active, nowMs);
    case 'full_test':
      return fullTestWindow(active, nowMs);
  }
};

/**
 * Compute the default pill given the active well test:
 *
 *   - `measuring` / `completed` / `closed` → `official_window`.
 *   - `stabilizing` → `stabilization`.
 *   - `connected` / `scheduled` / `null` / `aborted` (when official has not
 *     started) → `last_hour`.
 *   - `aborted` with `officialStartedAt !== null` → `official_window` so
 *     the operator can inspect the partial measurement window (clamped to
 *     `abortedAt` by §7.3).
 */
export const defaultPillForActiveWellTest = (active: WellTestRow | null): WellTestPillId => {
  if (active === null) return 'last_hour';
  switch (active.lifecycleStatus) {
    case 'measuring':
    case 'completed':
    case 'closed':
      return 'official_window';
    case 'stabilizing':
      return 'stabilization';
    case 'aborted':
      return active.officialStartedAt !== null ? 'official_window' : 'last_hour';
    case 'scheduled':
    case 'connected':
      return 'last_hour';
  }
};

export interface UseWellTestWindowInput {
  active: WellTestRow | null;
  pillId: WellTestPillId;
  /** Optional fixed `now` for tests. Defaults to the quantized `Date.now()`. */
  nowMs?: number;
}

/**
 * Hook wrapper that computes the derived window from `Date.now()` quantized
 * to a 15-second bucket — same pattern as `useOperationsTrendSeries.ts`
 * (`quantizeNow(CACHE_BUCKET_MS)`). The quantization keeps `(fromMs, toMs)`
 * stable across re-renders inside the bucket, which is what the
 * `useOperationsTrendSeries` cache key depends on.
 *
 * `nowMs` may be supplied for tests so the derivation is timezone-
 * and clock-independent.
 */
export const useWellTestWindow = (input: UseWellTestWindowInput): DerivedWellTestWindow => {
  const nowMs = input.nowMs ?? quantize(Date.now());
  return useMemo(
    () => deriveWellTestWindow(input.active, input.pillId, nowMs),
    [input.active, input.pillId, nowMs],
  );
};
