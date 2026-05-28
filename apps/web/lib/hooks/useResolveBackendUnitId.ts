/**
 * useResolveBackendUnitId — F4.5G.2.2.1.
 *
 * Resolves an `OperationsJobBinding.backendUnitCode` (e.g. `'HP-001'`) to the
 * backend `MeasurementUnit.id` (UUID) by composing the existing
 * `useUnitsFleet()` hook (F4.5F) — which already fetches the F4.4D units
 * list via `adapterListMeasurementUnits` in api mode and resolves
 * synchronously to twin-derived items in mock mode.
 *
 * Per F4.5G.2.2-0 §9.3 — Option **(A)** (selected):
 *
 *   - Match key: `MeasurementUnitListRow.code === backendUnitCode`. Strict
 *     equality on the operational asset code (e.g. `'HP-001'`); the binding
 *     declares which asset it stands for, the resolver looks it up.
 *   - **No hardcoded mapping table** anywhere — the explicit annotation lives
 *     on the binding (`apps/web/components/operations/data/operationsJobs.ts`).
 *   - `undefined` input → `{ unitId: null }`; no error. The honest answer for
 *     a binding that intentionally has no backend asset (e.g. the STALE
 *     drill in the F4.3 seed).
 *   - No match → `{ unitId: null }`; no error. The honest answer when the
 *     binding declares a code that the backend does not (yet) seed.
 *   - Never throws on missing / unmatched code.
 *   - Mock-mode `useUnitsFleet()` returns twin-derived items that **do not
 *     carry `code`**, so the resolver returns `null` in mock mode by design
 *     — the tile's `useOperationsLatestValues` is api-gated anyway, so mock
 *     mode never needs a resolved UUID.
 *
 * The hook is intentionally narrow. It does NOT call `adapterGetTelemetryLatest`,
 * does NOT subscribe to realtime, does NOT cache its own state — every call
 * derives synchronously from `useUnitsFleet().items` (which is itself a
 * `useState`-backed singleton-per-page fetch).
 */
'use client';

import { type RvfDataSource } from '@/lib/api/f4';
import { useUnitsFleet } from '@/lib/hooks/useUnitsFleet';

export interface UseResolveBackendUnitIdResult {
  /** Resolved backend `MeasurementUnit.id` UUID, or `null` when unresolved. */
  unitId: string | null;
  isLoading: boolean;
  error: Error | null;
  /** Underlying data source (`'mock'` / `'api'`). Surfaced for honest labeling. */
  source: RvfDataSource;
}

export const useResolveBackendUnitId = (
  backendUnitCode: string | undefined,
): UseResolveBackendUnitIdResult => {
  const fleet = useUnitsFleet();

  if (backendUnitCode === undefined) {
    return { unitId: null, isLoading: false, error: null, source: fleet.source };
  }

  if (fleet.isLoading) {
    return { unitId: null, isLoading: true, error: null, source: fleet.source };
  }

  if (fleet.error) {
    return { unitId: null, isLoading: false, error: fleet.error, source: fleet.source };
  }

  const match = fleet.items.find((item) => item.code === backendUnitCode);
  return {
    unitId: match ? match.id : null,
    isLoading: false,
    error: null,
    source: fleet.source,
  };
};
