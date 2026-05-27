# RVF Malinois — F4.6D.1 Alarm Evaluation Boundary Closeout

> Phase **F4.6D.1 — Alarm Evaluation Boundary Implementation**. First backend collaborator authorized to write `prisma.alarmEvent.*`.
>
> Implements the F4.6D-0 plan (commit `901cd22`). Per the project's commit/push discipline this closeout ships alongside the implementation; the task brief instructs **not to commit yet**.
>
> Upstream references:
> - F4.6D-0 plan: `docs/architecture/RVF_Malinois_F4_6D_Alarm_Evaluation_Boundary_Plan.md` (commit `901cd22`).
> - Master roadmap (most recent refresh): `docs/architecture/RVF_Malinois_Master_Roadmap.md` (commit `66bfc79`).
> - F4.6C.1 closeout: `docs/architecture/RVF_Malinois_F4_6C_1_Live_Readings_Projection_Updater_Closeout_Report_v1.0.md` (commit `49a8349`).
> - F4.6B.1 closeout: `docs/architecture/RVF_Malinois_F4_6B_1_Ingestion_Boundary_Skeleton_Closeout_Report_v1.0.md` (commit `1495457`).
> - F4.6A.1 schema-hardening closeout: `docs/architecture/RVF_Malinois_F4_6A_1_Schema_Hardening_Migration_Closeout_Report_v1.0.md` (commit `6be7842`).
> - ADR-005 / ADR-006 / ADR-008 (Proposed).
> - DX-3 (Definition of Done): `docs/operations/RVF_Malinois_Definition_of_Done.md` (commit `65cb736`).

## 1. Purpose

F4.6D.1 implements the alarm evaluation boundary defined in F4.6D-0. It introduces `AlarmEvaluationService` — the **first backend collaborator authorized to write `prisma.alarmEvent.*`** — and wires it into the telemetry ingestion path as the last step of the per-sample `accepted` flow, inside the same `prisma.$transaction` that F4.6B.1 introduced and F4.6C.1 extended.

The evaluator consumes canonical persisted telemetry only. It never sees raw HTTP input, never delegates alarm decisions to an external system, and never modifies any non-alarm canonical surface. Every gate the plan called for is implemented at both the call site (in `TelemetryIngestionService`) and defensively inside `AlarmEvaluationService`.

## 2. Scope Implemented

- **Service boundary.** New `AlarmEvaluationService` at `apps/backend/src/alarms/alarm-evaluation.service.ts`. One public method (`evaluate(input, client?)`). Internal service-level only — no controller, no HTTP route, no public DTO (per F4.6D-0 §11).
- **Rule evaluation.** Loads `(is_current = true, enabled = true)` `alarm_rules` for the reading's `(unit_id, canonical_tag_id)`. Compares the reading's `value` against each rule's configured threshold bands with **strict inequality** (per F4.6D-0 §9.1 convention).
- **Severity precedence within a single rule.** `high_high > high > low_low > low`. The most-severe configured band that the value crosses wins, producing at most one event per matched rule.
- **Severity precedence across rules.** Every matched rule that has a violated band produces its own event (per F4.6D-0 §9.2 recommendation — "one outcome per matched rule"). The F4.3 seed pattern of `warning` (high) + `critical` (high_high) rules per `(unit, tag)` correctly produces two events when a reading crosses both.
- **Persistence behavior.** Per F4.6D-0 §10 option B: `alarm_events` rows are written with `state = 'active'` and a fully-populated `rule_snapshot` JSONB. No lifecycle transitions (acknowledge / clear) are implemented. The schema's defaults (`state = 'active'`, `created_at = now()`, `updated_at = now()`) carry the load.
- **Quality gate.** Mirrors F4.6C.1 exactly. Only `quality === 'good'` reaches threshold comparison. `uncertain` and `bad` short-circuit to `skipped_quality` before any DB call. The gate lives at both the call site (in `TelemetryIngestionService`) and defensively inside `AlarmEvaluationService`.
- **Late-readings behavior.** Per F4.6D-0 §9.4: late readings still trigger evaluation (the evaluator operates on the incoming reading inside the ingestion transaction, not on a `live_readings` snapshot). The duplicate-active guard prevents repeated `active` rows regardless of arrival order.
- **Ingestion integration.** `TelemetryIngestionService` now injects `AlarmEvaluationService` alongside `LiveReadingsProjectionService` and calls `alarms.evaluate(...)` inside the existing `prisma.$transaction(async (tx) => ...)`, immediately after the projection step. All three operations (canonical insert, projection upsert, alarm evaluation) commit or roll back atomically.
- **Duplicate-active guard.** Per F4.6D-0 §13 recommendation: before creating an `alarm_events` row, the evaluator runs a `findFirst` for an existing `(unit_id, canonical_tag_id, alarm_rule_id, state = 'active')` row. If one exists, the per-rule outcome is `skipped_duplicate_active` with the existing event id, and **no** new row is written. This prevents repeated `active` rows from repeated triggers above the same threshold while lifecycle transitions remain deferred.
- **Rule snapshot.** Every `alarm_events.rule_snapshot` JSONB carries `{ rule: {...}, trigger: {...} }`. The `rule` half freezes the rule fields (id, severity, version, enabled, all four threshold values as strings, deadband, delaySeconds, messageTemplate) so future rule edits cannot retroactively reinterpret the event. The `trigger` half carries the band that violated, the value (as string for Decimal precision), engineering unit, quality, source, ISO timestamp, and the canonical `telemetry_reading_id` for forensics.
- **Tests.** 21 new unit tests in `alarm-evaluation.service.spec.ts` covering every F4.6D-0 §9.5 case plus the duplicate-active guard, rule_snapshot fidelity, event-row field shape, and an unexpected-error propagation case. 8 new integration tests appended to `telemetry-ingestion.service.spec.ts` covering "alarm evaluator invoked once for accepted-good," "not called for uncertain / bad / duplicate / conflict / rejected," "evaluator failure rolls back → `mapping_engine_failure`," and "create + projection + alarms all participate in the same `$transaction`." Existing isolation test #18 refined to "ingestion does not call `prisma.alarmEvent.*` / `prisma.alarmRule.*` directly — delegates to the evaluator," mirroring how F4.6C.1 refined the live-readings invariant.

## 3. Architecture Decision

Reaffirms and exercises the platform-ownership principles already locked by ADR-006 / ADR-008 / F4.6D-0 §4:

- **Alarm decisions remain RVF-owned.** `alarm_rules`, `alarm_thresholds` (reserved), `alarm_events`, and the evaluation logic itself all live inside the backend. No external system contributes a canonical alarm decision.
- **Evaluation occurs after canonical persistence.** The evaluator runs after `telemetryReading.create` (canonical history) and `LiveReadingsProjectionService.updateFromAcceptedTelemetry` (projection upsert). It consumes the reading it just persisted; it never sees raw HTTP input.
- **Ingestion delegates to the alarm evaluator.** `TelemetryIngestionService` is no longer the legal owner of "ingestion does not call `prisma.alarmEvent.*`" — that invariant has been replaced by "ingestion delegates to `AlarmEvaluationService` and never calls `prisma.alarmEvent.*` / `prisma.alarmRule.*` directly." The new isolation test asserts this.
- **External tools do not own alarm decisions.** ThingsBoard, Node-RED, MQTT brokers, OPC-UA gateways, PLCs, edge devices, and historians are not introduced as a side effect. The evaluator accepts no "already-evaluated" payload; it always re-evaluates against the canonical RVF rules.

ADR-008 remains **Proposed**. F4.6D.1 is the third sub-phase exercising its principles in code (after F4.6B.1 and F4.6C.1) but a live-DB integration suite is still the outstanding precondition for graduation (per master roadmap §10 risk table).

## 4. Files Changed

| Path | Action | Notes |
|---|---|---|
| `apps/backend/src/alarms/alarm-evaluation.service.ts` | **New.** | The evaluator. Single public `evaluate(input, client?)` method, level-only threshold semantics, severity-precedence band picker, duplicate-active guard, frozen `rule_snapshot` builder. ~230 lines including documentation. |
| `apps/backend/src/alarms/alarm-evaluation.service.spec.ts` | **New.** | 21 mocked-Prisma vitest tests covering the F4.6D-0 §9.5 cases plus duplicate-active guard, rule_snapshot fidelity, event-row field shape, isolation invariants, and an unexpected-error propagation case. |
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.ts` | **Modified.** | Adds `AlarmEvaluationService` constructor injection (third parameter after `prisma` and `projection`). Inside the existing `prisma.$transaction`, after the projection step, calls `this.alarms.evaluate({...}, tx)` for `quality === 'good'` samples only. The transactional contract is unchanged — every operation inside the transaction commits or rolls back together; any evaluator throw triggers the existing `mapping_engine_failure` classification. JSDoc updated to reflect the F4.6D.1 delegation. |
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.module.ts` | **Modified.** | Adds `AlarmEvaluationService` to `providers`. No new module file. No exports changed. JSDoc updated to record the F4.6D.1 addition and the new "no alarm lifecycle / no notifications / no external bridge" exclusions. |
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` | **Modified.** | Imports the alarm service type. Extends the typed mock harness with `alarmRuleFindMany`, `alarmEventFindFirst`, and an injected `alarms` mock with an observable `alarmsEvaluate` stub. Service construction now takes three arguments. Test #18 refactored from "no `alarm_events` mutation" to "no direct `prisma.alarmEvent.*` / `prisma.alarmRule.*` calls — delegates." 8 new integration tests (#32–#39) added at the bottom covering the F4.6D.1 delegation contract: invoked once for accepted-good, not invoked for uncertain/bad/duplicate/conflict/rejected, rollback on evaluator throw, all three operations share the same `$transaction`. |
| `docs/architecture/RVF_Malinois_F4_6D_1_Alarm_Evaluation_Boundary_Closeout.md` | **New.** | This document. |

No other file modified, created, or deleted. Explicitly:

- No file under `apps/web/`.
- No file under `apps/backend/src/realtime/`.
- No file under `apps/backend/src/{tenants,wells,equipment,jobs,tags,health}/`.
- No `apps/backend/prisma/schema.prisma` change.
- No `apps/backend/prisma/migrations/` change.
- No `apps/backend/prisma/seed.f4.ts` change.
- No `package.json`, lockfile, `turbo.json`, `tsconfig*.json`, `vitest.config.ts`, `eslint.config.mjs`, `docker-compose.yml`, CI workflow, or `packages/` change.

## 5. Database / Migration Impact

**No migration added.** The existing `alarm_rules`, `alarm_thresholds`, and `alarm_events` tables (F4.2B baseline migration `20260524000000_f4_2_baseline/migration.sql`) carry every column F4.6D.1 needs:

- `alarm_rules` — read filter `(unit_id, canonical_tag_id, is_current = true, enabled = true)`; rules carry the four nullable threshold columns and a single CHECK-enum `severity`. Backed by the existing `alarm_rules_unit_tag_severity_current_uk` partial unique index.
- `alarm_events` — written with `tenant_id`, `unit_id`, `canonical_tag_id`, `alarm_rule_id`, `severity`, `triggered_value`, `threshold_violated`, `state = 'active'`, `first_triggered_at`, `rule_snapshot`. The schema's defaults handle `state`, `created_at`, `updated_at`. The active-board partial index `alarm_events_active_idx WHERE state = 'active'` is exercised by the duplicate-active guard query and will accelerate the future read API (candidate F4.6D.2).
- `alarm_thresholds` — **not used by F4.6D.1** (reserved for future multi-step / rate-of-change semantics; the schema comment explicitly notes it is not required to be populated in F4.2). The reservation remains intact.

`prisma validate` passes; no schema or migration delta. DX-2 (Local DB Migration Validation Procedure) does not need to run for this phase — there is nothing to validate.

## 6. Evaluation Semantics

Implemented exactly as F4.6D-0 §9 specified. Documented here so future readers can confirm the operator-facing behavior without re-reading the plan.

### 6.1 Boundary convention — strict inequality

A reading at the threshold value is **not** a violation; only crossing it is.

- `high_high` triggers when `value > highHighThreshold`.
- `high` triggers when `value > highThreshold`.
- `low` triggers when `value < lowThreshold`.
- `low_low` triggers when `value < lowLowThreshold`.

Tests #1, #3, #5, #7 assert the not-triggered side (value at boundary or just inside). Tests #2, #4, #6, #8 assert the triggered side (value just past boundary).

Rationale (F4.6D-0 §9.1): the F4.3 seed messages describe the threshold value as the *limit* the equipment is rated to (HP-001 `p_inlet` `high_high` = 5000 with the message "*at design limit (critical)*"), which is more consistent with "at the limit is acceptable; past it is not." If operations later prefers inclusive, one operator change and the test names flip together — no schema impact.

### 6.2 Severity precedence within a single rule

A single `alarm_rules` row can carry up to four threshold columns (`low_low`, `low`, `high`, `high_high`). When more than one is configured and the value crosses several, the most severe configured-and-crossed band wins, producing exactly one event for that rule with `threshold_violated` set to the winning band: `high_high > high > low_low > low`. Test #4 confirms `high_high` wins over `high`; test #8 confirms `low_low` wins over `low`. The F4.3 seed today uses only one band per rule, but the model supports more and the evaluator handles it correctly.

### 6.3 Severity precedence across rules

When more than one rule matches `(unit_id, canonical_tag_id)` and each has its own violated band, every triggered rule produces its own `alarm_events` row. The F4.3 seed pattern of `warning` (high) + `critical` (high_high) per `(unit, tag)` produces two events when a reading crosses both — test #14 confirms this. The schema is shaped for it: `alarm_events.alarm_rule_id` is a single nullable FK and `threshold_violated` is a single value, so collapsing to "most severe only" would lose the warning row.

### 6.4 Quality behavior

Mirrors F4.6C.1 exactly. Only `quality === 'good'` reaches the rule query. `uncertain` and `bad` short-circuit to `outcome: 'skipped_quality'` before any DB call. The reading itself still persists to `telemetry_readings` (canonical history is preserved by F4.6B.1) — only the alarm decision is skipped.

The gate exists in two places:
- **Call site (in `TelemetryIngestionService`):** the `if (sample.quality === 'good') { … alarms.evaluate(…) }` block. Keeps non-good samples out of the alarm path entirely (no needless DB work; no module-coupling regression risk).
- **Defensive (in `AlarmEvaluationService`):** the leading `if (input.quality !== 'good') return { outcome: 'skipped_quality' };`. A misuse from any future caller cannot silently emit alarms from non-good readings.

Tests #15, #16 in the alarm spec; tests #33, #34 in the ingestion spec confirm the call-site gate.

### 6.5 Duplicate-active guard

For each matched rule that has a violated band, the evaluator runs:

```sql
SELECT id FROM alarm_events
WHERE unit_id = $1 AND canonical_tag_id = $2 AND alarm_rule_id = $3 AND state = 'active'
LIMIT 1;
```

If a row is found, the per-rule outcome is `skipped_duplicate_active` with the existing event id, and **no** new row is written. This is the F4.6D-0 §13 recommended minimal guard: while lifecycle transitions (acknowledge / clear) remain deferred to a future sub-phase, the guard prevents the obvious failure mode of one `active` event per accepted reading after a threshold crossing.

What this guard does *not* do (deferred to a future alarm-lifecycle sub-phase, candidate F4.6D.3):

- **Reopen logic.** If the existing `active` event is later acknowledged or cleared by a lifecycle workflow that does not yet exist, a fresh trigger would (correctly) open a new `active` event. The current state never reaches that case because nothing transitions events out of `active`.
- **Time-bounded merging.** The guard treats "any `active` row" as a block; it does not merge by time-window or by sample density.
- **`last_seen_at` / `trigger_count` columns.** The schema does not carry these and F4.6D.1 does not introduce them. A future stateful sub-phase may.

Test #19 confirms the guard behavior; test #18 confirms the evaluator does not touch any non-alarm canonical surface in the process.

### 6.6 Disabled / superseded rule behavior

`alarm_rules.enabled = false` rules and `alarm_rules.is_current = false` rules are filtered at the query layer (`where: { isCurrent: true, enabled: true }`). They never enter the per-rule loop, never run the duplicate-active guard, never produce an outcome entry. Test #10 asserts the WHERE clause shape.

### 6.7 What is intentionally NOT enforced in F4.6D.1

Per F4.6D-0 §7 / §13:

- **`alarm_rules.deadband`** — read into `rule_snapshot.rule.deadband` (so the audit trail records what was configured) but not used in the comparison. Hysteresis enforcement is deferred to a future stateful sub-phase (candidate F4.6D.4).
- **`alarm_rules.delay_seconds`** — read into `rule_snapshot.rule.delaySeconds` for the same reason. Debounce timing is deferred to the same sub-phase.
- **`alarm_thresholds` (multi-step / rate-of-change)** — table remains untouched. Reserved.
- **`audit_logs` writes on event creation** — deferred. ADR-005 mandates audit on lifecycle transitions; since F4.6D.1 only creates the initial `active` row and never transitions, no `audit_logs` entry is owed yet.

Test #20 asserts that `deadband` and `delay_seconds` are captured into `rule_snapshot` even though they are not enforced.

## 7. API Impact

**No public API added.** F4.6D.1 is internal / service-level only (per F4.6D-0 §11). There is no new HTTP route, no new controller, no new DTO, no Swagger entry. The Ingestion controller and Swagger surface from F4.6B.1 are unchanged.

A future small sub-phase (candidate **F4.6D.2 — Alarm Events Read API**, named in F4.6D-0 §15 and master roadmap §7 candidate-follow-ups) can expose `alarm_events` to a frontend dashboard when one is needed. F4.6D.1 deliberately does not size that endpoint speculatively.

## 8. Tests / Validation

### 8.1 Tests added

**`apps/backend/src/alarms/alarm-evaluation.service.spec.ts` — 21 new tests:**

| # | Test | Asserts |
|---|---|---|
| 1 | high not triggered at boundary | `value == highThreshold` → `no_threshold_violated`, no event create. |
| 2 | high triggered above boundary | `value > highThreshold` → `triggered`, `thresholdViolated='high'`, one event create. |
| 3 | high not triggered below | `value < highThreshold` → `no_threshold_violated`. |
| 4 | high_high triggered above its boundary | severity precedence within rule: `high_high` wins over `high`. |
| 5 | low not triggered at boundary | `value == lowThreshold` → `no_threshold_violated`. |
| 6 | low triggered below | `value < lowThreshold` → `thresholdViolated='low'`. |
| 7 | low_low not triggered at boundary | `value == lowLowThreshold` → `no_threshold_violated`. |
| 8 | low_low triggered below | severity precedence within rule: `low_low` wins over `low`. |
| 9 | null bands ignored | a rule with only `highThreshold` set produces no low decision even for a very low value. |
| 10 | query filter shape | `where: { unitId, canonicalTagId, isCurrent: true, enabled: true }`. |
| 12 | severity copied verbatim | `severity` in outcome and in event-row `data.severity` matches rule. |
| 13 | `thresholdViolated` identifies band | `high` for high-only crossing, `high_high` for high_high crossing. |
| 14 | precedence across rules | warning(high) + critical(high_high) both fire → 2 events. |
| 15 | quality='uncertain' short-circuits | no DB call, outcome `skipped_quality`. |
| 16 | quality='bad' short-circuits | identical to #15. |
| 17 | no rule → `no_rule` | empty rule list → outcome `no_rule`, no event create, no guard query. |
| 18 | isolation | no `telemetryReading.*` / `liveReading.*` / `job.*` calls. |
| 19 | duplicate-active guard | existing `state='active'` row → `skipped_duplicate_active`, no new event. |
| 20 | rule_snapshot fidelity | snapshot freezes rule + trigger fields; Decimal serialized as string; timestamp as ISO. |
| 21 | event row shape | `tenantId/unitId/canonicalTagId/alarmRuleId/severity/thresholdViolated/state='active'/firstTriggeredAt/triggeredValue/jobId=null`. |
| 22 | unexpected error propagates | DB throw from `alarmEvent.create` rejects out, so surrounding `$transaction` rolls back. |

(Numbering follows F4.6D-0 §9.5; #11 is folded into #10's WHERE-clause assertion.)

**`apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` — 8 new tests + 1 refined:**

- **#18 (refined)** — isolation invariant updated from "no `alarm_events` mutation" to "no direct `prisma.alarmEvent.*` / `prisma.alarmRule.*` calls — delegates to evaluator."
- **#32** — accepted-good calls alarms.evaluate once with resolved IDs and the `tx` client.
- **#33** — accepted-uncertain does not call alarms.evaluate.
- **#34** — accepted-bad does not call alarms.evaluate.
- **#35** — duplicate (P2002 + identical) does not call alarms.evaluate.
- **#36** — conflict_quarantined does not call alarms.evaluate.
- **#37** — rejected_quarantined (unknown_mapping) does not call alarms.evaluate.
- **#38** — alarm evaluator failure inside transaction → rollback + `mapping_engine_failure`. Mirrors F4.6C.1 #30 exactly.
- **#39** — create + projection + alarms all participate in the same `$transaction` (one transaction, one `telemetryReading.create`, one `projection.update`, one `alarms.evaluate`).

### 8.2 Validation commands run

| Command | Result |
|---|---|
| `pnpm --filter @rvf/backend exec prisma validate` | ✅ "The schema at prisma/schema.prisma is valid 🚀" — no schema or migration delta. |
| `pnpm --filter @rvf/backend run lint` | ✅ clean, `--max-warnings 0`. |
| `pnpm --filter @rvf/backend run typecheck` | ✅ clean (src + prisma tsconfigs). |
| `pnpm --filter @rvf/backend run build` | ✅ `nest build` clean. |
| `pnpm --filter @rvf/backend run test` | ✅ **140/140 across 13 spec files**. Breakdown: 111 F4.6C.1 baseline → 132 with the 21-test alarm spec → **140** with the 8 new ingestion-integration tests + 1 refined test (existing test count preserved). |
| `pnpm run lint` (workspace) | ✅ clean. Web + UI + types cached; backend re-ran fresh. |
| `pnpm run typecheck` (workspace) | ✅ clean. |
| `pnpm run build` (workspace) | ✅ clean. Web cached (no frontend change), backend re-ran fresh. |

DX-3 §"Runtime phases" validation surface fully exercised.

## 9. Known Limitations / Deferred Work

Each of these has a dedicated future phase and is explicitly NOT in F4.6D.1 scope (per F4.6D-0 §7):

- **No acknowledge / clear lifecycle.** Events are written with `state = 'active'` and never transitioned. Candidate sub-phase **F4.6D.3 — Alarm Lifecycle**.
- **No notifications / escalation / webhooks / SMS / email / WhatsApp / push.** Deferred indefinitely (not in the F4.6 arc).
- **No alarm dashboard / frontend alarm UI.** The existing `apps/web/app/(rvf-console)/alarms/page.tsx` continues to read from the F3 mock adapter; F4.6D.1 does not touch it. A future per-screen migration will wire it to a real backend endpoint once F4.6D.2 ships.
- **No WebSocket / SSE fan-out of alarm events.** Owned by **F4.6E**. `apps/backend/src/realtime/` remains scaffolding-only.
- **No public alarm read API.** Internal-only per F4.6D-0 §11. Candidate sub-phase **F4.6D.2 — Alarm Events Read API**.
- **No complex rule DSL / boolean expressions / multi-tag conditions / scripted rules.** Out of scope.
- **No deadband / debounce / rate-of-change semantics enforced.** `deadband` and `delay_seconds` are read into the snapshot for audit but not used in comparisons. Candidate sub-phase **F4.6D.4 — Stateful Threshold Semantics**, which would also begin to populate the reserved `alarm_thresholds` table.
- **No low-band rule in the F4.3 seed.** The F4.3 seed populates only `high` / `high_high` bands. The evaluator handles `low` / `low_low` correctly when configured (tests #5–#8) but seeding actual low-band rules is a separate seed-enhancement task.
- **No `audit_logs` writes.** ADR-005 mandates audit on lifecycle transitions; since F4.6D.1 only creates the initial `active` row and does not transition, no `audit_logs` entry is owed yet. The audit wire arrives with the lifecycle sub-phase.
- **`alarm_thresholds` table (reserved) unused.** Schema comment marks it as "Not required to be populated in F4.2; reserved for future use." F4.6D.1 honors that reservation.
- **No live-DB integration test.** Tests are mocked-Prisma per the project's established F4.6B.1 / F4.6C.1 pattern. A live-DB integration suite that exercises the dedup indexes, the projection upsert, the alarm evaluator, and the active-board partial index against a real Postgres is a candidate cross-phase deliverable (also flagged in DX-1 §10 risk table). Not introduced by F4.6D.1.

## 10. Acceptance Criteria

Per F4.6D-0 §14. Every criterion below has been confirmed:

- [x] An alarm-evaluation collaborator exists in `apps/backend/src/` (`apps/backend/src/alarms/alarm-evaluation.service.ts`).
- [x] The collaborator is wired into `TelemetryIngestionService` inside the existing `prisma.$transaction` from F4.6C.1, called for `quality === 'good'` accepted samples only.
- [x] Rule evaluation is deterministic and covered by 21 mocked-Prisma unit tests covering every band, null bands, disabled / non-current rules, severity precedence (within and across rules), and quality short-circuits.
- [x] High-band and low-band threshold semantics are both implemented (the F4.3 seed only populates high bands; the evaluator handles low bands correctly when a rule has them — tests #5–#8).
- [x] Strict-inequality boundary convention (F4.6D-0 §9.1) is confirmed in tests #1, #3, #5, #7 (not-triggered side) and #2, #4, #6, #8 (triggered side).
- [x] Quality and staleness handling are documented in §6 and enforced in tests (#15, #16, #33, #34; late-readings behavior per §6.4 / §9.4).
- [x] Persistence per F4.6D-0 §10 option B: `alarm_events` rows are written with `state = 'active'`, `rule_snapshot` populated; no lifecycle transitions; no notifications; no fan-out.
- [x] One event per matched rule when multiple rules fire (test #14).
- [x] No `prisma.schema` change. No new migration. No seed change. No `apps/web/` change. No `docker-compose.yml` change. No package / lockfile / `turbo.json` / `tsconfig*.json` / `.env*` / CI change.
- [x] No external alarm ownership introduced. The evaluator does not accept an "already-evaluated" alarm payload from any external source. ThingsBoard / Node-RED / MQTT bridges are not introduced as a side effect.
- [x] No WebSocket / SSE emit. `apps/backend/src/realtime/` is unchanged.
- [x] Existing F4.6B.1 and F4.6C.1 isolation invariants still hold — ingestion still does not call `prisma.liveReading.*` directly (delegates); ingestion now also does not call `prisma.alarmEvent.*` or `prisma.alarmRule.*` directly (delegates).
- [x] DX-3 §"Runtime phases" validation surface passes end to end: `prisma validate` / `generate`, backend `lint -- --max-warnings 0` / `typecheck` / `build` / `test`, workspace `lint` / `typecheck` / `build`.
- [x] F4.6D.1 closeout report exists at `docs/architecture/RVF_Malinois_F4_6D_1_Alarm_Evaluation_Boundary_Closeout.md`, follows the established closeout structure, names which §10 option was taken (option B), reports the final test count (140), and flags the duplicate-active guard implementation choice (§6.5).
- [ ] Master roadmap §3 / §7 refresh — **deferred to a small follow-up hygiene commit** (see §11). Cleaner to keep this commit "code + closeout" only; the roadmap update is a one-file documentation edit best done in its own commit after the F4.6D.1 commit lands.

## 11. Recommended Next Step

**Two follow-ups in order, both small:**

1. **Master roadmap hygiene refresh.** Flip F4.6D.1 from "Next" → "Closed" with the F4.6D.1 commit hash in §3; remove F4.6D.1 from §7's numbered sequence (it becomes the new "already closed" preamble entry); promote **F4.6E-0** from "Deferred" → "Next." Mirror the pattern used after F4.6D-0 (commit `66bfc79`). Documentation-only, ~30 lines diff. Best done as its own commit after this F4.6D.1 commit lands, so the F4.6D.1 commit stays focused on the implementation + closeout.

2. **F4.6E-0 — WebSocket / SSE Fan-out Plan.** The next implementation phase per master roadmap §7 (after the hygiene refresh above). Plan-first per the codified DX-3 pattern. Scope per the master roadmap and DX-1 §6:
   - Channel topology (per-tenant / per-unit / per-sensor — TBD by the plan).
   - Payload shape (telemetry-reading events, alarm-event lifecycle events, projection updates — which combinations get fan-out and at what granularity).
   - Throttle / batching policy.
   - "Emit after commit" contract (downstream-only, never source of truth).
   - REST reconnect as the only recovery path (no fan-out replay buffer).
   - Test plan: similar shape to F4.6D-0 § 9.5 / §12.
   - Isolation invariants for F4.6E.1: no canonical-table writes, no alarm-decision logic, no external bridges.

After F4.6E, master roadmap §7 continues with F4.6F (Historical Trend API) and F4.5G (per-screen UI migrations).

Candidate follow-ups specific to the alarm track, named in F4.6D-0 §15 but not on the main sequence:

- **F4.6C.2 — Latest-value read API** (over `live_readings`).
- **F4.6D.2 — Alarm Events Read API** (over the now-populated `alarm_events`).
- **F4.6D.3 — Alarm Lifecycle** (active → acknowledged → cleared transitions + `audit_logs` writes).
- **F4.6D.4 — Stateful Threshold Semantics** (deadband / debounce / rate-of-change enforcement; populates `alarm_thresholds`).

These are named so they have a place to land. None is committed to as part of F4.6D.1.

---

*F4.6D.1 closeout, authored at HEAD `66bfc79` (Refresh master roadmap after F4.6D-0). Implementation commit pending per the task brief's "do not commit" instruction. Update on commit (replace "pending" with the F4.6D.1 commit hash) and again when the roadmap hygiene commit lands.*
