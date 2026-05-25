import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import type { CallerContext } from '../common/caller-context';

interface FindAllFilter {
  /** Optional manual tenant filter (UUID). Honored only when CallerContext has no derived tenantId. */
  tenantId?: string;
  /** Optional equality filter on `wells.field_or_site`. */
  fieldOrSite?: string;
  /** Optional equality filter on `wells.type`. */
  type?: string;
  /** Optional equality filter on `wells.fluid`. */
  fluid?: string;
}

/**
 * WellsService — tenant-scoped (F4 §F Well / Modelo de Dominio).
 *
 * F4 dropped the soft `code` identifier and the per-tenant `(tenant_id, code)`
 * uniqueness; the only stable identifier is the UUID primary key. The
 * `CallerContext.tenantId` scoping seam is preserved verbatim from F4.4A so
 * the same shape works the moment authentication lands. When no derived
 * tenant scope exists, callers may pass `?tenantId=<uuid>` to narrow the
 * listing manually.
 */
@Injectable()
export class WellsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(ctx: CallerContext, filter: FindAllFilter = {}) {
    const tenantId = ctx.tenantId ?? filter.tenantId;
    return this.prisma.well.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(filter.fieldOrSite ? { fieldOrSite: filter.fieldOrSite } : {}),
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.fluid ? { fluid: filter.fluid } : {}),
      },
      include: { tenant: { select: { id: true, name: true, status: true } } },
      orderBy: [{ tenantId: 'asc' }, { name: 'asc' }],
    });
  }

  async findById(ctx: CallerContext, id: string) {
    const well = await this.prisma.well.findUnique({
      where: { id },
      include: { tenant: { select: { id: true, name: true, status: true } } },
    });
    if (!well || (ctx.tenantId && well.tenantId !== ctx.tenantId)) {
      throw new NotFoundException(`Well '${id}' not found.`);
    }
    return well;
  }
}
