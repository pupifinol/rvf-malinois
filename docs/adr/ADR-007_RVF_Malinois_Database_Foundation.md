# ADR-007 — RVF Malinois Database Foundation and Canonical Operational Data Model

> Architecture Decision Record — RVF Malinois project.
> Authoritative cumulative copy lives in `RVF_Malinois_Adenda_Arquitectura_ADR_001_007_v1.5.md` (Spanish).
> This file is the standalone English reference, intended for citation from the F4 architecture document and from future technical onboarding.

## 1. Status

Accepted.

## 2. Context

Phases F2, F3, and F3.1 of RVF Malinois established three things in sequence: the frontend telemetry runtime under the normalized stream boundary (ADR-005), the canonical backend / API foundation (ADR-006), and the Units Live Instrument Readings enhancement that preserved the Units / Operations responsibility split.

The platform now operates against a centralized mock and adapter layer at `lib/api-data/` that was a deliberate placeholder: a stable seam designed so a real database could replace the mock without changing the API contract or the frontend. The F4 — Database Foundation Architecture document was approved and added to the repository manually under commit `f36923a` (path: `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md`). That document fixed the operational data model, the database ownership rules, the per-unit configuration model, and the F4.1–F4.6 roadmap.

What remains is to formalize, as a registered decision, the persistence-layer corollary of ADR-006: that RVF Malinois owns a relational database as the canonical system of record, and that no external IoT platform owns business state. ADR-006 settled the ownership question at the platform level; ADR-007 lowers it to the database level and gives the F4 architecture its decision-of-record status.

Three operational facts shape this decision. First, measurement units in RVF's catalog have legitimately different operational envelopes — high-pressure / high-flow units and low-pressure / low-flow units cannot share alarm thresholds. Second, transmitters are physical devices that get calibrated, replaced, and have firmware versions; their traceability matters for audits. Third, telemetry interpretation depends on the configuration in force when the measurement happened (ADR-005); the database must preserve that history through immutable snapshots.

## 3. Decision

RVF Malinois will use its own PostgreSQL-compatible relational database foundation as the canonical system of record for operational configuration, units, sensors, transmitters, canonical tags, sensor–tag bindings, telemetry metadata, telemetry readings, live-reading projections, alarm rules, alarm events, commissioning snapshots, integration metadata, and audit logs.

The database is PostgreSQL-compatible. TimescaleDB is documented as a future optional PostgreSQL extension for high-volume telemetry; it is not an F4 dependency. The schema does not assume hypertables and remains a normal PostgreSQL design that can later be converted without redesign.

External systems — Node-RED, ThingsBoard, AWS IoT Core, Azure IoT Hub, MQTT brokers, OPC-UA bridges, Modbus gateways, edge gateways, industrial historians — may push data into RVF Malinois through the canonical API and the controlled ingestion service. They never write directly to canonical tables. They never own business state. They never own business logic. They participate as auxiliary upstream sources, not as systems of record.

The data model is the one detailed in `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md`, section D, including all twenty-one entities documented there.

## 4. Consequences

### Positive

- **Full ownership of business logic and operational data.** Validation, alarm evaluation, snapshot integrity, and audit are enforced by RVF Malinois at the database boundary.
- **Safer unit-specific configuration.** Each `MeasurementUnit` carries its own `UnitConfiguration`, `UnitOperatingEnvelope`, and `AlarmRule` rows. Global Settings cannot impose a one-size-fits-all envelope on units with different physical capabilities. HP-001 and LP-001 coexist with their own thresholds.
- **Proper auditability.** A single `AuditLog` table records every change to canonical configuration and every operational lifecycle action with `before` / `after` snapshots and a correlation id.
- **No dependency on ThingsBoard or Node-RED as core.** They become optional auxiliary tooling. The platform continues to function when they are absent.
- **Cleaner future API and dashboard consistency.** All consumers (Units, Operations, Alarms, future Reports, future Client Portal read model) read from the same canonical store through the same API.
- **Better historical reproducibility through `CommissioningSnapshot`.** Reports and audits give bit-for-bit reconstruction of how each historical alarm was evaluated, which is what client deliverables require.

### Negative / trade-offs

- **More backend responsibility.** RVF assumes the work of building, maintaining, scaling, backing up, and operating a real database.
- **Schema discipline required.** Every change to canonical entities goes through migrations, versioning, and audit.
- **Migration and versioning governance.** A migration process must be established (Prisma migrations at F4.2) and respected from day one.
- **Telemetry growth planning.** As ingestion grows, indexing, partitioning, and eventually TimescaleDB or equivalent will be necessary. F4 documents the seam; F4.x and later phases address the scaling work.
- **Integration governance.** External integrations require explicit `IntegrationSource` and `IntegrationMapping` records and audit coverage; they cannot be added informally.

## 5. Alternatives Considered

### Alternative A — ThingsBoard as primary database and system of record

ThingsBoard, self-hosted, would own units, sensors, telemetry, alarm rules, and dashboards. RVF Malinois would be a thin layer of custom UI and integrations on top.

**Rejected.** Inverts ADR-006. Couples the product's core data model to a third-party platform's roadmap, vocabulary, and operational model. Makes per-unit configuration and per-tenant isolation harder to enforce. Makes audit trail and operational traceability dependent on what ThingsBoard exposes rather than on what RVF Malinois needs. Vendor lock-in by design.

### Alternative B — Node-RED flows as the operational logic owner

Node-RED flows would hold the rules for unit configuration, alarm evaluation, and data persistence. The database would be whatever Node-RED chooses (often file-based or per-flow ad hoc).

**Rejected.** Node-RED is excellent for edge transformation and rapid prototyping, poor as a system of record. Flows are not auditable as code (they are stored as JSON graphs), business logic embedded in flows is hard to test, and the lack of a strong data model invites schema drift. Node-RED's role is at the edge, not in the core.

### Alternative C — RVF-owned relational database with ThingsBoard / Node-RED as auxiliary tools

RVF Malinois owns its PostgreSQL-compatible database, its canonical API, its ingestion service, and its business logic. ThingsBoard, Node-RED, MQTT, OPC-UA, Modbus, edge gateways and historians integrate as upstream sources or auxiliary tooling, through the canonical API and through controlled `IntegrationSource` / `IntegrationMapping` records, never as direct writers to canonical tables.

**Selected.** This is the only alternative consistent with ADR-006 and with the operational requirements: per-unit independence, audit trail, snapshot-based reproducibility, multi-client isolation, and freedom to deploy with or without any specific third-party platform.

## 6. Rationale

Alternative C aligns with ADR-006 (RVF Malinois as primary platform and system of record) and with the F4 — Database Foundation Architecture document approved under commit `f36923a`. It preserves the boundary established by ADR-005 (the browser talks only to the RVF Malinois backend). It matches the existing Modelo de Dominio, which already proposed PostgreSQL for the catalog and operation tier and a time-series store for telemetry. It makes the per-unit operational independence demanded by the Oil & Gas domain natively expressible: HP-001 and LP-001 carry their own `AlarmRule` rows; the same software serves both without compromising either.

The PostgreSQL-first choice keeps F4 deliverable, testable, and reversible. The TimescaleDB-later note keeps the door open for high-volume telemetry without forcing the schema to assume hypertables before they are needed.

## 7. Scope

### Included (canonical entities owned by RVF Malinois)

- `Tenant` — multi-client root.
- `User` (placeholder) — actor identity until real authentication arrives.
- `EquipmentType` — equipment template (EMMAD, EMGAD).
- `MeasurementUnit` — equipment instance in catalog (EMMAD-01, EMMAD-02).
- `Sensor` — measurement point on a unit.
- `TransmitterDevice` — physical / digital device implementing a sensor; calibration, firmware, replacement history.
- `CanonicalTag` — RVF's fixed measurement vocabulary.
- `SensorTagBinding` — configurable mapping between sensor and canonical tag, effective-dated.
- `UnitConfiguration` — per-unit operational configuration, versioned.
- `UnitOperatingEnvelope` — per-unit operating limits, versioned.
- `AlarmRule` — per-unit, per-tag alarm rule.
- `AlarmThreshold` (placeholder) — reserved for future complex alarms.
- `AlarmEvent` — alarm occurrence with lifecycle `active` → `acknowledged` → `cleared`.
- `TelemetryReading` — canonical persisted telemetry, append-only.
- `LiveReading` (derived projection) — latest per `(unit, sensor)`; not canonical.
- `Well` — well being tested.
- `Job` — deployment of a unit at a well for a period.
- `CommissioningSnapshot` — immutable frozen configuration for a job; source of truth for thresholds during that job.
- `IntegrationSource` (placeholder) — future inbound integration channel.
- `IntegrationMapping` (placeholder) — external identifier to canonical mapping.
- `AuditLog` — single append-only audit table.

### Excluded

- SQL DDL implementation. Belongs to F4.1.
- Prisma schema. Belongs to F4.2.
- Migrations. Belong to F4.2 and the migration governance process.
- Telemetry ingestion implementation. Belongs to F4.6.
- Frontend redesign. F2, F3, and F3.1 deliverables remain preserved.
- ThingsBoard dependency. Auxiliary only, never core.
- Node-RED dependency. Auxiliary only, never core.
- Authentication implementation. `User` is a placeholder until a later phase.
- AI or predictive maintenance.
- TimescaleDB-specific schema constructs (hypertables, continuous aggregates).
- Production deployment, observability, backups, capacity planning.

## 8. Operational Impact

- **Units.** Reads `MeasurementUnit`, `Sensor`, `TransmitterDevice`, `UnitConfiguration`, `UnitOperatingEnvelope`, `AlarmRule` (as configuration view), `CanonicalTag`, `SensorTagBinding`, and the `LiveReading` projection. The Live Instrument Readings panel and SeparatorDiagram value chips delivered in F3.1 migrate from the Units Twin local mock to the canonical model at F4.5.
- **Operations.** Reads `Job` and `CommissioningSnapshot`; consumes telemetry from `TelemetryReading` through the F2 normalized stream contract; alarm evaluation continues to use the snapshot (ADR-005) and stores results in `AlarmEvent`.
- **Alarms.** `AlarmEvent` is now persisted; acknowledgement and clearance survive server restarts; lifecycle queries become straightforward.
- **Settings.** Continues to define platform defaults only. No operating limits, no per-unit thresholds. Settings never writes to `UnitOperatingEnvelope` or `AlarmRule`.
- **Reports (future).** Reconstructs historical reports from `CommissioningSnapshot`, `TelemetryReading`, `AlarmEvent`, and `AuditLog` — all in the canonical database, all traceable.
- **Client Portal (future).** Consumes a read-model derived from the canonical database, filtered for client-appropriate visibility (no internal alarms or diagnostics; production figures only).

## 9. Future Work

- **F4.1.** Schema implementation in PostgreSQL (DDL, primary keys, foreign keys, indexes, enums, constraints).
- **F4.2.** Prisma migration aligned with the F3 TypeScript domain types.
- **F4.3.** Seed and reference data (`EquipmentType`, `CanonicalTag` dictionary, HP-001 / LP-001 example units, sensors, transmitters, bindings, alarm rules including the canonical examples: HP-001 high pressure 4,500 / 5,000 psi; LP-001 high pressure 600 / 750 psi).
- **F4.4.** API adaptation: replace `lib/api-data/` mock adapter with a Prisma-backed implementation. The F3 API contract is unchanged.
- **F4.5.** UI connection: Units Live Instrument Readings and SeparatorDiagram value chips read from the canonical model via the F3 API.
- **F4.6.** Telemetry persistence: `POST /api/telemetry` writes to `TelemetryReading`; the `LiveReading` projection mechanism is implemented; `AlarmEvent` persists across restarts.

Beyond F4, future considerations recorded in the project roadmap include real authentication and roles, database scaling decisions including TimescaleDB if and when telemetry volume justifies it, field-gateway integration, reports and audit-trail UI, and production deployment hardening.

## 10. Related ADRs

- **ADR-001.** No PLC today; PLC anticipated as additional future source. F4 keeps the option open via `IntegrationSource` `kind = 'plc'`.
- **ADR-002.** Data residency as RVF's operational decision. `Tenant.residency_hint` carries the per-tenant setting.
- **ADR-003.** Sensor-to-canonical-tag mapping configurable by the operation. F4 implements this as `SensorTagBinding` with effective-dated rows.
- **ADR-004.** Reusable Well Testing equipment catalog. F4 implements this as `EquipmentType` and `MeasurementUnit`.
- **ADR-005.** F2 framing: snapshot as source of truth, browser boundary, freeze scope. F4 implements `CommissioningSnapshot` as the immutable source of effective thresholds.
- **ADR-006.** RVF Malinois as primary platform and system of record. ADR-007 is its persistence-layer corollary.
- **F4 — Database Foundation Architecture** (`docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md`, commit `f36923a`). ADR-007 is the registered decision under which that architecture is in force.
