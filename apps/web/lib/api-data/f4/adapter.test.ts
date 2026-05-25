import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MOCK_F4_CANONICAL_TAGS,
  MOCK_F4_TENANTS,
  MOCK_F4_WELLS,
  adapterGetCanonicalTag,
  adapterGetTenant,
  adapterGetWell,
  adapterListCanonicalTags,
  adapterListTenants,
  adapterListWells,
} from './index';

import { RvfApiError } from '@/lib/api/f4';

/**
 * F4.5B — adapter-layer tests.
 *
 *   - "Mock branch" tests run with `NEXT_PUBLIC_RVF_DATA_SOURCE` unset
 *     (`isApiSource()` → false). The adapter must serve from the in-memory
 *     fixtures WITHOUT touching `fetch`. The test guards this by stubbing
 *     `fetch` with a function that throws on call.
 *   - "API branch" tests stub `process.env.NEXT_PUBLIC_RVF_DATA_SOURCE` to
 *     `'api'` and `fetch` to a deterministic mock; the test asserts that
 *     `fetch` was called once and the URL composed by the underlying
 *     `getJson` wrapper matches expectations.
 */

const ORIGINAL_DATA_SOURCE = process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
const ORIGINAL_API_BASE_URL = process.env.NEXT_PUBLIC_RVF_API_BASE_URL;

const API_BASE = 'https://api.example.test/api/v1';

beforeEach(() => {
  process.env.NEXT_PUBLIC_RVF_API_BASE_URL = API_BASE;
});

afterEach(() => {
  process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = ORIGINAL_DATA_SOURCE;
  process.env.NEXT_PUBLIC_RVF_API_BASE_URL = ORIGINAL_API_BASE_URL;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const stubFetchThatThrows = (): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('fetch must not be called in mock-source mode');
    }),
  );
};

const stubFetchOk = (body: unknown) => {
  const headers = new Headers({ 'content-type': 'application/json' });
  const response = new Response(JSON.stringify(body), { status: 200, headers });
  const fn = vi.fn<typeof fetch>(() => Promise.resolve(response));
  vi.stubGlobal('fetch', fn);
  return fn;
};

const stubFetchStatus = (status: number, body: unknown) => {
  const headers = new Headers({ 'content-type': 'application/json' });
  const response = new Response(JSON.stringify(body), { status, headers });
  const fn = vi.fn<typeof fetch>(() => Promise.resolve(response));
  vi.stubGlobal('fetch', fn);
  return fn;
};

// =============================================================================
// Tenants
// =============================================================================

describe('tenants adapter', () => {
  it('mock mode: returns deterministic fixtures without calling fetch', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const rows = await adapterListTenants();
    expect(rows).toHaveLength(MOCK_F4_TENANTS.length);
    expect(rows[0]?.name).toBe('RVF Internal');
    expect(rows[0]?.status).toBe('active');
  });

  it('mock mode: applies the status filter locally', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const active = await adapterListTenants({ status: 'active' });
    const inactive = await adapterListTenants({ status: 'inactive' });

    expect(active.every((t) => t.status === 'active')).toBe(true);
    expect(inactive).toHaveLength(0);
  });

  it('mock mode: getTenant by id returns the row when present', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const id = MOCK_F4_TENANTS[0]?.id ?? '';
    expect(id).not.toBe('');
    const tenant = await adapterGetTenant(id);
    expect(tenant.name).toBe('RVF Internal');
  });

  it('mock mode: getTenant rejects with RvfApiError(404) on miss', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const promise = adapterGetTenant('00000000-0000-0000-0000-deadbeefdead');
    await expect(promise).rejects.toBeInstanceOf(RvfApiError);
    await promise.catch((err: unknown) => {
      expect((err as RvfApiError).status).toBe(404);
    });
  });

  it('api mode: listTenants forwards to the backend wrapper (fetch is called)', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fetchMock = stubFetchOk([
      {
        id: 't-1',
        name: 'API Tenant',
        status: 'active',
        residencyHint: null,
        createdAt: '2026-05-24T00:00:00.000Z',
        updatedAt: '2026-05-24T00:00:00.000Z',
      },
    ]);

    const rows = await adapterListTenants({ status: 'active' });
    expect(rows[0]?.name).toBe('API Tenant');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callUrl = fetchMock.mock.calls[0]?.[0];
    expect(callUrl).toBe(`${API_BASE}/tenants?status=active`);
  });

  it('api mode: getTenant maps backend 404 to RvfApiError', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    stubFetchStatus(404, {
      statusCode: 404,
      message: "Tenant 'xxx' not found.",
      error: 'Not Found',
    });

    await expect(adapterGetTenant('xxx')).rejects.toBeInstanceOf(RvfApiError);
  });
});

// =============================================================================
// Wells
// =============================================================================

describe('wells adapter', () => {
  it('mock mode: returns Reference Well A with the tenant summary attached', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const rows = await adapterListWells();
    expect(rows).toHaveLength(MOCK_F4_WELLS.length);
    expect(rows[0]?.name).toBe('Reference Well A');
    expect(rows[0]?.tenant?.name).toBe('RVF Internal');
  });

  it('mock mode: filters by fieldOrSite / type / fluid', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const rows = await adapterListWells({ type: 'test', fluid: 'multiphase' });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe('test');

    const nothing = await adapterListWells({ type: 'production' });
    expect(nothing).toHaveLength(0);
  });

  it('mock mode: getWell by id resolves and 404s deterministically', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const wellId = MOCK_F4_WELLS[0]?.id ?? '';
    expect(wellId).not.toBe('');
    const found = await adapterGetWell(wellId);
    expect(found.name).toBe('Reference Well A');

    await expect(adapterGetWell('00000000-0000-0000-0000-deadbeefdead')).rejects.toBeInstanceOf(
      RvfApiError,
    );
  });

  it('api mode: listWells composes the filter into the query string', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fetchMock = stubFetchOk([]);

    await adapterListWells({ tenantId: 'aaaa', fieldOrSite: 'Reference Field' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${API_BASE}/wells?tenantId=aaaa&fieldOrSite=Reference+Field`,
    );
  });
});

// =============================================================================
// Canonical tags
// =============================================================================

describe('canonical-tags adapter', () => {
  it('mock mode: returns the full F4.3 dictionary (22 entries)', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const rows = await adapterListCanonicalTags();
    expect(rows).toHaveLength(MOCK_F4_CANONICAL_TAGS.length);
    expect(rows).toHaveLength(22);
  });

  it('mock mode: applies the category filter', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const pressure = await adapterListCanonicalTags({ category: 'pressure' });
    expect(pressure.every((t) => t.category === 'pressure')).toBe(true);
    expect(pressure.length).toBeGreaterThan(0);
  });

  it('mock mode: respects an explicit `deprecated=false` (not "no filter")', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const undeprecated = await adapterListCanonicalTags({ deprecated: false });
    const deprecated = await adapterListCanonicalTags({ deprecated: true });

    expect(undeprecated.every((t) => !t.deprecated)).toBe(true);
    expect(deprecated).toHaveLength(0);
  });

  it('mock mode: getCanonicalTag(name) hits the dictionary directly', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const tag = await adapterGetCanonicalTag('p_inlet');
    expect(tag.canonicalUnit).toBe('psi');
    expect(tag.category).toBe('pressure');

    await expect(adapterGetCanonicalTag('not_a_real_tag')).rejects.toBeInstanceOf(RvfApiError);
  });

  it('api mode: getCanonicalTag URL-encodes the name and hits the backend', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fetchMock = stubFetchOk({
      id: 'tag-1',
      name: 'q_gas',
      displayName: 'Gas',
      canonicalUnit: 'MMSCFD',
      category: 'flow',
      precision: 3,
      description: null,
      deprecated: false,
      createdAt: '2026-05-24T00:00:00.000Z',
      updatedAt: '2026-05-24T00:00:00.000Z',
    });

    await adapterGetCanonicalTag('q_gas');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_BASE}/tags/q_gas`);
  });
});

// =============================================================================
// Source-switch defaults
// =============================================================================

describe('data-source default', () => {
  it('treats an unknown / typo value as mock (no fetch)', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'aapi'; // intentional typo
    stubFetchThatThrows();

    // Both tenants + wells + tags resolve from in-memory fixtures.
    await expect(adapterListTenants()).resolves.toBeDefined();
    await expect(adapterListWells()).resolves.toBeDefined();
    await expect(adapterListCanonicalTags()).resolves.toBeDefined();
  });
});
