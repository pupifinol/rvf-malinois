import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildUrl, getJson } from './client';
import { RvfApiError } from './errors';

/**
 * F4.5A — client tests.
 *
 *   - `buildUrl` is pure: covered by direct assertions.
 *   - `getJson` is exercised via a `vi.stubGlobal('fetch', …)` mock so the
 *     suite stays free of network IO. Each test injects an explicit
 *     `baseUrl` so the result is independent of `process.env.NEXT_PUBLIC_*`.
 */

const BASE_URL = 'https://api.example.test/api/v1';

describe('buildUrl', () => {
  it('joins base + path with a leading slash', () => {
    expect(buildUrl(BASE_URL, '/tenants')).toBe(`${BASE_URL}/tenants`);
    expect(buildUrl(BASE_URL, 'tenants')).toBe(`${BASE_URL}/tenants`);
  });

  it('strips trailing slashes from the base', () => {
    expect(buildUrl(`${BASE_URL}/`, '/tenants')).toBe(`${BASE_URL}/tenants`);
    expect(buildUrl(`${BASE_URL}///`, '/tenants')).toBe(`${BASE_URL}/tenants`);
  });

  it('appends defined params as a query string', () => {
    expect(buildUrl(BASE_URL, '/tenants', { status: 'active' })).toBe(
      `${BASE_URL}/tenants?status=active`,
    );
  });

  it('skips undefined and null params', () => {
    expect(
      buildUrl(BASE_URL, '/wells', {
        tenantId: undefined,
        type: 'test',
        fluid: null,
      }),
    ).toBe(`${BASE_URL}/wells?type=test`);
  });

  it('serializes booleans as "true" / "false"', () => {
    expect(buildUrl(BASE_URL, '/tags', { deprecated: false })).toBe(
      `${BASE_URL}/tags?deprecated=false`,
    );
    expect(buildUrl(BASE_URL, '/tags', { deprecated: true })).toBe(
      `${BASE_URL}/tags?deprecated=true`,
    );
  });

  it('serializes Date instances as ISO-8601 strings', () => {
    const ts = new Date('2026-05-24T00:00:00.000Z');
    expect(buildUrl(BASE_URL, '/telemetry/trends', { from: ts })).toBe(
      `${BASE_URL}/telemetry/trends?from=2026-05-24T00%3A00%3A00.000Z`,
    );
  });

  it('serializes numbers via String()', () => {
    expect(buildUrl(BASE_URL, '/telemetry/trends', { limit: 1000 })).toBe(
      `${BASE_URL}/telemetry/trends?limit=1000`,
    );
  });

  it('returns the bare URL when no params are given or every value is skipped', () => {
    expect(buildUrl(BASE_URL, '/tenants')).toBe(`${BASE_URL}/tenants`);
    expect(buildUrl(BASE_URL, '/tenants', { status: undefined })).toBe(`${BASE_URL}/tenants`);
  });
});

interface MockResponseInit {
  status?: number;
  body?: unknown;
  contentType?: string;
}

function mockResponse({ status = 200, body, contentType = 'application/json' }: MockResponseInit) {
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  const headers = new Headers();
  if (contentType.length > 0 && text.length > 0) headers.set('content-type', contentType);
  return new Response(text, { status, headers });
}

describe('getJson', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns the parsed JSON body on 2xx', async () => {
    const payload = [{ id: 't-1', name: 'RVF Internal', status: 'active' }];
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ status: 200, body: payload }));

    const result = await getJson<typeof payload>('/tenants', undefined, { baseUrl: BASE_URL });

    expect(result).toEqual(payload);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(`${BASE_URL}/tenants`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: undefined,
    });
  });

  it('throws RvfApiError on a 4xx response and exposes status / url / body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({
        status: 404,
        body: { statusCode: 404, message: "Tenant 'xx' not found.", error: 'Not Found' },
      }),
    );

    const promise = getJson('/tenants/xx', undefined, { baseUrl: BASE_URL });
    await expect(promise).rejects.toBeInstanceOf(RvfApiError);
    try {
      await promise;
    } catch (err) {
      const e = err as RvfApiError;
      expect(e.status).toBe(404);
      expect(e.url).toBe(`${BASE_URL}/tenants/xx`);
      expect(e.body).toEqual({
        statusCode: 404,
        message: "Tenant 'xx' not found.",
        error: 'Not Found',
      });
    }
  });

  it('throws RvfApiError with status=0 when the network layer fails', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

    const promise = getJson('/tenants', undefined, { baseUrl: BASE_URL });
    await expect(promise).rejects.toBeInstanceOf(RvfApiError);
    try {
      await promise;
    } catch (err) {
      const e = err as RvfApiError;
      expect(e.status).toBe(0);
      expect(e.url).toBe(`${BASE_URL}/tenants`);
      expect(e.body).toBeNull();
      expect(e.message).toContain('connect ECONNREFUSED');
    }
  });

  it('forwards an AbortSignal to fetch', async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ status: 200, body: [] }));

    await getJson('/tenants', undefined, { baseUrl: BASE_URL, signal: controller.signal });

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call?.[1]?.signal).toBe(controller.signal);
  });

  it('appends params via buildUrl', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ status: 200, body: [] }));

    await getJson('/wells', { type: 'test', tenantId: undefined }, { baseUrl: BASE_URL });

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `${BASE_URL}/wells?type=test`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('returns null on a 204 / empty body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({ status: 200, body: undefined, contentType: '' }),
    );

    const result = await getJson('/tenants', undefined, { baseUrl: BASE_URL });
    expect(result).toBeNull();
  });
});
