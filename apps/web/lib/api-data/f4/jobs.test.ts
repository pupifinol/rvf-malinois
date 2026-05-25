import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MOCK_F4_COMMISSIONING_SNAPSHOTS,
  MOCK_F4_JOBS,
  MOCK_F4_JOB_DETAILS,
  adapterGetJob,
  adapterListJobs,
  deriveCommissioningSummary,
  deriveJobRuntime,
  toJobListItemViewModel,
} from './index';

import { RvfApiError } from '@/lib/api/f4';

/**
 * F4.5D — Jobs adapter + view-model helper tests.
 *
 * Mirrors F4.5C posture: mock-mode tests stub `fetch` with a throwing
 * function (guard), api-mode tests stub `fetch` with a deterministic
 * response and assert composed URLs.
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

const REFERENCE_JOB_ID = '00000000-0000-0000-0000-000000004444';
const HP_001_ID = '00000000-0000-0000-0000-000000004411';
const REFERENCE_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const REFERENCE_WELL_ID = '00000000-0000-0000-0000-000000004400';

// =============================================================================
// Adapter — list
// =============================================================================

describe('jobs adapter — list', () => {
  it('mock mode: returns the single reference job with tenant / well / unit summaries', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const rows = await adapterListJobs();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(REFERENCE_JOB_ID);
    expect(rows[0]?.status).toBe('in_progress');
    expect(rows[0]?.tenant?.name).toBe('RVF Internal');
    expect(rows[0]?.well?.name).toBe('Reference Well A');
    expect(rows[0]?.unit?.code).toBe('HP-001');
  });

  it('mock mode: applies the status filter locally', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const inProgress = await adapterListJobs({ status: 'in_progress' });
    expect(inProgress).toHaveLength(1);

    const closed = await adapterListJobs({ status: 'closed' });
    expect(closed).toHaveLength(0);
  });

  it('mock mode: applies the wellId / unitId filters locally', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const onWell = await adapterListJobs({ wellId: REFERENCE_WELL_ID });
    expect(onWell).toHaveLength(1);

    const onUnit = await adapterListJobs({ unitId: HP_001_ID });
    expect(onUnit).toHaveLength(1);

    const elsewhere = await adapterListJobs({
      wellId: '00000000-0000-0000-0000-deadbeefdead',
    });
    expect(elsewhere).toHaveLength(0);
  });

  it('mock mode: applies the tenantId filter locally', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const rows = await adapterListJobs({ tenantId: REFERENCE_TENANT_ID });
    expect(rows).toHaveLength(1);

    const elsewhere = await adapterListJobs({
      tenantId: '00000000-0000-0000-0000-deadbeefdead',
    });
    expect(elsewhere).toHaveLength(0);
  });

  it('api mode: composes the filter into the query string', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fetchMock = stubFetchOk([]);

    await adapterListJobs({
      tenantId: REFERENCE_TENANT_ID,
      wellId: REFERENCE_WELL_ID,
      unitId: HP_001_ID,
      status: 'in_progress',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${API_BASE}/jobs?tenantId=${REFERENCE_TENANT_ID}&wellId=${REFERENCE_WELL_ID}&unitId=${HP_001_ID}&status=in_progress`,
    );
  });
});

// =============================================================================
// Adapter — detail
// =============================================================================

describe('jobs adapter — detail', () => {
  it('mock mode: returns the HP-001 reference job detail with full include', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const detail = await adapterGetJob(REFERENCE_JOB_ID);
    expect(detail.id).toBe(REFERENCE_JOB_ID);
    expect(detail.well.fieldOrSite).toBe('Reference Field');
    expect(detail.well.designLimits).toBeDefined();
    expect(detail.unit.code).toBe('HP-001');
    expect(detail.unit.equipmentType.name).toBe('EMMAD');
    expect(detail.engineer?.displayName).toBe('Admin Placeholder');
    expect(detail.commissioningSnapshot?.immutable).toBe(true);
  });

  it('mock mode: rejects with RvfApiError(404) on unknown id', async () => {
    delete process.env.NEXT_PUBLIC_RVF_DATA_SOURCE;
    stubFetchThatThrows();

    const promise = adapterGetJob('00000000-0000-0000-0000-deadbeefdead');
    await expect(promise).rejects.toBeInstanceOf(RvfApiError);
    await promise.catch((err: unknown) => {
      expect((err as RvfApiError).status).toBe(404);
    });
  });

  it('api mode: getJob URL-encodes the id and hits the backend', async () => {
    process.env.NEXT_PUBLIC_RVF_DATA_SOURCE = 'api';
    const fetchMock = stubFetchOk(MOCK_F4_JOB_DETAILS[REFERENCE_JOB_ID]);

    await adapterGetJob(REFERENCE_JOB_ID);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_BASE}/jobs/${REFERENCE_JOB_ID}`);
  });
});

// =============================================================================
// View-model helpers
// =============================================================================

describe('deriveJobRuntime', () => {
  it('returns undefined when startedAt is null', () => {
    const runtime = deriveJobRuntime({ startedAt: null, closedAt: null });
    expect(runtime).toBeUndefined();
  });

  it('returns isClosed=false and runtimeMs measured against `now` for an open job', () => {
    const startedAt = '2026-05-24T00:00:00.000Z';
    const now = Date.parse('2026-05-24T01:00:00.000Z');
    const runtime = deriveJobRuntime({ startedAt, closedAt: null }, now);
    expect(runtime).toBeDefined();
    expect(runtime?.isClosed).toBe(false);
    expect(runtime?.runtimeMs).toBe(60 * 60 * 1000);
    expect(runtime?.closedAt).toBeNull();
  });

  it('returns isClosed=true and the exact end-minus-start delta for a closed job', () => {
    const startedAt = '2026-05-24T00:00:00.000Z';
    const closedAt = '2026-05-24T02:30:00.000Z';
    const runtime = deriveJobRuntime({ startedAt, closedAt });
    expect(runtime).toBeDefined();
    expect(runtime?.isClosed).toBe(true);
    expect(runtime?.runtimeMs).toBe(2.5 * 60 * 60 * 1000);
  });

  it('clamps negative runtime to zero (defensive against clock skew)', () => {
    const startedAt = '2026-05-24T01:00:00.000Z';
    const now = Date.parse('2026-05-24T00:30:00.000Z');
    const runtime = deriveJobRuntime({ startedAt, closedAt: null }, now);
    expect(runtime?.runtimeMs).toBe(0);
  });

  it('returns undefined for an unparseable startedAt', () => {
    const runtime = deriveJobRuntime({ startedAt: 'not-a-date', closedAt: null });
    expect(runtime).toBeUndefined();
  });
});

describe('deriveCommissioningSummary', () => {
  it('counts sensorMappings, effectiveThresholds and ruleVersions arrays', () => {
    const snapshot = MOCK_F4_COMMISSIONING_SNAPSHOTS[0];
    expect(snapshot).toBeDefined();
    if (!snapshot) return;
    const summary = deriveCommissioningSummary(snapshot);
    expect(summary).toBeDefined();
    expect(summary?.sensorMappingCount).toBe(7);
    expect(summary?.effectiveThresholdCount).toBe(14);
    expect(summary?.ruleVersionCount).toBe(14);
    expect(summary?.immutable).toBe(true);
    expect(summary?.takenAt).toBe(snapshot.takenAt);
  });

  it('returns undefined for a null snapshot', () => {
    expect(deriveCommissioningSummary(null)).toBeUndefined();
  });

  it('safely returns zero counts when JSONB fields are not arrays', () => {
    const snapshot = MOCK_F4_COMMISSIONING_SNAPSHOTS[0];
    expect(snapshot).toBeDefined();
    if (!snapshot) return;
    const summary = deriveCommissioningSummary({
      ...snapshot,
      sensorMappings: { malformed: true },
      effectiveThresholds: null,
      ruleVersions: 'not an array',
    });
    expect(summary?.sensorMappingCount).toBe(0);
    expect(summary?.effectiveThresholdCount).toBe(0);
    expect(summary?.ruleVersionCount).toBe(0);
  });
});

describe('toJobListItemViewModel', () => {
  it('projects a list row to a compact summary', () => {
    const row = MOCK_F4_JOBS[0];
    expect(row).toBeDefined();
    if (!row) return;
    const vm = toJobListItemViewModel(row);
    expect(vm).toEqual({
      id: row.id,
      status: row.status,
      startedAt: row.startedAt,
      closedAt: row.closedAt,
      tenantName: row.tenant?.name,
      wellName: row.well?.name,
      unitCode: row.unit?.code,
      unitName: row.unit?.name,
    });
  });
});
