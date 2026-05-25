import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { CanonicalTagsService } from './tags.service';

import type { PrismaService } from '../prisma/prisma.service';
import type { CanonicalTag } from '@prisma/client';

/**
 * Mocked-Prisma unit tests for CanonicalTagsService.
 *
 * Same posture as the F4.4A / F4.4B service specs: vitest + direct
 * instantiation, no Nest test module, no live DB. The dictionary is global
 * (not tenant-scoped), so there is no `CallerContext` here.
 */

interface FindManyArg {
  where?: Record<string, unknown>;
  orderBy?: unknown;
}
interface FindUniqueArg {
  where: { name: string };
}

function makePrismaMock() {
  const findMany = vi.fn<(args?: FindManyArg) => Promise<CanonicalTag[]>>(() =>
    Promise.resolve([]),
  );
  const findUnique = vi.fn<(args: FindUniqueArg) => Promise<CanonicalTag | null>>(() =>
    Promise.resolve(null),
  );
  const prisma = { canonicalTag: { findMany, findUnique } } as unknown as PrismaService;
  return { prisma, mocks: { findMany, findUnique } };
}

function tagFixture(overrides: Partial<CanonicalTag> = {}): CanonicalTag {
  return {
    id: '00000000-0000-0000-0000-0000000044c1',
    name: 'p_inlet',
    displayName: 'Inlet pressure',
    canonicalUnit: 'psi',
    category: 'pressure',
    precision: 1,
    description: 'Process pressure measured at the unit inlet manifold.',
    deprecated: false,
    createdAt: new Date('2026-05-24T00:00:00.000Z'),
    updatedAt: new Date('2026-05-24T00:00:00.000Z'),
    ...overrides,
  };
}

describe('CanonicalTagsService.findAll', () => {
  it('returns every tag with the canonical ordering when no filter is supplied', async () => {
    const expected: CanonicalTag[] = [tagFixture()];
    const { prisma, mocks } = makePrismaMock();
    mocks.findMany.mockResolvedValueOnce(expected);
    const service = new CanonicalTagsService(prisma);

    const result = await service.findAll();

    expect(result).toEqual(expected);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  });

  it('applies the optional category filter', async () => {
    const { prisma, mocks } = makePrismaMock();
    const service = new CanonicalTagsService(prisma);

    await service.findAll({ category: 'pressure' });

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { category: 'pressure' },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  });

  it('applies the optional canonicalUnit filter', async () => {
    const { prisma, mocks } = makePrismaMock();
    const service = new CanonicalTagsService(prisma);

    await service.findAll({ canonicalUnit: 'psi' });

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { canonicalUnit: 'psi' },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  });

  it('passes through deprecated=false as an explicit filter', async () => {
    const { prisma, mocks } = makePrismaMock();
    const service = new CanonicalTagsService(prisma);

    await service.findAll({ deprecated: false });

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { deprecated: false },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  });

  it('passes through deprecated=true as an explicit filter', async () => {
    const { prisma, mocks } = makePrismaMock();
    const service = new CanonicalTagsService(prisma);

    await service.findAll({ deprecated: true });

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { deprecated: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  });
});

describe('CanonicalTagsService.findByName', () => {
  it('returns the canonical tag for a known name', async () => {
    const expected = tagFixture();
    const { prisma, mocks } = makePrismaMock();
    mocks.findUnique.mockResolvedValueOnce(expected);
    const service = new CanonicalTagsService(prisma);

    await expect(service.findByName('p_inlet')).resolves.toEqual(expected);
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { name: 'p_inlet' } });
  });

  it('throws NotFoundException when the name is not in the dictionary', async () => {
    const { prisma, mocks } = makePrismaMock();
    mocks.findUnique.mockResolvedValueOnce(null);
    const service = new CanonicalTagsService(prisma);

    await expect(service.findByName('not_a_real_tag')).rejects.toBeInstanceOf(NotFoundException);
  });
});
