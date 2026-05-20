import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import type { CallerContext } from '../common/caller-context';
import type { Tenant, TenantKind } from '@prisma/client';

interface FindAllFilter {
  kind?: TenantKind;
}

/**
 * TenantsService — multi-tenant root (domain-model §5).
 *
 * F1 read-only. Note the scoping seam: `ctx.tenantId`, when set, restricts
 * the result to a single tenant. Today only the seed runs without auth, so
 * the parameter is plumbed but typically empty.
 */
@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(ctx: CallerContext, filter: FindAllFilter = {}): Promise<Tenant[]> {
    return this.prisma.tenant.findMany({
      where: {
        ...(ctx.tenantId ? { id: ctx.tenantId } : {}),
        ...(filter.kind ? { kind: filter.kind } : {}),
      },
      orderBy: { code: 'asc' },
    });
  }

  async findByCode(ctx: CallerContext, code: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.findUnique({ where: { code } });
    if (!tenant || (ctx.tenantId && tenant.id !== ctx.tenantId)) {
      throw new NotFoundException(`Tenant '${code}' not found.`);
    }
    return tenant;
  }
}
