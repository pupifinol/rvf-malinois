import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { CanonicalTagResolver } from './canonical-tag-resolver';

import type { PrismaService } from '../prisma/prisma.service';
import type { CanonicalTag } from '@prisma/client';

/**
 * Mocked-Prisma unit tests for CanonicalTagResolver (F4.4F).
 *
 * Replaces the previously-quarantined F1 spec, which connected to a live
 * Postgres instance to exercise the F1 `JobSensorSnapshot`-based lookup path.
 * F4.4F simplifies the resolver to a thin dictionary lookup by id or name;
 * the spec verifies the lookup, the unambiguous-input guard, and the
 * NotFoundException posture.
 */

interface FindUniqueArg {
  where: { id?: string; name?: string };
}

function makePrismaMock() {
  const findUnique = vi.fn<(args: FindUniqueArg) => Promise<CanonicalTag | null>>(() =>
    Promise.resolve(null),
  );
  const prisma = { canonicalTag: { findUnique } } as unknown as PrismaService;
  return { prisma, mocks: { findUnique } };
}

function tagFixture(overrides: Partial<CanonicalTag> = {}): CanonicalTag {
  return {
    id: '00000000-0000-0000-0000-0000000044f1',
    name: 'p_inlet',
    displayName: 'Inlet pressure',
    canonicalUnit: 'psi',
    category: 'pressure',
    precision: 1,
    description: 'Process pressure at the unit inlet manifold.',
    deprecated: false,
    createdAt: new Date('2026-05-24T00:00:00.000Z'),
    updatedAt: new Date('2026-05-24T00:00:00.000Z'),
    ...overrides,
  };
}

describe('CanonicalTagResolver.resolve', () => {
  it('looks up by UUID when only `id` is provided', async () => {
    const expected = tagFixture();
    const { prisma, mocks } = makePrismaMock();
    mocks.findUnique.mockResolvedValueOnce(expected);
    const resolver = new CanonicalTagResolver(prisma);

    await expect(resolver.resolve({ id: expected.id })).resolves.toEqual(expected);
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: expected.id } });
  });

  it('looks up by name when only `name` is provided', async () => {
    const expected = tagFixture();
    const { prisma, mocks } = makePrismaMock();
    mocks.findUnique.mockResolvedValueOnce(expected);
    const resolver = new CanonicalTagResolver(prisma);

    await expect(resolver.resolve({ name: expected.name })).resolves.toEqual(expected);
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { name: expected.name } });
  });

  it('throws BadRequestException when both `id` and `name` are supplied', async () => {
    const { prisma } = makePrismaMock();
    const resolver = new CanonicalTagResolver(prisma);

    await expect(
      resolver.resolve({ id: '00000000-0000-0000-0000-000000004401', name: 'p_inlet' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException when neither `id` nor `name` is supplied', async () => {
    const { prisma } = makePrismaMock();
    const resolver = new CanonicalTagResolver(prisma);

    await expect(resolver.resolve({})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws NotFoundException when looking up by id misses', async () => {
    const { prisma, mocks } = makePrismaMock();
    mocks.findUnique.mockResolvedValueOnce(null);
    const resolver = new CanonicalTagResolver(prisma);

    await expect(
      resolver.resolve({ id: '11111111-1111-1111-1111-111111111111' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException when looking up by name misses', async () => {
    const { prisma, mocks } = makePrismaMock();
    mocks.findUnique.mockResolvedValueOnce(null);
    const resolver = new CanonicalTagResolver(prisma);

    await expect(resolver.resolve({ name: 'not_a_real_tag' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
