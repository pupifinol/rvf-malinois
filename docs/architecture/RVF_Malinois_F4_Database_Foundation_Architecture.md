# RVF Malinois — F4 Database Foundation Architecture

> Architecture specification for Phase F4 of the RVF Malinois project.
> No implementation, no SQL, no Prisma schema, no migrations, no code. This document
> defines the canonical operational data model and the database ownership rules
> under which any later F4.x implementation must operate.

## A. Executive Summary

RVF Malinois has progressed through three foundational phases. F2 established the
frontend telemetry runtime under the normalized stream boundary (ADR-005) and was
hardened by the F2 Final QA Result that gated tag `v0.7-f2-closeout`. F3 delivered
the canonical backend and API foundation (ADR-006) under tag
`v0.8-f3-backend-api-foundation`. F3.1 added live instrument readings on the Units
screen while preserving the Units / Operations responsibility split, under tag
`v0.8.1-f3.1-units-live-readings`. The platform now operates against a centralized
mock and adapter layer at `lib/api-data/` that intentionally postponed the choice
of a real database. F4 closes that gap.

F4 defines the database foundation that RVF Malinois will own as the canonical
system of record for measurement units, sensors, transmitters, canonical tags,
sensor–tag bindings, telemetry, alarm rules and events, commissioning snapshots,
integration metadata, and audit trail. This document is architecture-first by
design: no schema, no migrations, no code. A later sequence (F4.1 through F4.6)
will implement the schema, set up Prisma migrations, seed reference data, connect
the existing API surface to the new persistence layer, wire the UI consumers, and
switch telemetry to persisted storage.

Database ownership is the central question F4 answers. ADR-006 declared RVF
Malinois the primary platform and system of record; F4 lowers that decision to
the persistence layer. The RVF Malinois database holds the canonical truth of
every operational concept the product manages. ThingsBoard, Node-RED, MQTT
brokers, OPC-UA bridges, Modbus gateways, edge gateways and any future industrial
historian remain auxiliary; they may push data through the canonical API and the
controlled ingestion service, but they do not own business state, and they do not
write directly to RVF Malinois tables.

## B. Architectural Context

F4 builds on three closures and must remain consistent with each of them.

**F2 — Telemetry runtime foundation.** Closed under `v0.7-f2-closeout`. Established
the normalized telemetry contract, the frontend realtime store, the alarm
evaluator (pure logic, fed by snapshot thresholds), the stale/offline detector,
and the `BackendWebSocketTelemetryAdapter` that already expects a real backend
on the other side. The F2 Final QA Result confirmed that the singleton invariants
hold (one production `TelemetryStore`, one ref-counted runtime, adapter
construction limited to `adapterFactory.ts`), that no industrial protocols are
imported in the frontend, and that every code path producing an alarm result
carries the literal `thresholdsSource: 'commissioning_snapshot'`. F4 puts a real
persistence layer under that backend without changing the contract the frontend
sees.

**F3 — Backend / API foundation.** Closed under `v0.8-f3-backend-api-foundation`.
Defined the canonical API surface (health, units, sensors, alarms, telemetry
endpoints), eight TypeScript domain types, validation rules at the boundary, the
flat adapter layer at `lib/api-data/`, and the QA practice that gates each phase.
F4 replaces the mock adapter implementation with a database-backed one without
changing the API contract.

**F3.1 — Units Live Instrument Readings.** Closed under
`v0.8.1-f3.1-units-live-readings`. Reinforced the UI responsibility split: Units
shows the current state of every instrument; Operations shows trends and
production behavior. F4 must ensure the data model supports the live-reading
projection cleanly without inviting Units to drift back into trend territory.

### Vocabulary reconciliation

Earlier project documents use one vocabulary; the F4 brief introduces additional
terms. To avoid duplicate entities, the F4 vocabulary maps to the project's
canonical entities as follows. This mapping is binding for the rest of F4.

| F4 vocabulary | Canonical project entity | Notes |
|---|---|---|
| `EquipmentType` | Equipment template (ADR-004) | EMMAD, EMGAD; defines which loops a class brings |
| `MeasurementUnit` | Equipment instance in catalog (ADR-004) | EMMAD-01, EMMAD-02; the unit of F4 |
| `Sensor` | Sensor of the equipment | Belongs to one `MeasurementUnit`; logical measurement point |
| `Transmitter` / `TransmitterDevice` | Separate physical device | Belongs to one `Sensor`; carries calibration, firmware, replacement history |
| `CanonicalTag` | Canonical tag dictionary (ADR-003) | `p_inlet`, `q_gas`; fixed, RVF-owned |
| `SensorTagBinding` | Sensor → canonical tag mapping (ADR-003) | Configurable; effective-dated |
| `UnitConfiguration` | Per-unit operational configuration | Versioned; auditable |
| `UnitOperatingEnvelope` | Per-unit operating limits | Per-unit max pressure, max flow, etc. |
| `AlarmRule` | Per-unit, per-tag alarm rule | Per ADR-005 |
| `CommissioningSnapshot` | Snapshot at commissioning (ADR-003/004/005) | Immutable; source of truth for effective thresholds during a job |

### Entity relationship overview

```
EquipmentType (template)
   |
   v
MeasurementUnit (catalog instance: EMMAD-01)
   |  has many
   v
Sensor (measurement point on the unit)
   |  has current device (history preserved)
   v
Transmitter (physical device implementing the Sensor)

CanonicalTag (fixed dictionary: p_inlet, q_gas, ...)
   |  bound by
   v
SensorTagBinding (which sensor maps to which canonical tag, per ADR-003)

MeasurementUnit
   |  has
   v
UnitConfiguration       (live operational config; enabled sensors, mappings)
   v
UnitOperatingEnvelope   (per-unit operating limits)

AlarmRule (per unit and per canonical tag, per ADR-005)
   |  produces
   v
AlarmEvent (lifecycle: active -> acknowledged -> cleared)

TelemetryReading     <- canonical persisted telemetry
   |  projected as
   v
LiveReading          <- latest per (unit, sensor); not canonical, derived

Well (catalog) -- Job -- CommissioningSnapshot (immutable; frozen rules)

IntegrationSource / IntegrationMapping  (placeholders; auxiliary push paths)

AuditLog (one append-only table)
```

The dashboards consume this model exclusively through the F3 API:

- **Units** reads `MeasurementUnit`, `Sensor`, `Transmitter`, `UnitConfiguration`, `UnitOperatingEnvelope`, `AlarmRule` (as defaults), `CanonicalTag`, `SensorTagBinding`, and the `LiveReading` projection.
- **Operations** reads `Job` / `CommissioningSnapshot` and `TelemetryReading` time series, evaluating alarms via the alarm evaluator against the snapshot.
- **Alarms** reads `AlarmEvent` and its lifecycle.
- **Settings** reads and writes platform defaults only; never per-unit operating thresholds.
- **Reports (future)** reconstructs historical state from `TelemetryReading` + `CommissioningSnapshot` + `AlarmEvent` + `AuditLog`.
- **Client Portal (future)** consumes a filtered read-model derived from the canonical database; no internal alarms, no diagnostics.

## C. Database Ownership Model

The RVF Malinois database is the canonical store. Every business-meaningful entity
listed in section D is owned by RVF Malinois. Ownership means three things:

1. The schema, constraints, and validation rules of these entities are decided and enforced by RVF Malinois, not by an external IoT platform.
2. Writes to these tables happen exclusively through the RVF Malinois API and the controlled ingestion service. No external system (ThingsBoard, Node-RED, MQTT, OPC-UA, Modbus, edge gateway, historian) writes directly to canonical tables.
3. Reads outside of RVF Malinois may exist (export, analytics, third-party dashboards), but those readers go through the API or through explicit, controlled database views, not against canonical tables in arbitrary ways.

**Canonical (owned by RVF Malinois):** tenants, users (placeholder), measurement
units, equipment types, sensors, transmitter devices, canonical tags, sensor–tag
bindings, unit configurations, unit operating envelopes, alarm rules, alarm
thresholds (placeholder), alarm events, telemetry readings, wells, jobs,
commissioning snapshots, integration sources (placeholder), integration mappings
(placeholder), audit logs.

**Auxiliary (may exist outside, not canonical):** edge transformations performed
by Node-RED, MQTT broker topology, ThingsBoard dashboards used internally as
legacy tooling, historian buffers used by external systems, PLC register maps
maintained at the gateway level. These are operational tooling, never the source
of truth.

## D. Proposed Domain Data Model

Each entity below is described conceptually: purpose, key fields (not full
schema), relationships, presence in F4 (required vs placeholder vs future), and
the operational reason it exists.

### Tenant

- **Purpose.** Multi-client root. Every other canonical entity belongs, directly or transitively, to exactly one Tenant.
- **Key fields.** `id`; `name`; `status`; `residency_hint` (per ADR-002); timestamps.
- **Relationships.** Owns users, measurement units, wells, alarm rules, alarm events, telemetry readings, audit logs.
- **F4 status.** Required.
- **Operational reason.** Multi-client isolation must be enforced at the database layer from day one; retrofitting tenancy later is significantly harder.

### User (placeholder)

- **Purpose.** Identity of the actor performing actions. Pre-auth placeholder until real authentication is introduced.
- **Key fields.** `id`; `tenant_id`; `display_name`; `role` (placeholder); `status`; timestamps.
- **Relationships.** Referenced by `AuditLog.actor_id`; later by access scopes.
- **F4 status.** Placeholder. The table exists; rows are static seed (`system`, `admin`) until real authentication arrives.
- **Operational reason.** `AuditLog` needs an actor foreign key; introducing it retrospectively is painful.

### EquipmentType

- **Purpose.** Template for a class of equipment (EMMAD, EMGAD). Per ADR-004, defines which loops a class brings.
- **Key fields.** `id`; `name`; `description`; `default_sensor_template`; `pid_reference`; timestamps.
- **Relationships.** Has many `MeasurementUnit`.
- **F4 status.** Required.
- **Operational reason.** New equipment instances are commissioned from a template; without `EquipmentType`, every unit registration repeats the same instrumentation declaration.

### MeasurementUnit

- **Purpose.** A physical, reusable unit of measurement equipment in RVF's catalog (EMMAD-01, EMMAD-02, EMGAD-01). The unit of the F4 vocabulary.
- **Key fields.** `id`; `tenant_id`; `equipment_type_id`; `code`; `serial_number`; `name`; `status` (`active`, `inactive`, `offline`, `maintenance`); `operating_profile` (`high_pressure_high_flow`, `medium`, `low`, `custom`); `location`; timestamps.
- **Relationships.** Belongs to one `EquipmentType`; has many `Sensor`; has one current `UnitConfiguration` and one current `UnitOperatingEnvelope` (with history rows); referenced by `Job`, `CommissioningSnapshot`, `AlarmRule`.
- **F4 status.** Required.
- **Operational reason.** Central operational asset. Every measurement, alarm and report ties back to a `MeasurementUnit`.

### Sensor

- **Purpose.** A measurement point installed on a `MeasurementUnit`. The logical concept "the pressure transmitter at the inlet of EMMAD-01".
- **Key fields.** `id`; `tenant_id`; `unit_id`; `type` (`pressure`, `temperature`, `flow`, `vibration`, `volume`, `level`, `gas_composition`, `digital_status`); `name`; `instrument_tag` (P&ID reference such as PIT-003); `enabled`; `min_range`; `max_range`; `engineering_unit`; timestamps.
- **Relationships.** Belongs to one `MeasurementUnit`; has one current `Transmitter` (with history); bound to one `CanonicalTag` through `SensorTagBinding`; referenced by `AlarmRule`.
- **F4 status.** Required.
- **Operational reason.** The sensor is the logical handle that survives transmitter replacement. If a transmitter is swapped, the sensor's identity, its canonical-tag binding, and its history remain intact.

### Transmitter (TransmitterDevice)

- **Purpose.** The physical / digital device that implements a `Sensor`. Separate entity because transmitters get replaced, calibrated, and reconfigured, and that lifecycle must be auditable independently of the logical sensor.
- **Key fields.** `id`; `tenant_id`; `sensor_id`; `serial_number`; `manufacturer`; `model`; `protocol` (`4-20mA`, `HART`, `Modbus`, `OPC-UA`, `wireless`); `signal_type`; `modbus_address` (nullable); `register_map_reference` (nullable); `channel` (nullable); `firmware_version`; `calibration_date`; `calibration_range_min`; `calibration_range_max`; `calibration_reference`; `battery_status` (nullable, wireless only); `installation_status` (`installed`, `removed`, `on_bench`, `replaced`); `installed_at`; `removed_at` (nullable); timestamps.
- **Relationships.** Belongs to exactly one `Sensor` at a time; one-to-many over history (a sensor has had multiple transmitters); replacement history is captured by transmitter rows with non-null `removed_at`.
- **F4 status.** Required.
- **Operational reason.** Oil & Gas operations need physical traceability of who replaced this transmitter, when, with what calibration record, with what firmware version. Modeling the transmitter as a sensor attribute would collapse that history and make audits painful.

### CanonicalTag

- **Purpose.** RVF's fixed vocabulary of measurement variables (`p_inlet`, `t_gas_out`, `q_liquid`, `water_cut`, `level`). Per ADR-003, owned by RVF; the dictionary grows carefully but the meaning of an existing tag never changes.
- **Key fields.** `id`; `name`; `display_name`; `canonical_unit`; `category`; `precision`; `description`; `deprecated` (boolean); timestamps.
- **Relationships.** Referenced by `SensorTagBinding` and `AlarmRule`.
- **F4 status.** Required.
- **Operational reason.** Without a canonical dictionary, the same physical variable gets different names across units, integrations and reports. The dictionary is what makes alarms and reports talk to each other.

### SensorTagBinding

- **Purpose.** Per ADR-003, the configurable mapping between a sensor and a canonical tag.
- **Key fields.** `id`; `tenant_id`; `sensor_id`; `canonical_tag_id`; `effective_from`; `effective_to` (nullable); timestamps.
- **Relationships.** Belongs to a `Sensor` and a `CanonicalTag`; bindings have history (re-bindings close the previous row by setting `effective_to`, and a new row is created).
- **F4 status.** Required.
- **Operational reason.** Configurable seam ADR-003 made explicit. Without it, the mapping lives in code or in a config file and becomes the kind of magic that breaks reports later.

### UnitConfiguration

- **Purpose.** The live operational configuration of a `MeasurementUnit`: which sensors are enabled, engineering-unit overrides, display precision overrides, calibration metadata references. Distinct from the operating envelope, which is about limits.
- **Key fields.** `id`; `tenant_id`; `unit_id`; `version` (monotonic); enabled sensors (via child rows or array); `engineering_unit_overrides` (per canonical tag, optional); `display_precision_overrides` (optional); `is_current`; `created_by`; `created_at`.
- **Relationships.** Belongs to one `MeasurementUnit`; new rows are written rather than updated (history preserved); only one row per unit has `is_current = true`.
- **F4 status.** Required.
- **Operational reason.** Configurations change. Recording every change as a new row (immutable history) gives auditability and supports reverting to a previous state if needed.

### UnitOperatingEnvelope

- **Purpose.** Per-unit operating limits that define what is physically and operationally safe for this specific unit. Different units have different envelopes; HP units are not bounded the same as LP units.
- **Key fields.** `id`; `tenant_id`; `unit_id`; `version`; `max_pressure`; `max_flow_rate`; `max_temperature`; `max_vibration`; `max_differential_pressure`; `max_volume` (nullable); `max_gas_rate` (nullable); `engineering_unit_set`; `is_current`; `created_by`; `created_at`.
- **Relationships.** Belongs to one `MeasurementUnit`; history preserved like `UnitConfiguration`.
- **F4 status.** Required.
- **Operational reason.** Per ADR-005: global Settings cannot impose a single envelope on all units. HP-001 and LP-001 have legitimately different operational envelopes; the database must reflect that.

### AlarmRule

- **Purpose.** Per ADR-005, the per-unit, per-tag alarm rule. "On EMMAD-01, when `p_inlet` exceeds 4,500 psi, raise a high alarm."
- **Key fields.** `id`; `tenant_id`; `unit_id`; `canonical_tag_id`; `severity` (`info`, `warning`, `critical`); `enabled`; `low_low_threshold` (nullable); `low_threshold` (nullable); `high_threshold` (nullable); `high_high_threshold` (nullable); `deadband`; `delay_seconds`; `message_template`; `version`; `is_current`; `created_by`; `created_at`.
- **Relationships.** Belongs to one `MeasurementUnit` and one `CanonicalTag`; history preserved; copied into `CommissioningSnapshot` at job commissioning.
- **F4 status.** Required.
- **Operational reason.** Per ADR-005, alarm thresholds are per-unit and per-tag, never global. This entity is where the per-unit configuration lives in the database.

### AlarmThreshold

- **Purpose.** A normalized child of `AlarmRule` for cases that need more than the four standard thresholds (multi-step alarms, rate-of-change, hysteresis variants).
- **Key fields.** `id`; `alarm_rule_id`; `kind` (`low_low`, `low`, `high`, `high_high`, `rate_of_change`); `value`; `deadband`; `delay_seconds`.
- **F4 status.** Placeholder. The simple `AlarmRule` fields cover all current cases; `AlarmThreshold` is reserved so future complex alarms have a place to live without restructuring.
- **Operational reason.** Documenting the seam now prevents force-fitting complex alarms into `AlarmRule` columns later.

### AlarmEvent

- **Purpose.** An actual alarm occurrence. Lifecycle: `active` → `acknowledged` → `cleared`.
- **Key fields.** `id`; `tenant_id`; `unit_id`; `canonical_tag_id`; `alarm_rule_id` (reference); `severity` (copy); `triggered_value`; `threshold_violated` (kind); `state` (`active`, `acknowledged`, `cleared`); `first_triggered_at`; `acknowledged_at` (nullable); `acknowledged_by` (nullable, FK to `User`); `cleared_at` (nullable); `job_id` (nullable, FK to `Job`); `rule_snapshot` (jsonb copy of the rule at trigger time).
- **Relationships.** Belongs to `Tenant`, `MeasurementUnit`, `CanonicalTag`, `AlarmRule` (reference), optionally `Job`.
- **F4 status.** Required.
- **Operational reason.** Reports and audit need the full lifecycle of every alarm, with a snapshot of the rule that triggered it, so that re-reading historical alarms always reflects the rule that was in force when they fired.

### TelemetryReading

- **Purpose.** The canonical persisted telemetry. One row per (timestamp, unit, sensor or canonical tag, value). High volume. Append-only.
- **Key fields.** `id`; `tenant_id`; `unit_id`; `sensor_id`; `canonical_tag_id`; `timestamp` (ISO UTC); `value` (numeric); `engineering_unit`; `quality` (`good`, `uncertain`, `bad`); `source` (`mock`, `manual`, `field_gateway`, `historian`, `plc`, `mqtt`, `node_red`, `opc_ua`, `modbus`, `edge_gateway`); `ingestion_id`; `sequence` (optional); `job_id` (nullable).
- **Relationships.** Belongs to `Tenant`, `MeasurementUnit`, `Sensor`, `CanonicalTag`, optionally `Job`.
- **F4 status.** Required.
- **Operational reason.** Historical truth of every measurement the platform has accepted. Append-only.
- **Storage note.** Plain PostgreSQL table with an index on `(unit_id, canonical_tag_id, timestamp DESC)`. TimescaleDB hypertables are a future optional optimization; not an F4 requirement.

### LiveReading (derived projection)

- **Purpose.** The latest reading per `(unit, sensor)`. Derived, not canonical. Powers the Units screen Live Instrument Readings panel and SeparatorDiagram value chips delivered in F3.1.
- **Logical fields.** `unit_id`; `sensor_id`; `canonical_tag_id`; `timestamp`; `value`; `engineering_unit`; `quality`.
- **Implementation options.** (a) PostgreSQL view over `TelemetryReading`; (b) materialized view refreshed by ingestion; (c) projection table updated by upsert on each ingest; (d) application cache.
- **F4 status.** Placeholder. The concept is fixed; the implementation choice happens at F4.6.
- **Operational reason.** Treating `LiveReading` as canonical risks divergence from `TelemetryReading`. Keeping it as a projection guarantees the canonical historical record remains the source of truth.

### Well

- **Purpose.** A well being tested. From the existing Modelo de Dominio. Catalog-style.
- **Key fields.** `id`; `tenant_id`; `client_id` (if distinct from tenant); `name`; `field_or_site`; `location`; `type`; `fluid`; `design_limits` (reference); timestamps.
- **Relationships.** Has many `Job`.
- **F4 status.** Required.
- **Operational reason.** The well is the operational subject; jobs test wells using measurement units.

### Job

- **Purpose.** A unit of work: deploying a `MeasurementUnit` at a `Well` for a period.
- **Key fields.** `id`; `tenant_id`; `well_id`; `unit_id`; `commissioning_snapshot_id`; `engineer` (FK to `User`); `status` (`programmed`, `in_progress`, `closed`); `started_at`; `closed_at`; timestamps.
- **Relationships.** Belongs to one `Well`, one `MeasurementUnit`, one `CommissioningSnapshot`; referenced by `TelemetryReading` and `AlarmEvent`.
- **F4 status.** Required.
- **Operational reason.** Telemetry belongs to a job (Modelo de Dominio rule). Without `Job`, telemetry has no historical interpretation context.

### CommissioningSnapshot

- **Purpose.** The immutable, frozen configuration at the moment a unit was commissioned for a specific job. Per ADR-005, the source of truth for effective alarm thresholds during that job.
- **Key fields.** `id`; `tenant_id`; `job_id`; `unit_id`; `taken_at`; `effective_thresholds` (jsonb copy of all alarm rules for the unit at that time); `sensor_mappings` (jsonb copy of `SensorTagBinding` rows); `engineering_envelope` (jsonb copy of `UnitOperatingEnvelope`); `rule_versions` (references to source rows); `immutable` flag.
- **Relationships.** Belongs to a `Job` and a `MeasurementUnit`. Immutable from creation.
- **F4 status.** Required.
- **Operational reason.** Per ADR-005, alarm evaluation during a job uses the snapshot, not the current rule. This guarantees historical reproducibility for client deliverables.

### IntegrationSource

- **Purpose.** A placeholder for a future inbound integration channel: MQTT, Node-RED, ThingsBoard, OPC-UA, Modbus, edge gateway, manual entry, historian.
- **Key fields.** `id`; `tenant_id`; `kind`; `name`; `status` (`active`, `inactive`); `config` (jsonb, opaque per kind); `credentials_reference` (nullable; secrets stored externally); timestamps.
- **Relationships.** Has many `IntegrationMapping`; produces `TelemetryReading` rows (each carries `source`).
- **F4 status.** Placeholder. No integration is implemented in F4.
- **Operational reason.** Documenting the seam early prevents ingestion code from inventing its own ad hoc tables later.

### IntegrationMapping

- **Purpose.** Translation rules from the integration source's vocabulary to the canonical model.
- **Key fields.** `id`; `tenant_id`; `integration_source_id`; `external_identifier`; `unit_id`; `sensor_id`; `canonical_tag_id`; `engineering_unit_override` (nullable); `transformation_reference` (nullable); `enabled`; timestamps.
- **F4 status.** Placeholder.
- **Operational reason.** External vocabularies must be translated into the canonical model at a controlled boundary; this is that boundary.

### AuditLog

- **Purpose.** One append-only table that records every change to canonical configuration and every operational action that needs traceability.
- **Key fields.** `id`; `tenant_id`; `actor_id` (FK to `User`; system rows allowed); `action` (`created`, `updated`, `deleted`, `acknowledged`, `calibrated`, `replaced`); `entity_type`; `entity_id`; `before` (jsonb, nullable for creations); `after` (jsonb, nullable for deletions); `correlation_id`; `ip_address` (nullable); `user_agent` (nullable); `at` (timestamp).
- **F4 status.** Required.
- **Operational reason.** Audit is the foundation of operational trust. One central table avoids fragmenting audit data across per-entity tables and keeps audit queries uniform.
- **Actions covered.** Changes to `UnitConfiguration`, `UnitOperatingEnvelope`, `AlarmRule`, `AlarmThreshold`, `Sensor`, `Transmitter`, `IntegrationMapping`, `CanonicalTag`, `SensorTagBinding`; `AlarmEvent` acknowledgement and clearance; user / admin actions once authentication exists.

## E. Unit-Specific Configuration Model

This section reinforces the rule whose violation would break the platform's
promise to its operators: every measurement unit has independent operational
configuration.

### The five layers

1. **Global Settings (platform defaults only).** Application-level defaults: display preferences, default precision, default time zone. Settings does not define per-unit operating limits and does not define alarm thresholds. Settings is platform configuration, not operational configuration.
2. **MeasurementUnit (catalog nominal capabilities).** Manufacturer-derived design ranges, nominal ratings, maximum operating pressure as built. This is what the unit can withstand by design, not what it should currently be operated at.
3. **UnitConfiguration (live operational config).** Which sensors are enabled, engineering-unit display preferences, calibration metadata references, integration-mapping references. Versioned, audited.
4. **UnitOperatingEnvelope (per-unit operating limits).** The current operational envelope: `max_pressure`, `max_flow_rate`, `max_temperature`, `max_vibration` that this specific unit is expected to operate within. Versioned, audited.
5. **AlarmRule (per-unit, per-tag alarm thresholds).** The actual numeric thresholds at which alarms fire on this unit for this canonical tag. Versioned, audited. Frozen into `CommissioningSnapshot` for active jobs.

### What this prevents

- A global "high pressure alarm at 4,500 psi" cannot be applied uniformly. HP-001 has a 4,500 / 5,000 envelope; LP-001 has a 600 / 750 envelope. Both are correct for their respective units. The platform must store and respect both.
- A change to one unit's threshold cannot accidentally affect another unit's threshold. `AlarmRule` rows are independent; there is no shared global record.
- A change to Settings cannot retroactively change a unit's operating envelope. Settings does not write to `UnitOperatingEnvelope`.

### Effective resolution at evaluation time

Per ADR-005, effective thresholds for alarm evaluation during a job come from the
`CommissioningSnapshot` of that job, not from the current `AlarmRule`. The F2
Final QA Result confirmed that every code path producing an alarm result carries
the literal `thresholdsSource: 'commissioning_snapshot'`, and that the WebSocket
adapter rejects any inbound alarm whose `thresholdsSource` differs. F4 preserves
this invariant by persisting both: `AlarmRule` represents the configurable state;
`CommissioningSnapshot` represents the frozen state for an in-flight or closed
job.

## F. Telemetry Storage Strategy

Five conceptual layers, all in PostgreSQL for F4. TimescaleDB is a future
optional extension.

1. **Raw telemetry frames (not persisted as canonical).** Whatever arrives at the ingestion service before normalization. Held in memory or in a short-lived staging buffer; not part of the canonical model. Future integrations may persist raw frames for debug; auxiliary, not canonical.
2. **Normalized `TelemetryReading` (canonical, persisted).** Each row: tenant, unit, sensor, canonical_tag, timestamp, value, engineering_unit, quality, source, optional job. Append-only. Historical truth.
3. **`LiveReading` (derived projection).** Latest per `(unit, sensor)`. Implemented as a view, materialized view, or upsert table at F4.6; not canonical.
4. **Historical reads.** Range queries over `TelemetryReading` with filters (unit, canonical_tag, time range). Indexed on `(unit_id, canonical_tag_id, timestamp DESC)`. For large windows, downsampled queries will be needed; F4 documents the need, F4.x implements the downsampling helpers.
5. **Aggregated readings (future).** Hourly, daily averages and statistics. Documented as future consideration; PostgreSQL materialized views early; TimescaleDB continuous aggregates if and when volume warrants it.

### Why PostgreSQL only in F4

PostgreSQL is the formal F4 foundation. TimescaleDB is documented as a future
optional PostgreSQL extension; F4 does not assume it, does not require it, and
does not design the schema around hypertables. The `TelemetryReading` table is a
normal PostgreSQL table with indexing; if and when TimescaleDB is introduced,
the table can be converted to a hypertable without redesigning the schema.

## G. Alarm Data Model

Three layers that together implement ADR-005 at the database level.

### Layer 1 — AlarmRule (the rule)

The configurable per-unit, per-tag alarm rule. `AlarmRule` rows are versioned.
Fields cover four standard thresholds (`low_low`, `low`, `high`, `high_high`),
severity (`info`, `warning`, `critical`), deadband for hysteresis, `delay_seconds`
for debouncing, and a message template. The `AlarmThreshold` child table is
reserved as a placeholder for future complex cases.

### Layer 2 — CommissioningSnapshot (the frozen rule for a job)

When a job is commissioned, the current `AlarmRule` rows for the unit are copied
into the snapshot's `effective_thresholds` (jsonb). The snapshot is immutable.
Alarm evaluation during the job reads thresholds from the snapshot, not from the
live `AlarmRule` table.

### Layer 3 — AlarmEvent (the occurrence)

Each occurrence creates an `AlarmEvent` row with the triggered value, the
threshold kind violated, the lifecycle state, and a `rule_snapshot` (jsonb copy
of the rule fields at trigger time, redundant with the commissioning snapshot
but useful for off-job alarms and forensic queries).

### Acknowledgement and lifecycle

State transitions: `active` → `acknowledged` (with `acknowledged_by` and
`acknowledged_at`) → `cleared` (with `cleared_at`). Each transition also
produces an `AuditLog` row. Persisted acknowledgement is in F4; the in-memory
F2C acknowledgement is replaced cleanly by writes to `AlarmEvent` at F4.x
without changing the UI.

### Severity vs visual state

Per the F2 design, `AlarmEvent.severity` is the data; the UI's visual
representation (color, pulse) is the consumer's responsibility. F4 does not
encode visual semantics in the database.

## H. Audit and Traceability

One table, `audit_log`, append-only, polymorphic on `entity_type`. Implementation
rules:

- Every write to a canonical entity from the API produces an audit row in the same transaction.
- `before` and `after` are stored as jsonb snapshots of the affected entity (or the relevant subset).
- `actor_id` is required; system actions use a reserved system user row.
- `correlation_id` ties multiple audit rows that come from one logical operation (for example, commissioning writes to `UnitConfiguration`, `UnitOperatingEnvelope`, and `AlarmRule` together).
- `ip_address` and `user_agent` are optional but recorded when known.
- `AuditLog` rows are never updated or deleted. Retention is handled at the storage layer (partitioning, archival) when volume requires it.

Why one table: per-entity audit tables are simpler to write but pay a heavy cost
in queryability and consistency. A central `audit_log` gives uniform queries and
a single source for compliance reports.

## I. Integration Readiness

External systems may participate as data sources or auxiliary tooling. The F4
model accommodates them through `IntegrationSource` and `IntegrationMapping`.
The rules are firm:

1. **Integrations push through the ingestion service, never directly to canonical tables.** Ingestion validates, normalizes, and writes; integrations propose, RVF Malinois disposes.
2. **Every `TelemetryReading` carries `source`.** `mqtt`, `node_red`, `thingsboard`, `opc_ua`, `modbus`, `edge_gateway`, `plc`, `manual`, `historian`. Provenance is traceable from any row back to the integration that produced it.
3. **Mappings are explicit.** `IntegrationMapping` rows translate external identifiers to canonical `(unit, sensor, canonical_tag)` triples. Mapping changes are audited.
4. **Credentials are referenced, not stored inline.** A future credential store holds secrets; `IntegrationSource` references it.
5. **Failure modes are logged.** Ingestion failures (validation errors, unknown mapping, sensor disabled) generate `AuditLog` rows under the system actor.

What this excludes by design: a flow where Node-RED writes directly into
`TelemetryReading`; a flow where ThingsBoard owns the `AlarmRule` table; a flow
where an MQTT broker pushes to a custom schema that bypasses canonical entities.

## J. Migration and Implementation Strategy

F4 is architecture-first. The following roadmap is recommended for the
implementation work that will follow this document's approval. None of it is
included in F4 itself.

- **F4.1 — Schema implementation.** PostgreSQL DDL: tables, primary keys, foreign keys, indexes, enum types, constraints. No data, no application code.
- **F4.2 — Prisma migration.** Prisma schema modeling the entities described in section D; migrations; alignment with the existing TypeScript domain models established in F3.
- **F4.3 — Seed and reference data.** `EquipmentType` (EMMAD, EMGAD); `CanonicalTag` dictionary; HP-001 and LP-001 example units with their sensors, transmitters, bindings; per-unit `AlarmRule` rows including the canonical examples (HP-001 high pressure 4,500 / 5,000 psi; LP-001 high pressure 600 / 750 psi).
- **F4.4 — API adaptation.** Replace `lib/api-data/` mock adapter functions with Prisma-backed implementations. The F3 API surface does not change. Contract tests verify identical behavior.
- **F4.5 — UI connection.** Wire the Units Live Instrument Readings panel and SeparatorDiagram value chips to the persisted live-reading projection through `GET /api/sensors?unitId=...` and `GET /api/telemetry/latest?unitId=...`. The Units Twin local mock from F3.1 is retired.
- **F4.6 — Telemetry persistence.** `POST /api/telemetry` writes to `TelemetryReading`; the `LiveReading` projection mechanism is chosen and implemented; `AlarmEvent` lifecycle persists across server restarts.

Order is meaningful: schema before Prisma, Prisma before seed, seed before API
change, API change before UI, UI before telemetry persistence. Each step must
pass lint, typecheck, tests, build, and a smoke pass over Operations, Alarms,
Units and Client Portal, in line with the QA discipline established by the F2
Final QA Result.

## K. Risks and Design Considerations

- **Overcoupling to ThingsBoard.** Mitigated by ADR-006 and by section I. Any temptation to let ThingsBoard own `AlarmRule` or `LiveReading` must be refused.
- **Global thresholds incorrectly applied.** Mitigated by section E and by the absence of any "global `AlarmRule`" entity. Settings cannot reach `AlarmRule`.
- **Lack of audit trail.** Mitigated by `AuditLog` as a required entity from F4.1.
- **Mixing raw telemetry with business state.** Raw frames live outside canonical; normalized readings live in `TelemetryReading`; live values are derived projections.
- **Poor tag naming discipline.** Mitigated by `CanonicalTag` as a governed dictionary with a `deprecated` flag instead of deletion.
- **Future scaling challenges.** Mitigated by indexing `TelemetryReading` correctly and by leaving TimescaleDB as a documented future option.
- **Inconsistent engineering units.** Mitigated by `CanonicalTag.canonical_unit` as the source of truth, with per-unit display overrides only.
- **Calibration traceability gaps.** Mitigated by `Transmitter` as a separate entity with calibration metadata, replacement history, and audit coverage.
- **Snapshot drift.** Mitigated by `CommissioningSnapshot` being strictly immutable and by alarm evaluation reading from snapshot during jobs.
- **Integration vocabulary drift.** Mitigated by `IntegrationMapping` being explicit and audited.

## L. Acceptance Criteria for F4 Architecture

F4 architecture documentation is complete when:

1. The vocabulary mapping is present and unambiguous in section B.
2. Every entity in section D has purpose, key fields, relationships, F4 status, and operational reason.
3. The five-layer per-unit configuration model in section E is documented; the rule "Settings cannot define operating limits or alarm thresholds" is explicit.
4. PostgreSQL is fixed as the F4 storage foundation; TimescaleDB is marked as future optional extension.
5. `Transmitter` is modeled as a separate entity with calibration, firmware, and replacement-history fields.
6. `LiveReading` is documented as a derived projection, not as a canonical entity.
7. `AuditLog` is documented as a single append-only table with the action and entity-type coverage listed in section H.
8. `IntegrationSource` and `IntegrationMapping` are documented as placeholders, with the firm rule that integrations write only through the ingestion service.
9. The F4.1–F4.6 roadmap is listed in section J, without code.
10. ADR-005 invariants are preserved: thresholds come from `CommissioningSnapshot` during a job; the browser boundary is untouched.

## M. Out of Scope

- No authentication implementation. `User` exists as a placeholder for `AuditLog`.
- No frontend redesign. F2, F3 and F3.1 deliverables remain preserved.
- No live telemetry ingestion implementation.
- No ThingsBoard, Node-RED, AWS IoT, Azure IoT, MQTT, OPC-UA, Modbus, PLC, or historian connection in F4.
- No production deployment, observability, backups, or capacity planning.
- No physical sensor or transmitter integration.
- No historical analytics dashboard.
- No AI or predictive maintenance.
- No SQL DDL, no Prisma schema, no migrations, no application code. All implementation work happens in F4.1 and beyond.
