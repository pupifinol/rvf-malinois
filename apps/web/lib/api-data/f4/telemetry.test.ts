import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MOCK_F4_CANONICAL_TAGS,
  MOCK_F4_TELEMETRY_TRENDS,
  MOCK_F4_TRENDS_RANGE,
  adapterGetTelemetryTrends,
  isTelemetryTrendEmpty,
  toNumericTelemetryPoint,
  toNumericTelemetrySeries,
} from './index';

import { RvfApiError, type TelemetryPoint, type TelemetryTrendsResponse } from '@/lib/api/f4';

/**
 * F4.5E — Telemetry trends adapter + numeric-conversion helper tests.
 *
 * Same posture as F4.5C / F4.5D: mock-mode tests stub `fetch` with a
 * throwing function (guard), api-mode tests stub `fetch` with a
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
const P_INLET_TAG = MOCK_F4_CANONICAL_TAGS.find((t) => t.name === 'p_inlet');
const Q_GAS_TAG = MOCK_F4_CANONICAL_TAGS.find((t) => t.name === 'q_gas');

const FROM = MOCK_F4_TRENDS_RANGE.from;
const TO = MOCK_F4_TRENDS_RANGE.to;

// =============================================================================
// Adapter — happy paths
// =============================================================================

describe('telemetry-trends adapter — mock mode', () => {
  it('returns the deterministic HP-001 p_inlet trend (60 points) without calling fetch', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterGetTelemetryTrends({
      unitId: HP_001_ID,
      from: FROM,
      to: TO,
      canonicalTagName: 'p_inlet',
    });

    expect(response.unitId).toBe(HP_001_ID);
    expect(response.canonicalTag.name).toBe('p_inlet');
    expect(response.canonicalTag.canonicalUnit).toBe('psi');
    expect(response.points).toHaveLength(60);
    expect(response.points[0]?.engineeringUnit).toBe('psi');
    expect(response.points[0]?.quality).toBe('good');
    expect(response.points[0]?.source).toBe('mock');
    expect(typeof response.points[0]?.value).toBe('string'); // Decimal-as-string
  });

  it('resolves the canonicalTagId variant against the same fixture', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();
    expect(P_INLET_TAG).toBeDefined();
    if (!P_INLET_TAG) return;

    const response = await adapterGetTelemetryTrends({
      unitId: HP_001_ID,
      from: FROM,
      to: TO,
      canonicalTagId: P_INLET_TAG.id,
    });

    expect(response.canonicalTag.id).toBe(P_INLET_TAG.id);
    expect(response.canonicalTag.name).toBe('p_inlet');
    expect(response.points).toHaveLength(60);
  });

  it('returns the q_gas synthetic trend (60 points, MMSCFD) under HP-001', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();
    expect(Q_GAS_TAG).toBeDefined();
    if (!Q_GAS_TAG) return;

    const response = await adapterGetTelemetryTrends({
      unitId: HP_001_ID,
      from: FROM,
      to: TO,
      canonicalTagName: 'q_gas',
    });

    expect(response.canonicalTag.canonicalUnit).toBe('MMSCFD');
    expect(response.points).toHaveLength(60);
  });

  it('synthetic series is deterministic across calls', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const r1 = await adapterGetTelemetryTrends({
      unitId: HP_001_ID,
      from: FROM,
      to: TO,
      canonicalTagName: 'p_inlet',
    });
    const r2 = await adapterGetTelemetryTrends({
      unitId: HP_001_ID,
      from: FROM,
      to: TO,
      canonicalTagName: 'p_inlet',
    });
    expect(r1.points).toEqual(r2.points);
  });

  // F4.7.2.1 — seeds added so HP-001's Oil Rate (`q_liquid`) and Temperature
  // (`t_inlet`) tiles render data in mock mode. Water Cut (`water_cut`) and
  // Differential P. (`dp_weir`) are not in `MOCK_F4_CANONICAL_TAGS`; their
  // tiles continue to surface the honest empty state in mock mode.

  it('F4.7.2.1: HP-001 q_liquid returns 60 synthetic points (bpd) so Oil Rate renders', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();
    const response = await adapterGetTelemetryTrends({
      unitId: HP_001_ID,
      from: FROM,
      to: TO,
      canonicalTagName: 'q_liquid',
    });
    expect(response.canonicalTag.name).toBe('q_liquid');
    expect(response.canonicalTag.canonicalUnit).toBe('bpd');
    expect(response.points).toHaveLength(60);
    // Center 1200 bpd ± 40 → every value must be in [1160, 1240].
    for (const p of response.points) {
      const v = Number(p.value);
      expect(v).toBeGreaterThanOrEqual(1160);
      expect(v).toBeLessThanOrEqual(1240);
    }
  });

  it('F4.7.2.1: HP-001 t_inlet returns 60 synthetic points (degF) so Temperature renders', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();
    const response = await adapterGetTelemetryTrends({
      unitId: HP_001_ID,
      from: FROM,
      to: TO,
      canonicalTagName: 't_inlet',
    });
    expect(response.canonicalTag.name).toBe('t_inlet');
    expect(response.canonicalTag.canonicalUnit).toBe('degF');
    expect(response.points).toHaveLength(60);
  });
});

// =============================================================================
// Adapter — filters
// =============================================================================

describe('telemetry-trends adapter — filters', () => {
  it('half-open range filter `[from, to)` drops points at the exclusive upper bound', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();
    // First 10 minutes only.
    const ten = new Date(Date.parse(FROM) + 10 * 60 * 1000).toISOString();
    const response = await adapterGetTelemetryTrends({
      unitId: HP_001_ID,
      from: FROM,
      to: ten,
      canonicalTagName: 'p_inlet',
    });
    expect(response.points).toHaveLength(10);
    expect(response.points[0]?.timestamp).toBe(FROM);
  });

  it('returns empty points when the range falls outside the fixture window', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();
    const response = await adapterGetTelemetryTrends({
      unitId: HP_001_ID,
      from: '2030-01-01T00:00:00.000Z',
      to: '2030-01-01T01:00:00.000Z',
      canonicalTagName: 'p_inlet',
    });
    expect(isTelemetryTrendEmpty(response)).toBe(true);
    expect(response.canonicalTag.name).toBe('p_inlet');
  });

  it('applies the quality filter (every synthetic point is `good`)', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();
    const good = await adapterGetTelemetryTrends({
      unitId: HP_001_ID,
      from: FROM,
      to: TO,
      canonicalTagName: 'p_inlet',
      quality: 'good',
    });
    expect(good.points).toHaveLength(60);
    const bad = await adapterGetTelemetryTrends({
      unitId: HP_001_ID,
      from: FROM,
      to: TO,
      canonicalTagName: 'p_inlet',
      quality: 'bad',
    });
    expect(bad.points).toHaveLength(0);
  });

  it('applies the source filter (every synthetic point reports source=mock)', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();
    const mockSource = await adapterGetTelemetryTrends({
      unitId: HP_001_ID,
      from: FROM,
      to: TO,
      canonicalTagName: 'p_inlet',
      source: 'mock',
    });
    expect(mockSource.points).toHaveLength(60);
    const mqtt = await adapterGetTelemetryTrends({
      unitId: HP_001_ID,
      from: FROM,
      to: TO,
      canonicalTagName: 'p_inlet',
      source: 'mqtt',
    });
    expect(mqtt.points).toHaveLength(0);
  });

  it('caps results by `limit`', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();
    const response = await adapterGetTelemetryTrends({
      unitId: HP_001_ID,
      from: FROM,
      to: TO,
      canonicalTagName: 'p_inlet',
      limit: 5,
    });
    expect(response.points).toHaveLength(5);
  });
});

// =============================================================================
// Adapter — validation parity
// =============================================================================

describe('telemetry-trends adapter — validation', () => {
  it('rejects ambiguous input (both canonicalTagId and canonicalTagName) with 400', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();
    expect(P_INLET_TAG).toBeDefined();
    if (!P_INLET_TAG) return;

    const promise = adapterGetTelemetryTrends({
      unitId: HP_001_ID,
      from: FROM,
      to: TO,
      canonicalTagId: P_INLET_TAG.id,
      canonicalTagName: 'p_inlet',
    });
    await expect(promise).rejects.toBeInstanceOf(RvfApiError);
    await promise.catch((err: unknown) => {
      expect((err as RvfApiError).status).toBe(400);
    });
  });

  it('rejects when neither canonicalTagId nor canonicalTagName is provided', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const promise = adapterGetTelemetryTrends({
      unitId: HP_001_ID,
      from: FROM,
      to: TO,
    });
    await expect(promise).rejects.toBeInstanceOf(RvfApiError);
  });

  it('rejects when `from >= to`', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    await expect(
      adapterGetTelemetryTrends({
        unitId: HP_001_ID,
        from: TO,
        to: FROM,
        canonicalTagName: 'p_inlet',
      }),
    ).rejects.toBeInstanceOf(RvfApiError);

    await expect(
      adapterGetTelemetryTrends({
        unitId: HP_001_ID,
        from: FROM,
        to: FROM,
        canonicalTagName: 'p_inlet',
      }),
    ).rejects.toBeInstanceOf(RvfApiError);
  });

  it('returns the empty-envelope shape for an unknown tag (mock posture)', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterGetTelemetryTrends({
      unitId: HP_001_ID,
      from: FROM,
      to: TO,
      canonicalTagName: 'not_a_real_tag',
    });
    expect(response.points).toHaveLength(0);
    expect(response.canonicalTag.name).toBe('not_a_real_tag');
  });

  it('rejects bucket without aggregate (mirrors backend Zod refine)', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    await expect(
      adapterGetTelemetryTrends({
        unitId: HP_001_ID,
        from: FROM,
        to: TO,
        canonicalTagName: 'p_inlet',
        bucket: '1m',
      }),
    ).rejects.toBeInstanceOf(RvfApiError);
  });

  it('rejects aggregate without bucket (mirrors backend Zod refine)', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    await expect(
      adapterGetTelemetryTrends({
        unitId: HP_001_ID,
        from: FROM,
        to: TO,
        canonicalTagName: 'p_inlet',
        aggregate: 'avg',
      }),
    ).rejects.toBeInstanceOf(RvfApiError);
  });

  it('rejects qualityPolicy without bucket (mirrors backend Zod refine)', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    await expect(
      adapterGetTelemetryTrends({
        unitId: HP_001_ID,
        from: FROM,
        to: TO,
        canonicalTagName: 'p_inlet',
        qualityPolicy: 'good_only',
      }),
    ).rejects.toBeInstanceOf(RvfApiError);
  });

  it('returns the empty-envelope shape for a known tag with no fixture (e.g. LP-001 / vib_x)', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterGetTelemetryTrends({
      unitId: '00000000-0000-0000-0000-000000004412',
      from: FROM,
      to: TO,
      canonicalTagName: 'vib_x',
    });
    expect(response.points).toHaveLength(0);
    expect(response.canonicalTag.name).toBe('vib_x'); // dictionary still resolves
  });
});

// =============================================================================
// API mode
// =============================================================================

describe('telemetry-trends adapter — api mode', () => {
  it('composes the trends URL with every supported filter', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fixture = MOCK_F4_TELEMETRY_TRENDS[`${HP_001_ID}::p_inlet`];
    const fetchMock = stubFetchOk(fixture);

    await adapterGetTelemetryTrends({
      unitId: HP_001_ID,
      from: FROM,
      to: TO,
      canonicalTagName: 'p_inlet',
      jobId: '00000000-0000-0000-0000-000000004444',
      quality: 'good',
      source: 'mock',
      limit: 100,
    });

    const url = fetchMock.mock.calls[0]?.[0];
    expect(typeof url).toBe('string');
    if (typeof url !== 'string') return;
    expect(url.startsWith(`${API_BASE}/telemetry/trends?`)).toBe(true);
    expect(url).toContain(`unitId=${HP_001_ID}`);
    // The query builder encodes ISO timestamp colons as `%3A`.
    expect(url).toContain('from=2026-05-24T00%3A00%3A00.000Z');
    expect(url).toContain('canonicalTagName=p_inlet');
    expect(url).toContain('jobId=00000000-0000-0000-0000-000000004444');
    expect(url).toContain('quality=good');
    expect(url).toContain('source=mock');
    expect(url).toContain('limit=100');
  });

  it('forwards bucketed-mode params (bucket / aggregate / qualityPolicy)', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fetchMock = stubFetchOk({
      unitId: HP_001_ID,
      canonicalTag: {
        id: 'tag-1',
        name: 'p_inlet',
        displayName: 'Inlet pressure',
        canonicalUnit: 'psi',
        category: 'pressure',
        precision: 1,
      },
      range: { from: FROM, to: TO },
      points: [],
      bucket: '5m',
      aggregate: 'avg',
      qualityPolicy: 'good_only',
      buckets: [{ bucketStart: FROM, bucketEnd: TO, value: 3800.0, sampleCount: 60 }],
    });

    await adapterGetTelemetryTrends({
      unitId: HP_001_ID,
      from: FROM,
      to: TO,
      canonicalTagName: 'p_inlet',
      bucket: '5m',
      aggregate: 'avg',
      qualityPolicy: 'good_only',
    });

    const url = fetchMock.mock.calls[0]?.[0];
    expect(typeof url).toBe('string');
    if (typeof url !== 'string') return;
    expect(url).toContain('bucket=5m');
    expect(url).toContain('aggregate=avg');
    expect(url).toContain('qualityPolicy=good_only');
  });

  it('api error surfaces as RvfApiError (no silent fallback to mock)', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const headers = new Headers({ 'content-type': 'application/json' });
    const response = new Response(
      JSON.stringify({
        statusCode: 400,
        message: 'exactly one of `canonicalTagId` or `canonicalTagName` must be provided',
        error: 'Bad Request',
      }),
      { status: 400, headers },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.resolve(response)),
    );

    await expect(
      adapterGetTelemetryTrends({
        unitId: HP_001_ID,
        from: FROM,
        to: TO,
      }),
    ).rejects.toBeInstanceOf(RvfApiError);
  });
});

// =============================================================================
// Numeric-conversion helpers
// =============================================================================

describe('toNumericTelemetryPoint', () => {
  it('converts a Decimal-string value to a finite number', () => {
    const point: TelemetryPoint = {
      timestamp: '2026-05-24T00:00:00.000Z',
      value: '3812.4',
      engineeringUnit: 'psi',
      quality: 'good',
      source: 'mock',
    };
    expect(toNumericTelemetryPoint(point)).toEqual({
      timestamp: point.timestamp,
      value: 3812.4,
      engineeringUnit: 'psi',
      quality: 'good',
      source: 'mock',
    });
  });

  it('returns value=null for an unparseable Decimal string', () => {
    const point: TelemetryPoint = {
      timestamp: '2026-05-24T00:00:00.000Z',
      value: 'not-a-number',
      engineeringUnit: 'psi',
      quality: 'good',
      source: 'mock',
    };
    expect(toNumericTelemetryPoint(point).value).toBeNull();
  });

  it('returns value=null for Infinity / NaN sentinels', () => {
    const point: TelemetryPoint = {
      timestamp: '2026-05-24T00:00:00.000Z',
      value: 'Infinity',
      engineeringUnit: 'psi',
      quality: 'good',
      source: 'mock',
    };
    expect(toNumericTelemetryPoint(point).value).toBeNull();
  });
});

describe('toNumericTelemetrySeries', () => {
  it('maps every point and reports `validCount`', () => {
    const response: TelemetryTrendsResponse = {
      unitId: HP_001_ID,
      canonicalTag: {
        id: 'tag-1',
        name: 'p_inlet',
        displayName: 'Inlet pressure',
        canonicalUnit: 'psi',
        category: 'pressure',
        precision: 1,
      },
      range: { from: FROM, to: TO },
      points: [
        {
          timestamp: FROM,
          value: '3800.0',
          engineeringUnit: 'psi',
          quality: 'good',
          source: 'mock',
        },
        {
          timestamp: TO,
          value: 'not-a-number',
          engineeringUnit: 'psi',
          quality: 'good',
          source: 'mock',
        },
      ],
    };

    const series = toNumericTelemetrySeries(response);
    expect(series.points).toHaveLength(2);
    expect(series.points[0]?.value).toBe(3800);
    expect(series.points[1]?.value).toBeNull();
    expect(series.validCount).toBe(1);
    expect(series.canonicalTag.name).toBe('p_inlet');
    expect(series.range).toEqual(response.range);
  });

  it('handles the synthetic HP-001 trend end-to-end (all 60 points parse cleanly)', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterGetTelemetryTrends({
      unitId: HP_001_ID,
      from: FROM,
      to: TO,
      canonicalTagName: 'p_inlet',
    });
    const series = toNumericTelemetrySeries(response);
    expect(series.validCount).toBe(60);
    expect(series.points.every((p) => p.value !== null)).toBe(true);
  });
});

describe('isTelemetryTrendEmpty', () => {
  it('returns true when points is empty', () => {
    expect(
      isTelemetryTrendEmpty({
        unitId: HP_001_ID,
        canonicalTag: {
          id: 'tag-1',
          name: 'p_inlet',
          displayName: 'Inlet pressure',
          canonicalUnit: 'psi',
          category: 'pressure',
          precision: 1,
        },
        range: { from: FROM, to: TO },
        points: [],
      }),
    ).toBe(true);
  });

  it('returns false when at least one point is present', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterGetTelemetryTrends({
      unitId: HP_001_ID,
      from: FROM,
      to: TO,
      canonicalTagName: 'p_inlet',
    });
    expect(isTelemetryTrendEmpty(response)).toBe(false);
  });
});
