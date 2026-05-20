import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import type { CallerContext } from '../common/caller-context';
import type { Well } from '@prisma/client';

interface FindAllFilter {
  tenantCode?: string;
}

/**
 * WellsService — tenant-scoped (domain-model §6). Well codes are unique
 * per tenant (the same physical "CN-014" may exist in multiple tenants, but
 * never twice in one).
 */
@Injectable()
export class WellsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(ctx: CallerContext, filter: FindAllFilter = {}): Promise<Well[]> {
    const tenantId = await this.resolveTenantId(ctx, filter.tenantCode);
    return this.prisma.well.findMany({
      where: tenantId ? { tenantId } : {},
      include: { tenant: { select: { code: true, name: true } } },
      orderBy: [{ tenantId: 'asc' }, { code: 'asc' }],
    });
  }

  async findByCode(ctx: CallerContext, tenantCode: string, code: string): Promise<Well> {
    const tenant = await this.prisma.tenant.findUnique({ where: { code: tenantCode } });
    if (!tenant || (ctx.tenantId && tenant.id !== ctx.tenantId)) {
      throw new NotFoundException(`Well '${tenantCode}/${code}' not found.`);
    }
    const well = await this.prisma.well.findUnique({
      where: { tenantId_code: { tenantId: tenant.id, code } },
      include: { tenant: { select: { code: true, name: true } } },
    });
    if (!well) {
      throw new NotFoundException(`Well '${tenantCode}/${code}' not found.`);
    }
    return well;
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
