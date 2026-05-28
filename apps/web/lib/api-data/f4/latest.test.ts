import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MOCK_F4_CANONICAL_TAGS,
  MOCK_F4_TELEMETRY_LATEST,
  adapterGetTelemetryLatest,
  assertUuidShaped,
  isLatestUnitIdUuidShaped,
} from './index';

import { RvfApiError } from '@/lib/api/f4';

/**
 * F4.6C.2.1 — Latest-value adapter tests.
 *
 * Mirrors the F4.5E `telemetry.test.ts` posture: mock-mode tests stub `fetch`
 * with a throwing function (guard), api-mode tests stub `fetch` with a
 * deterministic response and assert composed URLs.
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

const HP_001_ID = '00000000-0000-0000-0000-000000004411';
const LP_001_ID = '00000000-0000-0000-0000-000000004412';
const UNKNOWN_UUID = '00000000-0000-0000-0000-00000000ffff';
const P_INLET_TAG = MOCK_F4_CANONICAL_TAGS.find((t) => t.name === 'p_inlet');

// =============================================================================
// isUuidShaped predicate + assertUuidShaped guard
// =============================================================================

describe('isLatestUnitIdUuidShaped', () => {
  it('accepts canonical UUID strings', () => {
    expect(isLatestUnitIdUuidShaped(HP_001_ID)).toBe(true);
    expect(isLatestUnitIdUuidShaped(LP_001_ID)).toBe(true);
  });

  it('rejects simulator catalog strings', () => {
    expect(isLatestUnitIdUuidShaped('EMMAD-01')).toBe(false);
    expect(isLatestUnitIdUuidShaped('EMMAD-02')).toBe(false);
    expect(isLatestUnitIdUuidShaped('PSK-03')).toBe(false);
  });

  it('rejects empty / partial values', () => {
    expect(isLatestUnitIdUuidShaped('')).toBe(false);
    expect(isLatestUnitIdUuidShaped('00000000-0000-0000-0000')).toBe(false);
  });
});

describe('assertUuidShaped', () => {
  it('throws RvfApiError(400, …) for simulator strings', () => {
    expect(() => assertUuidShaped('EMMAD-01', '/telemetry/latest')).toThrow(RvfApiError);
    try {
      assertUuidShaped('EMMAD-01', '/telemetry/latest');
    } catch (err) {
      expect(err).toBeInstanceOf(RvfApiError);
      const e = err as RvfApiError;
      expect(e.status).toBe(400);
    }
  });

  it('returns silently for UUID-shaped values', () => {
    expect(() => assertUuidShaped(HP_001_ID, '/telemetry/latest')).not.toThrow();
  });
});

// =============================================================================
// Mock mode
// =============================================================================

describe('adapterGetTelemetryLatest — mock mode', () => {
  it('returns every latest value for HP-001 when no tag filter is supplied', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterGetTelemetryLatest({ unitId: HP_001_ID });

    expect(response.unitId).toBe(HP_001_ID);
    expect(response.source).toBe('live_readings');
    expect(response.values.length).toBeGreaterThan(0);
    expect(response.values).toHaveLength(MOCK_F4_TELEMETRY_LATEST[HP_001_ID]?.length ?? 0);
    expect(typeof response.generatedAt).toBe('string');
  });

  it('filters by canonicalTagId in mock mode', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();
    expect(P_INLET_TAG).toBeDefined();
    if (!P_INLET_TAG) return;

    const response = await adapterGetTelemetryLatest({
      unitId: HP_001_ID,
      canonicalTagId: P_INLET_TAG.id,
    });

    expect(response.values).toHaveLength(1);
    expect(response.values[0]?.canonicalTag.name).toBe('p_inlet');
  });

  it('filters by canonicalTagName in mock mode', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterGetTelemetryLatest({
      unitId: HP_001_ID,
      canonicalTagName: 'q_gas',
    });

    expect(response.values).toHaveLength(1);
    expect(response.values[0]?.canonicalTag.name).toBe('q_gas');
  });

  it('returns empty envelope for an unknown unit (mock mode tolerates simulator strings)', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterGetTelemetryLatest({ unitId: 'EMMAD-01' });

    expect(response.unitId).toBe('EMMAD-01');
    expect(response.values).toHaveLength(0);
    expect(response.source).toBe('live_readings');
  });

  it('returns empty envelope for a known unit with an unknown tag', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterGetTelemetryLatest({
      unitId: HP_001_ID,
      canonicalTagName: 'not_a_real_tag',
    });

    expect(response.values).toHaveLength(0);
  });

  it('rejects supplying both canonicalTagId and canonicalTagName (mock mirrors backend XOR)', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();
    expect(P_INLET_TAG).toBeDefined();
    if (!P_INLET_TAG) return;

    await expect(
      adapterGetTelemetryLatest({
        unitId: HP_001_ID,
        canonicalTagId: P_INLET_TAG.id,
        canonicalTagName: 'p_inlet',
      }),
    ).rejects.toBeInstanceOf(RvfApiError);
  });

  it('LP-001 returns its single inlet-pressure latest row', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterGetTelemetryLatest({ unitId: LP_001_ID });

    expect(response.values).toHaveLength(1);
    expect(response.values[0]?.canonicalTag.name).toBe('p_inlet');
    expect(response.values[0]?.engineeringUnit).toBe('psi');
  });

  it('Decimal-as-string value passes through unchanged', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterGetTelemetryLatest({
      unitId: HP_001_ID,
      canonicalTagName: 'p_inlet',
    });

    expect(typeof response.values[0]?.value).toBe('string');
  });
});

// =============================================================================
// API mode
// =============================================================================

describe('adapterGetTelemetryLatest — api mode', () => {
  it('composes /telemetry/latest URL with unitId only', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fixture = {
      unitId: HP_001_ID,
      generatedAt: new Date().toISOString(),
      source: 'live_readings' as const,
      values: [],
    };
    const fetchMock = stubFetchOk(fixture);

    await adapterGetTelemetryLatest({ unitId: HP_001_ID });

    const url = fetchMock.mock.calls[0]?.[0];
    expect(typeof url).toBe('string');
    if (typeof url !== 'string') return;
    expect(url.startsWith(`${API_BASE}/telemetry/latest?`)).toBe(true);
    expect(url).toContain(`unitId=${HP_001_ID}`);
    expect(url).not.toContain('canonicalTagId');
    expect(url).not.toContain('canonicalTagName');
  });

  it('forwards canonicalTagId in the query string', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    expect(P_INLET_TAG).toBeDefined();
    if (!P_INLET_TAG) return;
    const fetchMock = stubFetchOk({
      unitId: HP_001_ID,
      generatedAt: new Date().toISOString(),
      source: 'live_readings',
      values: [],
    });

    await adapterGetTelemetryLatest({
      unitId: HP_001_ID,
      canonicalTagId: P_INLET_TAG.id,
    });

    const url = fetchMock.mock.calls[0]?.[0];
    expect(typeof url).toBe('string');
    if (typeof url !== 'string') return;
    expect(url).toContain(`canonicalTagId=${P_INLET_TAG.id}`);
  });

  it('forwards canonicalTagName in the query string', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fetchMock = stubFetchOk({
      unitId: HP_001_ID,
      generatedAt: new Date().toISOString(),
      source: 'live_readings',
      values: [],
    });

    await adapterGetTelemetryLatest({
      unitId: HP_001_ID,
      canonicalTagName: 'p_inlet',
    });

    const url = fetchMock.mock.calls[0]?.[0];
    expect(typeof url).toBe('string');
    if (typeof url !== 'string') return;
    expect(url).toContain('canonicalTagName=p_inlet');
  });

  it('UUID guardrail: api mode refuses simulator catalog strings before issuing fetch', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapterGetTelemetryLatest({ unitId: 'EMMAD-01' })).rejects.toBeInstanceOf(
      RvfApiError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('api 200 with empty values envelope parses cleanly', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    stubFetchOk({
      unitId: UNKNOWN_UUID,
      generatedAt: new Date().toISOString(),
      source: 'live_readings',
      values: [],
    });

    const response = await adapterGetTelemetryLatest({ unitId: UNKNOWN_UUID });

    expect(response.unitId).toBe(UNKNOWN_UUID);
    expect(response.values).toEqual([]);
    expect(response.source).toBe('live_readings');
  });

  it('api 400 surfaces as RvfApiError', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const headers = new Headers({ 'content-type': 'application/json' });
    const response = new Response(
      JSON.stringify({
        statusCode: 400,
        message: 'supplying both `canonicalTagId` and `canonicalTagName` is rejected as ambiguous',
        error: 'Bad Request',
      }),
      { status: 400, headers },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.resolve(response)),
    );

    await expect(
      adapterGetTelemetryLatest({
        unitId: HP_001_ID,
        canonicalTagId: '00000000-0000-0000-0000-0000000044f1',
        canonicalTagName: 'p_inlet',
      }),
    ).rejects.toBeInstanceOf(RvfApiError);
  });
});
