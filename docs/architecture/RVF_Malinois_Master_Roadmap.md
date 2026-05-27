# RVF Malinois — Master Roadmap

> Top-level navigation roadmap and project-status document for RVF Malinois.
> Documentation-only artifact. Maintained alongside phase closeouts; updated when a phase closes, an ADR lands, scope changes, or the execution order shifts.
> Last known head at authoring time: commit `1028153` (F4.5G-0 — Operations Chart Adapter + Expanded Trend View Plan). Previously anchored at `946a023` (F4.6F.1), `db86735` (F4.6F-0), `51dc626` (F4.6E.1), `22fa2ca` (F4.6E-0), `d35a2b8` (F4.6D.1), `901cd22` (F4.6D-0), `04dadc4` (DX-4), and `1495457` (F4.6B.1).

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
| Alarm evaluation | `AlarmEvaluationService` writes controlled `state='active'` `alarm_events` rows inside the canonical ingestion transaction (F4.6D.1 in commit `d35a2b8`). Internal / service-level only; no public API. Lifecycle (acknowledge / clear), notifications, and WebSocket / SSE fan-out remain deferred. |
| WebSocket / SSE fan-out | **Socket.IO over WebSocket implemented** by `RealtimeEmitterService` (F4.6E.1 in commit `51dc626`). Emits the three event kinds `telemetry.reading.accepted` / `live_reading.updated` / `alarm.event.created` to per-tenant rooms AFTER the canonical ingestion transaction commits; nothing on rollback. Env-gated by `RVF_REALTIME_EMIT_ENABLED`. SSE, frontend per-screen wiring, WebSocket auth, multi-replica adapter, durable outbox / replay buffer, and throttle / coalesce all remain deferred. |
| Historical trend API | **Bucketing implemented** by F4.6F.1 (commit `946a023`). `GET /api/v1/telemetry/trends` now supports **raw mode** (F4.4F behavior preserved byte-identical) **and bucketed mode** via three new optional query params: `bucket` (`1m` / `5m` / `15m` / `1h` / `1d`), `aggregate` (`avg` / `min` / `max` / `count` / `first` / `last`), `qualityPolicy` (`good_only` default / `include_uncertain` / `include_all`). Bucketed-mode aggregation runs via plain-PostgreSQL `date_bin` + `generate_series` LEFT JOIN (empty buckets emitted with `sampleCount: 0, value: null`). `TRENDS_BUCKETS_MAX = 1500` cap enforced in Zod before any DB call. **No TimescaleDB-specific API**, no new migration, no materialized view, no continuous aggregate. Multi-tag reads, multi-aggregation, materialized projection, frontend per-screen migration (Operations chart cutover → **F4.5G+**), auth, and rate limiting all remain deferred. |
| Operations chart adapter / UI adapter wiring | Planned — F4.5G-0 plan closed (commit `1028153`); implementation deferred to F4.5G.1. **First UI target is the Operations Live Trends area** (`apps/web/components/operations/LiveTrendsPanelLive.tsx`, today F2-simulator-backed via `useHistoryBuffer`). F4.5G.1 wires it to F4.6F.1 trend reads (raw mode for `15m` / `1h`; bucketed mode for `6h` / `24h` / `7d` per the F4.5G-0 §7.4 policy) and, where feasible, consumes F4.6E.1 `live_reading.updated` events for chart tail updates. A new **portal-based expanded trend view** (`<TrendDrawer>`) opens on chart click — same adapter, larger window, range pills. Simulator / mock fallback remains explicit and labeled by the freshness indicator (`NEXT_PUBLIC_RVF_DATA_SOURCE=api` opt-in for backend mode). **No other Operations panels migrate in F4.5G.1** (`<LiveVariableTile>`, `<LiveActiveAlarmsPanel>`, `<LiveCommunicationHealthPanel>`, `<FieldConditionsPanel>` all stay on existing adapters); **no other screens migrate** (Wells / Equipment / Catalog / Tags / Settings / Reports remain deferred). Alarm chart annotations, latest-value API, chart-library introduction, and multi-tag comparison all remain deferred. |
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
| **F4.5G-0** | Operations Chart Adapter + Expanded Trend View Plan | Closed | Plan | `docs/architecture/RVF_Malinois_F4_5G_Operations_Chart_Adapter_Expanded_Trend_View_Plan.md` | `1028153` (Add F4.5G-0 operations chart adapter and expanded trend view plan) | Locks the narrow F4.5G.1 scope to `<LiveTrendsPanelLive>` + a new `<TrendDrawer>`; range → query-mode policy (raw for `15m`/`1h`; bucketed for `6h`/`24h`/`7d`, default `aggregate='avg'`, `qualityPolicy='good_only'`); realtime tail consumes only `live_reading.updated` (avoids double-counting); alarm annotations deferred; portal drawer (no library); additive frontend type extensions only (no `packages/types/` change); ~12–18 new frontend tests; 14 acceptance criteria. |
| **F4.5G.1** | Operations Chart Adapter + Expanded Trend View Implementation | **Next** | Frontend | Wire `apps/web/components/operations/LiveTrendsPanelLive.tsx` to `adapterGetTelemetryTrends` (F4.5E) extended for F4.6F.1 bucketed mode; new `apps/web/components/operations/TrendDrawer.tsx` (portal-based) + `useOperationsTrendSeries` hook; additive types in `apps/web/lib/api/f4/types.ts` | — | Per-screen migration only — no backend change, no other Operations panels, no Wells / Equipment / Catalog / Tags / Settings / Reports screens, no chart library. Scope per F4.5G-0 §6 / §7 / §16. |
| **F4.5G+ (later)** | Per-screen migrations of non-telemetry screens (Wells, Equipment, Catalog, Tags, Settings, Reports) | Pending / Parallelizable | Frontend | TBD | — | May proceed in parallel with F4.5G.1 from the existing F4.5B / F4.5C / F4.5D adapter base; each screen is its own small slice. |
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
| **F4.6D-0** | Alarm Evaluation Boundary Plan | Closed | Plan | `docs/architecture/RVF_Malinois_F4_6D_Alarm_Evaluation_Boundary_Plan.md` | `901cd22` (Add F4.6D-0 alarm evaluation boundary plan) | Locks scope, semantics, persistence decision (option B — write `alarm_events` with `state='active'`, no lifecycle), internal-only API decision, ~15–20 planned test cases, and acceptance criteria for F4.6D.1. Recommends a minimal no-duplicate-active guard; lifecycle / dedup / notifications all deferred. |
| **F4.6D.1** | Alarm Evaluation Boundary Implementation | Closed | Runtime | `apps/backend/src/alarms/alarm-evaluation.service.ts` + ingestion-transaction wiring + first writes to `alarm_events` | `d35a2b8` (Add F4.6D.1 alarm evaluation boundary implementation) | First backend collaborator authorized to write `prisma.alarmEvent.*`. Strict-inequality thresholds; severity precedence within rule (`high_high > high > low_low > low`) and one event per matched rule across rules; quality-gated to `good`; duplicate-active guard prevents repeated `active` rows for the same `(unit, tag, rule)` while lifecycle remains deferred; frozen `rule_snapshot` JSONB. Internal / service-level only — no public API. Backend tests 140/140. Browser does not evaluate. |
| **F4.6E-0** | WebSocket / SSE Fan-out Plan | Closed | Plan | `docs/architecture/RVF_Malinois_F4_6E_WebSocket_SSE_Fan_Out_Plan.md` | `22fa2ca` (Add F4.6E-0 WebSocket SSE fan-out plan) | Locks protocol (Socket.IO over WebSocket; SSE deferred), event types (`telemetry.reading.accepted` / `live_reading.updated` / `alarm.event.created`), per-tenant room topology, emit-after-commit semantics, REST-only resync, no replay buffer, no auth (env-gated by `RVF_REALTIME_EMIT_ENABLED`), test plan (~21–25 new backend tests), and acceptance criteria for F4.6E.1. Reuses the existing F0/F2 `RealtimeGateway` scaffold. |
| **F4.6E.1** | WebSocket / SSE Fan-out Implementation | Closed | Runtime | `apps/backend/src/realtime/realtime-emitter.service.ts` + extended `RealtimeGateway` subscribe/unsubscribe + post-commit emit hook in `TelemetryIngestionService` + new `RealtimeF4Event` wire types | `51dc626` (Add F4.6E.1 WebSocket fan-out implementation) | First production emit from the existing gateway. Socket.IO over WebSocket; per-tenant rooms only (per-unit join is forward-compat seam); emit after `prisma.$transaction` resolves successfully; nothing on rollback; best-effort per-event try/catch; env-gated by `RVF_REALTIME_EMIT_ENABLED`. Three event kinds: `telemetry.reading.accepted` / `live_reading.updated` / `alarm.event.created` with `{ schema: 'rvf.realtime.v1', kind, emittedAt, payload }` envelopes. Backend tests 173/173. Browser does not consume yet (frontend per-screen wiring deferred). |
| **F4.6F-0** | Historical Trend API Plan | Closed | Plan | `docs/architecture/RVF_Malinois_F4_6F_Historical_Trend_API_Plan.md` | `db86735` (Add F4.6F-0 historical trend API plan) | Locks scope (extend the existing `/api/v1/telemetry/trends`, not replace), 3 new optional query params (`bucket` / `aggregate` / `qualityPolicy`), 5 fixed bucket sizes (`1m` / `5m` / `15m` / `1h` / `1d`) via plain-PostgreSQL `date_bin`, 6 aggregates (`avg` / `min` / `max` / `count` / `first` / `last`), `TRENDS_BUCKETS_MAX=1500` cap enforced in Zod, raw-mode contract preserved byte-identical, empty buckets emitted via `generate_series` LEFT JOIN, tenant scoping seam preserved, no schema / migration / frontend change. Multi-tag / multi-aggregation / materialized projection all deferred (candidates F4.6F.2 / F4.6F.3 / F4.6F.4). |
| **F4.6F.1** | Historical Trend API Implementation | Closed | Runtime | `apps/backend/src/telemetry/{contracts/trends,trends.service,telemetry.controller,trends.service.spec}.ts` extensions — optional bucketing branch via `prisma.$queryRaw` (`date_bin` + `generate_series` LEFT JOIN); raw-mode shape preserved byte-identical | `946a023` (Add F4.6F.1 historical trend API implementation) | Read-side only; uses the existing `telemetry_readings_unit_tag_time_idx` access path; no schema change, no migration, no new index, no materialized view. Three new optional query params (`bucket` / `aggregate` / `qualityPolicy`) with `bucket` ↔ `aggregate` XOR refine and `TRENDS_BUCKETS_MAX = 1500` cap in Zod (rejected before any DB call). Backend tests **195/195** across 15 spec files. Frontend per-screen migration of the Operations chart remains a separate task (F4.5G+). |

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

## 5. Current Implemented Capabilities (as of `1028153`)

What exists today, end-to-end:

- **F4-aligned Prisma schema and migration baseline.** `apps/backend/prisma/schema.prisma` + `apps/backend/prisma/migrations/20260524000000_f4_2_baseline/` (`e37f7b5`).
- **`telemetry_readings` historical canonical table.** Append-only, indexed for trends queries; empty in default deployments.
- **`integration_source_id` column on `telemetry_readings`.** Nullable; scopes the source-aware sequence dedup index (F4.6A.1, `6be7842`).
- **Source-aware sequence dedup partial unique index** (`telemetry_readings_dedup_seq_uk`): `(integration_source_id, sensor_id, canonical_tag_id, sequence) WHERE sequence IS NOT NULL AND integration_source_id IS NOT NULL`.
- **Canonical-instrument timestamp dedup partial unique index** (`telemetry_readings_dedup_ts_uk`): `(sensor_id, canonical_tag_id, "timestamp") WHERE sequence IS NULL`.
- **Forensic auxiliary index** (`telemetry_readings_ingestion_id_idx`): partial, non-unique, on `(ingestion_id, created_at DESC)`.
- **`telemetry_ingestion_errors` quarantine table.** 19 columns; 15-value `reason` CHECK enum; 4 indexes.
- **`live_readings` projection table.** Exists with PK `(id)` + UNIQUE `(unit_id, sensor_id, canonical_tag_id)`. **Populated by F4.6C.1** (`49a8349`) inside the same `prisma.$transaction` as the canonical `telemetry_readings` insert; quality-gated to `good`, watermark-gated by `timestamp` (strictly newer overwrites).
- **Backend `AlarmEvaluationService`** (`d35a2b8`) at `apps/backend/src/alarms/alarm-evaluation.service.ts`. **First backend collaborator authorized to write `prisma.alarmEvent.*`.** Invoked inside the same `prisma.$transaction` as the canonical insert and the projection upsert — the per-sample atomic order is now: **`telemetry_readings` insert → `live_readings` projection upsert → alarm evaluation**. Loads `(is_current = true, enabled = true)` `alarm_rules` for the reading's `(unit_id, canonical_tag_id)`; writes one `alarm_events` row per matched rule that has a violated band, with `state = 'active'` and a frozen `rule_snapshot` JSONB. Internal / service-level only.
- **Strict-inequality threshold semantics.** `high_high`/`high` trigger when `value >` band; `low`/`low_low` trigger when `value <` band; at the threshold is **not** a violation. Severity precedence within a rule: `high_high > high > low_low > low` (most-severe configured-and-crossed band wins, one event per rule). Severity precedence across rules: one event per matched rule (warning + critical can both fire on the same reading).
- **Duplicate-active guard on alarm writes.** Before each event create, `AlarmEvaluationService` runs a `findFirst` on `alarm_events` for the same `(unit_id, canonical_tag_id, alarm_rule_id, state='active')` and skips with `skipped_duplicate_active` if one is open. Prevents repeated `active` rows while the lifecycle (acknowledge / clear) remains deferred.
- **`alarm_events` table populated.** Previously empty across F4.6A.1 → F4.6C.1; F4.6D.1 introduces the first production writes. Uses the F4.2B baseline schema and the active-board partial index (`alarm_events_active_idx WHERE state = 'active'`) — no migration added.
- **`live_readings_projection` SQL VIEW** preserved (F4.6A.0 §5.E) for non-destructive coexistence; will be revisited at F4.6C / F4.6F.
- **Backend telemetry ingestion boundary module** at `apps/backend/src/telemetry/ingestion/` (`1495457`).
- **`POST /api/v1/telemetry/ingest` HTTP endpoint** — exists **only** when `RVF_INGEST_ENABLED === 'true'`.
- **Zod validation** for the ingestion request body (`contracts/ingestion.ts`); rejects unknown fields, enforces `samples` size `1..1000`, strict `quality` enum.
- **IntegrationSource and IntegrationMapping resolution** server-side. Tenant derived from `IntegrationSource.tenant_id`; never trusted from payload.
- **Sensor / canonical-tag resolution** with active `SensorTagBinding` fallback.
- **`telemetry_readings` insert path** (canonical write).
- **`telemetry_ingestion_errors` quarantine path** (diagnostic write).
- **Duplicate / conflict handling** via `Prisma.PrismaClientKnownRequestError` code `P2002`. Identical = `duplicate` no-op; different = `conflict_quarantined` with `reason='conflict_dedup'`.
- **195/195 backend tests across 15 spec files** as of F4.6F.1 (`946a023`). Breakdown: 22 ingestion tests (F4.6B.1) + 11 projection tests (F4.6C.1) + 9 ingestion-projection integration tests (F4.6C.1) + 21 alarm evaluation tests (F4.6D.1) + 8 ingestion-alarm integration tests (F4.6D.1) + 1 refined ingestion isolation test (F4.6D.1) + 10 emitter tests (F4.6E.1) + 11 gateway tests (F4.6E.1) + 12 ingestion-realtime integration tests (F4.6E.1) + 5 raw-mode trend tests (F4.4F, preserved verbatim) + 8 bucketed-mode service tests (F4.6F.1) + 10 Zod-validation tests for trend refines (F4.6F.1) + 69 baseline tests. F4.6F.1 coverage adds: bucketed-mode `$queryRaw` invocation (avg / min / max / count / first / last via parametrized `it.each`); aggregate value coercion to JS `Number` for response consistency; empty-bucket rows preserved through the parser; `qualityPolicy` default + explicit-policy echo; tenant filter preserved on the bucketed path (asserted via `Prisma.sql` values list); bucket ↔ aggregate XOR refine; qualityPolicy-without-bucket refine; bucket-count overflow refine (rejected before any DB call with the requested-count and cap named in the error); upper-bound count exactly at `TRENDS_BUCKETS_MAX` accepted. Refined isolation invariants from F4.6E.1 carry forward unchanged.
- **Read API surface (F4.4)**: `/api/v1/{tenants, wells, tags, equipment, jobs, telemetry/trends}` active. 69 backend test coverage preserved across all six modules.
- **Historical trend API — bucketed reads** (`946a023`). `GET /api/v1/telemetry/trends` now serves both **raw mode** (F4.4F shape byte-identical: `points: TrendPoint[]` with stored engineering unit, no conversion) **and bucketed mode** (`points: []`, populated `buckets: TrendBucket[]` with `{ bucketStart, bucketEnd, value: number | null, sampleCount }`). Reads target `telemetry_readings` directly via the existing `telemetry_readings_unit_tag_time_idx` access path. Bucketed-mode SQL is plain PostgreSQL `date_bin` (PG 14+; running PG 16 per `docker-compose.yml`) + `generate_series` LEFT JOIN for empty-bucket emission. Five fixed bucket sizes (`1m` / `5m` / `15m` / `1h` / `1d`); six aggregates (`avg` / `min` / `max` / `count` / `first` / `last`); three quality policies (`good_only` default / `include_uncertain` / `include_all`). `TRENDS_BUCKETS_MAX = 1500` cap enforced in Zod before any DB call. Tenant scoping seam preserved. **No new index, no migration, no materialized view, no TimescaleDB feature.** F4.5E frontend adapter remains compatible (raw-mode shape unchanged); per-screen consumption of bucketed responses is a follow-up task in **F4.5G+**.
- **Frontend F4 adapter layer** (`apps/web/lib/api-data/f4/` + `apps/web/lib/api/f4/`) — F4.5A → F4.5E. Mock-default; `NEXT_PUBLIC_RVF_DATA_SOURCE=api` switches every adapter to the live API. **Per-screen consumption status:** Units selector wired (F4.5F, `9e861ce`); Operations Live Trends area still mock-/simulator-backed pending F4.5G.1 (plan locked at `1028153`); Wells / Equipment / Catalog / Tags / Settings / Reports still on the F3 mock adapter pending later per-screen migrations. **Backend-ready surfaces** (F4.4 read APIs, F4.6F.1 bucketed trends, F4.6E.1 realtime push, F4.6D.1 alarm events) are available but most UI consumers have not yet migrated to consume them.
- **First screen migration shipped** (F4.5F, `9e861ce`): `/units` fleet selector reads from the F4 adapter (mock or api per env flag).
- **Backend realtime fan-out boundary** (`51dc626`). Socket.IO over WebSocket; `RealtimeGateway` at namespace `/realtime`, path `/api/v1/stream`, with F4.6E.1 `subscribe { tenantId, unitIds? }` / `unsubscribe` handlers in addition to the preserved F0 `connection` greeting and `ping → pong` echo. `RealtimeEmitterService` (`apps/backend/src/realtime/realtime-emitter.service.ts`) — **first backend collaborator authorized to emit business events from `RealtimeGateway.server`**. Invoked by `TelemetryIngestionService` ONLY AFTER `prisma.$transaction` resolves successfully; the canonical write path is now **`telemetry_readings` insert → `live_readings` projection upsert → alarm evaluation → (commit) → realtime fan-out**. Emits the three event kinds `telemetry.reading.accepted` / `live_reading.updated` / `alarm.event.created` (wire envelope `{ schema: 'rvf.realtime.v1', kind, emittedAt, payload }`) to the per-tenant room `tenant:${tenantId}`. Per-unit rooms `unit:${unitId}` are joined on subscribe as a forward-compat seam but are not yet a fan-out target. Best-effort per-event try/catch; nothing thrown out to the caller. **Env-gated by `RVF_REALTIME_EMIT_ENABLED`** mirroring F4.6B.1's `RVF_INGEST_ENABLED` opt-in production posture — when unset, `emitMany` no-ops while the gateway stays addressable (connection greeting, ping/pong, subscribe/unsubscribe all continue to work). Frontend `apps/web/lib/realtime/socket.ts` (`socket.io-client@^4.8.1`) and the F2D `BackendWebSocketTelemetryAdapter` remain wired but have not been migrated to consume the new event kinds yet — the frontend per-screen wiring is a separate task (candidate part of F4.5G+).

## 6. Explicitly Not Implemented Yet

What is **not** yet built; deferred to its dedicated phase:

- **Public alarm read API.** No HTTP route exposes `alarm_events`. F4.6D.1 writes rows but stays internal / service-level (F4.6D-0 §11). Candidate sub-phase **F4.6D.2 — Alarm Events Read API**, sized when a frontend consumer requires it.
- **Alarm lifecycle transitions** (`active` → `acknowledged` → `cleared`). Schema columns (`acknowledged_at`, `acknowledged_by`, `cleared_at`) and the `state` CHECK enum already exist; F4.6D.1 writes `state='active'` rows and never transitions them. Candidate sub-phase **F4.6D.3 — Alarm Lifecycle** (which also owns the `audit_logs` writes per ADR-005 — F4.6D.1 owes none because it only creates the initial active row, not a transition).
- **Notifications / escalation / webhooks / email / SMS / WhatsApp / push.** Not in the F4.6 arc. Deferred indefinitely until a dedicated phase exists.
- **SSE (Server-Sent Events) transport.** Not implemented; F4.6E-0 §6 analyzed SSE vs WebSocket and recommended single-transport (WebSocket via the existing Socket.IO scaffold). F4.6E.1 ships WebSocket only. A read-only SSE mirror remains a candidate sub-phase **F4.6E.2** if a use case appears (kiosks, third-party readers on bandwidth-constrained links).
- **Frontend per-screen realtime wiring.** F4.6E.1 ships server-side emission only. The frontend `apps/web/lib/realtime/socket.ts` and F2D `BackendWebSocketTelemetryAdapter` are wired but do not yet consume the new `telemetry.reading.accepted` / `live_reading.updated` / `alarm.event.created` event types. Per-screen migration is a separate frontend task (candidate part of F4.5G+).
- **WebSocket / SSE authentication.** F4.6E.1 inherits the project-wide no-auth posture (matches REST today). `RealtimeGateway`'s subscribe handler trusts the requested `tenantId`. CORS `ALLOWED_ORIGINS` and the network boundary are the only walls today. Candidate **ADR-009** + dedicated phase owns auth across REST and WebSocket uniformly.
- **Durable outbox / replay buffer / last-event-id resync** for missed events during a disconnect. Out of scope by design (F4.6E-0 §10.5 / §12) — recovery is REST reconnect against `telemetry_readings` / `live_readings` / `alarm_events`. No durable outbox table, no in-memory per-socket buffer, no last-event-id semantics. Subscribers that disconnect for N seconds miss any events in that window and re-read via REST.
- **Multi-replica Socket.IO adapter** (`@socket.io/redis-adapter` or equivalent). F4.6E.1 ships single-process emit only — sufficient for the single backend container per `docker compose up`. Candidate sub-phase **F4.6E.3** when a second replica appears in deployment.
- **Coalescing / throttling / batching of emits.** F4.6E.1 emits one Socket.IO frame per descriptor; coalesce is a future tuning concern (candidate **F4.6E.4**) once real backpressure is observed.
- **Per-unit room fan-out target.** F4.6E.1 joins `unit:${unitId}` rooms on subscribe (forward-compat seam) but emits only to the per-tenant room. Flipping per-unit emit on is a future concern when a real subscriber needs finer-grained scoping than per-tenant.
- **`alarm.event.acknowledged` / `alarm.event.cleared` emit kinds.** F4.6D.1 only writes `state='active'` alarm rows; F4.6E.1 emits only `alarm.event.created`. Lifecycle transitions (and their corresponding new emit kinds) are owned by candidate sub-phase **F4.6D.3 — Alarm Lifecycle**.
- **Stateful alarm semantics** — `deadband` hysteresis, `delay_seconds` debounce, rate-of-change rules, and use of the reserved `alarm_thresholds` table. F4.6D.1 reads `deadband` / `delay_seconds` into the `rule_snapshot` for audit but does **not** enforce them. Candidate sub-phase **F4.6D.4 — Stateful Threshold Semantics**.
- **Low-band rules in the F4.3 seed.** Schema supports them; the evaluator handles them correctly (F4.6D.1 tests #5–#8); the F4.3 seed populates only `high` / `high_high`. Seed expansion is a separate task, not assigned to a phase yet.
- **Multi-tag trend reads in a single request.** F4.6F.1 stays single-tag (one of `canonicalTagId` / `canonicalTagName`). Candidate sub-phase **F4.6F.2 — Multi-tag Trend Read** if a chart needs several series in one call.
- **Multi-aggregation trend reads in a single request.** F4.6F.1 supports one `aggregate` per call. Candidate **F4.6F.3** if a screen needs avg + min + max for the same bucket in one call.
- **Trend aggregation projection / materialized view / continuous aggregate.** F4.6F.1 computes buckets at query time. Candidate **F4.6F.4 — Trend Aggregation Projection** only on real profiling demand (sustained ingestion >1k samples/s/tenant, multi-month windows >500ms p95).
- **TimescaleDB-specific features** (`time_bucket`, `time_bucket_gapfill`, hypertable, continuous aggregate). ADR-007 §4 keeps Timescale optional; nothing in F4.6F.1 (or any prior F4.6 sub-phase) depends on it. Candidate ADR-010 if adoption is ever proposed.
- **Operations chart cutover from F2 simulator + F3 mock to live `telemetry_readings` reads.** Implementation owned by **F4.5G.1** (scope locked by F4.5G-0 plan at `1028153`). F4.5G.1 wires `<LiveTrendsPanelLive>` to F4.6F.1 trend reads via the existing F4.5E adapter seam — extended additively in the frontend types for the new bucketed-mode fields — and (where feasible) consumes F4.6E.1 `live_reading.updated` events for tail updates.
- **Expanded trend view / `<TrendDrawer>`.** New chart-click → drawer interaction with a `15m / 1h / 6h / 24h / 7d` range selector. Implementation owned by **F4.5G.1**. Today no modal / dialog / drawer / sheet primitive exists in `apps/web/components/` or `packages/ui/`; F4.5G.1 introduces a screen-local portal-based drawer (no library dependency).
- **Alarm chart annotations** (`alarm.event.created` overlay markers on `<TrendChart>` / `<TrendDrawer>`). Deferred. Forward-compat seam in the realtime hook only; rendering deferred to candidate **F4.5G.3**.
- **Other Operations panels** (`<LiveVariableTile>`, `<LiveActiveAlarmsPanel>`, `<LiveCommunicationHealthPanel>`, `<FieldConditionsPanel>`) and **other screens** (Wells / Equipment / Catalog / Tags / Settings / Reports). Not part of F4.5G.1. Candidate follow-ups: F4.5G.2 (Operations realtime tile / status wiring), F4.5H (non-telemetry screen migrations).
- **Frontend per-screen wiring of realtime push beyond `<LiveTrendsPanelLive>`'s tail.** F4.6E.1 ships server-side emission; F4.5G.1 consumes only `live_reading.updated` for the active chart's `(unitId, canonicalTagId)`. `telemetry.reading.accepted` (every accepted sample, including non-good) is intentionally ignored in F4.5G.1 to avoid double-counting against the `good_only` policy. Per-tile / per-panel realtime consumption is deferred.
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

Already closed since the previous revision of this roadmap (commit `1495457`): DX-1 (`b19e77a`), DX-2 (`e3ccb52`), DX-3 (`65cb736`), F4.6C-0 (`f126c5c`), F4.6C.1 (`49a8349`), DX-4 (`04dadc4`), F4.6D-0 (`901cd22`), F4.6D.1 (`d35a2b8`), F4.6E-0 (`22fa2ca`), F4.6E.1 (`51dc626`), F4.6F-0 (`db86735`), F4.6F.1 (`946a023`), **F4.5G-0 (`1028153`)**.

**The F4.6 backend telemetry-persistence arc is complete end-to-end:** ingest (F4.6B.1) → projection (F4.6C.1) → alarm evaluation (F4.6D.1) → realtime push (F4.6E.1) → historical / bucketed reads (F4.6F.1). The recommended order from here:

1. **F4.5G.1 — Operations Chart Adapter + Expanded Trend View Implementation.** First UI consumer of the F4.6 backend arc. Scope, range-to-mode policy, expanded-view UX, realtime tail strategy, additive types, fallback policy, tests, and acceptance all locked by F4.5G-0 (`1028153`). Wires `<LiveTrendsPanelLive>` to F4.6F.1 trend reads via the existing F4.5E adapter seam; introduces a portal-based `<TrendDrawer>` for chart-click expanded inspection; consumes `live_reading.updated` for the active chart's tail. **No backend change, no other Operations panels, no other screens, no chart library, no `packages/types/` change.**
2. **(Candidate) F4.5G.2 — Operations realtime tile / status wiring.** Migrates `<LiveVariableTile>` / `<MultiphaseUnitCard>` to consume `live_reading.updated` opportunistically (or waits for candidate F4.6C.2 latest-value API and switches to pull).
3. **(Candidate) F4.5G.3 — Alarm chart annotations.** Wires `alarm.event.created` overlays into `<TrendChart>` / `<TrendDrawer>` once the operator workflow has settled.
4. **(Candidate) F4.6C.2 — Latest-value Read API.** Public `GET /api/v1/telemetry/latest` over `live_readings` if tiles need a pull surface. Independent of F4.5G.1 ordering.
5. **(Candidate) F4.5H — Non-telemetry screen adapter wiring.** Per-screen migrations for Wells / Equipment / Catalog / Tags / Settings / Reports off the F3 mock adapter. Can proceed in parallel with F4.5G.1 from the existing F4.5B / F4.5C / F4.5D adapter base.

**Why F4.5G.1 is next:**

- **F4.5G-0 is closed** (`1028153`). The plan locks every decision the implementation has to make: which files to touch (only `<LiveTrendsPanelLive>` + a new `<TrendDrawer>` + the additive frontend type extensions), the range → mode policy (raw `15m`/`1h`; bucketed `6h` `1m`/avg, `24h` `5m`/avg, `7d` `15m`/avg), the realtime event subset (`live_reading.updated` only; `telemetry.reading.accepted` ignored to avoid double-counting; `alarm.event.created` deferred), the freshness-honesty contract, and the 14 acceptance criteria.
- **Every backend surface F4.5G.1 needs is live**: F4.6F.1 trend reads (raw + bucketed), F4.6E.1 realtime push, F4.6C.1 projection populating events, F4.5E adapter seam already in place.
- **DX-3 (Definition of Done) remains in force.** F4.5G.1 follows the codified plan-first → implementation pattern (F4.2A → F4.2B, F4.6A.0 → F4.6A.1, F4.6B-0 → F4.6B.1, F4.6C-0 → F4.6C.1, F4.6D-0 → F4.6D.1, F4.6E-0 → F4.6E.1, F4.6F-0 → F4.6F.1).
- **Sequencing F4.5G.1 before candidate F4.5G.2 / F4.5G.3 / F4.6C.2 / F4.5H** lets real chart-consumption needs drive the priority of the candidate follow-ups (tile migration, alarm annotations, latest-value API, non-telemetry screens). Treating "wire the chart" as the canary keeps each subsequent screen migration honest about what backend surfaces it actually needs.

Candidate follow-ups not in the main sequence (named so they have a place to land):

- **Candidate F4.6C.2 — Latest-value read API.** Public `GET /api/v1/telemetry/latest` (or equivalent) over the now-populated `live_readings`. Shape decided when a screen migration requires it.
- **Candidate F4.6D.2 — Alarm Events Read API.** Public read surface over `alarm_events` once F4.6D.1 has populated it. Sized to the first frontend consumer.
- **Candidate F4.6D.3 — Alarm Lifecycle.** `active → acknowledged → cleared` transitions, dedup against open events, `audit_logs` writes per ADR-005.
- **Candidate F4.6D.4 — Stateful Threshold Semantics.** Deadband / debounce (`delay_seconds`) / rate-of-change enforcement; populates the reserved `alarm_thresholds` table.

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
| Alarm evaluation must not be implemented in the browser. | ADR-005 invariant preserved by ADR-008 §3 decision 10. F4.6D.1 (`d35a2b8`) implements the backend evaluator. Frontend F2 evaluator continues to consume persisted `alarm_events` once a read API (candidate F4.6D.2) lands. |
| Duplicate `active` alarm events from repeated triggers while lifecycle is deferred. | F4.6D.1 (`d35a2b8`) implements the no-duplicate-active guard recommended by F4.6D-0 §13: `findFirst` on `(unit_id, canonical_tag_id, alarm_rule_id, state='active')` before each create; existing row → `skipped_duplicate_active`. Acknowledged limitation: while no lifecycle transitions exist, an `active` event can never be reopened — that becomes possible only when F4.6D.3 (alarm lifecycle) ships acknowledge / clear. |
| Stateful alarm semantics (`deadband`, `delay_seconds`, rate-of-change) silently not enforced. | F4.6D.1 reads `deadband` and `delay_seconds` into the `rule_snapshot` JSONB so the audit trail records what was configured, but does **not** apply hysteresis or debounce. Documented in F4.6D.1 closeout §6.7 and §9. Enforcement is owned by candidate sub-phase F4.6D.4. Operators must not assume hysteresis is active. |
| WebSocket fan-out must remain downstream of persistence, not source of truth. | ADR-008 §3 decision 11. F4.6E.1 (`51dc626`) implements emit-after-commit via `RealtimeEmitterService` — invoked on the line after `prisma.$transaction` resolves, never inside the callback; nothing emitted on rollback / duplicate / conflict / rejected paths (asserted by ingestion-spec tests #45–#51). Recovery on disconnect remains REST reconnect against `telemetry_readings` / `live_readings` / `alarm_events`; no replay buffer, no last-event-id, no durable outbox introduced. SSE, multi-replica adapter, auth, throttle / coalesce, and frontend per-screen consumption all remain deferred (see §6). |
| Jobs terminology creeping into the boundary before Jobs is designed. | `closed_job` excluded from the F4.6A.1 CHECK enum. `inactive_context` is the neutral forward-looking placeholder. F4.6B.1 test #20 asserts `jobId = null` on canonical inserts. A future ADR (candidate ADR-012) will introduce the operational-context model. |
| ADR-008 transitioning to `Accepted` prematurely. | Phase Control Rule §8.10: F4.6B.1, F4.6C.1, F4.6D.1, F4.6E.1, and now F4.6F.1 (`946a023`) have all exercised ADR-008's canonical-write / projection-upsert / alarm-write / realtime-fan-out / canonical-read contract in code, but ADR-008 should remain `Proposed` until a live-DB integration suite verifies dedup / projection / conflict / alarm / `date_bin` aggregation semantics end-to-end (currently exercised only via mocked Prisma / mocked Socket.IO in 195 unit tests). |
| Mocked-Prisma test posture leaves real-DB integration semantics unverified. | Every F4.6 sub-phase (F4.6B.1 / F4.6C.1 / F4.6D.1 / F4.6E.1 / F4.6F.1) uses mocked Prisma (same posture as the project's established `trends.service.spec.ts` pattern). The F4.6A.1 partial unique indexes, the projection's race-safety retry, the alarm active-board partial index, the realtime emit transport, and the F4.6F.1 bucketed-mode SQL composition (`date_bin` + `generate_series` LEFT JOIN + `array_agg` for `first` / `last`) are not exercised against a real Postgres yet. A live-DB integration suite is a candidate cross-phase deliverable (not yet assigned to a phase). Until it exists, treat the mocked test count as a contract check, not a behavioral guarantee. |
| Raw-mode trend-API contract drift breaks the F4.5E frontend adapter. | F4.6F.1 preserves the raw-mode response shape byte-identical; existing 5 raw-mode service tests stay green unchanged + new carry-forward assertions confirm raw-mode responses carry no bucketed-mode metadata. Any future change to the trend API must keep the additive-only invariant: raw mode is the F4.4F contract, bucketed-mode additions are all optional strict-superset fields. Asserted at PR-review time. |
| Frontend Operations chart mock drift vs. live backend reads. | The Operations chart still renders from the F2 simulator + F3 mock today. F4.5G-0 (`1028153`) has now scoped the cutover; F4.5G.1 owns the implementation. Until F4.5G.1 ships, the Operations chart remains illustrative — not authoritative — when validating backend behavior. F4.5G.1 mandates that the freshness indicator names the active source (mock / rest / rest+realtime) so mock data is never silently presented as live (F4.5G-0 §11). Reviewer rejects any "looks right on the chart" claim about backend correctness until F4.5G.1 lands. |
| Expanded trend view diverges from the mini chart as a separate inconsistent data path. | F4.5G-0 §4 / §16 binds both surfaces to the same `useOperationsTrendSeries` hook (different `window` parameter only); the shared TanStack Query cache means overlapping windows share data, and the same range → mode policy applies in both. F4.5G.1 acceptance criteria explicitly forbid a separate adapter for the drawer. |
| Frontend silently falls back to mock / simulator in production despite the operator believing they're seeing live backend data. | F4.5G-0 §11 forbids it. `NEXT_PUBLIC_RVF_DATA_SOURCE=api` is required at build time for production; if missing, the build is misconfigured and caught at deploy. The freshness indicator surfaces the active source on every screen that consumes it (starting with `<TrendDrawer>` in F4.5G.1). ADR-005 "never lie about freshness" is the binding contract. |

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

*Master Roadmap, last refreshed at HEAD `1028153` (F4.5G-0 — Operations Chart Adapter + Expanded Trend View Plan). Previous refresh anchors: `946a023` (F4.6F.1), `db86735` (F4.6F-0), `51dc626` (F4.6E.1), `22fa2ca` (F4.6E-0), `d35a2b8` (F4.6D.1), `901cd22` (F4.6D-0), `04dadc4` (DX-4). Originally authored at HEAD `1495457` (F4.6B.1). Update on every phase close.*
