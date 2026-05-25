# RVF Malinois — F4.4D EquipmentModule API Reactivation Report

> Phase **F4.4D — EquipmentModule API Reactivation**.
> Fourth module reactivated atop the F4 canonical Prisma client.
>
> References:
> - F4 architecture: `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md` (commit `f36923a`)
> - ADR-007: `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md` (commit `8147399`)
> - F4.2B strategy: `docs/architecture/RVF_Malinois_F4_2B_Insulation_Strategy_Confirmation.md` (commit `a8862e2`)
> - F4.2B implementation: `docs/architecture/RVF_Malinois_F4_2B_Prisma_Baseline_Migration_Report.md` (commit `e37f7b5`)
> - F4.3 seed: `docs/architecture/RVF_Malinois_F4_3_Seed_Reference_Data_Report.md` (commit `91e17aa`)
> - F4.4A tenants: `docs/architecture/RVF_Malinois_F4_4A_Tenants_API_Reactivation_Report.md` (commit `2f5c108`)
> - F4.4B wells: `docs/architecture/RVF_Malinois_F4_4B_Wells_API_Reactivation_Report.md` (commit `20dadca`)
> - F4.4C canonical tags: `docs/architecture/RVF_Malinois_F4_4C_CanonicalTags_API_Reactivation_Report.md` (commit `0ec1099`)

## 1. Summary

F4.4D rewrites `EquipmentService` and `EquipmentController` against the F4 canonical schema, restores `EquipmentModule` to the Nest application bootstrap, removes `src/equipment/**` from the F4.2B quarantine excludes in `tsconfig.json`, `eslint.config.mjs`, and `vitest.config.ts`, and adds a focused mocked-Prisma vitest suite that runs cleanly inside `pnpm test` without a database.

This reactivation is the most substantive of F4.4 so far. F4 made three significant changes that cascade through this module: the F1 model `EquipmentUnit` is renamed to `MeasurementUnit` (and now carries `tenant_id`, `status`, `operating_profile`, `location`), the F1 `EquipmentCategory` enum is removed entirely (F4 keeps categorisation implicit in `name`/`description` and `defaultSensorTemplate`), and the F1 1:1 `Sensor → SignalFireDevice` relation is replaced by a 1:N `Sensor → TransmitterDevice` history list. F4.4D rewrites the endpoint shape, the filter set, and the unit-detail include accordingly. It also introduces the first F4.4 endpoint to project per-unit operational state — current `unitConfiguration`, current `unitOperatingEnvelope`, and current `alarmRules` — into the response payload.

Scope mirrors prior F4.4 sub-phases: only `EquipmentModule` is reactivated. `JobsModule` and `TelemetryModule` remain quarantined. `TenantsModule`, `WellsModule`, and `CanonicalTagsModule` continue to operate. No frontend, no schema, no migration, no seed, no authentication, no telemetry, no alarm-event persistence, no live-reading projection.

All quality gates pass: `prisma validate`, `prisma generate`, backend + workspace-wide `lint` / `typecheck` / `build`, plus the backend `vitest` suite (**31/31 tests** including 10 new equipment tests). No commit was made.

## 2. Files Changed

| Path | Change |
|---|---|
| `apps/backend/src/equipment/equipment.service.ts` | **Rewritten** against F4. New method set (`findTypes`, `findTypeById`, `findUnits`, `findUnitById`); CHECK-constraint mirrors `MEASUREMENT_UNIT_STATUSES` and `MEASUREMENT_UNIT_OPERATING_PROFILES` exported for the controller's Zod schema; new module-private `UNIT_DETAIL_INCLUDE` constant assembles the equipmentType / sensors+transmitters / current-config / current-envelope / current-alarmRules include block. |
| `apps/backend/src/equipment/equipment.controller.ts` | **Rewritten.** `:code` → `:id` (UUID) on both types and units; F1 `?typeCode=` / `?category=` filters replaced with F4-aligned `?tenantId=` / `?equipmentTypeId=` / `?status=` / `?operatingProfile=` (all Zod-validated). Swagger annotations updated. |
| `apps/backend/src/equipment/equipment.service.spec.ts` | **New.** 10 mocked-Prisma vitest tests covering both methods of both entities plus the unit-detail include shape and the ctx-vs-manual-tenant precedence. |
| `apps/backend/src/app.module.ts` | Added `EquipmentModule` to `imports`; header rewritten to F4.4D reactivation state. |
| `apps/backend/tsconfig.json` | Removed `src/equipment/**` from `exclude`. |
| `apps/backend/eslint.config.mjs` | Removed `src/equipment/**` from `ignores`. |
| `apps/backend/vitest.config.ts` | Removed `src/equipment/**` from `exclude`. |
| `docs/architecture/RVF_Malinois_F4_4D_Equipment_API_Reactivation_Report.md` | **New.** This document. |

`equipment.module.ts` was already a thin controller/service wiring and required no changes. No edits under `apps/web/`, `packages/`, `apps/backend/prisma/`, `apps/backend/src/{jobs,telemetry}/`, `docker-compose.yml`, `.github/`, or root config files.

## 3. Equipment API Behavior Restored

### 3.1 Endpoint surface (F4.4D)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/equipment/types` | List equipment-type templates. Ordered by `name asc`. Not tenant-scoped (global reference data). |
| `GET` | `/api/v1/equipment/types/:id` | Fetch one equipment-type template by UUID. `ParseUUIDPipe` enforces UUID format. |
| `GET` | `/api/v1/equipment/units` | List measurement units. Optional filters: `tenantId` (UUID), `equipmentTypeId` (UUID), `status`, `operatingProfile`. Each row carries a short `equipmentType: { id, name, pidReference }` summary. Ordered by `(tenantId asc, code asc)`. |
| `GET` | `/api/v1/equipment/units/:id` | Fetch one measurement unit by UUID with the **full detail include** (see §3.3). |

### 3.2 List response shape (units)

```json
[
  {
    "id": "00000000-0000-0000-0000-000000004411",
    "tenantId": "00000000-0000-0000-0000-000000000001",
    "equipmentTypeId": "00000000-0000-0000-0000-0000000044d1",
    "code": "HP-001",
    "serialNumber": "RVF-HP-001",
    "name": "High Pressure / High Flow Test Unit",
    "status": "active",
    "operatingProfile": "high_pressure_high_flow",
    "location": "Yard / Test Bench",
    "createdAt": "2026-05-24T00:00:00.000Z",
    "updatedAt": "2026-05-24T00:00:00.000Z",
    "equipmentType": { "id": "...", "name": "EMMAD", "pidReference": "EMMAD-generic" }
  }
]
```

### 3.3 Detail response shape (unit by id)

The detail include is intentional and verified by spec:

```ts
{
  equipmentType: true,
  sensors: {
    orderBy: { instrumentTag: 'asc' },
    include: {
      transmitterDevices: {
        where: { installationStatus: 'installed' },
        orderBy: { installedAt: 'desc' },
      },
    },
  },
  unitConfigurations: { where: { isCurrent: true }, take: 1 },
  unitOperatingEnvelopes: { where: { isCurrent: true }, take: 1 },
  alarmRules: {
    where: { isCurrent: true },
    orderBy: [{ canonicalTagId: 'asc' }, { severity: 'asc' }],
    include: {
      canonicalTag: { select: { id, name, displayName, canonicalUnit, category } },
    },
  },
}
```

Each detail response therefore carries:
- the full equipment-type template,
- every sensor on the unit, in instrument-tag order, with **only currently-installed** transmitter devices (history rows with `installation_status ∈ {removed, on_bench, replaced}` are filtered out),
- the unit's current `unit_configurations` row (at most one, by partial-unique-index invariant),
- the unit's current `unit_operating_envelopes` row (at most one),
- every current alarm rule (`is_current = true`), each with a canonical-tag scalar attached so the response is self-describing.

Intentionally **not** included: `telemetry_readings`, `alarm_events`, `jobs`, `commissioning_snapshots`, `integration_mappings`. Those reads belong to F4.4E, F4.4F, and F4.6.

### 3.4 Scoping precedence

`CallerContext.tenantId` (server-derived) wins over any `?tenantId=` query parameter. `SystemContext` (empty) preserves the F1 posture: every unit is visible until authentication lands. Out-of-scope by-id reads return `404 Not Found`, never `403 Forbidden` (information-hiding).

## 4. Prisma Models Used

`EquipmentType`, `MeasurementUnit`, `Sensor`, `TransmitterDevice`, `UnitConfiguration`, `UnitOperatingEnvelope`, `AlarmRule`, `CanonicalTag` — all from the F4 client generated against `apps/backend/prisma/schema.prisma` (commit `e37f7b5`).

Direct Prisma client method calls:
- `prisma.equipmentType.findMany({ orderBy: { name: 'asc' } })`
- `prisma.equipmentType.findUnique({ where: { id } })`
- `prisma.measurementUnit.findMany({ where, include: { equipmentType: { select } }, orderBy })`
- `prisma.measurementUnit.findUnique({ where: { id }, include: UNIT_DETAIL_INCLUDE })`

Indirect (via `include`):
- `Sensor`, `TransmitterDevice` (filtered to `installation_status = 'installed'`).
- `UnitConfiguration`, `UnitOperatingEnvelope`, `AlarmRule` (filtered to `is_current = true`).
- `CanonicalTag` scalar (joined to each `AlarmRule`).

No raw SQL, no `$queryRaw`, no transactions, no write paths.

## 5. Field Mapping F1 → F4

### 5.1 Model renames

| F1 | F4 | Notes |
|---|---|---|
| `EquipmentUnit` | `MeasurementUnit` | Conceptual rename — F4 calls the physical asset a "measurement unit" rather than an "equipment unit". |
| `prisma.equipmentUnit` | `prisma.measurementUnit` | Client accessor follows the rename. |
| `equipment_units` (table) | `measurement_units` (table) | Migration `20260524000000_f4_2_baseline` creates the new table. |
| `Sensor.signalFireDevice` (1:1) | `Sensor.transmitterDevices` (1:N) | F4 generalises to any transmitter (4-20mA, HART, Modbus, OPC-UA, wireless) and preserves replacement history. The reactivated detail include filters to only the currently-installed row(s). |

### 5.2 Field renames / removals

| F1 column | F4 equivalent | Why it changed |
|---|---|---|
| `equipment_types.code` (slug, e.g. `EMMAD`) | (removed) | F4 dropped soft codes; UUID + `name @unique` are the identifiers. |
| `equipment_types.category` (enum) | (removed) | F4 dropped the `EquipmentCategory` enum entirely. Category-like distinctions live in `defaultSensorTemplate` / `description` / `name` instead. |
| `equipment_types.expectedSensorChannels` | `equipment_types.defaultSensorTemplate` | Renamed. |
| `equipment_units.code` (cuid) | `measurement_units.code` (string, compound unique `(tenant_id, code)`) | F4 keeps `code` but tenant-scopes it (HP-001 can exist in multiple tenants). |
| (n/a) | `measurement_units.tenantId` | New: F4 tenant-scopes the asset table itself. |
| (n/a) | `measurement_units.status` | New: CHECK `('active','inactive','offline','maintenance')`. |
| (n/a) | `measurement_units.operatingProfile` | New: CHECK `('high_pressure_high_flow','medium','low','custom')`. |
| (n/a) | `measurement_units.location` | New: free-form text (`Yard / Test Bench` in the F4.3 seed). |
| (n/a, alarm rules were on `Job` or `Well`) | `alarm_rules.unit_id` per-unit, versioned | F4 alarm rules hang off `(unit_id, canonical_tag_id, severity)` (ADR-005). The detail include reads only the currently-active ones (`is_current = true`). |
| (n/a) | `unit_configurations` / `unit_operating_envelopes` (per-unit, versioned, partial-unique on `is_current`) | New: F4 §E. Each demonstrates that operational state is per-unit, not global. |

### 5.3 Endpoint surface

| F1 | F4.4D | Why |
|---|---|---|
| `GET /equipment/types` | unchanged path | Both still return the global template list. F1 sorted by `code`; F4 sorts by `name` (F4 has no `code`). |
| `GET /equipment/types/:code` (`EMMAD`, `EMGAD`) | `GET /equipment/types/:id` (UUID) | UUID-based identification, consistent with F4.4A / F4.4B. |
| `GET /equipment/units` with `?typeCode=` / `?category=` | `GET /equipment/units` with `?tenantId=` / `?equipmentTypeId=` / `?status=` / `?operatingProfile=` | F4 dropped `category`; new filters surface the F4-native columns. |
| `GET /equipment/units/:code` (`EMMAD-01`) | `GET /equipment/units/:id` (UUID) | UUID is the only globally-unique identifier; `code` is only unique within a tenant. |
| F1 detail include: `equipmentType + sensors + signalFireDevice` | F4 detail include: see §3.3 | Detail is richer (per-unit operational state) and self-describing for alarm rules (canonical-tag scalar joined). |

## 6. Quarantine Changes

Removed `src/equipment/**` from three places:

| File | Before (F4.4C state) | After (F4.4D state) |
|---|---|---|
| `apps/backend/tsconfig.json` `exclude` | `src/{equipment,jobs,telemetry}/**` | `src/{jobs,telemetry}/**` |
| `apps/backend/eslint.config.mjs` `ignores` | `src/{equipment,jobs,telemetry}/**` | `src/{jobs,telemetry}/**` |
| `apps/backend/vitest.config.ts` `exclude` | `src/{equipment,jobs,telemetry}/**` | `src/{jobs,telemetry}/**` |

Two modules still quarantined: `JobsModule`, `TelemetryModule`.

In `apps/backend/src/app.module.ts`:

- `import { EquipmentModule } from './equipment/equipment.module';` added (in alphabetical order with other feature imports).
- `EquipmentModule` appended to `imports` (after `CanonicalTagsModule`).
- Header comment rewritten to reflect the F4.4D reactivation state.

## 7. Tests Added / Updated

10 mocked-Prisma vitest tests added at `apps/backend/src/equipment/equipment.service.spec.ts`, following the F4.4A / F4.4B / F4.4C pattern.

| Group | Tests |
|---|---|
| `findTypes` | 1 — default ordering and shape. |
| `findTypeById` | 2 — happy path + `NotFoundException` on miss. |
| `findUnits` | 4 — default empty-filter; `equipmentTypeId / status / operatingProfile` passthrough; `ctx.tenantId` wins over manual `tenantId`; manual `tenantId` honored when no ctx scope. |
| `findUnitById` | 3 — happy path + unit-detail include shape (`equipmentType: true`; sensors with only-installed transmitters; per-current-row filters on `unitConfigurations` / `unitOperatingEnvelopes` / `alarmRules`); `NotFoundException` on miss; `NotFoundException` on out-of-scope. |

The unit-detail-include test deliberately asserts the include block's shape rather than the returned payload because the mocked Prisma client cannot synthesise nested relation arrays. Shape assertion guards against future refactors silently dropping one of the per-current-row filters or the `installation_status = 'installed'` filter on transmitters — exactly the kind of regression that is invisible in a happy-path test.

Backend test run: **31/31 pass** (1 health + 6 tenants + 7 wells + 7 canonical-tags + 10 equipment). No DB connection required.

A controller-level spec is not added — same rationale as the prior reactivations.

## 8. Commands Run and Results

| Command | Result |
|---|---|
| `pnpm --filter @rvf/backend exec prisma validate` | `The schema at prisma/schema.prisma is valid 🚀` |
| `pnpm --filter @rvf/backend exec prisma generate` | Clean (Prisma Client 5.22.0) |
| `pnpm --filter @rvf/backend run lint` | clean exit (fixed one ESLint error during authoring: `@typescript-eslint/no-unnecessary-type-assertion` on an `as Record<string, unknown> \| undefined` that TypeScript could already infer from `call?.include`). |
| `pnpm --filter @rvf/backend run typecheck` | clean (chains `tsc` for `src/` + `tsc -p prisma/tsconfig.json` for the seed). |
| `pnpm --filter @rvf/backend run test` | `5 files / 31 tests passed (1 health + 6 tenants + 7 wells + 7 canonical-tags + 10 equipment)`. |
| `pnpm --filter @rvf/backend run build` | clean (`nest build`). |
| `pnpm run lint` (workspace) | 4/4 tasks successful. |
| `pnpm run typecheck` (workspace) | 4/4 tasks successful. |
| `pnpm run build` (workspace) | 2/2 tasks successful. |

## 9. What Remains Out of Scope

- **Reactivation of any other quarantined module.** `JobsModule` and `TelemetryModule` stay quarantined.
- **Write paths** (create / update / delete on any equipment entity). F1 did not expose them; F4.4D does not introduce them. Calibration / replacement / status-change endpoints (which would write to `transmitter_devices`, `measurement_units.status`, etc.) will land behind a guarded audit-log-writing service in a later phase.
- **Telemetry readings** — explicitly forbidden in F4.4D scope and not queried.
- **Live readings** — the `live_readings_projection` view is intentionally not joined here. F4.5 / F4.6 own that read.
- **Alarm events** — `alarm_events` rows are not exposed by F4.4D. The unit detail surfaces alarm **rules** (configuration), not alarm **events** (history).
- **Operations chart data** — out of scope.
- **Per-tenant equipment-type filtering** — equipment types are global by design (F4 §D, ADR-007 §1). The list endpoint exposes the full template catalog without a tenant filter.
- **`packages/types` exports for `MeasurementUnit` / `EquipmentType`.** Not added. F4.5 (UI connection) will surface the shared type when the frontend starts consuming the live endpoint.
- **Real authentication.** `CallerContext` is plumbed but inert.
- **Controller integration tests against a real DB.** Deferred.
- **Schema or migration changes.** None made; none needed.

## 10. Risks / Limitations

1. **Breaking shape changes vs F1 (intentional).** `:code` → `:id` UUID; `?typeCode=` → `?equipmentTypeId=`; `?category=` removed; unit detail include reshaped (`signalFireDevice` → `transmitterDevices[]` with installation filter; current configuration / envelope / alarm rules added). The frontend currently uses the F3 mock adapter, so nothing live breaks; F4.5 must reconcile when it starts consuming the live endpoint.
2. **`UNIT_DETAIL_INCLUDE` payload size scales with sensor count.** For F4.3-seed-sized units (7 sensors, 7 alarm rules + canonical-tag, 1 configuration, 1 envelope) the payload is small; for a future high-sensor-count unit (e.g. 50+ sensors with multiple historical transmitters) the response can grow. The include filters keep size bounded (only currently-installed transmitters; only current alarm rules), but pagination on sensors is a future concern when fleet grows.
3. **Mocked-Prisma unit-detail test asserts include shape, not payload structure.** The mock cannot synthesise nested relation rows, so we verify the query shape that Prisma will execute against a real DB. A future integration test against the F4.3 seed should confirm the full payload structure end-to-end.
4. **CHECK constraints mirrored, not Prisma-enforced.** `MEASUREMENT_UNIT_STATUSES` and `MEASUREMENT_UNIT_OPERATING_PROFILES` are application-side tuples that mirror the SQL CHECK lists. Drift would need a code-review catch.
5. **`AlarmRule` includes `canonicalTag` scalar; if the canonical tag is later deprecated, the rule's snapshot may show a deprecated label.** That is the documented F4 behavior (ADR-003: rows are never deleted; deprecation is a flag). The frontend can choose to render deprecated tags with a visual cue once F4.5 lands.
6. **No supporting index for `?status=` or `?operatingProfile=` filters** — fine at F4.3 seed scale (2 units); production-scale tuning is later.
7. **No real-DB e2e.** Same posture as F4.3 / F4.4A / F4.4B / F4.4C.

## 11. Acceptance Criteria — Status

| # | Criterion | Status |
|---|---|---|
| 1 | EquipmentModule is active in `app.module.ts`. | **Met.** |
| 2 | EquipmentModule compiles against F4 Prisma schema. | **Met.** |
| 3 | EquipmentModule removed from quarantine excludes. | **Met.** |
| 4 | TenantsModule remains active. | **Met.** |
| 5 | WellsModule remains active. | **Met.** |
| 6 | CanonicalTagsModule remains active. | **Met.** |
| 7 | No other quarantined modules reactivated. | **Met.** Jobs + telemetry remain quarantined. |
| 8 | Equipment API is read-only. | **Met.** No create / update / delete. |
| 9 | EquipmentType + MeasurementUnit reads aligned with F4 canonical model. | **Met.** §4–§5. |
| 10 | MeasurementUnit does not query telemetry / live readings. | **Met.** Detail include explicitly excludes `telemetry_readings`, `alarm_events`, `live_readings_projection`. |
| 11 | `lint` passes. | **Met.** Backend + workspace. |
| 12 | `typecheck` passes. | **Met.** Backend (src + prisma) + workspace. |
| 13 | `build` passes. | **Met.** Backend (`nest build`) + workspace. |
| 14 | Backend tests pass / quarantined documented. | **Met.** 31/31 pass. |
| 15 | No frontend files changed. | **Met.** |
| 16 | No Prisma schema / migration changes. | **Met.** |
| 17 | No seed data added. | **Met.** |
| 18 | No telemetry implementation. | **Met.** |
| 19 | F4.4D report created. | **Met.** This document. |
| 20 | No commit made. | **Met.** All changes are working-tree only. |

All acceptance criteria are met.

## 12. Next Phase Recommendation

**Recommend F4.4E — JobsModule API Reactivation** as the next phase.

Rationale:

- `JobsModule` is the next module in the dependency graph. F4 retains the `Job` model but anchors it on UUIDs (no more `JOB-YYYY-NNNN` slug), adds `commissioning_snapshot_id` as a nullable circular FK, simplifies the status enum (`programmed | in_progress | closed`), and folds the F1 `job_sensor_snapshots` into JSONB inside `commissioning_snapshots.sensor_mappings`. The reactivation will rewrite `JobsService` and the (now-quarantined) `CommissioningService` against the new shapes — slightly larger surface than F4.4D but the same pattern (rewrite + Zod schema + mocked-Prisma spec + un-quarantine).
- The F4.3 seed already populates one reference job + commissioning snapshot anchored on HP-001, so the reactivated endpoints return a deterministic non-empty result.
- After F4.4E, only `TelemetryModule` remains quarantined. F4.4F can then address the read paths (trends + canonical-tag-resolver) and defer the write/ingestion paths to F4.6.

Suggested ordering remains:

- **F4.4E** — `JobsModule` (joins `well` + `unit` + `commissioning_snapshot`). Includes the (read-only) commissioning-snapshot detail endpoint.
- **F4.4F** — `TelemetryModule` (read paths only against `telemetry_readings` and `live_readings_projection`; full write/ingest paths land in F4.6).
