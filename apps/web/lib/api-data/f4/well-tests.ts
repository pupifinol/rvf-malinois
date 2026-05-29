/**
 * F4.7.1 — Well-tests adapter (data-source-aware).
 *
 * Mirrors the F4.6D.2.1 alarm-events adapter. Two branches gated by
 * `NEXT_PUBLIC_RVF_DATA_SOURCE`:
 *
 *   1. Mock branch resolves from the deterministic `MOCK_F4_WELL_TESTS`
 *      (list) + `MOCK_F4_WELL_TEST_DETAILS` (detail) maps in
 *      `./mock-fixtures.ts`. Applies the same Zod-mirroring refines the
 *      backend enforces (XOR / both-or-neither time window; Fiscalización
 *      24h fixed; Optimización 12..24h; reportType paired with testType).
 *      Transitions return updated rows with `lifecycleStatus` advanced and
 *      timestamps server-stamped at `new Date()`.
 *
 *   2. API branch delegates to the typed endpoint wrappers in
 *      `@/lib/api/f4` (`listWellTests`, `getWellTestById`,
 *      `getActiveWellTest`, `createWellTest`, the six transition methods).
 *
 * Decisions match F4.7-0 §13:
 *
 *   - All list / active filters optional. Unknown unit → empty envelope
 *     (matches the F4.4F empty-array posture; never 404).
 *   - Create:
 *       - Fiscalización ⇒ `plannedOfficialDurationHours === 24` AND
 *         `reportType === 'fiscalizacion_pdf'`.
 *       - Optimización ⇒ `plannedOfficialDurationHours BETWEEN 12 AND 24`
 *         AND `reportType === 'optimizacion_pdf'`.
 *       - Any violation in mock mode raises `RvfApiError(400, …)` so the
 *         consumer sees the same surface in both data sources.
 *   - Transitions validate the lifecycle diagram in mock mode the same way
 *     the backend service does; rejected transitions raise
 *     `RvfApiError(409, …)` to mirror the backend `409 Conflict`.
 *   - Mock mode is **transient**: transition mutations are applied to a
 *     module-local in-memory clone of the fixture. Survives a single
 *     process lifetime; resets on reload. Adequate for adapter tests and
 *     future Operations Storybook-style fixture inspection.
 *   - **No UI binding in F4.7.1** — the adapter exists and is testable;
 *     no file under `apps/web/components/` consumes it.
 */

import { MOCK_F4_WELL_TESTS, MOCK_F4_WELL_TEST_DETAILS } from './mock-fixtures';

import {
  type AbortWellTestPayload,
  type CloseWellTestPayload,
  type CreateWellTestPayload,
  type GetActiveWellTestParams,
  type GetOptions,
  type ListWellTestsParams,
  type WellTestActiveResponse,
  type WellTestDetail,
  type WellTestRow,
  type WellTestTransitionPayload,
  type WellTestsListResponse,
  RvfApiError,
  abortWellTest,
  closeWellTest,
  connectWellTest,
  createWellTest,
  endWellTestOfficial,
  getActiveWellTest,
  getWellTestById,
  isApiSource,
  listWellTests,
  startWellTestOfficial,
  startWellTestStabilization,
} from '@/lib/api/f4';

const MOCK_LIST_URL = 'mock:/well-tests';
const MOCK_DETAIL_URL = 'mock:/well-tests/:id';

const toDate = (raw: Date | string): Date => (raw instanceof Date ? raw : new Date(raw));

const ACTIVE_STATUSES = new Set<WellTestRow['lifecycleStatus']>([
  'connected',
  'stabilizing',
  'measuring',
]);

/**
 * Mock-mode store. Cloned at module load so the fixture map itself stays
 * frozen; transition mutations update this clone. The flat row list is the
 * primary list source; the detail map is the per-id detail source.
 */
interface MockStore {
  rowsById: Map<string, WellTestRow>;
  detailsById: Map<string, WellTestDetail>;
}

const cloneMockStore = (): MockStore => {
  const rowsById = new Map<string, WellTestRow>();
  for (const rows of Object.values(MOCK_F4_WELL_TESTS)) {
    for (const row of rows) rowsById.set(row.id, { ...row });
  }
  const detailsById = new Map<string, WellTestDetail>();
  for (const [id, detail] of Object.entries(MOCK_F4_WELL_TEST_DETAILS)) {
    detailsById.set(id, { ...detail });
  }
  return { rowsById, detailsById };
};

let mockStore: MockStore = cloneMockStore();

/** Reset the mock-mode store back to the deterministic fixture. Exposed for
 *  tests so each spec starts from the same baseline. */
export const resetMockWellTestsStore = (): void => {
  mockStore = cloneMockStore();
};

const allRowsSorted = (): WellTestRow[] =>
  [...mockStore.rowsById.values()].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );

// =============================================================================
// Validation helpers (mirror the backend Zod refines)
// =============================================================================

const isValidDurationForType = (type: WellTestRow['testType'], hours: number): boolean => {
  if (type === 'fiscalizacion') return hours === 24;
  return hours >= 12 && hours <= 24;
};

const reportTypeForTestType = (type: WellTestRow['testType']): WellTestRow['reportType'] =>
  type === 'fiscalizacion' ? 'fiscalizacion_pdf' : 'optimizacion_pdf';

const assertCreatePayload = (payload: CreateWellTestPayload, url: string): void => {
  if (reportTypeForTestType(payload.testType) !== payload.reportType) {
    throw new RvfApiError(
      400,
      url,
      null,
      '`reportType` must match `testType` (fiscalizacion → fiscalizacion_pdf; ' +
        'optimizacion → optimizacion_pdf)',
    );
  }
  if (!isValidDurationForType(payload.testType, payload.plannedOfficialDurationHours)) {
    throw new RvfApiError(
      400,
      url,
      null,
      'Fiscalización requires `plannedOfficialDurationHours === 24`; Optimización ' +
        'requires `plannedOfficialDurationHours BETWEEN 12 AND 24`',
    );
  }
};

const assertTransitionAllowed = (
  current: WellTestRow['lifecycleStatus'],
  allowedFrom: readonly WellTestRow['lifecycleStatus'][],
  url: string,
): void => {
  if (!allowedFrom.includes(current)) {
    throw new RvfApiError(
      409,
      url,
      null,
      `Cannot transition well test from '${current}' (allowed prior states: ${allowedFrom.join(
        ', ',
      )})`,
    );
  }
};

const writeBack = (next: WellTestRow): WellTestDetail => {
  mockStore.rowsById.set(next.id, next);
  const prior = mockStore.detailsById.get(next.id);
  if (!prior) {
    // Should not happen — fixtures provide a detail for every fixture row.
    throw new RvfApiError(500, 'mock:/well-tests', null, `No detail for well test '${next.id}'`);
  }
  const merged: WellTestDetail = { ...prior, ...next };
  mockStore.detailsById.set(next.id, merged);
  return merged;
};

// =============================================================================
// Read
// =============================================================================

const adapterListWellTestsMock = (params?: ListWellTestsParams): Promise<WellTestsListResponse> => {
  // Both-or-neither time window (mirrors backend Zod).
  if ((params?.from !== undefined) !== (params?.to !== undefined)) {
    return Promise.reject(
      new RvfApiError(
        400,
        MOCK_LIST_URL,
        null,
        '`from` and `to` must appear together (supplied one without the other)',
      ),
    );
  }
  if (params?.from !== undefined && params.to !== undefined) {
    const fromMs = toDate(params.from).getTime();
    const toMs = toDate(params.to).getTime();
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
      return Promise.reject(
        new RvfApiError(400, MOCK_LIST_URL, null, '`from` must be strictly less than `to`'),
      );
    }
  }

  let rows = allRowsSorted();
  if (params?.unitId) rows = rows.filter((r) => r.unitId === params.unitId);
  if (params?.wellId) rows = rows.filter((r) => r.wellId === params.wellId);
  if (params?.jobId) rows = rows.filter((r) => r.jobId === params.jobId);
  if (params?.lifecycleStatus)
    rows = rows.filter((r) => r.lifecycleStatus === params.lifecycleStatus);
  if (params?.testType) rows = rows.filter((r) => r.testType === params.testType);
  if (params?.from !== undefined && params.to !== undefined) {
    const fromMs = toDate(params.from).getTime();
    const toMs = toDate(params.to).getTime();
    rows = rows.filter((r) => {
      if (r.officialStartedAt === null) return false;
      const ts = Date.parse(r.officialStartedAt);
      return Number.isFinite(ts) && ts >= fromMs && ts < toMs;
    });
  }
  const limit = params?.limit ?? 50;
  rows = rows.slice(0, limit);

  return Promise.resolve({
    generatedAt: new Date().toISOString(),
    source: 'well_tests',
    wellTests: rows,
  });
};

const adapterGetWellTestByIdMock = (id: string): Promise<WellTestDetail> => {
  const detail = mockStore.detailsById.get(id);
  if (!detail) {
    return Promise.reject(
      new RvfApiError(
        404,
        `${MOCK_DETAIL_URL.replace(':id', id)}`,
        null,
        `Well test '${id}' not found.`,
      ),
    );
  }
  return Promise.resolve(detail);
};

const adapterGetActiveWellTestMock = (
  params: GetActiveWellTestParams,
): Promise<WellTestActiveResponse> => {
  const unitRows = allRowsSorted().filter(
    (r) => r.unitId === params.unitId && ACTIVE_STATUSES.has(r.lifecycleStatus),
  );
  return Promise.resolve({
    generatedAt: new Date().toISOString(),
    source: 'well_tests',
    active: unitRows[0] ?? null,
  });
};

// =============================================================================
// Create
// =============================================================================

const adapterCreateWellTestMock = (payload: CreateWellTestPayload): Promise<WellTestDetail> => {
  assertCreatePayload(payload, MOCK_LIST_URL);

  // Reject overlapping active tests on the same unit (mirrors backend §15.3
  // guard at the `connect` boundary, but applied at create time too so the
  // mock surface matches the backend's eventual behavior when a UI consumer
  // tries to create-then-connect a second test).
  const existingActive = allRowsSorted().find(
    (r) => r.unitId === payload.unitId && ACTIVE_STATUSES.has(r.lifecycleStatus),
  );
  if (existingActive) {
    // Note: backend creates `scheduled` rows freely; only `connect` is
    // blocked. We mirror that here — creation always succeeds, but the
    // first `connect` will hit the 409. No throw at create.
    void existingActive;
  }

  const now = new Date().toISOString();
  const id = `mock-wt-${crypto.randomUUID()}`;
  const row: WellTestRow = {
    id,
    jobId: payload.jobId,
    wellId: payload.wellId,
    unitId: payload.unitId,
    testType: payload.testType,
    reportType: payload.reportType,
    lifecycleStatus: 'scheduled',
    plannedOfficialDurationHours: payload.plannedOfficialDurationHours,
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
    notes: payload.notes ?? null,
    clientReference: payload.clientReference ?? null,
    createdAt: now,
    updatedAt: now,
  };
  const detail: WellTestDetail = {
    ...row,
    job: { id: payload.jobId, status: 'in_progress', startedAt: null, closedAt: null },
    well: { id: payload.wellId, name: '(mock well)', fieldOrSite: null },
    unit: { id: payload.unitId, code: '(mock)', name: '(mock unit)' },
  };
  mockStore.rowsById.set(id, row);
  mockStore.detailsById.set(id, detail);
  return Promise.resolve(detail);
};

// =============================================================================
// Transitions
// =============================================================================

const loadForTransitionMock = (id: string, url: string): WellTestRow => {
  const row = mockStore.rowsById.get(id);
  if (!row) {
    throw new RvfApiError(404, url, null, `Well test '${id}' not found.`);
  }
  return row;
};

const adapterConnectMock = (
  id: string,
  payload?: WellTestTransitionPayload,
): Promise<WellTestDetail> => {
  const url = `mock:/well-tests/${id}/connect`;
  const row = loadForTransitionMock(id, url);
  assertTransitionAllowed(row.lifecycleStatus, ['scheduled'], url);
  // No-overlap guard mirrors backend §15.3.
  const existing = allRowsSorted().find(
    (r) => r.unitId === row.unitId && r.id !== id && ACTIVE_STATUSES.has(r.lifecycleStatus),
  );
  if (existing) {
    return Promise.reject(
      new RvfApiError(
        409,
        url,
        null,
        `Unit '${row.unitId}' already has an active well test '${existing.id}' in status '${existing.lifecycleStatus}'.`,
      ),
    );
  }
  const now = new Date().toISOString();
  const next: WellTestRow = {
    ...row,
    lifecycleStatus: 'connected',
    connectedAt: now,
    notes: payload?.notes ?? row.notes,
    updatedAt: now,
  };
  return Promise.resolve(writeBack(next));
};

const adapterStartStabilizationMock = (
  id: string,
  payload?: WellTestTransitionPayload,
): Promise<WellTestDetail> => {
  const url = `mock:/well-tests/${id}/start-stabilization`;
  const row = loadForTransitionMock(id, url);
  assertTransitionAllowed(row.lifecycleStatus, ['connected'], url);
  const now = new Date().toISOString();
  return Promise.resolve(
    writeBack({
      ...row,
      lifecycleStatus: 'stabilizing',
      stabilizationStartedAt: now,
      notes: payload?.notes ?? row.notes,
      updatedAt: now,
    }),
  );
};

const adapterStartOfficialMock = (
  id: string,
  payload?: WellTestTransitionPayload,
): Promise<WellTestDetail> => {
  const url = `mock:/well-tests/${id}/start-official`;
  const row = loadForTransitionMock(id, url);
  assertTransitionAllowed(row.lifecycleStatus, ['stabilizing'], url);
  const now = new Date().toISOString();
  return Promise.resolve(
    writeBack({
      ...row,
      lifecycleStatus: 'measuring',
      officialStartedAt: now,
      stabilizationEndedAt: now,
      notes: payload?.notes ?? row.notes,
      updatedAt: now,
    }),
  );
};

const adapterEndOfficialMock = (
  id: string,
  payload?: WellTestTransitionPayload,
): Promise<WellTestDetail> => {
  const url = `mock:/well-tests/${id}/end-official`;
  const row = loadForTransitionMock(id, url);
  assertTransitionAllowed(row.lifecycleStatus, ['measuring'], url);
  const now = new Date().toISOString();
  const officialStartedAt = row.officialStartedAt;
  const actualOfficialDurationSeconds =
    officialStartedAt !== null
      ? Math.floor((Date.parse(now) - Date.parse(officialStartedAt)) / 1000)
      : null;
  return Promise.resolve(
    writeBack({
      ...row,
      lifecycleStatus: 'completed',
      officialEndedAt: now,
      actualOfficialDurationSeconds,
      notes: payload?.notes ?? row.notes,
      updatedAt: now,
    }),
  );
};

const adapterAbortMock = (id: string, payload: AbortWellTestPayload): Promise<WellTestDetail> => {
  const url = `mock:/well-tests/${id}/abort`;
  const row = loadForTransitionMock(id, url);
  assertTransitionAllowed(
    row.lifecycleStatus,
    ['scheduled', 'connected', 'stabilizing', 'measuring'],
    url,
  );
  const now = new Date().toISOString();
  return Promise.resolve(
    writeBack({
      ...row,
      lifecycleStatus: 'aborted',
      abortedAt: now,
      abortReason: payload.abortReason,
      notes: payload.notes ?? row.notes,
      updatedAt: now,
    }),
  );
};

const adapterCloseMock = (id: string, payload?: CloseWellTestPayload): Promise<WellTestDetail> => {
  const url = `mock:/well-tests/${id}/close`;
  const row = loadForTransitionMock(id, url);
  assertTransitionAllowed(row.lifecycleStatus, ['completed'], url);
  const now = new Date().toISOString();
  const reportGeneratedAt =
    payload?.reportGeneratedAt !== undefined
      ? toDate(payload.reportGeneratedAt).toISOString()
      : null;
  return Promise.resolve(
    writeBack({
      ...row,
      lifecycleStatus: 'closed',
      disconnectedAt: now,
      reportGeneratedAt,
      notes: payload?.notes ?? row.notes,
      updatedAt: now,
    }),
  );
};

// =============================================================================
// Dual-mode adapters
// =============================================================================

export const adapterListWellTests = async (
  params?: ListWellTestsParams,
  options?: GetOptions,
): Promise<WellTestsListResponse> =>
  isApiSource() ? listWellTests(params, options) : adapterListWellTestsMock(params);

export const adapterGetWellTestById = async (
  id: string,
  options?: GetOptions,
): Promise<WellTestDetail> =>
  isApiSource() ? getWellTestById(id, options) : adapterGetWellTestByIdMock(id);

export const adapterGetActiveWellTest = async (
  params: GetActiveWellTestParams,
  options?: GetOptions,
): Promise<WellTestActiveResponse> =>
  isApiSource() ? getActiveWellTest(params, options) : adapterGetActiveWellTestMock(params);

export const adapterCreateWellTest = async (
  payload: CreateWellTestPayload,
  options?: GetOptions,
): Promise<WellTestDetail> => {
  if (isApiSource()) return createWellTest(payload, options);
  return adapterCreateWellTestMock(payload);
};

export const adapterConnectWellTest = async (
  id: string,
  payload?: WellTestTransitionPayload,
  options?: GetOptions,
): Promise<WellTestDetail> =>
  isApiSource() ? connectWellTest(id, payload, options) : adapterConnectMock(id, payload);

export const adapterStartWellTestStabilization = async (
  id: string,
  payload?: WellTestTransitionPayload,
  options?: GetOptions,
): Promise<WellTestDetail> =>
  isApiSource()
    ? startWellTestStabilization(id, payload, options)
    : adapterStartStabilizationMock(id, payload);

export const adapterStartWellTestOfficial = async (
  id: string,
  payload?: WellTestTransitionPayload,
  options?: GetOptions,
): Promise<WellTestDetail> =>
  isApiSource()
    ? startWellTestOfficial(id, payload, options)
    : adapterStartOfficialMock(id, payload);

export const adapterEndWellTestOfficial = async (
  id: string,
  payload?: WellTestTransitionPayload,
  options?: GetOptions,
): Promise<WellTestDetail> =>
  isApiSource() ? endWellTestOfficial(id, payload, options) : adapterEndOfficialMock(id, payload);

export const adapterAbortWellTest = async (
  id: string,
  payload: AbortWellTestPayload,
  options?: GetOptions,
): Promise<WellTestDetail> =>
  isApiSource() ? abortWellTest(id, payload, options) : adapterAbortMock(id, payload);

export const adapterCloseWellTest = async (
  id: string,
  payload?: CloseWellTestPayload,
  options?: GetOptions,
): Promise<WellTestDetail> =>
  isApiSource() ? closeWellTest(id, payload, options) : adapterCloseMock(id, payload);

// Re-export envelope types so callers can import from a single location.
export type {
  WellTestRow,
  WellTestDetail,
  WellTestsListResponse,
  WellTestActiveResponse,
  CreateWellTestPayload,
  ListWellTestsParams,
  GetActiveWellTestParams,
  WellTestTransitionPayload,
  AbortWellTestPayload,
  CloseWellTestPayload,
};
