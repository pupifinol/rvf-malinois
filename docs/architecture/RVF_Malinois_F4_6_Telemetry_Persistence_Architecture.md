# RVF Malinois — F4.6 Telemetry Persistence / Ingestion Architecture

> Phase **F4.6 — Telemetry Persistence / Ingestion Architecture**.
> Architecture-only deliverable. **No code, no backend, no frontend, no Prisma schema, no migration, no seed, no package change.** This document fixes the rules under which any F4.6A → F4.6F implementation must operate. The companion decision is recorded in `docs/adr/ADR-008_RVF_Malinois_Telemetry_Persistence_Ingestion.md`.
>
> Upstream references:
> - F4 architecture: `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md` (commit `f36923a`)
> - ADR-007 (database foundation): `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md` (commit `8147399`)
> - F4.1 PostgreSQL schema: `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql` (commit `a475066`)
> - F4.2B Prisma baseline: `docs/architecture/RVF_Malinois_F4_2B_Prisma_Baseline_Migration_Report.md` (commit `e37f7b5`)
> - F4.3 seed: `docs/architecture/RVF_Malinois_F4_3_Seed_Reference_Data_Report.md` (commit `91e17aa`)
> - F4.4 closeout: `docs/architecture/RVF_Malinois_F4_4_API_Reactivation_Closeout_Report.md` (commit `e6b40b6`)
> - F4.4F telemetry trends API: `docs/architecture/RVF_Malinois_F4_4F_Telemetry_API_Reactivation_Report.md` (commit `5e92a13`)
> - F4.5 UI/API wiring closeout: `docs/architecture/RVF_Malinois_F4_5_UI_API_Wiring_Foundation_Closeout_Report.md` (commit `c1d24cc`)
> - F4.5E telemetry trends adapter: `docs/architecture/RVF_Malinois_F4_5E_Telemetry_Trends_API_Wiring_Report.md` (commit `6af42fa`)

## 1. Executive Summary

F4.6 is the architectural decision phase that closes the largest remaining gap in the F4 arc: the platform reads canonical reference data (F4.4) and is wired to consume it from the UI (F4.5), but it has no path for real telemetry to enter the system of record. `telemetry_readings` is provisioned, indexed, and exposed through `GET /api/v1/telemetry/trends`, yet there is no `INSERT` path; the F1 `POST /telemetry` placeholder and the F1 ingestion-adapter contracts were deleted in F4.4F so the F4.6 design could start from a clean slate against the F4 schema. The `live_readings_projection` `VIEW` exists but no row in `telemetry_readings` has ever been written by production code. `alarm_events` is provisioned but no evaluator runs. The `RealtimeModule` Socket.IO scaffolding is mounted but routes no telemetry. The frontend renders against the F3 mock adapter (live) and a synthetic deterministic F4.5E mock trace (foundation-only).

This document formalizes the ingestion boundary, the persistence model, the mapping seam, the deduplication rule, the late-arrival / quarantine policy, the quality model, the live-readings projection, the alarm-evaluation boundary, the WebSocket fan-out boundary, the eventual API surface roadmap, the security assumptions, the schema-impact assessment, and the F4.6A → F4.6F implementation roadmap. **It decides; it does not implement.** Every concrete code change — including the schema additions called out in §16 — happens in a later sub-phase that opens with its own report and is subject to the F4 QA discipline.

The single binding principle F4.6 records is the persistence-layer corollary of ADR-006 and ADR-007: **RVF Malinois owns telemetry persistence end to end**. External tools (ThingsBoard, Node-RED, MQTT brokers, OPC-UA bridges, Modbus gateways, edge gateways, historians, PLC interfaces) participate exclusively as auxiliary upstream sources behind the canonical ingestion boundary. They never write directly to canonical tables. They never own business state. They never evaluate alarms. They never broadcast the live projection. PostgreSQL remains the baseline canonical database (TimescaleDB and equivalent extensions stay strictly optional, per ADR-007 §4). This principle is proposed in ADR-008 (status: **Proposed** — F4.6 is documentation-first; the ADR is validated when implementation sub-phases ship).

## 2. Current State Before F4.6

The platform reaches this phase with the following concrete state. Anchored against the repo at HEAD; each fact is verifiable by file inspection.

| Layer | State |
|---|---|
| Canonical SQL schema | `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql` (commit `a475066`). Tables: 20. View: `live_readings_projection`. |
| Prisma schema | `apps/backend/prisma/schema.prisma` (commit `e37f7b5`). 20 models matching the F4.1 SQL; `pgcrypto` extension; no enums; CHECK constraints live in migration SQL. |
| Baseline migration | `apps/backend/prisma/migrations/20260524000000_f4_2_baseline/migration.sql`. F1/F1.5 migrations archived under `migrations.f1-archive/`. |
| Seed | `apps/backend/prisma/seed.f4.ts` (commit `91e17aa`). 1 tenant, 2 users, 2 equipment types, 22 canonical tags, 2 measurement units (HP-001, LP-001), 14 sensors + 14 transmitters, 14 active bindings, 2 current unit configurations + envelopes, 28 alarm rules, 1 well + job + commissioning snapshot, 1 inactive integration source + 1 disabled mapping, 1 audit row. **No `telemetry_readings` rows. No `alarm_events` rows.** |
| Backend read APIs (F4.4) | `GET /api/v1/{tenants,wells,tags,equipment/{types,units},jobs,telemetry/trends}` — six modules, all active on the F4 Prisma client. 69/69 backend tests pass against mocked Prisma. |
| Backend write APIs | **None for telemetry.** F1 `POST /telemetry` deleted in F4.4F. No `POST /telemetry/ingest`. No scheduled writer. No external adapter process. |
| `live_readings_projection` | Defined as a `VIEW` over `telemetry_readings` using `DISTINCT ON (unit_id, sensor_id)`. **Has zero rows because the underlying table is empty.** No consumer queries it today. |
| `alarm_events` | Provisioned with full lifecycle columns (`state`, `first_triggered_at`, `acknowledged_at/by`, `cleared_at`, `rule_snapshot`). **No evaluator runs. No row has ever been written by production code.** |
| `integration_sources` / `integration_mappings` | Provisioned. F4.3 seeds one inactive source + one disabled mapping for shape verification. No active integration. |
| Frontend F4 API client | `apps/web/lib/api/f4/` (F4.5A). 13 typed wrappers. Includes `getTelemetryTrends(params)`. |
| Frontend F4 adapter layer | `apps/web/lib/api-data/f4/` (F4.5B → F4.5E). Six adapters. Telemetry adapter (`telemetry.ts`) serves a deterministic synthetic 60-point trace in mock mode; in api mode delegates to the live `/telemetry/trends`. |
| Frontend screen migration | F4.5F migrated the `/units` fleet selector. **No screen reads telemetry from the F4 adapter yet.** Operations and Units charts still draw from the F2 simulator / F3 mock. |
| `RealtimeModule` | Socket.IO scaffolding in `apps/backend/src/realtime/`. Mounted in `AppModule`. **Routes no telemetry.** |
| Authentication | **None.** `User` is a placeholder. `CallerContext.tenantId` is plumbed inert through F4.4 controllers. ADR-007 §7 keeps auth out of F4. |

**The architectural gap F4.6 closes:** there is no controlled write path into `telemetry_readings`, no rule for how external systems hand off data, no place to record what was rejected, no maintained live projection, no alarm evaluator, no real-time broadcast. Every one of these is a design question with long shadow; F4.6 decides them now and lets F4.6A → F4.6F implement against decisions that have already cleared review.

## 3. Design Goals

1. **RVF owns the canonical telemetry record.** `telemetry_readings` is the single source of historical truth; no other system holds business state.
2. **Single controlled ingestion boundary.** Every accepted reading enters through one validated, audited service. External adapters (manual, simulator, HTTP, MQTT, Node-RED, ThingsBoard, OPC-UA, Modbus, PLC, edge gateway, historian) feed that boundary; they do not bypass it.
3. **Auditable external-to-internal mapping.** `IntegrationSource` and `IntegrationMapping` are the explicit, controlled seam between external vocabularies and the canonical `(tenant, unit, sensor, canonical_tag)` triple. Mapping changes are recorded in `audit_logs`.
4. **Deterministic deduplication.** A duplicate arriving twice produces one row. A conflicting "duplicate" (same key, different value) is quarantined, not silently overwritten.
5. **Honest treatment of late and invalid data.** Late readings persist when valid; out-of-policy readings are quarantined to a dedicated table so they remain traceable without polluting historical truth.
6. **A clean separation between historical truth and live state.** `telemetry_readings` is immutable history. `live_readings` is a separately-maintained projection that powers Units / Operations current-value tiles. Loss of the projection is recoverable; loss of `telemetry_readings` is not.
7. **Alarm evaluation is backend-owned and downstream of acceptance.** No alarm ever fires from data that has not been accepted. The browser never evaluates alarms. When an in-force commissioning snapshot applies to the unit, alarm evaluation reads thresholds from `CommissioningSnapshot.effective_thresholds` (preserving the ADR-005 invariant); otherwise it reads from the current `alarm_rules`. The mechanism that determines whether a snapshot is in force is an F4.6D implementation decision; F4.6 does not introduce a Jobs flow.
8. **Telemetry belongs to configured physical instruments.** Every accepted reading anchors to a configured `Sensor` (and through it to the currently installed `TransmitterDevice`) on a `MeasurementUnit`. Telemetry is never keyed only by browser-display labels or ad-hoc external tag strings; the canonical record always resolves a real, RVF-configured instrument.
9. **`TelemetryReading` is canonical history. `LiveReading` is a derived projection.** `telemetry_readings` is append-only and immutable; it is the source of truth for any historical question. A live-readings projection provides current-value lookups for dashboard tiles, rebuildable from `telemetry_readings`. Losing the projection is recoverable; losing `telemetry_readings` is not.
10. **WebSocket is fan-out, not source of truth.** Real-time emission happens *after* persistence and *after* projection update. DB recovery is always possible from `telemetry_readings`; WebSocket loss is recoverable by reconnect + a REST read of the latest-value endpoint.
11. **No backwards-compatibility detours with F1.** The F1 ingest envelope (`schema: 'rvf.telemetry.v1'`, slug `unit_id`, `LateTelemetryQuarantine`, 5-value `Quality` enum) was deleted in F4.4F. F4.6 designs against the F4 schema only.
12. **Per-sub-phase reversibility.** F4.6A → F4.6F land one at a time. Each sub-phase passes lint / typecheck / build / test, ships its own closeout report, and is reversible at the commit level. No "big bang" merge.

## 4. Non-Goals

F4.6 does **not** decide, design, or implement any of the following:

1. **No live hardware integration.** No MQTT broker selection. No OPC-UA client library choice. No Modbus stack pick. No physical transmitter wiring. F4.6B ships a manual / simulator path; vendor-specific bridges follow later, each with its own ADR if needed.
2. **No authentication / authorization design.** ADR-007 §7 keeps auth out of F4. F4.6 documents the env-flag-based interim guard for the ingestion endpoint and defers a real API-key / signature / OAuth design to a successor ADR (ADR-009 or later).
3. **No production deployment.** No CI / CD wiring. No production secrets. No infrastructure decisions (Kubernetes, ECS, Lambda, etc.).
4. **No retention / archival / partitioning.** `telemetry_readings` grows append-only; retention and TimescaleDB conversion remain ADR-007 §4 future work.
5. **No analytics / reporting pipeline.** Hourly / daily aggregates, materialized rollups, and TimescaleDB continuous aggregates are out of scope. F4.4F's trends endpoint is the only read surface F4.6 cares about.
6. **No frontend redesign.** F4.6 does not change any Units / Operations / Alarms / Sensors layout or component. The Operations charts continue to render from the F2 simulator until a future per-screen migration cuts them over after F4.6C / F4.6E lands.
7. **No client-portal exposure.** Telemetry exposure to external clients goes through a separately-designed read-model in a later phase.
8. **No AI / predictive maintenance.** Sensor-health derivation and predictive analytics are explicitly out of F4.6.
9. **No replacement of the F4 schema.** F4.6 may add schema (see §16); it does not redesign existing tables.
10. **No revival of the F1 envelope or quarantine entity.** Both are documented as deleted in F4.4F §2.1 / §5. F4.6 introduces a fresh contract.

## 5. Ingestion Boundary

### 5.1 Boundary definition

The **ingestion boundary** is, conceptually, a single backend ingestion module owned by RVF Malinois. Its concrete location (candidate path: `apps/backend/src/telemetry/ingestion/`), its module / service / class name, and its exposed method signature are implementation candidates finalized in F4.6B; a conceptual signature is:

```
ingestBatch(batch) → outcomes[]
```

What is binding is the principle: every accepted telemetry write into `telemetry_readings` originates from this single boundary. There is no other accepted write path. Concrete class / method / file names are not fixed by this document.

Three categories of entry points are permitted to call into the boundary. The concrete paths, flag names, library choices, and module shapes below are **implementation candidates** that the relevant sub-phase finalizes:

| Entry point | Phase | Trust | Description |
|---|---|---|---|
| **Internal HTTP endpoint** (candidate path: `POST /api/v1/telemetry/ingest`) | F4.6B | controlled | Internal-only HTTP endpoint, guarded by an env flag (candidate: `RVF_INGEST_ENABLED`), schema-validated at the boundary. Used by manual / dev usage and future bridge processes that prefer HTTP. |
| **In-process simulator adapter** | F4.6B | controlled | In-process backend module that synthesizes deterministic readings. Off by default; toggled by an env flag (candidate: `RVF_TELEMETRY_SIMULATOR`). |
| **Bridge adapters** | F4.6B+ (one per concrete integration) | controlled | Future MQTT / Node-RED / OPC-UA / Modbus / historian bridges. Each bridge may be an in-process backend module or a sidecar process that loops back through the HTTP endpoint. Each bridge resolves an `IntegrationSource` row before invoking the boundary. |

### 5.2 What the boundary forbids

The boundary is the *only* lawful path. The following are forbidden by design and must be enforced by code review in every later phase:

1. **No external system writes directly to `telemetry_readings`.** Not ThingsBoard, not Node-RED, not an MQTT broker, not an OPC-UA bridge, not a PLC gateway, not a historian, not a Lambda, not a SQL script, not a `psql` session. Postgres role separation (later phase) hardens this; F4.6 fixes the rule.
2. **No frontend writes telemetry.** The browser does not have `POST /telemetry/ingest` permission. The Operations / Units screens never produce a write; they only read.
3. **No write inside any controller / service other than the ingestion boundary.** Other modules (Wells, Equipment, future operational-context modules) must not `prisma.telemetryReading.create` directly. Code review enforces. The concrete class name of the boundary service is an F4.6B decision.
4. **No write that skips dedup / validation.** Even an internal test fixture creating a single reading must go through the boundary so the proposed partial unique indexes (§8.3, F4.6A schema candidates) and the validation rules apply uniformly.
5. **No write that bypasses `IntegrationSource` resolution.** Every accepted row carries a `source` (`telemetry_readings.source` CHECK enum) AND a resolvable `IntegrationSource` row. Manual / simulator entries register dedicated `integration_sources` rows on first run (F4.6B is expected to seed them idempotently).

### 5.3 Allowed `source` values

The F4.1 schema CHECK fixes ten values:

```
mock | manual | field_gateway | historian | plc | mqtt | node_red | opc_ua | modbus | edge_gateway
```

F4.6 honors all ten. Each maps to an `IntegrationSource.kind` (the same enum is declared on `integration_sources.kind`). New source kinds require a migration to widen both CHECKs.

### 5.4 Batch shape (logical)

F4.6 fixes the conceptual shape; the exact wire schema (field names, casing, validation library, content-type) is finalized in F4.6B. A candidate shape:

```
AcceptedBatch (conceptual):
  integrationSourceId: UUID            // FK to integration_sources.id
  receivedAt:          ISO-8601        // wall clock at the boundary
  correlationId:       UUID (optional) // for AuditLog correlation
  readings: AcceptedReadingDraft[]

AcceptedReadingDraft (conceptual):
  externalIdentifier:  TEXT            // resolves to IntegrationMapping
  timestamp:           ISO-8601 UTC    // source timestamp
  value:               numeric (string or number; backend normalizes)
  engineeringUnit:     TEXT (optional, default = canonical unit from mapping)
  quality:             'good' | 'uncertain' | 'bad' (optional, default 'uncertain')
  source:              one of the ten CHECK values
  sequence:            BIGINT (optional, monotonic per externalIdentifier)
```

`AcceptedReadingDraft` is a draft because nothing is persisted yet. The boundary validates, resolves, dedups, and either persists to `telemetry_readings` (with the resolved `tenant_id / unit_id / sensor_id / canonical_tag_id`) or records the rejection in the quarantine surface (candidate name: `telemetry_ingestion_errors`; see §16). Operational-context fields (e.g. anything tying a reading to an active operational record) are intentionally **not** part of the F4.6 draft shape — F4.6 does not introduce a Jobs flow; any such field is deferred to a later phase that wires operational context.

### 5.5 Outcomes

Every draft yields exactly one outcome:

| Outcome | Meaning | DB effect |
|---|---|---|
| `accepted` | Validated, mapped, deduped, persisted. | One `telemetry_readings` row inserted. May trigger live-projection upsert (§11) and alarm evaluation (§12). |
| `duplicate` | Dedup key matched an existing row with the same value. No-op. | Zero rows written. Counter incremented for observability. |
| `conflict` | Dedup key matched an existing row with a **different** value. Quarantined. | One row written to the quarantine surface (F4.6A candidate); no change to `telemetry_readings`. |
| `quarantined` | Late-arrival / unknown mapping / disabled mapping / invalid quality / unit mismatch / inactive operational context / other policy failure. | One row written to the quarantine surface; no change to `telemetry_readings`. |
| `rejected` | Hard validation failure (malformed timestamp, non-numeric value, unknown source, missing `externalIdentifier`). | One row written to the quarantine surface; no change to `telemetry_readings`. HTTP callers see a 4xx response. |

The outcome distribution is observable. The boundary is expected to emit structured logs and (optionally) per-outcome / per-source / per-tenant counters; the concrete observability choice (Prometheus, OpenTelemetry, plain logs) is an F4.6B implementation decision.

## 6. Telemetry Persistence Model

### 6.1 `telemetry_readings` is the canonical historical record

`telemetry_readings` (F4.1 §H) is **immutable** and **append-only** by architecture. Every accepted reading produces exactly one row. The row resolves the following non-null columns:

| Column | Meaning | Source |
|---|---|---|
| `id` | UUID, server-generated. | `gen_random_uuid()` default. |
| `tenant_id` | Tenancy. | Derived from the `IntegrationSource` row's tenant. |
| `unit_id` | Measurement unit. | Resolved via `IntegrationMapping.unit_id`. |
| `sensor_id` | Sensor on that unit. | Resolved via `IntegrationMapping.sensor_id`. |
| `canonical_tag_id` | Canonical measurement variable. | Resolved via `IntegrationMapping.canonical_tag_id`, or via active `SensorTagBinding` if the mapping does not carry one. |
| `timestamp` | Source timestamp (UTC). | From the draft. |
| `value` | Numeric measurement. | From the draft, after unit normalization (§10). |
| `engineering_unit` | Unit of `value`. | After unit normalization, equals the canonical tag's `canonical_unit` unless an explicit override is configured. |
| `quality` | One of `good \| uncertain \| bad`. | After normalization (§10). |
| `source` | One of the ten CHECK values. | From the draft / `IntegrationSource.kind`. |
| `ingestion_id` | `external_identifier` of the source mapping. | Copied for forensic traceability. |
| `sequence` | Source-side monotonic counter (optional). | From the draft when present. |
| `job_id` | Optional operational-context FK (column exists in the F4.1 schema). | **F4.6 does not wire an operational-context lookup.** F4.6 leaves this column null; a later phase (not in F4.6) may design the wiring. |
| `created_at` | Wall clock of insert. | `now()` default. |

### 6.2 Immutability

`telemetry_readings` rows are **never** updated or deleted under normal operation. F4 §F and F4.1 §H document this; F4.6 reaffirms it and adds:

- **Corrections** (a reading that turned out wrong, e.g. due to a transmitter calibration error discovered later) do not `UPDATE` the historical row. The original row stays. A correction record lives in a future `telemetry_corrections` table (out of scope for F4.6; designed when the first real correction request arrives). For F4.6's purposes, accept-it-as-history is the rule.
- **Bulk fixes** (e.g. fixing a wrong canonical tag binding for a sensor over a time range) require a separately-designed migration tool, not editing history. F4.6 does not provide one.
- **SQL-level enforcement** (BEFORE UPDATE/DELETE trigger raising an exception, or `REVOKE UPDATE, DELETE ON telemetry_readings FROM <app_role>`) is recommended hardening; F4.6 documents it as a future task aligned with the role-separation work that any production deployment will need. F4.6A may optionally include it; the architecture does not require it inside F4.6.

### 6.3 What does not belong in `telemetry_readings`

- **Quarantined readings.** They go to `telemetry_ingestion_errors` (F4.6A candidate, §16). Mixing them into the canonical table would corrupt historical truth.
- **Raw frames.** Whatever bytes / JSON the integration source emitted before validation are not stored as canonical rows. A bridge may keep a short-lived debug log; that log is auxiliary, not canonical.
- **Aggregates.** Hourly / daily / per-unit rollups belong to materialized views or aggregate tables. F4.6 does not introduce one; F4.4F's trends endpoint does point-level reads only.
- **Alarm state.** `alarm_events` is its own table. Telemetry rows do not carry alarm flags.

### 6.4 Volume expectations

F4.6 does not commit to a specific throughput target. Useful bounds for design:

- A single unit with 7 sensors at 1 Hz produces ≈ 25,000 readings / hour, ≈ 600,000 / day, ≈ 4.2M / week.
- Three concurrent units at 1 Hz produce ≈ 12.6M / week.
- A field deployment of 20 units would produce ≈ 84M / week, ≈ 4.4B / year.

These numbers cross the TimescaleDB threshold quickly. F4 §F and ADR-007 §4 already note TimescaleDB as a future optional extension; F4.6 reaffirms this without committing to it. The `telemetry_readings_unit_tag_time_idx` index (F4.1) handles trends queries within the order-of-magnitude windows the dashboard cares about (hours / days, not years).

## 7. Integration Source and Mapping Model

### 7.1 The two-table seam

Two tables — `integration_sources` and `integration_mappings` — own the entire external-to-internal translation surface.

**`integration_sources`** (one row per external system instance). Key fields:

- `id`, `tenant_id`, `kind` (one of the ten CHECK values), `name`, `status` ∈ {`active`, `inactive`}, `config` (jsonb, opaque per kind), `credentials_reference` (TEXT, points at external secret store).

A bridge process / adapter resolves itself to exactly one `IntegrationSource` row at startup. Without a row, the source cannot post (F4.6B's REST controller rejects with 400 / 401 once auth lands).

**`integration_mappings`** (one row per external identifier). Key fields:

- `id`, `tenant_id`, `integration_source_id`, `external_identifier` (TEXT, unique per source), `unit_id`, `sensor_id` (nullable), `canonical_tag_id` (nullable), `engineering_unit_override` (TEXT, nullable), `transformation_reference` (TEXT, nullable), `enabled` (BOOLEAN, default FALSE).

`UNIQUE (integration_source_id, external_identifier)` already exists in F4.1; it is the natural part of the dedup key (§8).

### 7.2 Resolution algorithm at ingestion time

Given `(integration_source_id, externalIdentifier)` from the draft, the service must resolve to a single `(tenant_id, unit_id, sensor_id, canonical_tag_id)` triple:

1. Look up the mapping by `(integration_source_id, external_identifier)`. Missing → quarantine (`unknown_mapping`).
2. Check `enabled = TRUE`. Disabled → quarantine (`disabled_mapping`). Mapping rows are never deleted; disabling preserves history.
3. Read `unit_id` (always present per FK).
4. Read `sensor_id`. If null, resolve via active `SensorTagBinding`: pick the sensor whose active binding matches the mapping's `canonical_tag_id`. Ambiguous or missing → quarantine (`unresolved_sensor`).
5. Read `canonical_tag_id`. If null, resolve via active `SensorTagBinding` of the sensor. Missing → quarantine (`unresolved_canonical_tag`).
6. Compare `tenant_id` against the `IntegrationSource.tenant_id`. Mismatch → quarantine (`tenant_mismatch`) — this catches misconfigured mappings.

### 7.3 What the boundary refuses to trust

Even if the wire payload includes a `canonicalTagName` field, the boundary does **not** honor it when a mapping exists for the same `(integration_source_id, external_identifier)`. The mapping is authoritative. This rule prevents an upstream adapter from accidentally re-tagging a sensor by changing a label in its own config. If the operator wants to re-bind a sensor to a different canonical tag, they edit the `SensorTagBinding` (effective-dated, audited) or the `IntegrationMapping.canonical_tag_id` — both via the canonical API, both audited.

`canonicalTagName` in the payload is allowed only when no mapping exists *and* the source is `manual` *and* the dev-mode env flag permits it. Even then, the value is validated against `canonical_tags.name` (must exist, must not be `deprecated = true`). Manual / dev usage is the only path that ever bypasses `IntegrationMapping`; production paths always go through a mapping.

### 7.4 Mapping disable, not delete

`IntegrationMapping` rows are never deleted by production code. Disabling (`enabled = false`) closes the channel without losing the historical association between `external_identifier` and `(unit_id, sensor_id, canonical_tag_id)` — important because every existing `telemetry_readings.ingestion_id` row already references that `external_identifier` indirectly. F4.6's audit-log coverage (§ Audit) requires that every disable / re-enable produces an `audit_logs` row with `action = 'updated'` and a `before` / `after` snapshot.

### 7.5 Per-unit independence preserved

`IntegrationMapping.unit_id` is FK-resolved at lookup time. Different units have independent mappings; nothing about the mapping shape collapses HP-001 and LP-001 into a shared address space. F4 §E's "per-unit operational configuration is sacred" rule is preserved at the ingestion layer.

## 8. Deduplication Strategy

### 8.1 Why dedup is required at the ingestion layer

External tools retry. Networks drop packets. MQTT brokers replay on reconnect. Edge gateways buffer-then-flush. Without a dedup discipline, every retry produces a duplicate `telemetry_readings` row. Trends queries then double-count; alarms fire twice; live values flicker. Dedup at insert is the only place to fix this.

### 8.2 The dedup key

The natural dedup key has two forms, picked by whether the source provides a monotonic `sequence`:

**Form A — sequence-based** (preferred when `sequence` is present):

```
(integration_source_id, external_identifier, sequence)
```

`sequence` is a `BIGINT` already provisioned on `telemetry_readings`. Sources that emit a monotonic counter per channel (most MQTT publishers, every well-engineered OPC-UA bridge, every Modbus polling loop) should populate it. Two readings with the same `(source, externalIdentifier, sequence)` are duplicates by definition; the second is dropped.

**Form B — timestamp-based** (used when `sequence` is absent):

```
(integration_source_id, external_identifier, timestamp)
```

The mapping resolves `external_identifier` → `(unit_id, sensor_id, canonical_tag_id)`, so the timestamp-based key is equivalent to `(unit_id, sensor_id, canonical_tag_id, timestamp)` after resolution. Two readings with the same key are duplicates only if their `value` and `quality` are also identical; if not, they are **conflicts** (see §8.5).

### 8.3 Enforcement strategy

**The current schema does not enforce either dedup key.** F4.6 must add this as schema candidates in F4.6A (see §16):

| Candidate | Purpose |
|---|---|
| `telemetry_readings_dedup_seq_uk` (partial unique index) | `(unit_id, canonical_tag_id, sequence) WHERE sequence IS NOT NULL`. Catches Form A duplicates at the DB layer. |
| `telemetry_readings_dedup_ts_uk` (partial unique index) | `(unit_id, canonical_tag_id, timestamp) WHERE sequence IS NULL`. Catches Form B duplicates at the DB layer. Note: this is intentionally coarse (one reading per tag per timestamp per unit) — a stricter `(sensor_id, timestamp)` variant is acceptable if reviewers prefer. F4.6A picks. |

App-layer dedup (a pre-INSERT lookup) is acceptable too, but the DB index is the safety net. Both is the recommended belt-and-suspenders posture.

### 8.4 Sequence handling notes

- `sequence` is opaque to RVF. It is the source's counter, not RVF's.
- Two different sources can emit overlapping sequence ranges without interfering: the key includes `integration_source_id` via the mapping resolution.
- A source that emits `sequence` and then later stops emitting it (or vice versa) breaks the dedup key transition. F4.6 documents this as a known risk; bridges should commit to one form per channel and not switch.

### 8.5 Conflicts: same key, different value

A "duplicate" that carries a different `value` is treated as a **conflict**, not a duplicate. Conflicts must not be silently overwritten — the existing row is historical truth; the new row is suspect. The conflict goes to `telemetry_ingestion_errors` with reason `conflict_dedup` and a snapshot of both the existing and incoming values. An operator can then investigate.

### 8.6 What dedup explicitly does **not** do

- It does not collapse "near-identical" readings (e.g. two readings 50 ms apart with `value` differing by 0.001). Near-identicals are valid and persist.
- It does not deduplicate across sources. Two sources writing the same physical sensor through two different mappings are not RVF's problem to merge — the operator should disable one of the mappings. The dedup key is per-source by construction.
- It does not retroactively reconcile past duplicates if the index is added after rows already exist. F4.6A adds the index; if any pre-existing duplicates exist (none today, since the table is empty), they remain.

## 9. Late-Arrival / Quarantine Policy

### 9.1 Why a quarantine table

If invalid readings are silently dropped, they are unobservable: an operator never learns that a bridge has been emitting a wrong canonical tag for a week. If they are persisted to `telemetry_readings`, the canonical record is corrupted. The architectural answer is a dedicated quarantine table — `telemetry_ingestion_errors` (F4.6A schema candidate; see §16) — which preserves the rejected payload, the reason, the time, and the integration context. Operators inspect it; nothing in the canonical historical record is touched.

The F1 schema had `LateTelemetryQuarantine`. F4.2B removed it. F4.6's new table is **not** the same shape; it is wider (covers every quarantine reason, not only "late") and aligned with F4 vocabulary.

### 9.2 What goes into quarantine

The table is the catch-all for every non-acceptance outcome that is not a duplicate. Reasons covered:

| Reason | Trigger | Notes |
|---|---|---|
| `late_outside_window` | `timestamp` is older than `now() - INGESTION_MAX_LATE_WINDOW`. Default: 7 days. Configurable per source. | Valid late readings (inside the window) are accepted normally and persist to `telemetry_readings`. |
| `future_timestamp` | `timestamp` is newer than `now() + INGESTION_MAX_FUTURE_SKEW`. Default: 5 minutes. | Catches clock-skewed sources. |
| `unknown_source` | `integration_source_id` does not match any `integration_sources` row. | Hard configuration error. |
| `unknown_mapping` | `(integration_source_id, external_identifier)` has no `integration_mappings` row. | Likely a misconfigured adapter; do not blindly create the row. |
| `disabled_mapping` | The mapping exists but `enabled = false`. | Adapter is using a channel the operator has closed. |
| `unresolved_sensor` / `unresolved_canonical_tag` | The mapping resolution (§7.2 step 4 / 5) could not pick a unique sensor or tag. | Often happens when an `IntegrationMapping` has neither `sensor_id` nor `canonical_tag_id` set and the active `SensorTagBinding` is ambiguous. |
| `tenant_mismatch` | Mapping's `tenant_id` and source's `tenant_id` disagree. | Multi-tenant safety guard. |
| `invalid_quality` | Quality value not in `good / uncertain / bad` and cannot be normalized. | After §10.4 normalization is tried first. |
| `invalid_value` | `value` does not parse as numeric, or is `NaN` / `±Infinity`. | Hard validation failure. |
| `unit_mismatch` | Engineering unit conflict: source says `bar`, mapping expects `psi`, no conversion configured. | See §10. |
| `outside_envelope` | `value` is physically implausible (negative pressure, vibration > 100× envelope, etc.). The threshold is configurable per canonical tag; F4.6 documents the policy but defers the per-tag thresholds to F4.6B. |
| `inactive_context` | Reading references an operational context that is inactive / disabled. F4.6 does not introduce a Jobs flow; this reason is a forward-looking placeholder for the eventual operational-context wiring and may not be exercised by F4.6's sub-phases. |
| `conflict_dedup` | Dedup key matched an existing row with a different value. See §8.5. |
| `mapping_engine_failure` | Internal error in the resolution algorithm. Should be zero in production. |

### 9.3 What does **not** go to quarantine

- Duplicates (outcome `duplicate`): zero rows, no quarantine row. Observable via counter, not row.
- Valid late readings (within `INGESTION_MAX_LATE_WINDOW`): persist normally to `telemetry_readings`. The fact that they were late is recorded only via `created_at - timestamp` (computable from the canonical row).

### 9.4 Quarantine retention and recovery

`telemetry_ingestion_errors` rows are not telemetry; they are diagnostic. F4.6 fixes the rule that they are retained for at least 30 days (the policy is per-deployment; the rule is "long enough for an operator to investigate"). A future operational tool may replay quarantined rows back through the ingestion service after the underlying issue (e.g. a missing mapping) is fixed; F4.6 documents the seam but does not implement the replayer.

## 10. Quality Normalization

### 10.1 Canonical vocabulary

The F4.1 schema fixes `telemetry_readings.quality` to `good | uncertain | bad`. This is the canonical vocabulary. F4.6 honors it exactly.

The user-facing brief proposed "good / suspect / bad". F4.6 maps `suspect → uncertain` at the boundary (it is a synonym, not a different concept) so that the schema constraint is not weakened. The boundary normalizes other common spellings the same way:

| Source value | Normalized value |
|---|---|
| `good`, `GOOD`, `ok`, `valid`, OPC-UA quality bits indicating "good" | `good` |
| `suspect`, `uncertain`, `questionable`, `stale`, OPC-UA quality bits indicating "uncertain" | `uncertain` |
| `bad`, `BAD`, `invalid`, `fail`, `comm_fail`, OPC-UA quality bits indicating "bad" | `bad` |
| missing / unparseable | `uncertain` (default) |

The actual mapping table lives in code (F4.6B). F4.6 fixes the rule, not the table.

### 10.2 Behavior per quality

| Quality | Persists to `telemetry_readings` | Updates live projection | Triggers alarm evaluation |
|---|---|---|---|
| `good` | yes | yes | yes |
| `uncertain` | yes | no (preserves last `good` value as live) | no by default (per-rule override possible in F4.6D) |
| `bad` | yes | no | no |

Persisting `uncertain` and `bad` is important: they are valuable for diagnostics, sensor-health later, and audit. They simply do not propagate to the user-facing live view or to alarm evaluation, because that view's contract is "this is what is currently happening to the well" — uncertain or bad readings would mislead the operator.

### 10.3 Engineering-unit handling

F4.4F deliberately does not convert at read time. F4.6 mirrors that decision but adds an ingestion-time normalization rule:

- If the draft's `engineeringUnit` equals the mapping's resolved canonical tag's `canonical_unit`, store as-is. Most common case.
- If the draft's `engineeringUnit` differs but a conversion is available via the retained `UnitConverter` (`apps/backend/src/telemetry/unit-converter.ts`, kept in F4.4F precisely for this future use), convert to canonical unit and store the converted value with `engineering_unit = canonical_unit`. The pre-conversion value is recorded only in audit-log / ingestion-error context if interesting; the canonical row carries the post-conversion value.
- If the draft's unit cannot be converted (no entry in `UnitConverter.supportedConversions`), quarantine as `unit_mismatch`.

The `IntegrationMapping.engineering_unit_override` field is the per-mapping escape hatch: it tells the boundary "this mapping is known to emit a non-canonical unit; convert from this unit, do not quarantine". When set, the override is the source-side unit; the canonical unit is still the destination.

### 10.4 Why the boundary normalizes, not the storage layer

Storage-layer constraints (CHECK) reject bad rows but cannot rescue them. Doing the normalization at the boundary means the canonical row that lands is always in canonical shape, and the audit / quarantine trail captures what the source actually sent. This is the inversion of "store raw, normalize on read", which would force every consumer (trends, live, alarms, reports, exports) to repeat the normalization and risk drift.

## 11. Live Readings Projection

### 11.1 What the projection is for

The projection answers "what is the current value of every measurement on every unit right now?" — it powers the Units screen Live Instrument Readings panel, the SeparatorDiagram value chips, the Operations summary tiles, and any future per-unit "current state" view. It does **not** replace `telemetry_readings` for trends; trends always read history.

### 11.2 The current implementation: a `VIEW`

F4.1 ships `live_readings_projection` as a `CREATE VIEW … DISTINCT ON (unit_id, sensor_id) … ORDER BY timestamp DESC`. It is correct but pays the read cost of a heap scan + sort every time a consumer queries it. For a small seed (≤ 14 sensors × a few hundred readings) this is fine; at production volume it becomes a hot path that scans every page of `telemetry_readings`.

### 11.3 The F4.6 decision

F4.6 commits to **converting the projection from a `VIEW` to an upsert-maintained projection table** at F4.6C. Rationale:

- **Restart-safe.** A table persists across server restarts; an in-memory cache loses state on every redeploy.
- **O(1) read.** Per-unit / per-tag lookups become a primary-key fetch, not a scan.
- **Quality watermarking.** A table can implement "only `good` readings update the live value" by checking the row's stored `quality` before overwriting, without scanning history.
- **Late-arrival safe.** A late `good` reading with a timestamp older than the stored live value does **not** overwrite — the table checks `new.timestamp > stored.timestamp` and skips if older. A view with `ORDER BY timestamp DESC` does this naturally; a table needs to enforce it explicitly, which is fine and explicit is better.
- **Restart from history.** If the projection is ever lost, F4.6C ships a deterministic rebuild query (`INSERT ... SELECT DISTINCT ON ...` against `telemetry_readings`) so the table can be reconstructed from the canonical record in a single migration.

### 11.4 Candidate projection table (F4.6A schema candidate)

The shape below is a **candidate** for F4.6A to refine — the table name, exact columns, and key choice are not fixed by F4.6:

```
TABLE live_readings (         -- candidate name
  tenant_id         UUID NOT NULL,
  unit_id           UUID NOT NULL,
  sensor_id         UUID NOT NULL,
  canonical_tag_id  UUID NOT NULL,
  timestamp         TIMESTAMPTZ NOT NULL,
  value             NUMERIC NOT NULL,
  engineering_unit  TEXT NOT NULL,
  quality           TEXT NOT NULL,    -- 'good' on accepted updates; older quality may linger after subsequent 'uncertain'/'bad' runs
  source            TEXT NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (unit_id, sensor_id, canonical_tag_id),
  CHECK (quality IN ('good','uncertain','bad'))
)
```

Keying by `(unit_id, sensor_id, canonical_tag_id)` matches the natural address of "this measurement on this sensor on this unit" and reinforces the transmitter-first principle (the projection rows resolve a configured instrument, not a free-form label). A simpler `(unit_id, canonical_tag_id)` key (sensor-agnostic) is acceptable for dashboards that don't care which physical sensor backs the tag; F4.6A picks based on screen requirements. The current `live_readings_projection` view uses `(unit_id, sensor_id)` — F4.6A reconciles. The table intentionally omits operational-context columns (such as a future job reference) — F4.6 does not introduce that wiring.

### 11.5 Update rule

On every `good` reading accepted by the ingestion service:

1. Compute the projection key.
2. Look up the existing row.
3. If absent → INSERT.
4. If present and `new.timestamp > stored.timestamp` → UPDATE (overwrite).
5. If present and `new.timestamp <= stored.timestamp` → no-op (the late-arrival case; the older reading still landed in `telemetry_readings`, just doesn't supersede the live value).

For `uncertain` and `bad`: no update. The stored row remains; consumers can detect staleness via `now() - timestamp`.

### 11.6 Transactional consistency

Conceptually, the projection upsert is expected to share the **same transactional unit** as the `telemetry_readings` insert — atomically committing both protects the dashboard from a state where canonical history is correct but the live view is stale. The exact transaction mechanics (Prisma `$transaction`, savepoints, retry policy, isolation level) are an F4.6C implementation decision. Alarm-event evaluation, when F4.6D introduces it, is similarly expected to participate in the same atomic step so the four conceptual steps (insert canonical row, upsert projection, evaluate alarm, write alarm event) commit or fail together.

### 11.7 The view's fate

The current `live_readings_projection` `VIEW` is provisional. F4.6A or F4.6C is expected to supersede it — either dropped in the F4.6A migration that introduces the projection table, or kept as a transitional fallback (e.g. renamed `live_readings_view`) until F4.6C verifies the table-based projection works. The choice is an F4.6A decision; the principle (the projection is derived, the historical record is canonical) does not depend on which option lands.

### 11.8 Consumer surface

The frontend Units / Operations live tiles read from a future latest-value endpoint (candidate: `GET /api/v1/telemetry/latest?unitId=...`) introduced by F4.6C that selects from the projection. Direct backend reads of the projection are allowed for internal use; the frontend always goes through the API. The exact path, query parameters, and response shape are F4.6C decisions.

## 12. Alarm Evaluation Boundary

### 12.1 Where evaluation runs

Alarm evaluation is **backend-owned**, conceptually runs **inside the same transactional unit** as the canonical insert and the projection upsert, and only fires on **`good`** readings. The concrete service / class location is an F4.6D implementation decision.

The frontend never evaluates alarms against telemetry. The F2 frontend evaluator (which runs against the realtime store with `thresholdsSource = 'commissioning_snapshot'`) remains in place for the legacy simulator path, but its data source switches once F4.6E lands: it reads the persisted `alarm_events` instead of computing them client-side. F4.6 documents the seam; the actual cutover is a later screen migration sub-phase.

### 12.2 Threshold resolution

ADR-005's invariant is preserved: when an in-force commissioning snapshot applies to the unit at the reading's timestamp, thresholds come from `CommissioningSnapshot.effective_thresholds`. Otherwise, thresholds come from the current `alarm_rules` (the ones with `is_current = TRUE`).

The conceptual resolution at evaluation time:

1. Determine whether an in-force commissioning snapshot exists for the unit and applies to the reading's timestamp.
2. If yes, read thresholds from `commissioning_snapshots.effective_thresholds` (JSONB).
3. Otherwise, read from `alarm_rules WHERE unit_id = … AND canonical_tag_id = … AND is_current = TRUE AND enabled = TRUE`.
4. Apply: compare `reading.value` against `low_low / low / high / high_high` with `deadband` and `delay_seconds` (debounce).

How the in-force snapshot is determined — what operational-context model drives the lookup, what state machine governs activation, what fallback applies when the lookup is ambiguous — is an F4.6D implementation decision. **F4.6 does not introduce a Jobs flow.** The principle (snapshot when in force, current rules otherwise) is what F4.6 fixes; the lookup mechanism is left to the sub-phase that designs the operational-context wiring.

### 12.3 Lifecycle and the existing row

`alarm_events` has the lifecycle columns ready (`state`, `first_triggered_at`, `acknowledged_at`, `cleared_at`). The evaluator's conceptual task:

- **Activate.** A reading crossing a threshold with no currently active event for `(unit_id, canonical_tag_id, severity)` → write a row with `state = 'active'`, `first_triggered_at = reading.timestamp`, `triggered_value = reading.value`, `rule_snapshot = <jsonb copy of the rule>`.
- **Clear.** A reading returning to within the deadband with an active event → update that event's `cleared_at = reading.timestamp`, `state = 'cleared'`. (Acknowledgement is operator-driven, not telemetry-driven.)
- **Sustain.** A reading that continues outside the threshold while an event is already active → no new event.

The state machine `active → acknowledged → cleared` is preserved; the operator transitions `active → acknowledged` via a future REST call (candidate path: `POST /alarms/events/:id/acknowledge`, F4.6D), the evaluator transitions `acknowledged → cleared` (or `active → cleared`) automatically. Path, payload, and audit-log linkage are F4.6D decisions.

### 12.4 Suspect / bad rule

Readings with `quality ∈ {uncertain, bad}` do **not** trigger evaluation by default. They could mask real alarms (oscillating bad-quality readings would noise-bomb the operator). Future per-rule overrides (e.g. a "critical sensor health" rule that *should* fire on a bad reading) are designed in F4.6D, not here.

### 12.5 What is not in F4.6's alarm scope

- **Acknowledgement UI.** A read API is planned; the UI changes are per-screen migration after F4.6D.
- **Notification fan-out** (email, Slack, SMS, push). Designed elsewhere.
- **Multi-condition alarms** (e.g. "high pressure AND low flow"). The `alarm_thresholds` placeholder table is reserved for this; F4.6 does not implement it.
- **Rate-of-change alarms.** Schema supports `threshold_violated = 'rate_of_change'`; F4.6 documents the seam, F4.6D may or may not implement.

### 12.6 Deferral note

F4.6D is the alarm-event sub-phase. F4.6B (manual ingest) and F4.6C (live projection) **must not** be blocked on alarm evaluation. The ingestion boundary may be shipped with the alarm hook stubbed; F4.6D fills it in. ADR-008 records the proposed sequencing.

## 13. WebSocket / Realtime Fan-Out Boundary

### 13.1 The rule

WebSocket is **downstream fan-out, not source of truth**. Every emission happens *after* the transactional unit in §11.6 commits. If WebSocket delivery fails, the canonical record is intact and the client recovers via reconnect + REST reads against the latest-value and active-alarm endpoints (candidates: `GET /telemetry/latest`, `GET /alarms/active`).

### 13.2 What gets emitted

For each accepted reading whose quality is `good`, after persistence + projection update + alarm evaluation, the realtime gateway emits a sanitized event. A candidate shape (exact field names and casing are an F4.6E decision):

```
event: "telemetry.reading"
payload: {
  tenantId, unitId, sensorId, canonicalTagId, canonicalTagName,
  timestamp, value, engineeringUnit, quality, source
}
```

For each new alarm event:

```
event: "alarm.event.activated" | "alarm.event.cleared" | "alarm.event.acknowledged"
payload: {
  tenantId, unitId, canonicalTagId, severity,
  alarmEventId, firstTriggeredAt, triggeredValue, thresholdViolated,
  state
}
```

Payloads carry only what the dashboard needs. They do not carry raw `IntegrationSource` data, raw external identifiers, or stack traces. They do not carry operational-context fields (e.g. a future job reference) — F4.6 does not wire that surface.

### 13.3 Channels

Per-tenant / per-unit subscription. The frontend subscribes to `tenant:{tenantId}:unit:{unitId}` and receives only that unit's events. Multi-unit subscribers (Operations multi-well dashboard) open multiple subscriptions or a tenant-wide topic. F4.6E picks the exact channel naming; the rule is: tenant isolation is structural, not advisory.

### 13.4 Backpressure / batching

A high-rate source (1 kHz vibration sensor, multi-sensor batch) can flood the WebSocket. F4.6E will pick a throttle policy (per-channel coalescing, per-unit batch window, drop-with-counter). F4.6 documents the requirement; the exact knobs are an implementation choice.

### 13.5 What WebSocket is **not**

- Not an alternative ingestion path. Clients do not POST telemetry over the WebSocket.
- Not the source of truth. A client that lost connection and missed an event recovers from `GET /telemetry/latest`, not from a WebSocket replay buffer.
- Not used for alarm acknowledgement. Acknowledgement is a `POST` (RESTful, audited); the WebSocket event is the *result*, not the action.

## 14. API Surface Roadmap

F4.6 sketches the eventual API surface but ships none of it. The paths, channel names, query parameters, and request / response shapes below are **candidate** implementation notes; each delivering sub-phase finalizes its own surface. The architecture commits only to the conceptual `AcceptedBatch` of §5.4 and to the principles in §§5, 11, 12, 13.

| Endpoint / Channel (candidate) | Status today | Phase that delivers | Notes |
|---|---|---|---|
| `GET /api/v1/telemetry/trends` | live (F4.4F) | — (already exists) | Range scan; the F4.5E frontend adapter already consumes a synthetic mock against this shape. |
| `POST /api/v1/telemetry/ingest` *(candidate path)* | does not exist | **F4.6B** | Internal-only. Guarded by an env flag (candidate: `RVF_INGEST_ENABLED`). Boundary-validated. Returns per-reading outcomes. |
| `GET /api/v1/telemetry/latest?unitId=…` *(candidate path)* | does not exist | **F4.6C** | Selects from the live projection. Returns the per-instrument latest row. Optional canonical-tag filter. |
| `GET /api/v1/alarms/events?unitId=…&from=…&to=…` *(candidate)* | does not exist | **F4.6D** | Range read against `alarm_events`. |
| `GET /api/v1/alarms/active?unitId=…` *(candidate)* | does not exist | **F4.6D** | Uses the partial index on active rows. |
| `POST /api/v1/alarms/events/:id/acknowledge` *(candidate)* | does not exist | **F4.6D** | Operator action; writes to `alarm_events` and `audit_logs`. |
| WebSocket `tenant:{id}:unit:{id}` (telemetry + alarms) *(candidate naming)* | scaffold only (`RealtimeModule`) | **F4.6E** | Downstream fan-out only. |
| `GET /api/v1/integrations/sources` *(candidate)* | does not exist | post-F4.6 | Admin / settings UI. |
| `POST /api/v1/integrations/sources` *(candidate)* | does not exist | post-F4.6 | Audited mapping management. |
| `POST /api/v1/integrations/mappings` *(candidate)* | does not exist | post-F4.6 | Audited mapping management. |
| `POST /api/v1/telemetry/corrections` *(candidate)* | does not exist | post-F4.6 (out of scope) | Historical correction workflow; not designed here. |
| `GET /api/v1/telemetry/ingestion-errors` *(candidate)* | does not exist | post-F4.6 (probably F4.6D) | Operator surface over the quarantine table. |

None of these paths, names, or query parameters are binding contracts of this document; each is the responsibility of the sub-phase that delivers it.

## 15. Security and Access Control Assumptions

### 15.1 No real auth in F4.6

ADR-007 §7 keeps authentication out of F4. F4.6 inherits that: it cannot block on a full auth solution, and it must not pretend a placeholder solution is sufficient for production.

### 15.2 Interim guard for the ingestion endpoint

The candidate ingestion endpoint (`POST /api/v1/telemetry/ingest` — illustrative path; F4.6B finalizes) is **not** mounted by default. F4.6B is expected to ship it behind an env flag (candidate: `RVF_INGEST_ENABLED`). When the flag is unset (default), the route does not exist on the running backend — the relevant module does not register the controller. The exact mechanism (build-time exclusion, runtime conditional registration, or a Nest guard) is an F4.6B implementation decision; the principle is that production builds with the flag unset must never expose the endpoint.

When the flag is set (local dev, integration test, smoke environments), the endpoint accepts requests. Additional guards may be layered:

- **Network isolation** — bind to localhost / private subnet for dev work.
- **API-key header** — F4.6B accepts the seam; the actual key store design is deferred to a successor ADR.
- **HMAC signature** of the batch body — deferred similarly.

The successor ADR (candidate: ADR-009) designs the production authentication path: API keys per `IntegrationSource`, optional payload HMAC, rate limiting, audit-log coverage of every ingestion call. F4.6 does **not** design that ADR; it merely records the requirement.

### 15.3 Tenant scoping

Every authenticated path (today: `CallerContext` is inert; tomorrow: derived from API key / token) carries a `tenantId`. The ingestion service:

- Verifies the request's `IntegrationSource.tenant_id` matches the caller's tenant.
- Filters every Prisma query through the tenant scope.
- Refuses to accept a draft whose mapping crosses tenants (§9.2 `tenant_mismatch`).

Until real auth exists, tenant scoping inherits the `SystemContext` posture documented for F4.4: cross-tenant reads are permitted in local dev. This is acceptable while the codebase is single-tenant in practice (one `RVF Internal` row); it is **not** acceptable in production. The successor ADR fixes this.

### 15.4 Secrets

`integration_sources.credentials_reference` already records secret *references*, not secrets. F4.6 reaffirms: no secret (API key, MQTT password, OPC-UA certificate path, historian credentials) is stored inline in any RVF row. References point at an external secret store (Vault, AWS Secrets Manager, env-injected, etc.). F4.6 does not pick the store.

### 15.5 What the frontend can never do

- The frontend cannot mount any ingestion endpoint.
- The frontend cannot evaluate alarms against telemetry and produce `alarm_events` rows.
- The frontend cannot bypass `IntegrationMapping` resolution.
- The frontend cannot write the live projection.

These are not "shouldn't"; they are "cannot" — the routes and writes do not exist on the frontend side, and the backend's controllers do not accept them under any caller context.

## 16. Database / Schema Impact Assessment

F4.6's overall posture is **schema-light**, but it does require additions. F4.6A is the migration sub-phase that adds them. **No migration is authored, applied, or designed in F4.6** — only the candidates and their rationale are listed here.

### 16.1 Schema is sufficient today

These rules / behaviors do **not** require schema change; they ride on the existing F4.1 schema:

- Inserting accepted readings into `telemetry_readings` — every required column exists.
- Resolving `(integration_source_id, external_identifier)` — `integration_mappings_source_external_uk` already enforces uniqueness.
- Reading `live_readings_projection` (VIEW) — exists today.
- Reading thresholds from `commissioning_snapshots.effective_thresholds` — column exists.
- Inserting `alarm_events` — every required column exists.
- Audit-log coverage of mapping / source changes — `audit_logs` already supports it.

### 16.2 Likely-needed F4.6A schema candidates

These are **recommended candidates**; F4.6A's own plan / report confirms, revises, or replaces them. Names, columns, predicates, and trigger choices below are illustrative — not finalized.

| # | Candidate (illustrative name) | Type | Purpose |
|---|---|---|---|
| **C1** | dedup index for sequence-based key | partial unique index | Logical predicate: `(unit_id, canonical_tag_id, sequence) WHERE sequence IS NOT NULL`. Form A dedup (§8). Exact name and column list F4.6A's call. |
| **C2** | dedup index for timestamp-based key | partial unique index | Logical predicate: `(unit_id, canonical_tag_id, timestamp) WHERE sequence IS NULL`. Form B dedup (§8). May tighten to include `sensor_id`; F4.6A picks. |
| **C3** | quarantine table | new table | Quarantine target (§9). Conceptual columns: `id, tenant_id, integration_source_id, external_identifier, raw_payload (jsonb), reason (CHECK), reason_detail, draft_timestamp, received_at, correlation_id, created_at`. CHECK on `reason` lists every quarantine reason from §9.2. Candidate name: `telemetry_ingestion_errors`. |
| **C4** | non-unique index on `(integration_source_id, ingestion_id)` over `telemetry_readings` | non-unique index | Supports forensic lookup of "which canonical rows correspond to this external identifier" — useful for replay tools and operator forensics. |
| **C5** | live-readings projection table | new table | Upsert-maintained projection (§11.4). Schema as listed in §11.4. Candidate name: `live_readings`. |
| **C6** | drop / rename of the `live_readings_projection` VIEW | DDL change | Replaced by C5. F4.6A may keep as a transitional fallback for one cycle; F4.6C / F4.6F removes. |
| **C7** | *optional* — append-only / immutability triggers on `telemetry_readings` and `commissioning_snapshots` | trigger DDL | SQL-level append-only / immutability enforcement (F4 §F / §H deferred work). May be included by F4.6A or left to a later hardening pass; not required.|

None of C1–C7 are landed by F4.6 itself. F4.6A is the migration sub-phase; F4.6A's own plan / report governs which candidates land in what form.

### 16.3 Possible later candidates

These are explicitly **not** F4.6A's responsibility; they are listed only for completeness:

- `telemetry_corrections` table — historical correction workflow. Out of scope for F4.6.
- Per-tag value-envelope thresholds — for the §9.2 `outside_envelope` policy. May live in `unit_operating_envelopes` extension or in a new `canonical_tag_envelopes` table. F4.6B picks the lighter option.
- TimescaleDB hypertable conversion of `telemetry_readings` — ADR-007 §4. Not in F4.6.
- Row-level security / GRANT separation for `telemetry_readings` — production hardening; not F4.6.

### 16.4 Migration plan (F4.6A only, candidate scope)

F4.6A is expected to author **one** Prisma migration that proposes C1 / C2 / C3 / C5 (and C4 if reviewers agree), plus the projection-view rename or drop (C6). It does **not** write data. The exact migration content, ordering, and rollback are F4.6A decisions; no data loss is possible because no row has yet been written to `telemetry_readings` or to any candidate projection table.

## 17. Implementation Roadmap F4.6A → F4.6F

Six proposed sub-phases. Each opens with its own report and closes with quality gates green. F4.6 (this document) is the gating architecture / ADR pair; the concrete scope, schema names, paths, and code structure of each sub-phase below are **candidates** that the sub-phase's own plan finalizes.

### 17.1 F4.6A — Telemetry Ingestion Foundation / schema hardening (candidate)

**Scope (candidate).** One Prisma migration adding candidates C1 / C2 / C3 / C5 from §16.2, plus the projection-view drop or rename (C6). Updates `apps/backend/prisma/schema.prisma` with the corresponding new Prisma models (candidate names: `LiveReading`, `TelemetryIngestionError`). No service code changes. No seed change.

**Deliverables (candidate).**
- a new Prisma migration directory under `apps/backend/prisma/migrations/` carrying the F4.6A migration SQL
- updated `apps/backend/prisma/schema.prisma`
- `docs/architecture/RVF_Malinois_F4_6A_Telemetry_Schema_Hardening_Report.md`

**Acceptance.** `prisma validate`, `prisma generate`, backend `lint / typecheck / build / test` green. Frontend unchanged. F4.6A's own plan and report govern exact content.

### 17.2 F4.6B — Manual / dev ingestion adapter + persistence (candidate)

**Scope (candidate).** Implements the ingestion boundary service (candidate class name TBD) and an internal HTTP endpoint guarded by an env flag (candidate path `POST /api/v1/telemetry/ingest`, candidate flag `RVF_INGEST_ENABLED`). Implements an in-process simulator adapter. Wires `IntegrationSource` / `IntegrationMapping` resolution. Implements dedup (Forms A/B). Implements quarantine writes. Does **not** update the live projection, does **not** evaluate alarms, does **not** emit WebSocket events — those are stubbed hooks that later sub-phases fill.

**Deliverables (candidate).**
- new backend source under `apps/backend/src/telemetry/ingestion/` (or equivalent)
- optional in-process simulator adapter
- backend unit tests with mocked Prisma covering accepted / duplicate / conflict / quarantined / rejected outcomes
- `docs/architecture/RVF_Malinois_F4_6B_Telemetry_Ingestion_Foundation_Report.md`

**Acceptance.** All quality gates green. In local dev (with the candidate env flag enabled), a `POST` against the endpoint lands a canonical row.

### 17.3 F4.6C — Live readings projection write path + latest-value endpoint (candidate)

**Scope (candidate).** Fills the projection-upsert hook left by F4.6B. Implements a latest-value endpoint (candidate path `GET /api/v1/telemetry/latest`). Drops the `live_readings_projection` VIEW if F4.6A kept it as a fallback. Optionally updates the F4.5 frontend adapter to consume the new endpoint (can be deferred to a screen migration sub-phase).

**Deliverables (candidate).**
- ingestion-boundary updates (projection upsert sharing the transactional unit)
- new controller + service + frontend types for the latest-value surface
- optional F4.5 adapter update for the new endpoint
- `docs/architecture/RVF_Malinois_F4_6C_Live_Readings_Projection_Report.md`

**Acceptance.** All gates green. Posting a reading via F4.6B's endpoint updates the projection in the same transactional unit.

### 17.4 F4.6D — Alarm evaluation + alarm events + alarm endpoints (candidate)

**Scope (candidate).** Implements an alarm evaluator that shares the ingestion-boundary transactional unit. Implements alarm-event read / acknowledge surfaces (candidate paths `GET /api/v1/alarms/events`, `GET /api/v1/alarms/active`, `POST /api/v1/alarms/events/:id/acknowledge`). Audit-log coverage of acknowledgement transitions. Decides the operational-context lookup mechanism that resolves whether an in-force commissioning snapshot applies to a unit at a given timestamp (F4.6 does not fix this).

**Deliverables (candidate).**
- alarm evaluator
- new alarms read / acknowledge surfaces
- `docs/architecture/RVF_Malinois_F4_6D_Alarm_Evaluation_Report.md`

**Acceptance.** All gates green. A reading crossing a seeded per-unit threshold (e.g. an HP-001 `p_inlet` reading above the seeded high threshold) materializes one `alarm_events` row.

### 17.5 F4.6E — Realtime fan-out / WebSocket updates (candidate)

**Scope (candidate).** Implements per-tenant / per-unit channels in `RealtimeModule`. Emits a sanitized telemetry event after accepted `good` readings and alarm-event lifecycle events after alarm transitions. Channel naming, payload field casing, transport library, and throttle policy are F4.6E decisions. Frontend client wiring is optional in F4.6E; can be deferred.

**Deliverables (candidate).**
- `RealtimeModule` updates
- optional frontend WebSocket client foundation
- `docs/architecture/RVF_Malinois_F4_6E_Realtime_FanOut_Report.md`

**Acceptance.** All gates green. A reading posted via the F4.6B endpoint emits a realtime event a subscribed client can observe.

### 17.6 F4.6F — Closeout

**Scope.** Consolidated closeout report summarizing F4.6A → F4.6E commits, end-state architecture, retired surfaces (the `live_readings_projection` VIEW, the F1 ingestion contracts already deleted in F4.4F), and recommended next phase (probably a screen migration sub-phase that cuts Operations / Units charts off the F2 simulator).

**Deliverables.**
- `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Closeout_Report.md`

**Acceptance.** Documentation-only.

### 17.7 Parallelism

F4.6A is strictly first. F4.6B and F4.6D may overlap on different branches once F4.6A is merged. F4.6C and F4.6E should land after F4.6B and F4.6D respectively. F4.6F is sequential and last.

## 18. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Ingestion endpoint exposed without auth on a non-local environment | medium | high | Build-time env-flag gate (§15.2); endpoint route not registered when `RVF_INGEST_ENABLED` unset; documentation calls it out in F4.6B. |
| Dedup index gap allows duplicate persistence between F4.6A and F4.6B | medium | medium | F4.6A lands the indexes before F4.6B writes any code that calls `prisma.telemetryReading.create`. |
| Live projection drifts from `telemetry_readings` | medium | medium | §11.6 enforces transactional consistency; F4.6C ships a deterministic rebuild query (`INSERT … SELECT DISTINCT ON …`). |
| Alarm evaluator slows ingestion under bulk load | medium | medium | Evaluator runs in the same transaction but is cheap (single `commissioning_snapshots.effective_thresholds` JSONB lookup + math). If profiling shows hot-path cost, F4.6D may move evaluation to a queued worker — but that worker still writes `alarm_events` from the backend, never the frontend. |
| Unbounded `telemetry_ingestion_errors` growth | low | medium | F4.6 sets a retention default (30 days); F4.6B / operator can configure. A future archival job can offload to cold storage. |
| WebSocket flood for high-rate sources | medium | low | §13.4 throttle / coalesce policy; F4.6E picks the knob. DB is unaffected — fan-out is downstream. |
| Mapping resolution ambiguity (`unresolved_sensor`, `unresolved_canonical_tag`) | medium | low | §7.2 resolves via active `SensorTagBinding`; ambiguous cases quarantine, not crash. Operator surface in F4.6D's `telemetry_ingestion_errors` view. |
| TimescaleDB conversion later requires reshaping `telemetry_readings` | low | medium | F4.1 column layout is hypertable-compatible; ADR-007 §4 reaffirms. No reshape needed when conversion happens. |
| Schema additions land but service code regresses an F4.4 endpoint | low | high | F4.6A is migration-only; service code stays untouched. F4.4 endpoint tests continue to pass throughout F4.6A→F. |
| F1 contracts accidentally revived | low | medium | F4.4F's report (§5) records the deletion; F4.6 reviewers reject any PR reintroducing the F1 envelope / `LateTelemetryQuarantine` shape. |
| External tool vendor (ThingsBoard / Node-RED) attempts to assume system-of-record role | low | high | ADR-006, ADR-007, and ADR-008 all reject this. Code review rejects any module pulling in vendor SDKs as the source of business state. |

## 19. Acceptance Criteria

F4.6 is documentation-first. F4.6 (architecture + ADR pair) is considered complete when:

1. This document exists at `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Architecture.md`.
2. ADR-008 exists at `docs/adr/ADR-008_RVF_Malinois_Telemetry_Persistence_Ingestion.md` with status **`Proposed`** (not `Accepted`). The ADR is validated by implementation sub-phases (F4.6A → F4.6F); it does not transition to `Accepted` inside F4.6.
3. The ingestion-boundary **principle** is recorded (§5) — single controlled boundary, controlled entry points, ten allowed `source` values, explicit list of forbidden write paths. Concrete service / class / module / endpoint names are documented as **implementation candidates**, not finalized.
4. The persistence model is recorded (§6) — `telemetry_readings` is the canonical immutable record; corrections do not edit history.
5. The transmitter-first principle is recorded (§3, §6, §7, §11) — every accepted reading anchors to a configured `Sensor` / `TransmitterDevice` on a `MeasurementUnit`; canonical history is never keyed only by browser-display labels.
6. `TelemetryReading` vs `LiveReading` is recorded (§3, §6, §11) — historical telemetry is append-only canonical history; the live projection is derived and rebuildable from history.
7. The mapping seam is recorded (§7) — `IntegrationSource` + `IntegrationMapping` resolve `(tenant, unit, sensor, canonical_tag)`; `canonicalTagName` from untrusted payloads is not honored when a mapping exists.
8. The deduplication principle is recorded (§8) — sequence-based key preferred; timestamp-based fallback; conflicts go to quarantine. Index names / predicates are F4.6A candidates.
9. The late-arrival / quarantine policy is recorded (§9) — a dedicated quarantine surface (candidate name `telemetry_ingestion_errors`) records every non-acceptance outcome with a reason. **No Jobs-specific quarantine reason is used; `inactive_context` is forward-looking only.**
10. The quality vocabulary is recorded (§10) — `good | uncertain | bad`; `suspect` normalizes to `uncertain`; only `good` updates the live projection or triggers alarms by default.
11. The live-readings projection direction is recorded (§11) — converted from VIEW to upsert-maintained candidate table (proposed for F4.6A / F4.6C). Exact shape, key choice, and timing are F4.6A / F4.6C decisions.
12. The alarm-evaluation principle is recorded (§12) — backend-only, conceptually inside the ingestion transactional unit, only fires on `good` readings, reads from `CommissioningSnapshot.effective_thresholds` when an in-force snapshot applies (preserving ADR-005) and from current `alarm_rules` otherwise. **The operational-context lookup mechanism is deferred to F4.6D; F4.6 does not introduce a Jobs flow.**
13. The WebSocket fan-out boundary is recorded (§13) — downstream of persistence and projection; DB is source of truth; loss recoverable by reconnect + REST.
14. The API surface roadmap is recorded (§14) — every path / channel marked as **candidate**, not finalized.
15. The security stance is recorded (§15) — env-flag interim guard, no production auth in F4.6, deferred to a successor ADR.
16. The schema-impact assessment is recorded (§16) — F4.6A schema candidates listed with rationale; **nothing implemented**. F4.6A may later propose schema and migration changes, but **F4.6 does not author any migration or modify any Prisma model**.
17. PostgreSQL is reaffirmed as the baseline canonical database (§1, §16, §18); TimescaleDB and equivalent extensions remain optional optimizations only.
18. RVF Malinois is reaffirmed as the system of record for telemetry persistence, the live projection, the API, the alarm boundaries, and operational data (§1, §3, §5, §15). External tools (ThingsBoard, Node-RED, MQTT, OPC-UA, Modbus, edge gateways, PLCs, historians) may feed data through future adapters but are not the canonical source of truth.
19. The F4.6A → F4.6F proposed roadmap is itemized (§17) with candidate scope, deliverables, and acceptance per sub-phase.
20. **No runtime code is modified.** No backend file changes. No frontend file changes. **No Prisma schema change. No migration added. No seed change.** No package / config file change. No UI change.
21. Jobs and operational-context wiring remain deferred. The F4 schema's `Job` and `CommissioningSnapshot` models exist; F4.6 introduces no Jobs lookup, no active-job state machine, and no Jobs-bound persistence or alarm rules.
22. No commit is created by F4.6.

## 20. Out of Scope

Repeated explicitly so the reader cannot infer F4.6 quietly shipped any of these:

- **Implementation of any kind.** No service, no controller, no migration, no seed, no schema change, no test change, no config change.
- **Jobs and operational-context wiring.** The F4 schema's `Job` and `CommissioningSnapshot` models exist, but F4.6 does **not** introduce a Jobs flow, a Jobs tab, an active-job state machine, a Jobs lookup at ingestion time, or any Jobs-bound persistence / alarm logic. Alarm threshold resolution uses the neutral phrasing "an in-force commissioning snapshot applies to the unit"; the mechanism that decides whether a snapshot is in force is deferred to a later phase (F4.6D or later).
- **Hardware integration.** No MQTT broker. No OPC-UA / Modbus / PLC client. No edge gateway. No historian.
- **Authentication.** ADR-007 §7 stands; F4.6 inherits. Real auth design is deferred to a successor ADR (candidate ADR-009).
- **Production deployment.** No infra. No secrets store choice. No CI/CD wiring.
- **TimescaleDB conversion.** ADR-007 §4 stands. PostgreSQL remains the baseline; TimescaleDB and equivalent extensions are optional optimizations only.
- **Frontend changes.** No Operations / Units / Alarms screen modification. The F4.5 adapters and the F4.5F units-selector migration remain the latest UI changes.
- **Backwards compatibility with F1.** The F1 envelope / `LateTelemetryQuarantine` / `IngestionAdapter` interfaces were deleted in F4.4F (§5 of that report). F4.6 designs against the F4 schema only.
- **Retention / archival policy** beyond the §9.4 30-day quarantine default.
- **Reports / analytics / AI / predictive maintenance.**
- **Client portal exposure.**
- **Replay / correction tooling.** Designed when needed; F4.6 documents the seam but does not implement.
- **ADR-008 transition to `Accepted`.** The ADR remains `Proposed` until implementation sub-phases validate it.

---

*F4.6 architecture closeout. Companion decision: ADR-008 (status: Proposed). Next phase on the implementation track: F4.6A (proposed schema-hardening migration). Parallel allowed: per-screen F4.5G+ frontend migrations against existing F4.4 read endpoints.*
