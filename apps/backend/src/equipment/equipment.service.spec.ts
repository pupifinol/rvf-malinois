import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { EquipmentService } from './equipment.service';

import type { CallerContext } from '../common/caller-context';
import type { PrismaService } from '../prisma/prisma.service';
import type { EquipmentType, MeasurementUnit } from '@prisma/client';

/**
 * Mocked-Prisma unit tests for EquipmentService.
 *
 * Same posture as the F4.4A / F4.4B / F4.4C service specs: vitest + direct
 * instantiation, no Nest test module, no live DB. Asserts the F4 query
 * shape — model accessors `prisma.equipmentType` / `prisma.measurementUnit`,
 * the unit detail include with the per-current-row filters on
 * `unitConfigurations` / `unitOperatingEnvelopes` / `alarmRules`, the
 * CallerContext.tenantId scoping seam, and the NotFoundException
 * information-hiding posture for out-of-scope reads.
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
  const eq = {
    findMany: vi.fn<(args?: FindManyArg) => Promise<EquipmentType[]>>(() => Promise.resolve([])),
    findUnique: vi.fn<(args: FindUniqueArg) => Promise<EquipmentType | null>>(() =>
      Promise.resolve(null),
    ),
  };
  const mu = {
    findMany: vi.fn<(args?: FindManyArg) => Promise<MeasurementUnit[]>>(() => Promise.resolve([])),
    findUnique: vi.fn<(args: FindUniqueArg) => Promise<MeasurementUnit | null>>(() =>
      Promise.resolve(null),
    ),
  };
  const prisma = {
    equipmentType: eq,
    measurementUnit: mu,
  } as unknown as PrismaService;
  return { prisma, mocks: { eq, mu } };
}

function equipmentTypeFixture(overrides: Partial<EquipmentType> = {}): EquipmentType {
  return {
    id: '00000000-0000-0000-0000-0000000044d1',
    name: 'EMMAD',
    description: 'Well testing template.',
    defaultSensorTemplate: null,
    pidReference: 'EMMAD-generic',
    createdAt: new Date('2026-05-24T00:00:00.000Z'),
    updatedAt: new Date('2026-05-24T00:00:00.000Z'),
    ...overrides,
  };
}

function measurementUnitFixture(overrides: Partial<MeasurementUnit> = {}): MeasurementUnit {
  return {
    id: '00000000-0000-0000-0000-000000004411',
    tenantId: '00000000-0000-0000-0000-000000000001',
    equipmentTypeId: '00000000-0000-0000-0000-0000000044d1',
    code: 'HP-001',
    serialNumber: 'RVF-HP-001',
    name: 'High Pressure / High Flow Test Unit',
    status: 'active',
    operatingProfile: 'high_pressure_high_flow',
    location: 'Yard / Test Bench',
    createdAt: new Date('2026-05-24T00:00:00.000Z'),
    updatedAt: new Date('2026-05-24T00:00:00.000Z'),
    ...overrides,
  };
}

const emptyContext: CallerContext = {};

describe('EquipmentService.findTypes', () => {
  it('orders types by name ascending and applies no filter', async () => {
    const expected = [equipmentTypeFixture()];
    const { prisma, mocks } = makePrismaMock();
    mocks.eq.findMany.mockResolvedValueOnce(expected);
    const service = new EquipmentService(prisma);

    const result = await service.findTypes();

    expect(result).toEqual(expected);
    expect(mocks.eq.findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } });
  });
});

describe('EquipmentService.findTypeById', () => {
  it('returns the equipment type for a known UUID', async () => {
    const expected = equipmentTypeFixture();
    const { prisma, mocks } = makePrismaMock();
    mocks.eq.findUnique.mockResolvedValueOnce(expected);
    const service = new EquipmentService(prisma);

    await expect(service.findTypeById(expected.id)).resolves.toEqual(expected);
    expect(mocks.eq.findUnique).toHaveBeenCalledWith({ where: { id: expected.id } });
  });

  it('throws NotFoundException when Prisma returns null', async () => {
    const { prisma, mocks } = makePrismaMock();
    mocks.eq.findUnique.mockResolvedValueOnce(null);
    const service = new EquipmentService(prisma);

    await expect(
      service.findTypeById('11111111-1111-1111-1111-111111111111'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('EquipmentService.findUnits', () => {
  it('lists every unit with no scope when CallerContext is empty and no manual filter is supplied', async () => {
    const expected = [measurementUnitFixture()];
    const { prisma, mocks } = makePrismaMock();
    mocks.mu.findMany.mockResolvedValueOnce(expected);
    const service = new EquipmentService(prisma);

    const result = await service.findUnits(emptyContext);

    expect(result).toEqual(expected);
    expect(mocks.mu.findMany).toHaveBeenCalledWith({
      where: {},
      include: {
        equipmentType: { select: { id: true, name: true, pidReference: true } },
      },
      orderBy: [{ tenantId: 'asc' }, { code: 'asc' }],
    });
  });

  it('passes through equipmentTypeId / status / operatingProfile filters', async () => {
    const { prisma, mocks } = makePrismaMock();
    const service = new EquipmentService(prisma);

    await service.findUnits(emptyContext, {
      equipmentTypeId: '00000000-0000-0000-0000-0000000044d1',
      status: 'active',
      operatingProfile: 'low',
    });

    expect(mocks.mu.findMany).toHaveBeenCalledWith({
      where: {
        equipmentTypeId: '00000000-0000-0000-0000-0000000044d1',
        status: 'active',
        operatingProfile: 'low',
      },
      include: {
        equipmentType: { select: { id: true, name: true, pidReference: true } },
      },
      orderBy: [{ tenantId: 'asc' }, { code: 'asc' }],
    });
  });

  it('uses ctx.tenantId when set and ignores the manual tenantId filter', async () => {
    const { prisma, mocks } = makePrismaMock();
    const service = new EquipmentService(prisma);
    const scopedTenant = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const manualTenant = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    await service.findUnits({ tenantId: scopedTenant }, { tenantId: manualTenant });

    expect(mocks.mu.findMany).toHaveBeenCalledWith({
      where: { tenantId: scopedTenant },
      include: {
        equipmentType: { select: { id: true, name: true, pidReference: true } },
      },
      orderBy: [{ tenantId: 'asc' }, { code: 'asc' }],
    });
  });

  it('falls back to the manual tenantId filter when no ctx scope is present', async () => {
    const { prisma, mocks } = makePrismaMock();
    const service = new EquipmentService(prisma);
    const manualTenant = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    await service.findUnits(emptyContext, { tenantId: manualTenant });

    expect(mocks.mu.findMany).toHaveBeenCalledWith({
      where: { tenantId: manualTenant },
      include: {
        equipmentType: { select: { id: true, name: true, pidReference: true } },
      },
      orderBy: [{ tenantId: 'asc' }, { code: 'asc' }],
    });
  });
});

describe('EquipmentService.findUnitById', () => {
  it('returns the unit detail (with current configuration / envelope / alarm rules) when found', async () => {
    const expected = measurementUnitFixture();
    const { prisma, mocks } = makePrismaMock();
    mocks.mu.findUnique.mockResolvedValueOnce(expected);
    const service = new EquipmentService(prisma);

    await expect(service.findUnitById(emptyContext, expected.id)).resolves.toEqual(expected);
    const call = mocks.mu.findUnique.mock.calls[0]?.[0];
    expect(call?.where).toEqual({ id: expected.id });
    // The detail include is deliberately shape-checked so future refactors do not
    // silently drop one of the per-current-row filters.
    const include = call?.include;
    expect(include).toBeDefined();
    expect(include?.equipmentType).toBe(true);
    expect(include?.sensors).toMatchObject({
      orderBy: { instrumentTag: 'asc' },
      include: {
        transmitterDevices: {
          where: { installationStatus: 'installed' },
          orderBy: { installedAt: 'desc' },
        },
      },
    });
    expect(include?.unitConfigurations).toEqual({ where: { isCurrent: true }, take: 1 });
    expect(include?.unitOperatingEnvelopes).toEqual({ where: { isCurrent: true }, take: 1 });
    expect(include?.alarmRules).toMatchObject({
      where: { isCurrent: true },
      orderBy: [{ canonicalTagId: 'asc' }, { severity: 'asc' }],
    });
  });

  it('throws NotFoundException when Prisma returns null', async () => {
    const { prisma, mocks } = makePrismaMock();
    mocks.mu.findUnique.mockResolvedValueOnce(null);
    const service = new EquipmentService(prisma);

    await expect(
      service.findUnitById(emptyContext, '11111111-1111-1111-1111-111111111111'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException when the unit exists but belongs to a different tenant scope', async () => {
    const other = measurementUnitFixture({ tenantId: 'dddddddd-dddd-dddd-dddd-dddddddddddd' });
    const { prisma, mocks } = makePrismaMock();
    mocks.mu.findUnique.mockResolvedValueOnce(other);
    const service = new EquipmentService(prisma);
    const scoped: CallerContext = { tenantId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' };

    await expect(service.findUnitById(scoped, other.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
