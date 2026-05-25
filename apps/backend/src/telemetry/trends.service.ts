import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CanonicalTagResolver } from './canonical-tag-resolver';

import type { TrendsQuery, TrendsResponse } from './contracts/trends';
import type { CallerContext } from '../common/caller-context';

/**
 * TrendsService — F4.4F.
 *
 * Read-only range scan against `telemetry_readings`. F1's hypertable +
 * continuous-aggregate routing (`telemetry_1m / 15m / 1h` views) is retired;
 * F4 stores telemetry in a plain PostgreSQL table and indexes the access
 * paths called out in F4 §F. F4.6 will decide whether to reintroduce a
 * materialized view / projection for higher-throughput bucketed reads.
 *
 * F4.4F intentionally returns raw rows in their stored engineering unit (no
 * conversion at read time). Per F4 §F: every reading carries
 * `engineering_unit` so consumers can render exactly what the device sent.
 * Conversion to a canonical unit, when needed, belongs to the caller or to
 * a later F4 phase that owns presentation-layer concerns.
 *
 * Tenant scoping seam: identical posture to F4.4A → F4.4E — when
 * `ctx.tenantId` is set, the query filters by tenant; otherwise reads are
 * cross-tenant (the F1 SystemContext default).
 */
@Injectable()
export class TrendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: CanonicalTagResolver,
  ) {}

  async query(ctx: CallerContext, input: TrendsQuery): Promise<TrendsResponse> {
    const tag = await this.resolver.resolve({
      id: input.canonicalTagId,
      name: input.canonicalTagName,
    });

    const rows = await this.prisma.telemetryReading.findMany({
      where: {
        ...(ctx.tenantId ? { tenantId: ctx.tenantId } : {}),
        unitId: input.unitId,
        canonicalTagId: tag.id,
        timestamp: { gte: input.from, lt: input.to },
        ...(input.jobId ? { jobId: input.jobId } : {}),
        ...(input.quality ? { quality: input.quality } : {}),
        ...(input.source ? { source: input.source } : {}),
      },
      select: {
        timestamp: true,
        value: true,
        engineeringUnit: true,
        quality: true,
        source: true,
      },
      orderBy: { timestamp: 'asc' },
      take: input.limit,
    });

    return {
      unitId: input.unitId,
      canonicalTag: {
        id: tag.id,
        name: tag.name,
        displayName: tag.displayName,
        canonicalUnit: tag.canonicalUnit,
        category: tag.category,
        precision: tag.precision,
      },
      range: { from: input.from, to: input.to },
      points: rows,
    };
  }
}
