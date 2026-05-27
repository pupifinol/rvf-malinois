# RVF Malinois — Master Roadmap

> Top-level navigation roadmap and project-status document for RVF Malinois.
> Documentation-only artifact. Maintained alongside phase closeouts; updated when a phase closes, an ADR lands, scope changes, or the execution order shifts.
> Last known head at authoring time: commit `04dadc4` (DX-4 — Roadmap Update + Docker Runtime Note). Previously anchored at `1495457` (F4.6B.1).

## 1. Purpose

This document is the **master navigation roadmap** for the RVF Malinois project. It summarizes:

- which phases have closed,
- what is currently in flight,
- what comes next in the recommended execution order,
- what is explicitly deferred (and to which dedicated phase),
- the major architecture decisions currently in force,
- the rules every future phase is expected to operate under.

This roadmap does **not** replace the detailed phase plans, closeout reports, or ADRs. It links and summarizes them. When details matter, follow the references into the individual phase documents under `docs/architecture/` and the ADRs under `docs/adr/`.

## 2. Current Project Status

RVF Malinois is being built as **its own canonical platform**. The decision-of-record stack (ADR-006 / ADR-007 / ADR-008) locates ownership of telemetry, data model, ingestion, alarms, and operational logic inside RVF Malinois — not inside any third-party IoT vendor.

| Concern | Current ownership |
|---|---|
| Backend (NestJS) | RVF Malinois |
| Database | RVF Malinois on PostgreSQL (baseline; TimescaleDB strictly optional future optimization per ADR-007 §4) |
| Frontend (Next.js) | RVF Malinois |
| Read API (`/api/v1/{tenants,wells,tags,equipment,jobs,telemetry/trends}`) | Active on the F4 Prisma client (F4.4 reactivation closeout in commit `e6b40b6`) |
| Telemetry historical record | `telemetry_readings` — canonical, append-only |
| Telemetry ingestion boundary | RVF-owned; `POST /api/v1/telemetry/ingest` guarded by `RVF_INGEST_ENABLED` (F4.6B.1 in commit `1495457`) |
| Live projection | `live_readings` populated by the ingestion boundary inside the canonical insert transaction, quality-gated to `good`, watermark-gated by `timestamp` (F4.6C.1 in commit `49a8349`) |
| Alarm evaluation | Deferred to F4.6D |
| WebSocket / SSE fan-out | Deferred to F4.6E |
| External protocol bridges (MQTT / Modbus / OPC-UA / ThingsBoard / Node-RED / PLC / edge / historian) | Deferred — each future phase, possibly its own ADR; **none introduced yet** |

After F4.6C.1, the platform has both a controlled write path into canonical telemetry **and** a transactionally-consistent latest-value projection. Behavioral side effects further downstream (alarm evaluation, realtime fan-out, historical-trend extensions) remain firmly in their own future phases.

## 3. Phase Status Table

| Phase | Name | Status | Type | Main Deliverable | Commit / Reference | Notes |
|---|---|---|---|---|---|---|
| **ADR-001 → ADR-005** | Foundational ADRs (no PLC; tenant residency; sensor↔tag mapping; equipment catalog; snapshot/browser/freeze) | Closed | Architecture | ADR bundle | `6e9d1ca` (Add ADR 001-005 architecture addendum) + `docs/adr/RVF_Malinois_Adenda_Arquitectura_ADR_001_006_v1.4.md` | Original architectural ground rules; still in force. |
| **F2 (incl. F2A → F2D)** | Telemetry Runtime / Normalized Stream Foundation | Closed | Runtime + docs | Frontend telemetry runtime, alarm evaluator (in-memory), WebSocket adapter scaffold | F2 closeout `d6a693a`; F2 QA `ba4e6e9`; F2A `c824205`; F2 ADR/arch `9c52c21`; F2 runtime notes `323c641`; backend WS adapter `30ffad5`; alarm-center wire `e7c329c`; ops wire `54e8838` | ADR-005 invariants established. Frontend boundary fixed (`thresholdsSource: 'commissioning_snapshot'`). |
| **ADR-006** | RVF Malinois as primary platform / system of record | Closed | ADR | `docs/adr/ADR-006_RVF_Malinois_Primary_Platform_System_of_Record.md` | `9a46661` (Add F3 architecture and ADR-006) | Platform-level ownership decision. |
| **F3** | Backend API Foundation | Closed | Backend + docs | F3 API surface; `lib/api-data/` adapter seam | F3 foundation `6fc3a4a`; F3 closeout `c1f6ec2`; F3 arch `9a46661` | Read-only API contract for the canonical entities. |
| **F3.1** | Units Live Instrument Readings | Closed | Frontend + docs | Live instrument readings panel; SeparatorDiagram value chips | F3.1 commit `5d40ac0`; closeout `66df794` | Established Units / Operations responsibility split. |
| **F4 (architecture)** | Database Foundation Architecture | Closed | Architecture | 20-entity canonical data model | `f36923a` (Add F4 database foundation architecture) | Anchor doc for everything that follows. |
| **ADR-007** | RVF Malinois Database Foundation | Closed | ADR | `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md` | `8147399` (Add ADR-007 database foundation decision) | Persistence-layer corollary of ADR-006. |
| **F4.1** | PostgreSQL Schema Foundation | Closed | SQL | `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql` | `a475066` (Add F4.1 PostgreSQL schema foundation) | Plain PostgreSQL DDL; TimescaleDB-compatible but not required. |
| **F4.2A** | Prisma Reconciliation Plan | Closed | Plan | `docs/architecture/RVF_Malinois_F4_2A_Prisma_Reconciliation_Plan.md` | `7bd6103` (Add F4.2A Prisma reconciliation plan) | Plan-first pattern, validated. |
| **F4.2B** | Prisma Baseline Migration + Backend Insulation | Closed | Prisma + migration | Baseline migration `20260524000000_f4_2_baseline`; backend module quarantine | Strategy `a8862e2`; baseline `e37f7b5` | F1/F1.5 migrations archived. |
| **F4.3** | Seed / Reference Data | Closed | Seed | `apps/backend/prisma/seed.f4.ts` (1 tenant, 22 tags, HP-001/LP-001, 14 sensors+transmitters, 28 alarm rules, …) | `91e17aa` (Add F4.3 seed reference data) | Deterministic reference data for F4.4+. |
| **F4.4A → F4.4F** | Module-by-module API reactivation on F4 Prisma client | Closed | Backend | Tenants, Wells, CanonicalTags, Equipment, Jobs, Telemetry trends endpoints | A `2f5c108`, B `20dadca`, C `0ec1099`, D `3cdee45`, E `ebaa23b`, F `5e92a13` | F1 ingestion contracts deleted in F4.4F to clear runway for F4.6. |
| **F4.4 closeout** | API Reactivation Closeout | Closed | Docs | `docs/architecture/RVF_Malinois_F4_4_API_Reactivation_Closeout_Report.md` | `e6b40b6` (Add F4.4 API reactivation closeout report) | Quarantine fully closed. |
| **F4.5A → F4.5E** | Frontend F4 API client + adapter layer (foundation-only) | Closed | Frontend | `apps/web/lib/api/f4/` + `apps/web/lib/api-data/f4/` | A `20d45ec`, B `4b824d7`, C `f7ecf6c`, D `9d24831`, E `6af42fa` | Mock-default, env-flag-switchable to `api`. |
| **F4.5 closeout** | UI / API Wiring Foundation Closeout | Closed | Docs | `docs/architecture/RVF_Malinois_F4_5_UI_API_Wiring_Foundation_Closeout_Report.md` | `c1d24cc` (Add F4.5 UI API wiring foundation closeout report) | Adapter layer ready for per-screen migration. |
| **F4.5F** | First Screen Migration — Units Selector | Closed | Frontend | `useUnitsFleet` hook + `UnitSelector` prop-narrowing | `9e861ce` (Wire F4.5F units screen selector to F4 adapter) | First real per-screen migration. |
| **F4.5G+** | Per-screen migrations (Wells, Equipment, …) | **Pending / Parallelizable** | Frontend | TBD | — | May proceed in parallel with the F4.6 track; no dependency. |
| **F4.6 architecture + ADR-008** | Telemetry Persistence / Ingestion Architecture | Closed | Architecture + ADR | F4.6 architecture doc + ADR-008 (status: **Proposed**) | `c12a29c` (Add F4.6 telemetry persistence architecture ADR) | Documentation-first; ADR remains Proposed until implementation validates it. |
| **F4.6 closeout** | F4.6 Architecture Closeout | Closed | Docs | `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Closeout_Report_v1.0.md` | `334bfc5` (Add F4.6 telemetry persistence closeout report) | — |
| **F4.6A.0** | Schema Hardening Plan | Closed | Plan | `docs/architecture/RVF_Malinois_F4_6A_Schema_Hardening_Plan.md` | `014df37` (Add F4.6A schema hardening plan) | Locked names/predicates/columns before authoring migration. |
| **F4.6A.1** | Prisma Schema + Migration Implementation | Closed | Prisma + migration | `apps/backend/prisma/migrations/20260526000000_f4_6a_telemetry_hardening/` + schema additions | `6be7842` (Add F4.6A telemetry schema hardening migration) | `integration_source_id` column + 2 partial unique dedup indexes + `telemetry_ingestion_errors` + `live_readings` tables. VIEW preserved. |
| **F4.6B-0** | Ingestion Boundary Interface Plan | Closed | Plan | `docs/architecture/RVF_Malinois_F4_6B_Ingestion_Boundary_Plan.md` | `c4ea18a` (Add F4.6B ingestion boundary plan) | Locked service / wire / env-flag / resolution / dedup / hooks-prohibition before code. |
| **F4.6B.1** | Telemetry Ingestion Boundary Runtime Skeleton | Closed | Runtime + tests | `apps/backend/src/telemetry/ingestion/` (module + service + controller + contracts + 22 spec tests) + minimal `app.module.ts` edit | `1495457` (Add F4.6B telemetry ingestion boundary skeleton) | First runtime in the F4.6 arc. Backend tests 91/91. Gated by `RVF_INGEST_ENABLED`. |
| **DX-1** | Master Roadmap | Closed | Docs | This document | `b19e77a` (Add RVF Malinois master roadmap) | Top-level navigation. |
| **DX-2** | Local DB Migration Validation Procedure | Closed | Docs | `docs/operations/RVF_Malinois_Local_DB_Migration_Validation_Procedure.md` | `e3ccb52` (Add local DB migration validation procedure) | Landed before F4.6C per plan. |
| **DX-3** | Definition of Done | Closed | Docs | `docs/operations/RVF_Malinois_Definition_of_Done.md` | `65cb736` (Add RVF Malinois definition of done) | Per-phase-type DoD checklist (plan / migration / runtime / docs-only). |
| **F4.6C-0** | Live Readings Projection Updater Plan | Closed | Plan | `docs/architecture/RVF_Malinois_F4_6C_Live_Readings_Projection_Updater_Plan.md` | `f126c5c` (Add F4.6C live readings projection plan) | Plan first per project pattern. |
| **F4.6C.1** | Live Readings Projection Updater Implementation | Closed | Runtime | `apps/backend/src/telemetry/projection/live-readings-projection.service.ts` + wired into `TelemetryIngestionService` inside `prisma.$transaction` | `49a8349` (Add F4.6C live readings projection updater) | First backend collaborator authorized to write `prisma.liveReading.*`. Quality-gated to `good`; watermark-gated by `timestamp`. Backend tests 111/111. No new quarantine reasons. |
| **DX-4** | Roadmap Update + Docker Runtime Note | Closed | Docs | `docs/architecture/RVF_Malinois_DX_4_Roadmap_Update_Docker_Runtime_Note_v1.0.md` + README pointer | `04dadc4` (Add DX-4 roadmap update and Docker runtime note) | Developer-experience checkpoint after F4.6C.1. Documents Docker runtime, `/health` liveness contract, troubleshooting runbook, and confirms F4.6D as next implementation phase. |
| **F4.6D-0** | Alarm Evaluation Boundary Plan | **Next** | Plan | TBD | — | Owns operational-context-lookup design. |
| **F4.6D.1** | Alarm Evaluation Implementation | Deferred | Runtime | Backend alarm evaluator writing `alarm_events` | — | Browser does not evaluate. |
| **F4.6E-0** | WebSocket / SSE Fan-out Plan | Deferred | Plan | TBD | — | Downstream-only, never source of truth. |
| **F4.6E.1** | WebSocket / SSE Fan-out Implementation | Deferred | Runtime | Per-tenant / per-unit channels in `RealtimeModule` | — | Recovery via REST reconnect; not a replay buffer. |
| **F4.6F-0** | Historical Trend API / Operations Trend Support Plan | Deferred | Plan | TBD | — | Builds on `telemetry_readings` populated by F4.6B+. |
| **F4.6F.1** | Historical Trend API Implementation | Deferred | Runtime + frontend | Optional bucketing / downsampling extensions to `/telemetry/trends`; Operations chart cutover from F2 simulator | — | — |

For phase docs whose commit isn't tagged inline above, see the file itself under `docs/architecture/` or the corresponding entry in `git log`. **No commit hashes are invented in this table.**

## 4. Architecture Decision Summary

The following decisions currently govern the project. Each links back to its source-of-truth artifact.

1. **RVF Malinois is the canonical system of record.** ADR-006 (`9a46661`); reaffirmed at the database layer by ADR-007 (`8147399`); reaffirmed at the telemetry-write layer by ADR-008 (`c12a29c`, status **Proposed**).
2. **PostgreSQL is the baseline canonical database.** ADR-007 §3. TimescaleDB is an optional future optimization only (ADR-007 §4); F4 schema is plain-PostgreSQL and hypertable-compatible without redesign.
3. **TimescaleDB is not required.** No `create_hypertable()` anywhere in the schema or migrations. Conversion later does not affect the schema layout.
4. **Browser / UI does not write canonical telemetry directly.** ADR-005 (browser boundary) + ADR-008 §3 decision 2. Frontend has no ingestion route, no `prisma` access, no alarm evaluator that writes `alarm_events`.
5. **External systems are adapters / bridges, not source of truth.** ADR-008 §3 decision 1. ThingsBoard / Node-RED / MQTT / Modbus / OPC-UA / PLC / edge / historian may feed drafts through the ingestion boundary; none owns business state.
6. **Transmitter-first / sensor-first telemetry ownership.** ADR-008 §3 decision 4 + F4.6A.0 §5.A. Every accepted reading anchors to a configured `Sensor` and (through it) the currently-installed `TransmitterDevice` on a `MeasurementUnit`. Dedup keys lead with `sensor_id, canonical_tag_id`.
7. **Historical telemetry is canonical.** `telemetry_readings` is append-only and immutable. F4.6B.1 catches `P2002` and never `UPDATE`s or `UPSERT`s.
8. **`live_readings` is a derived projection.** ADR-008 §3 decision 5; F4.6A.0 §5.D; F4.6A.1 schema (`6be7842`). Rebuildable from `telemetry_readings`; not canonical history.
9. **`telemetry_ingestion_errors` is diagnostic / quarantine, not canonical history.** F4.6A.1 schema; F4.6B-0 §9.4 retention guidance; F4.6B.1 writes drafts that did not enter `telemetry_readings` here.
10. **Telemetry ingestion is gated by `RVF_INGEST_ENABLED`.** F4.6B-0 §8 + F4.6B.1 `app.module.ts` conditional registration (`1495457`). Default unset = route not registered = Nest 404.
11. **F4.6B.1 does not update `live_readings` yet.** Verified by isolation test #17. F4.6C is the dedicated phase that owns the upsert.
12. **Alarm evaluation, WebSocket / SSE fan-out, and external protocol integrations remain deferred.** Each has its own future phase; nothing is built ahead of its dedicated review.

## 5. Current Implemented Capabilities (as of `04dadc4`)

What exists today, end-to-end:

- **F4-aligned Prisma schema and migration baseline.** `apps/backend/prisma/schema.prisma` + `apps/backend/prisma/migrations/20260524000000_f4_2_baseline/` (`e37f7b5`).
- **`telemetry_readings` historical canonical table.** Append-only, indexed for trends queries; empty in default deployments.
- **`integration_source_id` column on `telemetry_readings`.** Nullable; scopes the source-aware sequence dedup index (F4.6A.1, `6be7842`).
- **Source-aware sequence dedup partial unique index** (`telemetry_readings_dedup_seq_uk`): `(integration_source_id, sensor_id, canonical_tag_id, sequence) WHERE sequence IS NOT NULL AND integration_source_id IS NOT NULL`.
- **Canonical-instrument timestamp dedup partial unique index** (`telemetry_readings_dedup_ts_uk`): `(sensor_id, canonical_tag_id, "timestamp") WHERE sequence IS NULL`.
- **Forensic auxiliary index** (`telemetry_readings_ingestion_id_idx`): partial, non-unique, on `(ingestion_id, created_at DESC)`.
- **`telemetry_ingestion_errors` quarantine table.** 19 columns; 15-value `reason` CHECK enum; 4 indexes.
- **`live_readings` projection table.** Exists with PK `(id)` + UNIQUE `(unit_id, sensor_id, canonical_tag_id)`. **Populated by F4.6C.1** (`49a8349`) inside the same `prisma.$transaction` as the canonical `telemetry_readings` insert; quality-gated to `good`, watermark-gated by `timestamp` (strictly newer overwrites).
- **`live_readings_projection` SQL VIEW** preserved (F4.6A.0 §5.E) for non-destructive coexistence; will be revisited at F4.6C / F4.6F.
- **Backend telemetry ingestion boundary module** at `apps/backend/src/telemetry/ingestion/` (`1495457`).
- **`POST /api/v1/telemetry/ingest` HTTP endpoint** — exists **only** when `RVF_INGEST_ENABLED === 'true'`.
- **Zod validation** for the ingestion request body (`contracts/ingestion.ts`); rejects unknown fields, enforces `samples` size `1..1000`, strict `quality` enum.
- **IntegrationSource and IntegrationMapping resolution** server-side. Tenant derived from `IntegrationSource.tenant_id`; never trusted from payload.
- **Sensor / canonical-tag resolution** with active `SensorTagBinding` fallback.
- **`telemetry_readings` insert path** (canonical write).
- **`telemetry_ingestion_errors` quarantine path** (diagnostic write).
- **Duplicate / conflict handling** via `Prisma.PrismaClientKnownRequestError` code `P2002`. Identical = `duplicate` no-op; different = `conflict_quarantined` with `reason='conflict_dedup'`.
- **22 backend ingestion tests + 11 projection tests + 9 ingestion-projection integration tests + 69 baseline tests = 111/111 passing** as of F4.6C.1. Tests cover every quarantine reason F4.6B.1 emits plus the F4.6C.1 projection outcomes (`created`, `updated`, `skipped_stale`, `skipped_equal_timestamp`, `skipped_quality`), race-safety on P2002 during create, and rollback semantics when the projection writer fails. Remaining isolation invariants (no `alarm_events`, no realtime emit, no Jobs) carried forward unchanged.
- **Read API surface (F4.4)**: `/api/v1/{tenants, wells, tags, equipment, jobs, telemetry/trends}` active. 69 backend test coverage preserved across all six modules.
- **Frontend F4 adapter layer** (`apps/web/lib/api-data/f4/` + `apps/web/lib/api/f4/`) — F4.5A → F4.5E. Mock-default; `NEXT_PUBLIC_RVF_DATA_SOURCE=api` switches every adapter to the live API.
- **First screen migration shipped** (F4.5F, `9e861ce`): `/units` fleet selector reads from the F4 adapter (mock or api per env flag).

## 6. Explicitly Not Implemented Yet

What is **not** yet built; deferred to its dedicated phase:

- **Alarm evaluation engine.** F4.6D. `alarm_events` is provisioned but no row has ever been written by production code.
- **Alarm event generation from telemetry.** F4.6D.
- **WebSocket / SSE real-time fan-out.** F4.6E. The existing `apps/backend/src/realtime/` scaffold routes no telemetry.
- **Historical trend API extensions** (bucketing, downsampling, multi-tag reads). F4.6F. `/telemetry/trends` remains read-only point-level.
- **Operations trend UI wiring.** Operations charts still render from the F2 simulator + F3 mock. F4.6F or a follow-up screen-migration sub-phase.
- **Units current-value API surface (`GET /api/v1/telemetry/latest` or equivalent).** Not yet exposed. F4.6C.1 populates `live_readings` server-side but does not introduce a read endpoint; the shape of the public read API for current values is deferred to a follow-up sub-phase (candidate F4.6C.2 or part of F4.5G+ screen migrations).
- **MQTT bridge.** Future adapter phase.
- **Modbus bridge.** Future adapter phase.
- **OPC-UA bridge.** Future adapter phase.
- **ThingsBoard bridge.** Future adapter phase.
- **Node-RED bridge.** Future adapter phase.
- **PLC adapter.** Future adapter phase.
- **Historian adapter.** Future adapter phase.
- **Simulator runtime.** Deferred. The `RVF_TELEMETRY_SIMULATOR` flag noted in F4.6 architecture is not wired.
- **Production authentication / authorization for ingestion.** Candidate ADR-009.
- **Queue / worker architecture for ingestion.** Out of scope until throughput pressure justifies it.
- **Jobs model / UI changes related to ingestion.** Jobs and `CommissioningSnapshot` exist in the F4 schema but no active Jobs flow is wired into ingestion. `closed_job` is **not** a quarantine reason. The neutral `inactive_context` placeholder is the only forward-looking gesture; operational-context wiring is a candidate ADR-012.
- **TimescaleDB hypertables or time-series optimization.** Candidate ADR-010; not required.

## 7. Recommended Execution Order

Already closed since the previous revision of this roadmap (commit `1495457`): DX-1 (`b19e77a`), DX-2 (`e3ccb52`), DX-3 (`65cb736`), F4.6C-0 (`f126c5c`), F4.6C.1 (`49a8349`), DX-4 (`04dadc4`).

The recommended order from here:

1. **F4.6D-0 — Alarm Evaluation Boundary Plan.** Operational-context lookup design (which `CommissioningSnapshot` applies?). Threshold-resolution and lifecycle-transition rules. Plan-first per the DX-3 pattern.
2. **F4.6D.1 — Alarm Evaluation Implementation.** Backend evaluator writing `alarm_events` lifecycle. Browser still does not evaluate; F2 frontend evaluator switches data source to persisted events here.
3. **F4.6E-0 — WebSocket / SSE Fan-out Plan.** Channel topology, payload shape, throttle policy. Downstream-only.
4. **F4.6E.1 — WebSocket / SSE Fan-out Implementation.** Per-tenant / per-unit emit after transaction commits. REST reconnect remains the recovery path.
5. **F4.6F-0 — Historical Trend API Plan.** Bucketing / downsampling / multi-tag read decisions. UI cutover plan for Operations charts off the F2 simulator.
6. **F4.6F.1 — Historical Trend API Implementation.** Endpoint extensions and the Operations chart screen migration.
7. **F4.5G — Resume UI adapter wiring** (Wells, Equipment, Catalog, …). May also proceed in parallel with F4.6D+ for non-telemetry screens.

**Why F4.6D is next:**

- **F4.6C.1 closed the canonical-write side** end-to-end: ingestion accepts samples, persists to `telemetry_readings`, updates `live_readings` inside the same transaction. Alarms are the next behavioral concern downstream of accepted readings.
- **DX-3 (Definition of Done) is now in force** and the F4.6B.1 / F4.6C.1 closeouts established the test-isolation pattern (no `alarm_events`, no realtime emit, no Jobs). F4.6D inherits that contract.
- **Sequencing F4.6D before F4.6E** keeps the realtime fan-out plan downstream of a stable alarm-event producer — otherwise the channel topology and payload shape would have to be revisited once alarms exist.

Candidate follow-ups not in the main sequence (drafted as the live-readings read API is needed):

- **Candidate F4.6C.2 — Latest-value read API.** Public `GET /api/v1/telemetry/latest` (or equivalent) over the now-populated `live_readings`. Shape decided when a screen migration requires it.

Parallel work allowed at any time without unblocking the main track:

- **F4.5G+** — per-screen migration of non-telemetry screens (Wells, Equipment, Catalog, Tags, Settings) from the F3 mock adapter to the existing F4.5B / F4.5C adapter. Independent of the F4.6 implementation arc.

## 8. Phase Control Rules

To prevent scope creep and keep phases reviewable, every future phase must respect the following:

1. **Plan before implementation when architecture, database, or runtime behavior changes.** F4.2A→F4.2B and F4.6A.0→F4.6A.1 and F4.6B-0→F4.6B.1 are the validated pattern. Pure documentation phases skip the plan-first step.
2. **Every implementation phase ships a closeout report.** Path convention: `docs/architecture/RVF_Malinois_<phase>_<short>_Closeout_Report_v1.0.md`. The report records files changed, validation results, deferred work, and the recommended next phase.
3. **Every phase ends with `git status` clean and the commit pushed to `main`.** A phase that leaves dirty working state is not closed.
4. **Do not combine unrelated backend / frontend / database / integration work in one phase.** Each phase has one concern. The reason F4.6 is broken into A / B / C / D / E / F is precisely to keep them reviewable.
5. **External integrations each get their own plan / ADR or sub-phase.** A future MQTT bridge phase, OPC-UA bridge phase, ThingsBoard bridge phase, etc., are separate deliverables. None is rolled into a generic "integrations" phase.
6. **Jobs remain deferred until an explicit Jobs phase exists.** No phase may smuggle Jobs lookup, Jobs UI, Jobs-bound persistence, or Jobs-specific quarantine reasons. `closed_job` is **not** in the `telemetry_ingestion_errors_reason_chk` enum. The neutral `inactive_context` placeholder is the only forward-looking gesture.
7. **Do not update `live_readings` outside the approved F4.6C scope.** Backend code outside F4.6C must not call `prisma.liveReading.create` / `.upsert` / `.update`. Test invariants verify this.
8. **Do not emit WebSocket / SSE telemetry outside the approved F4.6E scope.** `apps/backend/src/realtime/` is preserved as scaffolding until F4.6E owns its first emit.
9. **Do not add alarm engine behavior outside the approved F4.6D scope.** No `prisma.alarmEvent.*` mutation outside F4.6D. Browser must continue to never write `alarm_events`.
10. **ADR transitions are explicit.** `Proposed` ADRs move to `Accepted` only after at least one implementation sub-phase has validated their principles. ADR-008 stays `Proposed` until at least F4.6C (and ideally a live-DB integration suite) confirms the boundary semantics.
11. **Never invent commit hashes in documentation.** When referencing a commit, copy it from `git log`. When no commit exists, write `(pending)` or `TBD`.

## 9. Commit Hygiene and Validation Expectations

Different phase types call for different validation surfaces. The following is the expected pattern; DX-3 will codify it in detail.

### Documentation-only phases (e.g. DX-1, DX-2, DX-3, F4.6 architecture, plan files, closeouts)

- Confirm only docs changed: `git diff --stat` should touch only `docs/` (and the closeout file itself).
- `git status`.
- Commit with a descriptive subject line ("Add F4.6X plan", "Add F4.6X closeout report", "Add Master Roadmap", …).
- Push.

### Schema / migration phases (e.g. F4.6A.1, future F4.6C.1 if it edits schema)

- `pnpm --filter @rvf/backend exec prisma validate` — schema valid.
- `pnpm --filter @rvf/backend exec prisma generate` — client compiles.
- Local migration validation per the standardized DX-2 procedure (once it exists).
- `pnpm --filter @rvf/backend run lint` — clean, `--max-warnings 0`.
- `pnpm --filter @rvf/backend run typecheck` — clean (src + prisma).
- `pnpm --filter @rvf/backend run build` — clean.
- `pnpm --filter @rvf/backend run test` — all green; new tests if applicable.
- `pnpm run lint` / `typecheck` / `build` (workspace) — all green; web build cached if untouched.
- Commit, push, confirm `git status` clean.

### Runtime phases (e.g. F4.6B.1, future F4.6C.1 / D.1 / E.1)

- `prisma validate` / `generate` if Prisma types are used.
- Backend lint / typecheck / build.
- Backend tests: every new runtime path covered; isolation invariants asserted (no `live_readings`, no `alarm_events`, no realtime, no Jobs unless that's the phase's concern).
- Workspace lint / typecheck / build.
- Explicit confirmation in the closeout report that **forbidden areas were not touched** (frontend, Prisma schema if not a schema phase, seed, package files, CI, external libs).
- Commit, push, confirm `git status` clean.

## 10. Open Risks

| Risk | Mitigation |
|---|---|
| The new ingestion boundary is fresh runtime and needs careful review. | F4.6B.1 closeout documents the contract and the 22 service tests; reviewers can cross-check the test names against §5–§13 of F4.6B-0. DX-3 (Definition of Done) will codify the per-PR review checklist. |
| `live_readings` projection drift vs `telemetry_readings`. | F4.6C.1 (`49a8349`) places the projection upsert inside the same `prisma.$transaction` as the canonical insert, so they commit / rollback together. Watermark gate ensures late readings persist canonically but never overwrite the projection. Deterministic rebuild from `telemetry_readings` remains possible (the projection is non-canonical by ADR-008 §3 decision 5). |
| Dedup logic depends on correct partial unique indexes and conflict handling. | F4.6A.1 indexes are partial UNIQUE with explicit predicates; F4.6B.1 catches `P2002` and classifies (duplicate vs conflict) by field-by-field comparison. Real-DB integration test deferred but planned. |
| Tenant / source mapping must avoid trusting payload identities. | Wire schema (F4.6B.1 `contracts/ingestion.ts`) does not carry `tenantId`. Service derives tenant from `IntegrationSource.tenant_id`. Test #21 asserts `ctx.tenantId` is ignored. Reviewer rejects any PR that re-introduces payload-supplied tenancy. |
| External protocol integrations can introduce scope creep into other phases. | Phase Control Rule §8.5: each integration gets its own plan / ADR / sub-phase. No phase rolls bridges into other concerns. |
| Alarm evaluation must not be implemented in the browser. | ADR-005 invariant preserved by ADR-008 §3 decision 10. F4.6D owns the backend evaluator. Frontend F2 evaluator continues to consume persisted `alarm_events` once F4.6D ships. |
| WebSocket / SSE fan-out must remain downstream of persistence, not source of truth. | ADR-008 §3 decision 11. F4.6E's plan must commit to "emit after commit"; recovery via REST reconnect, not WebSocket replay. |
| Jobs terminology creeping into the boundary before Jobs is designed. | `closed_job` excluded from the F4.6A.1 CHECK enum. `inactive_context` is the neutral forward-looking placeholder. F4.6B.1 test #20 asserts `jobId = null` on canonical inserts. A future ADR (candidate ADR-012) will introduce the operational-context model. |
| ADR-008 transitioning to `Accepted` prematurely. | Phase Control Rule §8.10: F4.6C.1 has now shipped (`49a8349`) and exercised the canonical-insert / projection-upsert transactional contract, but ADR-008 should remain `Proposed` until a live-DB integration suite verifies dedup / projection / conflict semantics end-to-end (currently exercised only via mocked Prisma in 111 unit tests). |

## 11. Glossary / Terms

**Measurement Unit.** A physical RVF instrument package (EMMAD-01, EMMAD-02, LP-001 …) in the catalog. Modeled as `measurement_units`. Each carries its own `UnitConfiguration` and `UnitOperatingEnvelope` (per F4 §E). No global configuration applies.

**Sensor.** A logical measurement point on a `MeasurementUnit` (e.g. inlet pressure transmitter at HP-001). Modeled as `sensors`. Persists across `TransmitterDevice` replacements. The unit of identity for telemetry dedup keys (sensor-first / transmitter-first principle).

**Transmitter / TransmitterDevice.** The physical / digital device implementing a `Sensor` at a point in time. Modeled as `transmitter_devices` with calibration history, firmware version, protocol, replacement timestamps. One `Sensor` has at most one currently installed `TransmitterDevice`.

**CanonicalTag.** RVF's fixed measurement vocabulary (`p_inlet`, `q_gas`, `t_inlet`, …). Modeled as `canonical_tags`. Globally unique by `name`; never deleted, only deprecated.

**SensorTagBinding.** Effective-dated mapping from a `Sensor` to a `CanonicalTag` (ADR-003). At most one active binding per sensor (`effective_to IS NULL`).

**IntegrationSource.** A row representing a future inbound integration channel. Modeled as `integration_sources` with a `kind` CHECK enum (`manual`, `mqtt`, `node_red`, …) and a `status` (`active` / `inactive`). The boundary refuses to ingest from an inactive source (quarantine `inactive_context`).

**IntegrationMapping.** A row translating an external identifier from a specific `IntegrationSource` to a canonical `(unit_id, sensor_id, canonical_tag_id)` triple. Modeled as `integration_mappings` with `UNIQUE (integration_source_id, external_identifier)`. Mappings may be disabled but are never deleted.

**TelemetryReading.** The canonical, append-only, immutable historical record of one measurement. Modeled as `telemetry_readings`. Never `UPDATE`d or `DELETE`d under normal operation. Carries every reading's full provenance: tenant, unit, sensor, canonical tag, timestamp, value, engineering unit, quality, source (kind), and (F4.6A.1) `integration_source_id`.

**LiveReading.** A derived projection of the latest reading per `(unit_id, sensor_id, canonical_tag_id)`. Modeled as `live_readings` (F4.6A.1 table) — currently empty until F4.6C populates it. Also exposed as the F4.2 SQL VIEW `live_readings_projection` for non-destructive coexistence. Not canonical; rebuildable from `telemetry_readings`.

**TelemetryIngestionError.** A diagnostic / quarantine row recording one draft that did not enter `telemetry_readings`. Modeled as `telemetry_ingestion_errors`. CHECK enum of 15 reasons (`late_outside_window`, `future_timestamp`, `unknown_source`, …, `mapping_engine_failure`); no Jobs-specific reason. Rows are diagnostic and may be pruned by a future retention task.

**Quarantine.** The act of recording a non-acceptance outcome to `telemetry_ingestion_errors` instead of dropping the draft silently. Every per-sample failure in F4.6B.1 either becomes a quarantine row with one of the 15 reasons or, in the case of identical duplicates, a no-op `duplicate` outcome.

**Ingestion Boundary.** The single backend submodule that owns the controlled write path into `telemetry_readings`. Today: `apps/backend/src/telemetry/ingestion/` (F4.6B.1, `1495457`). External tools never write canonical tables directly.

**Projection.** A derived view of canonical state, maintained for read performance. `live_readings` is RVF Malinois' canonical projection of `telemetry_readings` for current-value lookups. Losing a projection is recoverable; losing canonical history is not.

**Fan-out.** Downstream delivery of accepted events to subscribed clients (e.g. WebSocket emit after a `telemetry_readings` insert commits). F4.6E concern. Recovery on connection loss happens through REST reads, never through a fan-out replay buffer.

## 12. Maintenance Instructions

This roadmap is the single highest-level navigation document for the project. It should be updated when:

- **A phase closes.** Move the phase from "Current" or "Upcoming" to "Closed" in §3. Append the closing commit hash. Update §5 (capabilities) and §6 (not implemented) accordingly.
- **A new ADR lands.** Reference it in §4 (Architecture Decision Summary). If it changes a deferred-vs-active classification, update §3.
- **A major scope change occurs** (e.g. a phase is split, merged, renamed, or descoped). Update §3 and §7. Add a short note in §10 (Risks) if the change creates a new risk.
- **The execution order changes.** Update §7 with the new sequence and the reasoning.
- **A deferred item becomes active.** Move it from "Deferred" to "Upcoming" or "Current" in §3 and §6. Update §7's recommended order.

Every closeout report from this point on should:

- State whether it changes the master roadmap (most closeouts will).
- Link back to this document (`docs/architecture/RVF_Malinois_Master_Roadmap.md`).
- If applicable, ship the roadmap update in the same commit so the master document and the phase's own deliverable stay in lockstep.

Phase plans (`*_Plan.md`) typically do **not** need to update this roadmap unless the plan introduces a new sub-phase that wasn't previously listed. In that case, add the new sub-phase to §3 (Phase Status Table) and §7 (Execution Order) as "Upcoming".

---

*Master Roadmap, last refreshed at HEAD `04dadc4` (DX-4 — Roadmap Update + Docker Runtime Note). Originally authored at HEAD `1495457` (F4.6B.1). Update on every phase close.*
