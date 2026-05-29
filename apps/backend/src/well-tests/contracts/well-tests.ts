import { z } from 'zod';

/**
 * Well-test job lifecycle — query + request + response contracts (F4.7.1).
 *
 * Implements the decisions locked at F4.7-0:
 *
 *   - **Domain model**: Option B — new `WellTest` row linked to the existing
 *     `Job` (deployment ledger). `Job` is unchanged.
 *   - **Lifecycle status**: `scheduled → connected → stabilizing → measuring →
 *     completed → closed`, with `aborted` reachable from any non-terminal
 *     state. Mirrored at the DB layer as a CHECK constraint.
 *   - **Test type / duration**: Fiscalización ⇒ `plannedOfficialDurationHours
 *     === 24` and `reportType === 'fiscalizacion_pdf'`; Optimización ⇒
 *     `plannedOfficialDurationHours BETWEEN 12 AND 24` and `reportType ===
 *     'optimizacion_pdf'`. Enforced both as Zod refines (wire-boundary 400s)
 *     and as DB CHECK constraints (defense in depth).
 *   - **All timestamps server-owned at transition time** (F4.7-0 §7.3). The
 *     transition request bodies carry no timestamp fields; the service records
 *     `now()` server-side.
 *   - **`actualOfficialDurationSeconds` is derived at read time** from
 *     `officialEndedAt - officialStartedAt`. Not stored.
 *   - **Tenant scoping is server-derived** from `CallerContext`; the wire
 *     never carries `tenantId` (`.strict()` rejects it).
 *   - **No-data behavior**: empty list returns `200 OK` with `wellTests: []`;
 *     unknown unit on `active` returns `200 OK` with `active: null`. Never
 *     404 on the empty paths.
 */

// =============================================================================
// Enums (mirror the DB CHECK constraints in the migration)
// =============================================================================

export const WELL_TEST_TYPES = ['fiscalizacion', 'optimizacion'] as const;
export type WellTestType = (typeof WELL_TEST_TYPES)[number];

export const WELL_TEST_REPORT_TYPES = ['fiscalizacion_pdf', 'optimizacion_pdf'] as const;
export type WellTestReportType = (typeof WELL_TEST_REPORT_TYPES)[number];

export const WELL_TEST_LIFECYCLE_STATUSES = [
  'scheduled',
  'connected',
  'stabilizing',
  'measuring',
  'completed',
  'closed',
  'aborted',
] as const;
export type WellTestLifecycleStatus = (typeof WELL_TEST_LIFECYCLE_STATUSES)[number];

/** Non-terminal statuses that count as "active" for the no-overlap-per-unit
 *  guard and for `GET /well-tests/active`. */
export const WELL_TEST_ACTIVE_STATUSES = ['connected', 'stabilizing', 'measuring'] as const;
export type WellTestActiveStatus = (typeof WELL_TEST_ACTIVE_STATUSES)[number];

/** Pagination bounds (F4.7-0 §13.1). */
export const WELL_TESTS_LIMIT_MAX = 200;
export const WELL_TESTS_LIMIT_DEFAULT = 50;

/** Test-type → report-type pairing (F4.7-0 §6.3). */
const REPORT_TYPE_FOR: Record<WellTestType, WellTestReportType> = {
  fiscalizacion: 'fiscalizacion_pdf',
  optimizacion: 'optimizacion_pdf',
};

const isValidDurationForType = (type: WellTestType, hours: number): boolean => {
  if (type === 'fiscalizacion') return hours === 24;
  return hours >= 12 && hours <= 24;
};

// =============================================================================
// List query
// =============================================================================

export const WellTestsListQuerySchema = z
  .object({
    unitId: z.string().uuid().optional(),
    wellId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    lifecycleStatus: z.enum(WELL_TEST_LIFECYCLE_STATUSES).optional(),
    testType: z.enum(WELL_TEST_TYPES).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(WELL_TESTS_LIMIT_MAX)
      .default(WELL_TESTS_LIMIT_DEFAULT),
  })
  .strict()
  .refine((q) => q.from === undefined || q.to !== undefined, {
    message: '`to` is required when `from` is supplied',
    path: ['to'],
  })
  .refine((q) => q.to === undefined || q.from !== undefined, {
    message: '`from` is required when `to` is supplied',
    path: ['from'],
  })
  .refine((q) => q.from === undefined || q.to === undefined || q.from.getTime() < q.to.getTime(), {
    message: '`from` must be strictly less than `to`',
    path: ['from'],
  });

export type WellTestsListQuery = z.infer<typeof WellTestsListQuerySchema>;

// =============================================================================
// Active query
// =============================================================================

export const WellTestsActiveQuerySchema = z
  .object({
    unitId: z.string().uuid(),
  })
  .strict();

export type WellTestsActiveQuery = z.infer<typeof WellTestsActiveQuerySchema>;

// =============================================================================
// Create
// =============================================================================

export const CreateWellTestSchema = z
  .object({
    jobId: z.string().uuid(),
    wellId: z.string().uuid(),
    unitId: z.string().uuid(),
    testType: z.enum(WELL_TEST_TYPES),
    reportType: z.enum(WELL_TEST_REPORT_TYPES),
    plannedOfficialDurationHours: z.number().int().min(12).max(24),
    notes: z.string().min(1).max(2000).optional(),
    clientReference: z.string().min(1).max(120).optional(),
  })
  .strict()
  .refine((q) => REPORT_TYPE_FOR[q.testType] === q.reportType, {
    message:
      '`reportType` must match `testType` (fiscalizacion → fiscalizacion_pdf; ' +
      'optimizacion → optimizacion_pdf)',
    path: ['reportType'],
  })
  .refine((q) => isValidDurationForType(q.testType, q.plannedOfficialDurationHours), {
    message:
      'Fiscalización requires `plannedOfficialDurationHours === 24`; Optimización ' +
      'requires `plannedOfficialDurationHours BETWEEN 12 AND 24`',
    path: ['plannedOfficialDurationHours'],
  });

export type CreateWellTestInput = z.infer<typeof CreateWellTestSchema>;

// =============================================================================
// Transition bodies
// =============================================================================

/** Most transitions accept an optional `notes` patch. */
export const TransitionWellTestSchema = z
  .object({
    notes: z.string().min(1).max(2000).optional(),
  })
  .strict();

export type TransitionWellTestInput = z.infer<typeof TransitionWellTestSchema>;

/** Abort additionally requires a free-form reason (F4.7-0 §5.1 / §15.3). */
export const AbortWellTestSchema = z
  .object({
    abortReason: z.string().min(1).max(240),
    notes: z.string().min(1).max(2000).optional(),
  })
  .strict();

export type AbortWellTestInput = z.infer<typeof AbortWellTestSchema>;

/** Close optionally accepts a `reportGeneratedAt` ISO-8601 marker if the
 *  Reports phase has already produced the PDF (F4.7-0 §5.4 / §13.1). When
 *  omitted the column stays `NULL` until a future Reports phase writes it. */
export const CloseWellTestSchema = z
  .object({
    notes: z.string().min(1).max(2000).optional(),
    reportGeneratedAt: z.coerce.date().optional(),
  })
  .strict();

export type CloseWellTestInput = z.infer<typeof CloseWellTestSchema>;

// =============================================================================
// Response shape
// =============================================================================

/** Server-side helper exposed so the service and tests share one source of
 *  truth for the derived duration computation. */
export const deriveActualOfficialDurationSeconds = (
  officialStartedAt: Date | null,
  officialEndedAt: Date | null,
): number | null => {
  if (officialStartedAt === null || officialEndedAt === null) return null;
  return Math.floor((officialEndedAt.getTime() - officialStartedAt.getTime()) / 1000);
};

/** Nested summaries the detail endpoint hydrates from `Job` / `Well` /
 *  `MeasurementUnit` (mirrors the F4.4E / F4.6C.2.1 / F4.6D.2.1 nested shape). */
export interface WellTestJobSummary {
  id: string;
  status: string;
  startedAt: Date | null;
  closedAt: Date | null;
}

export interface WellTestWellSummary {
  id: string;
  name: string;
  fieldOrSite: string | null;
}

export interface WellTestUnitSummary {
  id: string;
  code: string;
  name: string;
}

/**
 * Wire row. Derived view, **not** a Prisma row dump:
 *   - `tenantId` stripped (server-side concern).
 *   - `createdBy` / `updatedBy` user UUIDs stripped (a future audit / RBAC
 *     phase may surface user displayNames; out of scope for F4.7.1).
 *   - `actualOfficialDurationSeconds` derived at read time.
 *   - `createdAt` / `updatedAt` retained — operational metadata that consumers
 *     (Reports, audit) need to honestly cite.
 */
export interface WellTestRow {
  id: string;
  jobId: string;
  wellId: string;
  unitId: string;
  testType: WellTestType;
  reportType: WellTestReportType;
  lifecycleStatus: WellTestLifecycleStatus;
  plannedOfficialDurationHours: number;
  /** Derived from `officialEndedAt - officialStartedAt`. `null` until the test
   *  reaches `completed` / `closed`. */
  actualOfficialDurationSeconds: number | null;
  connectedAt: Date | null;
  stabilizationStartedAt: Date | null;
  stabilizationEndedAt: Date | null;
  officialStartedAt: Date | null;
  officialEndedAt: Date | null;
  disconnectedAt: Date | null;
  reportGeneratedAt: Date | null;
  abortedAt: Date | null;
  abortReason: string | null;
  notes: string | null;
  clientReference: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WellTestDetail extends WellTestRow {
  job: WellTestJobSummary;
  well: WellTestWellSummary;
  unit: WellTestUnitSummary;
}

export interface WellTestsListResponse {
  generatedAt: Date;
  source: 'well_tests';
  wellTests: WellTestRow[];
}

export interface WellTestActiveResponse {
  generatedAt: Date;
  source: 'well_tests';
  active: WellTestRow | null;
}
