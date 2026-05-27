# RVF Malinois — F4.6D-0 Alarm Evaluation Boundary Plan

> Phase **F4.6D-0 — Alarm Evaluation Boundary Plan**. Plan-first per the established project pattern (F4.2A → F4.2B, F4.6A.0 → F4.6A.1, F4.6B-0 → F4.6B.1, F4.6C-0 → F4.6C.1, codified by DX-3).
> Documentation-only artifact. No backend, frontend, schema, migration, or runtime code is modified by F4.6D-0. Implementation lands in F4.6D.1.
> Last known head at authoring time: commit `7c54f82` (Refresh master roadmap after DX-4).
>
> Upstream references:
> - Master Roadmap (DX-1): `docs/architecture/RVF_Malinois_Master_Roadmap.md` (most recent refresh `7c54f82`).
> - Local DB Migration Validation Procedure (DX-2): `docs/operations/RVF_Malinois_Local_DB_Migration_Validation_Procedure.md` (commit `e3ccb52`).
> - Definition of Done (DX-3): `docs/operations/RVF_Malinois_Definition_of_Done.md` (commit `65cb736`).
> - DX-4 Roadmap Update + Docker Runtime Note: `docs/architecture/RVF_Malinois_DX_4_Roadmap_Update_Docker_Runtime_Note_v1.0.md` (commit `04dadc4`).
> - F4 architecture: `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md`.
> - ADR-005 (Snapshot / Browser / Freeze boundary): `docs/adr/RVF_Malinois_Adenda_Arquitectura_ADR_001_006_v1.4.md`.
> - ADR-006 (RVF as primary platform / system of record): `docs/adr/ADR-006_RVF_Malinois_Primary_Platform_System_of_Record.md`.
> - ADR-007 (Database Foundation): `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md`.
> - ADR-008 (Telemetry Persistence / Ingestion, **Proposed**): `docs/adr/ADR-008_RVF_Malinois_Telemetry_Persistence_Ingestion.md`.
> - F4.6 architecture: `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Architecture.md` (commit `c12a29c`).
> - F4.6 closeout: `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Closeout_Report_v1.0.md` (commit `334bfc5`).
> - F4.6A.0 plan: `docs/architecture/RVF_Malinois_F4_6A_Schema_Hardening_Plan.md` (commit `014df37`).
> - F4.6A.1 closeout: `docs/architecture/RVF_Malinois_F4_6A_1_Schema_Hardening_Migration_Closeout_Report_v1.0.md` (commit `6be7842`).
> - F4.6B-0 plan: `docs/architecture/RVF_Malinois_F4_6B_Ingestion_Boundary_Plan.md` (commit `c4ea18a`).
> - F4.6B.1 closeout: `docs/architecture/RVF_Malinois_F4_6B_1_Ingestion_Boundary_Skeleton_Closeout_Report_v1.0.md` (commit `1495457`).
> - F4.6C-0 plan: `docs/architecture/RVF_Malinois_F4_6C_Live_Readings_Projection_Updater_Plan.md` (commit `f126c5c`).
> - F4.6C.1 closeout: `docs/architecture/RVF_Malinois_F4_6C_1_Live_Readings_Projection_Updater_Closeout_Report_v1.0.md` (commit `49a8349`).

## 1. Purpose

F4.6D-0 is the **plan-first** phase for the RVF Malinois alarm evaluation boundary.

What this phase does:

- Defines the architectural placement of alarm evaluation in the RVF-owned data path.
- Inventories what alarm surface already exists in the repository (schema, seed, frontend mock surface) and what does not.
- Names the narrow scope, evaluation semantics, persistence decision, API decision, and test plan for the future **F4.6D.1 — Alarm Evaluation Boundary Implementation** phase.
- States non-goals so F4.6D.1 cannot quietly absorb work that belongs to F4.6E (realtime fan-out), F4.6F (historical trend extensions), or a future alarm-lifecycle / notifications sub-phase.

What this phase does **not** do:

- It does not add an `AlarmEvaluationService` (that is F4.6D.1).
- It does not write any code under `apps/backend/src/`.
- It does not add or modify Prisma schema or migrations (the existing `alarm_rules` / `alarm_thresholds` / `alarm_events` tables landed in F4.2B; see §5).
- It does not change `apps/web/` behavior or the existing `/api/alarms` mock route.
- It does not introduce notifications, escalations, or external alarm delegation.

Alarm evaluation is the **next logical step** after telemetry ingestion (F4.6B.1) and the live-readings projection (F4.6C.1). Both upstream phases established the *persisted* canonical data that an evaluator can consume; F4.6D defines how the platform turns that data into operational signal (`alarm_events`), and how it does so without leaking ownership to external systems.

## 2. Current Repository State

Drawn from `git log`, the master roadmap, and direct inspection of the source / schema files referenced in §5.

| Phase | Status | Commit |
|---|---|---|
| F4.6 architecture + ADR-008 (`Proposed`) | Closed | `c12a29c` |
| F4.6 closeout | Closed | `334bfc5` |
| F4.6A.0 — Schema Hardening Plan | Closed | `014df37` |
| F4.6A.1 — Schema Hardening Migration | Closed | `6be7842` |
| F4.6B-0 — Ingestion Boundary Plan | Closed | `c4ea18a` |
| F4.6B.1 — Telemetry Ingestion Boundary Skeleton | Closed | `1495457` |
| F4.6C-0 — Live Readings Projection Updater Plan | Closed | `f126c5c` |
| F4.6C.1 — Live Readings Projection Updater | Closed | `49a8349` |
| DX-1 / DX-2 / DX-3 / DX-4 | Closed | `b19e77a` / `e3ccb52` / `65cb736` / `04dadc4` |
| Master roadmap refresh after DX-4 | Closed | `7c54f82` |
| **F4.6D-0 — Alarm Evaluation Boundary Plan** (this document) | **Current** | *(pending)* |
| F4.6D.1 — Alarm Evaluation Implementation | Deferred (next implementation phase) | — |

What this means for canonical state in the running backend:

- **`telemetry_readings`** — canonical, append-only historical record. F4.6B.1 (`1495457`) inserts here via `POST /api/v1/telemetry/ingest` (gated by `RVF_INGEST_ENABLED`). F4.6C.1 (`49a8349`) does **not** write to this table; it only reads its companion projection.
- **`live_readings`** — derived latest-value projection. **Populated by F4.6C.1** (`49a8349`) inside the same `prisma.$transaction` as the canonical insert. Quality-gated to `quality === 'good'` (lower-quality samples still persist canonically but never overwrite the projection). Watermark-gated by `timestamp` (strictly newer overwrites — equal timestamps do **not** overwrite, no tie-breaker introduced).
- **Alarm evaluation** — **not implemented yet.** The ingestion service spec (`apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts`) carries an explicit isolation invariant asserting `alarmEventCreate` is never called from the ingestion path. No production code in `apps/backend/src/` writes `prisma.alarmEvent.*` today.

Roadmap anchor: **`7c54f82` (Refresh master roadmap after DX-4)**. The §7 sequence there names F4.6D-0 as the next implementation phase.

## 3. Architectural Position

Alarm evaluation sits **downstream of canonical persistence** and **upstream of fan-out**. The full RVF-owned data path is:

```
external input  →  ingestion boundary  →  telemetry_readings  →  live_readings  →  alarm evaluation  →  alarm_events
   (any kind)        (F4.6B.1)            (canonical,            (latest-good      (F4.6D)              (persisted
                                          append-only)            projection,                            lifecycle)
                                                                  F4.6C.1)
```

Two principles govern the placement:

1. **Alarm evaluation consumes canonical persisted values, not raw untrusted inputs.** External brokers, edge agents, or simulators may *propose* readings via the ingestion boundary, but the evaluator only ever sees a row that has already passed validation, source resolution, sensor/tag binding, and dedup. This preserves ADR-008 §3 decision 1 (external systems are adapters, not source of truth) and ADR-005 (browser / external boundary).
2. **The evaluator decides which canonical surface to consult based on the rule kind, not the message kind.**
   - **Simple threshold rules** (the F4.3-seeded `high` / `high_high` cases) can evaluate against the single freshly-inserted reading inside the same ingestion transaction, or against the `live_readings` row that the projection step just wrote (they will agree by F4.6C.1's transactional contract when the reading is `good`).
   - **Stateful rules** (deadband, debounce, rate-of-change — none of which are exercised by the seed today; see §5 and §8) would consult `telemetry_readings` for recent history and `alarm_events` for the current open state on the same `(unit, canonical_tag, severity)`.

F4.6D.1 is expected to ship the simple-threshold path first (see §6). Stateful-rule support is explicitly deferred (see §7).

What stays the same:

- `telemetry_readings` remains the append-only historical record. The evaluator never `UPDATE`s or `DELETE`s a reading. It may read it.
- `live_readings` remains a derived projection. The evaluator never writes to it (only F4.6C.1's `LiveReadingsProjectionService` does, per the master roadmap Phase Control Rule §8.7).
- WebSocket / SSE fan-out remains owned by F4.6E. The evaluator emits no socket events; it produces a row (and only when the rule says so).

## 4. Alarm Evaluation Ownership

RVF Malinois owns, end to end, the following alarm-related concerns:

- **Alarm rules.** The `alarm_rules` table (F4.2B baseline, populated by the F4.3 seed). Versioned via `version` + `is_current = true` per `(unit_id, canonical_tag_id, severity)`.
- **Alarm thresholds.** Per-rule numeric cutoffs in the `low_low` / `low` / `high` / `high_high` columns of `alarm_rules`, plus the reserved `alarm_thresholds` table for multi-step / rate-of-change rules (currently unused by the seed; reserved for future use per the schema comment).
- **Severity mapping.** The fixed CHECK enum `('info', 'warning', 'critical')` shared by `alarm_rules.severity` and `alarm_events.severity`.
- **Alarm evaluation logic.** F4.6D.1 introduces the first production code authorized to compute alarm outcomes from canonical readings.
- **Alarm state.** The `alarm_events.state` CHECK enum `('active', 'acknowledged', 'cleared')`, with a partial index `alarm_events_active_idx` already present in the baseline migration for the active-alarm board.
- **Alarm events / history.** The `alarm_events` table is the canonical persisted occurrence record. Rows there are owned by F4.6D.1 onward.
- **Future acknowledgment / clear workflow.** Out of scope for F4.6D.1 (see §7), but the `acknowledged_at` / `acknowledged_by` / `cleared_at` columns and the `acknowledgedByUser` relation already exist in the schema, reserving the surface.
- **Audit trail.** ADR-005 mandates that each lifecycle transition is also logged in `audit_logs`. The `alarm_events` table comment records this expectation; wiring an `audit_logs` write is a candidate later sub-phase (not F4.6D.1).

What RVF Malinois **does not** delegate to any external system:

- ThingsBoard may not own canonical alarm rules, alarm events, or alarm lifecycle.
- Node-RED may not evaluate alarms whose results are treated as canonical.
- MQTT brokers, OPC-UA servers, Modbus gateways, PLCs, edge devices, historians, or any other external tool may feed *readings* through the ingestion boundary, but **none of them is a source of truth for an alarm decision**. If a vendor stack independently raises its own alarm, RVF treats that as input to be ingested (potentially as a digital-status reading), not as an RVF `alarm_events` row.

This continuity of ownership is the same principle ADR-006 / ADR-007 / ADR-008 apply at the API / data / telemetry layers, now extended to the operational-signal layer.

## 5. Existing Alarm Surface Inventory

Direct repository evidence as of `7c54f82`. No surface is invented here.

### 5.1 Database — Prisma schema

`apps/backend/prisma/schema.prisma` already declares three alarm models (lines 344–438):

- **`AlarmRule`** (`alarm_rules`).
  Fields: `id`, `tenantId`, `unitId`, `canonicalTagId`, `severity`, `enabled` (default `true`), `lowLowThreshold`, `lowThreshold`, `highThreshold`, `highHighThreshold`, `deadband`, `delaySeconds`, `messageTemplate`, `version`, `isCurrent` (default `false`), `createdBy`, `createdAt`.
  Indexes / constraints (Prisma): `@@unique([unitId, canonicalTagId, severity, version], map: "alarm_rules_unit_tag_severity_version_uk")`, plus `tenant`, `unit`, `canonical_tag` btree indexes.
  Raw-SQL extra (baseline migration, see §5.2): partial unique `alarm_rules_unit_tag_severity_current_uk` on `(unit_id, canonical_tag_id, severity) WHERE is_current = true`.

- **`AlarmThreshold`** (`alarm_thresholds`).
  Reserved for multi-step / rate-of-change thresholds. Fields: `id`, `alarmRuleId`, `kind` (CHECK enum `('low_low', 'low', 'high', 'high_high', 'rate_of_change')`), `value`, `deadband`, `delaySeconds`, `createdAt`.
  **Schema comment explicitly states: "Not required to be populated in F4.2; reserved for future use."** The F4.3 seed does not insert into this table.

- **`AlarmEvent`** (`alarm_events`).
  Fields: `id`, `tenantId`, `unitId`, `canonicalTagId`, `alarmRuleId` (nullable, `ON DELETE SET NULL`), `severity`, `triggeredValue`, `thresholdViolated` (CHECK enum `('low_low', 'low', 'high', 'high_high', 'rate_of_change')`), `state` (CHECK enum `('active', 'acknowledged', 'cleared')`, default `'active'`), `firstTriggeredAt`, `acknowledgedAt`, `acknowledgedBy`, `clearedAt`, `jobId` (nullable, `ON DELETE SET NULL`), `ruleSnapshot` (JSONB, **required**), `createdAt`, `updatedAt`.
  Indexes: tenant, `(unit_id, first_triggered_at DESC)`, canonical_tag, job, and the partial `alarm_events_active_idx` on `(tenant_id, unit_id, first_triggered_at DESC) WHERE state = 'active'`.

Severity enum is consistent across both `alarm_rules` and `alarm_events`: `('info', 'warning', 'critical')`.

### 5.2 Database — Migrations

`apps/backend/prisma/migrations/`:

- `20260524000000_f4_2_baseline/migration.sql` — declares `alarm_rules`, `alarm_thresholds`, and `alarm_events` with their CHECK enums and indexes, including the active-alarm partial index. Every alarm artifact F4.6D.1 needs is **already present**; F4.6D.1 does not require a new migration.
- `20260526000000_f4_6a_telemetry_hardening/migration.sql` — F4.6A.1 hardening of telemetry surface only. No alarm-table change.

No alarm-related migration is pending.

### 5.3 Seed data

`apps/backend/prisma/seed.f4.ts` (F4.3, commit `91e17aa`):

- **28 alarm rules total** — 14 per unit, across `HP-001` and `LP-001`.
- Per unit, **two rules per canonical tag** (`warning` + `critical`), covering 7 tags: `p_inlet`, `p_outlet`, `t_inlet`, `q_liquid`, `q_gas`, `level_separator`, `vib_x`.
- Each rule is upserted with `version: 1`, `isCurrent: true`, `enabled: true`, `createdBy = systemUser.id`, and a `messageTemplate`.
- **Only `high` and `high_high` thresholds are seeded** (the `AlarmRuleDef` interface explicitly notes: *"F4.3 only uses high / high_high"*). `lowLowThreshold`, `lowThreshold`, `deadband`, and `delaySeconds` are not populated. F4.6D.1 must handle this asymmetry — see §6 and §9.
- No `alarm_thresholds` rows are seeded. No `alarm_events` rows are seeded.

### 5.4 Backend modules / services / controllers

None for alarm evaluation. `apps/backend/src/` modules are: `common`, `config`, `equipment`, `health`, `jobs`, `prisma`, `realtime`, `tags`, `telemetry`, `tenants`, `wells`. There is **no `alarms/` directory**, no `AlarmModule`, no `AlarmService`, no alarm controller.

Closest indirect surface:

- `apps/backend/src/equipment/equipment.service.ts` includes `alarmRules` as part of the per-unit detail include (`UNIT_DETAIL_INCLUDE.alarmRules` — filtered to `is_current = true`, ordered by `canonical_tag_id` + `severity`, with a small canonical-tag scalar join). This is a **read-only catalog surface**, not evaluation.
- `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` declares an `alarmEventCreate` vi mock (lines 210 / 229 / 276) used only to **assert it is never called** (lines 639, 654). This isolation invariant — ingestion does not write `alarm_events` — must continue to hold after F4.6D.1.

### 5.5 Frontend

- `apps/web/types/api/alarm.ts` declares `AlarmType`, `AlarmSeverity`, `AlarmConfiguration` (F3 §10 / ADR-005 / ADR-006). This describes **alarm configurations**, not events. `AlarmSeverity` is the same `'info' | 'warning' | 'critical'` triple.
- `apps/web/app/api/alarms/route.ts` — F3 Next.js API route reading from the F3 mock adapter (`@/lib/api-data`'s `getAlarms` / `getAlarmsByUnitId`). Read-only, GET-only; POST / PUT / DELETE / PATCH return `methodNotAllowed`. Backed by mocks, not by the backend `alarm_rules` table.
- `apps/web/app/api/alarms/[id]/route.ts` — similar mock surface for single-record reads.
- `apps/web/app/(rvf-console)/alarms/page.tsx` — alarms screen, mock-backed.

The frontend has no alarm-event view, no event-lifecycle controls, and no integration with the backend `/api/v1/*` surface for alarms.

### 5.6 Tests

- `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` — the `alarmEventCreate` isolation invariant noted in §5.4.
- `apps/backend/src/equipment/equipment.service.spec.ts` — asserts `include.alarmRules` is shaped to load only current rules (line 222), proving the read-surface contract is held by an existing F4.4 test.

No backend tests evaluate alarm rules against readings today. F4.6D.1 will introduce the first.

### 5.7 Summary

What exists today: the **persistence model** for rules / thresholds / events (schema + baseline migration), a **seeded reference set** of 28 high-band rules, a **read-only catalog include** in the equipment module, an **isolation invariant** keeping ingestion out of the events table, and a **mock-backed frontend alarms surface** unrelated to the backend table.

What does not exist: any evaluation logic, any `AlarmModule` / `AlarmService`, any production write to `alarm_events`, any low-band or rate-of-change rule in the seed, any deadband / debounce population, any lifecycle handling, and any wiring from `live_readings` to alarm output.

## 6. Proposed F4.6D.1 Implementation Boundary

F4.6D.1 introduces the **first** backend collaborator authorized to write `prisma.alarmEvent.*`, following the pattern F4.6C.1 established for `prisma.liveReading.*`. The scope is intentionally narrow.

### 6.1 In-scope for F4.6D.1

- **New service.** `apps/backend/src/alarms/alarm-evaluation.service.ts` (file path TBD by F4.6D.1; the directory is currently absent — see §5.4). Pure deterministic evaluator with one principal method.
- **Module wiring.** A minimal `AlarmsModule` (or extension of the existing `TelemetryModule`) so the evaluator can be injected into the ingestion path. The choice between a new module and a sibling under `telemetry/` is a small F4.6D.1 decision — both are acceptable as long as the isolation invariants in §13 hold.
- **One public method.** Signature shape (to be refined in F4.6D.1, not locked here):
  ```
  evaluate(input: {
    tenantId, unitId, sensorId, canonicalTagId,
    value: number, quality: 'good' | 'uncertain' | 'bad',
    timestamp: Date,
  }, client?: PrismaClient | Prisma.TransactionClient): Promise<AlarmEvaluationOutcome>
  ```
  with `AlarmEvaluationOutcome` an internal discriminated union covering at least: `no_rule`, `skipped_disabled`, `skipped_quality`, `no_threshold_violated`, `triggered`. (Persistence — i.e., whether `triggered` also writes an `alarm_events` row — is the §10 decision.)
- **Rule lookup.** Read the **current** rules for the `(unitId, canonicalTagId)` pair via `alarm_rules WHERE is_current = true AND enabled = true`, ordered for deterministic severity precedence (`critical` before `warning` before `info`).
- **Threshold comparison.** Deterministic numeric comparison against the populated threshold fields. Behavior for null thresholds: a `null` cutoff means "this band is not configured for this rule" — comparisons against it always return *not violated* (never throw).
- **Quality gate.** Mirror the F4.6C.1 contract — only `quality === 'good'` reaches threshold comparison. `uncertain` and `bad` short-circuit to `skipped_quality`. The reading is **not** removed from `telemetry_readings` (canonical history is preserved) — only the alarm decision is skipped.
- **Disabled-rule handling.** `enabled = false` rules are skipped before threshold comparison (`skipped_disabled`). `is_current = false` rules are filtered at the query level — they are not eligible.
- **Severity preservation.** The severity recorded in any future `alarm_events` row equals the severity of the matched `alarm_rules` row (no re-mapping). The `thresholdViolated` field on the event records which band crossed (`'high_high' | 'high' | 'low' | 'low_low'` — `'rate_of_change'` is out of scope for F4.6D.1, see §7).
- **`ruleSnapshot` capture.** When persisting (if §10 chooses persistence), the row's `rule_snapshot` JSONB copies a frozen snapshot of the rule fields at trigger time, so future rule edits cannot retroactively re-interpret the event. Same pattern F4 already uses for `CommissioningSnapshot`.
- **Wiring point.** Called from inside `TelemetryIngestionService` after the `LiveReadingsProjectionService` upsert step, **inside the same `prisma.$transaction(async (tx) => …)`**. Rationale: keeps canonical insert + projection upsert + alarm evaluation atomic. If the evaluator throws, the transaction rolls back and the outer ingestion catch surfaces the sample as `rejected_quarantined` with `reason='mapping_engine_failure'` (already in the F4.6A.1 CHECK enum — no new reasons introduced, exactly as F4.6C.1 did).
- **Unit-test coverage.** Mocked-Prisma vitest spec covering every outcome (§9), plus an isolation assertion that the evaluator never reads or writes outside `alarm_rules` / `alarm_events`.
- **Ingestion-spec extension.** The existing `telemetry-ingestion.service.spec.ts` gets new assertions: evaluator called for accepted-good, not called for uncertain / bad / duplicate / conflict / rejected. The legacy "never calls `alarmEventCreate`" invariant moves to "never calls `prisma.alarmEvent.*` **directly** — delegates to `AlarmEvaluationService`" (exact mirror of how F4.6C.1 refined test #17).

### 6.2 Out-of-scope (deferred)

See §7 for the full list, but in short: stateful rule semantics (deadband, debounce, rate-of-change), event lifecycle transitions (acknowledge / clear), the public read API for events, notifications, frontend dashboards, and WebSocket / SSE fan-out.

### 6.3 What F4.6D.1 explicitly does **not** touch

- `apps/backend/prisma/schema.prisma` — no model change.
- `apps/backend/prisma/migrations/` — no new migration.
- `apps/backend/prisma/seed.f4.ts` — no seed change. F4.6D.1 evaluates the existing 28 high-band rules. Low-band coverage is a seed enhancement deferred to a later sub-phase.
- `apps/backend/src/realtime/` — no fan-out emit.
- `apps/web/` — no frontend change. The mock `/api/alarms` route and `(rvf-console)/alarms/page.tsx` continue to behave exactly as today.
- `docker-compose.yml`, root `package.json`, lockfile, `turbo.json`, `tsconfig*.json`, `.env*`, CI config.

## 7. Non-Goals

Explicitly **out of scope** for F4.6D.1, each with the phase that should own it:

- **Full alarm dashboard / frontend alarm lifecycle UI** — out of scope. Future screen-migration sub-phase, after `alarm_events` has data.
- **Notifications (email / SMS / WhatsApp / push / webhooks)** — out of scope. Candidate dedicated phase, not in the F4.6 arc.
- **Escalation workflows** — out of scope. Same as above.
- **Maintenance ticket generation** — out of scope. Future cross-cutting concern; not RVF-Malinois-only.
- **Complex rule DSL** — out of scope. F4.6D.1 evaluates the existing numeric-threshold model only. Boolean expressions, multi-tag conditions, and scripted rules are deferred.
- **Predictive analytics / anomaly detection** — out of scope. Not in the F4.6 arc.
- **External alarm delegation to ThingsBoard / Node-RED** — explicitly forbidden by §4 / ADR-006 / ADR-008. Not deferred — never.
- **WebSocket / SSE fan-out of alarm events** — owned by F4.6E (per Master Roadmap §7). F4.6D.1 must not emit from `apps/backend/src/realtime/`.
- **Public read APIs for alarm events** — owned by a separate API sub-phase (candidate `F4.6D.2 — Alarm Events Read API`, not yet on the roadmap). F4.6D.1 stays internal / service-level (§11).
- **Event lifecycle transitions** (active → acknowledged → cleared) — owned by a dedicated future sub-phase (candidate `F4.6D.3 — Alarm Lifecycle`). F4.6D.1 writes `state = 'active'` only and does not transition rows.
- **Deduplication / event aggregation across repeated triggers** — owned by F4.6D.3. F4.6D.1 must define what it does about repeated triggers (see §13 risk; the recommended default is "no merge, but no duplicate either while the event is `active`" — to be refined in F4.6D.1).
- **Stateful threshold semantics: deadband, debounce (`delay_seconds`), rate-of-change** — out of scope. F4.6D.1 is *level-only*. The `deadband` and `delay_seconds` columns in `alarm_rules` exist (§5.1) but F4.6D.1 treats them as advisory metadata, not enforced behavior. A dedicated sub-phase (candidate `F4.6D.4 — Stateful Threshold Semantics`) owns enforcement.
- **Low-band rule support in the seed** — `alarm_rules.lowThreshold` / `lowLowThreshold` exist in the schema but F4.3 does not populate them. F4.6D.1 *evaluator* must handle them correctly (null = not configured), but expanding the **seed** to include low-band rules is a separate seed-enhancement task.
- **`alarm_thresholds` (multi-step) and rate-of-change** — reserved table is unused; F4.6D.1 ignores it. A future stateful-rules phase owns it.
- **`audit_logs` writes on alarm-event creation** — deferred to the alarm-lifecycle sub-phase that introduces acknowledge / clear (each lifecycle transition is what ADR-005 mandates audit on; F4.6D.1 only creates the initial `active` row).

## 8. Rule Model Assumptions

F4.6D.1 evaluates the rule model that already exists. Repository evidence (§5.1, §5.3) makes the following minimal model concrete:

| Field | Source | Used in F4.6D.1 |
|---|---|---|
| `unitId` | `alarm_rules.unit_id` | Yes — rule lookup key. |
| `canonicalTagId` | `alarm_rules.canonical_tag_id` | Yes — rule lookup key. |
| `severity` | `alarm_rules.severity` (CHECK enum `info` / `warning` / `critical`) | Yes — copied into the event verbatim. Used for ordering when multiple rules match. |
| `enabled` | `alarm_rules.enabled` (default `true`) | Yes — `enabled = false` short-circuits to `skipped_disabled`. |
| `isCurrent` | `alarm_rules.is_current` | Yes — only `is_current = true` rules are eligible (filter at the query layer). |
| `version` | `alarm_rules.version` | Read for `rule_snapshot` capture only; not used in comparison logic. |
| `lowLowThreshold`, `lowThreshold`, `highThreshold`, `highHighThreshold` | `alarm_rules.*_threshold` (Decimal, nullable) | Yes — each non-null threshold defines a band the evaluator compares the reading against. Null bands always return *not violated*. |
| `deadband` | `alarm_rules.deadband` | **Read but not enforced** in F4.6D.1 (advisory; see §7). |
| `delaySeconds` | `alarm_rules.delay_seconds` | **Read but not enforced** in F4.6D.1 (advisory; see §7). |
| `messageTemplate` | `alarm_rules.message_template` | Read into `rule_snapshot`; not used in comparison logic. |
| `value` | The incoming reading (`telemetry_readings.value` or the ingestion sample) | Yes — left operand of every comparison. |
| `quality` | The incoming reading (`telemetry_readings.quality`) | Yes — short-circuit per §6.1. |
| `timestamp` | The incoming reading (`telemetry_readings.timestamp`) | Yes — recorded as `alarm_events.first_triggered_at` when an event is created. |

Other entities the evaluator reads but does not mutate:

- `MeasurementUnit` — only via the `unit_id` foreign key; no other field consulted.
- `CanonicalTag` — only via `canonical_tag_id`; `canonical_unit` and `display_name` are not part of comparison logic.
- `Sensor`, `TransmitterDevice`, `SensorTagBinding` — not consulted directly; the ingestion boundary has already resolved the `(unitId, sensorId, canonicalTagId)` triple before the evaluator is called.

**No DSL is proposed.** Boolean expressions, multi-tag conditions, scripted rules, and time-windowed predicates are deferred (§7). The schema does not require them; the seed does not exercise them.

## 9. Evaluation Semantics

The semantics below define **what F4.6D.1's tests will assert**. Each item is paired with the existing repository convention it leans on.

### 9.1 Comparison rules (level-only)

- **`high_high` band.** Triggered when `value > highHighThreshold` (strict). Not triggered when `value <= highHighThreshold`.
- **`high` band.** Triggered when `value > highThreshold` (strict). Not triggered when `value <= highThreshold`.
- **`low` band.** Triggered when `value < lowThreshold` (strict). Not triggered when `value >= lowThreshold`.
- **`low_low` band.** Triggered when `value < lowLowThreshold` (strict). Not triggered when `value >= lowLowThreshold`.

**Convention proposed for F4.6D.1 confirmation:** the strict-inequality boundary above ("at the threshold is *not* a violation; only crossing it is"). Rationale: the F4.3 seed names the values as the *limit* the equipment is rated to (HP-001 `p_inlet` `high_high` = 5000 with the message "*at design limit (critical)*"), which is more consistent with strict than non-strict. The repo does not document inclusive vs. exclusive elsewhere. **F4.6D.1 should confirm this convention in code and tests; if the operations team prefers inclusive, the test names and the comparison operator change together — no schema impact.**

### 9.2 Severity precedence (when multiple rules match the same reading)

For a given `(unit_id, canonical_tag_id)`, the seed creates two `is_current = true` rules: one `warning` (high) and one `critical` (high_high). When a reading exceeds the `high_high` value, both rules are violated. F4.6D.1 must define precedence:

- **Recommended:** evaluate all matching `is_current = true, enabled = true` rules and produce **one outcome per matched rule** (i.e., a single reading may trigger up to four events: one per band). This keeps each event row tied to a single rule and a single `thresholdViolated` band, which is what the schema is shaped for (`alarm_events.alarm_rule_id` is a single nullable FK; `threshold_violated` is a single value).
- **Alternative:** collapse to the most severe violation only. Less faithful to the schema (loses the warning row when both fire); harder to reason about lifecycle later. **Not recommended.**

F4.6D.1 confirms the recommended approach in tests.

### 9.3 Quality semantics (mirrors F4.6C.1)

- `quality === 'good'` → evaluation proceeds.
- `quality === 'uncertain'` → `skipped_quality` outcome. Reading still persists to `telemetry_readings` (canonical history preserved by F4.6B.1). Live-readings projection already filtered this case in F4.6C.1. No alarm event.
- `quality === 'bad'` → identical to `uncertain`.

### 9.4 Staleness semantics

`live_readings` already enforces a strictly-newer watermark (F4.6C.1). The evaluator in F4.6D.1 operates on the **incoming** reading inside the ingestion transaction, not on a snapshot of `live_readings`, so staleness is not directly an evaluator concern — by the time the evaluator runs, the reading is the current one being persisted. *Late readings* (whose timestamp is older than the projection's `timestamp`) persist to `telemetry_readings` but **do not update the projection**. F4.6D.1 must decide what to do with a late reading for alarm purposes:

- **Recommended for F4.6D.1:** late readings **still trigger evaluation** against `alarm_rules`. Rationale: a high-value reading from 10 seconds ago is still operationally meaningful even if a newer reading already overwrote the projection. The evaluator does not depend on the projection.
- The decision is *not* "skip late readings for alarms"; that would silently drop signal.

If a later phase introduces stateful semantics (deadband / debounce), the staleness story is revisited there.

### 9.5 Planned test cases for F4.6D.1

At minimum:

1. **`high_high` not triggered** when `value == highHighThreshold` (boundary inclusive-side).
2. **`high_high` triggered** when `value > highHighThreshold` (boundary crossed).
3. **`high` not triggered** when `value <= highThreshold` (with `high_high` null or not exceeded).
4. **`high` triggered** when `value > highThreshold`.
5. **`low` not triggered** when `value >= lowThreshold`.
6. **`low` triggered** when `value < lowThreshold`.
7. **`low_low` not triggered** when `value == lowLowThreshold`.
8. **`low_low` triggered** when `value < lowLowThreshold`.
9. **Null bands are ignored** — a rule with only `high` configured does not synthesize a `low` or `high_high` decision.
10. **`enabled = false` rule is skipped** (`skipped_disabled`).
11. **`is_current = false` rule is not even loaded** (asserted via the Prisma query shape: `where: { isCurrent: true, enabled: true }`).
12. **Severity is copied verbatim** from the matched rule into the outcome (and into the event row, if persisted).
13. **`thresholdViolated` correctly identifies the band** (`'high'` vs `'high_high'` vs `'low'` vs `'low_low'`).
14. **Severity precedence test:** a reading that crosses both `high` (warning) and `high_high` (critical) produces **two outcomes** (per §9.2 recommendation) — one per matched rule.
15. **`quality = 'uncertain'` short-circuits** to `skipped_quality`. No `prisma.alarmEvent.*` call.
16. **`quality = 'bad'` short-circuits** to `skipped_quality`. No `prisma.alarmEvent.*` call.
17. **No rule for the `(unit, tag)`** → `no_rule` outcome. No event.
18. **Isolation:** the evaluator does not call `prisma.telemetryReading.*` (it consumes the input), does not call `prisma.liveReading.*`, does not call `realtime.*`, does not call anything under `jobs/`.
19. **Race / transaction:** if persistence is enabled (§10), failure inside the evaluator rolls back the ingestion transaction (matches F4.6C.1's `mapping_engine_failure` path).

Total expected new tests for F4.6D.1: **~15–20**, plus ~6 new assertions added to the existing `telemetry-ingestion.service.spec.ts` (mirrors the F4.6C.1 pattern of `+11 service + +9 integration = +20`). Final count to be reported by the F4.6D.1 closeout.

## 10. Persistence Decision

The choice is:

**A.** Evaluation-only. F4.6D.1's service returns a deterministic outcome object; no `alarm_events` row is written. A later sub-phase wires persistence.

**B.** Evaluator persists `alarm_events` rows for `triggered` outcomes (matching the schema's `state = 'active'` default).

**Recommendation: option B (persist), with no lifecycle transitions.**

Reasoning grounded in repository evidence:

- The `alarm_events` table already exists with every column F4.6D.1 needs: `severity`, `triggered_value`, `threshold_violated`, `state` (default `'active'`), `first_triggered_at`, `rule_snapshot` (required JSONB), the active-board partial index. No schema work is required.
- F4.6C.1 established the pattern of "first phase to write a previously-empty table." Doing the same for `alarm_events` keeps the F4.6 arc symmetric (B writes telemetry, C writes the projection, D writes events).
- An evaluation-only sub-phase that returns outcomes but writes nothing is observable only via test mocks. It contributes no operational value to a developer running the stack locally. Persisting means `alarm_events` finally has data, which (a) lets the existing active-alarm partial index prove itself, and (b) gives a future frontend / API sub-phase something to read.
- The lifecycle work (acknowledge / clear / audit) does **not** need to land in the same phase. F4.6D.1 writes rows in the `active` state only and leaves them alone. The `acknowledged_*` and `cleared_at` columns are nullable; the schema already accommodates this.

**No new schema in F4.6D-0 or F4.6D.1.** The existing tables suffice. If a future phase needs a `severity_order` numeric, a `last_seen_at`, a `trigger_count`, or a cross-rule grouping key, that becomes its own plan-first phase (F4.6D.3 or later) and follows DX-2 for the migration.

If the team prefers option A as a more conservative first step, the F4.6D.1 plan accepts that choice with a strictly-additive cost: a follow-up F4.6D.1b would wire persistence and re-run the same test plan with the mock changed to a real call. The recommended path stays B.

## 11. API Decision

**Recommended: keep F4.6D.1 internal / service-level. No public HTTP endpoint.**

Reasoning:

- The Master Roadmap §7 lists F4.6D as "alarm evaluation," not "alarm read API." A read endpoint for `alarm_events` is naturally a separate concern (a candidate `F4.6D.2 — Alarm Events Read API`).
- The ingestion path is the only caller of the evaluator. There is no operator workflow that needs to "evaluate this single reading" from outside.
- A frontend alarm dashboard is out of scope (§7). When it lands, the read API can be sized to its needs (filters, pagination, severity histograms) — designing it now would either underbuild (frontend forces a redesign) or overbuild (filters no one needs).
- ADR-008 §3 decision 1 says external systems are adapters, not sources of truth; an *outbound* "evaluate this for me" API would invert that.

If the team later wants the `alarm_events` table queryable from the existing `/api/v1` surface, that should be a small sub-phase of its own (candidate F4.6D.2), planned-first per DX-3.

## 12. Test Plan

### 12.1 Coverage targets

- **New service spec:** `apps/backend/src/alarms/alarm-evaluation.service.spec.ts` (path TBD) — the ~15–20 cases in §9.5. Uses mocked Prisma in the same style as `live-readings-projection.service.spec.ts` (F4.6C.1) and `telemetry-ingestion.service.spec.ts` (F4.6B.1).
- **Existing ingestion spec extension:** `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` — ~6 new assertions covering "evaluator called for accepted-good," "not called for uncertain / bad / duplicate / conflict / rejected," "rollback on evaluator throw → `mapping_engine_failure`," "no direct `prisma.alarmEvent.*` call from ingestion."
- **Existing isolation invariant — kept and refined:** the F4.6B.1 / F4.6C.1 assertion that the ingestion service never calls `prisma.alarmEvent.*` directly moves to "never calls `prisma.alarmEvent.*` directly — delegates to `AlarmEvaluationService`." Same refactoring F4.6C.1 did for `prisma.liveReading.*`.

### 12.2 Fixtures / factories needed

- Rule fixture builder: given a partial `AlarmRule` (severity, threshold band, value), returns a full row shaped for the mocked Prisma client.
- Reading fixture builder: given `(value, quality, timestamp)`, returns the shape the evaluator's `evaluate(...)` input expects.
- No real-DB fixture is required for F4.6D.1 (mocked Prisma matches the F4.6B.1 / F4.6C.1 convention).

### 12.3 Validation commands (matches DX-3 §"Runtime phases")

- `pnpm --filter @rvf/backend exec prisma validate`
- `pnpm --filter @rvf/backend exec prisma generate` (no change expected — F4.6D.1 does not edit the schema)
- `pnpm --filter @rvf/backend run lint -- --max-warnings 0`
- `pnpm --filter @rvf/backend run typecheck`
- `pnpm --filter @rvf/backend run build`
- `pnpm --filter @rvf/backend run test` — expected total **~130–135 tests** (current 111 + ~15–20 new in alarm spec + ~6 in ingestion spec; final count reported in the F4.6D.1 closeout).
- Workspace-wide `pnpm lint` / `typecheck` / `build` — clean. Web build expected cached (no frontend change).

### 12.4 What F4.6D-0 itself runs

**Nothing.** This is a docs-only plan phase. DX-3 §"Documentation-only phases" prescribes a `git diff --stat` confirming only `docs/` (and the closeout file itself) changed, plus `git status`, plus the commit / push when authorized. No lint, no typecheck, no test runs are warranted by F4.6D-0.

## 13. Risks and Guardrails

| Risk | Mitigation |
|---|---|
| Evaluating raw input before canonical persistence. | F4.6D.1 wires the evaluator **after** the `telemetryReading.create` and the `LiveReadingsProjectionService.updateFromAcceptedTelemetry` calls, **inside the same `prisma.$transaction`** F4.6C.1 introduced. The evaluator never sees a sample that has not been validated, source-resolved, and dedup-checked. |
| Duplicate alarm events from repeated triggers above the same threshold. | F4.6D.1 writes `state = 'active'` rows freely (one per matched rule per accepted reading) **only because** lifecycle / dedup is explicitly deferred to a later sub-phase (§7). The plan must explicitly accept this — repeated triggers will produce repeated `active` rows in F4.6D.1. The mitigation is **scope acknowledgement**, not code, and the F4.6D.3 plan will introduce per-`(unit, canonical_tag, severity)` open-event reconciliation. Alternative: F4.6D.1 could add a minimal "do not create if an `active` row already exists for the same key" guard — to be confirmed in F4.6D.1. The plan recommends the minimal guard. |
| Threshold boundary ambiguity (inclusive vs. exclusive). | §9.1 proposes **strict** inequalities and gives the F4.3-seed-message rationale. F4.6D.1 confirms in code and test names. If reversed later, the test names and one operator change together; no schema impact. |
| Stale `live_readings` values. | Not an evaluator concern — the evaluator operates on the incoming reading inside the ingestion transaction (§9.4), not on a `live_readings` snapshot. Late readings still trigger evaluation. |
| Mixing current alarms with historical events too early. | The `alarm_events` table already separates current vs. historical via the `state` column and the active-board partial index. F4.6D.1 writes `state = 'active'` only; historical-state transitions are F4.6D.3. No frontend exists yet to confuse the two. |
| Overbuilding notifications before evaluation is stable. | Notifications are listed as a non-goal (§7) with no phase number — they will not even be planned until evaluation has shipped, been reviewed, and run against real telemetry. |
| Delegating alarm ownership to external tools. | Forbidden by §4 / ADR-006 / ADR-008. F4.6D.1's isolation tests assert the evaluator does not call anything in `apps/backend/src/realtime/`, does not touch any external bridge, and does not read alarm decisions from a foreign source. Reviewer rejects any PR that introduces an inbound "alarm-already-evaluated" payload. |
| Severity precedence ambiguity when multiple rules fire. | §9.2 recommends "one outcome per matched rule" (n events for n violated rules). F4.6D.1 confirms in tests #14. |
| `rule_snapshot` drift between rule edits and event row. | F4.6D.1 captures a frozen snapshot at trigger time. Future rule edits never reinterpret existing events. |
| Stateful columns (`deadband`, `delay_seconds`) ignored without warning. | F4.6D.1 includes them in `rule_snapshot` (so the audit trail records what was configured) but treats them as advisory. The plan must document this in the F4.6D.1 closeout so a future operator does not assume hysteresis is in effect. |
| Tests in F4.6D.1 prove the *contract* but not the live-DB *behavior*. | Same limitation F4.6B.1 / F4.6C.1 carry. A future live-DB integration suite is a candidate cross-phase deliverable (mentioned in DX-1 risk table). F4.6D-0 does not introduce it. |
| ADR-008 graduation (`Proposed` → `Accepted`) confused with F4.6D landing. | ADR-008 is about the telemetry-write boundary, not alarms. F4.6D.1 does not graduate ADR-008. A separate small ADR (candidate ADR-009 or ADR-012, scope TBD) may later anchor the alarm-evaluation boundary; not in this plan. |

## 14. Acceptance Criteria for F4.6D.1

F4.6D.1 is complete when **all** of the following are true:

- [ ] An alarm-evaluation collaborator exists in `apps/backend/src/` (`alarms/alarm-evaluation.service.ts` or a sibling under `telemetry/` — exact path is F4.6D.1's choice as long as the isolation invariants hold).
- [ ] The collaborator is wired into `TelemetryIngestionService` inside the existing `prisma.$transaction` from F4.6C.1, called for `quality === 'good'` accepted samples only.
- [ ] Rule evaluation is deterministic and covered by ~15–20 mocked-Prisma unit tests covering every band, null bands, disabled / non-current rules, severity precedence, and quality short-circuits.
- [ ] High-band and low-band threshold semantics are both implemented (even though the F4.3 seed only populates high bands — the evaluator must correctly handle low bands when a rule has them).
- [ ] Strict-inequality boundary convention (§9.1) is confirmed in tests, or reversed with the same explicitness if the operations team prefers inclusive.
- [ ] Quality and staleness handling is documented in the closeout and enforced in tests (§9.3 / §9.4).
- [ ] Persistence decision per §10 is followed: if option B (recommended), `alarm_events` rows are written with `state = 'active'`, `rule_snapshot` populated; no lifecycle transitions; no notifications; no fan-out. If option A is chosen instead, no rows are written and the F4.6D.1 closeout names the follow-up sub-phase that wires persistence.
- [ ] If multiple rules fire for the same reading, one event per matched rule (§9.2 recommendation) — confirmed in tests.
- [ ] No `prisma.schema` change. No new migration. No seed change. No `apps/web/` change. No `docker-compose.yml` change. No package / lockfile / `turbo.json` / `tsconfig*.json` / `.env*` / CI change.
- [ ] No external alarm ownership introduced. The evaluator does not accept an "already-evaluated" alarm payload from any external source. ThingsBoard / Node-RED / MQTT bridges are not introduced as a side effect.
- [ ] No WebSocket / SSE emit. `apps/backend/src/realtime/` is unchanged.
- [ ] Existing F4.6B.1 and F4.6C.1 isolation invariants still hold — ingestion still does not call `prisma.alarmEvent.*` directly (it delegates); ingestion still does not touch `prisma.liveReading.*` directly (it delegates to F4.6C.1).
- [ ] DX-3 §"Runtime phases" validation surface passes end to end: `prisma validate` / `generate`, backend `lint -- --max-warnings 0` / `typecheck` / `build` / `test`, workspace `lint` / `typecheck` / `build`.
- [ ] F4.6D.1 closeout report exists at `docs/architecture/RVF_Malinois_F4_6D_1_Alarm_Evaluation_Boundary_Closeout_Report_v1.0.md`, follows the established closeout structure, names which §10 option was taken, reports the final test count, and flags any deviation from this plan.
- [ ] Master roadmap §3 is refreshed in the same commit (or an immediately-following hygiene commit) to flip F4.6D-0 and F4.6D.1 to Closed with their hashes.

## 15. Recommended Next Step

**Next step after F4.6D-0: F4.6D.1 — Alarm Evaluation Boundary Implementation.** Plan-first → implementation per the codified DX-3 pattern. Scope per §6; non-goals per §7; tests per §9.5 / §12; acceptance per §14.

After F4.6D.1, the Master Roadmap §7 sequence continues:

- **F4.6E-0 / F4.6E.1** — WebSocket / SSE Fan-out plan + implementation. Downstream of `alarm_events` (and `telemetry_readings` / `live_readings`); emits after the transaction commits, never as source of truth.
- **F4.6F-0 / F4.6F.1** — Historical Trend API plan + implementation. Bucketing / downsampling / multi-tag reads, plus the Operations chart cutover from the F2 simulator.
- **F4.5G** — Resume per-screen UI migrations for non-telemetry screens.

Candidate follow-up sub-phases not yet on the main sequence (drafted here only so they have names):

- **F4.6D.2 — Alarm Events Read API.** Public `/api/v1/alarms/events` (or equivalent) over the now-populated `alarm_events`, sized when a screen migration requires it.
- **F4.6D.3 — Alarm Lifecycle.** `active → acknowledged → cleared` transitions, dedup against open events, `audit_logs` writes per ADR-005.
- **F4.6D.4 — Stateful Threshold Semantics.** Deadband / debounce (`delay_seconds`) / rate-of-change enforcement; populates the reserved `alarm_thresholds` table when multi-step thresholds appear.

These are noted, not committed to. The next implementation phase is **F4.6D.1**.

---

*F4.6D-0 plan, authored at HEAD `7c54f82` (Refresh master roadmap after DX-4). Plan-only. Update on phase close (`Current` → `Closed` with commit hash) and when F4.6D.1 lands its closeout.*
