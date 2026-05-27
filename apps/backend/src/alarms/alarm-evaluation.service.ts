import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import type { AlarmRule } from '@prisma/client';

export type AlarmSeverity = 'info' | 'warning' | 'critical';
export type ThresholdViolated = 'low_low' | 'low' | 'high' | 'high_high';

/**
 * Input the alarm evaluator receives after a canonical `telemetry_readings`
 * row has been inserted and the `live_readings` projection step has run.
 * Caller (the ingestion service) is responsible for resolving every field
 * from the accepted row + the resolved source/mapping context.
 *
 * The evaluator never sees raw HTTP input — only canonical persisted values.
 */
export interface AcceptedTelemetryAlarmInput {
  telemetryReadingId: string;
  tenantId: string;
  unitId: string;
  sensorId: string;
  canonicalTagId: string;
  value: Prisma.Decimal;
  engineeringUnit: string;
  /// Caller must only invoke with 'good'. The service enforces the quality
  /// gate defensively as a second line.
  quality: 'good' | 'uncertain' | 'bad';
  timestamp: Date;
  source: string;
}

/// Per-rule evaluation outcome. `skipped_duplicate_active` reflects the
/// no-duplicate-active guard recommended by F4.6D-0 §13.
export type AlarmRuleEvaluation =
  | { ruleId: string; severity: AlarmSeverity; status: 'no_threshold_violated' }
  | {
      ruleId: string;
      severity: AlarmSeverity;
      status: 'skipped_duplicate_active';
      existingAlarmEventId: string;
    }
  | {
      ruleId: string;
      severity: AlarmSeverity;
      status: 'triggered';
      alarmEventId: string;
      thresholdViolated: ThresholdViolated;
    };

/**
 * Internal per-call outcome. NOT a public API type; consumers are only the
 * ingestion service and the service's spec.
 *
 * `skipped_quality` short-circuits before any DB call. `no_rule` runs the
 * rule query but emits no per-rule outcomes (no enabled+current rule for the
 * (unit, canonical_tag) pair). `evaluated` carries one entry in `perRule`
 * for each matched `(is_current=true, enabled=true)` AlarmRule.
 */
export type AlarmEvaluationResult =
  | { outcome: 'skipped_quality' }
  | { outcome: 'no_rule' }
  | { outcome: 'evaluated'; perRule: AlarmRuleEvaluation[] };

/**
 * AlarmEvaluationService — F4.6D.1.
 *
 * Backend-owned alarm evaluator. **First backend collaborator authorized to
 * write `prisma.alarmEvent.*`.** Implements the F4.6D-0 plan:
 *   - consumes a canonical persisted reading (never raw HTTP input);
 *   - loads the eligible `alarm_rules` (`is_current = true, enabled = true`)
 *     for the reading's `(unit_id, canonical_tag_id)` pair;
 *   - performs level-only threshold comparison with strict inequality
 *     (F4.6D-0 §9.1 convention — "at the threshold is not a violation");
 *   - emits at most one `alarm_events` row per matched rule (`state='active'`);
 *   - applies a no-duplicate-active guard so repeated triggers above the
 *     same threshold do not produce repeated `active` rows while the
 *     existing event is still open (F4.6D-0 §13 — full lifecycle deferred);
 *   - records a frozen `rule_snapshot` JSONB on every event so future rule
 *     edits cannot retroactively re-interpret the event.
 *
 * Severity precedence within a single rule: `high_high > high > low_low >
 * low` — the most severe configured band that the value crosses wins. Across
 * rules, every matched rule that has a violated band produces its own event
 * (F4.6D-0 §9.2 — recommended "one outcome per matched rule").
 *
 * **Stateful semantics are intentionally NOT enforced in F4.6D.1.** The
 * `deadband` and `delay_seconds` columns on `alarm_rules` are read into the
 * `rule_snapshot` so the audit trail records what was configured, but
 * deadband hysteresis, debounce timing, and rate-of-change rules are
 * deferred to a future sub-phase (candidate F4.6D.4 in F4.6D-0 §15).
 *
 * **What this service does NOT do:**
 *   - **No alarm-lifecycle transitions** (acknowledge / clear). Deferred to
 *     a future sub-phase (candidate F4.6D.3).
 *   - **No notifications / escalation / external webhooks.** Owned nowhere
 *     yet; not in the F4.6 arc.
 *   - **No public HTTP API.** Internal service-level boundary only
 *     (F4.6D-0 §11). A read API over `alarm_events` is a separate
 *     candidate sub-phase (F4.6D.2).
 *   - **No realtime / WebSocket / SSE emission.** Owned by F4.6E.
 *   - **No external integration / vendor delegation.** ADR-006 / ADR-008 §3
 *     decision 1: RVF owns canonical alarm decisions.
 *   - **No use of the reserved `alarm_thresholds` table.** Reserved for
 *     future multi-step / rate-of-change semantics.
 *   - **No `audit_logs` writes.** F4.6D.1 only creates the initial active
 *     row; lifecycle transitions (which is what ADR-005 mandates audit on)
 *     are deferred.
 *   - **No schema or migration change.** All columns come from the F4.2B
 *     baseline `alarm_events` table.
 *   - **No reads of `telemetry_readings`, `live_readings`, `jobs`, or any
 *     realtime surface.** The evaluator operates on the input it receives.
 *
 * The service accepts a `Prisma.TransactionClient` so it can participate in
 * the same per-sample transactional unit as the canonical `telemetry_readings`
 * insert and the `live_readings` projection upsert (F4.6C.1). The ingestion
 * service always supplies `tx`; if no client is supplied, the constructor-
 * injected `PrismaService` is used (test seam).
 */
@Injectable()
export class AlarmEvaluationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluate the given accepted telemetry reading against the alarm rules
   * configured for its `(unit_id, canonical_tag_id)` pair.
   *
   * Returns an internal outcome describing what happened. Throws only on
   * truly unexpected DB failures so the surrounding transaction can roll
   * back and the ingestion boundary classifies the sample as
   * `mapping_engine_failure` per its existing outcome contract.
   */
  async evaluate(
    input: AcceptedTelemetryAlarmInput,
    client?: Prisma.TransactionClient,
  ): Promise<AlarmEvaluationResult> {
    // Defensive quality gate. Caller (the ingestion service) is expected to
    // already gate this; the evaluator double-checks so a misuse from a
    // future caller cannot silently emit alarms from bad readings.
    if (input.quality !== 'good') {
      return { outcome: 'skipped_quality' };
    }

    const db = client ?? this.prisma;

    // Load the eligible rules. Both `isCurrent` and `enabled` are filtered at
    // the query layer so disabled / superseded rules never enter the loop —
    // the test suite asserts this query shape (F4.6D-0 §9.5 #10 / #11).
    const rules = await db.alarmRule.findMany({
      where: {
        unitId: input.unitId,
        canonicalTagId: input.canonicalTagId,
        isCurrent: true,
        enabled: true,
      },
      orderBy: [{ severity: 'asc' }],
    });

    if (rules.length === 0) {
      return { outcome: 'no_rule' };
    }

    const perRule: AlarmRuleEvaluation[] = [];

    for (const rule of rules) {
      // The DB CHECK constrains severity to ('info', 'warning', 'critical').
      const severity = rule.severity as AlarmSeverity;

      const violated = pickViolatedBand(input.value, rule);

      if (violated === null) {
        perRule.push({ ruleId: rule.id, severity, status: 'no_threshold_violated' });
        continue;
      }

      // Duplicate-active guard (F4.6D-0 §13). While an `active` event for
      // this (unit, tag, rule) already exists, do not write another one.
      // Lifecycle transitions that close the event (acknowledge / clear)
      // are deferred to a future sub-phase, so without this guard repeated
      // triggers would produce a fresh `active` row per accepted reading.
      const existingActive = await db.alarmEvent.findFirst({
        where: {
          unitId: input.unitId,
          canonicalTagId: input.canonicalTagId,
          alarmRuleId: rule.id,
          state: 'active',
        },
        select: { id: true },
      });

      if (existingActive) {
        perRule.push({
          ruleId: rule.id,
          severity,
          status: 'skipped_duplicate_active',
          existingAlarmEventId: existingActive.id,
        });
        continue;
      }

      const ruleSnapshot = buildRuleSnapshot(rule, input, violated);

      const created = await db.alarmEvent.create({
        data: {
          tenantId: input.tenantId,
          unitId: input.unitId,
          canonicalTagId: input.canonicalTagId,
          alarmRuleId: rule.id,
          severity: rule.severity,
          triggeredValue: input.value,
          thresholdViolated: violated,
          state: 'active',
          firstTriggeredAt: input.timestamp,
          ruleSnapshot: ruleSnapshot as Prisma.InputJsonValue,
          jobId: null,
        },
        select: { id: true },
      });

      perRule.push({
        ruleId: rule.id,
        severity,
        status: 'triggered',
        alarmEventId: created.id,
        thresholdViolated: violated,
      });
    }

    return { outcome: 'evaluated', perRule };
  }
}

/**
 * Return the most-severe configured band the value crosses, or null if none.
 *
 * Strict inequality per F4.6D-0 §9.1 — value at the threshold is not a
 * violation; only crossing it is. Severity precedence within a single rule:
 * `high_high > high > low_low > low`.
 *
 * Null bands are "not configured for this rule" and never trigger.
 */
function pickViolatedBand(
  value: Prisma.Decimal,
  rule: {
    lowLowThreshold: Prisma.Decimal | null;
    lowThreshold: Prisma.Decimal | null;
    highThreshold: Prisma.Decimal | null;
    highHighThreshold: Prisma.Decimal | null;
  },
): ThresholdViolated | null {
  if (rule.highHighThreshold !== null && value.greaterThan(rule.highHighThreshold)) {
    return 'high_high';
  }
  if (rule.highThreshold !== null && value.greaterThan(rule.highThreshold)) {
    return 'high';
  }
  if (rule.lowLowThreshold !== null && value.lessThan(rule.lowLowThreshold)) {
    return 'low_low';
  }
  if (rule.lowThreshold !== null && value.lessThan(rule.lowThreshold)) {
    return 'low';
  }
  return null;
}

/**
 * Freeze the rule fields that mattered for this decision into a JSON snapshot.
 * Future rule edits will not retroactively reinterpret the resulting event.
 * Decimal values are serialized as strings to preserve precision.
 */
function buildRuleSnapshot(
  rule: AlarmRule,
  input: AcceptedTelemetryAlarmInput,
  violated: ThresholdViolated,
): Record<string, unknown> {
  return {
    rule: {
      id: rule.id,
      severity: rule.severity,
      version: rule.version,
      enabled: rule.enabled,
      lowLowThreshold: rule.lowLowThreshold?.toString() ?? null,
      lowThreshold: rule.lowThreshold?.toString() ?? null,
      highThreshold: rule.highThreshold?.toString() ?? null,
      highHighThreshold: rule.highHighThreshold?.toString() ?? null,
      deadband: rule.deadband?.toString() ?? null,
      delaySeconds: rule.delaySeconds,
      messageTemplate: rule.messageTemplate,
    },
    trigger: {
      thresholdViolated: violated,
      value: input.value.toString(),
      engineeringUnit: input.engineeringUnit,
      quality: input.quality,
      source: input.source,
      timestamp: input.timestamp.toISOString(),
      telemetryReadingId: input.telemetryReadingId,
    },
  };
}
