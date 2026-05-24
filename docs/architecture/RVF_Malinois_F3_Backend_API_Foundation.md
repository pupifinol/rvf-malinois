# RVF Malinois — F3 Backend / API Foundation Architecture

> Documento de arquitectura de RVF Malinois — RVF Soluciones Energéticas C.A.
> Convertido a Markdown para uso con Claude Code. Confidencial.

## 1. Executive Summary

RVF Malinois is an industrial monitoring platform for Oil & Gas operations: measurement units, sensors, telemetry, alarms, reports, and field equipment configuration. Phase F2 closed the frontend telemetry foundation, the shared runtime, the normalized stream boundary, and the Operations and Alarms consumers. Phase F3 now establishes the backend and API foundation of RVF Malinois as a primary, self-contained platform — not as a layer on top of a third-party IoT system.

**Why F3 must come now.** Without a backend, every additional UI feature is built on assumptions. The F2 adapter is already shaped to receive a real normalized stream; F3 puts a real server on the other side. F3 is intentionally lightweight: it defines the API surface, the domain models, the validation rules, and a mock / adapter strategy that will later be replaced by a real database — always under the control of RVF Malinois, never by handing ownership to an external platform.

**What F3 is not.** F3 is not the place to introduce a real database, advanced authentication, role-based access control, real-time streaming infrastructure, real ThingsBoard / Node-RED / AWS IoT / Azure IoT / MQTT / PLC / OPC-UA / Modbus / historian integration, advanced reports, predictive analytics, or any UI redesign. Each of those belongs to a later phase that builds on top of F3, and all of them — when they arrive — connect through the canonical RVF Malinois API.

## 2. F3 Objective

Create a clean, scalable, maintainable backend and canonical API of RVF Malinois to support measurement units, sensors, alarms, and telemetry, while preserving the per-unit operational independence that the domain demands. The API delivered by F3 is the authoritative interface of the product; any external system that participates in the ecosystem later (Node-RED, ThingsBoard, MQTT, PLC, OPC-UA, Modbus, historian, AWS IoT, Azure IoT) must speak to it through this surface.

- **Clean.** Clear separation between transport (API routes), domain (TypeScript types), data access (adapter/service layer), and validation. No leaking concerns.

- **Scalable.** Adapter layer that allows swapping the mock data source for a real database (PostgreSQL, TimescaleDB, Supabase, Prisma, InfluxDB, historian, PLC/gateway ingestion) without rewriting the API surface.

- **Maintainable.** Strongly typed, validated at the boundary, with consistent error responses and clear naming. Any developer (or Claude Code) should be able to navigate and extend the surface.

> **Domain principle that governs F3.** Each measurement unit has independent operational configuration. A high-pressure / high-flow well-testing unit has alarm thresholds that would be catastrophic on a low-pressure unit, and vice versa. Alarms are never global; thresholds belong to a unit and a sensor.

## 3. Core Architecture Decision — RVF Malinois as Primary Platform and System of Record

Before the scope of F3 is enumerated, one structural decision must be stated explicitly because every other choice in this document depends on it. This decision is registered formally as ADR-006 (see Adenda de Decisiones de Arquitectura v1.4); it is repeated here so that any reader of the F3 document carries it forward without ambiguity.

- **RVF Malinois is the primary platform.** Not a frontend over a third-party IoT stack, not a thin client of ThingsBoard, not a wrapper around AWS IoT Core or Azure IoT Hub. The product is its own platform.

- **The RVF Malinois backend / API is the canonical API.** Every consumer — frontend, gateway, integration bridge — talks to this API. There is no other authoritative path into the system.

- **RVF Malinois is the system of record.** Measurement units, sensors, alarm configurations, telemetry, operating profiles, reports and maintenance insights live here. The data is owned by RVF Malinois.

- **F3 builds the RVF Malinois backend, not a façade over ThingsBoard or any other platform.** The endpoints described in this document are the real API of the product, not a translation layer.

- **External platforms may integrate later, but only through RVF Malinois APIs.** Node-RED, ThingsBoard, AWS IoT Core, Azure IoT Hub, MQTT brokers, PLC gateways, OPC-UA bridges, Modbus gateways and industrial historians may participate as upstream sources or auxiliary tooling; none of them owns business logic.

- **Core business logic belongs to RVF Malinois.** Validation, active-job authorship, snapshot-based alarm evaluation, traceability and audit live in the platform itself.

> **Operational rule.** RVF Malinois must continue to function even if ThingsBoard, Node-RED, AWS IoT or Azure IoT do not exist. If the platform stops working when any of those systems is turned off, this decision is being violated.

## 4. Scope of F3

## In scope (F3 must cover)

- API health endpoint (liveness/readiness).

- Measurement Units API (list and detail).

- Sensors API (list, filter by unit, detail).

- Alarm Configuration API (list, filter by unit, detail).

- Telemetry ingestion API (validated payload).

- Telemetry query API (latest + history filtered by unit).

- Mock data adapter layer (single source of truth, swappable).

- TypeScript domain models (units, sensors, alarms, telemetry, API responses).

- Validation rules and standardized error handling.

- Documentation under docs/architecture/.

- QA checklist before tagging the release.

## Out of scope (F3 does NOT cover yet)

- Real database (no Postgres, TimescaleDB, Supabase, or Prisma migrations in F3).

- Advanced authentication (no SSO, no OAuth flows, no JWT issuance).

- Roles, permissions, multi-tenant enforcement.

- Real-time streaming infrastructure (the WebSocket adapter built in F2D will be wired later).

- ThingsBoard integration (not implemented in F3; future, optional, as an upstream source via the canonical API).

- Node-RED integration (not implemented in F3; future field-gateway adapter, not the platform backbone).

- AWS IoT Core integration (not implemented in F3).

- Azure IoT Hub integration (not implemented in F3).

- MQTT broker integration (not implemented in F3; future bridge against POST /api/telemetry).

- PLC / gateway integration (not implemented in F3; future, per ADR-001).

- OPC-UA bridge (not implemented in F3).

- Modbus gateway (not implemented in F3).

- Industrial historian integration (not implemented in F3).

- Advanced reports (historical reconstruction, exports).

- AI / predictive analytics.

- UI redesign of any kind.

> **What F3 does for those integrations.** F3 does not implement any of the external platforms above, but it deliberately leaves a stable, validated API surface (notably POST /api/telemetry) that any of them will use to deliver data into RVF Malinois once a specific bridge is built in a later phase. RVF Malinois is the system of record; those systems are upstream sources.

## 5. Current Architecture Assumptions

Before implementing F3, Claude Code must inspect the current repository and adapt to the actual stack present. This document expresses architecture intent; the file layout, tooling and conventions of the existing code take precedence in matters of style and ergonomics.

- **Likely stack.** Next.js 14+ App Router with React 19 and strict TypeScript, pnpm monorepo. This is the working assumption based on F2; it must be verified, not taken for granted.

- **What to verify before coding.** Package manager (pnpm / npm / yarn); Next.js version and router (App vs Pages); TypeScript strictness; presence of validation libraries (zod, valibot, yup); existing API conventions in /app/api or /pages/api; testing framework (Vitest, Jest); lint configuration.

- **Adapt the document to the repo.** If the repository uses a folder layout that differs from the one proposed in section 6, follow the existing layout. The document is reference architecture, not a forced structure.

## 6. Proposed Folder Structure

The following layout is a reference. If the existing repository uses a different convention (for example, /pages/api in a Pages Router project, or a monorepo with /apps/web), Claude Code must adapt this structure to match the repo before implementation.

```
src/
app/
api/
health/ liveness / readiness
units/ measurement units
sensors/ sensors
alarms/ alarm configuration
telemetry/ ingestion + query
lib/
api/ shared request/response helpers
data/ adapter layer (mock today; DB tomorrow)
mockUnits.ts
mockSensors.ts
mockAlarms.ts
mockTelemetry.ts
index.ts exposes getUnits(), getSensorsByUnitId(), ...
validation/ payload + entity validation helpers
types/
unit.ts MeasurementUnit
sensor.ts Sensor
alarm.ts AlarmConfiguration
telemetry.ts TelemetryPayload, TelemetryReading,
TelemetryRecord
api.ts ApiResponse, ApiError
docs/
architecture/
RVF_Malinois_F3_Backend_API_Foundation.md
```

## 7. Domain Model Overview

F3 introduces eight types that form the contract between API routes and consumers. They are owned by /types and re-exported as needed; nothing else in the codebase should redefine them.

| **Type**           | **Purpose**                                                                             |
|--------------------|-----------------------------------------------------------------------------------------|
| MeasurementUnit    | A physical measurement unit (e.g., well-testing skid). Independent operational profile. |
| Sensor             | An instrument attached to a specific MeasurementUnit. Belongs to exactly one unit.      |
| AlarmConfiguration | Threshold set for a (unit, sensor) pair. Per-unit, never global.                        |
| TelemetryPayload   | Inbound ingestion shape: unit + timestamp + readings array.                             |
| TelemetryReading   | A single reading inside a payload (sensorId, value, unit).                              |
| TelemetryRecord    | A stored telemetry record with quality and source.                                      |
| ApiError           | Standardized error body { code, message }.                                              |
| ApiResponse        | Generic discriminated response wrapper used by API helpers.                             |

## 8. Measurement Unit Model

MeasurementUnit represents the physical asset that performs the measurement. Each unit has its own operating profile and its own maximum operating limits, because the same software is used across high-pressure / high-flow and low-pressure / low-flow units.

```
interface MeasurementUnit {
id: string // 'unit-hp-001'
name: string // human-readable
code: string // short asset code
type: string // e.g. 'well_testing_skid'
location: string
status: 'active' | 'inactive' | 'offline' | 'maintenance'
operatingProfile:
'high_pressure_high_flow'
| 'medium_pressure_medium_flow'
| 'low_pressure_low_flow'
| 'custom'
maxPressure: number // numeric ceiling
maxFlowRate: number
pressureUnit: string // 'psi', 'kPa', ...
flowUnit: string // 'bpd', 'mmscfd', ...
sensorsCount: number // denormalized for list views
alarmsCount: number // denormalized for list views
createdAt: string // ISO UTC
updatedAt: string // ISO UTC
}
```

## Why this matters

- **Per-unit ceilings.** maxPressure and maxFlowRate make the unit’s envelope explicit. Two units with different envelopes never share alarm thresholds.

- **Operating profile as taxonomy, not as configuration.** The profile categorizes the unit; thresholds still live in AlarmConfiguration. Profile is a label that helps UI grouping and selection of sensible defaults at commissioning time.

- **Future-proof.** Adding a new profile (e.g., “high_temperature_critical”) is a type-level change; the API surface stays the same.

## 9. Sensor Model

A Sensor is owned by exactly one MeasurementUnit. The unitId is the foreign reference; the rest describes the instrument and its current snapshot.

```
interface Sensor {
id: string // 'sensor-pressure-inlet-hp-001'
unitId: string // FK to MeasurementUnit.id
tag: string // canonical tag, e.g. 'PT-001'
name: string
type:
'pressure' | 'temperature' | 'flow' | 'vibration'
| 'volume' | 'level' | 'gas_composition'
| 'digital_status'
measurement: string // human label
unit: string // 'psi', 'degC', 'bpd', ...
status: 'online' | 'offline' | 'fault' | 'disabled'
minRange: number
maxRange: number
currentValue: number | null
lastReadingAt: string | null // ISO UTC
createdAt: string
updatedAt: string
}
```

- **Sensor ownership.** unitId is mandatory. A sensor without a unit cannot exist in F3.

- **Range vs threshold.** minRange / maxRange describe the instrument’s physical capability; they are NOT alarm thresholds. Thresholds live in AlarmConfiguration.

## 10. Alarm Configuration Model

AlarmConfiguration is the threshold set for a specific (unit, sensor) pair. It is the per-unit alarm rule. Two units monitoring the same kind of variable can and will have different thresholds.

```
interface AlarmConfiguration {
id: string
unitId: string // mandatory FK to MeasurementUnit
sensorId: string // mandatory FK to Sensor (which belongs to unitId)
alarmType: 'pressure' | 'temperature' | 'flow' | 'vibration'
| 'volume' | 'level' | 'composition' | 'digital'
severity: 'info' | 'warning' | 'critical'
enabled: boolean
lowLowThreshold: number | null
lowThreshold: number | null
highThreshold: number | null
highHighThreshold:number | null
deadband: number // hysteresis to avoid flapping
delaySeconds: number // debounce before raising
message: string // human-readable description
createdAt: string
updatedAt: string
}
```

## Per-unit example

```
Unit HP-001 (high_pressure_high_flow):
Pressure high alarm -> 4,500 psi
Pressure high-high -> 5,000 psi
Unit LP-001 (low_pressure_low_flow):
Pressure high alarm -> 600 psi
Pressure high-high -> 750 psi
Same software. Same API. Different thresholds. Per unit. Always.
```

> **Alarms are never global.** No global thresholds. No platform-wide settings overriding unit configuration. The same instrument type can and will have very different alarm rules on different units, and the system must reflect that without compromise.

## 11. Telemetry Model

Three telemetry shapes: an inbound payload (one POST = one unit + multiple readings), a single reading (inside a payload), and a stored record (after ingestion, with quality and source).

## TelemetryPayload (inbound)

```
interface TelemetryPayload {
unitId: string
timestamp: string // ISO UTC, source of truth
readings: TelemetryReading[] // one or more
}
```

## TelemetryReading

```
interface TelemetryReading {
sensorId: string
value: number
unit: string // 'psi', 'degC', 'bpd', ...
}
```

## TelemetryRecord (stored)

```
interface TelemetryRecord {
id: string
unitId: string
sensorId: string
timestamp: string // ISO UTC
value: number
unit: string
quality: 'good' | 'uncertain' | 'bad'
source: 'mock' | 'manual' | 'field_gateway' | 'historian' | 'plc'
}
```

- **Why split payload and record.** Inbound shape is small and explicit; stored shape carries provenance (quality, source) and an id. The two are intentionally different and must remain so.

- **Why quality and source exist from day one.** Even with mock data, every record carries quality=’good’ and source=’mock’. When the real ingestion arrives, these fields become meaningful without any schema change.

## 12. API Endpoints

Each endpoint section below documents purpose, method, expected response, validation, and error handling. All response bodies are JSON.

## GET /api/health

- **Purpose.** Liveness / readiness probe.

- **Response.** 200 with { status: 'ok', timestamp }.

- **Validation.** None.

- **Errors.** Should never error under normal conditions; if it does, return 500 with standard error shape.

## GET /api/units

- **Purpose.** List all measurement units.

- **Response.** 200 with MeasurementUnit\[\].

- **Validation.** None.

- **Errors.** 500 if the adapter fails.

## GET /api/units/:id

- **Purpose.** Get a measurement unit by id.

- **Response.** 200 with MeasurementUnit.

- **Validation.** id is a non-empty string.

- **Errors.** 404 UNIT_NOT_FOUND if missing.

GET /api/sensors · GET /api/sensors?unitId=...

- **Purpose.** List sensors, optionally filtered by unit.

- **Response.** 200 with Sensor\[\].

- **Validation.** If unitId is present, it must be a non-empty string.

- **Errors.** 404 UNIT_NOT_FOUND if unitId is provided but does not exist.

GET /api/sensors/:id

- **Purpose.** Get a sensor by id.

- **Response.** 200 with Sensor.

- **Validation.** id is a non-empty string.

- **Errors.** 404 SENSOR_NOT_FOUND if missing.

GET /api/alarms · GET /api/alarms?unitId=...

- **Purpose.** List alarm configurations, optionally filtered by unit.

- **Response.** 200 with AlarmConfiguration\[\].

- **Validation.** If unitId is present, it must be a non-empty string.

- **Errors.** 404 UNIT_NOT_FOUND if unitId is provided but does not exist.

GET /api/alarms/:id

- **Purpose.** Get an alarm configuration by id.

- **Response.** 200 with AlarmConfiguration.

- **Validation.** id is a non-empty string.

- **Errors.** 404 if missing.

## POST /api/telemetry

- **Purpose.** Ingest a telemetry payload for a single unit.

- **Request body.** TelemetryPayload.

- **Response.** 202 with { status: 'accepted', unitId, readingsReceived, timestamp }.

- **Validation.** See section 13.

- **Errors.** 400 INVALID_PAYLOAD, 404 UNIT_NOT_FOUND or SENSOR_NOT_FOUND, 422 SENSOR_UNIT_MISMATCH or TELEMETRY_VALIDATION_FAILED, 405 METHOD_NOT_ALLOWED.

GET /api/telemetry · GET /api/telemetry?unitId=...

- **Purpose.** Query historical telemetry, optionally filtered by unit.

- **Response.** 200 with TelemetryRecord\[\].

- **Validation.** If unitId is present, it must be a non-empty string.

- **Errors.** 404 UNIT_NOT_FOUND if unitId is provided but does not exist.

GET /api/telemetry/latest?unitId=...

- **Purpose.** Return the latest reading per sensor for a unit.

- **Response.** 200 with TelemetryRecord\[\] (one per sensor of that unit, or empty).

- **Validation.** unitId is required.

- **Errors.** 400 if unitId missing, 404 UNIT_NOT_FOUND if not found.

## 13. Telemetry Ingestion Flow

This is the canonical sequence for POST /api/telemetry. Every validation step is necessary; skipping any of them allows bad data into the system.

1.  API receives the telemetry payload.

2.  Validate payload shape (required fields, readings is non-empty array, timestamp parses as valid ISO UTC, each reading has sensorId/value/unit).

3.  Validate unit exists (by unitId).

4.  Validate each sensor exists (by sensorId).

5.  Validate that every sensor belongs to the submitted unit (sensor.unitId === payload.unitId).

6.  Normalize timestamp to ISO UTC (strict).

7.  Store/simulate storage through the data adapter (with quality='good' and source as configured for the inbound channel — default 'mock' in F3).

8.  Return accepted response.

## Example request

```
POST /api/telemetry
Content-Type: application/json
{
"unitId": "unit-hp-001",
"timestamp": "2026-05-24T00:00:00.000Z",
"readings": [
{
"sensorId": "sensor-pressure-inlet-hp-001",
"value": 3250,
"unit": "psi"
},
{
"sensorId": "sensor-flow-main-hp-001",
"value": 1850,
"unit": "bpd"
}
]
}
```

## Example response (202 Accepted)

```
{
"status": "accepted",
"unitId": "unit-hp-001",
"readingsReceived": 2,
"timestamp": "2026-05-24T00:00:00.000Z"
}
```

## 14. Error Handling Standard

All errors share the same body shape so that clients (the F2 frontend, future clients, contract tests) never have to special-case responses.

```
{
"error": {
"code": "UNIT_NOT_FOUND",
"message": "Measurement unit not found"
}
}
```

## Standard error codes

| **Code**                    | **HTTP** | **When to use**                                         |
|-----------------------------|----------|---------------------------------------------------------|
| INVALID_PAYLOAD             | 400      | Payload missing required fields or wrong types          |
| UNIT_NOT_FOUND              | 404      | Referenced unit does not exist                          |
| SENSOR_NOT_FOUND            | 404      | Referenced sensor does not exist                        |
| SENSOR_UNIT_MISMATCH        | 422      | Sensor exists but does not belong to the submitted unit |
| TELEMETRY_VALIDATION_FAILED | 422      | Domain-level rule violation on the payload              |
| METHOD_NOT_ALLOWED          | 405      | HTTP method not supported by the endpoint               |

- **Always wrap.** Every non-2xx response must follow the { error: { code, message } } shape. No raw strings, no stack traces leaking.

- **Codes are stable.** Once an error code is shipped, it does not change. New conditions get new codes.

## 15. Mock Data and Adapter Strategy

F3 centralizes mock data into a single layer. The goal is twofold: avoid mocks scattered across UI components (a frequent source of drift), and create a seam where the real database will plug in later without touching API routes.

## Files

- mockUnits.ts — seed list of MeasurementUnit, including at least one high-pressure and one low-pressure unit.

- mockSensors.ts — seed list of Sensor, each correctly tied to a unitId.

- mockAlarms.ts — seed list of AlarmConfiguration with per-unit thresholds.

- mockTelemetry.ts — small history per (unit, sensor) plus in-memory buffer for newly ingested readings.

## Adapter functions

```
// units
getUnits(): Promise<MeasurementUnit[]>
getUnitById(id: string): Promise<MeasurementUnit | null>
// sensors
getSensors(): Promise<Sensor[]>
getSensorsByUnitId(unitId: string): Promise<Sensor[]>
getSensorById(id: string): Promise<Sensor | null>
// alarms
getAlarms(): Promise<AlarmConfiguration[]>
getAlarmsByUnitId(unitId: string): Promise<AlarmConfiguration[]>
getAlarmById(id: string): Promise<AlarmConfiguration | null>
// telemetry
ingestTelemetry(payload: TelemetryPayload): Promise<{ accepted: number }>
getTelemetry(): Promise<TelemetryRecord[]>
getTelemetryByUnitId(unitId: string): Promise<TelemetryRecord[]>
getLatestTelemetryByUnitId(unitId: string): Promise<TelemetryRecord[]>
```

## Future migration targets

- **PostgreSQL / Prisma.** For the catalog (units, sensors, alarm configurations) and operation tables.

- **TimescaleDB / InfluxDB.** For telemetry records (high-volume time series).

- **Supabase.** Acceptable PostgreSQL-backed option that also provides auth and storage.

- **Historian / PLC / Gateway ingestion.** Future inbound channels for /api/telemetry; the adapter layer means new sources do not change API contracts.

> **Adapter, not abstraction tower.** The adapter is a flat module with the function signatures above. No class hierarchies, no dependency injection containers, no premature “IRepository” ceremony. Replace mock with database when needed; the seam is the function signatures themselves.

## 16. Validation Strategy

Validation must be simple, consistent and explicit. Use the validation library already present in the repository if there is one; if not, prefer hand-written guards over pulling in a new dependency for F3.

- **Where to validate.** At the API route boundary, before any adapter call. Adapters trust their inputs because routes have already validated.

- **Minimum required validations.**See list below.

1.  Required fields are present (unitId, sensorId, timestamp, readings, value, unit).

2.  unitId exists in the catalog (resolve via getUnitById).

3.  sensorId exists in the catalog (resolve via getSensorById).

4.  Sensor belongs to the submitted unit (sensor.unitId === payload.unitId).

5.  readings array is non-empty.

6.  Each reading.value is a finite number (not NaN, not Infinity).

7.  timestamp is a valid ISO UTC string parsable as a real date.

8.  Each reading.unit field is a non-empty string.

- **Do not over-engineer.** No DSL, no schema-first scaffolding. If zod is already in the repository, use it; otherwise plain TypeScript guards are fine for F3.

## 17. Frontend Preservation

F3 is backend-first. The frontend must not be redesigned, refactored, or restyled as part of this phase.

- **Do not touch UI screens.** Operations, Units, Sensors, Alarms, Reports, Settings, Client Portal — none of them are edited during F3 unless an unavoidable import or type change forces a minor adjustment to keep the build green.

- **Migrate UI mocks only when safe.** If a UI component currently uses its own local mock data, move it to the centralized adapter only if the migration is low risk and obviously beneficial. When in doubt, leave the UI alone.

- **Keep the F2D adapter intact.** The simulated normalized telemetry adapter that F2D introduced remains the default frontend data source until the WebSocket transport is wired against the new backend in a later phase. F3 does not touch that wiring.

## 18. Security and Future Auth Notes

F3 does not implement advanced authentication. It does, however, leave the surface ready for it.

- **API keys for field gateway.** Future inbound channel (POST /api/telemetry from a gateway) will require an API key. F3 should not block adding a key header later; route handlers should be ready to inspect headers without re-architecting.

- **User authentication.** SSO / OAuth flows belong to a later phase (F7). Routes should not embed assumptions that would prevent adding a session check at the top of the handler.

- **Role-based access control.** Roles such as RVF operations, RVF engineer, client viewer, gateway service are anticipated but not implemented in F3.

- **Unit-level permissions.** The data model is per-unit already, which is exactly the granularity needed for per-tenant or per-client scoping in the future.

- **Audit logs.** Inbound telemetry should be straightforward to log later. Keep route handlers small enough that adding a logging line at start/end is trivial.

## 19. Future Database Migration Notes

The adapter layer is the migration plan. When the real database arrives, only the adapter implementation changes; API routes, types, and validation stay where they are.

- **Step 1 — Move adapter functions behind a DB client.** Replace in-memory arrays with SQL queries through Prisma/Drizzle or a thin wrapper over a pool client. The function signatures stay identical.

- **Step 2 — Split catalog and telemetry.** Catalog (units, sensors, alarms) goes to PostgreSQL; telemetry goes to TimescaleDB (or equivalent), keyed by (unitId, sensorId, timestamp).

- **Step 3 — Introduce migrations.** Use the chosen tool’s migration system from day one of the database introduction; do not handwrite schema drift fixes.

- **Step 4 — Verify with contract tests.** The same tests that ran against the mock adapter run against the database adapter; any drift in shape is caught before the frontend sees it.

## 20. QA Checklist

1.  Repository inspected before implementation (stack, conventions, existing tooling).

2.  API routes created under the right router (App vs Pages) according to the repo.

3.  TypeScript types created under /types and not duplicated anywhere else.

4.  Mock data centralized in /lib/data and not scattered across UI components.

5.  Per-unit alarm configuration supported; no global thresholds anywhere.

6.  Telemetry ingestion validates unit existence, sensor existence, and sensor-unit ownership.

7.  Error responses standardized with { error: { code, message } }.

8.  Existing frontend still works (Operations, Alarms, Client Portal open without regression).

9.  npm run lint passes (or the equivalent for the repo's package manager).

10. npm run typecheck passes if a typecheck script exists; otherwise tsc --noEmit.

11. npm run build passes.

12. Documentation added to docs/architecture/.

## 21. Implementation Guidance for Claude Code

- Keep F3 lightweight. Resist the temptation to add ceremony.

- Do not over-engineer. No premature abstraction layers, no “clean architecture” ports/adapters frameworks; a flat adapter module is enough.

- Do not introduce a real database in F3.

- Do not add advanced authentication in F3.

- Do not redesign UI in F3.

- Do not hardcode global alarm thresholds anywhere; thresholds belong to AlarmConfiguration only.

- Prefer clear, strict TypeScript types over inferred shapes.

- Prefer an adapter / service layer over inline data access in route handlers.

- Preserve existing behavior. The frontend must keep working end-to-end after F3.

- Provide a final implementation summary (what was added, what was changed, validation results).

- Do not commit automatically unless explicitly requested. Stage changes for human review.

## 22. Suggested Git Tag

> v0.8-f3-backend-api-foundation

Apply the tag once the QA checklist of section 20 is fully green and the documentation is in place under docs/architecture/.

## 23. Final Notes

This document is the reference architecture for Phase F3. Any implementation must respect the operational independence of each measurement unit: alarms are never global; thresholds belong to a unit and a sensor; sensors belong to exactly one unit; telemetry validates the chain on ingestion.

The frontend established in F2 already speaks the contract this backend will serve; F3 is the work of putting a real server behind that contract. Keep the surface clean, keep the types strict, keep the adapter swappable, and the path to a real database, real authentication, real reports, and real predictive analytics in later phases stays open without rewrites.

*— End of document —*

RVF Malinois · Confidential — Property of RVF Soluciones Energéticas C.A.
