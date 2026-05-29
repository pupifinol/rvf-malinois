import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  AbortWellTestSchema,
  CloseWellTestSchema,
  CreateWellTestSchema,
  TransitionWellTestSchema,
  WellTestsActiveQuerySchema,
  WellTestsListQuerySchema,
} from './contracts/well-tests';
import { WellTestsService } from './well-tests.service';

import type { PrismaService } from '../prisma/prisma.service';

/**
 * Mocked-Prisma unit tests for WellTestsService (F4.7.1).
 *
 * Same posture as `latest.service.spec.ts` / `alarm-events-read.service.spec.ts`:
 * Prisma is mocked, assertions check
 *   (a) the `where` / `select` / `orderBy` / `take` shape,
 *   (b) the tenant scoping seam,
 *   (c) lifecycle transition guards + clock-skew defense,
 *   (d) the no-overlapping-active-test-per-unit guard,
 *   (e) the controller-level Zod refines + DB-mirror enums,
 *   (f) the derived `actualOfficialDurationSeconds`,
 *   (g) the response envelope's structural stability (no `tenantId` leak).
 */

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const JOB_ID = '00000000-0000-0000-0000-000000004444';
const WELL_ID = '00000000-0000-0000-0000-000000003333';
const UNIT_ID = '00000000-0000-0000-0000-000000004411';
const TEST_ID = '00000000-0000-0000-0000-000000007001';
const OTHER_TEST_ID = '00000000-0000-0000-0000-000000007002';

interface FindManyArg {
  where?: Record<string, unknown>;
  select?: Record<string, unknown>;
  orderBy?: unknown;
  take?: number;
}

interface FindUniqueArg {
  where?: { id: string };
  select?: Record<string, unknown>;
}

interface UpdateArg {
  where: { id: string };
  data: Record<string, unknown>;
  select?: Record<string, unknown>;
}

interface CreateArg {
  data: Record<string, unknown>;
  select?: Record<string, unknown>;
}

function dbRow(
  overrides: Partial<{
    id: string;
    tenantId: string;
    jobId: string;
    wellId: string;
    unitId: string;
    testType: string;
    reportType: string;
    lifecycleStatus: string;
    plannedOfficialDurationHours: number;
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
  }> = {},
) {
  return {
    id: TEST_ID,
    tenantId: TENANT_ID,
    jobId: JOB_ID,
    wellId: WELL_ID,
    unitId: UNIT_ID,
    testType: 'fiscalizacion',
    reportType: 'fiscalizacion_pdf',
    lifecycleStatus: 'scheduled',
    plannedOfficialDurationHours: 24,
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
    createdAt: new Date('2026-05-29T10:00:00.000Z'),
    updatedAt: new Date('2026-05-29T10:00:00.000Z'),
    ...overrides,
  };
}

function dbRowDetail(overrides: Parameters<typeof dbRow>[0] = {}) {
  return {
    ...dbRow(overrides),
    job: {
      id: JOB_ID,
      status: 'in_progress',
      startedAt: new Date('2026-05-24T00:00:00.000Z'),
      closedAt: null,
    },
    well: { id: WELL_ID, name: 'PZ-1023', fieldOrSite: 'Field-A' },
    unit: { id: UNIT_ID, code: 'HP-001', name: 'High-Pressure Test Skid' },
  };
}

function makeMocks() {
  const wtFindMany = vi.fn<(args?: FindManyArg) => Promise<ReturnType<typeof dbRow>[]>>(() =>
    Promise.resolve([]),
  );
  const wtFindUnique = vi.fn<
    (args: FindUniqueArg) => Promise<ReturnType<typeof dbRowDetail> | null>
  >(() => Promise.resolve(null));
  const wtFindFirst = vi.fn<(args: FindUniqueArg) => Promise<ReturnType<typeof dbRow> | null>>(() =>
    Promise.resolve(null),
  );
  const wtCreate = vi.fn<(args: CreateArg) => Promise<ReturnType<typeof dbRowDetail>>>();
  const wtUpdate = vi.fn<(args: UpdateArg) => Promise<ReturnType<typeof dbRowDetail>>>();
  const jobFindUnique = vi.fn<
    (args: FindUniqueArg) => Promise<{
      id: string;
      tenantId: string;
      wellId: string;
      unitId: string;
    } | null>
  >(() => Promise.resolve(null));

  const prisma = {
    wellTest: {
      findMany: wtFindMany,
      findUnique: wtFindUnique,
      findFirst: wtFindFirst,
      create: wtCreate,
      update: wtUpdate,
    },
    job: { findUnique: jobFindUnique },
  } as unknown as PrismaService;

  return {
    prisma,
    mocks: {
      wtFindMany,
      wtFindUnique,
      wtFindFirst,
      wtCreate,
      wtUpdate,
      jobFindUnique,
    },
  };
}

// =============================================================================
// list()
// =============================================================================

describe('WellTestsService.list', () => {
  it('returns the envelope with empty wellTests when no rows exist', async () => {
    const { prisma } = makeMocks();
    const service = new WellTestsService(prisma);

    const result = await service.list({}, WellTestsListQuerySchema.parse({}));

    expect(result.source).toBe('well_tests');
    expect(result.wellTests).toEqual([]);
    expect(result.generatedAt).toBeInstanceOf(Date);
  });

  it('orders by createdAt DESC and takes the default limit (50)', async () => {
    const { prisma, mocks } = makeMocks();
    const service = new WellTestsService(prisma);

    await service.list({}, WellTestsListQuerySchema.parse({}));

    expect(mocks.wtFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    );
  });

  it('applies unit / well / job / lifecycleStatus / testType filters', async () => {
    const { prisma, mocks } = makeMocks();
    const service = new WellTestsService(prisma);

    await service.list(
      {},
      WellTestsListQuerySchema.parse({
        unitId: UNIT_ID,
        wellId: WELL_ID,
        jobId: JOB_ID,
        lifecycleStatus: 'measuring',
        testType: 'fiscalizacion',
        limit: 10,
      }),
    );

    expect(mocks.wtFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          unitId: UNIT_ID,
          wellId: WELL_ID,
          jobId: JOB_ID,
          lifecycleStatus: 'measuring',
          testType: 'fiscalizacion',
        },
        take: 10,
      }),
    );
  });

  it('time-window filter is forwarded as `officialStartedAt: { gte, lt }`', async () => {
    const from = '2026-05-29T12:00:00.000Z';
    const to = '2026-05-29T13:00:00.000Z';
    const { prisma, mocks } = makeMocks();
    const service = new WellTestsService(prisma);

    await service.list({}, WellTestsListQuerySchema.parse({ from, to }));

    const call = mocks.wtFindMany.mock.calls[0]?.[0];
    const window = (call?.where as { officialStartedAt?: { gte: Date; lt: Date } } | undefined)
      ?.officialStartedAt;
    expect(window?.gte.toISOString()).toBe(from);
    expect(window?.lt.toISOString()).toBe(to);
  });

  it('honors ctx.tenantId when set', async () => {
    const { prisma, mocks } = makeMocks();
    const service = new WellTestsService(prisma);

    await service.list({ tenantId: TENANT_ID }, WellTestsListQuerySchema.parse({}));

    expect(mocks.wtFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT_ID } }),
    );
  });

  it('SystemContext does not add tenantId to the where clause', async () => {
    const { prisma, mocks } = makeMocks();
    const service = new WellTestsService(prisma);

    await service.list({}, WellTestsListQuerySchema.parse({ unitId: UNIT_ID }));

    const arg = mocks.wtFindMany.mock.calls[0]?.[0];
    expect(arg?.where).not.toHaveProperty('tenantId');
  });

  it('response shape does NOT expose tenantId; lifts derived duration', async () => {
    const { prisma, mocks } = makeMocks();
    mocks.wtFindMany.mockResolvedValueOnce([
      dbRow({
        lifecycleStatus: 'completed',
        officialStartedAt: new Date('2026-05-29T12:00:00.000Z'),
        officialEndedAt: new Date('2026-05-30T12:00:00.000Z'),
      }),
    ]);
    const service = new WellTestsService(prisma);

    const result = await service.list({}, WellTestsListQuerySchema.parse({}));
    const row = result.wellTests[0];

    expect(row).toBeDefined();
    if (!row) return;
    expect(row).not.toHaveProperty('tenantId');
    expect(row.id).toBe(TEST_ID);
    expect(row.actualOfficialDurationSeconds).toBe(24 * 60 * 60);
  });
});

// =============================================================================
// getById()
// =============================================================================

describe('WellTestsService.getById', () => {
  it('returns 404 for an unknown id', async () => {
    const { prisma } = makeMocks();
    const service = new WellTestsService(prisma);
    await expect(service.getById({}, TEST_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 when the row belongs to a different tenant', async () => {
    const { prisma, mocks } = makeMocks();
    mocks.wtFindUnique.mockResolvedValueOnce(dbRowDetail({ tenantId: 'other' }));
    const service = new WellTestsService(prisma);
    await expect(service.getById({ tenantId: TENANT_ID }, TEST_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns detail with nested job / well / unit summaries', async () => {
    const { prisma, mocks } = makeMocks();
    mocks.wtFindUnique.mockResolvedValueOnce(dbRowDetail());
    const service = new WellTestsService(prisma);

    const result = await service.getById({ tenantId: TENANT_ID }, TEST_ID);

    expect(result.id).toBe(TEST_ID);
    expect(result.job.id).toBe(JOB_ID);
    expect(result.well.name).toBe('PZ-1023');
    expect(result.unit.code).toBe('HP-001');
    expect(result).not.toHaveProperty('tenantId');
  });
});

// =============================================================================
// getActive()
// =============================================================================

describe('WellTestsService.getActive', () => {
  it('returns { active: null } when no active row exists', async () => {
    const { prisma } = makeMocks();
    const service = new WellTestsService(prisma);

    const result = await service.getActive(
      {},
      WellTestsActiveQuerySchema.parse({ unitId: UNIT_ID }).unitId,
    );

    expect(result.source).toBe('well_tests');
    expect(result.active).toBeNull();
  });

  it('queries for connected | stabilizing | measuring', async () => {
    const { prisma, mocks } = makeMocks();
    const service = new WellTestsService(prisma);

    await service.getActive({}, UNIT_ID);

    const arg = mocks.wtFindFirst.mock.calls[0]?.[0] as
      | { where?: { lifecycleStatus?: { in?: string[] } } }
      | undefined;
    expect(arg?.where?.lifecycleStatus?.in).toEqual(['connected', 'stabilizing', 'measuring']);
  });

  it('returns the matching row when one is active', async () => {
    const { prisma, mocks } = makeMocks();
    mocks.wtFindFirst.mockResolvedValueOnce(dbRow({ lifecycleStatus: 'measuring' }));
    const service = new WellTestsService(prisma);

    const result = await service.getActive({}, UNIT_ID);

    expect(result.active?.lifecycleStatus).toBe('measuring');
  });
});

// =============================================================================
// create()
// =============================================================================

describe('WellTestsService.create', () => {
  const FISC_BODY = CreateWellTestSchema.parse({
    jobId: JOB_ID,
    wellId: WELL_ID,
    unitId: UNIT_ID,
    testType: 'fiscalizacion',
    reportType: 'fiscalizacion_pdf',
    plannedOfficialDurationHours: 24,
  });
  const OPT_BODY = CreateWellTestSchema.parse({
    jobId: JOB_ID,
    wellId: WELL_ID,
    unitId: UNIT_ID,
    testType: 'optimizacion',
    reportType: 'optimizacion_pdf',
    plannedOfficialDurationHours: 18,
  });

  it('happy path: creates a Fiscalización row in scheduled status', async () => {
    const { prisma, mocks } = makeMocks();
    mocks.jobFindUnique.mockResolvedValueOnce({
      id: JOB_ID,
      tenantId: TENANT_ID,
      wellId: WELL_ID,
      unitId: UNIT_ID,
    });
    mocks.wtCreate.mockResolvedValueOnce(dbRowDetail());
    const service = new WellTestsService(prisma);

    const result = await service.create({ tenantId: TENANT_ID }, FISC_BODY);

    const createArg = mocks.wtCreate.mock.calls[0]?.[0];
    expect(createArg?.data.tenantId).toBe(TENANT_ID);
    expect(createArg?.data.jobId).toBe(JOB_ID);
    expect(createArg?.data.testType).toBe('fiscalizacion');
    expect(createArg?.data.reportType).toBe('fiscalizacion_pdf');
    expect(createArg?.data.plannedOfficialDurationHours).toBe(24);
    expect(createArg?.data.lifecycleStatus).toBe('scheduled');
    expect(result.id).toBe(TEST_ID);
  });

  it('happy path: creates an Optimización row (12..24 h)', async () => {
    const { prisma, mocks } = makeMocks();
    mocks.jobFindUnique.mockResolvedValueOnce({
      id: JOB_ID,
      tenantId: TENANT_ID,
      wellId: WELL_ID,
      unitId: UNIT_ID,
    });
    mocks.wtCreate.mockResolvedValueOnce(
      dbRowDetail({
        testType: 'optimizacion',
        reportType: 'optimizacion_pdf',
        plannedOfficialDurationHours: 18,
      }),
    );
    const service = new WellTestsService(prisma);

    await service.create({}, OPT_BODY);

    const createArg = mocks.wtCreate.mock.calls[0]?.[0];
    expect(createArg?.data.testType).toBe('optimizacion');
    expect(createArg?.data.reportType).toBe('optimizacion_pdf');
    expect(createArg?.data.plannedOfficialDurationHours).toBe(18);
  });

  it('404 when the referenced Job does not exist', async () => {
    const { prisma } = makeMocks();
    const service = new WellTestsService(prisma);
    await expect(service.create({}, FISC_BODY)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404 when the Job belongs to a different tenant than ctx', async () => {
    const { prisma, mocks } = makeMocks();
    mocks.jobFindUnique.mockResolvedValueOnce({
      id: JOB_ID,
      tenantId: 'other',
      wellId: WELL_ID,
      unitId: UNIT_ID,
    });
    const service = new WellTestsService(prisma);
    await expect(service.create({ tenantId: TENANT_ID }, FISC_BODY)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects body whose wellId / unitId mismatch the Job', async () => {
    const { prisma, mocks } = makeMocks();
    mocks.jobFindUnique.mockResolvedValueOnce({
      id: JOB_ID,
      tenantId: TENANT_ID,
      wellId: 'different-well',
      unitId: UNIT_ID,
    });
    const service = new WellTestsService(prisma);
    await expect(service.create({}, FISC_BODY)).rejects.toBeInstanceOf(BadRequestException);
  });
});

// =============================================================================
// Transitions
// =============================================================================

describe('WellTestsService.connect', () => {
  it('happy path: scheduled → connected; sets connectedAt', async () => {
    const { prisma, mocks } = makeMocks();
    mocks.wtFindUnique.mockResolvedValueOnce(dbRowDetail({ lifecycleStatus: 'scheduled' }));
    mocks.wtUpdate.mockResolvedValueOnce(dbRowDetail({ lifecycleStatus: 'connected' }));
    const service = new WellTestsService(prisma);

    const before = Date.now();
    await service.connect({}, TEST_ID, TransitionWellTestSchema.parse({}));
    const after = Date.now();

    const call = mocks.wtUpdate.mock.calls[0]?.[0];
    expect(call?.data.lifecycleStatus).toBe('connected');
    const ts = (call?.data.connectedAt as Date | undefined)?.getTime() ?? 0;
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('409 when the unit already has another active test', async () => {
    const { prisma, mocks } = makeMocks();
    mocks.wtFindUnique.mockResolvedValueOnce(dbRowDetail({ lifecycleStatus: 'scheduled' }));
    mocks.wtFindFirst.mockResolvedValueOnce(
      dbRow({ id: OTHER_TEST_ID, lifecycleStatus: 'measuring' }),
    );
    const service = new WellTestsService(prisma);

    await expect(
      service.connect({}, TEST_ID, TransitionWellTestSchema.parse({})),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('409 from any non-scheduled prior status', async () => {
    const { prisma, mocks } = makeMocks();
    mocks.wtFindUnique.mockResolvedValueOnce(dbRowDetail({ lifecycleStatus: 'measuring' }));
    const service = new WellTestsService(prisma);

    await expect(
      service.connect({}, TEST_ID, TransitionWellTestSchema.parse({})),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('WellTestsService.startStabilization', () => {
  it('happy path: connected → stabilizing', async () => {
    const { prisma, mocks } = makeMocks();
    mocks.wtFindUnique.mockResolvedValueOnce(dbRowDetail({ lifecycleStatus: 'connected' }));
    mocks.wtUpdate.mockResolvedValueOnce(dbRowDetail({ lifecycleStatus: 'stabilizing' }));
    const service = new WellTestsService(prisma);

    await service.startStabilization({}, TEST_ID, TransitionWellTestSchema.parse({}));

    const updateArg = mocks.wtUpdate.mock.calls[0]?.[0];
    expect(updateArg?.data.lifecycleStatus).toBe('stabilizing');
  });

  it('409 from a non-connected prior status', async () => {
    const { prisma, mocks } = makeMocks();
    mocks.wtFindUnique.mockResolvedValueOnce(dbRowDetail({ lifecycleStatus: 'scheduled' }));
    const service = new WellTestsService(prisma);
    await expect(
      service.startStabilization({}, TEST_ID, TransitionWellTestSchema.parse({})),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('WellTestsService.startOfficial', () => {
  it('happy path: stabilizing → measuring; stabilizationEndedAt = officialStartedAt', async () => {
    const { prisma, mocks } = makeMocks();
    mocks.wtFindUnique.mockResolvedValueOnce(
      dbRowDetail({
        lifecycleStatus: 'stabilizing',
        stabilizationStartedAt: new Date('2026-05-29T10:00:00.000Z'),
      }),
    );
    mocks.wtUpdate.mockResolvedValueOnce(dbRowDetail({ lifecycleStatus: 'measuring' }));
    const service = new WellTestsService(prisma);

    await service.startOfficial({}, TEST_ID, TransitionWellTestSchema.parse({}));

    const call = mocks.wtUpdate.mock.calls[0]?.[0];
    expect(call?.data.lifecycleStatus).toBe('measuring');
    const officialStartedAt = call?.data.officialStartedAt as Date | undefined;
    const stabilizationEndedAt = call?.data.stabilizationEndedAt as Date | undefined;
    expect(officialStartedAt).toBeInstanceOf(Date);
    expect(stabilizationEndedAt).toBeInstanceOf(Date);
    expect(stabilizationEndedAt?.getTime()).toBe(officialStartedAt?.getTime());
  });

  it('rejects when server clock is earlier than stabilizationStartedAt', async () => {
    const { prisma, mocks } = makeMocks();
    const futureStabilization = new Date(Date.now() + 24 * 60 * 60 * 1000);
    mocks.wtFindUnique.mockResolvedValueOnce(
      dbRowDetail({ lifecycleStatus: 'stabilizing', stabilizationStartedAt: futureStabilization }),
    );
    const service = new WellTestsService(prisma);

    await expect(
      service.startOfficial({}, TEST_ID, TransitionWellTestSchema.parse({})),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('WellTestsService.endOfficial', () => {
  it('happy path: measuring → completed', async () => {
    const { prisma, mocks } = makeMocks();
    mocks.wtFindUnique.mockResolvedValueOnce(
      dbRowDetail({
        lifecycleStatus: 'measuring',
        officialStartedAt: new Date('2026-05-29T12:00:00.000Z'),
        stabilizationEndedAt: new Date('2026-05-29T12:00:00.000Z'),
      }),
    );
    mocks.wtUpdate.mockResolvedValueOnce(dbRowDetail({ lifecycleStatus: 'completed' }));
    const service = new WellTestsService(prisma);

    await service.endOfficial({}, TEST_ID, TransitionWellTestSchema.parse({}));

    const updateArg = mocks.wtUpdate.mock.calls[0]?.[0];
    expect(updateArg?.data.lifecycleStatus).toBe('completed');
    expect(updateArg?.data.officialEndedAt).toBeInstanceOf(Date);
  });

  it('rejects when server clock is earlier than officialStartedAt', async () => {
    const { prisma, mocks } = makeMocks();
    const futureOfficial = new Date(Date.now() + 24 * 60 * 60 * 1000);
    mocks.wtFindUnique.mockResolvedValueOnce(
      dbRowDetail({ lifecycleStatus: 'measuring', officialStartedAt: futureOfficial }),
    );
    const service = new WellTestsService(prisma);

    await expect(
      service.endOfficial({}, TEST_ID, TransitionWellTestSchema.parse({})),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('WellTestsService.abort', () => {
  it('happy path from scheduled / connected / stabilizing / measuring', async () => {
    const { prisma, mocks } = makeMocks();
    for (const prior of ['scheduled', 'connected', 'stabilizing', 'measuring']) {
      mocks.wtFindUnique.mockResolvedValueOnce(dbRowDetail({ lifecycleStatus: prior }));
      mocks.wtUpdate.mockResolvedValueOnce(dbRowDetail({ lifecycleStatus: 'aborted' }));
      const service = new WellTestsService(prisma);
      await service.abort(
        {},
        TEST_ID,
        AbortWellTestSchema.parse({ abortReason: 'sensor failure during stabilization' }),
      );
    }
    expect(mocks.wtUpdate).toHaveBeenCalledTimes(4);
  });

  it('409 from completed / closed / aborted', async () => {
    const { prisma, mocks } = makeMocks();
    for (const terminal of ['completed', 'closed', 'aborted']) {
      mocks.wtFindUnique.mockResolvedValueOnce(dbRowDetail({ lifecycleStatus: terminal }));
      const service = new WellTestsService(prisma);
      await expect(
        service.abort({}, TEST_ID, AbortWellTestSchema.parse({ abortReason: 'x' })),
      ).rejects.toBeInstanceOf(ConflictException);
    }
  });
});

describe('WellTestsService.close', () => {
  it('happy path: completed → closed; records disconnectedAt', async () => {
    const { prisma, mocks } = makeMocks();
    mocks.wtFindUnique.mockResolvedValueOnce(dbRowDetail({ lifecycleStatus: 'completed' }));
    mocks.wtUpdate.mockResolvedValueOnce(dbRowDetail({ lifecycleStatus: 'closed' }));
    const service = new WellTestsService(prisma);

    await service.close({}, TEST_ID, CloseWellTestSchema.parse({}));

    const call = mocks.wtUpdate.mock.calls[0]?.[0];
    expect(call?.data.lifecycleStatus).toBe('closed');
    expect(call?.data.disconnectedAt).toBeInstanceOf(Date);
  });

  it('happy path: forwards reportGeneratedAt when supplied', async () => {
    const { prisma, mocks } = makeMocks();
    mocks.wtFindUnique.mockResolvedValueOnce(dbRowDetail({ lifecycleStatus: 'completed' }));
    mocks.wtUpdate.mockResolvedValueOnce(dbRowDetail({ lifecycleStatus: 'closed' }));
    const service = new WellTestsService(prisma);

    await service.close(
      {},
      TEST_ID,
      CloseWellTestSchema.parse({ reportGeneratedAt: '2026-05-31T12:00:00.000Z' }),
    );

    const call = mocks.wtUpdate.mock.calls[0]?.[0];
    expect(call?.data.reportGeneratedAt).toBeInstanceOf(Date);
  });

  it('409 from non-completed prior status', async () => {
    const { prisma, mocks } = makeMocks();
    mocks.wtFindUnique.mockResolvedValueOnce(dbRowDetail({ lifecycleStatus: 'measuring' }));
    const service = new WellTestsService(prisma);

    await expect(service.close({}, TEST_ID, CloseWellTestSchema.parse({}))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

// =============================================================================
// Zod schemas — controller-boundary refines
// =============================================================================

describe('WellTestsListQuerySchema', () => {
  it('accepts empty query with defaults', () => {
    const parsed = WellTestsListQuerySchema.parse({});
    expect(parsed.limit).toBe(50);
    expect(parsed.unitId).toBeUndefined();
  });

  it('rejects unknown fields (.strict())', () => {
    const result = WellTestsListQuerySchema.safeParse({ tenantId: TENANT_ID });
    expect(result.success).toBe(false);
  });

  it('rejects from without to', () => {
    const result = WellTestsListQuerySchema.safeParse({ from: '2026-05-29T12:00:00.000Z' });
    expect(result.success).toBe(false);
  });

  it('rejects from >= to', () => {
    const result = WellTestsListQuerySchema.safeParse({
      from: '2026-05-29T13:00:00.000Z',
      to: '2026-05-29T13:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects limit outside 1..200', () => {
    expect(WellTestsListQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(WellTestsListQuerySchema.safeParse({ limit: 201 }).success).toBe(false);
    expect(WellTestsListQuerySchema.parse({ limit: 200 }).limit).toBe(200);
  });

  it('rejects invalid enum values', () => {
    expect(WellTestsListQuerySchema.safeParse({ lifecycleStatus: 'not_a_status' }).success).toBe(
      false,
    );
    expect(WellTestsListQuerySchema.safeParse({ testType: 'panic' }).success).toBe(false);
  });
});

describe('CreateWellTestSchema', () => {
  const BASE = {
    jobId: JOB_ID,
    wellId: WELL_ID,
    unitId: UNIT_ID,
  };

  it('accepts Fiscalización 24 h + fiscalizacion_pdf', () => {
    const parsed = CreateWellTestSchema.parse({
      ...BASE,
      testType: 'fiscalizacion',
      reportType: 'fiscalizacion_pdf',
      plannedOfficialDurationHours: 24,
    });
    expect(parsed.testType).toBe('fiscalizacion');
  });

  it('rejects Fiscalización with duration != 24', () => {
    const result = CreateWellTestSchema.safeParse({
      ...BASE,
      testType: 'fiscalizacion',
      reportType: 'fiscalizacion_pdf',
      plannedOfficialDurationHours: 12,
    });
    expect(result.success).toBe(false);
  });

  it('accepts Optimización with 12..24 h + optimizacion_pdf', () => {
    for (const hours of [12, 16, 20, 24]) {
      const parsed = CreateWellTestSchema.parse({
        ...BASE,
        testType: 'optimizacion',
        reportType: 'optimizacion_pdf',
        plannedOfficialDurationHours: hours,
      });
      expect(parsed.plannedOfficialDurationHours).toBe(hours);
    }
  });

  it('rejects Optimización with duration outside 12..24', () => {
    expect(
      CreateWellTestSchema.safeParse({
        ...BASE,
        testType: 'optimizacion',
        reportType: 'optimizacion_pdf',
        plannedOfficialDurationHours: 11,
      }).success,
    ).toBe(false);
    expect(
      CreateWellTestSchema.safeParse({
        ...BASE,
        testType: 'optimizacion',
        reportType: 'optimizacion_pdf',
        plannedOfficialDurationHours: 25,
      }).success,
    ).toBe(false);
  });

  it('rejects testType / reportType mismatch', () => {
    const result = CreateWellTestSchema.safeParse({
      ...BASE,
      testType: 'fiscalizacion',
      reportType: 'optimizacion_pdf',
      plannedOfficialDurationHours: 24,
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields including tenantId', () => {
    const result = CreateWellTestSchema.safeParse({
      ...BASE,
      tenantId: TENANT_ID,
      testType: 'fiscalizacion',
      reportType: 'fiscalizacion_pdf',
      plannedOfficialDurationHours: 24,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID jobId / wellId / unitId', () => {
    expect(
      CreateWellTestSchema.safeParse({
        jobId: 'not-a-uuid',
        wellId: WELL_ID,
        unitId: UNIT_ID,
        testType: 'fiscalizacion',
        reportType: 'fiscalizacion_pdf',
        plannedOfficialDurationHours: 24,
      }).success,
    ).toBe(false);
  });
});

describe('AbortWellTestSchema', () => {
  it('requires abortReason 1..240', () => {
    expect(AbortWellTestSchema.safeParse({}).success).toBe(false);
    expect(AbortWellTestSchema.safeParse({ abortReason: '' }).success).toBe(false);
    expect(AbortWellTestSchema.safeParse({ abortReason: 'x'.repeat(241) }).success).toBe(false);
    expect(AbortWellTestSchema.parse({ abortReason: 'ok' }).abortReason).toBe('ok');
  });
});

describe('WellTestsActiveQuerySchema', () => {
  it('requires unitId UUID', () => {
    expect(WellTestsActiveQuerySchema.safeParse({}).success).toBe(false);
    expect(WellTestsActiveQuerySchema.safeParse({ unitId: 'not-uuid' }).success).toBe(false);
    expect(WellTestsActiveQuerySchema.parse({ unitId: UNIT_ID }).unitId).toBe(UNIT_ID);
  });

  it('rejects unknown fields', () => {
    expect(
      WellTestsActiveQuerySchema.safeParse({ unitId: UNIT_ID, tenantId: TENANT_ID }).success,
    ).toBe(false);
  });
});

// =============================================================================
// Isolation invariant — service performs no writes against other tables
// =============================================================================

describe('WellTestsService isolation', () => {
  it('reads/writes only `prisma.wellTest.*` and `prisma.job.findUnique`', async () => {
    const { prisma, mocks } = makeMocks();
    // Attach unrelated table mocks to detect accidental usage.
    const liveReadingFindMany = vi.fn();
    const telemetryReadingFindMany = vi.fn();
    const alarmEventFindMany = vi.fn();
    (
      prisma as unknown as {
        liveReading: { findMany: typeof liveReadingFindMany };
      }
    ).liveReading = { findMany: liveReadingFindMany };
    (
      prisma as unknown as {
        telemetryReading: { findMany: typeof telemetryReadingFindMany };
      }
    ).telemetryReading = { findMany: telemetryReadingFindMany };
    (
      prisma as unknown as {
        alarmEvent: { findMany: typeof alarmEventFindMany };
      }
    ).alarmEvent = { findMany: alarmEventFindMany };

    const service = new WellTestsService(prisma);
    await service.list({}, WellTestsListQuerySchema.parse({}));
    await service.getActive({}, UNIT_ID);

    expect(mocks.wtFindMany).toHaveBeenCalled();
    expect(mocks.wtFindFirst).toHaveBeenCalled();
    expect(liveReadingFindMany).not.toHaveBeenCalled();
    expect(telemetryReadingFindMany).not.toHaveBeenCalled();
    expect(alarmEventFindMany).not.toHaveBeenCalled();
  });
});
