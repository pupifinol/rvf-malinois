import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import {
  type AbortWellTestInput,
  type CloseWellTestInput,
  type CreateWellTestInput,
  type TransitionWellTestInput,
  type WellTestActiveResponse,
  type WellTestDetail,
  type WellTestLifecycleStatus,
  type WellTestRow,
  type WellTestsListQuery,
  type WellTestsListResponse,
  WELL_TEST_ACTIVE_STATUSES,
  deriveActualOfficialDurationSeconds,
} from './contracts/well-tests';

import type { CallerContext } from '../common/caller-context';

/**
 * WellTestsService — F4.7.1.
 *
 * Read + write surface for `well_tests`. First (and only) backend collaborator
 * authorized to touch `prisma.wellTest.*`. Never reads `telemetry_readings`,
 * `live_readings`, `alarm_events`; never emits realtime envelopes; never
 * generates PDFs.
 *
 * Tenant scoping seam matches F4.4F / F4.6F.1 / F4.6C.2.1 / F4.6D.2.1: when
 * `ctx.tenantId` is set, the `where` clauses carry it; otherwise reads /
 * writes are cross-tenant (the F1 `SystemContext` default). A future ADR-009 /
 * auth phase will derive the context from the validated session.
 *
 * All lifecycle transitions take the server-side `Date.now()` as the
 * canonical timestamp. The wire request never carries a client-supplied
 * transition timestamp; clock-skew protection is implicit (F4.7-0 §7.3).
 *
 * The "no overlapping active tests per unit" rule is enforced **service-side**
 * (not via DB partial unique index) per F4.7-0 §1 / §15.3. A `connect`
 * transition that would create a second row in `connected / stabilizing /
 * measuring` for the same unit returns `409 Conflict`.
 */
@Injectable()
export class WellTestsService {
  constructor(private readonly prisma: PrismaService) {}

  // ===========================================================================
  // Read
  // ===========================================================================

  async list(ctx: CallerContext, input: WellTestsListQuery): Promise<WellTestsListResponse> {
    const generatedAt = new Date();
    const officialWindow =
      input.from !== undefined && input.to !== undefined
        ? { gte: input.from, lt: input.to }
        : undefined;

    const rows = await this.prisma.wellTest.findMany({
      where: {
        ...(ctx.tenantId ? { tenantId: ctx.tenantId } : {}),
        ...(input.unitId ? { unitId: input.unitId } : {}),
        ...(input.wellId ? { wellId: input.wellId } : {}),
        ...(input.jobId ? { jobId: input.jobId } : {}),
        ...(input.lifecycleStatus ? { lifecycleStatus: input.lifecycleStatus } : {}),
        ...(input.testType ? { testType: input.testType } : {}),
        ...(officialWindow ? { officialStartedAt: officialWindow } : {}),
      },
      select: WELL_TEST_SELECT,
      orderBy: { createdAt: 'desc' },
      take: input.limit,
    });

    return {
      generatedAt,
      source: 'well_tests',
      wellTests: rows.map(rowToWire),
    };
  }

  async getById(ctx: CallerContext, id: string): Promise<WellTestDetail> {
    const row = await this.prisma.wellTest.findUnique({
      where: { id },
      select: WELL_TEST_DETAIL_SELECT,
    });
    if (!row || (ctx.tenantId && row.tenantId !== ctx.tenantId)) {
      throw new NotFoundException(`Well test '${id}' not found.`);
    }
    return detailRowToWire(row);
  }

  async getActive(ctx: CallerContext, unitId: string): Promise<WellTestActiveResponse> {
    const generatedAt = new Date();
    const row = await this.prisma.wellTest.findFirst({
      where: {
        ...(ctx.tenantId ? { tenantId: ctx.tenantId } : {}),
        unitId,
        lifecycleStatus: { in: [...WELL_TEST_ACTIVE_STATUSES] },
      },
      select: WELL_TEST_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return {
      generatedAt,
      source: 'well_tests',
      active: row ? rowToWire(row) : null,
    };
  }

  // ===========================================================================
  // Create
  // ===========================================================================

  async create(ctx: CallerContext, input: CreateWellTestInput): Promise<WellTestDetail> {
    // Resolve tenantId honestly from the existing Job (we never trust a wire
    // tenantId — the request schema does not allow it). When the caller is
    // tenant-scoped we additionally validate that the referenced Job belongs
    // to the same tenant.
    const job = await this.prisma.job.findUnique({
      where: { id: input.jobId },
      select: { id: true, tenantId: true, wellId: true, unitId: true },
    });
    if (!job || (ctx.tenantId && job.tenantId !== ctx.tenantId)) {
      throw new NotFoundException(`Job '${input.jobId}' not found.`);
    }
    if (job.wellId !== input.wellId || job.unitId !== input.unitId) {
      throw new BadRequestException(
        '`wellId` and `unitId` must match the referenced Job (`jobs.well_id` / `jobs.unit_id`).',
      );
    }

    const created = await this.prisma.wellTest.create({
      data: {
        tenantId: job.tenantId,
        jobId: input.jobId,
        wellId: input.wellId,
        unitId: input.unitId,
        testType: input.testType,
        reportType: input.reportType,
        plannedOfficialDurationHours: input.plannedOfficialDurationHours,
        lifecycleStatus: 'scheduled',
        ...(input.notes ? { notes: input.notes } : {}),
        ...(input.clientReference ? { clientReference: input.clientReference } : {}),
      },
      select: WELL_TEST_DETAIL_SELECT,
    });

    return detailRowToWire(created);
  }

  // ===========================================================================
  // Transitions
  // ===========================================================================

  async connect(
    ctx: CallerContext,
    id: string,
    body: TransitionWellTestInput,
  ): Promise<WellTestDetail> {
    const row = await this.loadForTransition(ctx, id);
    this.assertTransition(row.lifecycleStatus, 'connected', ['scheduled']);
    await this.assertNoOtherActiveTestForUnit(row.tenantId, row.unitId, id);
    const now = new Date();
    return this.applyUpdate(id, {
      lifecycleStatus: 'connected',
      connectedAt: now,
      ...(body.notes ? { notes: body.notes } : {}),
    });
  }

  async startStabilization(
    ctx: CallerContext,
    id: string,
    body: TransitionWellTestInput,
  ): Promise<WellTestDetail> {
    const row = await this.loadForTransition(ctx, id);
    this.assertTransition(row.lifecycleStatus, 'stabilizing', ['connected']);
    const now = new Date();
    return this.applyUpdate(id, {
      lifecycleStatus: 'stabilizing',
      stabilizationStartedAt: now,
      ...(body.notes ? { notes: body.notes } : {}),
    });
  }

  async startOfficial(
    ctx: CallerContext,
    id: string,
    body: TransitionWellTestInput,
  ): Promise<WellTestDetail> {
    const row = await this.loadForTransition(ctx, id);
    this.assertTransition(row.lifecycleStatus, 'measuring', ['stabilizing']);
    const now = new Date();
    if (row.stabilizationStartedAt && now < row.stabilizationStartedAt) {
      throw new BadRequestException(
        '`officialStartedAt` (server now) is earlier than `stabilizationStartedAt`; clock skew is rejected.',
      );
    }
    // Implicit rule: `stabilizationEndedAt = officialStartedAt`.
    return this.applyUpdate(id, {
      lifecycleStatus: 'measuring',
      officialStartedAt: now,
      stabilizationEndedAt: now,
      ...(body.notes ? { notes: body.notes } : {}),
    });
  }

  async endOfficial(
    ctx: CallerContext,
    id: string,
    body: TransitionWellTestInput,
  ): Promise<WellTestDetail> {
    const row = await this.loadForTransition(ctx, id);
    this.assertTransition(row.lifecycleStatus, 'completed', ['measuring']);
    const now = new Date();
    if (row.officialStartedAt && now < row.officialStartedAt) {
      throw new BadRequestException(
        '`officialEndedAt` (server now) is earlier than `officialStartedAt`; clock skew is rejected.',
      );
    }
    return this.applyUpdate(id, {
      lifecycleStatus: 'completed',
      officialEndedAt: now,
      ...(body.notes ? { notes: body.notes } : {}),
    });
  }

  async abort(ctx: CallerContext, id: string, body: AbortWellTestInput): Promise<WellTestDetail> {
    const row = await this.loadForTransition(ctx, id);
    this.assertTransition(row.lifecycleStatus, 'aborted', [
      'scheduled',
      'connected',
      'stabilizing',
      'measuring',
    ]);
    const now = new Date();
    return this.applyUpdate(id, {
      lifecycleStatus: 'aborted',
      abortedAt: now,
      abortReason: body.abortReason,
      ...(body.notes ? { notes: body.notes } : {}),
    });
  }

  async close(ctx: CallerContext, id: string, body: CloseWellTestInput): Promise<WellTestDetail> {
    const row = await this.loadForTransition(ctx, id);
    this.assertTransition(row.lifecycleStatus, 'closed', ['completed']);
    const now = new Date();
    return this.applyUpdate(id, {
      lifecycleStatus: 'closed',
      disconnectedAt: now,
      ...(body.reportGeneratedAt ? { reportGeneratedAt: body.reportGeneratedAt } : {}),
      ...(body.notes ? { notes: body.notes } : {}),
    });
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private async loadForTransition(ctx: CallerContext, id: string) {
    const row = await this.prisma.wellTest.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        unitId: true,
        lifecycleStatus: true,
        stabilizationStartedAt: true,
        officialStartedAt: true,
      },
    });
    if (!row || (ctx.tenantId && row.tenantId !== ctx.tenantId)) {
      throw new NotFoundException(`Well test '${id}' not found.`);
    }
    return row;
  }

  private assertTransition(
    current: string,
    next: WellTestLifecycleStatus,
    allowedFrom: readonly WellTestLifecycleStatus[],
  ): void {
    if (!allowedFrom.includes(current as WellTestLifecycleStatus)) {
      throw new ConflictException(
        `Cannot transition well test from '${current}' to '${next}'; allowed prior states: ` +
          `${allowedFrom.join(', ')}.`,
      );
    }
  }

  /**
   * No-overlap-per-unit guard. F4.7-0 §15.3: when a unit already has a
   * `connected | stabilizing | measuring` test row, a second `connect`
   * transition is rejected as `409 Conflict`. The guard runs only for the
   * `connect` step because that is the entry into the active band; later
   * transitions stay within the same row.
   */
  private async assertNoOtherActiveTestForUnit(
    tenantId: string,
    unitId: string,
    selfId: string,
  ): Promise<void> {
    const existing = await this.prisma.wellTest.findFirst({
      where: {
        tenantId,
        unitId,
        lifecycleStatus: { in: [...WELL_TEST_ACTIVE_STATUSES] },
        id: { not: selfId },
      },
      select: { id: true, lifecycleStatus: true },
    });
    if (existing) {
      throw new ConflictException(
        `Unit '${unitId}' already has an active well test '${existing.id}' in status ` +
          `'${existing.lifecycleStatus}'. Complete or abort it before starting a new one.`,
      );
    }
  }

  private async applyUpdate(id: string, data: Record<string, unknown>): Promise<WellTestDetail> {
    const updated = await this.prisma.wellTest.update({
      where: { id },
      data,
      select: WELL_TEST_DETAIL_SELECT,
    });
    return detailRowToWire(updated);
  }
}

// ===========================================================================
// Select shapes — colocated with the service so the response derivation has
// a single source of truth.
// ===========================================================================

const WELL_TEST_SELECT = {
  id: true,
  tenantId: true,
  jobId: true,
  wellId: true,
  unitId: true,
  testType: true,
  reportType: true,
  lifecycleStatus: true,
  plannedOfficialDurationHours: true,
  connectedAt: true,
  stabilizationStartedAt: true,
  stabilizationEndedAt: true,
  officialStartedAt: true,
  officialEndedAt: true,
  disconnectedAt: true,
  reportGeneratedAt: true,
  abortedAt: true,
  abortReason: true,
  notes: true,
  clientReference: true,
  createdAt: true,
  updatedAt: true,
} as const;

const WELL_TEST_DETAIL_SELECT = {
  ...WELL_TEST_SELECT,
  job: { select: { id: true, status: true, startedAt: true, closedAt: true } },
  well: { select: { id: true, name: true, fieldOrSite: true } },
  unit: { select: { id: true, code: true, name: true } },
} as const;

interface WellTestSelectRow {
  id: string;
  tenantId: string;
  jobId: string;
  wellId: string;
  unitId: string;
  testType: string;
  reportType: string;
  lifecycleStatus: string;
  plannedOfficialDurationHours: number;
  connectedAt: Date | null;
  stabilizationStartedAt: Date | null;
  stabilizationEndedAt: Date | null;
  officialStartedAt: Date | null;
  officialEndedAt: Date | null;
  disconnectedAt: Date | null;
  reportGeneratedAt: Date | null;
  abortedAt: Date | null;
  abortReason: string | null;
  notes: string | null;
  clientReference: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface WellTestDetailSelectRow extends WellTestSelectRow {
  job: { id: string; status: string; startedAt: Date | null; closedAt: Date | null };
  well: { id: string; name: string; fieldOrSite: string | null };
  unit: { id: string; code: string; name: string };
}

const rowToWire = (row: WellTestSelectRow): WellTestRow => ({
  id: row.id,
  jobId: row.jobId,
  wellId: row.wellId,
  unitId: row.unitId,
  testType: row.testType as WellTestRow['testType'],
  reportType: row.reportType as WellTestRow['reportType'],
  lifecycleStatus: row.lifecycleStatus as WellTestRow['lifecycleStatus'],
  plannedOfficialDurationHours: row.plannedOfficialDurationHours,
  actualOfficialDurationSeconds: deriveActualOfficialDurationSeconds(
    row.officialStartedAt,
    row.officialEndedAt,
  ),
  connectedAt: row.connectedAt,
  stabilizationStartedAt: row.stabilizationStartedAt,
  stabilizationEndedAt: row.stabilizationEndedAt,
  officialStartedAt: row.officialStartedAt,
  officialEndedAt: row.officialEndedAt,
  disconnectedAt: row.disconnectedAt,
  reportGeneratedAt: row.reportGeneratedAt,
  abortedAt: row.abortedAt,
  abortReason: row.abortReason,
  notes: row.notes,
  clientReference: row.clientReference,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const detailRowToWire = (row: WellTestDetailSelectRow): WellTestDetail => ({
  ...rowToWire(row),
  job: {
    id: row.job.id,
    status: row.job.status,
    startedAt: row.job.startedAt,
    closedAt: row.job.closedAt,
  },
  well: row.well,
  unit: row.unit,
});
