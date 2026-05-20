import { NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SystemContext } from '../common/caller-context';
import { type PrismaService } from '../prisma/prisma.service';

import { JobsService } from './jobs.service';

/**
 * Tenant scoping seam — when ctx.tenantId is provided, services filter
 * results to that tenant (F1.5/auth wires this from the validated session).
 * F1 controllers always pass SystemContext, so today the endpoints return
 * cross-tenant data; this test pins the *seam* behaviour for the day auth
 * lands.
 */

describe('JobsService (F1.4 tenant scoping seam)', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const service = new JobsService(prisma);

  let repsolId: string;
  let rvfInternalId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const repsol = await prisma.tenant.findUnique({ where: { code: 'repsol' } });
    const rvf = await prisma.tenant.findUnique({ where: { code: 'rvf-internal' } });
    if (!repsol || !rvf) {
      throw new Error('Run `pnpm prisma:seed` before this suite.');
    }
    repsolId = repsol.id;
    rvfInternalId = rvf.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("findAll with SystemContext returns every tenant's jobs", async () => {
    const jobs = await service.findAll(SystemContext);
    expect(Array.isArray(jobs)).toBe(true);
    // Seed job is JOB-2026-0001 under repsol; cross-tenant listing must include it.
    expect(jobs.some((j) => j.code === 'JOB-2026-0001')).toBe(true);
  });

  it('findAll with ctx.tenantId filters to that tenant', async () => {
    const scoped = await service.findAll({ tenantId: repsolId });
    expect(scoped.every((j) => j.tenantId === repsolId)).toBe(true);

    const other = await service.findAll({ tenantId: rvfInternalId });
    expect(other.every((j) => j.tenantId === rvfInternalId)).toBe(true);
  });

  it('findByCode refuses cross-tenant access when ctx.tenantId is set', async () => {
    // The seed job lives under repsol; asking for it as rvf-internal must 404.
    await expect(
      service.findByCode({ tenantId: rvfInternalId }, 'JOB-2026-0001'),
    ).rejects.toBeInstanceOf(NotFoundException);

    // Same call with SystemContext succeeds.
    const job = await service.findByCode(SystemContext, 'JOB-2026-0001');
    expect(job.code).toBe('JOB-2026-0001');
  });
});
