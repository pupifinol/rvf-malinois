# ADR-006 — RVF Malinois as Primary Platform and System of Record

> Architecture Decision Record — RVF Malinois project.
> Authoritative copy lives in `RVF_Malinois_Adenda_Arquitectura.md` (v1.4, Spanish).
> This file is the standalone English reference, intended for citation from the F3 backend / API foundation document and from future technical onboarding.

## Status

Accepted

## Date

2026-05-24

## Decides

RVF Soluciones Energéticas C.A.

## Related

Reinforces ADR-001 (no PLC today; PLC anticipated as additional future source) and ADR-005 (browser boundary, snapshot as source of truth, freeze scope). Frames Phase F3 (Backend / API Foundation).

## Context

Phases F1 and F2 of RVF Malinois established a frontend foundation: normalized telemetry contract, real-time store with ring buffer per (job, tag), alarm evaluation against the active job snapshot, firm browser boundary, and a `BackendWebSocketTelemetryAdapter` already prepared to consume from a real backend once it exists. Before that backend is built in F3, the expediente must answer a question that was never made explicit: **who is the authoritative system of record for the product?**

Earlier documents (notably the Technical Foundation) described a chain `sensor → Gateway → Node-RED → ThingsBoard → RVF backend → frontend`. In that reading, ThingsBoard appeared as central infrastructure: self-hosted in Peru, with its own dashboards (the existing "Well-Ion" MVP). That interpretation was reasonable while F2 was a frontend-only effort. It is no longer adequate now that F3 is about to define the backend itself.

External tools such as Node-RED, ThingsBoard, AWS IoT Core, Azure IoT Hub, MQTT brokers, PLC gateways, OPC-UA bridges, Modbus gateways, and industrial historians may exist in the ecosystem. None of them should own the platform's core business logic.

## Decision

RVF Malinois will be developed as its own operational monitoring platform and as the system of record. The RVF Malinois backend / API is the canonical API of the product and the authoritative source for:

- Measurement units (catalog identity, nominal capabilities, deployment lifecycle).
- Sensors (inventory, ownership, configuration, traceability of mapping).
- Alarm configurations (per-unit and per-sensor thresholds; snapshots frozen per job).
- Telemetry ingestion (POST to the canonical API, with validation and provenance).
- Telemetry queries (history, latest, aggregations).
- Operating profiles (per-unit operational envelopes).
- Future reports (operational, historical, client-deliverable).
- Future maintenance insights (sensor health, lifecycle, predictive analytics).

External systems may integrate later **exclusively as upstream sources, field bridges, auxiliary tooling, or optional integrations**, and all of them must connect through the defined RVF Malinois API endpoints. The API enforces validation, active-job authorship, snapshot-based evaluation, and traceability; no external system may own that logic.

> **Operational rule.** RVF Malinois must continue to function even if ThingsBoard, Node-RED, AWS IoT, or Azure IoT do not exist. If the platform stops working when any of those systems is turned off, this decision is being violated.

## Consequences (positive)

- **Product-owned.** RVF Malinois remains a product owned by RVF rather than a façade over a third-party service.
- **No vendor lock-in.** Cloud, broker, historian, and gateway choices become tactical, not strategic.
- **Multi-client / multi-unit growth.** Tenancy and isolation are implemented once, in the canonical API, instead of being re-implemented for each integration.
- **ThingsBoard, Node-RED, and cloud as options, not obligations.** They may be adopted in some deployments and omitted in others without touching the core.
- **Centralized business logic.** Alarm evaluation, snapshot traceability, persistence, and audit live in one place.
- **Controlled evolution.** Database, authentication, reports, and alarm logic can evolve without depending on a third-party platform's roadmap.

## Trade-offs

- **Greater backend responsibility.** RVF takes on the work of building and maintaining services that would otherwise come from an IoT platform.
- **Telemetry storage and alarm logic become RVF responsibilities.** No compromise: time-series storage and alarm logic live in the platform.
- **More careful API design is required.** Because the API is the integration point for everything, its stability and contract must be treated with discipline (versioning, contract tests, documentation).
- **External integrations need adapters.** ThingsBoard, Node-RED, MQTT brokers, PLC gateways, OPC-UA, Modbus, and historians each require a bridge that speaks the canonical API.

## Impact on F3

- **F3 builds the canonical backend, not a wrapper.** The endpoints defined in the F3 document (`/api/units`, `/api/sensors`, `/api/alarms`, `/api/telemetry`, …) are the RVF Malinois API, not a façade for ThingsBoard or any other IoT platform.
- **F3 keeps its declared scope.** No real database, no advanced authentication, no Node-RED, ThingsBoard, AWS IoT, Azure IoT, MQTT broker, PLC, OPC-UA, Modbus, or historian integration in F3. All of those are later work.
- **F3 creates the stable surface that future integrations will use.** `POST /api/telemetry` and the catalog endpoints are the canonical entry point for any future integration.

## Impact on Previous Documents

- **Technical Foundation.** Any reference to ThingsBoard as backbone infrastructure is now read as "optional ingestion source, connected via API," not as mandatory central infrastructure.
- **ADR-005.** Fully in force. The browser boundary does not change: the browser talks only to the RVF Malinois backend / API.
- **F2 and F2D.** Remain aligned without adjustment. The `BackendWebSocketTelemetryAdapter` built in F2D already expected a real RVF backend; ADR-006 confirms that backend is RVF Malinois itself.
- **F3.** Now explicitly founded as the core backend of RVF Malinois. The F3 document is updated to include a "Core Architecture Decision — RVF Malinois as Primary Platform and System of Record" section that cites ADR-006.
- **Domain Model.** Reinforced: every entity in the model (Client, Well, Equipment, Sensor, Job, Snapshot, Telemetry, Alarm, Audit) is owned by RVF Malinois.

## Non-Decisions

ADR-006 does not decide any of the following points. Each will be evaluated in its own time, without being tied to this decision:

- Whether AWS or Azure (or another cloud, or self-hosted) will be used for deployment.
- Whether ThingsBoard / Well-Ion will remain as internal RVF tooling, be gradually retired, or stay as an indefinite upstream integration.
- Whether Node-RED will be the field-gateway standard or be replaced by another solution.
- Which database will be used (PostgreSQL, TimescaleDB, alternatives).
- Which MQTT broker, historian, or PLC protocol will be supported first when the field integration arrives.

## Future Work

- **Database Foundation.** Selection and installation of the relational and time-series engines that will replace the F3 mock / adapter layer.
- **Auth / Users / Roles.** SSO, RBAC, multi-tenant scoping, operator identity for real alarm acknowledgment.
- **Telemetry Storage.** Hypertables, continuous aggregates, retention, compression.
- **Field Gateway Integration.** Node-RED (or alternative) as an adapter into the canonical RVF Malinois ingest.
- **Cloud Deployment.** AWS, Azure, self-hosted, or hybrid — tactical decision.
- **MQTT / OPC-UA / Modbus Bridges.** Specific bridges when operations need them, all against the canonical API.
- **ThingsBoard Compatibility Bridge.** If Well-Ion is retained in any deployment, its role will be managed via an adapter.
- **Real-time Alarms and Notifications.** Persistence, lifecycle with real backend, operational notifications.
- **Reports and Maintenance Intelligence.** Auditable reports with snapshot-based historical reconstruction; maintenance based on history.
