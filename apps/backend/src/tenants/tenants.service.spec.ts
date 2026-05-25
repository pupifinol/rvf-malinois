import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { TenantsService } from './tenants.service';

import type { CallerContext } from '../common/caller-context';
import type { PrismaService } from '../prisma/prisma.service';
import type { Tenant } from '@prisma/client';

/**
 * Mocked-Prisma unit tests for TenantsService.
 *
 * Repo pattern (see `src/health/health.controller.spec.ts`): vitest +
 * direct instantiation, no live DB. The previously-quarantined F1 spec
 * connected to a real Postgres instance via `new PrismaClient()`; F4.4A
 * intentionally moves to a mocked surface so this spec stays green inside
 * CI / `pnpm test` without a database. End-to-end coverage against a real
 * DB returns once the test-harness story for the F4 schema is in place.
 */

interface FindManyArg {
  where?: Record<string, unknown>;
  orderBy?: Record<string, unknown>;
}
interface FindUniqueArg {
  where: { id: string };
}

function makePrismaMock() {
  const findMany = vi.fn<(args?: FindManyArg) => Promise<Tenant[]>>(() => Promise.resolve([]));
  const findUnique = vi.fn<(args: FindUniqueArg) => Promise<Tenant | null>>(() =>
    Promise.resolve(null),
  );
  const prisma = { tenant: { findMany, findUnique } } as unknown as PrismaService;
  return { prisma, mocks: { findMany, findUnique } };
}

function tenantFixture(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'RVF Internal',
    status: 'active',
    residencyHint: 'local-dev',
    createdAt: new Date('2026-05-24T00:00:00.000Z'),
    updatedAt: new Date('2026-05-24T00:00:00.000Z'),
    ...overrides,
  };
}

const emptyContext: CallerContext = {};

describe('TenantsService.findAll', () => {
  it('orders tenants by name and applies no scope when CallerContext is empty', async () => {
    const expected: Tenant[] = [tenantFixture()];
    const { prisma, mocks } = makePrismaMock();
    mocks.findMany.mockResolvedValueOnce(expected);
    const service = new TenantsService(prisma);

    const result = await service.findAll(emptyContext);

    expect(result).toEqual(expected);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { name: 'asc' },
    });
  });

  it('passes through the optional `status` filter', async () => {
    const { prisma, mocks } = makePrismaMock();
    const service = new TenantsService(prisma);

    await service.findAll(emptyContext, { status: 'inactive' });

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { status: 'inactive' },
      orderBy: { name: 'asc' },
    });
  });

  it('scopes the query to ctx.tenantId when one is provided', async () => {
    const { prisma, mocks } = makePrismaMock();
    const service = new TenantsService(prisma);
    const scoped: CallerContext = { tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' };

    await service.findAll(scoped, { status: 'active' });

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { id: scoped.tenantId, status: 'active' },
      orderBy: { name: 'asc' },
    });
  });
});

describe('TenantsService.findById', () => {
  it('returns the tenant when found and the context is system-wide', async () => {
    const expected = tenantFixture();
    const { prisma, mocks } = makePrismaMock();
    mocks.findUnique.mockResolvedValueOnce(expected);
    const service = new TenantsService(prisma);

    await expect(service.findById(emptyContext, expected.id)).resolves.toEqual(expected);
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: expected.id } });
  });

  it('throws NotFoundException when Prisma returns null', async () => {
    const { prisma, mocks } = makePrismaMock();
    mocks.findUnique.mockResolvedValueOnce(null);
    const service = new TenantsService(prisma);

    await expect(
      service.findById(emptyContext, '11111111-1111-1111-1111-111111111111'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException when the row exists but is outside the caller scope', async () => {
    const other = tenantFixture({ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' });
    const { prisma, mocks } = makePrismaMock();
    mocks.findUnique.mockResolvedValueOnce(other);
    const service = new TenantsService(prisma);
    const scoped: CallerContext = { tenantId: 'cccccccc-cccc-cccc-cccc-cccccccccccc' };

    await expect(service.findById(scoped, other.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
