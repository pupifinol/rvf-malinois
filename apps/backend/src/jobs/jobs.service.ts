import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import type { CallerContext } from '../common/caller-context';
import type { Job, JobStatus } from '@prisma/client';

interface FindAllFilter {
  tenantCode?: string;
  status?: JobStatus;
}

/**
 * JobsService — read access to the operation spine (domain-model §11).
 *
 * Writes (create/close) belong to the CommissioningService and to the
 * eventual lifecycle service in F1.5+. This service stays read-only on
 * purpose to keep the immutability seam clean.
 */
@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(ctx: CallerContext, filter: FindAllFilter = {}): Promise<Job[]> {
    const tenantId = await this.resolveTenantId(ctx, filter.tenantCode);
    return this.prisma.job.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      include: {
        tenant: { select: { code: true, name: true } },
        well: { select: { code: true, name: true } },
        equipmentUnit: { select: { code: true, serialNumber: true } },
      },
      orderBy: [{ status: 'asc' }, { startedAt: 'desc' }],
    });
  }

  async findByCode(ctx: CallerContext, code: string): Promise<Job> {
    const job = await this.prisma.job.findUnique({
      where: { code },
      include: {
        tenant: { select: { code: true, name: true } },
        well: { select: { code: true, name: true, designLimits: true } },
        equipmentUnit: {
          select: {
            code: true,
            serialNumber: true,
            equipmentType: { select: { code: true, name: true, category: true } },
          },
        },
        snapshot: {
          include: {
            sensorSnapshots: { orderBy: { instrumentTag: 'asc' } },
          },
        },
        alarmRules: true,
      },
    });
    if (!job || (ctx.tenantId && job.tenantId !== ctx.tenantId)) {
      throw new NotFoundException(`Job '${code}' not found.`);
    }
    return job;
  }

  private async resolveTenantId(
    ctx: CallerContext,
    tenantCode?: string,
  ): Promise<string | undefined> {
    if (ctx.tenantId) {
      return ctx.tenantId;
    }
    if (!tenantCode) {
      return undefined;
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { code: tenantCode },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant '${tenantCode}' not found.`);
    }
    return tenant.id;
  }
}
