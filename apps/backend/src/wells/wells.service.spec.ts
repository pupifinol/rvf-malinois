import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { WellsService } from './wells.service';

import type { CallerContext } from '../common/caller-context';
import type { PrismaService } from '../prisma/prisma.service';
import type { Well } from '@prisma/client';

/**
 * Mocked-Prisma unit tests for WellsService.
 *
 * Same posture as `tenants.service.spec.ts` (F4.4A): vitest + direct
 * instantiation, no Nest test module, no live DB. Verifies the F4 query
 * shape, the CallerContext scoping seam, and the NotFoundException
 * information-hiding posture for out-of-scope reads.
 */

interface TenantScalar {
  id: string;
  name: string;
  status: string;
}
type WellWithTenant = Well & { tenant: TenantScalar };

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
  const findMany = vi.fn<(args?: FindManyArg) => Promise<WellWithTenant[]>>(() =>
    Promise.resolve([]),
  );
  const findUnique = vi.fn<(args: FindUniqueArg) => Promise<WellWithTenant | null>>(() =>
    Promise.resolve(null),
  );
  const prisma = { well: { findMany, findUnique } } as unknown as PrismaService;
  return { prisma, mocks: { findMany, findUnique } };
}

function wellFixture(overrides: Partial<WellWithTenant> = {}): WellWithTenant {
  return {
    id: '00000000-0000-0000-0000-000000004401',
    tenantId: '00000000-0000-0000-0000-000000000001',
    clientId: null,
    name: 'Reference Well A',
    fieldOrSite: 'Reference Field',
    location: 'Local Dev',
    type: 'test',
    fluid: 'multiphase',
    designLimits: null,
    createdAt: new Date('2026-05-24T00:00:00.000Z'),
    updatedAt: new Date('2026-05-24T00:00:00.000Z'),
    tenant: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'RVF Internal',
      status: 'active',
    },
    ...overrides,
  };
}

const emptyContext: CallerContext = {};

describe('WellsService.findAll', () => {
  it('lists every well with no scope when CallerContext is empty and no manual filter is supplied', async () => {
    const expected: WellWithTenant[] = [wellFixture()];
    const { prisma, mocks } = makePrismaMock();
    mocks.findMany.mockResolvedValueOnce(expected);
    const service = new WellsService(prisma);

    const result = await service.findAll(emptyContext);

    expect(result).toEqual(expected);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {},
      include: { tenant: { select: { id: true, name: true, status: true } } },
      orderBy: [{ tenantId: 'asc' }, { name: 'asc' }],
    });
  });

  it('passes through fieldOrSite / type / fluid filters', async () => {
    const { prisma, mocks } = makePrismaMock();
    const service = new WellsService(prisma);

    await service.findAll(emptyContext, {
      fieldOrSite: 'Reference Field',
      type: 'test',
      fluid: 'multiphase',
    });

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { fieldOrSite: 'Reference Field', type: 'test', fluid: 'multiphase' },
      include: { tenant: { select: { id: true, name: true, status: true } } },
      orderBy: [{ tenantId: 'asc' }, { name: 'asc' }],
    });
  });

  it('uses ctx.tenantId when set and ignores the manual tenantId filter', async () => {
    const { prisma, mocks } = makePrismaMock();
    const service = new WellsService(prisma);
    const scopedTenant = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const manualTenant = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    await service.findAll({ tenantId: scopedTenant }, { tenantId: manualTenant });

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { tenantId: scopedTenant },
      include: { tenant: { select: { id: true, name: true, status: true } } },
      orderBy: [{ tenantId: 'asc' }, { name: 'asc' }],
    });
  });

  it('falls back to the manual tenantId filter when no ctx scope is present', async () => {
    const { prisma, mocks } = makePrismaMock();
    const service = new WellsService(prisma);
    const manualTenant = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    await service.findAll(emptyContext, { tenantId: manualTenant });

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { tenantId: manualTenant },
      include: { tenant: { select: { id: true, name: true, status: true } } },
      orderBy: [{ tenantId: 'asc' }, { name: 'asc' }],
    });
  });
});

describe('WellsService.findById', () => {
  it('returns the well + tenant when found and the context is system-wide', async () => {
    const expected = wellFixture();
    const { prisma, mocks } = makePrismaMock();
    mocks.findUnique.mockResolvedValueOnce(expected);
    const service = new WellsService(prisma);

    await expect(service.findById(emptyContext, expected.id)).resolves.toEqual(expected);
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: expected.id },
      include: { tenant: { select: { id: true, name: true, status: true } } },
    });
  });

  it('throws NotFoundException when Prisma returns null', async () => {
    const { prisma, mocks } = makePrismaMock();
    mocks.findUnique.mockResolvedValueOnce(null);
    const service = new WellsService(prisma);

    await expect(
      service.findById(emptyContext, '11111111-1111-1111-1111-111111111111'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException when the well exists but belongs to a different tenant scope', async () => {
    const otherTenant = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const well = wellFixture({
      tenantId: otherTenant,
      tenant: { id: otherTenant, name: 'Other', status: 'active' },
    });
    const { prisma, mocks } = makePrismaMock();
    mocks.findUnique.mockResolvedValueOnce(well);
    const service = new WellsService(prisma);
    const scoped: CallerContext = { tenantId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' };

    await expect(service.findById(scoped, well.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
