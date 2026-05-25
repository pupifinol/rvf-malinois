/**
 * F4.5B — Tenants data-source-aware adapter.
 *
 * Exposes a stable surface (`listTenants`, `getTenant`) that resolves to
 * either the F4.5B in-memory fixtures or the F4 backend endpoint
 * wrappers depending on `NEXT_PUBLIC_RVF_DATA_SOURCE`:
 *
 *   - `mock` (default) → `MOCK_F4_TENANTS` (no network IO).
 *   - `api`            → `listTenants()` / `getTenant(id)` from
 *                         `@/lib/api/f4`.
 *
 * Both branches return F4-shaped objects (`Tenant`) so a consumer sees the
 * same surface regardless of source. Mock-mode "not found" surfaces as
 * `RvfApiError(404, 'mock:/tenants/:id', null, …)` for parity with API mode.
 */

import { MOCK_F4_TENANTS } from './mock-fixtures';

import {
  type GetOptions,
  RvfApiError,
  type Tenant,
  type TenantStatus,
  getTenant,
  isApiSource,
  listTenants,
} from '@/lib/api/f4';

export interface ListTenantsParams {
  status?: TenantStatus;
}

const filterMock = (params?: ListTenantsParams): Tenant[] => {
  if (!params?.status) return [...MOCK_F4_TENANTS];
  return MOCK_F4_TENANTS.filter((t) => t.status === params.status);
};

const orderByName = (rows: Tenant[]): Tenant[] =>
  [...rows].sort((a, b) => a.name.localeCompare(b.name));

export const adapterListTenants = async (
  params?: ListTenantsParams,
  options?: GetOptions,
): Promise<Tenant[]> => {
  if (isApiSource()) {
    return listTenants(params, options);
  }
  return Promise.resolve(orderByName(filterMock(params)));
};

export const adapterGetTenant = async (id: string, options?: GetOptions): Promise<Tenant> => {
  if (isApiSource()) {
    return getTenant(id, options);
  }
  const row = MOCK_F4_TENANTS.find((t) => t.id === id);
  if (!row) {
    return Promise.reject(
      new RvfApiError(404, `mock:/tenants/${id}`, null, `Tenant '${id}' not found.`),
    );
  }
  return Promise.resolve(row);
};
