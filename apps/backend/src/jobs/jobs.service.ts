import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import type { CallerContext } from '../common/caller-context';

/**
 * Allowed values for `jobs.status` — mirrors the CHECK constraint declared
 * in `apps/backend/prisma/migrations/20260524000000_f4_2_baseline/migration.sql`
 * (CHECK `(status IN ('programmed', 'in_progress', 'closed'))`). Prisma does
 * not model CHECK constraints, so this is the application-side mirror used
 * for query-filter validation.
 */
export const JOB_STATUSES = ['programmed', 'in_progress', 'closed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

interface FindAllFilter {
  /** Optional manual tenant filter (UUID). Honored only when CallerContext has no derived tenantId. */
  tenantId?: string;
  /** Optional well filter (UUID). */
  wellId?: string;
  /** Optional measurement-unit filter (UUID). */
  unitId?: string;
  /** Optional CHECK-constrained status filter. */
  status?: JobStatus;
}

/**
 * List include — small per-row summary so the list endpoint stays compact.
 * Keys mirror the F4 Prisma relation names on `Job`.
 */
const JOB_LIST_INCLUDE = {
  tenant: { select: { id: true, name: true, status: true } },
  well: { select: { id: true, name: true, fieldOrSite: true } },
  unit: { select: { id: true, code: true, name: true } },
} as const;

/**
 * Detail include — projects the operation spine: tenant + well + unit (+
 * its equipment type) + engineer placeholder + the current commissioning
 * snapshot (via the `JobCurrentSnapshot` relation, which follows
 * `jobs.commissioning_snapshot_id`).
 *
 * Intentionally NOT included: telemetry_readings, alarm_events, alarm_rules,
 * additional historical commissioning snapshots, integration_mappings.
 * F4.4F (telemetry reads) and F4.6 (telemetry persistence) own those reads.
 */
const JOB_DETAIL_INCLUDE = {
  tenant: { select: { id: true, name: true, status: true } },
  well: {
    select: {
      id: true,
      name: true,
      fieldOrSite: true,
      location: true,
      type: true,
      fluid: true,
      designLimits: true,
    },
  },
  unit: {
    select: {
      id: true,
      code: true,
      name: true,
      serialNumber: true,
      status: true,
      operatingProfile: true,
      location: true,
      equipmentType: { select: { id: true, name: true, pidReference: true } },
    },
  },
  engineer: { select: { id: true, displayName: true, role: true } },
  commissioningSnapshot: true,
} as const;

/**
 * JobsService — read access to the operation spine (F4 §F Job; ADR-005).
 *
 * Read-only in F4.4E. The CallerContext.tenantId scoping seam is preserved
 * verbatim from F4.4A / F4.4B / F4.4D so the filter constrains a logged-in
 * caller once authentication lands. Write flows (create job, close job,
 * commissioning workflow) are intentionally out of scope; F4 closes the
 * commissioning loop via the `commissioning_snapshots.immutable = TRUE`
 * CHECK constraint plus a future trigger / GRANT hardening pass — neither
 * of which this read-only service touches.
 *
 * F4 dropped F1's job slug (`JOB-YYYY-NNNN`); UUID is the only identifier.
 * F4 collapsed F1's `JobSensorSnapshot` rows into JSONB inside
 * `commissioning_snapshots.sensor_mappings`. The detail include exposes the
 * snapshot row directly so consumers can read those JSONB fields without an
 * extra join.
 */
@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(ctx: CallerContext, filter: FindAllFilter = {}) {
    const tenantId = ctx.tenantId ?? filter.tenantId;
    return this.prisma.job.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(filter.wellId ? { wellId: filter.wellId } : {}),
        ...(filter.unitId ? { unitId: filter.unitId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      include: JOB_LIST_INCLUDE,
      // Most-recently-started jobs first; jobs with `started_at IS NULL`
      // (i.e. status='programmed', not yet started) fall to the bottom of the
      // started-jobs band, then `createdAt desc` orders any still tied.
      // Prisma 5 supports `{ sort, nulls }` on nullable scalar fields.
      orderBy: [{ startedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
  }

  async findById(ctx: CallerContext, id: string) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: JOB_DETAIL_INCLUDE,
    });
    if (!job || (ctx.tenantId && job.tenantId !== ctx.tenantId)) {
      throw new NotFoundException(`Job '${id}' not found.`);
    }
    return job;
  }
}
