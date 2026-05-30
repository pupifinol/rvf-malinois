import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MOCK_F4_WELL_TESTS,
  MOCK_F4_WELL_TEST_DETAILS,
  adapterAbortWellTest,
  adapterCloseWellTest,
  adapterConnectWellTest,
  adapterCreateWellTest,
  adapterEndWellTestOfficial,
  adapterGetActiveWellTest,
  adapterGetWellTestById,
  adapterListWellTests,
  adapterStartWellTestOfficial,
  adapterStartWellTestStabilization,
  resetMockWellTestsStore,
} from './index';

import { RvfApiError } from '@/lib/api/f4';

/**
 * F4.7.1 — Well-tests dual-mode adapter tests.
 *
 * Mirrors the F4.6D.2.1 `alarms.test.ts` posture: mock-mode tests stub
 * `fetch` with a throwing function (guard), api-mode tests stub `fetch`
 * with a deterministic response and assert composed URLs.
 */

const ORIGINAL_DATA_SOURCE = process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
const ORIGINAL_API_BASE_URL = process.env.NEXT_PUBLIC_RVF_API_BASE_URL;
const API_BASE = 'https://api.example.test/api/v1';

const HP_001_ID = '00000000-0000-0000-0000-000000004411';
const LP_001_ID = '00000000-0000-0000-0000-000000004412';
const UNKNOWN_UUID = '00000000-0000-0000-0000-00000000ffff';

const HP_001_FIXTURE_IDS = MOCK_F4_WELL_TESTS[HP_001_ID]?.map((r) => r.id) ?? [];
const HP_001_MEASURING_ID = HP_001_FIXTURE_IDS[0] ?? '';
const HP_001_SCHEDULED_ID = HP_001_FIXTURE_IDS[1] ?? '';

beforeEach(() => {
  process.env.NEXT_PUBLIC_RVF_API_BASE_URL = API_BASE;
  resetMockWellTestsStore();
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

// ============================================================================
// Mock mode — list / detail / active
// ============================================================================

describe('adapterListWellTests — mock mode', () => {
  it('returns all known rows when called with no params', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterListWellTests();

    expect(response.source).toBe('well_tests');
    const expectedCount = Object.values(MOCK_F4_WELL_TESTS).reduce(
      (acc, rows) => acc + rows.length,
      0,
    );
    expect(response.wellTests).toHaveLength(expectedCount);
  });

  it('filters by unitId (HP-001)', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterListWellTests({ unitId: HP_001_ID });

    expect(response.wellTests.every((r) => r.unitId === HP_001_ID)).toBe(true);
    expect(response.wellTests.length).toBeGreaterThan(0);
  });

  it('filters by unitId (LP-001) returns empty', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterListWellTests({ unitId: LP_001_ID });

    expect(response.wellTests).toEqual([]);
  });

  it('filters by lifecycleStatus', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const measuring = await adapterListWellTests({ lifecycleStatus: 'measuring' });
    const scheduled = await adapterListWellTests({ lifecycleStatus: 'scheduled' });

    expect(measuring.wellTests.every((r) => r.lifecycleStatus === 'measuring')).toBe(true);
    expect(scheduled.wellTests.every((r) => r.lifecycleStatus === 'scheduled')).toBe(true);
  });

  it('filters by testType', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const fisc = await adapterListWellTests({ testType: 'fiscalizacion' });
    const opt = await adapterListWellTests({ testType: 'optimizacion' });

    expect(fisc.wellTests.every((r) => r.testType === 'fiscalizacion')).toBe(true);
    expect(opt.wellTests.every((r) => r.testType === 'optimizacion')).toBe(true);
  });

  it('rejects time window when only `from` is supplied', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    await expect(adapterListWellTests({ from: '2026-05-29T08:00:00.000Z' })).rejects.toBeInstanceOf(
      RvfApiError,
    );
  });

  it('rejects time window when `from >= to`', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    await expect(
      adapterListWellTests({
        from: '2026-05-29T13:00:00.000Z',
        to: '2026-05-29T13:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(RvfApiError);
  });

  it('limit caps the response length', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterListWellTests({ limit: 1 });

    expect(response.wellTests).toHaveLength(1);
  });
});

describe('adapterGetWellTestById — mock mode', () => {
  it('returns the detail for the measuring HP-001 test', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const detail = await adapterGetWellTestById(HP_001_MEASURING_ID);

    expect(detail.id).toBe(HP_001_MEASURING_ID);
    expect(detail.testType).toBe('fiscalizacion');
    expect(detail.lifecycleStatus).toBe('measuring');
    expect(detail.unit.code).toBe('HP-001');
  });

  it('rejects an unknown id with RvfApiError(404)', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    await expect(adapterGetWellTestById(UNKNOWN_UUID)).rejects.toBeInstanceOf(RvfApiError);
  });
});

describe('adapterGetActiveWellTest — mock mode', () => {
  it('returns the measuring row for HP-001', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterGetActiveWellTest({ unitId: HP_001_ID });

    expect(response.active?.id).toBe(HP_001_MEASURING_ID);
    expect(response.active?.lifecycleStatus).toBe('measuring');
  });

  it('returns { active: null } for LP-001 (no active test)', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterGetActiveWellTest({ unitId: LP_001_ID });

    expect(response.active).toBeNull();
  });

  it('returns { active: null } for an unknown unit', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const response = await adapterGetActiveWellTest({ unitId: UNKNOWN_UUID });

    expect(response.active).toBeNull();
  });
});

// ============================================================================
// Mock mode — create
// ============================================================================

describe('adapterCreateWellTest — mock mode', () => {
  const BASE = {
    jobId: '00000000-0000-0000-0000-000000004444',
    wellId: '00000000-0000-0000-0000-000000004400',
    unitId: HP_001_ID,
  } as const;

  it('Fiscalización 24h + fiscalizacion_pdf succeeds', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const detail = await adapterCreateWellTest({
      ...BASE,
      testType: 'fiscalizacion',
      reportType: 'fiscalizacion_pdf',
      plannedOfficialDurationHours: 24,
    });

    expect(detail.lifecycleStatus).toBe('scheduled');
    expect(detail.plannedOfficialDurationHours).toBe(24);
  });

  it('Optimización 12..24h + optimizacion_pdf succeeds', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const detail = await adapterCreateWellTest({
      ...BASE,
      testType: 'optimizacion',
      reportType: 'optimizacion_pdf',
      plannedOfficialDurationHours: 18,
    });

    expect(detail.testType).toBe('optimizacion');
  });

  it('rejects Fiscalización with duration != 24', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    await expect(
      adapterCreateWellTest({
        ...BASE,
        testType: 'fiscalizacion',
        reportType: 'fiscalizacion_pdf',
        plannedOfficialDurationHours: 12,
      }),
    ).rejects.toBeInstanceOf(RvfApiError);
  });

  it('rejects Optimización outside 12..24', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    await expect(
      adapterCreateWellTest({
        ...BASE,
        testType: 'optimizacion',
        reportType: 'optimizacion_pdf',
        plannedOfficialDurationHours: 11,
      }),
    ).rejects.toBeInstanceOf(RvfApiError);
  });

  it('rejects reportType / testType mismatch', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    await expect(
      adapterCreateWellTest({
        ...BASE,
        testType: 'fiscalizacion',
        reportType: 'optimizacion_pdf',
        plannedOfficialDurationHours: 24,
      }),
    ).rejects.toBeInstanceOf(RvfApiError);
  });
});

// ============================================================================
// Mock mode — transitions
// ============================================================================

describe('adapter transitions — mock mode', () => {
  it('scheduled → connected; connectedAt populated', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    // Note: HP-001 already has a measuring test, so connecting the scheduled
    // one is blocked. We create a brand-new test on LP-001 (no active test
    // exists for it) instead — bypasses the no-overlap guard.
    const created = await adapterCreateWellTest({
      jobId: '00000000-0000-0000-0000-000000004444',
      wellId: '00000000-0000-0000-0000-000000004400',
      unitId: LP_001_ID,
      testType: 'optimizacion',
      reportType: 'optimizacion_pdf',
      plannedOfficialDurationHours: 18,
    });

    const connected = await adapterConnectWellTest(created.id);

    expect(connected.lifecycleStatus).toBe('connected');
    expect(connected.connectedAt).not.toBeNull();
  });

  it('rejects connect from non-scheduled status (already connected fixture)', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    // HP-001 measuring fixture is not in `scheduled`.
    await expect(adapterConnectWellTest(HP_001_MEASURING_ID)).rejects.toBeInstanceOf(RvfApiError);
  });

  it('rejects connect when the unit has another active test (409)', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    // HP-001 already has the measuring fixture; connecting the scheduled
    // fixture must be rejected per the no-overlap guard.
    await expect(adapterConnectWellTest(HP_001_SCHEDULED_ID)).rejects.toBeInstanceOf(RvfApiError);
  });

  it('full happy-path lifecycle: scheduled → connected → stabilizing → measuring → completed → closed', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const created = await adapterCreateWellTest({
      jobId: '00000000-0000-0000-0000-000000004444',
      wellId: '00000000-0000-0000-0000-000000004400',
      unitId: LP_001_ID,
      testType: 'optimizacion',
      reportType: 'optimizacion_pdf',
      plannedOfficialDurationHours: 12,
    });

    const a = await adapterConnectWellTest(created.id);
    expect(a.lifecycleStatus).toBe('connected');

    const b = await adapterStartWellTestStabilization(created.id);
    expect(b.lifecycleStatus).toBe('stabilizing');

    const c = await adapterStartWellTestOfficial(created.id);
    expect(c.lifecycleStatus).toBe('measuring');
    expect(c.officialStartedAt).not.toBeNull();
    expect(c.stabilizationEndedAt).toBe(c.officialStartedAt);

    const d = await adapterEndWellTestOfficial(created.id);
    expect(d.lifecycleStatus).toBe('completed');
    expect(d.officialEndedAt).not.toBeNull();
    expect(d.actualOfficialDurationSeconds).not.toBeNull();

    const e = await adapterCloseWellTest(created.id);
    expect(e.lifecycleStatus).toBe('closed');
    expect(e.disconnectedAt).not.toBeNull();
  });

  it('abort from measuring requires abortReason', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const aborted = await adapterAbortWellTest(HP_001_MEASURING_ID, {
      abortReason: 'sensor failure',
    });

    expect(aborted.lifecycleStatus).toBe('aborted');
    expect(aborted.abortReason).toBe('sensor failure');
  });

  it('rejects close from non-completed status (409)', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    await expect(adapterCloseWellTest(HP_001_MEASURING_ID)).rejects.toBeInstanceOf(RvfApiError);
  });
});

// ============================================================================
// API mode
// ============================================================================

describe('adapterListWellTests — api mode', () => {
  it('composes /well-tests with default state when no params supplied', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fetchMock = stubFetchOk({
      generatedAt: new Date().toISOString(),
      source: 'well_tests',
      wellTests: [],
    });

    await adapterListWellTests();

    const url = fetchMock.mock.calls[0]?.[0];
    expect(typeof url).toBe('string');
    if (typeof url !== 'string') return;
    expect(url.startsWith(`${API_BASE}/well-tests`)).toBe(true);
  });

  it('forwards filters in the query string', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fetchMock = stubFetchOk({
      generatedAt: new Date().toISOString(),
      source: 'well_tests',
      wellTests: [],
    });

    await adapterListWellTests({
      unitId: HP_001_ID,
      lifecycleStatus: 'measuring',
      testType: 'fiscalizacion',
      limit: 10,
    });

    const url = fetchMock.mock.calls[0]?.[0];
    expect(typeof url).toBe('string');
    if (typeof url !== 'string') return;
    expect(url).toContain(`unitId=${HP_001_ID}`);
    expect(url).toContain('lifecycleStatus=measuring');
    expect(url).toContain('testType=fiscalizacion');
    expect(url).toContain('limit=10');
  });
});

describe('adapterGetActiveWellTest — api mode', () => {
  it('composes /well-tests/active with the unitId query', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fetchMock = stubFetchOk({
      generatedAt: new Date().toISOString(),
      source: 'well_tests',
      active: null,
    });

    await adapterGetActiveWellTest({ unitId: HP_001_ID });

    const url = fetchMock.mock.calls[0]?.[0];
    expect(typeof url).toBe('string');
    if (typeof url !== 'string') return;
    expect(url.startsWith(`${API_BASE}/well-tests/active?`)).toBe(true);
    expect(url).toContain(`unitId=${HP_001_ID}`);
  });
});

describe('adapterCreateWellTest — api mode', () => {
  it('POSTs /well-tests with the payload as JSON', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fetchMock = stubFetchOk(
      MOCK_F4_WELL_TEST_DETAILS[HP_001_MEASURING_ID] ?? {
        id: HP_001_MEASURING_ID,
        jobId: '',
        wellId: '',
        unitId: HP_001_ID,
        testType: 'fiscalizacion',
        reportType: 'fiscalizacion_pdf',
        lifecycleStatus: 'scheduled',
        plannedOfficialDurationHours: 24,
        actualOfficialDurationSeconds: null,
        connectedAt: null,
        stabilizationStartedAt: null,
        stabilizationEndedAt: null,
        officialStartedAt: null,
        officialEndedAt: null,
        disconnectedAt: null,
        reportGeneratedAt: null,
        abortedAt: null,
        abortReason: null,
        notes: null,
        clientReference: null,
        createdAt: '2026-05-29T00:00:00.000Z',
        updatedAt: '2026-05-29T00:00:00.000Z',
        job: { id: '', status: 'in_progress', startedAt: null, closedAt: null },
        well: { id: '', name: '', fieldOrSite: null },
        unit: { id: HP_001_ID, code: 'HP-001', name: 'HP-001' },
      },
    );

    await adapterCreateWellTest({
      jobId: '00000000-0000-0000-0000-000000004444',
      wellId: '00000000-0000-0000-0000-000000004400',
      unitId: HP_001_ID,
      testType: 'fiscalizacion',
      reportType: 'fiscalizacion_pdf',
      plannedOfficialDurationHours: 24,
    });

    const call = fetchMock.mock.calls[0];
    const url = call?.[0];
    const init = call?.[1];
    expect(url).toBe(`${API_BASE}/well-tests`);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual(expect.objectContaining({ 'Content-Type': 'application/json' }));
    const body = init?.body;
    expect(typeof body).toBe('string');
    if (typeof body !== 'string') return;
    expect(JSON.parse(body)).toEqual(
      expect.objectContaining({ testType: 'fiscalizacion', plannedOfficialDurationHours: 24 }),
    );
  });
});

describe('adapter transition wrappers — api mode', () => {
  it('connect POSTs /well-tests/:id/connect', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fetchMock = stubFetchOk(MOCK_F4_WELL_TEST_DETAILS[HP_001_MEASURING_ID]);

    await adapterConnectWellTest(HP_001_MEASURING_ID);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${API_BASE}/well-tests/${HP_001_MEASURING_ID}/connect`,
    );
  });

  it('abort POSTs /well-tests/:id/abort with the body', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fetchMock = stubFetchOk(MOCK_F4_WELL_TEST_DETAILS[HP_001_MEASURING_ID]);

    await adapterAbortWellTest(HP_001_MEASURING_ID, { abortReason: 'test' });

    const init = fetchMock.mock.calls[0]?.[1];
    const body = init?.body;
    if (typeof body !== 'string') return;
    expect(JSON.parse(body)).toEqual({ abortReason: 'test' });
  });

  it('close POSTs /well-tests/:id/close with optional reportGeneratedAt', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fetchMock = stubFetchOk(MOCK_F4_WELL_TEST_DETAILS[HP_001_MEASURING_ID]);

    await adapterCloseWellTest(HP_001_MEASURING_ID, {
      reportGeneratedAt: '2026-05-30T00:00:00.000Z',
    });

    const init = fetchMock.mock.calls[0]?.[1];
    const body = init?.body;
    if (typeof body !== 'string') return;
    const parsed = JSON.parse(body) as { reportGeneratedAt?: string };
    expect(parsed.reportGeneratedAt).toBe('2026-05-30T00:00:00.000Z');
  });

  it('api 4xx surfaces as RvfApiError', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const headers = new Headers({ 'content-type': 'application/json' });
    const response = new Response(
      JSON.stringify({ statusCode: 409, message: 'Cannot transition' }),
      { status: 409, headers },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.resolve(response)),
    );

    await expect(adapterConnectWellTest(HP_001_MEASURING_ID)).rejects.toBeInstanceOf(RvfApiError);
  });
});

// =============================================================================
// F4.7.2.1 — Mock fixture / trend-fixture range alignment
// =============================================================================
//
// `MOCK_F4_WELL_TESTS[HP-001]` measuring row's official-window timestamps
// must intersect `MOCK_F4_TELEMETRY_TRENDS` so the Operations `<TrendDrawer>`
// `Stabilization` / `Official Window` / `Full Test` pills render meaningful
// data in mock mode. Pre-F4.7.2.1 the WellTest fixture used May 29
// timestamps while the trend fixture covered May 24 → the official-window
// query returned zero points and the drawer showed an empty chart.

describe('MOCK_F4_WELL_TESTS — F4.7.2.1 trend-fixture range alignment', () => {
  it('HP-001 measuring fixture officialStartedAt falls inside the mock trend range', () => {
    const rows = MOCK_F4_WELL_TESTS[HP_001_ID];
    expect(rows).toBeDefined();
    const measuring = rows?.find((r) => r.lifecycleStatus === 'measuring');
    expect(measuring).toBeDefined();
    if (!measuring) return;
    // Mock trend fixture covers 2026-05-24T00:00:00Z → 2026-05-24T01:00:00Z.
    expect(Date.parse(measuring.officialStartedAt ?? '')).toBeGreaterThanOrEqual(
      Date.parse('2026-05-24T00:00:00.000Z'),
    );
    expect(Date.parse(measuring.officialStartedAt ?? '')).toBeLessThan(
      Date.parse('2026-05-24T01:00:00.000Z'),
    );
  });

  it('HP-001 measuring fixture stabilization window falls inside the mock trend range', () => {
    const measuring = MOCK_F4_WELL_TESTS[HP_001_ID]?.find((r) => r.lifecycleStatus === 'measuring');
    expect(measuring).toBeDefined();
    if (!measuring) return;
    expect(Date.parse(measuring.stabilizationStartedAt ?? '')).toBeGreaterThanOrEqual(
      Date.parse('2026-05-24T00:00:00.000Z'),
    );
    expect(Date.parse(measuring.stabilizationEndedAt ?? '')).toBeLessThanOrEqual(
      Date.parse('2026-05-24T01:00:00.000Z'),
    );
    // Stabilization end equals official start (per F4.7-0 transition rule).
    expect(measuring.stabilizationEndedAt).toBe(measuring.officialStartedAt);
  });

  it('HP-001 measuring fixture connectedAt is at or before the trend fixture start', () => {
    const measuring = MOCK_F4_WELL_TESTS[HP_001_ID]?.find((r) => r.lifecycleStatus === 'measuring');
    expect(measuring).toBeDefined();
    if (!measuring) return;
    expect(Date.parse(measuring.connectedAt ?? '')).toBeLessThanOrEqual(
      Date.parse('2026-05-24T00:00:00.000Z'),
    );
  });
});
