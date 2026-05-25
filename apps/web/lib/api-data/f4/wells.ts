/**
 * F4.5B — Wells data-source-aware adapter.
 *
 * Mirrors the F4.4B endpoint surface:
 *   - `adapterListWells(params?)` → `Well[]` filtered by optional
 *     `tenantId` / `fieldOrSite` / `type` / `fluid`, ordered by
 *     `(tenantId asc, name asc)`.
 *   - `adapterGetWell(id)` → `Well` or `RvfApiError(404)` on miss.
 *
 * The mock branch returns objects with the `tenant` summary include
 * already attached (matching the F4 backend's `Well` response shape).
 */

import { MOCK_F4_WELLS } from './mock-fixtures';

import {
  type GetOptions,
  RvfApiError,
  type Well,
  getWell,
  isApiSource,
  listWells,
} from '@/lib/api/f4';

export interface ListWellsParams {
  tenantId?: string;
  fieldOrSite?: string;
  type?: string;
  fluid?: string;
}

const filterMock = (params?: ListWellsParams): Well[] => {
  let rows: Well[] = [...MOCK_F4_WELLS];
  if (params?.tenantId) rows = rows.filter((w) => w.tenantId === params.tenantId);
  if (params?.fieldOrSite) rows = rows.filter((w) => w.fieldOrSite === params.fieldOrSite);
  if (params?.type) rows = rows.filter((w) => w.type === params.type);
  if (params?.fluid) rows = rows.filter((w) => w.fluid === params.fluid);
  return rows;
};

const orderByTenantThenName = (rows: Well[]): Well[] =>
  [...rows].sort((a, b) => {
    const tenantCmp = a.tenantId.localeCompare(b.tenantId);
    if (tenantCmp !== 0) return tenantCmp;
    return a.name.localeCompare(b.name);
  });

export const adapterListWells = async (
  params?: ListWellsParams,
  options?: GetOptions,
): Promise<Well[]> => {
  if (isApiSource()) {
    return listWells(params, options);
  }
  return Promise.resolve(orderByTenantThenName(filterMock(params)));
};

export const adapterGetWell = async (id: string, options?: GetOptions): Promise<Well> => {
  if (isApiSource()) {
    return getWell(id, options);
  }
  const row = MOCK_F4_WELLS.find((w) => w.id === id);
  if (!row) {
    return Promise.reject(
      new RvfApiError(404, `mock:/wells/${id}`, null, `Well '${id}' not found.`),
    );
  }
  return Promise.resolve(row);
};
