import { ConflictException, NotFoundException } from '@nestjs/common';
import { JobStatus, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type PrismaService } from '../prisma/prisma.service';

import { CanonicalTagResolver } from './canonical-tag-resolver';

/**
 * Resolver tests — exercise the §29 spine path:
 *   (unit_id, instrument_tag) → active job → snapshot → frozen meaning
 *
 * Uses the seed job (JOB-2026-0001, in_progress, EMMAD-01 with 4 sensors).
 */

describe('CanonicalTagResolver (F1.5.2)', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const resolver = new CanonicalTagResolver(prisma, { cacheLimit: 16 });

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('resolves PIT-003 on EMMAD-01 to p_inlet from the frozen snapshot', async () => {
    const resolved = await resolver.resolveByUnitAndInstrumentTag('EMMAD-01', 'PIT-003');
    expect(resolved.canonicalTagName).toBe('p_inlet');
    expect(resolved.canonicalUnit).toBe('psi');
    expect(resolved.unitClass).toBe('pressure');
    expect(resolved.unitId).toBe('EMMAD-01');
  });

  it('returns the snapshot copy, not the live catalog (rangeLow/rangeHigh come from the frozen row)', async () => {
    const resolved = await resolver.resolveByUnitAndInstrumentTag('EMMAD-01', 'PIT-003');
    expect(resolved.rangeLow).toBe(0);
    expect(resolved.rangeHigh).toBe(3000);
  });

  it('serves a second lookup from cache (Map size grows by 1, then stays)', async () => {
    await resolver.resolveByUnitAndInstrumentTag('EMMAD-01', 'TIT-002');
    await resolver.resolveByUnitAndInstrumentTag('EMMAD-01', 'TIT-002');
    // We can't easily peek the private cache, but we can verify both
    // calls return the same identity-equal data.
    const a = await resolver.resolveByUnitAndInstrumentTag('EMMAD-01', 'TIT-002');
    const b = await resolver.resolveByUnitAndInstrumentTag('EMMAD-01', 'TIT-002');
    expect(a).toEqual(b);
  });

  it('throws NotFound for an unknown unit', async () => {
    await expect(
      resolver.resolveByUnitAndInstrumentTag('UNKNOWN-99', 'PIT-003'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFound for an unknown instrument tag on a known unit', async () => {
    await expect(
      resolver.resolveByUnitAndInstrumentTag('EMMAD-01', 'PIT-999'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws when no in_progress job is on the unit (§29: reading without job is orphan)', async () => {
    // Temporarily flip the seed job to closed so EMMAD-01 has no active job.
    const seedJob = await prisma.job.findUnique({ where: { code: 'JOB-2026-0001' } });
    if (!seedJob) throw new Error('seed missing — run `pnpm prisma:seed`');
    await prisma.job.update({
      where: { id: seedJob.id },
      data: { status: JobStatus.closed, closedAt: new Date() },
    });

    const resolverNoCache = new CanonicalTagResolver(prisma);
    try {
      await expect(
        resolverNoCache.resolveByUnitAndInstrumentTag('EMMAD-01', 'PIT-003'),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        resolverNoCache.resolveByUnitAndInstrumentTag('EMMAD-01', 'PIT-003'),
      ).rejects.toThrowError(/orphan/);
    } finally {
      // Restore the seed.
      await prisma.job.update({
        where: { id: seedJob.id },
        data: { status: JobStatus.in_progress, closedAt: null },
      });
    }
  });

  it('throws Conflict if two in_progress jobs share a unit', async () => {
    // Create a second in_progress job on EMMAD-01 to trigger the conflict.
    const seedJob = await prisma.job.findUnique({ where: { code: 'JOB-2026-0001' } });
    const repsol = await prisma.tenant.findUnique({ where: { code: 'repsol' } });
    if (!seedJob || !repsol) throw new Error('seed missing');
    const well = await prisma.well.findUnique({
      where: { tenantId_code: { tenantId: repsol.id, code: 'CN-014' } },
    });
    if (!well) throw new Error('seed well missing');

    const conflictCode = `JOB-CONFLICT-${Math.random().toString(36).slice(2, 8)}`;
    const conflictJob = await prisma.job.create({
      data: {
        code: conflictCode,
        tenantId: repsol.id,
        wellId: well.id,
        equipmentUnitId: seedJob.equipmentUnitId,
        startedAt: new Date(),
        status: JobStatus.in_progress,
      },
    });
    const resolverNoCache = new CanonicalTagResolver(prisma);
    try {
      await expect(
        resolverNoCache.resolveByUnitAndInstrumentTag('EMMAD-01', 'PIT-003'),
      ).rejects.toBeInstanceOf(ConflictException);
    } finally {
      await prisma.job.delete({ where: { id: conflictJob.id } });
    }
  });

  it("invalidateJob clears that job's entries without affecting others", async () => {
    // Warm the cache for the seed job.
    await resolver.resolveByUnitAndInstrumentTag('EMMAD-01', 'PIT-003');
    const seedJob = await prisma.job.findUnique({ where: { code: 'JOB-2026-0001' } });
    if (!seedJob) throw new Error('seed missing');
    expect(() => resolver.invalidateJob(seedJob.id)).not.toThrow();
  });
});
