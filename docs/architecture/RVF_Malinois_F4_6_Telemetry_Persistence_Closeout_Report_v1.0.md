# RVF Malinois F4.6 — Telemetry Persistence Architecture Closeout Report v1.0

> Phase **F4.6 — Telemetry Persistence / Ingestion Architecture** (closeout, documentation-only).
> Closes the architecture-first / ADR-first work that gates the future F4.6A → F4.6F implementation track.
>
> Upstream references:
> - F4 architecture: `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md` (commit `f36923a`)
> - ADR-007 (database foundation): `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md` (commit `8147399`)
> - F4.5 UI/API wiring closeout: `docs/architecture/RVF_Malinois_F4_5_UI_API_Wiring_Foundation_Closeout_Report.md` (commit `c1d24cc`)
> - F4.5F first screen migration: `docs/architecture/RVF_Malinois_F4_5F_First_Screen_Migration_Units_Report.md` (commit `9e861ce`)
> - F4.6 architecture: `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Architecture.md` (commit `c12a29c`)
> - ADR-008: `docs/adr/ADR-008_RVF_Malinois_Telemetry_Persistence_Ingestion.md` (commit `c12a29c`)

## 1. Executive Summary

F4.6 completed the **architecture-first / ADR-first** definition of telemetry persistence for RVF Malinois. No runtime code, schema, migration, seed, service, controller, route, channel, or integration was created or modified during F4.6. The phase shipped exactly two documentation artifacts: a long-form architecture document and a registered architectural decision record.

Together those two artifacts fix the rules under which any later implementation sub-phase must operate:

- The **ingestion boundary** (single backend boundary owned by RVF; external tools feed drafts; no direct writes to canonical tables).
- The **historical telemetry persistence** model (`telemetry_readings` is immutable canonical history; corrections do not edit history).
- The **live-readings projection** as a derived, rebuildable view of current values (`LiveReading` is not the canonical record).
- The **idempotency / deduplication** principles (sequence-based key when present; timestamp-based fallback; conflicts go to quarantine, never silent overwrite).
- The **quality vocabulary** (`good | uncertain | bad`) and how each quality propagates (only `good` updates the projection and drives alarms by default).
- The **quarantine concept** for late / unknown / invalid / disabled-mapping / conflicting drafts, captured separately so canonical history stays clean.
- The **alarm-evaluation boundary** (backend-owned, conceptually inside the ingestion transactional unit, evaluating against the in-force commissioning snapshot when one applies and otherwise against current `alarm_rules`; the browser never evaluates).
- The **API / WebSocket downstream fan-out boundary** (WebSocket is fan-out, not source of truth; clients recover from REST + reconnect; ingestion is never accepted over the WebSocket).
- The **transmitter-first** principle (every accepted reading anchors to a configured `Sensor` / `TransmitterDevice` on a `MeasurementUnit`).

The companion ADR-008 records these as **Proposed** principles, not Accepted decisions — that transition happens only after at least one implementation sub-phase has validated them.

## 2. Commit Reference

- **Commit:** `c12a29c`
- **Commit message:** `Add F4.6 telemetry persistence architecture ADR`
- **Branch:** `main`
- **Files in commit:** 2 (both documentation; see §3).

## 3. Files Delivered

| Path | Type | Purpose |
|---|---|---|
| `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Architecture.md` | Architecture document | 20-section long-form architecture: ingestion boundary, persistence model, mapping seam, dedup strategy, quarantine policy, quality normalization, live projection, alarm boundary, WebSocket fan-out, API surface roadmap, security stance, schema-impact assessment, F4.6A → F4.6F roadmap, risks, acceptance criteria, out-of-scope list. |
| `docs/adr/ADR-008_RVF_Malinois_Telemetry_Persistence_Ingestion.md` | ADR | Status `Proposed`. Records 14 proposed boundary principles, positive / negative consequences, six explicitly rejected alternatives (ThingsBoard-as-SoR, browser-ingest, latest-only, raw-payload-direct, in-memory-only, WebSocket-as-SoR), proposed implementation sequencing, and links to related ADRs. |

This closeout report (this file) is **not** part of the F4.6 commit `c12a29c`; it is the documentation artifact that records the phase's closure.

## 4. Scope Completed

F4.6 formally defined and documented the following:

- **RVF Malinois as the canonical system of record for telemetry.** The persistence-layer corollary of ADR-006 / ADR-007 is now recorded at the telemetry-write layer: the schema, the constraints, the append-only semantics, and the acceptance rules for `telemetry_readings` are owned and enforced by RVF Malinois.
- **PostgreSQL as the baseline canonical database.** F4.6 does not require TimescaleDB. The schema, indexes, and access patterns remain valid on a plain PostgreSQL deployment.
- **TimescaleDB as optional future optimization only.** Consistent with ADR-007 §4, TimescaleDB (and equivalent time-series extensions) may be evaluated later for `telemetry_readings` scaling; F4.6 does not adopt or depend on it.
- **Transmitter-first telemetry ownership.** Every accepted reading anchors to a configured `Sensor` and (through it) to the currently installed `TransmitterDevice` on a `MeasurementUnit`. Telemetry is never keyed only by browser-display labels or ad-hoc external tag strings.
- **Normalized telemetry ingestion boundary.** A single controlled backend ingestion module is the only accepted write path into `telemetry_readings`. External tools (ThingsBoard, Node-RED, MQTT, OPC-UA, Modbus, edge gateways, PLCs, historians) feed drafts; the boundary decides what becomes canonical.
- **Historical telemetry persistence vs live-reading projection.** `telemetry_readings` is the immutable canonical history; `LiveReading` is a derived projection (today a SQL `VIEW`, recommended to become an upsert-maintained table in F4.6A / F4.6C). Loss of the projection is recoverable; loss of `telemetry_readings` is not.
- **Idempotency and deduplication principles.** Sequence-based key preferred when present; timestamp-based key as fallback; conflicts (same key, different value) are quarantined, never silently overwritten. Partial unique indexes proposed for F4.6A enforce the discipline at the DB layer.
- **Quality handling and quarantine concepts.** The CHECK-aligned vocabulary `good | uncertain | bad` is canonical; only `good` updates the live projection and drives alarms by default. Invalid / late / unknown / disabled-mapping / conflicting drafts go to a dedicated quarantine surface (candidate name: `telemetry_ingestion_errors`) so canonical history remains clean.
- **Alarm evaluation boundary.** Alarm evaluation is backend-owned, conceptually inside the same transactional unit as the canonical insert and the projection upsert, only fires on `good` readings, and reads thresholds from `CommissioningSnapshot.effective_thresholds` when an in-force snapshot applies to the unit (preserving the ADR-005 invariant) and from the current `alarm_rules` otherwise. The mechanism that decides whether a snapshot is in force is deferred to F4.6D; F4.6 does not introduce a Jobs flow.
- **API / WebSocket downstream fan-out boundary.** Real-time events are emitted only after the canonical insert + projection upsert + alarm evaluation commit. The database is the source of truth; lost WebSocket events are recoverable by client reconnect plus REST reads of the candidate latest-value and active-alarm endpoints. Clients cannot ingest telemetry over the WebSocket.
- **UI implications for Units, Operations, and Settings.** Units live tiles and Operations charts will eventually read from the canonical store via the F4.5 adapter layer, replacing the current F2 simulator / F3 mock / F4.5E synthetic-trace paths once F4.6C and F4.6E deliver. Settings continues to define platform defaults only — never per-unit operating limits or alarm thresholds (F4 §E preserved).
- **Explicitly deferred implementation items.** Jobs / operational-context wiring, hardware integration, production authentication, retention / archival, TimescaleDB conversion, frontend redesigns, replay / correction tooling, and the ADR-008 transition to `Accepted` are all explicitly deferred.

## 5. ADR-008 Status

- **Status:** `Proposed`.
- **Why it remains Proposed:** F4.6 is documentation-first. No migration has been authored, no service has been built, no controller has been mounted, no WebSocket channel has been added, no alarm evaluator runs, no integration adapter exists, no row has yet been written to `telemetry_readings`, and no schema modification has landed. An ADR that records principles which have never been exercised against running code is, by definition, not yet validated. Marking it `Accepted` prematurely would attribute confidence the implementation has not yet earned.
- **When it may transition to Accepted:** ADR-008 may be moved to `Accepted` only after the implementation sub-phases (F4.6A → F4.6F, or at minimum F4.6A + F4.6B) have shipped against its principles and the resulting code, migration, and tests confirm that the principles are practical, correct, and complete. The transition itself is a separate commit on a later phase boundary — not an F4.6 deliverable.

## 6. Explicit Non-Implementation Confirmation

F4.6 explicitly did **not**:

- Modify backend runtime code (no file under `apps/backend/src/` was touched in commit `c12a29c`).
- Modify frontend runtime code (no file under `apps/web/` was touched).
- Modify the Prisma schema (`apps/backend/prisma/schema.prisma` is untouched).
- Add or alter any migration (`apps/backend/prisma/migrations/` is untouched).
- Modify or extend the F4.3 seed (`apps/backend/prisma/seed.f4.ts` is untouched).
- Modify any package, lockfile, or workspace config (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`).
- Modify any test, lint, build, or CI config (`vitest.config.ts`, `eslint.config.mjs`, `.github/`, none of these were touched).
- Modify `docker-compose.yml` or any infrastructure descriptor.
- Add a telemetry ingestion service, ingestion module, ingestion controller, or ingestion endpoint.
- Add any API route (no new file under `apps/backend/src/`).
- Add any WebSocket or SSE fan-out (the existing `RealtimeModule` Socket.IO scaffolding is unchanged and still routes no telemetry).
- Add any MQTT, Modbus, OPC-UA, PLC, ThingsBoard, Node-RED, edge-gateway, historian, or other external bridge integration.
- Add any alarm rule engine, alarm evaluator, or alarm-event write path.
- Add a Jobs model, a Jobs UI tab, a Jobs flow, an active-job state machine, or any Jobs-bound persistence / alarm logic.
- Write a single row to `telemetry_readings`, `live_readings_projection`, `alarm_events`, `audit_logs`, or any other canonical table.

The commit `c12a29c` consists of exactly two new files under `docs/` and zero changes elsewhere.

## 7. Architecture Decisions Preserved

The following decisions, recorded in F4.6 and ADR-008, are the load-bearing principles that any later implementation must respect:

- **RVF owns telemetry end to end.** `telemetry_readings`, the live projection, the alarm boundary, the API surface, and the operational data model are owned by RVF Malinois — not by ThingsBoard, Node-RED, an MQTT broker, an OPC-UA / Modbus bridge, an edge gateway, a historian, a PLC, or any future third-party platform.
- **External platforms are adapters / bridges, not the source of truth.** External tools may participate as upstream sources behind the canonical ingestion boundary. They never write directly to canonical tables and never own business state, business logic, or schema authority.
- **Browser / UI never writes canonical telemetry directly.** No ingestion endpoint is exposed to the frontend; no controller accepts telemetry writes from a browser caller context. The boundary is structural, not advisory.
- **Historical telemetry is canonical.** `telemetry_readings` is append-only and immutable. Updates and deletes are not normal operational flow. Corrections, when needed, do not edit history.
- **LiveReading is derived and recoverable.** The live projection serves current-value lookups for dashboards; it is rebuildable from `telemetry_readings` via a deterministic query. Loss of the projection is recoverable; loss of `telemetry_readings` is not.
- **Telemetry should resolve to configured physical instruments / transmitters.** Every accepted reading anchors to a configured `Sensor` (and through it to the currently installed `TransmitterDevice`) on a `MeasurementUnit`. The mapping seam (`IntegrationSource` + `IntegrationMapping`) is the only place external identifiers translate to canonical `(tenant, unit, sensor, canonical_tag)` triples.
- **Bad / unmapped / invalid telemetry must not silently pollute canonical readings.** Drafts that fail validation, mapping resolution, quality normalization, or dedup conflict checks go to a dedicated quarantine surface so they remain traceable without entering `telemetry_readings`. Silent drop is not an outcome.

## 8. Deferred Work

The following are explicitly deferred. Each is a candidate for a later phase opening with its own plan or report; none of them is implemented or scheduled by F4.6 itself.

- **F4.6A schema hardening migration proposal.** A plan / proposal sub-phase that decides which of the F4.6 schema candidates (partial unique indexes for dedup, quarantine table, live-readings projection table, view supersession, optional triggers) land in F4.6A, in what form, with what names, with what predicates. F4.6A is documentation / plan first, migration second.
- **Telemetry reading deduplication constraints.** Concrete partial unique index names, column lists, and predicates for the sequence-based and timestamp-based dedup keys.
- **Quarantine / error persistence model.** Concrete table name (candidate: `telemetry_ingestion_errors`), columns, CHECK list of reasons, retention defaults, indexes, and the operator-facing read surface.
- **LiveReading projection implementation decision.** Final choice among (a) keep the F4.1 `VIEW`, (b) introduce a materialized view, (c) introduce an upsert-maintained table, (d) introduce an application cache. The F4.6 recommendation is (c); F4.6A / F4.6C is the deciding sub-phase.
- **Ingestion service interface.** The concrete module path, class / service name, batch-method signature, validation library, and outcome-reporting shape.
- **Normalized sample validator.** The boundary-side validation rules (schema validation, value parsing, timestamp window, quality normalization, unit conversion via the retained `UnitConverter`, mapping resolution, dedup pre-check).
- **Live-reading updater.** The transactional upsert against the live projection (gated by `new.timestamp > stored.timestamp` and `new.quality = 'good'`), inside the same transactional unit as the canonical insert.
- **Historical telemetry query API.** Extensions to the existing F4.4F `GET /telemetry/trends` if needed (bucketing, downsampling, multi-tag reads, multi-unit reads). F4.6 does not require any extension; trends is sufficient for point-level reads as it stands.
- **Operations trend API.** Per-screen migration of the Operations charts off the F2 simulator and onto the canonical trends endpoint once F4.6B has populated `telemetry_readings`. F4.6 does not modify any screen.
- **Units current-value API refinement.** The candidate `GET /api/v1/telemetry/latest` endpoint that the Units live tiles and SeparatorDiagram value chips will eventually consume; F4.6C delivers.
- **Alarm evaluation implementation.** The evaluator inside the ingestion transactional unit, the `alarm_events` write path, and the operator surfaces for active / historical / acknowledge.
- **WebSocket / SSE fan-out implementation.** The per-tenant / per-unit channel topology, the sanitized payload shapes, the throttle / coalesce policy, and the frontend client foundation.
- **External adapter strategy.** Per-integration-kind bridge design (MQTT, Node-RED, ThingsBoard, OPC-UA, Modbus, PLC, edge gateway, historian). Each bridge resolves an `IntegrationSource` row and feeds drafts into the ingestion boundary; concrete library choices and deployment shape are per-bridge decisions and likely warrant their own ADRs.
- **Production authentication for ingestion.** A successor ADR (candidate: ADR-009) designs API keys per `IntegrationSource`, optional HMAC, rate limiting, and audit-log coverage. F4.6 ships only the env-flag-based interim guard.
- **Retention, archival, and possible TimescaleDB conversion.** A successor ADR (candidate: ADR-010) designs the path when real volume requires it. PostgreSQL remains the baseline.
- **Historical correction workflow.** A successor ADR (candidate: ADR-011) designs the corrections table and the operator surface, triggered by the first real correction request.
- **Operational-context / Jobs wiring.** A successor ADR (candidate: ADR-012) designs the active-context lookup that alarm evaluation needs. F4.6 records Jobs and `CommissioningSnapshot` as schema entities but introduces no Jobs flow.

## 9. Recommended Next Phase

**Recommend F4.6A — Schema Hardening Migration Plan**, with the strong qualification that **F4.6A should start with a plan / proposal first, not immediate migration execution**.

Why a plan first:

- F4.6 lists schema candidates (C1 – C7 in the architecture document §16) but explicitly leaves names, predicates, columns, and inclusion choices to F4.6A. Those choices benefit from a written plan that reviewers can argue against before any DDL is authored.
- The dedup index design (Form A vs Form B, sensor-grain vs unit-grain) has trade-offs that are easier to discuss against a written analysis than against a migration file.
- The live-readings projection table's key (`(unit_id, sensor_id, canonical_tag_id)` vs `(unit_id, canonical_tag_id)`) and its relationship to the existing `live_readings_projection` view (drop, rename to fallback, or keep as cache layer) deserves the same written treatment.
- The quarantine table's CHECK list of reasons reflects every quarantine outcome documented in F4.6 §9.2 — the plan is where reviewers confirm the list is complete and well-named.
- Optional trigger-based append-only enforcement (C7) is the kind of decision a plan can explicitly accept or defer; a migration that just includes them by default leaves no audit trail of the choice.

Suggested F4.6A entry points (in order):

1. **F4.6A.0 — Plan / Proposal document.** A new document under `docs/architecture/RVF_Malinois_F4_6A_Schema_Hardening_Plan.md` that selects from F4.6 §16's candidates and locks names, predicates, columns, and rollback strategy. Reviewed before any DDL exists.
2. **F4.6A.1 — Migration authoring.** A single new Prisma migration directory under `apps/backend/prisma/migrations/` carrying the F4.6A migration SQL, plus the corresponding Prisma model additions in `apps/backend/prisma/schema.prisma`. `prisma validate` / `generate` / lint / typecheck / build / test all green.
3. **F4.6A.2 — Closeout report.** A `docs/architecture/RVF_Malinois_F4_6A_Schema_Hardening_Closeout_Report.md` recording what landed, the migration commit, and the gate to F4.6B.

F4.6A does **not** add ingestion code, services, controllers, endpoints, alarms, WebSocket events, or external adapters. Those are F4.6B and beyond.

Parallel work allowed during F4.6A:

- **F4.5G+ frontend screen migrations** against existing F4.4 read endpoints (Wells, Equipment, Catalog) can land in parallel without depending on F4.6A.
- **Operations / Units chart cutover** stays on the F2 simulator / F4.5E synthetic mock until F4.6B / F4.6C ships.

## 10. Acceptance Criteria

F4.6 is considered closed when all of the following are true.

| # | Criterion | Status |
|---|---|---|
| 1 | Closeout report created at `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Closeout_Report_v1.0.md`. | **Met** (this document). |
| 2 | F4.6 architecture document exists at `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Architecture.md`. | **Met** (commit `c12a29c`). |
| 3 | ADR-008 exists at `docs/adr/ADR-008_RVF_Malinois_Telemetry_Persistence_Ingestion.md`. | **Met** (commit `c12a29c`). |
| 4 | ADR-008 status is `Proposed` (not `Accepted`). | **Met.** |
| 5 | No runtime code changed in the F4.6 commit. | **Met** (commit `c12a29c` contains only the two documentation files). |
| 6 | No migrations added in the F4.6 commit. | **Met.** |
| 7 | No Prisma schema change in the F4.6 commit. | **Met.** |
| 8 | No seed / package / config / test / CI change in the F4.6 commit. | **Met.** |
| 9 | No UI changed in the F4.6 commit. | **Met.** |
| 10 | No external integration (MQTT, Modbus, OPC-UA, ThingsBoard, Node-RED, PLC, edge, historian) added. | **Met.** |
| 11 | No Jobs flow, Jobs UI, or active-job lookup introduced. | **Met.** |
| 12 | No WebSocket / SSE fan-out implemented. | **Met.** |
| 13 | No alarm evaluator or `alarm_events` write path implemented. | **Met.** |
| 14 | No row written to any canonical table during F4.6. | **Met.** |
| 15 | RVF Malinois reaffirmed as canonical system of record for telemetry. | **Met** (§4, §7). |
| 16 | PostgreSQL reaffirmed as baseline canonical database; TimescaleDB optional only. | **Met** (§4). |
| 17 | Transmitter-first principle preserved. | **Met** (§4, §7). |
| 18 | Historical telemetry vs LiveReading projection distinction preserved. | **Met** (§4, §7). |
| 19 | Recommended next phase (F4.6A — plan first, then migration) explicitly stated. | **Met** (§9). |
| 20 | F4.6 is ready to be considered closed from a documentation / architecture standpoint. | **Met.** |

---

*F4.6 closeout. The architecture and ADR are in `main`; the closeout report (this file) records the phase's closure but is not yet committed. Next phase on the implementation track: F4.6A, starting with a written plan / proposal — not immediate migration execution.*
