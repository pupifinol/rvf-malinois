# ADR-008 — RVF Malinois Telemetry Persistence and Ingestion Boundary

> Architecture Decision Record — RVF Malinois project.
> Companion architecture document: `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Architecture.md`.
> This ADR records the proposed boundary principles that should govern F4.6A → F4.6F implementation work.

## 1. Status

**Proposed.**

F4.6 is documentation-first by design: no migration, no service code, no controller, no schema modification, and no runtime behavior has been implemented. The ADR therefore remains `Proposed` until the implementation phases (F4.6A → F4.6F) validate it. It is **not** appropriate to move this ADR to `Accepted` before at least one implementation sub-phase has shipped against its principles.

## 2. Context

Phases F2 (telemetry runtime under the normalized stream boundary, ADR-005), F3 (canonical backend / API foundation, ADR-006), and F4 (database foundation, ADR-007) established the platform's contract: the browser talks only to the RVF Malinois backend; the backend talks to a PostgreSQL-compatible database that RVF owns; the database holds the canonical operational data model documented in `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md`. F4.1 implemented the SQL schema (commit `a475066`). F4.2B replaced the F1 Prisma schema and migrations with an F4-aligned baseline (commit `e37f7b5`). F4.3 seeded reference data (commit `91e17aa`). F4.4 reactivated the six F1 feature modules against the F4 Prisma client one at a time (commits `2f5c108` → `5e92a13`), producing a read-only API surface that includes `GET /api/v1/telemetry/trends`. F4.5 built the frontend's F4 API client and adapter layer (commits `20d45ec` → `c1d24cc`) and F4.5F migrated the first screen's data source (commit `9e861ce`).

The arc of F4 has reached the point where every read path exists, the schema is in place, and a deterministic seed populates every entity except telemetry. **What does not yet exist is any path for telemetry to enter the canonical record.** `telemetry_readings` is provisioned and indexed; `live_readings_projection` is defined as a view; `alarm_events` is provisioned; `integration_sources` and `integration_mappings` exist as placeholders — but no service writes any of them, no scheduled job runs, no MQTT / OPC-UA / Modbus client is mounted, no ingestion HTTP route is registered. The F1 ingest envelope, the F1 `IngestionAdapter` interface, the F1 `TelemetryValidator`, and the F1 `LateTelemetryQuarantine` model were all deleted in F4.4F (commit `5e92a13`) precisely because reviving them would have produced compiling-but-unused code that would have drifted as the F4.6 design evolved. The slate is intentionally clean.

Three operational facts force the principles to be recorded now, before any line of ingestion code is written:

1. **The ingestion boundary is the place where a wrong architectural choice does the most damage.** A boundary that lets external tools write directly to canonical tables inverts ADR-006 / ADR-007 and lets vendor roadmaps dictate RVF's data model. A boundary that pretends to dedup but does not enforce it produces double-counted trends and noisy alarms. A boundary that lacks a quarantine surface silently drops data an operator needed to see. Once the boundary is built, walking back any of these is expensive.

2. **External tools (ThingsBoard, Node-RED, MQTT brokers, OPC-UA bridges, Modbus / PLC gateways, edge gateways, historians) are useful at the edge but are not systems of record.** ADR-006 settled this at the platform level; ADR-007 lowered it to the database level; ADR-008 lowers it one more step, to the telemetry-write path.

3. **F4.6 spans many concerns** — ingestion service, mapping resolution, deduplication, quarantine, quality normalization, live projection, alarm evaluation, WebSocket fan-out, API surface, security posture, and possible schema additions. Each of these is reviewable on its own once the boundary principles are recorded; without recorded principles, every sub-phase relitigates the previous one.

This ADR records the proposed principles that gate F4.6A → F4.6F. The principles are firm where they describe **what** the platform owns and what the boundary refuses to do; they are deliberately loose where they describe concrete class names, file paths, method signatures, table names, index names, HTTP paths, and transaction mechanics — those are implementation choices finalized inside the sub-phase that delivers them.

## 3. Decision

The following are the proposed boundary principles that should govern F4.6A → F4.6F implementation work and any later phase that touches telemetry persistence. They are firm in spirit; the concrete migrations, services, paths, and names referenced in them are implementation candidates that the relevant sub-phase finalizes.

1. **RVF Malinois owns telemetry persistence end to end.** `telemetry_readings` is the canonical immutable historical record of every measurement the platform has accepted. The schema for that table, its constraints, its append-only semantics, and the rules under which rows are accepted into it are decided and enforced by RVF Malinois — not by ThingsBoard, not by Node-RED, not by an MQTT broker, not by an OPC-UA / Modbus bridge, not by an edge gateway, not by a historian, not by a PLC interface, not by any third-party IoT platform present or future.

2. **External systems cannot write directly to canonical tables.** Every accepted reading enters through a single controlled ingestion boundary inside the RVF Malinois backend. External tools are upstream sources of *drafts*; the boundary decides whether each draft becomes a canonical row. There is no second write path. The browser does not have one; an external IoT platform does not have one; a SQL script does not have one in production.

3. **All telemetry enters through the controlled ingestion boundary.** The boundary validates, resolves, deduplicates, evaluates, and persists. Conceptually it exposes a single batch-ingest operation, callable from controlled entry points such as an internal HTTP endpoint (candidate path: `POST /api/v1/telemetry/ingest`, internal-only, env-flag-guarded), an in-process simulator, and future bridge adapters per integration kind. The concrete module name, method signature, controller path, env flag, and Zod / runtime-validation library are F4.6B implementation decisions. Each entry point resolves to one of the ten `source` values fixed by the F4.1 CHECK constraint on `telemetry_readings.source` (mirrored on `integration_sources.kind`).

4. **Telemetry belongs to configured physical instruments.** Every accepted reading is anchored to a configured `Sensor` and, through it, to the currently installed `TransmitterDevice` on a `MeasurementUnit`. Telemetry is never keyed by free-form browser-display labels or ad-hoc external tag strings; the canonical record always resolves a real configured instrument under RVF's ownership.

5. **`TelemetryReading` is canonical history. `LiveReading` is a derived projection.** `telemetry_readings` is append-only and immutable; it is the source of truth for any historical question. A live-readings projection (logical name `LiveReading` / candidate physical name `live_readings`) provides current-value lookups for dashboard tiles. The projection is rebuildable from `telemetry_readings`; loss of the projection is recoverable, loss of `telemetry_readings` is not. The F4.1 `live_readings_projection` `VIEW` is a provisional projection mechanism; an upsert-maintained table is the F4.6 recommendation, with the final shape and timing decided by F4.6A / F4.6C.

6. **Valid accepted readings persist to `telemetry_readings`.** Rejected, conflicted, or quarantined drafts are recorded separately in a quarantine surface (candidate name: `telemetry_ingestion_errors`). Canonical history is never polluted by suspect data.

7. **`IntegrationSource` / `IntegrationMapping` define the external-to-internal mapping.** Every `external_identifier` an upstream source emits resolves to exactly one `(tenant_id, unit_id, sensor_id, canonical_tag_id)` triple via an `IntegrationMapping` row. The boundary refuses to honor `canonicalTagName` from untrusted payloads when a mapping exists. Mappings can be disabled but are not deleted; mapping changes are audited via `audit_logs`.

8. **Deduplication is deterministic.** When a monotonic `sequence` is present per channel it is the dedup key (logical form: `(integration_source_id, external_identifier, sequence)`). When absent, the dedup key is timestamp-based (logical form: `(integration_source_id, external_identifier, timestamp)`, equivalent after mapping resolution to `(unit_id, canonical_tag_id, timestamp)`). Duplicate drafts with the same value are no-ops; "duplicates" with different values are **conflicts** and are quarantined, never silently overwritten. The dedup discipline is expected to be enforced by partial unique indexes proposed for the F4.6A schema-hardening sub-phase; exact index names, columns, and predicates are F4.6A's decision.

9. **Quality is `good | uncertain | bad`.** This matches the F4.1 CHECK constraint exactly. The boundary normalizes synonyms (`suspect → uncertain`, `OK → good`, `invalid → bad`, missing → `uncertain`). Only `good` readings update the live projection. Only `good` readings drive alarm evaluation by default. `uncertain` and `bad` persist for diagnostics and audit.

10. **Alarm evaluation is backend-owned and downstream of accepted telemetry.** The evaluator runs in the same transactional unit as the canonical insert and the live projection upsert (concrete transaction mechanics finalized at implementation time). It evaluates against `CommissioningSnapshot.effective_thresholds` when an in-force commissioning snapshot applies to the unit at the reading's timestamp (preserving the ADR-005 invariant) and against the current `alarm_rules` otherwise. How the in-force snapshot is determined (operational-context lookup) is an F4.6D implementation decision; this ADR does not fix the lookup mechanism, and F4.6 does not introduce a Jobs flow. The evaluator writes `alarm_events` rows with full lifecycle (`active → acknowledged → cleared`). The browser never evaluates alarms.

11. **WebSocket is downstream fan-out, not system of record.** Emission happens after the persistence + projection + alarm transaction commits. The database is the source of truth; lost WebSocket events are recoverable by client reconnect plus REST reads against the latest-value and active-alarm endpoints (candidate paths: `GET /api/v1/telemetry/latest`, `GET /api/v1/alarms/active`). Clients cannot ingest telemetry over the WebSocket.

12. **Schema additions are expected but not finalized by this ADR.** F4.6A is the proposed migration sub-phase that would land partial unique indexes for dedup, a quarantine table, a live-readings projection table, and the supersession of the F4.1 `live_readings_projection` `VIEW`. Exact migration content, index/table/column names, and trigger-based hardening (if any) are F4.6A's decision and may be revised in light of implementation findings. F4.6A is intended to precede any code that writes to `telemetry_readings`.

13. **Security posture is interim and explicit.** Any ingestion endpoint that this ADR enables is expected to be guarded by an env flag (candidate: `RVF_INGEST_ENABLED`) and not exposed in production builds by default. When enabled in local / dev environments, it accepts requests without real authentication (matching the current ADR-007 §7 posture). A successor ADR (target: ADR-009) designs the production-grade authentication path — API keys per `IntegrationSource`, optional HMAC, rate limiting, audit-log coverage. ADR-008 does not design that ADR; it merely refuses to ship production-exposed unauthenticated ingestion.

14. **PostgreSQL remains the baseline canonical database.** F4.6 does not require TimescaleDB. TimescaleDB and equivalent time-series extensions may be evaluated later as an optimization for `telemetry_readings` (consistent with ADR-007 §4); they are not a precondition for F4.6 sub-phases and the F4.6 design must remain valid on a plain PostgreSQL deployment.

## 4. Consequences

### Positive

- **Clear ownership.** The principles unambiguously locate telemetry write authority in RVF Malinois. No "we'll figure out who writes this row later" remains.
- **Auditable ingestion.** Every accepted row carries `(integration_source_id, external_identifier)` lineage via `ingestion_id`; every non-acceptance lands in the quarantine surface. Operators can trace any row back to its source.
- **Deterministic mapping.** `IntegrationMapping` is the single answer to "which sensor on which unit does this external identifier refer to?". A misconfigured adapter cannot accidentally re-tag a sensor by changing a label.
- **Safe external integrations.** A new MQTT bridge, Node-RED flow, or ThingsBoard integration is structurally incapable of corrupting canonical data: it can only feed drafts to the boundary; the boundary decides what becomes canonical.
- **Restart-safe live state.** A projection table (when F4.6C delivers it) survives backend restarts. Cold-starting the dashboard does not require warming an in-memory cache or replaying history.
- **Reproducible alarms.** Alarm evaluation against `CommissioningSnapshot.effective_thresholds` when a commissioning snapshot is in force preserves the ADR-005 invariant; reports re-reading historical alarms always see the rule that was in force when the alarm fired.
- **Real-time without sacrificing reliability.** WebSocket fan-out gives the dashboard its sub-second freshness without making realtime delivery a correctness dependency. A client that misses an event can replay from REST.
- **Supports the eventual operations / units / alarms screens.** Operations charts, Units live tiles, and Alarms boards all become "read from the canonical store" rather than "read from a per-screen mock", finishing the cut the F4.5F migration started.
- **Composable per sub-phase.** F4.6A → F4.6F land one at a time. Each is reversible at the commit level. No single landing window has to coordinate all of ingestion + projection + alarms + WebSocket.

### Negative / trade-offs

- **More backend implementation work.** The platform has to build, test, and operate the ingestion service and its sidecars rather than delegating to ThingsBoard. ADR-006 and ADR-007 already accepted this trade-off at higher layers; ADR-008 inherits it.
- **External tools require adapters.** Every integration kind (MQTT, Node-RED, OPC-UA, Modbus, historian, PLC) needs an RVF-side adapter that resolves an `IntegrationSource` row and calls into the ingestion boundary. The adapter is small but it has to exist; ad-hoc "let the tool write directly" shortcuts are forbidden.
- **Dedup design requires schema additions.** The current F4.1 schema does not enforce the dedup key. F4.6A is proposed to add partial unique indexes; without them, an F4.6B implementation could write duplicates and must compensate at the application layer.
- **Quarantine surface grows over time.** A quarantine table accumulates rows that operators must triage. A retention default is recommended in the companion document; a future archival job may be needed.
- **Transactional projection + alarm updates couple performance.** Sharing a transactional unit between the canonical insert, the projection upsert, and (later) alarm evaluation is intentional for correctness; for very high-rate sources, F4.6D may need to relax this by moving alarm evaluation to a queued worker — but the worker still writes from the backend, never the browser.
- **Interim security posture is not production-grade.** Production deployment must wait for the successor auth ADR. F4.6 ships behind an env flag; operators must understand the flag's semantics before exposing any ingestion endpoint to a non-trusted network.
- **The F4.1 `live_readings_projection` VIEW may be superseded.** A view that is correct but slow yields to a table that is correct and fast — but consumers must learn the new shape if and when F4.6C lands. Today no consumer queries the view, so the cost is paid once.

## 5. Alternatives Considered

### Alternative A — Let ThingsBoard, Node-RED, or another IoT platform be the system of record

ThingsBoard (or Node-RED with a custom Postgres store, or AWS IoT Analytics, or any equivalent) would own the telemetry tables. RVF Malinois would either read from them or render against them, but RVF would not own the write path or the schema.

**Rejected.** Inverts ADR-006 and ADR-007 at the persistence layer. Couples canonical data shape to the vendor's roadmap. Makes per-tenant isolation, per-unit independence (HP-001 vs LP-001 envelopes), `CommissioningSnapshot`-based historical reproducibility, and audit-log coverage dependent on what the vendor exposes rather than on what RVF Malinois needs. Vendor lock-in by design. Aligns poorly with the operational reality that RVF must support multiple wells and clients with strict reproducibility requirements.

### Alternative B — Let the frontend / browser ingest telemetry

The browser would receive telemetry over a WebSocket from external tools, evaluate alarms client-side, and `POST` results to RVF.

**Rejected.** Violates ADR-005 (browser boundary), violates the F2 Final QA invariant (`thresholdsSource = 'commissioning_snapshot'` enforced at the WebSocket adapter, browser cannot evaluate against the canonical store), and exposes the canonical record to whatever runs in an operator's browser. Loss of network = loss of canonical writes. No tenant isolation enforcement at the database layer. Unacceptable.

### Alternative C — Store only latest values; do not keep a historical telemetry record

A `current_readings` table holds the latest value per `(unit, sensor)`; no `telemetry_readings` row is ever written. Trends queries either reconstruct from sparse `alarm_events` rows or are not supported.

**Rejected.** Breaks every reporting and audit promise the platform makes to its clients. Oil & gas reports require historical reconstruction of "what was this well doing at 14:32:07 last Tuesday". A "latest only" model cannot answer that. `CommissioningSnapshot` already presumes a `telemetry_readings` companion for re-evaluation. Eliminates the trend endpoint (`GET /api/v1/telemetry/trends`) that F4.4F just delivered. Treats the projection as canonical, which inverts decision 5 in §3.

### Alternative D — Write raw external payloads directly into `telemetry_readings`

The boundary skips validation, mapping resolution, and quality normalization. Whatever the adapter sends goes straight to a canonical row. Cleanup (if any) happens after the fact.

**Rejected.** Corrupts canonical history with malformed data. Makes deduplication impossible after the fact. Makes audit-log coverage of mapping changes meaningless (the row's `(unit_id, sensor_id, canonical_tag_id)` may reflect a transient adapter mistake rather than the operator's intent). Pushes every consumer (trends, live, alarms, reports, exports) to repeat the validation logic. Repeats the F1 mistake the F4.4F deletion was meant to avoid.

### Alternative E — Use only an in-memory live cache for current values; no persistent live projection

Latest values live exclusively in process memory; a backend restart loses them; the dashboard cold-starts blank until new telemetry arrives.

**Rejected.** Unacceptable for a 24/7 operations dashboard. A backend deploy or crash would blank every Units screen until the next reading. The dashboard would lie about current state for an unbounded window. A DB-backed projection (when F4.6C delivers it) gives restart safety at the same code complexity.

### Alternative F — Make WebSocket the system of record; the database is a cold archive

Real-time clients subscribe to a WebSocket; the database is only filled by a slow background job for archival. Active operations rely entirely on the WebSocket.

**Rejected.** Inverts the durability story: a WebSocket disconnect window becomes a hole in canonical history. Per-client reconnect / replay logic balloons. Trends become eventual instead of immediate. Reports cannot trust the canonical table to be up to date. The persistence-first / fan-out-second posture is strictly better.

## 6. Rationale

The selected principles (the union of decisions 1–14 in §3) are the only set consistent with:

- **ADR-006** (RVF Malinois as the primary platform / system of record).
- **ADR-007** (RVF Malinois owns the canonical database).
- **ADR-005** (browser does not own alarm evaluation; thresholds come from the commissioning snapshot when one is in force).
- **F4 architecture §F / §G / §H / §I** (telemetry storage strategy, alarm data model, audit, integration readiness — all of which presuppose a controlled ingestion boundary rather than direct external writes).
- **The product reality** that oil & gas measurement requires historical reproducibility, per-unit operational independence, audited mapping decisions, a live dashboard that survives restarts, and a deployable baseline on plain PostgreSQL.

The chosen principles deliberately cost more implementation work in exchange for a defensible, auditable, vendor-neutral architecture. That trade is consistent with every prior architectural decision in the project.

## 7. Implementation Notes

The implementation roadmap detailed in §17 of the companion architecture document is a **proposed sequencing**, not a binding contract. The schema and code names below are implementation candidates that the relevant sub-phase finalizes:

| Sub-phase | Scope (proposed) | Gate to next |
|---|---|---|
| **F4.6A — Telemetry Ingestion Foundation / schema hardening** | A Prisma migration that proposes partial unique indexes for dedup, a quarantine table (candidate name: `telemetry_ingestion_errors`), a live-readings projection table (candidate name: `live_readings`), and supersession of the F4.1 `live_readings_projection` view. New Prisma models. No service code. | `prisma validate` / `generate` / lint / typecheck / build / test green; F4.6A report landed. |
| **F4.6B — Manual / dev ingestion adapter + persistence** | An ingestion service + a candidate internal `POST` endpoint (path TBD by F4.6B, illustrative: `POST /api/v1/telemetry/ingest`) + simulator adapter + dedup + quarantine writes. Stubs the alarm and live-projection hooks for F4.6C / F4.6D. | Backend gates green; F4.6B report landed; a draft posted in local dev lands as a canonical row. |
| **F4.6C — Live readings projection** | Fills the projection upsert hook; ships a candidate `GET /api/v1/telemetry/latest` endpoint; supersedes the F4.1 `live_readings_projection` view if F4.6A kept it as a fallback. | Backend gates green; F4.6C report landed; live projection updates inside the same transactional unit as the canonical insert. |
| **F4.6D — Alarm evaluation / alarm events** | Alarm evaluator inside the ingestion transactional unit; candidate `GET /alarms/{events,active}`, `POST /alarms/events/:id/acknowledge`. Resolves the in-force commissioning snapshot for the unit at the reading's timestamp (mechanism TBD by F4.6D). | Backend gates green; F4.6D report landed; a threshold-crossing reading materializes one `alarm_events` row. |
| **F4.6E — Realtime fan-out / WebSocket updates** | Per-tenant / per-unit Socket.IO channels in `RealtimeModule`; emits sanitized `telemetry.reading` and `alarm.event.*` events after the transactional unit commits. | Backend gates green; F4.6E report landed; clients observe events. |
| **F4.6F — Closeout** | Consolidated closeout report. No code. | Documentation only. |

Parallelism (proposed): F4.6A is strictly first. F4.6B and F4.6D may overlap once F4.6A is merged. F4.6C and F4.6E sit downstream of F4.6B and F4.6D respectively.

Recommended (not binding) corollaries to ADR-008 that may produce later ADRs:

- **ADR-009 (candidate)** — Production authentication and integration-source API keys for the ingestion endpoint. Designs the path from the F4.6 env-flag posture to a production-grade authenticated boundary.
- **ADR-010 (candidate)** — Retention, archival, and possible TimescaleDB conversion of `telemetry_readings`. Triggered by real volume; not a precondition for F4.6 sub-phases. PostgreSQL remains the baseline.
- **ADR-011 (candidate)** — Historical correction workflow for canonical telemetry. Triggered by the first real correction request; F4.6 documents the seam but does not design the table.
- **ADR-012 (candidate)** — Operational-context / Jobs wiring. Jobs and `CommissioningSnapshot` exist in the F4 schema but are not active in F4.6; a later ADR will design the active-context lookup that alarm evaluation needs.

## 8. Related Documents

- **F4 — Database Foundation Architecture.** `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md` (commit `f36923a`). Establishes the canonical operational data model that ADR-008 protects.
- **ADR-007 — RVF Malinois Database Foundation.** `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md` (commit `8147399`). The persistence-layer ownership decision. ADR-008 is its telemetry-layer corollary.
- **F4.1 — PostgreSQL Schema.** `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql` (commit `a475066`) and `docs/architecture/RVF_Malinois_F4_1_Schema_Implementation_Report.md`. Defines the actual `telemetry_readings`, `alarm_events`, `live_readings_projection`, `integration_sources`, and `integration_mappings` columns and constraints that ADR-008 rides on.
- **F4.2B — Prisma Baseline.** `docs/architecture/RVF_Malinois_F4_2B_Prisma_Baseline_Migration_Report.md` (commit `e37f7b5`). Establishes the Prisma models any future F4.6A migration would extend.
- **F4.3 — Seed.** `docs/architecture/RVF_Malinois_F4_3_Seed_Reference_Data_Report.md` (commit `91e17aa`). Defines the deterministic reference data the F4.6B / F4.6D sub-phases will write telemetry against.
- **F4.4 — API Reactivation Closeout.** `docs/architecture/RVF_Malinois_F4_4_API_Reactivation_Closeout_Report.md` (commit `e6b40b6`). Documents the read-only API surface that ADR-008 leaves intact and extends.
- **F4.4F — Telemetry Trends API.** `docs/architecture/RVF_Malinois_F4_4F_Telemetry_API_Reactivation_Report.md` (commit `5e92a13`). Documents the deletion of the F1 ingestion contracts that cleared the slate for ADR-008. Also delivers `GET /api/v1/telemetry/trends`, the read endpoint ADR-008's writes will eventually feed.
- **F4.5 — UI / API Wiring Closeout.** `docs/architecture/RVF_Malinois_F4_5_UI_API_Wiring_Foundation_Closeout_Report.md` (commit `c1d24cc`). Defines the frontend adapter layer that will consume the F4.6C / F4.6D / F4.6E surfaces.
- **F4.5E — Telemetry Trends Adapter.** `docs/architecture/RVF_Malinois_F4_5E_Telemetry_Trends_API_Wiring_Report.md` (commit `6af42fa`). Documents the synthetic deterministic mock that the frontend currently uses while ADR-008's writes are not yet shipping rows.
- **F4.6 — Telemetry Persistence / Ingestion Architecture.** `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Architecture.md` (this commit). Companion architecture document; ADR-008 is its proposed companion decision.
- **ADR-005.** Browser boundary; thresholds from commissioning snapshot. ADR-008's alarm-evaluation principle preserves this invariant on the persistence side.
- **ADR-006.** RVF Malinois as primary platform. ADR-008 is the telemetry-write corollary.
- **ADR-003.** Sensor-to-canonical-tag mapping configurable by operation. ADR-008's `IntegrationMapping` resolution honors this.
- **ADR-004.** Reusable equipment catalog. ADR-008's per-unit independence principle (HP-001 vs LP-001) inherits this.
