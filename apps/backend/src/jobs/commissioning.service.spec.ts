import { ConflictException, NotFoundException } from '@nestjs/common';
import { JobStatus, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type PrismaService } from '../prisma/prisma.service';

import { CommissioningService } from './commissioning.service';

/**
 * F1.4 — service-layer immutability tests.
 *
 * Exercises ADR-003/004's "freeze the photo per job" rule + domain-model §26's
 * "what must never be mutable" list. The DB-level Postgres triggers land in
 * F1.5; F1 enforces these guards at the service boundary and these tests pin
 * the behaviour.
 *
 * Test data is suffixed with a per-run id so the tests don't clash with the
 * seed or with parallel runs. Everything created here is cleaned up in
 * afterAll; no fixtures linger in the dev DB.
 */

const TEST_RUN_ID = `imm-${Math.random().toString(36).slice(2, 8)}`;
const codePrefix = `JOB-TEST-${TEST_RUN_ID}`;

describe('CommissioningService (F1.4 immutability)', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const service = new CommissioningService(prisma);

  // Seed fixtures we rely on existing.
  let tenantId: string;
  let wellId: string;
  let equipmentUnitId: string;
  const createdJobCodes: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    const tenant = await prisma.tenant.findUnique({ where: { code: 'repsol' } });
    if (!tenant) {
      throw new Error('Run `pnpm prisma:seed` before this suite — tenant repsol missing.');
    }
    const well = await prisma.well.findUnique({
      where: { tenantId_code: { tenantId: tenant.id, code: 'CN-014' } },
    });
    const unit = await prisma.equipmentUnit.findUnique({ where: { code: 'EMMAD-01' } });
    if (!well || !unit) {
      throw new Error(
        'Test prerequisites missing. Run `pnpm prisma:seed` before the immutability suite.',
      );
    }
    tenantId = tenant.id;
    wellId = well.id;
    equipmentUnitId = unit.id;
  });

  afterAll(async () => {
    if (createdJobCodes.length > 0) {
      const jobs = await prisma.job.findMany({
        where: { code: { in: createdJobCodes } },
        include: { snapshot: true },
      });
      for (const job of jobs) {
        if (job.snapshot) {
          await prisma.jobSensorSnapshot.deleteMany({ where: { snapshotId: job.snapshot.id } });
          await prisma.commissioningSnapshot.delete({ where: { id: job.snapshot.id } });
        }
        await prisma.alarmRule.deleteMany({ where: { jobId: job.id } });
        await prisma.operationalEvent.deleteMany({ where: { jobId: job.id } });
        await prisma.job.delete({ where: { id: job.id } });
      }
    }
    await prisma.$disconnect();
  });

  it('createJobWithSnapshot creates job + snapshot + sensor snapshots in one transaction', async () => {
    const code = `${codePrefix}-A`;
    createdJobCodes.push(code);

    const result = await service.createJobWithSnapshot({
      code,
      tenantId,
      wellId,
      equipmentUnitId,
      startedAt: new Date(),
    });

    expect(result.job.code).toBe(code);
    expect(result.job.status).toBe(JobStatus.in_progress);
    expect(result.snapshot.jobId).toBe(result.job.id);
    expect(result.snapshot.frozenAt).toBeInstanceOf(Date);
    expect(result.sensorSnapshots.length).toBeGreaterThanOrEqual(4);
    for (const snap of result.sensorSnapshots) {
      expect(snap.canonicalTagName).toMatch(/^[a-z_]+$/);
      expect(snap.unit).toBeTruthy();
    }
  });

  it('createJobWithSnapshot refuses when the equipment unit is not found', async () => {
    await expect(
      service.createJobWithSnapshot({
        code: `${codePrefix}-NF`,
        tenantId,
        wellId,
        equipmentUnitId: 'does-not-exist',
        startedAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assertSnapshotMutable throws once the snapshot is frozen', async () => {
    const code = `${codePrefix}-FROZEN`;
    createdJobCodes.push(code);
    const { job } = await service.createJobWithSnapshot({
      code,
      tenantId,
      wellId,
      equipmentUnitId,
      startedAt: new Date(),
    });

    await expect(service.assertSnapshotMutable(job.id)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.assertSnapshotMutable(job.id)).rejects.toThrow(
      /Commissioning snapshot for job .* is frozen/,
    );
  });

  it('assertJobMutable throws once the job is closed', async () => {
    const code = `${codePrefix}-CLOSED`;
    createdJobCodes.push(code);
    const { job } = await service.createJobWithSnapshot({
      code,
      tenantId,
      wellId,
      equipmentUnitId,
      startedAt: new Date(),
    });

    // Close the job (raw write — simulates the future "close" service method).
    await prisma.job.update({
      where: { id: job.id },
      data: { status: JobStatus.closed, closedAt: new Date() },
    });

    await expect(service.assertJobMutable(job.id)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.assertJobMutable(job.id)).rejects.toThrow(/is closed/);
  });

  it('snapshot rows preserve the canonical tag name as a literal copy (not FK)', async () => {
    const code = `${codePrefix}-COPY`;
    createdJobCodes.push(code);
    const { sensorSnapshots } = await service.createJobWithSnapshot({
      code,
      tenantId,
      wellId,
      equipmentUnitId,
      startedAt: new Date(),
    });

    // The literal copy means we can still resolve the row even if the
    // canonical tag were renamed in the catalog — we don't perform the
    // rename here (it'd corrupt the dev DB), but we verify the column type
    // is a plain string and the value is the expected tag name.
    for (const snap of sensorSnapshots) {
      expect(typeof snap.canonicalTagName).toBe('string');
      expect(snap.canonicalTagName.length).toBeGreaterThan(0);
    }
    const names = new Set(sensorSnapshots.map((s) => s.canonicalTagName));
    expect(names.has('p_inlet')).toBe(true);
    expect(names.has('water_cut')).toBe(true);
  });
});
