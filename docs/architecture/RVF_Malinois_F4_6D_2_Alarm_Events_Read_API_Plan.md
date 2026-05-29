# RVF Malinois — F4.6D.2-0 Alarm Events Read API Plan

> Phase **F4.6D.2-0 — Alarm Events Read API Plan**. Plan-first per the codified project pattern (F4.2A → F4.2B, F4.6A.0 → F4.6A.1, F4.6B-0 → F4.6B.1, F4.6C-0 → F4.6C.1, F4.6D-0 → F4.6D.1, F4.6E-0 → F4.6E.1, F4.6F-0 → F4.6F.1, F4.5G-0 → F4.5G.1, F4.5G.2-0 → F4.5G.2.1, F4.6C.2-0 → F4.6C.2.1, F4.5G.2.2-0 → F4.5G.2.2.1).
> Documentation-only artifact. No backend, frontend, schema, migration, or runtime code is modified by F4.6D.2-0. Implementation lands in **F4.6D.2.1**.
> Last known head at authoring time: commit `6ded9f1` (Refresh master roadmap after F4.5G.2.2.1).
>
> Upstream references:
> - Master Roadmap (most recent refresh): `docs/architecture/RVF_Malinois_Master_Roadmap.md` (commit `6ded9f1`).
> - F4.6D-0 plan (locks the alarm-evaluation contract this phase reads): `docs/architecture/RVF_Malinois_F4_6D_Alarm_Evaluation_Boundary_Plan.md` (commit `901cd22`).
> - F4.6D.1 closeout (the evaluator that writes the rows this phase exposes): `docs/architecture/RVF_Malinois_F4_6D_1_Alarm_Evaluation_Boundary_Closeout.md` (commit `d35a2b8`).
> - F4.6E.1 closeout (the realtime push that complements but does not replace this read API): `docs/architecture/RVF_Malinois_F4_6E_1_WebSocket_SSE_Fan_Out_Closeout.md` (commit `51dc626`).
> - F4.6C.2-0 plan / F4.6C.2.1 closeout (the latest-value read API whose patterns this phase mirrors): `docs/architecture/RVF_Malinois_F4_6C_2_Latest_Value_Read_API_Plan.md` (commit `c077478`) and `docs/architecture/RVF_Malinois_F4_6C_2_1_Latest_Value_Read_API_Closeout.md` (commit `acd68d5`).
> - F4.6F.1 closeout (the trend API contract this phase also mirrors): `docs/architecture/RVF_Malinois_F4_6F_1_Historical_Trend_API_Closeout.md` (commit `946a023`).
> - F4.5G.2.1 closeout (the realtime `alarmEventsSeen` counter seam this phase complements): `docs/architecture/RVF_Malinois_F4_5G_2_1_Operations_Realtime_Tile_Status_Wiring_Closeout.md` (commit `2457c4d`).
> - F4.5G.2.2.1 closeout (the precedent for adapter-only frontend phases — UI migration is the follow-up): `docs/architecture/RVF_Malinois_F4_5G_2_2_1_Operations_Tile_Latest_Value_Cutover_Closeout.md` (commit `5a847db`).
> - DX-3 (Definition of Done): `docs/operations/RVF_Malinois_Definition_of_Done.md` (commit `65cb736`).
> - ADR-005 (browser boundary; the browser does **not** evaluate alarms; "never lie about freshness").
> - ADR-008 (telemetry persistence; canonical state stays server-side).

## 1. Purpose

F4.6D.2-0 is the **plan-first** phase for a read-only Alarm Events API over the `alarm_events` table populated by F4.6D.1. The remaining operator-visible ADR-005 gap in the Operations screen is `<LiveActiveAlarmsPanel>`, which currently calls `evaluateReading(reading, snapshot, …)` in the browser against the F2 simulator path. F4.6D.1 has been writing server-evaluated `alarm_events` rows since `d35a2b8`, but **no read API exposes them today** — the panel cannot migrate off its browser-side path without a backend read surface to consume. F4.6D.2 fills that gap with a small NestJS controller / service / Zod contract over the populated `alarm_events` table, plus a matching frontend dual-mode adapter so screens can later consume server-evaluated state through the established F4.5E adapter pattern.

This phase **locks the decisions** F4.6D.2.1 (implementation) must respect:

- The route, query parameters, and Zod refines.
- The response envelope shape, the per-row derived view, and which projection columns stay server-side.
- Tenant-scoping posture (reusing the F4.4F / F4.6F.1 / F4.6C.2.1 `CallerContext` seam — no new auth surface).
- The frontend adapter contract and its mock / api dual-mode behavior.
- The write-isolation invariant: only `AlarmEvaluationService` writes `prisma.alarmEvent.*`; the new read service is the second authorized accessor — read-only — exactly mirroring the F4.6C.2.1 narrowing posture against `liveReading`.
- What stays out (lifecycle transitions, panel migration, chart annotations) and which future phase owns each.
- The test plan and acceptance criteria for F4.6D.2.1.

What this phase does **not** do:

- Does not implement any backend / frontend / schema / migration / runtime code.
- Does not modify F4.6D.1's `AlarmEvaluationService` (evaluator logic, threshold semantics, severity precedence, duplicate-active guard, `rule_snapshot` capture all stay byte-identical).
- Does not modify `alarm_events` / `alarm_rules` / `alarm_thresholds` schema, indexes, or seed.
- Does not introduce alarm-lifecycle transitions (`active → acknowledged → cleared`) — candidate F4.6D.3 owns those.
- Does not introduce stateful-threshold semantics (`deadband` / `delay_seconds` / rate-of-change) — candidate F4.6D.4 owns those.
- Does not migrate `<LiveActiveAlarmsPanel>` off its browser-side `evaluateReading(...)` path — that's a separate follow-up frontend phase **after** F4.6D.2.1 ships.
- Does not introduce alarm chart annotations on `<TrendChart>` / `<TrendDrawer>` — candidate F4.5G.3.
- Does not introduce notifications, alarm-rule CRUD, or external integrations.
- Does not introduce auth / rate limiting, env vars, dependencies, or `packages/types/` changes.

## 2. Current Repository State

Drawn from `git log`, the master roadmap (`6ded9f1`), and direct inspection of `apps/backend/`.

| Phase | Status | Commit |
|---|---|---|
| F4.6A.1 schema hardening (the `alarm_events` table) | Closed | `6be7842` |
| F4.6D-0 alarm evaluation boundary plan | Closed | `901cd22` |
| F4.6D.1 alarm evaluation boundary implementation | Closed | `d35a2b8` |
| F4.6E.1 realtime fan-out (emits `alarm.event.created`) | Closed | `51dc626` |
| F4.6F.1 historical trend API (the controller / service pattern this phase mirrors) | Closed | `946a023` |
| F4.6C.2-0 / F4.6C.2.1 Latest-value Read API (the most recent precedent for a read API over a populated table) | Closed | `c077478` / `acd68d5` |
| F4.5G.1 / F4.5G.2.1 / F4.5G.2.2.1 Operations UI consumers (chart, realtime status, tile primary values) | Closed | `916d067` / `2457c4d` / `5a847db` |
| Master roadmap refresh after F4.5G.2.2.1 | Closed | `6ded9f1` |
| **F4.6D.2-0 — Alarm Events Read API Plan** (this document) | **Current** | *(pending)* |
| F4.6D.2.1 — Alarm Events Read API Implementation | Deferred (next implementation phase) | — |

### 2.1 What exists for alarm events today

- **`alarm_events` table** — populated transactionally by F4.6D.1's `AlarmEvaluationService` since `d35a2b8`, inside the same `prisma.$transaction` as the canonical `telemetry_readings` insert + `live_readings` projection upsert. Schema (per `apps/backend/prisma/schema.prisma` lines 407–438, table `alarm_events`):

  ```
  id                UUID PK   (default gen_random_uuid)
  tenantId          UUID FK Tenant                onDelete: Restrict
  unitId            UUID FK MeasurementUnit       onDelete: Restrict
  canonicalTagId    UUID FK CanonicalTag          onDelete: Restrict
  alarmRuleId       UUID? FK AlarmRule            onDelete: SetNull
  severity          String                        // CHECK 'info'|'warning'|'critical'
  triggeredValue    Decimal
  thresholdViolated String                        // CHECK 'low_low'|'low'|'high'|'high_high'
  state             String  @default("active")    // CHECK 'active'|'acknowledged'|'cleared'
  firstTriggeredAt  Timestamptz
  acknowledgedAt    Timestamptz?
  acknowledgedBy    UUID? FK User                 onDelete: SetNull
  clearedAt         Timestamptz?
  jobId             UUID? FK Job                  onDelete: SetNull
  ruleSnapshot      Json                          // frozen at write time
  createdAt         Timestamptz
  updatedAt         Timestamptz (@updatedAt)

  INDEX (tenantId)                                       alarm_events_tenant_idx
  INDEX (unitId, firstTriggeredAt DESC)                  alarm_events_unit_time_idx
  INDEX (canonicalTagId)                                 alarm_events_canonical_tag_idx
  INDEX (jobId)                                          alarm_events_job_idx
  ```

- **CHECK enums** (mirrored from F4.6A.1 migration SQL into the F4.6D.1 / F4.6D-0 docs; no `Prisma`-level enum models): `severity` ∈ `{'info','warning','critical'}`; `state` ∈ `{'active','acknowledged','cleared'}`; `threshold_violated` ∈ `{'low_low','low','high','high_high'}`.

- **Only `state='active'` rows exist today.** F4.6D.1 writes only `active`; lifecycle transitions are deferred to candidate **F4.6D.3 — Alarm Lifecycle**. The `acknowledgedAt` / `acknowledgedBy` / `clearedAt` columns are reserved on the schema but unpopulated.

- **`rule_snapshot` JSONB is captured at write time.** F4.6D.1 freezes the rule (thresholds, deadband, delay_seconds, severity, message template, version) so a later rule edit cannot retroactively re-interpret the event. The snapshot is internal audit data — **not on the wire** by default in F4.6D.2 (see §9.3).

- **No-duplicate-active guard.** F4.6D.1's evaluator runs a `findFirst` on `(unitId, canonicalTagId, alarmRuleId, state='active')` before each create; if an event is open, the new trigger returns `skipped_duplicate_active` and **does not create a row**. The implication: today the `alarm_events` table contains at most one `active` row per `(unit, canonical_tag, rule)` triple at any time. F4.6D.2 reads exactly what F4.6D.1 wrote — no aggregation, no de-duplication needed at read time.

### 2.2 What backend modules / surfaces exist today

- **`apps/backend/src/alarms/`** contains only:
  - `alarm-evaluation.service.ts` — the evaluator service (F4.6D.1).
  - `alarm-evaluation.service.spec.ts` — 21+ tests for evaluator behavior.

- **No `AlarmsModule` exists.** `AlarmEvaluationService` is currently registered as a provider inside `TelemetryIngestionModule` (per the F4.6D.1 wiring). F4.6D.2.1 must introduce a new `AlarmsModule` at `apps/backend/src/alarms/alarms.module.ts` — mirrors `TenantsModule` / `WellsModule` / `EquipmentModule` / `TelemetryModule` etc. The new `AlarmsModule` owns the new read controller + service; it can optionally re-export `AlarmEvaluationService` so the ingestion module imports it cleanly (decision: keep evaluator registration where it is to avoid churn; the new module imports only the new read service).

- **No alarm HTTP route exists today.** `grep` confirms no controllers under `apps/backend/src/alarms/`. F4.6D.2.1 introduces the first.

- **`apps/backend/src/app.module.ts`** wires every feature module explicitly. F4.6D.2.1 adds `AlarmsModule` to the `imports` array (small additive change).

### 2.3 Backend access to `prisma.alarmEvent.*` today

Direct `grep` evidence:

| File | Operation |
|---|---|
| `apps/backend/src/alarms/alarm-evaluation.service.ts` line 182 | `db.alarmEvent.findFirst(...)` (no-duplicate-active guard) |
| `apps/backend/src/alarms/alarm-evaluation.service.ts` line 204 | `db.alarmEvent.create(...)` (per-rule event write) |
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` line 686 | Test #18 asserts ingestion never calls `prisma.alarmEvent.*` / `prisma.alarmRule.*` directly |

So today: **F4.6D.1's `AlarmEvaluationService` is the only writer**. The ingestion isolation invariant (test #18) forbids any other backend module from writing `prisma.alarmEvent.*`. F4.6D.2.1's new read service becomes the **second authorized accessor — read-only**. The ingestion isolation test is narrowed to "writes only" exactly as F4.6C.2.1 narrowed the `liveReading` invariant in test #17 (mirroring posture documented in F4.6C.2.1 closeout §4).

### 2.4 What F4.6E.1 gives us as the complementary realtime channel

`alarm.event.created` Socket.IO envelope (per `packages/types/src/realtime.ts`):

```ts
{
  schema: 'rvf.realtime.v1',
  kind: 'alarm.event.created',
  emittedAt: ISO-8601,
  payload: {
    alarmEventId, tenantId, unitId, canonicalTagId, alarmRuleId,
    severity, triggeredValue (Decimal-as-string), thresholdViolated,
    state: 'active',
    firstTriggeredAt: ISO-8601,
  },
}
```

F4.5G.2.1's `useOperationsRealtimeF4` already increments an `alarmEventsSeen` counter when this envelope arrives, but **the hook does not push the event into any list and the browser does not evaluate alarms**. F4.6D.2's read API is the durable read side; realtime is delivery / tail notification. The future `<LiveActiveAlarmsPanel>` migration composes the two: REST hydration on mount / reconnect + realtime appended best-effort.

### 2.5 No existing alarm read API or alarm adapter

- **Backend:** no controller, no read service, no Zod contract for `alarm_events` reads. F4.6D.2.1 introduces all three.
- **Frontend:** no `getAlarmEvents` endpoint wrapper, no `adapterGetAlarmEvents` dual-mode adapter, no `MOCK_F4_ALARM_EVENTS` fixture. F4.6D.2.1 introduces all three.
- **`<LiveActiveAlarmsPanel>`** still imports `evaluateReading` from `@/lib/alarms/evaluator` and computes alarm state in the browser against the commissioning snapshot's thresholds (F2-simulator-acceptable; api-mode ADR-005 violation). F4.6D.2 does **not** migrate the panel — the migration is the natural follow-up frontend phase.

### 2.6 Latest roadmap anchor

Master roadmap most recently refreshed at `6ded9f1`. §3 names F4.6D.2-0 as the current phase; §7 names F4.6D.2.1 as the next implementation step.

## 3. Architectural Position

Desired alarm-events data flow once F4.6D.2.1 ships:

```
┌──────────── Ingestion (existing, unchanged) ────────────────────────────┐
│                                                                          │
│  POST /api/v1/telemetry/ingest                                           │
│   → telemetry_readings insert                                            │
│   → live_readings projection upsert                                      │
│   → AlarmEvaluationService                  (F4.6D.1 — writer)           │
│       → no_threshold_violated / skipped_duplicate_active / triggered     │
│       → alarm_events INSERT (state='active', rule_snapshot frozen)       │
│   → (commit)                                                             │
│   → Socket.IO 'alarm.event.created' fan-out (F4.6E.1)                    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────── Reads (today) ──────────────────────────────────────────────┐
│                                                                          │
│  GET /api/v1/telemetry/trends     → telemetry_readings range / bucketed │
│  GET /api/v1/telemetry/latest     → live_readings current values        │
│  Socket.IO live_reading.updated   → tile / chart tail                   │
│  Socket.IO alarm.event.created    → counter (not a list)                │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────── Reads (F4.6D.2.1 adds) ──────────────────────────────────────┐
│                                                                          │
│  GET /api/v1/alarms/events        → alarm_events (read-only)            │
│                                                                          │
│  Consumer pattern (follow-up <LiveActiveAlarmsPanel> migration):        │
│    On mount  →  GET /api/v1/alarms/events?state=active[&unitId=...]     │
│    Realtime  →  Socket.IO 'alarm.event.created' → append + dedup        │
│    Reconnect →  refetch GET /api/v1/alarms/events                       │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

Three principles govern this placement (mirroring F4.6C.2-0 §3):

1. **Each backend surface has one job.** Trends = history; latest = current values; **alarms/events = server-evaluated alarm state**. F4.6D.2.1 does not duplicate any of the others.
2. **The alarm-events API is a pull surface.** It is the canonical answer to "what alarm events exist for this tenant / unit / window?" Panel hydration on mount, resync on reconnect, and stateless refresh all go through it. Realtime updates complement but do not replace it — they keep the panel fresh between resyncs without becoming source-of-truth (ADR-008 §3 decision 11; F4.5G.2-0 §3).
3. **The alarm-events API reads `alarm_events` only.** Never `telemetry_readings` (that's the trend job), never `live_readings` (current values), never the Socket.IO in-memory state, never frontend mock state. **The browser never evaluates alarms** — ADR-005 binding contract. The service performs no threshold comparison, no severity rollup, no rule lookup beyond what the snapshot already captured at write time.

## 4. Ownership and Source of Truth

| Concern | Owner |
|---|---|
| Alarm event creation | **F4.6D.1's `AlarmEvaluationService`** (`apps/backend/src/alarms/alarm-evaluation.service.ts`). First and **only** backend collaborator authorized to write `prisma.alarmEvent.*`. F4.6D.2.1 does not change this. |
| `alarm_events` table — source of truth for alarm event reads | RVF backend. `alarm_events` is the canonical record; no other table or in-memory state speaks for it. |
| Query semantics (route, params, Zod refines) | RVF backend — F4.6D.2.1 Zod contract at `apps/backend/src/alarms/contracts/events.ts`. |
| Response shape (envelope, per-row derived view, Decimal serialization) | RVF backend — F4.6D.2.1 service / contract. |
| Tenant / unit scoping | RVF backend — inherited `CallerContext` posture (matches F4.4 / F4.6F.1 / F4.6C.2.1). |
| Frontend adapter contract (mock / api dual-mode parity) | RVF frontend — F4.6D.2.1 wraps the new endpoint in `apps/web/lib/api/f4/` + `apps/web/lib/api-data/f4/` mirroring `getTelemetryLatest` / `adapterGetTelemetryLatest`. |
| Browser-side alarm computation | **Forbidden.** ADR-005 binding contract. F4.6D.2.1 enforces this by never exposing rule-shape internals (`rule_snapshot` thresholds) at the wire boundary by default — see §9.3. The consumer reads server-evaluated `severity` / `state` / `thresholdViolated` directly. |
| Authorization (currently no auth) | Project-wide — F4.6D.2.1 inherits the existing no-auth posture; not in scope to introduce. |

**Explicitly:** ThingsBoard / Node-RED / OPC-UA / MQTT / Modbus / PLC / historian / edge-gateway bridges may eventually *feed* telemetry that triggers alarm writes (via the ingestion boundary), but **none owns canonical RVF alarm state**. F4.6D.2 reads from the RVF-owned `alarm_events` table.

## 5. Existing `alarm_events` Surface Inventory

Direct repository evidence as of `6ded9f1`. No surface is invented here.

### 5.1 Schema (Prisma model `AlarmEvent`)

`apps/backend/prisma/schema.prisma` lines 407–438 (table `alarm_events`):

| Field | DB type | Nullable | Notes |
|---|---|---|---|
| `id` | UUID PK | No | `gen_random_uuid()` default |
| `tenantId` | UUID FK Tenant | No | onDelete: Restrict |
| `unitId` | UUID FK MeasurementUnit | No | onDelete: Restrict |
| `canonicalTagId` | UUID FK CanonicalTag | No | onDelete: Restrict |
| `alarmRuleId` | UUID? FK AlarmRule | Yes | onDelete: SetNull (rule can be deleted; event remains) |
| `severity` | String | No | CHECK `'info' \| 'warning' \| 'critical'` |
| `triggeredValue` | Decimal | No | JSON-serializes to string via `Decimal.toJSON` |
| `thresholdViolated` | String | No | CHECK `'low_low' \| 'low' \| 'high' \| 'high_high'` |
| `state` | String | No | CHECK `'active' \| 'acknowledged' \| 'cleared'`; default `'active'` |
| `firstTriggeredAt` | Timestamptz | No | The reading's timestamp at trigger time |
| `acknowledgedAt` | Timestamptz? | Yes | Reserved for F4.6D.3; unpopulated today |
| `acknowledgedBy` | UUID? FK User | Yes | Reserved for F4.6D.3; unpopulated today |
| `clearedAt` | Timestamptz? | Yes | Reserved for F4.6D.3; unpopulated today |
| `jobId` | UUID? FK Job | Yes | Optional Jobs linkage (Jobs flow is itself deferred) |
| `ruleSnapshot` | Json | No | Frozen rule (thresholds, deadband, delay_seconds, message template, version) |
| `createdAt` | Timestamptz | No | Row creation time (default now) |
| `updatedAt` | Timestamptz | No | `@updatedAt` |

### 5.2 Uniqueness / indexing

- **No UNIQUE constraint** beyond the surrogate `id` primary key. The no-duplicate-active guard is enforced at write time by F4.6D.1's `findFirst` precheck — there is no DB-level unique index for `(unitId, canonicalTagId, alarmRuleId, state='active')` today (the partial unique index mentioned in early plans was never landed). F4.6D.2 reads at most one `active` row per `(unit, tag, rule)` triple by construction, but it does not need to assert this — multiple rows would simply appear in the response.
- **INDEX `(tenantId)`** → `alarm_events_tenant_idx`. Used when the query is tenant-scoped without a unit filter.
- **INDEX `(unitId, firstTriggeredAt DESC)`** → `alarm_events_unit_time_idx`. **Primary access path for F4.6D.2** when `unitId` is supplied (the most common case for `<LiveActiveAlarmsPanel>`'s tenant + per-card lookup).
- **INDEX `(canonicalTagId)`** → `alarm_events_canonical_tag_idx`. Used when filtering by tag without unit.
- **INDEX `(jobId)`** → `alarm_events_job_idx`. Not used by F4.6D.2.1 (Jobs flow deferred).

**No new index is required for F4.6D.2.1.** The list-by-unit-and-state query hits `alarm_events_unit_time_idx` (the leading `unitId` column is present; the secondary `firstTriggeredAt DESC` is the natural ordering for the response). Tenant-scoped reads without a unit hit `alarm_events_tenant_idx`.

### 5.3 What F4.6D.1 wrote (and what F4.6D.2 reads)

Per F4.6D.1 closeout §6 and `alarm-evaluation.service.ts`:

- **Only `state='active'` rows exist.** The duplicate-active guard prevents repeated `active` rows for the same `(unit, tag, rule)` while the existing event is still open. `acknowledged` / `cleared` transitions are deferred to candidate F4.6D.3 — so the `acknowledgedAt` / `acknowledgedBy` / `clearedAt` columns are unpopulated in F4.6D.2's read responses.
- **`severity` is one of `'info' / 'warning' / 'critical'`.** F4.6D.1 reads the rule's `severity` verbatim — no rollup, no escalation.
- **`thresholdViolated` is the most severe band the value crossed within a single rule** (`high_high > high > low_low > low`). One event per matched rule, multiple matched rules can produce multiple events per reading.
- **`triggeredValue`** is the canonical persisted value at trigger time — Decimal-as-string in JSON.
- **`firstTriggeredAt`** equals the reading's `timestamp` at the moment the violation was detected.
- **`rule_snapshot`** is the frozen rule (thresholds, deadband, delay_seconds, message template, version, severity, isCurrent, createdAt). **F4.6D.2 does NOT expose this on the wire by default.** Future panels that need the thresholds (e.g., for "X is 1820 psi vs. 1800 psi limit" text) can request a small projected `thresholdContext` field as a follow-up additive extension; the F4.6D.2.1 envelope keeps the wire minimal.

### 5.4 Existing tests covering `alarm_events`

- `apps/backend/src/alarms/alarm-evaluation.service.spec.ts` — 21+ unit tests covering the evaluator (no-data-violated, severity precedence, `state='active'` write, `rule_snapshot` capture, no-duplicate-active guard, `$transaction` participation, unexpected-DB-error propagation).
- `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` test #18 — ingestion isolation invariant ("does not call `prisma.alarmEvent.*` / `prisma.alarmRule.*` directly; delegates to alarm evaluator"). F4.6D.2.1 narrows this to writes only (mirrors the F4.6C.2.1 §15.2 narrowing of test #17 against `liveReading`).

F4.6D.2.1 will be the **second** backend module authorized to access `alarm_events` — read-only.

## 6. Existing Alarms Backend Surface Inventory

Direct evidence as of `6ded9f1`.

### 6.1 `apps/backend/src/alarms/` today

- `alarm-evaluation.service.ts` — `AlarmEvaluationService` (F4.6D.1 writer).
- `alarm-evaluation.service.spec.ts` — evaluator tests.

That is **all**. There is no:

- `alarms.module.ts`
- `alarms.controller.ts`
- `alarm-events-read.service.ts`
- `contracts/` subdirectory

F4.6D.2.1 introduces:

- `apps/backend/src/alarms/alarms.module.ts` — new NestJS module wiring the new read service + controller. (See §6.2 on the existing evaluator's registration.)
- `apps/backend/src/alarms/alarm-events-read.service.ts` — the new read service.
- `apps/backend/src/alarms/alarms.controller.ts` — new controller carrying `@Get('events')`.
- `apps/backend/src/alarms/contracts/events.ts` — Zod schema + types.
- `apps/backend/src/alarms/alarm-events-read.service.spec.ts` — mocked-Prisma tests.

### 6.2 How `AlarmEvaluationService` is wired today

Per F4.6D.1, the evaluator is provided through `TelemetryIngestionModule` (the ingestion controller's module imports / exports the evaluator so the ingestion service can call it inside the canonical transaction). F4.6D.2.1 does **not** move the evaluator. The new `AlarmsModule` provides only the new read service + controller; if a future phase consolidates alarm registration into `AlarmsModule`, that is a separate decision.

**Decision for F4.6D.2-0:** keep the evaluator's current registration (inside `TelemetryIngestionModule`); the new `AlarmsModule` is a clean read-only module that imports `PrismaModule`. Avoids churn against existing evaluator tests.

### 6.3 Patterns to mirror from F4.6F.1 / F4.6C.2.1

- **One controller method per route.** F4.6D.2.1 adds `@Get('events')` on the new `AlarmsController` (controller base path `/alarms`).
- **Zod-validated query body via `ZodValidationPipe`.** F4.6D.2.1's Zod schema lives in `apps/backend/src/alarms/contracts/events.ts` mirroring `apps/backend/src/telemetry/contracts/latest.ts`.
- **`CallerContext` first-arg on the service method.** Tenant scoping is opt-in via `ctx.tenantId`; `SystemContext` reads cross-tenant (matches F4.4F / F4.6F.1 / F4.6C.2.1).
- **`PrismaService` direct access.** `prisma.alarmEvent.findMany`. No new `$queryRaw`; no SQL composition. Straight Prisma.
- **Swagger decorators.** `@ApiTags('alarms')` on the new controller; `@ApiOperation` + `@ApiQuery` per parameter.
- **Test posture.** Mocked-Prisma (matches `trends.service.spec.ts` / `latest.service.spec.ts`).

### 6.4 Frontend adapter pattern today

- `apps/web/lib/api/f4/endpoints.ts` — typed endpoint wrappers.
- `apps/web/lib/api-data/f4/<resource>.ts` — dual-mode adapter (mock branch resolves from `mock-fixtures.ts`; api branch delegates).
- `apps/web/lib/api/f4/types.ts` — frontend-typed shapes (independent of Prisma).
- `apps/web/lib/api/f4/index.ts` — barrel re-exports.

F4.6D.2.1 adds (mirroring F4.6C.2.1):

- New typed endpoint wrapper `getAlarmEvents` in `endpoints.ts`.
- New types in `types.ts` (`AlarmEventRow`, `AlarmEventsResponse`, `GetAlarmEventsParams`).
- New dual-mode adapter at a new file `apps/web/lib/api-data/f4/alarms.ts`.
- Mock fixtures `MOCK_F4_ALARM_EVENTS` (a small deterministic set under HP-001 / LP-001 — see §13.3).

## 7. Proposed F4.6D.2.1 Implementation Boundary

F4.6D.2.1 ships **backend + frontend adapter only**. `<LiveActiveAlarmsPanel>` migration is a separate follow-up frontend phase.

### 7.1 In-scope for F4.6D.2.1

- **Backend Zod contract** at `apps/backend/src/alarms/contracts/events.ts` per §8 / §9.
- **Backend read-only service** `AlarmEventsReadService` at `apps/backend/src/alarms/alarm-events-read.service.ts`. Read-only against `prisma.alarmEvent.findMany`. Accepts `CallerContext` first; honors `ctx.tenantId` when set.
- **New controller** `AlarmsController` at `apps/backend/src/alarms/alarms.controller.ts` with the `@Get('events')` method + Swagger decorators.
- **New `AlarmsModule`** at `apps/backend/src/alarms/alarms.module.ts` wiring the new service + controller. Imports `PrismaModule`. No evaluator move.
- **App-module registration** of `AlarmsModule` in `apps/backend/src/app.module.ts` — small additive change.
- **Backend tests** at `apps/backend/src/alarms/alarm-events-read.service.spec.ts` (mocked-Prisma posture).
- **Controller-level Zod-validation tests** colocated with the service spec (mirrors F4.6F.1 / F4.6C.2.1 pattern).
- **Narrow the alarm-event isolation invariant** in `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` test #18: the ingestion service does not **write** `prisma.alarmEvent.*` (today the assertion includes `findFirst` implicitly via the projection-service mock; we narrow the wording / assertions to mutations only). Read access is permitted at the module level (the new `AlarmEventsReadService` is the second authorized accessor — read-only). The mirroring of F4.6C.2.1 §15.2's `liveReading` narrowing.
- **Frontend typed endpoint wrapper** `getAlarmEvents` in `apps/web/lib/api/f4/endpoints.ts`.
- **Frontend types** in `apps/web/lib/api/f4/types.ts` mirroring the backend response shape.
- **Frontend dual-mode adapter** `adapterGetAlarmEvents` at `apps/web/lib/api-data/f4/alarms.ts`.
- **Mock fixtures** `MOCK_F4_ALARM_EVENTS` under `apps/web/lib/api-data/f4/mock-fixtures.ts` (small deterministic set).
- **Frontend adapter tests** at `apps/web/lib/api-data/f4/alarms.test.ts` covering mock + api mode.
- **F4.6D.2.1 closeout** at `docs/architecture/RVF_Malinois_F4_6D_2_1_Alarm_Events_Read_API_Closeout.md`.

### 7.2 Out-of-scope for F4.6D.2.1

- **No `<LiveActiveAlarmsPanel>` migration.** The panel continues to call `evaluateReading(...)` against the F2 simulator path. A separate follow-up frontend phase (likely "Operations alarm panel cutover" after F4.6D.2.1) binds the panel to the new adapter.
- **No alarm chart annotations.** Candidate **F4.5G.3**.
- **No alarm lifecycle transitions** (`acknowledged` / `cleared`). Candidate **F4.6D.3**. F4.6D.2 surfaces the lifecycle columns as-stored (currently `null`) — it does not write transitions.
- **No alarm-rule CRUD.** Rules are seeded via `apps/backend/prisma/seed.f4.ts`; no UI / API for create / edit / delete in F4.6D.2.
- **No stateful threshold semantics** (`deadband` / `delay_seconds` / rate-of-change). Candidate **F4.6D.4**.
- **No notifications** (toast / banner / push / email / SMS / webhook). Out indefinitely.
- **No new backend emit kind on the realtime channel.** F4.6E.1's `alarm.event.created` is sufficient; F4.6D.3 will own `alarm.event.acknowledged` / `alarm.event.cleared` envelopes.
- **No schema / migration / seed change.** `alarm_events` table exists since F4.6A.1; existing indexes cover the access path.
- **No multi-tenant batch endpoint.** Single tenant per request (server-derived via `CallerContext`).
- **No auth / rate limiting.** Inherits project-wide no-auth posture.
- **No new env variable, no new dependency, no `packages/types/` change.**

### 7.3 What F4.6D.2.1 explicitly does **not** touch

- `apps/backend/src/alarms/alarm-evaluation.service.ts` — no change. F4.6D.1 contract is binding.
- `apps/backend/prisma/schema.prisma` / `migrations/` / `seed.f4.ts` — no change.
- `apps/backend/src/telemetry/` runtime — no change (only the ingestion-spec test #18 narrowing).
- `apps/backend/src/{tenants,wells,equipment,jobs,tags,health,realtime}/` — no change.
- `apps/backend/src/realtime/` — no change. No new realtime emit kind.
- `apps/web/components/operations/` — no UI change in F4.6D.2.1 (panel cutover is a separate phase).
- `apps/web/lib/realtime/` / `apps/web/lib/hooks/useOperationsRealtimeF4.ts` / `apps/web/lib/hooks/useOperationsLatestValues.ts` / `apps/web/lib/hooks/useOperationsTrendSeries.ts` — no change.
- `packages/types/` — no change.
- `packages/ui/` — no change.
- `docker-compose.yml`, root `package.json`, lockfile, `turbo.json`, `tsconfig*.json`, `.env*`, CI workflow, `vitest.config.ts` — no change.

## 8. Route and Query Contract

### 8.1 Route — recommendation: **`GET /api/v1/alarms/events`**

Three candidates considered:

- **(A) `GET /api/v1/alarms/events`** — RESTful resource shape; alarm events is the noun; future `state=acknowledged` / `state=cleared` extensions and any future POST verbs (acknowledge / clear in candidate F4.6D.3) compose cleanly under `/alarms/`. **Recommended.**
- **(B) `GET /api/v1/alarms/active`** — narrow to active-only at the URL level. **Rejected**: state is data, not a route segment; the moment F4.6D.3 ships acknowledged / cleared transitions, the URL becomes a lie.
- **(C) `GET /api/v1/alarm-events`** — flat noun. Acceptable but inconsistent with the existing `/api/v1/equipment/units`, `/api/v1/telemetry/trends`, `/api/v1/telemetry/latest` pattern of `<resource>/<sub-resource>`.

The base controller path is **`/alarms`** (`@Controller('alarms')`); the method path is **`events`** (`@Get('events')`). Final route after the global `/api/v1` prefix: **`GET /api/v1/alarms/events`**.

### 8.2 Query parameters

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `unitId` | UUID | Optional | Strongly recommended in practice (the F4.5G.2.2.1 OPERATIONS_JOBS / `useResolveBackendUnitId` already resolves a UUID per card). When omitted, the response is tenant-scoped (server-derived) and may be large; `limit` caps it. |
| `canonicalTagId` | UUID | Optional | XOR with `canonicalTagName`. |
| `canonicalTagName` | string `1..64` | Optional | XOR with `canonicalTagId`. |
| `state` | enum `'active' \| 'acknowledged' \| 'cleared'` | Optional | Defaults to `'active'` (the operator-meaningful default; matches F4.6D.1's current write set). Future panels for an audit / history view can pass `state=cleared` etc. without contract change. |
| `severity` | enum `'info' \| 'warning' \| 'critical'` | Optional | Per-row filter. |
| `from` | ISO-8601 → Date | Optional | Filters by `firstTriggeredAt >= from`. Required together with `to` if either is supplied. |
| `to` | ISO-8601 → Date | Optional | Filters by `firstTriggeredAt < to`. `from < to` enforced. |
| `limit` | int `1..500`, default `100` | Optional | Bounds the response. Default `100` matches a tile-grid sensible page; max `500` matches the F4.6F.1 `limit` posture (smaller cap because the panel is operator-visible, not a programmatic API). |

**No `tenantId` parameter.** Tenant scoping is derived from the `CallerContext` server-side, never trusted from the client (matches F4.4 / F4.6F.1 / F4.6C.2.1; ADR-005 / ADR-008).

**No `cursor` paging in F4.6D.2.1.** The current dataset is small (active events per tenant typically < 100); `limit` + `firstTriggeredAt DESC` ordering is sufficient. A cursor field can be added additively (likely `cursor: ISO-8601 of firstTriggeredAt`) when a real consumer demonstrates >500 rows in a window.

**No `unacknowledgedOnly` / `cleared=false` toggles.** State is the discriminator; F4.6D.3 will add the rest of the state surface.

### 8.3 Zod schema (illustrative, exact form decided in F4.6D.2.1)

```ts
// apps/backend/src/alarms/contracts/events.ts
import { z } from 'zod';

export const ALARM_EVENT_STATES = ['active', 'acknowledged', 'cleared'] as const;
export type AlarmEventState = (typeof ALARM_EVENT_STATES)[number];

export const ALARM_EVENT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type AlarmEventSeverity = (typeof ALARM_EVENT_SEVERITIES)[number];

export const ALARM_EVENTS_LIMIT_MAX = 500;
export const ALARM_EVENTS_LIMIT_DEFAULT = 100;

export const AlarmEventsQuerySchema = z
  .object({
    unitId: z.string().uuid().optional(),
    canonicalTagId: z.string().uuid().optional(),
    canonicalTagName: z.string().min(1).max(64).optional(),
    state: z.enum(ALARM_EVENT_STATES).default('active'),
    severity: z.enum(ALARM_EVENT_SEVERITIES).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce.number()
      .int().min(1).max(ALARM_EVENTS_LIMIT_MAX)
      .default(ALARM_EVENTS_LIMIT_DEFAULT),
  })
  .strict()
  .refine(
    (q) => !(q.canonicalTagId !== undefined && q.canonicalTagName !== undefined),
    {
      message:
        'supplying both `canonicalTagId` and `canonicalTagName` is rejected as ambiguous; ' +
        'supply at most one, or omit both',
      path: ['canonicalTagName'],
    },
  )
  .refine(
    (q) => !(q.from !== undefined) || q.to !== undefined,
    { message: '`to` is required when `from` is supplied', path: ['to'] },
  )
  .refine(
    (q) => !(q.to !== undefined) || q.from !== undefined,
    { message: '`from` is required when `to` is supplied', path: ['from'] },
  )
  .refine(
    (q) => q.from === undefined || q.to === undefined || q.from.getTime() < q.to.getTime(),
    { message: '`from` must be strictly less than `to`', path: ['from'] },
  );

export type AlarmEventsQuery = z.infer<typeof AlarmEventsQuerySchema>;
```

### 8.4 No-data / unknown-id behavior

- **Known tenant, no events** → `200 OK` with `events: []`. Mirrors the F4.4F / F4.6F.1 / F4.6C.2.1 empty-array posture; never `404`.
- **Unknown unit** (`unitId` not in `MeasurementUnit`) → `200 OK` with `events: []`. F4.6D.2.1 does not pre-verify unit existence; `findMany WHERE unitId = $1` simply returns zero rows. (A future phase may add a `unitExists: false` discriminator if a screen needs it.)
- **Known unit, unknown canonical tag** → `200 OK` with `events: []`.
- **Invalid UUID** (`unitId` / `canonicalTagId` not UUID-shaped) → `400 Bad Request` via Zod refine.
- **Invalid state / severity enum** → `400`.
- **Invalid time range** (`from >= to`, or one supplied without the other) → `400` with field path naming the offending parameter.
- **Unknown query field** → `400` via `.strict()`.
- **`limit` outside `1..500`** → `400`.

### 8.5 Auth / scoping

F4.6D.2.1 inherits the existing no-auth posture (matches F4.4 / F4.6F.1 / F4.6E.1 / F4.6C.2.1). The controller passes `SystemContext` to the service, meaning cross-tenant reads when no `tenantId` is in the caller context. A future ADR-009 / auth phase will replace `SystemContext` with a real authenticated context; F4.6D.2.1's service signature (`async query(ctx: CallerContext, input: AlarmEventsQuery)`) is the seam.

## 9. Response Shape

### 9.1 Envelope

A **single envelope** carrying zero or more events (mirrors the F4.6C.2.1 latest-values envelope):

```ts
// apps/backend/src/alarms/contracts/events.ts (continued)
export interface AlarmEventRow {
  alarmEventId: string;
  unitId: string;
  /** Nested summary mirrors the F4.4F / F4.6F.1 / F4.6C.2.1 shape. */
  canonicalTag: {
    id: string;
    name: string;
    displayName: string;
    canonicalUnit: string;
    category: string;
    precision: number;
  };
  /** `null` when the rule referenced is no longer present (SetNull cascade). */
  alarmRuleId: string | null;
  severity: AlarmEventSeverity;
  state: AlarmEventState;
  /** Decimal serialized via Decimal.toJSON. */
  triggeredValue: string;
  thresholdViolated: 'low_low' | 'low' | 'high' | 'high_high';
  /** ISO-8601 — the reading's timestamp at trigger time. */
  firstTriggeredAt: string;
  /** Reserved for F4.6D.3; null until lifecycle ships. */
  acknowledgedAt: string | null;
  /** UUID. Reserved for F4.6D.3; null until lifecycle ships. */
  acknowledgedBy: string | null;
  /** Reserved for F4.6D.3; null until lifecycle ships. */
  clearedAt: string | null;
}

export interface AlarmEventsResponse {
  /** ISO-8601 — server-generated response time. */
  generatedAt: string;
  /** Constant — names the canonical source. */
  source: 'alarm_events';
  /** Echoed for caller traceability (matches `state` default of `'active'`). */
  state: AlarmEventState;
  /** Zero or more rows, ordered by `firstTriggeredAt DESC`. */
  events: AlarmEventRow[];
}
```

### 9.2 Decisions

- **Single envelope** carries `events: AlarmEventRow[]`. Empty even on no-data — never 404.
- **`source: 'alarm_events'`** is the constant string honestly naming the wire source (ADR-005 — never lie about freshness).
- **`generatedAt`** is the server-side response-generation time.
- **`state`** echoes the parsed query (after default application). Lets the caller label "showing active events" / "showing cleared events" without re-reading the query string.
- **`canonicalTag` is a nested summary**, not a flat field set, to match the F4.4F / F4.6F.1 / F4.6C.2.1 trend / latest shape. Reduces wire ambiguity and lets the frontend share helper code.
- **Lifecycle columns** (`acknowledgedAt` / `acknowledgedBy` / `clearedAt`) are exposed on the wire as `null` today. Surfacing them now means F4.6D.3 can land lifecycle without an additive contract bump.
- **`triggeredValue`** is a Decimal serialized to a string — same posture as F4.4F raw mode and F4.6C.2.1 latest values.
- **Ordering**: `firstTriggeredAt DESC` (the unit-time index's secondary column). The frontend can pre-sort differently if needed.

### 9.3 Fields intentionally **NOT** on the wire

- **`tenantId`** — server-side concern; trusting it from the client is the anti-pattern §4 forbids.
- **`ruleSnapshot`** — internal audit data. Threshold values, deadband, delay_seconds, message_template are operationally informative but should be exposed via a dedicated future field (e.g. `thresholdContext: { thresholdValue, thresholdKind, deadband, delaySeconds }`) only when a consumer demands it. Exposing the raw JSONB invites the browser to start re-interpreting thresholds — exactly the ADR-005 violation the read API is here to prevent.
- **`createdAt` / `updatedAt`** — operational metadata, not alarm semantics.
- **`jobId`** — Jobs flow is itself deferred (master roadmap §10); not relevant to F4.6D.2.

### 9.4 Raw-table-shape leakage avoidance

The response is a derived view, not a raw `alarm_events` row dump:

- Renaming: `id` → `alarmEventId` (the panel-meaningful name; matches the F4.6E.1 envelope payload field).
- `canonicalTagId` flattened into a `canonicalTag` nested summary.
- `tenantId` / `ruleSnapshot` / `createdAt` / `updatedAt` / `jobId` stripped.
- Decimal `triggeredValue` serialized to string.
- Timestamps emitted as ISO-8601 strings on the wire (Prisma → Date in service, ISO after JSON round-trip).

## 10. State / Severity / Lifecycle Semantics

- **Today only `state='active'` rows exist** because F4.6D.1 writes only `active` and the no-duplicate-active guard prevents repeat `active` rows for the same `(unit, tag, rule)` while one is open. F4.6D.2.1's default `state='active'` filter is the operator-meaningful default; callers asking for `acknowledged` / `cleared` get `events: []` until F4.6D.3 ships.
- **`severity` is one of `'info' / 'warning' / 'critical'`** (F4.6D.1 reads the rule's severity verbatim — no rollup, no escalation).
- **`thresholdViolated` is the most severe band crossed within a single rule** (`high_high > high > low_low > low`).
- **F4.6D.2.1 is read-only.** No POST, no PUT, no PATCH. No acknowledge / clear endpoints. Reviewer rejects any PR that bundles lifecycle into F4.6D.2.1.
- **Browser consumes `state` directly.** The panel does not infer "is alarming" from raw values — the row's `state` field is the canonical answer.
- **Forward compatibility with future states.** The TypeScript `AlarmEventState` union and the Zod enum stay in sync with the schema CHECK; a future state (e.g., `'suppressed'`) would extend both as a single additive change.

## 11. Tenant Scoping / Isolation

- **Tenant scoping.** Same posture as F4.4F / F4.6F.1 / F4.6C.2.1: `ctx.tenantId` filters the `alarm_events.findMany` `where` clause when set; cross-tenant reads when unset. F4.6D.2.1 inherits `SystemContext` (the F4.4 default).
- **No `tenantId` on the wire.** The `AlarmEventsQuery` schema has no `tenantId` field; `.strict()` rejects it. Mirrors the F4.6B.1 ingestion test #21 invariant (the wire does not carry tenancy).
- **Unit scoping** when `unitId` is supplied — the index access path (`alarm_events_unit_time_idx`) keeps the read efficient.
- **No cross-tenant leakage possible today only because no auth exists.** When a future ADR-009 / auth phase replaces `SystemContext` with a real authenticated context, the service signature stays. A request from tenant A asking for tenant B's unit → empty result, not 403 — same posture as F4.6C.2.1.

## 12. Relationship to Realtime and Operations UI

| Surface | Owns | Does not own |
|---|---|---|
| Socket.IO `alarm.event.created` (F4.6E.1) | Tail / notification of new alarm creations | Durable hydration; initial load; resync; lifecycle transitions |
| `GET /api/v1/alarms/events` (F4.6D.2.1, this phase) | Canonical read of alarm events; mounts / reconnect / state filters | Lifecycle writes; rule definitions; chart annotations |
| F4.5G.2.1 `useOperationsRealtimeF4.alarmEventsSeen` counter | A small "events seen since mount" hint; forward-compat seam | Authoritative active-alarms list |
| `<LiveActiveAlarmsPanel>` (today) | Browser-evaluator path against F2 simulator | Server-evaluated alarm state (waits for F4.6D.2.1 + a follow-up frontend phase) |

**A future Operations alarm panel cutover** (the natural follow-up to F4.6D.2.1) composes these:

```
On mount    →  useOperationsAlarmEvents({ unitId, state: 'active' })  // F4.6D.2.1 REST hydration
Realtime    →  useOperationsRealtimeF4 's alarm.event.created stream  // append + dedup by alarmEventId
Reconnect   →  invalidate ['f4-alarm-events']                          // mirror the F4.5G.2.1 / F4.5G.2.2.1 invalidation
```

F4.6D.2.1 itself **does not** wire this composition. It ships the backend + adapter and stops — same posture as F4.6C.2.1 closeout §7.2.

**Anti-patterns F4.6D.2.1 explicitly forbids:**

- Treating `useOperationsRealtimeF4.alarmEventsSeen` as a count of currently-active alarms. The counter is "since-mount events received"; canonical active-count comes from REST.
- Inferring `state` in the browser by comparing `acknowledgedAt` / `clearedAt` columns. The server returns `state` directly; the panel reads that field.
- Re-evaluating thresholds in the browser using the row's `triggeredValue` and the rule's thresholds. The server already did this at write time. ADR-005 binding contract.

## 13. Frontend Adapter Contract

### 13.1 Typed endpoint wrapper

```ts
// apps/web/lib/api/f4/endpoints.ts (additive)
export interface GetAlarmEventsParams {
  unitId?: string;
  canonicalTagId?: string;
  canonicalTagName?: string;
  state?: AlarmEventState;     // defaults applied server-side
  severity?: AlarmEventSeverity;
  from?: Date | string;
  to?: Date | string;
  limit?: number;
}

export const getAlarmEvents = (
  params: GetAlarmEventsParams,
  options?: GetOptions,
): Promise<AlarmEventsResponse> =>
  getJson<AlarmEventsResponse>('/alarms/events', params, options);
```

### 13.2 Dual-mode adapter

```ts
// apps/web/lib/api-data/f4/alarms.ts (new file)
export const adapterGetAlarmEvents = async (
  params: GetAlarmEventsParams,
  options?: GetOptions,
): Promise<AlarmEventsResponse> => {
  if (isApiSource()) {
    return getAlarmEvents(params, options);
  }
  return adapterGetAlarmEventsMock(params);
};
```

The mock branch resolves from `MOCK_F4_ALARM_EVENTS` keyed by `unitId` (UUID). Mirrors the F4.6C.2.1 `adapterGetTelemetryLatest` pattern; mock-mode XOR refine on `(canonicalTagId, canonicalTagName)` matches the backend.

### 13.3 Mock fixtures

A small deterministic set under HP-001 / LP-001 (the same units the F4.6C.2.1 fixtures cover):

- HP-001 — 1 `active` row on `p_inlet` with severity `warning` (warning-high crossed; value above the warningHigh threshold). Uses the existing HP-001 alarm-rule UUID seeded by `MOCK_F4_MEASUREMENT_UNIT_DETAILS`.
- LP-001 — 0 active events (the unit has alarm rules but no triggered state in the mock posture).

The fixture is intentionally narrow — F4.6D.2.1 is a backend + adapter phase, not a fixture-coverage phase. Subsequent UI phases can extend the set as they need them.

### 13.4 Decisions

- **No UI migration.** The adapter exists and is testable; binding `<LiveActiveAlarmsPanel>` to it is a separate frontend phase (see §18).
- **No UUID guardrail required** for the `unitId` param. Unlike F4.6C.2.1's adapter, F4.6D.2.1's `unitId` is optional, and a tenant-scoped read with no `unitId` is a valid call shape. The follow-up panel migration may add `assertUuidShaped(unitId)` defensively at its boundary, but the adapter does not enforce it (a non-UUID `unitId` would surface as the backend's 400 — same posture as F4.4F / F4.6F.1).
- **`refetchInterval`** is a consumer concern, not the adapter's. The follow-up panel phase decides its TanStack Query pacing.

## 14. Authorized Access / Isolation Guardrail

The F4.6D.1 write-isolation invariant — **only `AlarmEvaluationService` writes `prisma.alarmEvent.*`** — must remain binding after F4.6D.2.1 lands. The pattern exactly mirrors F4.6C.2.1's `liveReading` narrowing:

### 14.1 Test #18 narrowing (ingestion isolation)

Today, `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` test #18 asserts:

```ts
// 18. isolation: ingestion service does not call prisma.alarmEvent.* /
//                prisma.alarmRule.* directly (delegates to alarm evaluator)
expect(mocks.alarmEventCreate).not.toHaveBeenCalled();
expect(mocks.alarmEventFindFirst).not.toHaveBeenCalled();
expect(mocks.alarmRuleFindMany).not.toHaveBeenCalled();
```

F4.6D.2.1 narrows this to a write-only invariant (no `findFirst` assertion change required because the ingestion service itself still does not call `findFirst` on `alarm_events` — the projection / alarm evaluator paths are mocked at the service level). The narrowing is a comment / documentation change so the invariant's intent is clear: writes outside the evaluator service are forbidden; reads via the new `AlarmEventsReadService` are permitted at the module level.

### 14.2 New isolation test for `AlarmEventsReadService`

A new test in `alarm-events-read.service.spec.ts` asserts:

```ts
// X. isolation: read service does not write prisma.alarmEvent.*
expect(mocks.alarmEventCreate).not.toHaveBeenCalled();
expect(mocks.alarmEventUpdate).not.toHaveBeenCalled();
expect(mocks.alarmEventUpdateMany).not.toHaveBeenCalled();
expect(mocks.alarmEventUpsert).not.toHaveBeenCalled();
expect(mocks.alarmEventDelete).not.toHaveBeenCalled();
```

Mirrors the F4.6C.2.1 §15.2 / closeout §4 narrowing posture against `liveReading`.

## 15. Non-Goals

Explicitly out of scope for F4.6D.2.1:

- Alarm lifecycle transitions (`acknowledged` / `cleared`). Candidate **F4.6D.3**.
- Acknowledge / clear endpoints. Candidate F4.6D.3.
- Alarm evaluation logic changes. F4.6D.1 contract is binding.
- Alarm-rule CRUD. Not in F4.6 arc.
- `<LiveActiveAlarmsPanel>` UI migration. Follow-up frontend phase.
- Alarm chart annotations on `<TrendChart>` / `<TrendDrawer>`. Candidate **F4.5G.3**.
- Notifications UI (toast / banner / push / email / SMS / webhook).
- Schema / migration / seed change. `alarm_events` exists since F4.6A.1; existing indexes are sufficient.
- Frontend screen changes outside the new adapter file.
- Auth / rate limiting. Inherited no-auth posture.
- External integrations (ThingsBoard / Node-RED / OPC-UA / MQTT / Modbus / PLC / edge / historian).
- New env variable, new dependency, `packages/types/` change.
- Multi-tenant batch endpoint.

## 16. Test Plan

Mocked-Prisma posture, mirroring `trends.service.spec.ts` / `latest.service.spec.ts`.

### 16.1 New backend tests

**`apps/backend/src/alarms/alarm-events-read.service.spec.ts`** — new file. Tests cover:

1. **Empty envelope** — empty fleet → `events: []`, `state: 'active'` (the default echoed), `generatedAt` populated.
2. **Default `state='active'` applied** when query omits state.
3. **Explicit `state='cleared'`** queries pass through to the `where` clause.
4. **`unitId` filter** — `where` carries `unitId`.
5. **`canonicalTagId` filter** — `where` carries `canonicalTagId`.
6. **`canonicalTagName` filter** — resolves via `CanonicalTagResolver`; `where` carries the resolved id.
7. **`severity` filter** — `where` carries `severity`.
8. **Time window filter** — `where` carries `firstTriggeredAt: { gte: from, lt: to }`.
9. **`limit` applied** — `take: limit`.
10. **`orderBy: { firstTriggeredAt: 'desc' }`** in every call.
11. **`select` clause shape** — only the columns the response exposes.
12. **Tenant scoping** — `ctx.tenantId` set → `where.tenantId` present; `SystemContext` → no `tenantId` filter.
13. **Response shape stability** — no `tenantId` / `ruleSnapshot` / `createdAt` / `updatedAt` / `jobId` leak.
14. **`triggeredValue` serialized to string** (Prisma Decimal passes through unchanged; assert the field is the Decimal instance the mock returned).
15. **`canonicalTag` nested summary** — populated from the Prisma `include`.
16. **Lifecycle columns** (`acknowledgedAt` / `acknowledgedBy` / `clearedAt`) returned as `null` (matches F4.6D.1's write set).
17. **`generatedAt` is a fresh Date / ISO** generated server-side.
18. **`source: 'alarm_events'`** is the constant value.
19. **Reads `alarm_events`, not `telemetry_readings` / `live_readings`** — assert no other Prisma table is touched.
20. **Isolation: read service does not write** — assert no `create` / `update` / `updateMany` / `upsert` / `delete` calls.

### 16.2 Controller-level Zod validation tests

Colocated with the service spec (mirrors F4.6F.1 / F4.6C.2.1 pattern):

21. Empty query (only the default state applied) — accepted.
22. `unitId` only — accepted.
23. `state='cleared'` — accepted.
24. Invalid `state` enum — rejected (400 message).
25. Invalid `severity` enum — rejected.
26. Non-UUID `unitId` — rejected.
27. Non-UUID `canonicalTagId` — rejected.
28. Both `canonicalTagId` and `canonicalTagName` — rejected (XOR refine).
29. `canonicalTagName` length 0 — rejected.
30. `canonicalTagName` length > 64 — rejected.
31. `from` without `to` (and vice versa) — rejected.
32. `from >= to` — rejected.
33. `limit` outside `1..500` — rejected.
34. Unknown field — rejected (`.strict()`).
35. Defaulting — `state` defaults to `'active'`; `limit` defaults to `100`.

### 16.3 Updated backend invariants

**`apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` test #18** — narrow comment + intent to "the ingestion service does not **write** `prisma.alarmEvent.*` / `prisma.alarmRule.*` directly" (read access is permitted at the module level). Existing assertions on `alarmEventCreate` / `alarmEventFindFirst` / `alarmRuleFindMany` remain — the ingestion service still does not call any of these. The narrowing is intent-level, not assertion-removing.

### 16.4 New frontend adapter tests

**`apps/web/lib/api-data/f4/alarms.test.ts`** — new file. Covers:

1. Mock-mode happy path — HP-001 with default state returns 1 fixture row.
2. Mock-mode `state='cleared'` — returns empty.
3. Mock-mode unknown unit — empty envelope.
4. Mock-mode XOR rejection (`canonicalTagId` + `canonicalTagName`) — `RvfApiError(400, ...)`.
5. API-mode URL composition — `/alarms/events?unitId=...&state=active`.
6. API-mode forwards `severity` / `from` / `to` / `limit`.
7. Empty response handling — `events: []` parses cleanly.
8. API 400 surfaces as `RvfApiError`.

### 16.5 Tests that must keep passing unchanged

- All backend telemetry tests (217/217 baseline).
- All `alarm-evaluation.service.spec.ts` tests.
- All ingestion / projection / realtime tests.
- All F4.5G.1 / F4.5G.2.1 / F4.5G.2.2.1 / F4.6C.2.1 / F4.6F.1 / F4.6E.1 tests.
- All frontend tests (430/430 from F4.5G.2.2.1).

### 16.6 Expected test counts

| Metric | Before F4.6D.2.1 (`6ded9f1`) | After F4.6D.2.1 (projected) |
|---|---|---|
| Backend tests | 217 / 217 | **+~20–25 new tests** (~20 service + ~15 validation; some overlap counted once) |
| Frontend tests | 430 / 430 | **+~6–10 new tests** (adapter dual-mode + XOR) |

### 16.7 Validation commands (DX-3 §"Runtime phases")

- `pnpm --filter @rvf/backend run lint -- --max-warnings 0`
- `pnpm --filter @rvf/backend run typecheck`
- `pnpm --filter @rvf/backend run build`
- `pnpm --filter @rvf/backend run test`
- `pnpm --filter @rvf/web run lint -- --max-warnings 0`
- `pnpm --filter @rvf/web run typecheck`
- `pnpm --filter @rvf/web run build`
- `pnpm --filter @rvf/web run test`

### 16.8 What F4.6D.2-0 itself runs

**Nothing.** Documentation-only phase. DX-3 §"Documentation-only phases" prescribes only `git status` + `git diff --stat` confirming only `docs/` changed.

## 17. Risks and Guardrails

| Risk | Mitigation |
|---|---|
| **Browser continues to evaluate alarms until follow-up panel migration.** | Acknowledged scope choice. F4.6D.2.1 ships the read surface; the panel migration is the natural follow-up. Until both ship, `<LiveActiveAlarmsPanel>` remains on the F2 simulator path with the documented ADR-005 limitation. Reviewer rejects any expansion of browser-side evaluation. |
| **Exposing raw `rule_snapshot`** on the wire invites browser-side threshold re-interpretation. | §9.3 hard rule. `rule_snapshot` is not on the wire in F4.6D.2.1. A future `thresholdContext` field can be added additively if a consumer needs it. |
| **Confusing realtime notification with canonical read side.** Tile or panel treats `alarmEventsSeen` counter as the active-alarms list. | §12: REST is canonical; realtime is tail / notification. Documentation clarifies the composition. Reviewer rejects any "read alarmEventsSeen, render N rows" pattern. |
| **Adding lifecycle (acknowledge / clear) prematurely** in F4.6D.2.1. | §15 + §17 reviewer rule. Lifecycle is candidate F4.6D.3. F4.6D.2.1 is read-only — no POST / PUT / PATCH. |
| **Cross-tenant leakage.** Possible today only because no auth exists. | §11. The contract has no `tenantId` field; `.strict()` strips unknowns; tenant scoping is server-derived. The seam stays clean for ADR-009 / auth. |
| **Overbroad query defaults** that return huge result sets. | §8.2: `limit` defaults to 100, max 500. `state` defaults to `'active'` (operator-meaningful). Time-window filters are optional but bounded by `limit` regardless. |
| **Unbounded result sets** in the absence of paging. | §8.2: `limit` is the bound. A cursor field is additive when a real consumer demonstrates >500 rows in a window. |
| **Weakening alarmEvent write isolation.** | §14: existing test #18 narrowing names the new permitted reader; new isolation test asserts the read service performs no writes. Reviewer rejects any PR that lets a non-evaluator service call `prisma.alarmEvent.create` / `.update` / `.upsert` / `.delete`. |
| **Coupling frontend to raw Prisma shape.** | §9.4: response is a derived view (`alarmEventId` rename, nested `canonicalTag` summary, stripped `tenantId` / `ruleSnapshot` / `createdAt` / `updatedAt` / `jobId`). |
| **`SetNull` cascade on `alarmRuleId`** — events outlive their rules; frontend may try to look up the rule and 404. | The schema is explicit: `alarmRuleId` is nullable. Response type makes this nullability explicit; the frontend adapter / panel handles `alarmRuleId === null` gracefully. |
| **Future state values** (e.g., `'suppressed'`) break the enum on the wire. | §10: the TypeScript union and Zod enum stay in sync with the schema CHECK. Adding a state is a single additive change across both ends. |
| **Mocked-Prisma posture leaves real-DB integration unverified.** | Inherited risk from every F4.6 sub-phase. The `alarm_events_unit_time_idx` access path is not exercised against a real Postgres yet. A live-DB integration suite remains a candidate cross-phase deliverable. |
| **`<LiveActiveAlarmsPanel>` panel migration scope creep into F4.6D.2.1.** | §7.2: panel migration is explicitly the next frontend phase, not part of F4.6D.2.1. Reviewer rejects any diff under `apps/web/components/operations/` that consumes `adapterGetAlarmEvents`. |

## 18. Acceptance Criteria for F4.6D.2.1

F4.6D.2.1 is complete when **all** of the following are true:

- [ ] `GET /api/v1/alarms/events` exists on a new `AlarmsController` mounted at `apps/backend/src/alarms/alarms.controller.ts`. Controller base path `/alarms`; method path `events`.
- [ ] New `AlarmsModule` at `apps/backend/src/alarms/alarms.module.ts` registers the new controller + read service; imports `PrismaModule`. `apps/backend/src/app.module.ts` registers `AlarmsModule` additively.
- [ ] Zod schema in `apps/backend/src/alarms/contracts/events.ts` enforces UUID on `unitId` / `canonicalTagId`, length on `canonicalTagName`, enums on `state` / `severity`, time-range refines (`from`/`to` together, `from < to`), `limit` bound `1..500` default `100`, XOR between the two tag identifiers, and `.strict()` rejection of unknown fields. Errors surface as `400 Bad Request` via the existing `ZodValidationPipe`. Defaults applied: `state='active'`, `limit=100`.
- [ ] `AlarmEventsReadService` reads `prisma.alarmEvent.findMany` with `tenantId` filter when `ctx.tenantId` is set; orders by `firstTriggeredAt DESC`; honors `unitId` / `canonicalTagId` / `severity` / `state` / time-window filters from the parsed query.
- [ ] Service uses the existing `CanonicalTagResolver` for the `canonicalTagName` path (mirrors trends / latest).
- [ ] Response envelope shape matches §9.1 exactly: `{ generatedAt, source: 'alarm_events', state, events: AlarmEventRow[] }`. `tenantId` / `ruleSnapshot` / `createdAt` / `updatedAt` / `jobId` are **not** on the wire.
- [ ] `triggeredValue` is Decimal serialized to string; timestamps are ISO-8601.
- [ ] Empty response (`events: []`) returned for known tenant with no events, unknown unit, unknown canonical tag.
- [ ] Invalid UUID / unknown enum / bad time range / unknown field → 400; field path in the error.
- [ ] No schema / migration / seed change.
- [ ] **Write-isolation invariant preserved.** Ingestion-spec test #18 narrowed to write-only intent (read access permitted at module level by the new `AlarmEventsReadService`); new isolation test in `alarm-events-read.service.spec.ts` asserts the read service performs no `create` / `update` / `updateMany` / `upsert` / `delete`. `AlarmEvaluationService` remains the only writer.
- [ ] Frontend typed endpoint wrapper `getAlarmEvents` + types `AlarmEventRow` / `AlarmEventsResponse` / `GetAlarmEventsParams` added to `apps/web/lib/api/f4/`.
- [ ] Frontend dual-mode adapter `adapterGetAlarmEvents` at `apps/web/lib/api-data/f4/alarms.ts`. Mock branch resolves from `MOCK_F4_ALARM_EVENTS`; api branch delegates to the typed wrapper. XOR refine mirrored client-side in mock mode.
- [ ] Mock fixtures `MOCK_F4_ALARM_EVENTS` added under `apps/web/lib/api-data/f4/mock-fixtures.ts` (HP-001 one active row, LP-001 empty — narrow set; sufficient for adapter tests).
- [ ] **No `<LiveActiveAlarmsPanel>` UI migration.** The panel continues to render from the F2 simulator path. Reviewer rejects any diff under `apps/web/components/operations/` that consumes `adapterGetAlarmEvents`.
- [ ] **No alarm chart annotations.** Reviewer rejects any diff under `<TrendChart>` / `<TrendDrawer>` that reads alarm state.
- [ ] **No alarm lifecycle transitions.** Reviewer rejects any POST / PUT / PATCH endpoint on the new controller.
- [ ] **No `packages/types/` change.** No new env variable. No new dependency.
- [ ] Backend tests **+~20–25 new** (per §16.6); existing 217/217 stay green. Frontend tests **+~6–10 new**; existing 430/430 stay green.
- [ ] DX-3 §"Runtime phases" validation passes end to end for both `@rvf/backend` and `@rvf/web`: `lint --max-warnings 0` / `typecheck` / `build` / `test` all green.
- [ ] F4.6D.2.1 closeout report exists at `docs/architecture/RVF_Malinois_F4_6D_2_1_Alarm_Events_Read_API_Closeout.md`, follows the established closeout structure, reports the final test counts.
- [ ] Master roadmap §3 / §7 refresh — deferred to a small follow-up hygiene commit per the established pattern (`121803d`, `cafccb6`, `1d0f659`, `2aa6140`, `5d2d3b5`, `5dd9826`, `e03fbfc`, `6ded9f1`).

## 19. Recommended Next Step

**Next step after F4.6D.2-0: F4.6D.2.1 — Alarm Events Read API Implementation.** Plan-first → implementation per the codified DX-3 pattern. Scope per §7; route / query contract per §8; response shape per §9; lifecycle semantics per §10; tenant scoping per §11; isolation invariant per §14; tests per §16; acceptance per §18.

After F4.6D.2.1, the master roadmap §7 candidate sequence continues — the team picks based on observed need:

- **Candidate Operations `<LiveActiveAlarmsPanel>` migration to the new API** (small follow-up frontend phase). The natural next step — converts F4.6D.2.1's adapter (currently dormant, no UI binding) into a real consumer; removes the browser-side `evaluateReading(...)` call; applies the established ADR-005 source / freshness chip palette. Closes the last operator-visible browser-side alarm evaluation in the Operations screen.
- **Candidate F4.5G.3 — Alarm chart annotations.** Wires `alarm.event.created` realtime envelopes + the new F4.6D.2 read API (for historical window context) as overlay markers on `<TrendChart>` / `<TrendDrawer>`. Browser does not evaluate; consumes server-evaluated `alarm_events` only.
- **Candidate F4.6D.3 — Alarm Lifecycle.** `active → acknowledged → cleared` transitions, dedup against open events, `audit_logs` writes per ADR-005. Introduces POST / PATCH endpoints, the matching realtime emit kinds (`alarm.event.acknowledged` / `alarm.event.cleared`), and the UI lifecycle pattern.
- **Candidate F4.5G.2.3 — Operations chart realtime tail.** Append `live_reading.updated` points to the rendered `<TrendChart>` series. Sized only on profiling demand.
- **Candidate F4.5H — Non-telemetry screen adapter wiring.** Per-screen migrations for Wells / Equipment / Catalog / Tags / Settings / Reports.

These are named so they have a place to land. None is committed to as part of F4.6D.2.1. The next implementation phase is **F4.6D.2.1**.

---

*F4.6D.2-0 plan, authored at HEAD `6ded9f1` (Refresh master roadmap after F4.5G.2.2.1). Plan-only. Update on phase close (`Current` → `Closed` with commit hash) and when F4.6D.2.1 lands its closeout.*
