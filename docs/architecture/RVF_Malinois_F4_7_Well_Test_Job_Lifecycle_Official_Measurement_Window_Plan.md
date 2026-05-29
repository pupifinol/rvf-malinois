# RVF Malinois — F4.7-0 Well Test Job Lifecycle and Official Measurement Window Plan

> Phase **F4.7-0 — Well Test Job Lifecycle and Official Measurement Window Plan**. Plan-first per the codified project pattern (F4.2A → F4.2B, F4.6A.0 → F4.6A.1, F4.6B-0 → F4.6B.1, F4.6C-0 → F4.6C.1, F4.6D-0 → F4.6D.1, F4.6E-0 → F4.6E.1, F4.6F-0 → F4.6F.1, F4.5G-0 → F4.5G.1, F4.5G.2-0 → F4.5G.2.1, F4.6C.2-0 → F4.6C.2.1, F4.5G.2.2-0 → F4.5G.2.2.1, F4.6D.2-0 → F4.6D.2.1).
> Documentation-only artifact. No backend, frontend, schema, migration, or runtime code is modified by F4.7-0. Implementation lands in **F4.7.1**.
> Last known head at authoring time: commit `544a8e3` (Refresh master roadmap after F4.6D.2.1).
>
> Upstream references:
> - Master Roadmap (most recent refresh): `docs/architecture/RVF_Malinois_Master_Roadmap.md` (commit `544a8e3`).
> - F4.4E closeout (the Jobs read API this phase composes over): `docs/architecture/RVF_Malinois_F4_4E_Jobs_API_Reactivation_Report.md` (commit `ebaa23b`).
> - F4.6D.2.1 closeout (most recent backend phase; the alarm events read API the future panel migration consumes): `docs/architecture/RVF_Malinois_F4_6D_2_1_Alarm_Events_Read_API_Closeout.md` (commit `23f7dd1`).
> - F4.5G.2.2.2 closeout (the per-unit TrendDrawer where the official-window range pill will eventually surface): `docs/architecture/RVF_Malinois_F4_5G_2_2_2_Operations_Per_Unit_Tile_Trend_Drawer_Fix_Closeout.md` (commit `22841e3`).
> - F4.3 seed reference (the single `in_progress` Job that exists today): `apps/backend/prisma/seed.f4.ts` (commit `91e17aa`).
> - DX-3 (Definition of Done): `docs/operations/RVF_Malinois_Definition_of_Done.md` (commit `65cb736`).
> - ADR-005 (browser boundary; the browser does **not** evaluate alarms; "never lie about freshness").

## 1. Purpose

F4.7-0 is the **plan-first** phase for introducing a first-class domain model for the real-world artifact RVF Malinois exists to certify: an **official well testing job**. The platform today represents a unit deployment to a well via the existing `Job` model (`jobs` table; F4 §F; reactivated read-only by F4.4E in commit `ebaa23b`), but no domain object yet carries any of the following:

- the ~1 hour stabilization period between connection and the first certified reading;
- the test type (Fiscalización certification vs Optimización analysis);
- the configured test duration (Fiscalización: fixed 24 h; Optimización: 12–24 h client-defined);
- the official measurement window as an explicit `(officialStartedAt, officialEndedAt)` pair distinct from `Job.startedAt`;
- the test lifecycle status beyond the existing CHECK enum (`programmed` / `in_progress` / `closed`);
- the report type to generate at completion (Fiscalización PDF vs Optimización PDF);
- the connection / disconnection lifecycle, when the operator is responsible for restoring the well to its original operating condition.

This phase **locks the decisions** F4.7.1 (implementation) must respect:

- Whether the domain layer extends the existing `Job` model or introduces a new sibling model.
- The lifecycle-status enum, allowed transitions, and which transitions ship in F4.7.1 vs later.
- The schema fields that capture the stabilization period, official measurement window, test type, configured duration, and report metadata.
- The validation rules per test type and per lifecycle transition.
- The API surface F4.7.1 may or may not expose.
- How telemetry queries (F4.6F.1 trends, F4.6C.2.1 latest) compose with the official measurement window.
- How a future Operations UI consumes the new lifecycle (range pills, status badge, stabilization countdown).
- How a future Reports PDF generation phase scopes its certified output to the official window.
- How alarms during stabilization vs during measurement are surfaced honestly without expanding the F4.6D.2.1 contract.
- What stays out (PDF generation, full Operations redesign, alarm-panel migration, alarm lifecycle, automatic valve-state detection) and which future phase owns each.
- The test plan and acceptance criteria for F4.7.1.

What this phase does **not** do:

- Does not implement any backend / frontend / schema / migration / runtime code.
- Does not modify the existing F4.4E Jobs read API.
- Does not modify the F4.6 telemetry persistence arc (ingestion, projection, alarm evaluation, realtime fan-out, trend reads, latest reads, alarm-events reads).
- Does not migrate `<LiveActiveAlarmsPanel>` (still active against the F2 simulator path).
- Does not add alarm chart annotations on `<TrendChart>` / `<TrendDrawer>`.
- Does not modify Operations or Reports UI.
- Does not generate Fiscalización or Optimización PDF reports.
- Does not introduce auth, rate limiting, env vars, dependencies, or `packages/types/` changes.
- Does not automate valve-state detection, PLC-driven workflow, e-signature, or commercial workflow.

## 2. Field Workflow Summary

The real workflow this phase models:

1. **Mobilization.** A portable well testing unit (HP-001 high-pressure / LP-001 low-pressure in the F4.3 seed) is transported to a producing oil well.
2. **Three-valve-bypass connection.** The well's production line has a three-valve bypass installed in-line. The operator:
   - Connects the unit **inlet** to the **first bypass valve**.
   - Connects the unit **outlet** to the **third bypass valve**.
   - **Closes the center bypass valve.**
   - **Opens** the unit's own inlet/outlet valves.
   - Production now flows through the unit and returns to the main production line.
3. **Stabilization period (~1 h, configurable).** After connection, the unit needs roughly an hour for separator levels, line pressures, gas/liquid ratios, and instrument readings to stabilize before any reading is considered representative of the well. This window is **operationally observed** (the chart is useful for diagnostics) but **NOT included** in the certified measurement.
4. **Official measurement start.** Once stabilization is complete, the engineer marks the official test as started. From this moment on, every persisted telemetry reading from this unit, on this well, falls inside the certified measurement window.
5. **Official measurement.** Runs for the configured duration: 24 h fixed for Fiscalización; 12–24 h client-defined for Optimización.
6. **Official measurement end.** Reached either by elapsed duration or by explicit engineer action.
7. **Report generation.** A Fiscalización certification PDF or an Optimización analysis PDF is generated against the certified window only.
8. **Disconnection and restoration.** The operator closes the unit valves, re-opens the center bypass valve, disconnects the unit, and **restores the well to its original operating condition** before mobilizing off-site.

F4.7-0 captures **steps 3, 4, 5, 6, 7** (the data layer). The valve-state narrative (step 2) and disconnection/restoration (step 8) are informational; they motivate the model but are **not** persisted as a state machine in F4.7.1 (no PLC integration; no automatic valve detection). A future phase may introduce a valve-state checklist as operator-driven booleans on the test record.

## 3. Current Repository State

Drawn from `git log`, the master roadmap (`544a8e3`), and direct inspection.

| Concern | Current state | Source |
|---|---|---|
| `Job` model (deployment of a measurement_unit at a well for a period) | Present. UUID PK; FKs to `tenant`, `well`, `unit`, `commissioning_snapshot`, `engineer` (User); `status` CHECK enum (`programmed` / `in_progress` / `closed`); `startedAt` / `closedAt` / `createdAt` / `updatedAt`. **No test-type, no stabilization fields, no official measurement window, no report metadata.** | `apps/backend/prisma/schema.prisma` lines 471–498 |
| `CommissioningSnapshot` model | Present. Captures `effectiveThresholds`, `sensorMappings`, `engineeringEnvelope`, `ruleVersions` as JSONB at commissioning. **Designed as the "frozen configuration at commissioning" — not as a per-test execution record.** | `apps/backend/prisma/schema.prisma` lines 504–526 |
| `Well` / `MeasurementUnit` / `EquipmentType` | Present. F4.4B / F4.4D reactivated their read APIs. `MeasurementUnit.code` is the field F4.5G.2.2.1 resolves through. | `apps/backend/prisma/schema.prisma` lines 110–159, 446–464 |
| Jobs read API (F4.4E) | Present. `GET /api/v1/jobs` (list with filters) + `GET /api/v1/jobs/:id` (detail with tenant / well / unit / engineer / commissioningSnapshot). **Read-only.** No create / start / close / update endpoint exists. `JobsService` docblock explicitly names write flows as out of scope. | `apps/backend/src/jobs/jobs.controller.ts`, `jobs.service.ts` lines 78–93 |
| Backend `reports/` module | **Does not exist.** `find` returns no backend file matching `report*` (apart from documentation under `docs/`). | `grep` evidence |
| Frontend `reports/` UI | Present as a mock-driven archive screen (`apps/web/components/reports/`, `apps/web/app/(rvf-console)/reports/page.tsx`). Mock data carries `ReportKind = WELL_TEST | DAILY_OPS | BUILDUP | AUDIT | INCIDENT` and rich state (`QUEUED` → `GENERATING` → `READY` → `PENDING_APPROVAL` → `DELIVERED` / `FAILED`) plus a `ReportStage` pipeline. **Not wired to any backend; no `lib/api-data/f4/reports.ts` adapter exists.** | `apps/web/components/reports/data/reports.mock.ts` |
| Frontend Operations data layer | Renders against the F2 simulator-side `OperationsJobBinding` with `JOB_HP_HF` / `JOB_MP` / `JOB_STALE` simulator job objects; the `backendUnitCode` annotation (HP-001 / LP-001 / omitted) was the F4.5G.2.2.1 bridge to the backend units list. **The simulator `ActiveJobSnapshot` is not the F4.4E backend `Job`** — the screen has no notion of the backend Job today. | `apps/web/components/operations/data/operationsJobs.ts` |
| Operations chart range pills | Generic: `15m / 1h / 6h / 24h / 7d`. No official-window pill, no stabilization pill, no full-test pill. | `apps/web/lib/hooks/useOperationsTrendSeries.ts` line 55 |
| Seeded data | F4.3 seed creates **one** Job (HP-001 deployment) with `status='in_progress'`, `startedAt = SEED_DATE`, plus its commissioning snapshot. No test-type metadata. | `apps/backend/prisma/seed.f4.ts` lines 1320–1391 |
| Alarm events backend + adapter (F4.6D.2.1) | Live. `GET /api/v1/alarms/events` + `adapterGetAlarmEvents`. **`<LiveActiveAlarmsPanel>` is not yet bound.** | Master roadmap §5 |
| Telemetry persistence arc | Complete end-to-end (F4.6B.1 → F4.6F.1 / F4.6C.2.1 / F4.6D.2.1). | Master roadmap §5 |
| Formal Well-Test domain model in any form | **Absent.** `grep` across `apps/backend`, `apps/web/lib`, `apps/web/components` for `wellTest`, `well_test`, `WellTest`, `testType`, `fiscaliza`, `optimiza`, `stabiliz`, `official.*window`, `officialStartedAt` returns no matches beyond the existing mock `ReportKind: 'WELL_TEST'` string. | `grep` evidence |
| Roadmap anchor | `544a8e3` (Refresh master roadmap after F4.6D.2.1). | `git log` |

### 3.1 Why this is the right moment

The Operations telemetry path is now backend-backed end-to-end (trends F4.5G.1; per-unit drawer F4.5G.2.2.2; latest values F4.5G.2.2.1; realtime status F4.5G.2.1), and the alarm events read API has shipped (F4.6D.2.1). The next operator-visible UI gaps — `<LiveActiveAlarmsPanel>` migration, alarm chart annotations, Reports PDF generation — all need a **certified measurement window** to anchor against. Continuing those phases without F4.7 risks shipping panels and PDFs that hard-code generic time ranges (e.g. "alarm seen in last 24 h" / "report covers last 24 h of telemetry") instead of the actual official window declared by the engineer at test start.

## 4. Domain Object Decision

Four candidates evaluated. The goal is to minimize migration risk while modeling the field workflow honestly.

### 4.1 Option A — Extend `Job` with well-test fields

Add `testType`, `plannedDurationHours`, `stabilizationStartedAt`, `stabilizationEndedAt`, `officialStartedAt`, `officialEndedAt`, `reportType`, `connectedAt`, `disconnectedAt`, `reportGeneratedAt` directly on `jobs`.

**Pros:** Simplest data model. No new join. The existing FKs (`alarm_events.jobId`, `telemetry_readings.jobId`) stay untouched. One row per work execution.

**Cons:** `Job` becomes a wide mixed-concern table (deployment + test execution + report). One Job cannot have multiple tests over time (re-cert, retest, repeat optimization on the same deployment). The `status` CHECK enum needs to be extended from 3 to 8–10 values, and every existing reader (`JobsService`, frontend `JobStatus` type) sees the wider enum even when only the deployment-level status matters. Stretches the docblock's definition of `Job` ("deployment of a measurement_unit at a well for a period") into "deployment + the test that ran on it."

### 4.2 Option B — Introduce a new `WellTest` model linked to `Job`

A new `well_tests` table with FKs to `Job`, `Tenant`, optional `Well` / `MeasurementUnit` (for read convenience), carrying the test-type / duration / stabilization / official-window / lifecycle / report fields.

**Pros:** Clean separation of concerns: `Job` stays a "deployment ledger" with its existing 3-value status enum and its 5 FKs; `WellTest` is the per-execution record the operator interacts with. A single `Job` can carry multiple `WellTest` rows over time. The existing `alarm_events.jobId` / `telemetry_readings.jobId` FKs are untouched. The Reports PDF generation phase queries `WellTest` for `(officialStartedAt, officialEndedAt)` — a clean read against a focused table. Schema migration is purely additive (new table + new indexes; no enum change on `jobs.status`).

**Cons:** One additional join in Operations / Reports queries. A small amount of duplication of `wellId` / `unitId` from the parent `Job` if we denormalize for read efficiency (or one extra join through `Job` if we don't). A new lifecycle-status enum CHECK on `well_tests.status` instead of widening `jobs.status`.

### 4.3 Option C — `JobOfficialMeasurement` row as a one-to-one child of `Job`

A narrower variant of Option B: a `job_official_measurements` table with `(jobId UNIQUE)`, carrying only the official-window + test-type fields. The lifecycle is implicit (`row exists` ⇒ test is running or completed; `officialEndedAt IS NULL` ⇒ measuring; `officialEndedAt IS NOT NULL` ⇒ completed).

**Pros:** Minimal new schema. Implicit lifecycle. Useful if we believe one Job will never carry more than one official measurement.

**Cons:** Implicit lifecycles get confusing fast — there's no place to record stabilization (which precedes the official window) or aborted tests (which never reached `officialEndedAt` honestly). Forces a hard "one test per Job" rule we cannot honestly defend (retests are common). Cannot carry the connection / disconnection narrative without a wider schema. Reports generation cannot honestly say "this is the third test on this Job and we are certifying the second one" because there's no row identity per test.

### 4.4 Option D — Separate operational setup from official measurement record

Two new tables: a `well_test_setup` row (connection + stabilization + valve-state checklist + disconnection) and a `well_test_official_measurement` row (test-type + official window + report type), each FK'd to `Job`.

**Pros:** Most faithful to the field workflow's two-phase nature (operational setup → certified measurement). Cleanest audit trail.

**Cons:** Two new tables for a domain that today carries no production data. Over-engineered for the F4.7.1 implementation surface. The operational-setup record's valve-state checklist is not in F4.7.1 scope (no automatic valve detection; informational only) — splitting it off creates a table whose only purpose in F4.7.1 is to hold three timestamps.

### 4.5 Recommendation: **Option B — `WellTest` linked to `Job`**

F4.7.1 introduces a new `well_tests` table linked to the existing `Job`. Reasoning:

- **The field workflow does not conflate "deployment" with "test execution".** A unit may be deployed for several days, with multiple tests run across that deployment (a Fiscalización certification first, then an Optimización round, then a retest if the customer demands one). The `Job` row is the deployment ledger; `WellTest` is the per-execution record.
- **Migration risk is bounded.** No `Job.status` enum change; no rewiring of `alarm_events.jobId` / `telemetry_readings.jobId`. The migration is purely additive (new table + indexes).
- **Reports PDF generation has a clean target.** The Fiscalización PDF certifies a specific `WellTest` by its `(officialStartedAt, officialEndedAt)`. The Optimización PDF certifies a different `WellTest` row even when both share the same parent `Job`.
- **Operations UI has a clean entry point.** A future "Current Test" panel reads `WellTest` rows in `'stabilizing'` / `'measuring'` state for the displayed unit; the existing Operations live data path remains untouched until the Operations cutover phase deliberately consumes the new model.
- **Forward-compatible with Option D semantics if needed later.** A valve-state checklist could be added as a `setupChecklist` JSONB column on `well_tests` without splitting the table.

Option A and Option C are explicitly **rejected** for the reasons in §4.1 / §4.3. Option D is **deferred**: if a future phase demands a richer operational-setup record, it can split off from `well_tests` additively.

## 5. Lifecycle Status Model

### 5.1 Candidate status set

A `WellTest.status` CHECK enum, narrower than the speculative list to keep F4.7.1 implementable:

| Status | Meaning | Authored by |
|---|---|---|
| `draft` | Test created in the UI; not yet scheduled. Optional in F4.7.1 — only if the create-from-UI flow ships. | engineer (UI) |
| `scheduled` | Test row exists with a planned start, but the unit is not yet connected. | engineer (UI) |
| `connected` | Three-valve-bypass connection complete; `connectedAt` recorded. Stabilization has not yet started (the engineer is still doing the pre-stabilization checks). | engineer (UI) |
| `stabilizing` | `stabilizationStartedAt` recorded. The ~1 h stabilization clock is running. Telemetry flows but is not part of the certified window. | engineer (UI) or auto |
| `measuring` | `officialStartedAt` recorded. Every persisted reading from this unit, on this well, between `officialStartedAt` and either `officialEndedAt` or `officialStartedAt + plannedOfficialDurationHours` is part of the certified window. | engineer (UI) |
| `completed` | `officialEndedAt` recorded. The certified window is closed. The test is ready for report generation. | engineer (UI) or auto-on-elapsed-duration (future) |
| `aborted` | The test was abandoned before `officialEndedAt`. `abortedAt` and `abortReason` recorded. **No certification PDF for an aborted test.** | engineer (UI) |
| `closed` | Report generated (or explicitly waived) and the unit is disconnected. Terminal. | engineer (UI) |

### 5.2 What ships in F4.7.1 vs later

| Status | F4.7.1 ships? | Notes |
|---|---|---|
| `draft` | **Optional.** Only if create-from-UI is in F4.7.1 scope. Defer if the F4.7.1 surface stays read-mostly. |
| `scheduled` | **Yes.** Initial status for a row written by the implementation phase. |
| `connected` | **Yes.** |
| `stabilizing` | **Yes.** |
| `measuring` | **Yes.** |
| `completed` | **Yes.** |
| `aborted` | **Yes.** |
| `closed` | **Yes.** Terminal. |
| `report_generated` (intermediate) | **No.** Folded into `closed` for now; report generation lives in the Reports PDF phase and writes `reportGeneratedAt` on `WellTest` but does NOT introduce a separate lifecycle status. |
| Auto-completion on elapsed duration | **No.** F4.7.1 only allows engineer-driven `measuring → completed`. Auto-completion is a future phase. |

### 5.3 Allowed transitions

```
scheduled  ──→ connected   ──→ stabilizing ──→ measuring ──→ completed ──→ closed
   │              │                │              │              │            ▲
   │              │                │              │              │            │
   └──→ aborted ◄─┴────────────────┴──────────────┴──────────────┘            │
                                                                              │
                                                          (closed is terminal)┘

(draft optional, transitions to `scheduled` only)
```

Transition rules:

- `scheduled → connected → stabilizing → measuring → completed → closed` is the happy path.
- `aborted` is reachable from `scheduled` / `connected` / `stabilizing` / `measuring` only. `completed` and `closed` are terminal-or-near-terminal; an `aborted` after `completed` is a separate concern (Reports retraction; out of scope).
- Backward transitions (`measuring → stabilizing`, etc.) are **not** allowed in F4.7.1. If the engineer needs to restart, they abort and create a new test.
- `closed` is terminal. No further transitions.

### 5.4 What triggers each transition

| Transition | Trigger |
|---|---|
| `scheduled → connected` | Engineer UI action (records `connectedAt`). No automatic detection. |
| `connected → stabilizing` | Engineer UI action (records `stabilizationStartedAt`). |
| `stabilizing → measuring` | Engineer UI action (records `officialStartedAt`). |
| `measuring → completed` | Engineer UI action (records `officialEndedAt`). |
| any → `aborted` | Engineer UI action (records `abortedAt` + `abortReason`). |
| `completed → closed` | Engineer UI action (records `closedAt` + optionally `reportGeneratedAt` if Reports has already generated the PDF). |

### 5.5 Enum vs string-constrained

The lifecycle is encoded as a Prisma `String` field with a DB-level `CHECK` constraint, **not** a Prisma `enum`. This mirrors the project pattern for `Job.status`, `MeasurementUnit.status`, `alarm_events.severity`, `alarm_events.state` — all string-with-CHECK in `schema.prisma`. The TypeScript union (`WellTestStatus = 'scheduled' | 'connected' | …`) is the application-side mirror, declared in the F4.7.1 contract file the same way `JOB_STATUSES` is mirrored at `apps/backend/src/jobs/jobs.service.ts:14`.

## 6. Test Type and Duration Rules

### 6.1 Test types

```ts
type WellTestType = 'fiscalizacion' | 'optimizacion';
```

| Type | Purpose | `plannedOfficialDurationHours` | Report type | UI label |
|---|---|---|---|---|
| `'fiscalizacion'` | Certify production to ministry / client. | **Fixed at `24`.** | `'fiscalizacion_pdf'` | "Fiscalización" |
| `'optimizacion'` | Understand and optimize production conditions. | **`12..24`, client-defined.** | `'optimizacion_pdf'` | "Optimización" |

### 6.2 Duration storage

- `plannedOfficialDurationHours: Int` — non-null. The engineer's configured duration.
- `actualOfficialDurationSeconds` — **derived**, not stored. Computed at read time as `Math.floor((officialEndedAt - officialStartedAt) / 1000)` when both timestamps exist. Frontend hooks may also derive this in api mode; mock-mode adapters mirror the derivation.
- **Reason for derivation, not storage.** Drift between stored and derived risks confusion when the report PDF cites the value; computing at read time is single-source-of-truth.

### 6.3 Validation rules per type

| Rule | Applies when | Enforcement |
|---|---|---|
| `testType === 'fiscalizacion'` ⇒ `plannedOfficialDurationHours === 24` | Always on create + update. | Zod refine + DB CHECK. |
| `testType === 'optimizacion'` ⇒ `plannedOfficialDurationHours BETWEEN 12 AND 24` | Always on create + update. | Zod refine + DB CHECK. |
| `reportType === 'fiscalizacion_pdf'` ⇒ `testType === 'fiscalizacion'` | Always. | Zod refine. |
| `reportType === 'optimizacion_pdf'` ⇒ `testType === 'optimizacion'` | Always. | Zod refine. |
| Cannot edit `testType` once `status >= 'measuring'` | On update. | Service-side guard. |
| Cannot edit `plannedOfficialDurationHours` once `status >= 'measuring'` | On update. | Service-side guard. |

### 6.4 Client override of duration

**Not in F4.7.1.** The client (operator / engineer) selects from a UI dropdown of valid durations per type. For Fiscalización the only valid value is 24; for Optimización the valid set is `{12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24}` (integer hours; fractional hours are an explicit non-goal — the field workflow does not produce fractional-hour requests today).

## 7. Stabilization and Official Measurement Windows

### 7.1 Timestamps stored on `well_tests`

| Field | Type | Nullable | Set when |
|---|---|---|---|
| `connectedAt` | Timestamptz | nullable until `status >= 'connected'` | Engineer marks the three-valve-bypass connection complete. |
| `stabilizationStartedAt` | Timestamptz | nullable until `status >= 'stabilizing'` | Engineer marks stabilization started (typically immediately after `connectedAt`). |
| `stabilizationEndedAt` | Timestamptz | nullable until `status >= 'measuring'`, then equal to `officialStartedAt` | Implicit: `stabilization` ends when official measurement begins. Stored explicitly so the duration is queryable without joining the lifecycle history. |
| `officialStartedAt` | Timestamptz | nullable until `status >= 'measuring'` | Engineer marks the official window started. |
| `officialEndedAt` | Timestamptz | nullable until `status >= 'completed'` | Engineer marks the official window ended. |
| `disconnectedAt` | Timestamptz | nullable until `status === 'closed'` | Engineer marks the unit disconnected (after report or waived). |
| `reportGeneratedAt` | Timestamptz | nullable | Written by the future Reports PDF generation phase; null until the PDF lands. |
| `abortedAt` | Timestamptz | nullable; non-null iff `status === 'aborted'` | Engineer marks abort. |
| `abortReason` | String 1..240 | nullable; required iff `status === 'aborted'` | Engineer-supplied free-form. |

### 7.2 Required vs nullable by status

| Status | Required-non-null fields |
|---|---|
| `scheduled` | (none beyond FKs + `testType` + `plannedOfficialDurationHours`) |
| `connected` | + `connectedAt` |
| `stabilizing` | + `stabilizationStartedAt` |
| `measuring` | + `officialStartedAt`, + `stabilizationEndedAt` (== `officialStartedAt`) |
| `completed` | + `officialEndedAt` |
| `closed` | + `disconnectedAt` (and `reportGeneratedAt` either present or explicitly waived) |
| `aborted` | + `abortedAt` + `abortReason` |

Enforcement is a combination of:
- DB CHECK constraints for the simple per-status non-null rules.
- Zod refines + service-side guards for the per-status conditional rules.

### 7.3 Automatic vs manual timestamps

**All timestamps are manual in F4.7.1** — recorded by the engineer-driven API action that performs the corresponding transition. No automatic detection (no inference from telemetry pattern, no PLC integration, no automatic stabilization-ended detection). This keeps F4.7.1 implementable and audit-honest: every timestamp on a `WellTest` row has a recorded engineer action behind it.

### 7.4 Can the official start happen before stabilization ends?

**No.** The DB CHECK and Zod refines enforce `officialStartedAt >= stabilizationStartedAt`. There is no separate `stabilizationEndedAt`-before-`officialStartedAt` rule because `stabilizationEndedAt === officialStartedAt` by definition.

Edge case: an engineer may legitimately want a shorter or longer stabilization than the ~1 h convention. The model allows any non-negative stabilization duration; there is **no DB-enforced minimum**. A UI hint may surface "stabilization shorter than 30 minutes" as a warning, but the data layer does not reject it. (A future phase may introduce a `minStabilizationMinutes` policy setting; out of scope.)

### 7.5 Can the official end happen before planned duration?

**Yes.** The engineer may end the test early (e.g., after 18 h of a 24 h Optimización if conditions are sufficient). `officialEndedAt` is the wall-clock end; `actualOfficialDurationSeconds` is derived from it and may be less than `plannedOfficialDurationHours * 3600`. The Reports PDF must surface both values honestly when they differ.

### 7.6 Pause / interruption handling

**Not in F4.7.1.** A test that needs to pause (e.g., a temporary instrument issue mid-measurement) must be aborted and re-started as a new test. A future phase may introduce a `pause` event and a `pausedSeconds` derived field; out of scope.

## 8. Relationship to Telemetry Queries

### 8.1 Trend queries (F4.6F.1)

The existing `GET /api/v1/telemetry/trends` endpoint stays **unchanged**. F4.7.1 does not modify the trend contract. Operations chart consumers that want to scope a chart to the official window pass:

```
unitId        = well_tests.unitId            (existing)
canonicalTag* = (existing)
from          = well_tests.officialStartedAt
to            = well_tests.officialEndedAt   (or `Date.now()` while measuring)
```

The frontend chart hook (`useOperationsTrendSeries`) already accepts an explicit `(from, to)` range internally — the new official-window range pill (future F4.7.2) wires the well-test row's timestamps into that hook's window resolution. **No backend change.**

### 8.2 Stabilization-window queries

Same trend endpoint. The stabilization window is `(stabilizationStartedAt, officialStartedAt)`. The Operations UI may surface a `Stabilization` range pill that maps to this pair; same backend contract.

### 8.3 Full-test queries

`(connectedAt, disconnectedAt)` — useful for diagnostics, never for certification. Same trend endpoint.

### 8.4 Generic diagnostic queries

`15m / 1h / 6h / 24h / 7d` pills stay available verbatim. They are diagnostic windows relative to "now"; they are **never** the official window. A future Reports PDF that accepted a generic window would be rejected at review.

### 8.5 Latest API (F4.6C.2.1)

`GET /api/v1/telemetry/latest` is current-value hydration; it has no time-window semantics. **Unchanged.** The Reports PDF must NOT consume latest values as the source of certified totals or averages — those derive from the trend / bucketed reads scoped to the official window.

### 8.6 Alarm events (F4.6D.2.1)

`GET /api/v1/alarms/events` already supports `from` / `to` filters. Scoping alarms to the official window is `from = officialStartedAt, to = officialEndedAt`. Stabilization-window alarm queries pass the corresponding window. **Unchanged.**

## 9. Relationship to Operations UI

Future Operations implications, none implemented in F4.7-0 or F4.7.1:

- **"Current Test" panel** on `/operations` — surfaces the currently-active `WellTest` for each visible unit. Status badge: `connected / stabilizing / measuring / completed / aborted / closed`. Test type label: `Fiscalización` / `Optimización`. Configured duration: `24 h` / `N h`.
- **Stabilization countdown / progress** — visible only when `status === 'stabilizing'`. Displays `stabilizationStartedAt + planned stabilization (~1 h)` vs `Date.now()`.
- **Official measurement countdown / progress** — visible only when `status === 'measuring'`. Displays `officialStartedAt + plannedOfficialDurationHours * 3600` vs `Date.now()`.
- **Range pills on `<TrendDrawer>`** — the F4.5G.2.2.2 drawer's `15m / 1h / 6h / 24h / 7d` pills gain three primary pills above them (or alongside them; design choice in F4.7.2):
  - **`Stabilization`** — `(stabilizationStartedAt, officialStartedAt)`.
  - **`Official window`** — `(officialStartedAt, officialEndedAt ?? Date.now())`. **Default pill once the test reaches `measuring`.**
  - **`Full test`** — `(connectedAt, disconnectedAt ?? Date.now())`.
  Generic windows remain available but become secondary / diagnostic.
- **Per-unit tile chip** — the existing source / freshness chip on `<LiveVariableTile>` (F4.5G.2.2.1) optionally gains a "STABILIZING" / "MEASURING" / "TEST COMPLETED" overlay so the operator sees the test phase at a glance.

**F4.7-0 does not implement any of this.** The plan locks the data layer; the UI binding is the F4.7.2 phase (range pills) and follow-up phases (current-test panel; tile overlays).

## 10. Relationship to Reports PDF

Future Reports PDF generation, **not in F4.7.1**:

### 10.1 Fiscalización PDF

- **Purpose:** Certify well production to ministry / client.
- **Window:** The test's official measurement window only (`officialStartedAt`, `officialEndedAt`). Stabilization data is **never** in the certified totals.
- **Duration:** 24 h fixed; the PDF declares `plannedOfficialDurationHours = 24` and the derived `actualOfficialDurationSeconds`. Discrepancy (early-end) surfaced honestly.
- **Content:** Production totals (oil bbl, water bbl, gas MMSCF), averages (line pressure, water cut, temperatures), trend charts scoped to the official window, alarm events scoped to the official window.
- **Future fields (post-F4.7.1):** official signatures, client / ministry reference, certificate id.

### 10.2 Optimización PDF

- **Purpose:** Understand and optimize production conditions.
- **Window:** The test's official measurement window only.
- **Duration:** 12–24 h client-defined; the PDF declares both the planned and the actual duration.
- **Content:** Trends, recommendations, optimization observations, comparison to engineering envelope, alarm events.
- **Future fields (post-F4.7.1):** optimization narrative, sign-off.

### 10.3 Common scope

Both PDF types share base telemetry, well, unit, job metadata; differ in **purpose**, **template**, and **certification posture**. Both require the official window to be defined and `status >= 'completed'`. The current `apps/web/components/reports/data/reports.mock.ts` archive (`ReportKind = 'WELL_TEST' | 'DAILY_OPS' | …`) is a mock-only UI today; a future Reports backend phase will replace it with real generation against `WellTest` rows.

**F4.7-0 does not generate any PDF.** It locks the data fields a future PDF generation phase needs.

## 11. Relationship to Alarms

- **Alarm event creation does not change.** F4.6D.1's evaluator continues to write `alarm_events` rows during ingestion, regardless of the parent `WellTest` lifecycle state. The evaluator does **not** read `WellTest`; the canonical write path is unchanged.
- **Alarm event reads do not change.** F4.6D.2.1's `GET /api/v1/alarms/events` remains the only public read surface. Adding a `wellTestId` filter is **out of scope** for F4.7-0; consumers that want "alarms during this test's official window" pass `from = officialStartedAt, to = officialEndedAt` to the existing endpoint.
- **Alarms during stabilization may be operational only.** The future `<LiveActiveAlarmsPanel>` migration (deferred behind F4.7) will need to distinguish "alarm raised during stabilization" from "alarm raised during official measurement" in the UI, because operationally the two are interpreted differently (stabilization alarms are diagnostic; measurement-window alarms may affect Reports notes or test validity). The data to distinguish them already exists (`alarm_events.firstTriggeredAt` vs `well_tests.officialStartedAt`); no schema change needed.
- **Lifecycle transitions remain deferred.** F4.6D.3 still owns `acknowledged` / `cleared`. F4.7-0 does not introduce alarm lifecycle.
- **Reports PDF must distinguish stabilization vs measurement alarms.** The Fiscalización PDF lists only measurement-window alarms by certification convention; the Optimización PDF may include both with explicit labeling.

## 12. Proposed F4.7.1 Implementation Boundary

F4.7.1 ships **backend schema + service + Zod contract + read API + minimal write API + frontend adapter + adapter tests**. No UI binding.

### 12.1 In scope for F4.7.1

- **Prisma schema migration** introducing the `well_tests` table per §4.5 + §14 + the CHECK constraints per §6 + §7.2. Indexes per §14.4. Additive only; no existing schema field touched.
- **Backend `WellTestsModule`** at `apps/backend/src/well-tests/` (kebab-case directory name matches the established `apps/backend/src/alarms/` precedent).
  - `WellTestsService` — read + write methods, mocked-Prisma testable.
  - `WellTestsController` — read endpoints + a small set of lifecycle-transition endpoints per §13.
  - `contracts/well-tests.ts` — Zod schemas for create / transition / list / detail.
- **App-module registration** of `WellTestsModule` in `apps/backend/src/app.module.ts` (small additive change).
- **Backend tests** — service spec + controller-level Zod tests per §17.
- **Frontend `adapterGetWellTests`** dual-mode adapter at `apps/web/lib/api-data/f4/well-tests.ts`.
- **Frontend types** in `apps/web/lib/api/f4/types.ts`: `WellTestType` / `WellTestStatus` / `WellTestRow` / `WellTestDetail` / `WellTestsResponse` / `GetWellTestsParams`.
- **Frontend `getWellTests` / `getWellTestById` / lifecycle-transition wrappers** in `apps/web/lib/api/f4/endpoints.ts`.
- **Mock fixtures** `MOCK_F4_WELL_TESTS` extending the F4.3 HP-001 seeded Job with one `scheduled` and one `measuring` test row; LP-001 with one `completed` row. Narrow set; the F4.7.2 UI phase extends as needed.
- **Frontend adapter tests** at `apps/web/lib/api-data/f4/well-tests.test.ts` covering mock + api mode.
- **F4.7.1 closeout** at `docs/architecture/RVF_Malinois_F4_7_1_Well_Test_Job_Lifecycle_Closeout.md`.

### 12.2 Out of scope for F4.7.1

- **No Operations UI changes.** `<LiveTrendsPanelLive>` / `<TrendDrawer>` / `<LiveVariableTile>` / `<LiveMultiphaseUnitCard>` untouched. The F4.7.2 phase wires range pills.
- **No Reports PDF generation.** The Reports backend module remains nonexistent; the frontend Reports screen continues to render against `reports.mock.ts`.
- **No `<LiveActiveAlarmsPanel>` migration.** Still deferred (candidate F4.5G.4, deferred behind F4.7).
- **No alarm chart annotations** (candidate F4.5G.3).
- **No alarm lifecycle transitions** (candidate F4.6D.3).
- **No automatic valve-state detection** or PLC-driven workflow.
- **No e-signature / client / ministry workflow.**
- **No commercial / billing workflow.**
- **No backend ingestion / projection / alarm-evaluation / realtime change.** F4.6 arc untouched.
- **No `packages/types/` change. No new env variable. No new dependency.**

### 12.3 What F4.7.1 explicitly does not touch

- `apps/backend/src/telemetry/` (ingestion, projection, controllers, services) — no change.
- `apps/backend/src/alarms/` — no change.
- `apps/backend/src/jobs/` — no change. The F4.4E read API stays as it is.
- `apps/backend/src/realtime/` — no change. No new realtime emit kind.
- `apps/web/components/operations/` — no change (UI binding is F4.7.2).
- `apps/web/components/reports/` — no change.
- `apps/web/lib/hooks/useOperationsTrendSeries.ts` / `useOperationsLatestValues.ts` / `useOperationsRealtimeF4.ts` — no change.

## 13. Proposed API Surface

A small read + lifecycle-transition surface. Controller base path: `/well-tests`.

### 13.1 F4.7.1 endpoints

| Method | Path | Purpose | F4.7.1? |
|---|---|---|---|
| `GET` | `/api/v1/well-tests` | List well tests with filters (`unitId` / `wellId` / `status` / `testType` / time window). Tenant scoping via `CallerContext`. Orders by `createdAt DESC`. `limit` 1..200 default 50. | **Yes.** |
| `GET` | `/api/v1/well-tests/:id` | Detail row including `Job` summary + `Well` summary + `MeasurementUnit` summary (mirrors the F4.4E Jobs detail pattern). | **Yes.** |
| `GET` | `/api/v1/well-tests/active?unitId=...` | Current active test (most recent row in `connected / stabilizing / measuring`) for a unit. Returns `200 OK` with `null` envelope when none active. | **Yes.** |
| `POST` | `/api/v1/well-tests` | Create a new test in `scheduled` status. Requires `jobId`, `testType`, `plannedOfficialDurationHours`, `reportType`. | **Yes.** |
| `POST` | `/api/v1/well-tests/:id/transitions/connect` | `scheduled → connected`; records `connectedAt`. | **Yes.** |
| `POST` | `/api/v1/well-tests/:id/transitions/start-stabilization` | `connected → stabilizing`; records `stabilizationStartedAt`. | **Yes.** |
| `POST` | `/api/v1/well-tests/:id/transitions/start-official` | `stabilizing → measuring`; records `officialStartedAt` + sets `stabilizationEndedAt`. | **Yes.** |
| `POST` | `/api/v1/well-tests/:id/transitions/end-official` | `measuring → completed`; records `officialEndedAt`. | **Yes.** |
| `POST` | `/api/v1/well-tests/:id/transitions/abort` | `* → aborted`; records `abortedAt` + `abortReason`. | **Yes.** |
| `POST` | `/api/v1/well-tests/:id/transitions/close` | `completed → closed`; records `disconnectedAt` and optionally `reportGeneratedAt`. | **Yes.** |

### 13.2 Deferred to later phases

- `PUT` / `PATCH` on `/well-tests/:id` to edit metadata (`testType`, `plannedOfficialDurationHours`, `notes`, `clientReference`) — F4.7.1 may allow edits **only while** `status === 'scheduled'`. Richer edit windows are a future phase.
- `DELETE` on `/well-tests/:id` — not in F4.7.1; abort + close is the lifecycle path.
- Realtime emit for lifecycle transitions — not in F4.7.1. A future phase may add `well_test.transitioned` envelopes on the F4.6E.1 channel.
- Batch / multi-unit current-test endpoint — not in F4.7.1; UI fan-out is fine for the displayed unit set.

### 13.3 Auth / scoping

Inherits the project-wide no-auth posture (matches REST today). Controller passes `SystemContext` to the service. Tenant scoping is derived server-side from `ctx.tenantId` when set; `tenantId` is **not** a query parameter. The service signature is `async create(ctx: CallerContext, input: CreateWellTestQuery) → WellTestDetail`, etc.

## 14. Data Model Fields

The recommended `well_tests` Prisma model:

```prisma
model WellTest {
  id                                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId                          String    @map("tenant_id") @db.Uuid
  jobId                             String    @map("job_id") @db.Uuid
  wellId                            String    @map("well_id") @db.Uuid                     // denormalized for read efficiency
  unitId                            String    @map("unit_id") @db.Uuid                     // denormalized for read efficiency
  testType                          String                                                  // CHECK 'fiscalizacion' | 'optimizacion'
  reportType                        String    @map("report_type")                           // CHECK 'fiscalizacion_pdf' | 'optimizacion_pdf'
  status                            String    @default("scheduled")                         // CHECK enum per §5.1
  plannedOfficialDurationHours      Int       @map("planned_official_duration_hours")       // CHECK per §6.3
  connectedAt                       DateTime? @map("connected_at") @db.Timestamptz(6)
  stabilizationStartedAt            DateTime? @map("stabilization_started_at") @db.Timestamptz(6)
  stabilizationEndedAt              DateTime? @map("stabilization_ended_at") @db.Timestamptz(6)
  officialStartedAt                 DateTime? @map("official_started_at") @db.Timestamptz(6)
  officialEndedAt                   DateTime? @map("official_ended_at") @db.Timestamptz(6)
  disconnectedAt                    DateTime? @map("disconnected_at") @db.Timestamptz(6)
  reportGeneratedAt                 DateTime? @map("report_generated_at") @db.Timestamptz(6)
  abortedAt                         DateTime? @map("aborted_at") @db.Timestamptz(6)
  abortReason                       String?   @map("abort_reason")                          // CHECK length 1..240 when present
  notes                             String?                                                  // free-form; CHECK length 1..2000 when present
  clientReference                   String?   @map("client_reference")                       // CHECK length 1..120 when present
  createdBy                         String?   @map("created_by") @db.Uuid                    // FK User; SetNull on user delete
  updatedBy                         String?   @map("updated_by") @db.Uuid                    // FK User; SetNull on user delete
  createdAt                         DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt                         DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant            Tenant          @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  job               Job             @relation(fields: [jobId], references: [id], onDelete: Restrict)
  well              Well            @relation(fields: [wellId], references: [id], onDelete: Restrict)
  unit              MeasurementUnit @relation(fields: [unitId], references: [id], onDelete: Restrict)
  createdByUser     User?           @relation("WellTestCreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)
  updatedByUser     User?           @relation("WellTestUpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)

  @@index([tenantId], map: "well_tests_tenant_idx")
  @@index([jobId], map: "well_tests_job_idx")
  @@index([unitId, status], map: "well_tests_unit_status_idx")      // primary access path for "current test for this unit"
  @@index([unitId, officialStartedAt(sort: Desc)], map: "well_tests_unit_official_time_idx")  // Reports lookups
  @@index([wellId], map: "well_tests_well_idx")
  @@map("well_tests")
}
```

### 14.1 Wire shape — derived view

The F4.7.1 read response is a derived view, **not** a Prisma row dump. Stripped from the wire by default: `createdAt`, `updatedAt`, `createdBy` / `updatedBy` UUIDs (a future audit / RBAC phase may surface user displayNames; out of scope). `tenantId` is **never** on the wire — server-side concern.

### 14.2 Why `wellId` and `unitId` are denormalized

The "current test for this unit" query (`status IN ('connected','stabilizing','measuring')` AND `unitId = $1`) is the single hottest read path the future Operations UI will hit. Denormalizing `unitId` lets the `well_tests_unit_status_idx` index serve it without joining `Job`. The Prisma `Job` relation guarantees `wellId` and `unitId` match `Job.wellId` / `Job.unitId` at create time; F4.7.1 service-side guards enforce this at write.

### 14.3 Why `reportType` is stored, not derived

`reportType` is technically derivable from `testType` (Fiscalización ⇒ Fiscalización PDF; Optimización ⇒ Optimización PDF). It is stored explicitly so a future phase may introduce alternate report templates per test type (e.g., a long-form Fiscalización vs a one-pager) without restructuring. The Zod refine in §6.3 keeps the two values aligned today.

### 14.4 Index choices

- `well_tests_tenant_idx` — broad tenant scoping.
- `well_tests_job_idx` — list tests for a Job.
- `well_tests_unit_status_idx` — **primary access path**: "current test for this unit" (`(unitId, status)`).
- `well_tests_unit_official_time_idx` — Reports lookups by `(unitId, officialStartedAt DESC)`.
- `well_tests_well_idx` — list tests for a Well (read-rare; useful for the Wells screen later).

## 15. Validation Rules

Mirrors the F4.6F.1 / F4.6C.2.1 / F4.6D.2.1 posture: Zod refines at the wire boundary; DB CHECK constraints as the second line of defense; service-side guards for stateful rules.

### 15.1 Zod / DB CHECK rules

| Rule | Layer |
|---|---|
| `testType IN ('fiscalizacion','optimizacion')` | Zod enum + DB CHECK |
| `reportType IN ('fiscalizacion_pdf','optimizacion_pdf')` | Zod enum + DB CHECK |
| `status IN ('scheduled','connected','stabilizing','measuring','completed','aborted','closed')` | Zod enum + DB CHECK |
| `testType === 'fiscalizacion'` ⇒ `plannedOfficialDurationHours === 24` | Zod refine + DB CHECK |
| `testType === 'optimizacion'` ⇒ `plannedOfficialDurationHours BETWEEN 12 AND 24` | Zod refine + DB CHECK |
| `reportType` matches `testType` | Zod refine |
| `abortReason` length `1..240` when present | Zod + DB CHECK |
| `notes` length `1..2000` when present | Zod + DB CHECK |
| `clientReference` length `1..120` when present | Zod + DB CHECK |

### 15.2 Per-status non-null rules (DB CHECK)

```
status = 'scheduled'  →  (no extra non-null requirement)
status = 'connected'  →  connectedAt IS NOT NULL
status = 'stabilizing'→  connectedAt IS NOT NULL AND stabilizationStartedAt IS NOT NULL
status = 'measuring'  →  connectedAt IS NOT NULL AND stabilizationStartedAt IS NOT NULL
                          AND stabilizationEndedAt IS NOT NULL AND officialStartedAt IS NOT NULL
                          AND stabilizationEndedAt = officialStartedAt
status = 'completed'  →  all of the above AND officialEndedAt IS NOT NULL
                          AND officialEndedAt >= officialStartedAt
status = 'aborted'    →  abortedAt IS NOT NULL AND abortReason IS NOT NULL
status = 'closed'     →  status-completed conditions AND disconnectedAt IS NOT NULL
```

### 15.3 Service-side transition guards

| Rule | Where enforced |
|---|---|
| Lifecycle transitions follow the §5.3 diagram | Service-side guard in each transition method. |
| Cannot edit `testType` once `status >= 'measuring'` | Service-side guard. |
| Cannot edit `plannedOfficialDurationHours` once `status >= 'measuring'` | Service-side guard. |
| `officialStartedAt >= stabilizationStartedAt` | DB CHECK. |
| `officialEndedAt >= officialStartedAt` | DB CHECK. |
| At most one `status IN ('connected','stabilizing','measuring')` per unit at any time (no overlapping active tests on the same unit) | Service-side guard; surfaced as `409 Conflict`. |
| Report cannot reference a test that has not reached `completed` | Future Reports phase; out of scope for F4.7.1. |
| Generic chart window is **never** used as the official report window | Reviewer convention; reviewed at PR time for Reports phases. |

## 16. Non-Goals

Explicitly out of scope for F4.7-0 and F4.7.1:

- **Code implementation in F4.7-0.** Documentation-only artifact.
- **Reports PDF generation.** Future Reports phase, post-F4.7.1.
- **Full Operations redesign.** F4.7.2 wires range pills additively; deeper UI changes are separate phases.
- **`<LiveActiveAlarmsPanel>` migration.** Candidate F4.5G.4, deferred behind F4.7.
- **Alarm lifecycle transitions** (`acknowledged` / `cleared`). Candidate F4.6D.3.
- **Alarm chart annotations.** Candidate F4.5G.3.
- **Chart realtime tail** (`live_reading.updated` appended directly to `<TrendChart>`). Candidate F4.5G.2.3.
- **External integrations** (MQTT / Modbus / OPC-UA / ThingsBoard / Node-RED / PLC / edge / historian). Each gets its own phase.
- **Automatic valve-state detection.** No PLC; no edge automation.
- **PLC / edge workflow automation** of any kind.
- **Client / ministry e-signature** on the Fiscalización PDF.
- **Billing / commercial workflow** (invoicing, contract references beyond a free-form `clientReference`).
- **Multi-tenant batch endpoints.**
- **Auth / RBAC.** Inherits the project-wide no-auth posture.
- **New env variable, new dependency, `packages/types/` change.**

## 17. Test Plan for F4.7.1

Mocked-Prisma posture, mirroring `latest.service.spec.ts` / `alarm-events-read.service.spec.ts`.

### 17.1 New backend tests

**`apps/backend/src/well-tests/well-tests.service.spec.ts`** — new file. Covers:

1. **Empty list** — empty fleet → `wellTests: []` with envelope populated.
2. **Default ordering** — `createdAt DESC`.
3. **`unitId` filter** — `where` carries `unitId`.
4. **`wellId` filter**.
5. **`status` filter**.
6. **`testType` filter**.
7. **Time window filter** — `where` carries `officialStartedAt: { gte: from, lt: to }`.
8. **`limit` applied** — `take: limit`.
9. **Tenant scoping** — `ctx.tenantId` set → `where.tenantId` present; `SystemContext` → no `tenantId` filter.
10. **Response shape stability** — no `tenantId` / `createdAt` / `updatedAt` leak by default.
11. **Active-test endpoint** — returns the most recent row in `connected / stabilizing / measuring` for a unit.
12. **`active` endpoint with no active test** — returns `null` envelope.
13. **Create — happy path Fiscalización** — `status='scheduled'`, `plannedOfficialDurationHours=24`, `reportType='fiscalizacion_pdf'`.
14. **Create — happy path Optimización** — `plannedOfficialDurationHours` accepts 12..24.
15. **Create — rejects Fiscalización with duration != 24**.
16. **Create — rejects Optimización with duration outside 12..24**.
17. **Create — rejects `reportType` mismatched with `testType`**.
18. **Transition `connect`** — sets `connectedAt`, advances status, rejects from non-`scheduled`.
19. **Transition `start-stabilization`** — sets `stabilizationStartedAt`, advances status, rejects from non-`connected`.
20. **Transition `start-official`** — sets `officialStartedAt` + `stabilizationEndedAt`, advances status, rejects from non-`stabilizing`, rejects when `officialStartedAt < stabilizationStartedAt` (clock skew).
21. **Transition `end-official`** — sets `officialEndedAt`, advances status, rejects from non-`measuring`, rejects when `officialEndedAt < officialStartedAt`.
22. **Transition `abort`** — sets `abortedAt` + `abortReason`, advances status from any non-terminal state, requires `abortReason`.
23. **Transition `close`** — sets `disconnectedAt`, advances status from `completed` only.
24. **No overlapping active tests on the same unit** — second `connect` while a prior test is `measuring` → `409 Conflict`.
25. **Cannot edit `testType` once `measuring`** — service-side guard.
26. **Cannot edit `plannedOfficialDurationHours` once `measuring`** — service-side guard.
27. **Read does NOT trigger writes** (isolation invariant — mirrors F4.6C.2.1 / F4.6D.2.1 narrowing).
28. **Service uses `prisma.wellTest.*` only** — no `prisma.alarmEvent.*` / `prisma.liveReading.*` / `prisma.telemetryReading.*` writes (assertion).

### 17.2 Controller-level Zod validation tests

29. Empty `GET /well-tests` query (defaults applied).
30. Invalid `status` enum rejected.
31. Invalid `testType` / `reportType` enum rejected.
32. Non-UUID `unitId` / `wellId` rejected.
33. Time-range refines: both required, `from < to` enforced.
34. `limit` outside `1..200` rejected.
35. Unknown query field rejected (`.strict()`).
36. Create body: missing `jobId` rejected.
37. Create body: Fiscalización duration != 24 rejected at Zod layer.
38. Create body: `reportType` mismatched with `testType` rejected at Zod layer.
39. Transition body for `abort`: missing `abortReason` rejected.

### 17.3 Schema / migration validation

- `pnpm --filter @rvf/backend exec prisma validate` — schema valid.
- `pnpm --filter @rvf/backend exec prisma generate` — client compiles with the new `WellTest` model.
- Local migration validation per DX-2.
- Migration includes the table + the indexes + the CHECK constraints per §15.

### 17.4 No regression to existing surfaces

- Backend telemetry tests (260/260 baseline at `23f7dd1`) stay green.
- Backend Jobs tests stay green (the F4.4E read API is untouched).
- Backend alarm tests stay green.
- Frontend tests (480/480 baseline) stay green.

### 17.5 New frontend adapter tests

**`apps/web/lib/api-data/f4/well-tests.test.ts`** — new file. Covers:

40. Mock-mode happy path — list with default filters returns the seeded fixture.
41. Mock-mode `unitId` filter.
42. Mock-mode `status` filter.
43. Mock-mode active-test resolution.
44. Mock-mode create — Fiscalización + Optimización happy paths.
45. Mock-mode create — Fiscalización duration mismatch rejected (`RvfApiError(400, …)`).
46. Mock-mode transition `connect` happy path.
47. Mock-mode transition rejected from wrong status.
48. API-mode URL composition for list / detail / active / create / each transition endpoint.
49. API 400 surfaces as `RvfApiError`.

### 17.6 Expected test counts

| Metric | Before F4.7.1 (`544a8e3`) | After F4.7.1 (projected) |
|---|---|---|
| Backend tests | 260 / 260 | **+~30–40 new tests** (service spec + Zod tests, some overlap counted once) |
| Frontend tests | 480 / 480 | **+~10–15 new tests** (adapter dual-mode + transition wrappers) |

### 17.7 Validation commands (DX-3 §"Schema / migration phases" + §"Runtime phases")

- `pnpm --filter @rvf/backend exec prisma validate`
- `pnpm --filter @rvf/backend exec prisma generate`
- (Local migration validation per DX-2)
- `pnpm --filter @rvf/backend run lint -- --max-warnings 0`
- `pnpm --filter @rvf/backend run typecheck`
- `pnpm --filter @rvf/backend run build`
- `pnpm --filter @rvf/backend run test`
- `pnpm --filter @rvf/web run lint -- --max-warnings 0`
- `pnpm --filter @rvf/web run typecheck`
- `pnpm --filter @rvf/web run build`
- `pnpm --filter @rvf/web run test`

### 17.8 What F4.7-0 itself runs

**Nothing.** Documentation-only phase per DX-3 §"Documentation-only phases". Only `git status` + `git diff --stat` confirming only `docs/` changed.

## 18. Risks and Guardrails

| Risk | Mitigation |
|---|---|
| **Hardcoding every test as 24 h** in service code, UI, or Reports. | §6.3 Zod refine + DB CHECK rejects Fiscalización with duration != 24, **and** Optimización with duration outside 12..24. Reviewer rejects any UI dropdown that lists only `24` for both types. |
| **Treating `Job.startedAt` as `officialStartedAt`.** | §7 + §8: the official window is `WellTest.officialStartedAt` / `WellTest.officialEndedAt`, not `Job.startedAt`. Reviewer rejects any Reports or Operations diff that reads `Job.startedAt` as the certified-window left edge. |
| **Mixing stabilization data into Fiscalización totals.** | §10.1 + §15.3: certified totals derive from telemetry scoped to `(officialStartedAt, officialEndedAt)`, never `(stabilizationStartedAt, ...)`. Reviewer rejects any aggregation that joins through `stabilization*` timestamps for certification. |
| **Using a generic chart window as the official report window.** | §8 + §10 + §15.3: the generic pills (`15m / 1h / 6h / 24h / 7d`) are diagnostic. The Reports PDF generation phase must consume the `WellTest` row's official timestamps and reject any caller that passes a generic window. |
| **Allowing invalid lifecycle transitions.** | §5.3 + §15.3: service-side guards enforce the transition diagram; controller returns `409 Conflict` (or `400` for malformed payloads). Test #18–#23 assert each transition's allowed and rejected paths. |
| **Building Reports PDF before the official-window model exists.** | §16 explicitly defers Reports to a separate phase post-F4.7.1. The current `apps/web/components/reports/data/reports.mock.ts` archive remains mock-only until then. Reviewer rejects any backend `reports/` module introduced ahead of F4.7.1. |
| **Ignoring Optimización differences** in code that hardcodes Fiscalización flow. | §6 + §10.2: test type is a first-class field; the future Reports phase must branch on `testType` (or `reportType`) for PDF template selection and content rules. |
| **Overbuilding the full workflow too early** (e.g., introducing a connection-checklist table, a valve-state state machine, a pause/resume model). | §4.4 + §7.6 + §16: those features are explicitly deferred. F4.7.1 ships the narrow data layer + small write surface; further enrichment lives in future phases when a real consumer demands it. |
| **Two concurrent active tests on the same unit.** | §15.3: service-side guard rejects with `409 Conflict` when a `connect` transition would create a second `connected/stabilizing/measuring` row for the same unit. Asserted by test #24. |
| **Clock skew between client and server** at transition time. | Transitions record `now()` server-side, **not** the client-supplied timestamp. Client may submit an *intended* timestamp (e.g., "officially mark as started 5 min ago") which is rejected as out of scope for F4.7.1 — only server-`now` is recorded. |
| **Migration risk to existing tables.** | Schema migration is additive only (new `well_tests` table + indexes + CHECK constraints). No existing table is altered. The `Job.status` CHECK enum is **not** extended. |
| **Operator confusion: `Job.status` vs `WellTest.status`.** | Future UI surfaces the well-test status as the primary chip; `Job.status` is the deployment-level chip (rarely surfaced). Reviewer rejects UI diffs that conflate the two. |
| **Test-type / report-type drift after `measuring`.** | §6.3 + §15.3 service-side guard rejects edits to `testType` / `plannedOfficialDurationHours` once `status >= 'measuring'`. |
| **Reports phase pre-empting F4.7.2 official-window pill** and shipping certification before the chart UI surfaces the window. | Reviewer convention: the Reports backend phase ships after F4.7.1; the chart pill phase (F4.7.2) is independent but recommended ahead of Reports so the operator can verify the window visually before generation. |
| **Mocked-Prisma posture leaves real-DB integration unverified.** | Inherited risk from every F4.6 sub-phase. The `well_tests_unit_status_idx` access path is not exercised against a real Postgres in F4.7.1. A live-DB integration suite remains a candidate cross-phase deliverable. |

## 19. Acceptance Criteria for F4.7.1

F4.7.1 is complete when **all** of the following are true:

- [ ] `well_tests` table exists with the fields, types, CHECK constraints, and indexes per §14 + §15.
- [ ] Prisma schema additions are additive only — no existing column or index is altered; `Job.status` CHECK enum is unchanged.
- [ ] `WellTestsModule` lives at `apps/backend/src/well-tests/`, registered additively in `app.module.ts`.
- [ ] `WellTestsService` ships read + write methods per §13.1; tenant scoping via `CallerContext`; mocked-Prisma testable.
- [ ] `WellTestsController` exposes the F4.7.1 endpoint set per §13.1; Zod-validated; Swagger-decorated; passes `SystemContext` to the service.
- [ ] Zod refines + DB CHECK constraints enforce the rules per §15.
- [ ] Service-side guards enforce the transition diagram per §5.3, the no-edits-after-measuring rules per §15.3, and the no-overlapping-active-tests-per-unit rule.
- [ ] Response envelopes are derived views, **not** Prisma row dumps. `tenantId`, `createdAt`, `updatedAt`, and the user-id audit columns are not on the wire by default.
- [ ] No-data behavior: `GET /well-tests?unitId=...` with no matches → `200 OK` with `wellTests: []`. `GET /well-tests/active?unitId=...` with no active test → `200 OK` with `{ active: null }`. Never 404 on these paths.
- [ ] Invalid UUID / enum / time-range / unknown field → `400`; field path in the error.
- [ ] Frontend types `WellTestType` / `WellTestStatus` / `WellTestRow` / `WellTestDetail` / `WellTestsResponse` / `GetWellTestsParams` live in `apps/web/lib/api/f4/types.ts`.
- [ ] Frontend typed endpoint wrappers in `apps/web/lib/api/f4/endpoints.ts`.
- [ ] Frontend dual-mode adapter `adapterGetWellTests` (+ `adapterGetActiveWellTest`, + per-transition wrappers) at `apps/web/lib/api-data/f4/well-tests.ts`. Mock branch mirrors all backend refines + filters; api branch delegates.
- [ ] Mock fixtures `MOCK_F4_WELL_TESTS` added to `apps/web/lib/api-data/f4/mock-fixtures.ts` (HP-001 with one `measuring` + one `scheduled` test; LP-001 with one `completed` test).
- [ ] **No Operations UI binding.** No file under `apps/web/components/operations/` consumes the new adapter.
- [ ] **No Reports UI change.** `apps/web/components/reports/` and the Reports page render against `reports.mock.ts` byte-equivalent.
- [ ] **No alarm panel migration.** `<LiveActiveAlarmsPanel>` is untouched.
- [ ] **No alarm chart annotations.** `<TrendChart>` / `<TrendDrawer>` are untouched.
- [ ] **No `packages/types/` change. No new env variable. No new dependency.**
- [ ] **No F4.6 telemetry-arc change.** ingestion / projection / alarm evaluation / realtime / trend reads / latest reads / alarm-events reads are byte-equivalent.
- [ ] Backend tests **+~30–40 new** (per §17.6); existing 260/260 stay green. Frontend tests **+~10–15 new**; existing 480/480 stay green.
- [ ] DX-3 §"Schema / migration phases" + §"Runtime phases" validation passes end to end for both `@rvf/backend` and `@rvf/web`.
- [ ] F4.7.1 closeout report exists at `docs/architecture/RVF_Malinois_F4_7_1_Well_Test_Job_Lifecycle_Closeout.md`, follows the established closeout structure, reports the final test counts.
- [ ] Master roadmap §3 / §7 refresh — deferred to a small follow-up hygiene commit per the established pattern (`121803d`, `e03fbfc`, `6ded9f1`, `10102bc`, `544a8e3`).

## 20. Recommended Next Step

**Next step after F4.7-0: F4.7.1 — Well Test Job Lifecycle and Official Measurement Window Implementation.** Plan-first → implementation per the codified DX-3 pattern. Scope per §12; data model per §14; validation per §15; tests per §17; acceptance per §19.

After F4.7.1, the candidate sequence — the team picks based on observed demand:

- **Candidate F4.7.2 — Operations chart / drawer official-window pill.** Wires the new `WellTest` row's `(stabilizationStartedAt, officialStartedAt, officialEndedAt, connectedAt, disconnectedAt)` into the F4.5G.2.2.2 per-unit `<TrendDrawer>` (and the global chart) as three new primary pills: **Stabilization** / **Official window** / **Full test**. Generic `15m / 1h / 6h / 24h / 7d` pills become secondary diagnostics. Per-unit tile may gain a `STABILIZING` / `MEASURING` / `TEST COMPLETED` overlay chip. Frontend-only; consumes the F4.7.1 adapter; no backend change.
- **Candidate Reports PDF generation phase — Fiscalización certification.** First Reports backend phase. New `apps/backend/src/reports/` module. Generates the Fiscalización PDF for `status >= 'completed'` Fiscalización tests; scopes telemetry to the official window only.
- **Candidate Reports PDF generation phase — Optimización analysis.** Second Reports backend phase. Template + content rules for the Optimización PDF.
- **Candidate F4.5G.4 — LiveActiveAlarmsPanel Alarm Events API Cutover.** Now consumes the F4.7 lifecycle so the panel can distinguish "alarm during stabilization" from "alarm during measurement" honestly.
- **Candidate F4.5G.3 — Alarm chart annotations.** Wires `alarm.event.created` overlays onto `<TrendChart>` / `<TrendDrawer>` scoped (post-F4.7.2) to the certified measurement window.
- **Candidate F4.6D.3 — Alarm Lifecycle.** `active → acknowledged → cleared` transitions per ADR-005.
- **Candidate F4.5G.2.3 — Operations chart realtime tail.** Sized only on profiling demand.
- **Candidate F4.6C.3 — Latest-value batch / multi-unit endpoint.** Sized only on demand.
- **Candidate F4.5H — Non-telemetry screen adapter wiring.** Per-screen migrations for Wells / Equipment / Catalog / Tags / Settings off the F3 mock adapter. (Reports is **not** in this group — it stays paired with the F4.7 lifecycle.)

These are named so they have a place to land. None is committed to as part of F4.7-0. The next implementation phase is **F4.7.1**.

---

*F4.7-0 plan, authored at HEAD `544a8e3` (Refresh master roadmap after F4.6D.2.1). Plan-only. Update on phase close (`Current` → `Closed` with commit hash) and when F4.7.1 lands its closeout.*
