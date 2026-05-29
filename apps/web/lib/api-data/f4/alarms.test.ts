import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MOCK_F4_ALARM_EVENTS, MOCK_F4_CANONICAL_TAGS, adapterGetAlarmEvents } from './index';

import { RvfApiError } from '@/lib/api/f4';

/**
 * F4.6D.2.1 — Alarm-events adapter tests.
 *
 * Mirrors the F4.6C.2.1 `latest.test.ts` posture: mock-mode tests stub
 * `fetch` with a throwing function (guard), api-mode tests stub `fetch`
 * with a deterministic response and assert composed URLs.
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
// Mock mode
// =============================================================================

describe('adapterGetAlarmEvents — mock mode', () => {
  it("default state='active' returns the HP-001 active warning row when unitId=HP-001", async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterGetAlarmEvents({ unitId: HP_001_ID });

    expect(response.source).toBe('alarm_events');
    expect(response.state).toBe('active');
    expect(typeof response.generatedAt).toBe('string');
    expect(response.events).toHaveLength(1);
    expect(response.events[0]?.unitId).toBe(HP_001_ID);
    expect(response.events[0]?.severity).toBe('warning');
    expect(response.events[0]?.state).toBe('active');
    expect(response.events[0]?.canonicalTag.name).toBe('p_inlet');
    expect(typeof response.events[0]?.triggeredValue).toBe('string');
  });

  it("state='cleared' returns empty (the fixture has no cleared rows)", async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterGetAlarmEvents({ unitId: HP_001_ID, state: 'cleared' });

    expect(response.state).toBe('cleared');
    expect(response.events).toHaveLength(0);
  });

  it('LP-001 returns an empty envelope (the unit has no active rows in the fixture)', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterGetAlarmEvents({ unitId: LP_001_ID });

    expect(response.events).toHaveLength(0);
    expect(response.source).toBe('alarm_events');
  });

  it('unknown unit → empty envelope (no 404)', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterGetAlarmEvents({ unitId: UNKNOWN_UUID });

    expect(response.events).toHaveLength(0);
  });

  it('omitting unitId returns the union of all known unit rows', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterGetAlarmEvents({});

    const expectedCount = Object.values(MOCK_F4_ALARM_EVENTS).reduce(
      (acc, rows) => acc + rows.filter((r) => r.state === 'active').length,
      0,
    );
    expect(response.events).toHaveLength(expectedCount);
  });

  it('canonicalTagId filter narrows the result', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();
    expect(P_INLET_TAG).toBeDefined();
    if (!P_INLET_TAG) return;

    const response = await adapterGetAlarmEvents({
      unitId: HP_001_ID,
      canonicalTagId: P_INLET_TAG.id,
    });

    expect(response.events).toHaveLength(1);
    expect(response.events[0]?.canonicalTag.id).toBe(P_INLET_TAG.id);
  });

  it('canonicalTagName filter narrows the result', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterGetAlarmEvents({
      unitId: HP_001_ID,
      canonicalTagName: 'p_inlet',
    });

    expect(response.events).toHaveLength(1);
    expect(response.events[0]?.canonicalTag.name).toBe('p_inlet');
  });

  it('unknown canonical-tag name → empty envelope', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterGetAlarmEvents({
      unitId: HP_001_ID,
      canonicalTagName: 'not_a_real_tag',
    });

    expect(response.events).toHaveLength(0);
  });

  it('rejects supplying both canonicalTagId and canonicalTagName (mock mirrors backend XOR)', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();
    expect(P_INLET_TAG).toBeDefined();
    if (!P_INLET_TAG) return;

    await expect(
      adapterGetAlarmEvents({
        unitId: HP_001_ID,
        canonicalTagId: P_INLET_TAG.id,
        canonicalTagName: 'p_inlet',
      }),
    ).rejects.toBeInstanceOf(RvfApiError);
  });

  it('severity filter narrows the result', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const critical = await adapterGetAlarmEvents({ unitId: HP_001_ID, severity: 'critical' });
    const warning = await adapterGetAlarmEvents({ unitId: HP_001_ID, severity: 'warning' });

    expect(critical.events).toHaveLength(0);
    expect(warning.events).toHaveLength(1);
  });

  it('rejects time window when only `from` is supplied', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    await expect(
      adapterGetAlarmEvents({ unitId: HP_001_ID, from: '2026-05-29T12:00:00.000Z' }),
    ).rejects.toBeInstanceOf(RvfApiError);
  });

  it('rejects time window when `from >= to`', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    await expect(
      adapterGetAlarmEvents({
        unitId: HP_001_ID,
        from: '2026-05-29T13:00:00.000Z',
        to: '2026-05-29T13:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(RvfApiError);
  });

  it('time-window filter passes events inside the window', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();
    const fixtureTs = MOCK_F4_ALARM_EVENTS[HP_001_ID]?.[0]?.firstTriggeredAt;
    expect(fixtureTs).toBeDefined();
    if (!fixtureTs) return;

    const center = Date.parse(fixtureTs);
    const from = new Date(center - 60_000).toISOString();
    const to = new Date(center + 60_000).toISOString();

    const response = await adapterGetAlarmEvents({ unitId: HP_001_ID, from, to });

    expect(response.events).toHaveLength(1);
  });

  it('time-window filter drops events outside the window', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();
    const fixtureTs = MOCK_F4_ALARM_EVENTS[HP_001_ID]?.[0]?.firstTriggeredAt;
    expect(fixtureTs).toBeDefined();
    if (!fixtureTs) return;

    const farFuture = new Date(Date.parse(fixtureTs) + 24 * 60 * 60 * 1000).toISOString();
    const evenFarther = new Date(Date.parse(fixtureTs) + 48 * 60 * 60 * 1000).toISOString();

    const response = await adapterGetAlarmEvents({
      unitId: HP_001_ID,
      from: farFuture,
      to: evenFarther,
    });

    expect(response.events).toHaveLength(0);
  });

  it('limit caps the rendered list', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterGetAlarmEvents({ limit: 0 + 1 });

    expect(response.events.length).toBeLessThanOrEqual(1);
  });

  it('lifecycle columns are surfaced as null', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterGetAlarmEvents({ unitId: HP_001_ID });
    const row = response.events[0];

    expect(row).toBeDefined();
    if (!row) return;
    expect(row.acknowledgedAt).toBeNull();
    expect(row.acknowledgedBy).toBeNull();
    expect(row.clearedAt).toBeNull();
  });
});

// =============================================================================
// API mode
// =============================================================================

describe('adapterGetAlarmEvents — api mode', () => {
  it('composes /alarms/events URL with default state when no params supplied', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fixture = {
      generatedAt: new Date().toISOString(),
      source: 'alarm_events' as const,
      state: 'active' as const,
      events: [],
    };
    const fetchMock = stubFetchOk(fixture);

    await adapterGetAlarmEvents({});

    const url = fetchMock.mock.calls[0]?.[0];
    expect(typeof url).toBe('string');
    if (typeof url !== 'string') return;
    expect(url.startsWith(`${API_BASE}/alarms/events`)).toBe(true);
  });

  it('forwards unitId / state / severity / limit in the query string', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fetchMock = stubFetchOk({
      generatedAt: new Date().toISOString(),
      source: 'alarm_events',
      state: 'cleared',
      events: [],
    });

    await adapterGetAlarmEvents({
      unitId: HP_001_ID,
      state: 'cleared',
      severity: 'critical',
      limit: 25,
    });

    const url = fetchMock.mock.calls[0]?.[0];
    expect(typeof url).toBe('string');
    if (typeof url !== 'string') return;
    expect(url).toContain(`unitId=${HP_001_ID}`);
    expect(url).toContain('state=cleared');
    expect(url).toContain('severity=critical');
    expect(url).toContain('limit=25');
  });

  it('forwards from / to in the query string', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fetchMock = stubFetchOk({
      generatedAt: new Date().toISOString(),
      source: 'alarm_events',
      state: 'active',
      events: [],
    });

    await adapterGetAlarmEvents({
      from: '2026-05-29T12:00:00.000Z',
      to: '2026-05-29T13:00:00.000Z',
    });

    const url = fetchMock.mock.calls[0]?.[0];
    expect(typeof url).toBe('string');
    if (typeof url !== 'string') return;
    expect(url).toContain('from=');
    expect(url).toContain('to=');
  });

  it('forwards canonicalTagName in the query string', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fetchMock = stubFetchOk({
      generatedAt: new Date().toISOString(),
      source: 'alarm_events',
      state: 'active',
      events: [],
    });

    await adapterGetAlarmEvents({ canonicalTagName: 'p_inlet' });

    const url = fetchMock.mock.calls[0]?.[0];
    expect(typeof url).toBe('string');
    if (typeof url !== 'string') return;
    expect(url).toContain('canonicalTagName=p_inlet');
  });

  it('api 200 with empty events parses cleanly', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    stubFetchOk({
      generatedAt: new Date().toISOString(),
      source: 'alarm_events',
      state: 'active',
      events: [],
    });

    const response = await adapterGetAlarmEvents({ unitId: UNKNOWN_UUID });

    expect(response.events).toEqual([]);
    expect(response.source).toBe('alarm_events');
    expect(response.state).toBe('active');
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
      adapterGetAlarmEvents({
        canonicalTagId: '00000000-0000-0000-0000-0000000044f1',
        canonicalTagName: 'p_inlet',
      }),
    ).rejects.toBeInstanceOf(RvfApiError);
  });
});
