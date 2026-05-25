import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * CommissioningService — read-only helper over `commissioning_snapshots`.
 *
 * F4 models the snapshot as the immutable per-job freeze of effective
 * thresholds, sensor mappings, engineering envelope, and rule versions
 * (ADR-005, F4 §F). The F1 implementation owned the entire "freeze the
 * photo" write workflow: it created `Job + CommissioningSnapshot +
 * JobSensorSnapshot[]` rows atomically, populated the `unit`/`unitClass`
 * scalars on each sensor row, and ran service-layer immutability guards
 * (`assertSnapshotMutable`, `assertJobMutable`).
 *
 * F4 collapsed `JobSensorSnapshot` into JSONB inside
 * `commissioning_snapshots.sensor_mappings`, and enforces immutability via
 * the `immutable = TRUE` CHECK constraint plus a future trigger / GRANT
 * hardening pass. F4.4E therefore retires the F1 write surface and keeps
 * this service alive only as a read-only helper — same posture as
 * F4.4A → F4.4D for their respective domains. Write flows (commission a
 * job, deprecate / replace a snapshot) will be reintroduced in a later
 * phase behind a guarded service that writes an `audit_logs` row on every
 * mutation.
 *
 * The reduced surface is intentionally small (two methods) and is consumed
 * only by `JobsService.findById` indirectly through Prisma's
 * `include: { commissioningSnapshot: true }`. No new routes are wired in
 * F4.4E; F4.5 may surface a `/api/v1/jobs/:jobId/snapshot` endpoint when
 * the UI starts consuming the commissioning data.
 */
@Injectable()
export class CommissioningService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the immutable commissioning snapshot identified by UUID, or 404. */
  async findById(id: string) {
    const snapshot = await this.prisma.commissioningSnapshot.findUnique({ where: { id } });
    if (!snapshot) {
      throw new NotFoundException(`Commissioning snapshot '${id}' not found.`);
    }
    return snapshot;
  }

  /**
   * Returns the most recently taken commissioning snapshot for a given job,
   * or `null` if the job has none. Each snapshot is immutable by architecture;
   * callers must never mutate the returned object.
   */
  findLatestByJobId(jobId: string) {
    return this.prisma.commissioningSnapshot.findFirst({
      where: { jobId },
      orderBy: { takenAt: 'desc' },
    });
  }
}
