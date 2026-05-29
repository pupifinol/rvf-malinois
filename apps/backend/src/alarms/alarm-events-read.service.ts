import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CanonicalTagResolver } from '../telemetry/canonical-tag-resolver';

import type {
  AlarmEventRow,
  AlarmEventSeverity,
  AlarmEventState,
  AlarmEventThresholdBand,
  AlarmEventsQuery,
  AlarmEventsResponse,
} from './contracts/events';
import type { CallerContext } from '../common/caller-context';

/**
 * AlarmEventsReadService — F4.6D.2.1.
 *
 * Read-only access to the `alarm_events` table populated by F4.6D.1's
 * `AlarmEvaluationService` inside the canonical ingestion transaction.
 * Second backend module authorized to touch `prisma.alarmEvent.*` after
 * the evaluator service — **read-only**. Never writes; never reads
 * `telemetry_readings` or `live_readings`; never consumes the F4.6E.1
 * Socket.IO state.
 *
 * Tenant scoping seam identical to F4.4F / F4.6F.1 / F4.6C.2.1: when
 * `ctx.tenantId` is set, the query filters by tenant; otherwise reads are
 * cross-tenant (the F1 `SystemContext` default). A future ADR-009 / auth
 * phase will replace `SystemContext` with a real authenticated context —
 * this service does not need to change at that point.
 *
 * Output stays a **derived view**, not a Prisma row dump:
 *   - `tenantId`, `ruleSnapshot`, `createdAt`, `updatedAt`, `jobId` are
 *     stripped (plan §9.3).
 *   - `id` is renamed to `alarmEventId` (matches the F4.6E.1 realtime
 *     envelope's `payload.alarmEventId`, so a panel can dedup REST +
 *     realtime entries by id).
 *   - `canonicalTag` is hydrated into the same nested summary the trends
 *     / latest APIs return.
 *   - `triggeredValue` passes through as a Prisma Decimal (JSON-serializes
 *     to a string).
 *   - `state` / `severity` / `thresholdViolated` are narrowed defensively
 *     against their typed unions; an unknown stored value falls through
 *     to a known default rather than leaking an opaque string into the
 *     typed response (mirrors F4.6C.2.1's `narrowQuality` posture).
 */
@Injectable()
export class AlarmEventsReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: CanonicalTagResolver,
  ) {}

  async query(ctx: CallerContext, input: AlarmEventsQuery): Promise<AlarmEventsResponse> {
    const generatedAt = new Date();

    // Resolve the optional canonical-tag identifier up-front. The Zod refine
    // forbids supplying both; the resolver double-checks. When neither is
    // supplied the canonical-tag filter is omitted (every tag for the unit).
    let canonicalTagId: string | undefined;
    if (input.canonicalTagId !== undefined || input.canonicalTagName !== undefined) {
      const tag = await this.resolver.resolve({
        id: input.canonicalTagId,
        name: input.canonicalTagName,
      });
      canonicalTagId = tag.id;
    }

    // The time-window filter is both-or-neither (Zod refine guarantees this).
    const firstTriggeredAt =
      input.from !== undefined && input.to !== undefined
        ? { gte: input.from, lt: input.to }
        : undefined;

    const rows = await this.prisma.alarmEvent.findMany({
      where: {
        ...(ctx.tenantId ? { tenantId: ctx.tenantId } : {}),
        ...(input.unitId ? { unitId: input.unitId } : {}),
        ...(canonicalTagId ? { canonicalTagId } : {}),
        ...(input.severity ? { severity: input.severity } : {}),
        state: input.state,
        ...(firstTriggeredAt ? { firstTriggeredAt } : {}),
      },
      select: {
        id: true,
        unitId: true,
        alarmRuleId: true,
        severity: true,
        state: true,
        triggeredValue: true,
        thresholdViolated: true,
        firstTriggeredAt: true,
        acknowledgedAt: true,
        acknowledgedBy: true,
        clearedAt: true,
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
      orderBy: { firstTriggeredAt: 'desc' },
      take: input.limit,
    });

    const events: AlarmEventRow[] = rows.map((row) => ({
      alarmEventId: row.id,
      unitId: row.unitId,
      canonicalTag: row.canonicalTag,
      alarmRuleId: row.alarmRuleId,
      severity: narrowSeverity(row.severity),
      state: narrowState(row.state),
      triggeredValue: row.triggeredValue,
      thresholdViolated: narrowThresholdBand(row.thresholdViolated),
      firstTriggeredAt: row.firstTriggeredAt,
      acknowledgedAt: row.acknowledgedAt,
      acknowledgedBy: row.acknowledgedBy,
      clearedAt: row.clearedAt,
    }));

    return {
      generatedAt,
      source: 'alarm_events',
      state: input.state,
      events,
    };
  }
}

const narrowSeverity = (raw: string): AlarmEventSeverity => {
  if (raw === 'info' || raw === 'warning' || raw === 'critical') return raw;
  return 'info';
};

const narrowState = (raw: string): AlarmEventState => {
  if (raw === 'active' || raw === 'acknowledged' || raw === 'cleared') return raw;
  return 'active';
};

const narrowThresholdBand = (raw: string): AlarmEventThresholdBand => {
  if (raw === 'low_low' || raw === 'low' || raw === 'high' || raw === 'high_high') return raw;
  return 'high';
};
