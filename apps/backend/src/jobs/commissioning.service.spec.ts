import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { CommissioningService } from './commissioning.service';

import type { PrismaService } from '../prisma/prisma.service';
import type { CommissioningSnapshot } from '@prisma/client';

/**
 * Mocked-Prisma unit tests for CommissioningService.
 *
 * F4.4E reduced the F1 write surface (`createJobWithSnapshot`,
 * `assertSnapshotMutable`, `assertJobMutable`) to two read-only helpers,
 * matching the F4 architecture in which the snapshot is immutable by CHECK
 * constraint and the write workflow returns behind a guarded audit-logging
 * service in a later phase. This spec replaces the previously-quarantined
 * F1 immutability suite (which exercised writes against a live Postgres
 * instance) with a small mocked-Prisma surface that pins the new contract.
 */

interface FindUniqueArg {
  where: { id: string };
}
interface FindFirstArg {
  where: { jobId: string };
  orderBy?: unknown;
}

function makePrismaMock() {
  const findUnique = vi.fn<(args: FindUniqueArg) => Promise<CommissioningSnapshot | null>>(() =>
    Promise.resolve(null),
  );
  const findFirst = vi.fn<(args: FindFirstArg) => Promise<CommissioningSnapshot | null>>(() =>
    Promise.resolve(null),
  );
  const prisma = {
    commissioningSnapshot: { findUnique, findFirst },
  } as unknown as PrismaService;
  return { prisma, mocks: { findUnique, findFirst } };
}

function snapshotFixture(overrides: Partial<CommissioningSnapshot> = {}): CommissioningSnapshot {
  return {
    id: '00000000-0000-0000-0000-000000004499',
    tenantId: '00000000-0000-0000-0000-000000000001',
    jobId: '00000000-0000-0000-0000-000000004444',
    unitId: '00000000-0000-0000-0000-000000004411',
    takenAt: new Date('2026-05-24T00:00:00.000Z'),
    effectiveThresholds: { ref: 'thresholds' },
    sensorMappings: { ref: 'mappings' },
    engineeringEnvelope: { ref: 'envelope' },
    ruleVersions: { ref: 'versions' },
    immutable: true,
    createdAt: new Date('2026-05-24T00:00:00.000Z'),
    ...overrides,
  };
}

describe('CommissioningService.findById', () => {
  it('returns the snapshot when the UUID is known', async () => {
    const expected = snapshotFixture();
    const { prisma, mocks } = makePrismaMock();
    mocks.findUnique.mockResolvedValueOnce(expected);
    const service = new CommissioningService(prisma);

    await expect(service.findById(expected.id)).resolves.toEqual(expected);
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: expected.id } });
  });

  it('throws NotFoundException when Prisma returns null', async () => {
    const { prisma, mocks } = makePrismaMock();
    mocks.findUnique.mockResolvedValueOnce(null);
    const service = new CommissioningService(prisma);

    await expect(service.findById('11111111-1111-1111-1111-111111111111')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('CommissioningService.findLatestByJobId', () => {
  it('returns the most recently taken snapshot for the given job, or null', async () => {
    const expected = snapshotFixture();
    const { prisma, mocks } = makePrismaMock();
    mocks.findFirst.mockResolvedValueOnce(expected);
    const service = new CommissioningService(prisma);

    await expect(service.findLatestByJobId(expected.jobId)).resolves.toEqual(expected);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { jobId: expected.jobId },
      orderBy: { takenAt: 'desc' },
    });
  });

  it('returns null when no snapshot exists for the job', async () => {
    const { prisma, mocks } = makePrismaMock();
    mocks.findFirst.mockResolvedValueOnce(null);
    const service = new CommissioningService(prisma);

    await expect(
      service.findLatestByJobId('22222222-2222-2222-2222-222222222222'),
    ).resolves.toBeNull();
  });
});
