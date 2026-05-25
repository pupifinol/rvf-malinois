'use client';

import { useEffect, useState } from 'react';

import { twins } from '@/components/units-twin/data/twin.mock';
import { type MeasurementUnitListRow, type RvfDataSource, getDataSource } from '@/lib/api/f4';
import { adapterListMeasurementUnits } from '@/lib/api-data/f4';

/**
 * F4.5F — Units fleet hook.
 *
 * Single responsibility: feed the `/units` page's `<UnitSelector>` with the
 * fleet roster. The selector only needs `{ id, unitNumber, name?, code? }`
 * to render its segmented chip — it does NOT need the deep `UnitTwin` shape
 * that the per-unit digital-twin panels consume.
 *
 * Source switch (per F4.5A):
 *
 *   mock (default)
 *     Derives items from the existing `twins` array under
 *     `components/units-twin/data/twin.mock.ts`. Synchronous, no network
 *     IO, never `isLoading`. Behavior identical to the pre-F4.5F page.
 *
 *   api
 *     Fetches `adapterListMeasurementUnits()` from `@/lib/api-data/f4`.
 *     Maps the F4 `MeasurementUnitListRow` shape to the smaller
 *     `UnitSelectorItem` shape. `unitNumber` is ordinal (`index + 1`)
 *     because the F4 row does not carry a per-asset sequence number — the
 *     `code` field (HP-001, LP-001) is the natural human identifier and is
 *     also surfaced.
 *
 * Important boundary:
 *
 *   The digital-twin panels (SeparatorDiagram, LiveInstrumentReadings,
 *   etc.) still consume `UnitTwin` from the local mock — F4.5F does NOT
 *   migrate the digital-twin payload because F4 has no telemetry / live
 *   readings yet (deferred to F4.6). In api mode the selector lists F4
 *   units, but the active twin still resolves out of the local twin mock
 *   (with a documented fallback to `twins[0]` when the active id has no
 *   local match).
 */

export interface UnitSelectorItem {
  /** Stable identifier used as React key and `<UnitSelector>` value. */
  id: string;
  /**
   * Ordinal in the visible selector. In mock mode this matches the local
   * twin's `unitNumber`; in api mode it is `index + 1` because the F4 row
   * does not carry a unique sequence number. The `code` field below
   * carries the human-readable asset id (HP-001 / LP-001).
   */
  unitNumber: number;
  /** Display name, when available (e.g. F4 `MeasurementUnit.name`). */
  name?: string;
  /** F4 asset code (e.g. `HP-001`); undefined in mock mode. */
  code?: string;
}

export interface UseUnitsFleetResult {
  items: UnitSelectorItem[];
  isLoading: boolean;
  error: Error | null;
  source: RvfDataSource;
}

// Twins-derived selector items computed once at module load. Synchronous,
// no React state — mock mode returns this exact array on every call.
const TWIN_DERIVED_ITEMS: UnitSelectorItem[] = twins.map((twin) => ({
  id: twin.id,
  unitNumber: twin.unitNumber,
  name: twin.name,
}));

const toUnitSelectorItem = (row: MeasurementUnitListRow, index: number): UnitSelectorItem => ({
  id: row.id,
  unitNumber: index + 1,
  name: row.name,
  code: row.code,
});

/**
 * Maps an F4 list response to the selector shape. Exported for tests.
 */
export const mapMeasurementUnitsToSelectorItems = (
  rows: readonly MeasurementUnitListRow[],
): UnitSelectorItem[] => rows.map(toUnitSelectorItem);

export function useUnitsFleet(): UseUnitsFleetResult {
  const source = getDataSource();

  const [items, setItems] = useState<UnitSelectorItem[]>(
    source === 'mock' ? TWIN_DERIVED_ITEMS : [],
  );
  const [isLoading, setIsLoading] = useState<boolean>(source === 'api');
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (source !== 'api') return;

    const controller = new AbortController();
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    adapterListMeasurementUnits(undefined, { signal: controller.signal })
      .then((rows) => {
        if (cancelled) return;
        setItems(mapMeasurementUnitsToSelectorItems(rows));
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const wrapped = err instanceof Error ? err : new Error('Failed to load units');
        setError(wrapped);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [source]);

  return { items, isLoading, error, source };
}
