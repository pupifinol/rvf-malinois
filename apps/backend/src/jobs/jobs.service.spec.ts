import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { JobsService } from './jobs.service';

import type { CallerContext } from '../common/caller-context';
import type { PrismaService } from '../prisma/prisma.service';
import type { Job } from '@prisma/client';

/**
 * Mocked-Prisma unit tests for JobsService.
 *
 * F4.4E posture (matches F4.4A / F4.4B / F4.4D specs): vitest + direct
 * instantiation, no Nest test module, no live DB. The previously-quarantined
 * F1 spec connected to a real Postgres instance to verify cross-tenant
 * scoping against the seed; F4.4E moves to a mocked surface so the suite
 * stays green inside `pnpm test` without a database. Real-DB integration
 * coverage returns once the F4 test harness lands.
 */

interface FindManyArg {
  where?: Record<string, unknown>;
  include?: Record<string, unknown>;
  orderBy?: unknown;
}
interface FindUniqueArg {
  where: { id: string };
  include?: Record<string, unknown>;
}

function makePrismaMock() {
  const findMany = vi.fn<(args?: FindManyArg) => Promise<Job[]>>(() => Promise.resolve([]));
  const findUnique = vi.fn<(args: FindUniqueArg) => Promise<Job | null>>(() =>
    Promise.resolve(null),
  );
  const prisma = { job: { findMany, findUnique } } as unknown as PrismaService;
  return { prisma, mocks: { findMany, findUnique } };
}

function jobFixture(overrides: Partial<Job> = {}): Job {
  return {
    id: '00000000-0000-0000-0000-000000004444',
    tenantId: '00000000-0000-0000-0000-000000000001',
    wellId: '00000000-0000-0000-0000-000000004400',
    unitId: '00000000-0000-0000-0000-000000004411',
    commissioningSnapshotId: null,
    engineerId: '00000000-0000-0000-0000-000000000002',
    status: 'in_progress',
    startedAt: new Date('2026-05-24T00:00:00.000Z'),
    closedAt: null,
    createdAt: new Date('2026-05-24T00:00:00.000Z'),
    updatedAt: new Date('2026-05-24T00:00:00.000Z'),
    ...overrides,
  };
}

const emptyContext: CallerContext = {};

const EXPECTED_LIST_INCLUDE = {
  tenant: { select: { id: true, name: true, status: true } },
  well: { select: { id: true, name: true, fieldOrSite: true } },
  unit: { select: { id: true, code: true, name: true } },
};
const EXPECTED_LIST_ORDER = [{ startedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }];

describe('JobsService.findAll', () => {
  it('lists every job with no scope when CallerContext is empty and no manual filter is supplied', async () => {
    const expected = [jobFixture()];
    const { prisma, mocks } = makePrismaMock();
    mocks.findMany.mockResolvedValueOnce(expected);
    const service = new JobsService(prisma);

    const result = await service.findAll(emptyContext);

    expect(result).toEqual(expected);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {},
      include: EXPECTED_LIST_INCLUDE,
      orderBy: EXPECTED_LIST_ORDER,
    });
  });

  it('passes through wellId / unitId / status filters', async () => {
    const { prisma, mocks } = makePrismaMock();
    const service = new JobsService(prisma);

    await service.findAll(emptyContext, {
      wellId: '00000000-0000-0000-0000-000000004400',
      unitId: '00000000-0000-0000-0000-000000004411',
      status: 'closed',
    });

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        wellId: '00000000-0000-0000-0000-000000004400',
        unitId: '00000000-0000-0000-0000-000000004411',
        status: 'closed',
      },
      include: EXPECTED_LIST_INCLUDE,
      orderBy: EXPECTED_LIST_ORDER,
    });
  });

  it('uses ctx.tenantId when set and ignores the manual tenantId filter', async () => {
    const { prisma, mocks } = makePrismaMock();
    const service = new JobsService(prisma);
    const scopedTenant = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const manualTenant = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    await service.findAll({ tenantId: scopedTenant }, { tenantId: manualTenant });

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { tenantId: scopedTenant },
      include: EXPECTED_LIST_INCLUDE,
      orderBy: EXPECTED_LIST_ORDER,
    });
  });

  it('falls back to the manual tenantId filter when no ctx scope is present', async () => {
    const { prisma, mocks } = makePrismaMock();
    const service = new JobsService(prisma);
    const manualTenant = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    await service.findAll(emptyContext, { tenantId: manualTenant });

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { tenantId: manualTenant },
      include: EXPECTED_LIST_INCLUDE,
      orderBy: EXPECTED_LIST_ORDER,
    });
  });
});

describe('JobsService.findById', () => {
  it('returns the job with detail include when found and the context is system-wide', async () => {
    const expected = jobFixture();
    const { prisma, mocks } = makePrismaMock();
    mocks.findUnique.mockResolvedValueOnce(expected);
    const service = new JobsService(prisma);

    await expect(service.findById(emptyContext, expected.id)).resolves.toEqual(expected);
    const call = mocks.findUnique.mock.calls[0]?.[0];
    expect(call?.where).toEqual({ id: expected.id });
    const include = call?.include;
    expect(include).toBeDefined();
    expect(include?.tenant).toMatchObject({ select: { id: true, name: true, status: true } });
    expect(include?.well).toMatchObject({
      select: {
        id: true,
        name: true,
        fieldOrSite: true,
        location: true,
        type: true,
        fluid: true,
        designLimits: true,
      },
    });
    expect(include?.unit).toMatchObject({
      select: {
        id: true,
        code: true,
        name: true,
        serialNumber: true,
        status: true,
        operatingProfile: true,
        location: true,
        equipmentType: { select: { id: true, name: true, pidReference: true } },
      },
    });
    expect(include?.engineer).toMatchObject({
      select: { id: true, displayName: true, role: true },
    });
    expect(include?.commissioningSnapshot).toBe(true);
  });

  it('throws NotFoundException when Prisma returns null', async () => {
    const { prisma, mocks } = makePrismaMock();
    mocks.findUnique.mockResolvedValueOnce(null);
    const service = new JobsService(prisma);

    await expect(
      service.findById(emptyContext, '11111111-1111-1111-1111-111111111111'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException when the job exists but belongs to a different tenant scope', async () => {
    const other = jobFixture({ tenantId: 'dddddddd-dddd-dddd-dddd-dddddddddddd' });
    const { prisma, mocks } = makePrismaMock();
    mocks.findUnique.mockResolvedValueOnce(other);
    const service = new JobsService(prisma);
    const scoped: CallerContext = { tenantId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' };

    await expect(service.findById(scoped, other.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
