import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  type CommissioningSnapshot,
  type Job,
  type JobSensorSnapshot,
  JobStatus,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface CreateJobWithSnapshotInput {
  code: string;
  tenantId: string;
  wellId: string;
  equipmentUnitId: string;
  startedAt: Date;
  notes?: string;
  /** Optional per-canonical-tag alarm envelope overlay; merged onto the sensor snapshot rows. */
  alarmLimits?: Record<string, { lo_lo?: number; lo?: number; hi?: number; hi_hi?: number }>;
  /** User id (caller). F1 has no auth; F1.5 fills this in. */
  commissionedById?: string;
}

/**
 * CommissioningService — owns the "freeze the photo" workflow (ADR-003/004).
 *
 * The two operations on this service are the immutability seams F1.4 tests
 * exercise:
 *
 *   1. createJobWithSnapshot — atomically creates a Job + CommissioningSnapshot
 *      + one JobSensorSnapshot row per sensor on the chosen EquipmentUnit, all
 *      in a single Prisma transaction. A Job CANNOT exist without its snapshot.
 *
 *   2. assertSnapshotMutable / assertJobMutable — service-layer guards.
 *      Refuse the write if the snapshot is frozen or the job is closed.
 *      F1.5 will harden these with Postgres triggers.
 */
@Injectable()
export class CommissioningService {
  private readonly logger = new Logger(CommissioningService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Create — same-transaction job + snapshot + sensor snapshots
  // ---------------------------------------------------------------------------

  async createJobWithSnapshot(input: CreateJobWithSnapshotInput): Promise<{
    job: Job;
    snapshot: CommissioningSnapshot;
    sensorSnapshots: JobSensorSnapshot[];
  }> {
    const unit = await this.prisma.equipmentUnit.findUnique({
      where: { id: input.equipmentUnitId },
      include: { sensors: { orderBy: { instrumentTag: 'asc' } } },
    });
    if (!unit) {
      throw new NotFoundException(`Equipment unit ${input.equipmentUnitId} not found.`);
    }
    if (unit.sensors.length === 0) {
      throw new ConflictException(
        `Equipment unit ${unit.code} has no sensors — cannot commission an empty unit.`,
      );
    }

    const canonicalTags = await this.prisma.canonicalTag.findMany({
      where: { name: { in: unit.sensors.map((s) => s.canonicalTagName) } },
    });
    const tagByName = new Map(canonicalTags.map((t) => [t.name, t]));

    for (const s of unit.sensors) {
      if (!tagByName.has(s.canonicalTagName)) {
        throw new ConflictException(
          `Sensor ${s.instrumentTag} references unknown canonical tag '${s.canonicalTagName}'.`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const job = await tx.job.create({
        data: {
          code: input.code,
          tenantId: input.tenantId,
          wellId: input.wellId,
          equipmentUnitId: input.equipmentUnitId,
          startedAt: input.startedAt,
          status: JobStatus.in_progress,
          notes: input.notes,
        },
      });

      const snapshot = await tx.commissioningSnapshot.create({
        data: {
          jobId: job.id,
          frozenAt: new Date(),
          commissionedById: input.commissionedById,
        },
      });

      const sensorSnapshots: JobSensorSnapshot[] = [];
      for (const sensor of unit.sensors) {
        const tag = tagByName.get(sensor.canonicalTagName);
        if (!tag) {
          // Pre-check above already guaranteed this; keep the guard for
          // defence-in-depth and to keep TypeScript narrowing happy.
          throw new ConflictException(
            `Sensor ${sensor.instrumentTag} references unknown canonical tag '${sensor.canonicalTagName}'.`,
          );
        }
        const row = await tx.jobSensorSnapshot.create({
          data: {
            snapshotId: snapshot.id,
            instrumentTag: sensor.instrumentTag,
            sensorType: sensor.sensorType,
            modbusRegister: sensor.modbusRegister,
            canonicalTagName: sensor.canonicalTagName,
            unit: tag.unit,
            unitClass: tag.unitClass,
            rangeLow: sensor.rangeLow,
            rangeHigh: sensor.rangeHigh,
            sensorSerialNumber: sensor.serialNumber,
            alarmLimits: input.alarmLimits?.[sensor.canonicalTagName] as Prisma.InputJsonValue,
          },
        });
        sensorSnapshots.push(row);
      }

      this.logger.log(
        `Commissioned job ${job.code} (${sensorSnapshots.length} sensor snapshots frozen).`,
      );

      return { job, snapshot, sensorSnapshots };
    });
  }

  // ---------------------------------------------------------------------------
  // Immutability guards — service-layer enforcement.
  // F1.5 adds Postgres triggers; for F1 the guards live here.
  // ---------------------------------------------------------------------------

  /** Throws if the job's snapshot has been frozen. */
  async assertSnapshotMutable(jobId: string): Promise<void> {
    const snapshot = await this.prisma.commissioningSnapshot.findUnique({
      where: { jobId },
      select: { frozenAt: true },
    });
    if (snapshot?.frozenAt) {
      throw new ConflictException(
        `Commissioning snapshot for job ${jobId} is frozen (at ${snapshot.frozenAt.toISOString()}) and cannot be modified. ADR-003/004.`,
      );
    }
  }

  /** Throws if the job is closed. */
  async assertJobMutable(jobId: string): Promise<void> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { closedAt: true, status: true },
    });
    if (job?.closedAt || job?.status === JobStatus.closed) {
      throw new ConflictException(
        `Job ${jobId} is closed and cannot be modified. domain-model §26.`,
      );
    }
  }
}
