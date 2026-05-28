import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CanonicalTagResolver } from './canonical-tag-resolver';

import type {
  LatestQuery,
  LatestResponse,
  LatestValueRow,
  TelemetryQuality,
} from './contracts/latest';
import type { CallerContext } from '../common/caller-context';

/**
 * LatestService — F4.6C.2.1.
 *
 * Read-only access to the `live_readings` projection populated by F4.6C.1
 * inside the canonical ingestion transaction. Second backend module
 * authorized to touch `prisma.liveReading.*` after the projection service —
 * **read-only**. Never writes; never reads `telemetry_readings`; never
 * touches the SQL VIEW `live_readings_projection`; never consumes the F4.6E.1
 * Socket.IO state.
 *
 * Tenant scoping seam identical to F4.4F / F4.6F.1: when `ctx.tenantId` is
 * set, the query filters by tenant; otherwise reads are cross-tenant (the
 * F1 `SystemContext` default). A future ADR-009 / auth phase will replace
 * `SystemContext` with a real authenticated context — this service does not
 * need to change at that point.
 *
 * Output stays a **derived view**, not a Prisma row dump:
 *   - `tenantId`, `id`, `createdAt`, `updatedAt`, `status` are stripped.
 *   - `value` keeps the Prisma Decimal shape (JSON-serializes to a string).
 *   - `canonicalTag` is hydrated into the same nested summary the trends API
 *     returns.
 */
@Injectable()
export class LatestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: CanonicalTagResolver,
  ) {}

  async query(ctx: CallerContext, input: LatestQuery): Promise<LatestResponse> {
    const generatedAt = new Date();

    // Resolve the optional canonical-tag identifier up-front. The Zod refine
    // forbids supplying both; the resolver double-checks. When neither is
    // supplied we read every slot for the unit — no resolution needed.
    let canonicalTagId: string | undefined;
    if (input.canonicalTagId !== undefined || input.canonicalTagName !== undefined) {
      const tag = await this.resolver.resolve({
        id: input.canonicalTagId,
        name: input.canonicalTagName,
      });
      canonicalTagId = tag.id;
    }

    const rows = await this.prisma.liveReading.findMany({
      where: {
        ...(ctx.tenantId ? { tenantId: ctx.tenantId } : {}),
        unitId: input.unitId,
        ...(canonicalTagId ? { canonicalTagId } : {}),
      },
      select: {
        sensorId: true,
        value: true,
        engineeringUnit: true,
        quality: true,
        timestamp: true,
        ingestionTimestamp: true,
        source: true,
        latestTelemetryReadingId: true,
        canonicalTag: {
          select: {
            id: true,
            name: true,
            displayName: true,
            canonicalUnit: true,
            category: true,
            precision: true,
          },
        },
      },
      orderBy: { timestamp: 'desc' },
    });

    const values: LatestValueRow[] = rows.map((row) => ({
      sensorId: row.sensorId,
      canonicalTag: row.canonicalTag,
      value: row.value,
      engineeringUnit: row.engineeringUnit,
      // `quality` is stored as a freeform string on the projection; F4.6C.1
      // only writes 'good'. We narrow defensively to the F4.4F union; any
      // future row whose stored value is not in the union falls through to
      // 'good' (the projection's invariant) rather than leaking an unknown
      // string into the typed response.
      quality: narrowQuality(row.quality),
      timestamp: row.timestamp,
      ingestionTimestamp: row.ingestionTimestamp,
      source: row.source,
      latestTelemetryReadingId: row.latestTelemetryReadingId,
    }));

    return {
      unitId: input.unitId,
      generatedAt,
      source: 'live_readings',
      values,
    };
  }
}

const narrowQuality = (raw: string): TelemetryQuality => {
  if (raw === 'good' || raw === 'uncertain' || raw === 'bad') return raw;
  return 'good';
};
