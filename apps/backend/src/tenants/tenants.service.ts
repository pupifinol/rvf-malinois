import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import type { CallerContext } from '../common/caller-context';
import type { Tenant } from '@prisma/client';

/**
 * Allowed values for `tenants.status` — mirrors the CHECK constraint declared
 * in `apps/backend/prisma/migrations/20260524000000_f4_2_baseline/migration.sql`
 * (CHECK `(status IN ('active', 'inactive'))`). Prisma does not model CHECK
 * constraints, so this is the application-side mirror used for query filters.
 */
export const TENANT_STATUSES = ['active', 'inactive'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

interface FindAllFilter {
  status?: TenantStatus;
}

/**
 * TenantsService — multi-tenant root (F4 §D Tenant; ADR-002 residency;
 * ADR-007 §1 — RVF Malinois owns this schema as canonical).
 *
 * Read-only in F4.4A. Tenant scoping is plumbed through `CallerContext` so the
 * filter can constrain a logged-in caller to its own tenant once authentication
 * lands; with the current empty `SystemContext` the endpoints serve every
 * tenant — same posture as the F1 implementation. F4 dropped the soft `code`
 * identifier and the `kind` enum; the only stable identifier the API can offer
 * is the UUID primary key, which the controller validates via `ParseUUIDPipe`.
 */
@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(ctx: CallerContext, filter: FindAllFilter = {}): Promise<Tenant[]> {
    return this.prisma.tenant.findMany({
      where: {
        ...(ctx.tenantId ? { id: ctx.tenantId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async findById(ctx: CallerContext, id: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant || (ctx.tenantId && tenant.id !== ctx.tenantId)) {
      throw new NotFoundException(`Tenant '${id}' not found.`);
    }
    return tenant;
  }
}
