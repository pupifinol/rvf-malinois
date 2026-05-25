# RVF Malinois — F4.4 API Reactivation Closeout Report

> Phase **F4.4 — API Adaptation** (closeout).
> Documentation-only deliverable. Consolidates the six sub-phase reports
> (F4.4A → F4.4F) into a single record of what changed across the F4.4
> arc, what remains out of scope, and what the platform looks like as
> F4.4 completes.
>
> Upstream references:
> - F4 architecture: `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md` (commit `f36923a`)
> - ADR-007: `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md` (commit `8147399`)
> - F4.1 schema: `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql` (commit `a475066`)
> - F4.2A plan: `docs/architecture/RVF_Malinois_F4_2A_Prisma_Reconciliation_Plan.md` (commit `7bd6103`)
> - F4.2B strategy: `docs/architecture/RVF_Malinois_F4_2B_Insulation_Strategy_Confirmation.md` (commit `a8862e2`)
> - F4.2B implementation: `docs/architecture/RVF_Malinois_F4_2B_Prisma_Baseline_Migration_Report.md` (commit `e37f7b5`)
> - F4.3 seed: `docs/architecture/RVF_Malinois_F4_3_Seed_Reference_Data_Report.md` (commit `91e17aa`)
> - F4.4A → F4.4F sub-phase reports: see §3 commit timeline.

## 1. Executive Summary

F4.4 completes the module-by-module API reactivation that F4.2B set up. After the F4.2B insulation phase quarantined every F1/F1.5-dependent feature module — `TenantsModule`, `WellsModule`, `CanonicalTagsModule`, `EquipmentModule`, `JobsModule`, `TelemetryModule` — F4.4 brought each one back online, one at a time, on top of the F4 canonical Prisma client. Each sub-phase (F4.4A through F4.4F) rewrote its service + controller against the F4 schema, restored the module to the Nest application bootstrap, removed its directory from the F4.2B `exclude` / `ignores` lists in `tsconfig.json`, `eslint.config.mjs`, and `vitest.config.ts`, and replaced any quarantined live-DB spec with a focused mocked-Prisma vitest suite.

F4.4 is read-first and controlled by design. No sub-phase introduced a write path beyond what F1 already exposed (and even those were tightened — see F4.4E's treatment of `CommissioningService`). No sub-phase touched the frontend, the Prisma schema, the migration history, the seed, or any infrastructure file. No sub-phase implemented telemetry ingestion, live-reading projection, alarm-event generation, or WebSocket telemetry broadcasting — those concerns are explicitly deferred to F4.5 (UI wiring) and F4.6 (telemetry persistence).

As of commit `5e92a13` (F4.4F), the backend exposes a complete F4-aligned read surface (13 endpoints across 6 modules), the F4.2B quarantine machinery is fully unwound (every feature directory is back in compile / lint / test), and the backend test suite is 69/69 green across 10 spec files with no DB connection required. The frontend continues to render via the F3 `lib/api-data/` mock adapter — F4.5 will phase it off.

## 2. Scope of F4.4

### Included

- **TenantsModule** reactivation against F4 `tenants` (F4.4A, commit `2f5c108`).
- **WellsModule** reactivation against F4 `wells` (F4.4B, commit `20dadca`).
- **CanonicalTagsModule** reactivation against F4 `canonical_tags` (F4.4C, commit `0ec1099`).
- **EquipmentModule** reactivation against F4 `equipment_types` + `measurement_units` (F4.4D, commit `3cdee45`).
- **JobsModule** reactivation against F4 `jobs` + `commissioning_snapshots`; `CommissioningService` reduced to read-only helpers (F4.4E, commit `ebaa23b`).
- **TelemetryModule** read-only reactivation against F4 `telemetry_readings` + `canonical_tags`; F1 ingestion-path files deleted (F4.4F, commit `5e92a13`).
- Full removal of every feature-module entry from the F4.2B `exclude` / `ignores` lists in `apps/backend/tsconfig.json`, `apps/backend/eslint.config.mjs`, and `apps/backend/vitest.config.ts`.
- Mocked-Prisma vitest specs for each reactivated module, replacing the F1 live-DB suites that the F4.2B quarantine had left dormant.
- One per-sub-phase closeout report under `docs/architecture/`.

### Excluded

The following concerns are **not** part of F4.4 and will return in later phases:

- **Frontend / UI wiring.** No file under `apps/web/` was modified by any F4.4 sub-phase. F4.5 owns this.
- **Telemetry ingestion.** No `POST /telemetry`, no scheduled writer, no MQTT/Node-RED/ThingsBoard/OPC-UA/Modbus client, no insert into `telemetry_readings`. F4.6.
- **Live-readings projection.** `live_readings_projection` view exists (defined in the F4.2 baseline migration) but is not queried by any F4.4 service. F4.5 / F4.6 will decide.
- **WebSocket telemetry broadcasting.** `RealtimeModule` Socket.IO scaffolding is unchanged; no telemetry routing. F4.6 / later.
- **Alarm-event generation.** No row written to `alarm_events`. Alarm-rule reads are exposed by `EquipmentModule`'s unit-detail include; evaluation belongs to F4.6 / later.
- **Reports module.** Not in F4 scope at all.
- **Authentication.** `CallerContext` is plumbed but inert (every endpoint runs under `SystemContext`). Real auth lands in a later phase.
- **Production DB reset / deployment.** No destructive operations. No production target. Developer-driven local reset is documented in the F4.2B closeout (§11) and the F4.3 seed report (§5.1).
- **External integrations.** ThingsBoard / Node-RED / MQTT / OPC-UA / Modbus all out of scope. F4 schema's `integration_sources` / `integration_mappings` rows exist as placeholders (one disabled `manual` source seeded by F4.3) but no client implementation exists.

## 3. Commit Timeline

### F4.4 reactivation arc

| Commit | Sub-phase | Title |
|---|---|---|
| `2f5c108` | **F4.4A** | Reactivate F4.4A tenants API |
| `20dadca` | **F4.4B** | Reactivate F4.4B wells API |
| `0ec1099` | **F4.4C** | Reactivate F4.4C canonical tags API |
| `3cdee45` | **F4.4D** | Reactivate F4.4D equipment API |
| `ebaa23b` | **F4.4E** | Reactivate F4.4E jobs API |
| `5e92a13` | **F4.4F** | Reactivate F4.4F telemetry trends API |

### Upstream foundations referenced

| Commit | Title |
|---|---|
| `f36923a` | Add F4 database foundation architecture |
| `8147399` | Add ADR-007 database foundation decision |
| `a475066` | Add F4.1 PostgreSQL schema foundation |
| `7bd6103` | Add F4.2A Prisma reconciliation plan |
| `a8862e2` | Add F4.2B backend insulation strategy |
| `e37f7b5` | Add F4.2B Prisma baseline migration and backend insulation |
| `91e17aa` | Add F4.3 seed reference data |

## 4. Reactivated Modules Summary

| Sub-phase | Module | Endpoint surface | Prisma models used | Notes |
|---|---|---|---|---|
| **F4.4A** | `TenantsModule` | `GET /api/v1/tenants`, `GET /api/v1/tenants/:id` | `Tenant` | Status filter via `TENANT_STATUSES` CHECK mirror. F4 dropped F1's `code` slug + `kind` enum; the only identifier the API offers is the UUID PK. |
| **F4.4B** | `WellsModule` | `GET /api/v1/wells`, `GET /api/v1/wells/:id` | `Well`, `Tenant` (via include) | F4-aligned filters: `tenantId` / `fieldOrSite` / `type` / `fluid`. `siteCode/wellType` renamed to `fieldOrSite/type`. Each row carries `tenant: { id, name, status }`. |
| **F4.4C** | `CanonicalTagsModule` | `GET /api/v1/tags`, `GET /api/v1/tags/:name` | `CanonicalTag` | Global dictionary (no tenant scope). Optional filters: `category` / `canonicalUnit` / `deprecated`. F4 renamed `unit/unitClass` → `canonicalUnit/category`. F4.3 seeds 22 canonical tags. |
| **F4.4D** | `EquipmentModule` | `GET /api/v1/equipment/types`, `GET /api/v1/equipment/types/:id`, `GET /api/v1/equipment/units`, `GET /api/v1/equipment/units/:id` | `EquipmentType`, `MeasurementUnit`, plus (via include) `Sensor`, `TransmitterDevice`, `UnitConfiguration`, `UnitOperatingEnvelope`, `AlarmRule`, `CanonicalTag` | F1 `EquipmentUnit` → F4 `MeasurementUnit`. F1 `EquipmentCategory` enum removed. The unit-detail include projects sensors (with currently-installed transmitters only), current configuration / envelope / alarm rules — each alarm rule joined with a canonical-tag scalar. |
| **F4.4E** | `JobsModule` | `GET /api/v1/jobs`, `GET /api/v1/jobs/:id` | `Job`, `CommissioningSnapshot` (via include + a direct read helper), plus (via include) `Tenant`, `Well`, `MeasurementUnit`, `EquipmentType`, `User` | F1 `JOB-YYYY-NNNN` slug → UUID. `JobSensorSnapshot` rows collapsed into JSONB inside `commissioning_snapshots.sensor_mappings`. `CommissioningService` write surface retired; reduced to two read-only helpers. Ordering `startedAt desc nulls last → createdAt desc` (Prisma 5 syntax). |
| **F4.4F** | `TelemetryModule` | `GET /api/v1/telemetry/trends` | `TelemetryReading`, `CanonicalTag` | Single read endpoint. Bounded range scan with XOR refine on `canonicalTagId` / `canonicalTagName`; optional `jobId` / `quality` / `source` / `limit` (default 1000, max 5000). F1 ingestion contracts (`envelope.ts`, `ingestion-adapter.ts`, `telemetry.validator.ts`) deleted — F4.6 will design fresh ingestion. `UnitConverter` retained as a provider for future use, not called by the trends endpoint. |

## 5. Endpoint Inventory After F4.4

All routes mount under the global prefix `/api/v1` (per `apps/backend/src/main.ts`).

| # | Method | Path | Module | Read shape |
|---|---|---|---|---|
| 1 | `GET` | `/api/v1/tenants` | TenantsModule | List, ordered by `name`; optional `?status=active\|inactive`. |
| 2 | `GET` | `/api/v1/tenants/:id` | TenantsModule | One tenant by UUID. |
| 3 | `GET` | `/api/v1/wells` | WellsModule | List, ordered by `(tenantId asc, name asc)`; optional `?tenantId / ?fieldOrSite / ?type / ?fluid`; each row carries `tenant`. |
| 4 | `GET` | `/api/v1/wells/:id` | WellsModule | One well by UUID + nested `tenant`. |
| 5 | `GET` | `/api/v1/tags` | CanonicalTagsModule | Global dictionary, ordered by `(category asc, name asc)`; optional `?category / ?canonicalUnit / ?deprecated`. |
| 6 | `GET` | `/api/v1/tags/:name` | CanonicalTagsModule | One canonical tag by stable business name (e.g. `p_inlet`). |
| 7 | `GET` | `/api/v1/equipment/types` | EquipmentModule | Equipment-type templates ordered by `name asc`. |
| 8 | `GET` | `/api/v1/equipment/types/:id` | EquipmentModule | One equipment type by UUID. |
| 9 | `GET` | `/api/v1/equipment/units` | EquipmentModule | Measurement units list; optional `?tenantId / ?equipmentTypeId / ?status / ?operatingProfile`; each row carries a short `equipmentType` summary. |
| 10 | `GET` | `/api/v1/equipment/units/:id` | EquipmentModule | One unit by UUID with full detail include (sensors + transmitters + current configuration / envelope / alarm rules). |
| 11 | `GET` | `/api/v1/jobs` | JobsModule | List, ordered `startedAt desc nulls last → createdAt desc`; optional `?tenantId / ?wellId / ?unitId / ?status`; each row carries small `tenant / well / unit` summaries. |
| 12 | `GET` | `/api/v1/jobs/:id` | JobsModule | One job by UUID with detail (tenant + well with `designLimits` + unit with equipmentType + engineer + current `commissioningSnapshot`). |
| 13 | `GET` | `/api/v1/telemetry/trends` | TelemetryModule | Bounded range scan against `telemetry_readings` for one `unitId` + one canonical tag + time range; optional `?jobId / ?quality / ?source / ?limit`. Returns `{ unitId, canonicalTag, range, points: [...] }`. |

The only other active surface on the backend is `GET /health` (from `HealthModule`, always-active core). The Socket.IO gateway (`RealtimeModule`) is scaffolded but routes no telemetry payloads yet.

## 6. Canonical F4 Model Alignment

Every reactivated module reads through Prisma accessors that map 1:1 to the F4 canonical schema (`apps/backend/prisma/schema.prisma`, commit `e37f7b5`). The summary below records the field-level alignment per domain:

### 6.1 Tenant (F4.4A)

- Identifier: `id` (`String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`).
- Surfaced fields: `name`, `status` (CHECK `active | inactive`), `residencyHint`, `createdAt`, `updatedAt`.
- CHECK mirror in code: `TENANT_STATUSES = ['active','inactive'] as const`.

### 6.2 Well (F4.4B)

- Identifier: UUID.
- Surfaced fields: `tenantId`, `clientId` (nullable, reserved), `name`, `fieldOrSite`, `location`, `type`, `fluid`, `designLimits` (JSONB), `createdAt`, `updatedAt`.
- F4-aligned filters (UUID for IDs; equality for scalar fields).

### 6.3 CanonicalTag (F4.4C)

- Identifier: UUID primary key + `name @unique` business key (the only F4.4 module that routes by name rather than UUID — preserves the F4 §C "name is the contract" invariant).
- Surfaced fields: `name`, `displayName`, `canonicalUnit`, `category`, `precision`, `description`, `deprecated`.
- Optional filters: `category` / `canonicalUnit` (string equality) + `deprecated` (string-enum → boolean conversion at the controller because `ZodValidationPipe<T>` types its schema as `ZodSchema<T>` and rejects `.transform()`).

### 6.4 Equipment (F4.4D)

- **EquipmentType** (global, not tenant-scoped). Surfaced: `id`, `name` (unique), `description`, `defaultSensorTemplate` (JSONB), `pidReference`.
- **MeasurementUnit** (tenant-scoped, F4 §D). Surfaced: `id`, `tenantId`, `equipmentTypeId`, `code` (compound unique `(tenant_id, code)`), `serialNumber`, `name`, `status`, `operatingProfile`, `location`.
- CHECK mirrors: `MEASUREMENT_UNIT_STATUSES`, `MEASUREMENT_UNIT_OPERATING_PROFILES`.
- Detail include: `equipmentType` + ordered `sensors` (with currently-installed `transmitterDevices`) + current `unitConfigurations` + current `unitOperatingEnvelopes` + current `alarmRules` (with canonical-tag scalar joined).

### 6.5 Job + CommissioningSnapshot (F4.4E)

- **Job** identifier: UUID; F4 `commissioning_snapshot_id` nullable FK (circular FK resolved at migration layer). Surfaced: `tenantId`, `wellId`, `unitId`, `engineerId`, `status`, `startedAt`, `closedAt`, `createdAt`, `updatedAt`.
- CHECK mirror: `JOB_STATUSES = ['programmed','in_progress','closed']`.
- Detail include: tenant, well (with `designLimits`), unit (with nested `equipmentType`), engineer placeholder, current `commissioningSnapshot` (via `JobCurrentSnapshot` named relation).
- **CommissioningSnapshot** is treated as an immutable read model in F4.4E. The two read-only helpers (`findById`, `findLatestByJobId`) exist but are consumed only indirectly via the job-detail include. F1's write surface (`createJobWithSnapshot`, `assertSnapshotMutable`, `assertJobMutable`) is retired; F4 enforces immutability via the CHECK constraint `immutable = TRUE` + a future trigger / GRANT hardening pass.

### 6.6 Telemetry trends (F4.4F)

- **TelemetryReading**. Read via `prisma.telemetryReading.findMany` with bounded `where` (unitId + canonicalTagId + timestamp range + optional filters), `orderBy: { timestamp: 'asc' }`, `take: limit`, `select: { timestamp, value, engineeringUnit, quality, source }`.
- CHECK mirrors: `TELEMETRY_QUALITIES = ['good','uncertain','bad']`, `TELEMETRY_SOURCES = ['mock','manual','field_gateway','historian','plc','mqtt','node_red','opc_ua','modbus','edge_gateway']`.
- Canonical tag hydrated via `CanonicalTagResolver.resolve({ id })` or `{ name }`; the response includes `{ id, name, displayName, canonicalUnit, category, precision }`.
- No unit conversion at read time; consumers receive the stored `engineeringUnit` verbatim.

### 6.7 Caller-context scoping seam

Every reactivated service that operates on a tenant-scoped table (wells, equipment units, jobs, telemetry) preserves the `CallerContext.tenantId` seam:

- When the seam is set (post-auth), the `where` clause filters by tenant.
- When the seam is empty (current `SystemContext`), reads are cross-tenant.
- Where applicable, the seam wins over any manual `?tenantId=` query parameter.

This posture is identical across F4.4A–F and matches the F1 design.

## 7. Intentional Breaking Changes vs F1 / F1.5

F4.4 makes several intentional, documented shape changes vs the F1 API contract:

| F1 / F1.5 | F4.4 | Driver |
|---|---|---|
| `GET /api/v1/tenants/:code` (slug `repsol`) | `GET /api/v1/tenants/:id` (UUID) | F4 dropped the soft `code` column on `tenants`. |
| `?kind=rvf_internal\|client` | `?status=active\|inactive` | F4 removed the `TenantKind` enum; `status` is the F4-native filter. |
| `GET /api/v1/wells/:tenantCode/:code` | `GET /api/v1/wells/:id` (UUID) | F4 dropped per-tenant soft codes; UUID is the only stable identifier. |
| `?tenantCode=` (slug) | `?tenantId=` (UUID) | F4 Tenant has no slug. |
| `well.siteCode` / `well.wellType` | `well.fieldOrSite` / `well.type` | Field renames per F4 §F. |
| `well.tenant.code` | `well.tenant.id` / `name` / `status` | F4 Tenant scalar shape changed. |
| `canonical_tags.unit` / `unitClass` | `canonical_tags.canonicalUnit` / `category` | Field renames per F4 §C. |
| `canonical_tags.decimals` | `canonical_tags.precision` | Renamed. |
| (n/a) | `canonical_tags.deprecated` (BOOLEAN) | New F4 deprecation flag (ADR-003 "rows are never deleted"). |
| `EquipmentUnit` (model) | `MeasurementUnit` (model) | Conceptual rename in F4 §D. |
| `equipment_types.code` (slug) / `category` (enum) | (removed) | F4 dropped soft codes + `EquipmentCategory`. |
| `equipment_units.code` (cuid unique) | `measurement_units.code` (compound unique `(tenant_id, code)`) | F4 tenant-scopes units. |
| `Sensor.signalFireDevice` (1:1) | `Sensor.transmitterDevices` (1:N filtered to installed) | F4 generalises beyond SignalFire + preserves history. |
| `GET /api/v1/equipment/units/:code` | `GET /api/v1/equipment/units/:id` (UUID) | UUID identification. |
| `?typeCode=EMMAD` / `?category=emmad` | `?equipmentTypeId=<UUID>` (no category) | F4 dropped `category`. |
| `jobs.code` (slug `JOB-YYYY-NNNN`) | (removed) | UUID-only identification. |
| `jobs.notes` | (removed) | F4 routes operational metadata through `audit_logs`. |
| `Job.equipmentUnit` relation | `Job.unit` relation | Model rename. |
| `Job.snapshot` (1:1) + `JobSensorSnapshot[]` (normalized) | `Job.commissioningSnapshot` (FK via `JobCurrentSnapshot`) + `sensorMappings` JSONB | F4 collapses normalized snapshot rows into JSONB. |
| `?tenantCode=` on jobs | `?tenantId=` (UUID) | UUID-based filters. |
| `GET /telemetry/jobs/:code/series` (with `?bucket=raw\|1m\|15m\|1h`) | `GET /telemetry/trends` (no bucket; raw range scan only) | F4 dropped TimescaleDB hypertables + continuous aggregates. F4.6 will decide on aggregate views. |
| `GET /telemetry/jobs/:code/last`, `POST /telemetry` | (removed) | F1 placeholders deleted. F4.5 / F4.6 own the live-readings and ingestion concerns respectively. |
| F1 ingestion envelope `rvf.telemetry.v1`, `IngestionAdapter` interface, `LateTelemetryReason` enum | (removed) | F4.6 will design fresh ingestion; the F1 contracts encoded an F2-era architecture that F4 doesn't preserve verbatim. |

**Frontend impact.** The frontend currently reads from the F3 `lib/api-data/` mock adapter, which encodes the old F1 contract shapes locally. None of these breaking changes affect any rendered UI today. F4.5 must reconcile every place the frontend constructs a backend route or destructures a response, screen by screen.

## 8. Quarantine Closure

The F4.2B insulation phase (`e37f7b5`) introduced three quarantine surfaces to keep the backend compiling while the F4 Prisma schema replaced the F1 one:

1. `apps/backend/tsconfig.json` `exclude` — kept feature directories out of `tsc --noEmit` and `nest build`.
2. `apps/backend/eslint.config.mjs` `ignores` (layered) — kept the same directories out of ESLint's typed-rule run.
3. `apps/backend/vitest.config.ts` `exclude` — kept their specs from being collected by `pnpm test`.

F4.4F removed the last feature-directory entry from each. As of commit `5e92a13` the three files are back to their F4.2B-pre-quarantine baseline:

- `tsconfig.json` `exclude` is `["node_modules", "dist", "test"]`.
- `eslint.config.mjs` is a single line: `export default nest;`.
- `vitest.config.ts` `exclude` is `["node_modules/**", "dist/**"]`.

Per-directory closure timeline:

| Directory | Removed from excludes in |
|---|---|
| `src/tenants/**` | F4.4A (`2f5c108`) |
| `src/wells/**` | F4.4B (`20dadca`) |
| `src/tags/**` | F4.4C (`0ec1099`) |
| `src/equipment/**` | F4.4D (`3cdee45`) |
| `src/jobs/**` | F4.4E (`ebaa23b`) |
| `src/telemetry/**` | F4.4F (`5e92a13`) |

`apps/backend/src/app.module.ts` was updated atomically with each sub-phase to re-import the corresponding module. As of `5e92a13`, the `imports` array carries every feature module:

```
ConfigModule, LoggerModule, PrismaModule, HealthModule, RealtimeModule,
TenantsModule, WellsModule, CanonicalTagsModule, EquipmentModule,
JobsModule, TelemetryModule.
```

The F4.2B-introduced quarantine machinery is fully unwound.

## 9. Test / Quality Gate Summary

Each sub-phase reports the same set of quality gates green per its closeout document:

- `pnpm --filter @rvf/backend exec prisma validate` — schema valid.
- `pnpm --filter @rvf/backend exec prisma generate` — client generated.
- `pnpm --filter @rvf/backend run lint` — clean exit.
- `pnpm --filter @rvf/backend run typecheck` — clean (chains `tsc --noEmit` for `src/` with `tsc -p prisma/tsconfig.json --noEmit` for the seed).
- `pnpm --filter @rvf/backend run build` — clean (`nest build`).
- `pnpm --filter @rvf/backend run test` — green; spec count grows monotonically as each sub-phase adds its mocked-Prisma suite.
- `pnpm run lint` (workspace) — 4/4 tasks successful.
- `pnpm run typecheck` (workspace) — 4/4 tasks successful.
- `pnpm run build` (workspace) — 2/2 tasks successful.

Final state at F4.4F (commit `5e92a13`): **69 backend tests passed across 10 spec files**, workspace-wide lint / typecheck / build green. No DB connection required by any spec.

Test file breakdown at F4.4 close:

| Spec | Tests |
|---|---|
| `health.controller.spec.ts` | 1 |
| `tenants.service.spec.ts` | 6 |
| `wells.service.spec.ts` | 7 |
| `tags.service.spec.ts` | 7 |
| `equipment.service.spec.ts` | 10 |
| `jobs.service.spec.ts` | 7 |
| `commissioning.service.spec.ts` | 4 |
| `unit-converter.spec.ts` | 16 |
| `canonical-tag-resolver.spec.ts` | 6 |
| `trends.service.spec.ts` | 5 |
| **Total** | **69** |

## 10. Known Limitations

1. **No real-DB end-to-end coverage.** Every spec runs against a mocked Prisma surface. A developer's local Postgres may still hold the F1 schema until they choose to run the documented destructive volume reset (`docker compose down -v && docker compose up -d postgres && pnpm prisma migrate dev && pnpm prisma:seed:f4`); the F4.2B closeout (§11) and the F4.3 seed report (§5.1) document the procedure. F4.4 did not exercise the seed → API loop on any real DB on this host.
2. **`telemetry_readings` is empty until F4.6.** F4.3 does not seed telemetry. `GET /api/v1/telemetry/trends` therefore returns `points: []` on an F4.2 baseline — by design and asserted by the F4.4F spec.
3. **No ingestion.** No code path writes to `telemetry_readings`. F4.6 owns this.
4. **No live-readings projection.** `live_readings_projection` view exists in the migration but is not queried by any F4.4 service. F4.5 / F4.6 will decide implementation (raw view vs materialized view vs upsert table vs application cache).
5. **No WebSocket telemetry fan-out.** The `RealtimeModule` Socket.IO gateway is scaffolded but routes no telemetry payloads.
6. **No alarm-event generation.** No row is written to `alarm_events`. The `EquipmentModule` unit-detail surfaces alarm **rules** (configuration) but not alarm **events** (history).
7. **No frontend wiring.** Every screen still consumes the F3 `lib/api-data/` mock adapter. F4.5 owns the cut-over.
8. **UUID routes instead of F1 slugs.** Every by-id endpoint expects a UUID and rejects malformed input with `400 Bad Request` via `ParseUUIDPipe`. The single exception is `/api/v1/tags/:name`, which preserves the F4 §C "name is the contract" stable business key.
9. **CHECK constraints mirrored as application-side tuples.** `TENANT_STATUSES`, `MEASUREMENT_UNIT_STATUSES`, `MEASUREMENT_UNIT_OPERATING_PROFILES`, `JOB_STATUSES`, `TELEMETRY_QUALITIES`, `TELEMETRY_SOURCES`. Prisma does not model CHECK constraints; the mirrors require code-review discipline to stay in sync with the migration SQL.
10. **Prisma cannot enforce all DB constraints at the type level.** CHECK constraints, partial unique indexes (e.g. `WHERE is_current = TRUE`), and the `live_readings_projection` view are DB-only. Application code can still send invalid input that surfaces only at the Postgres boundary.
11. **`points[].value` JSON-serializes to a string** (Prisma `Decimal.toJSON`). Consumers that need a JavaScript `number` call `Number(value)`. Documented in F4.4F §3.3.
12. **No controller-level integration specs.** Service specs cover business logic; controller wiring (`@Get`, `@Param`, pipes) is implicitly covered by upstream Nest tests. Integration coverage against a real DB returns once the F4 test harness lands.
13. **Some sub-phases noted small Swagger fidelity gaps** (e.g. `ApiQueryOptions` rejecting `format: 'uuid'`). Runtime Zod validation still enforces UUID shape; the OpenAPI document simply does not advertise the format string in those places. Out-of-scope to fix in F4.4.

## 11. Operational Impact

- **Backend is F4-ready.** All six F1 feature modules are now back online on the F4 canonical client. The Nest application bootstraps cleanly (`nest build` is green); `PrismaService.onModuleInit` will call `$connect()` against `DATABASE_URL` when the app actually runs, but no F4.4 quality gate requires a live DB.
- **UI is unblocked for F4.5.** With 12 read endpoints already returning F4.3-seeded data (tenants, wells, canonical tags, equipment types + units, jobs + commissioning snapshot), the frontend can begin migrating screens from the F3 mock adapter to the live API one at a time. The 13th endpoint (`/telemetry/trends`) is wired and exercising the right Prisma query but waits for F4.6 to be useful.
- **Test posture is mocked-Prisma uniform.** The F1 live-DB suites (`new PrismaClient()` against a real Postgres) are gone. CI can run the backend test suite without provisioning a database — already the case (workspace `pnpm run test` runs cleanly with no `docker compose up`).
- **Quarantine machinery is gone from the active config.** New developers will not see `src/<feature>/**` excludes in `tsconfig.json` / `eslint.config.mjs` / `vitest.config.ts` and will not need to remember the F4.2B context to make changes in any feature directory.

## 12. Recommended Next Phase

**Recommend F4.5 — UI / API wiring for the non-telemetry read endpoints — as the next phase**, with **F4.6 architecture + ADR work as the parallel stream**.

Rationale:

- **F4.5 can deliver immediate, visible user value.** Twelve of the thirteen reactivated endpoints already return deterministic F4.3-seeded data. The Units / Wells / Tags / Equipment / Jobs screens can phase off the mock adapter without waiting for any further backend work.
- **F4.6 should not start with code.** Telemetry persistence introduces decisions with long shadows: ingestion-adapter design (single process vs sidecars vs Kubernetes-style), MQTT / OPC-UA / Modbus client choice, deduplication strategy (`integration_mappings.external_identifier` uniqueness vs an app-layer dedup window), late-arrival quarantine, live-readings projection mechanism (the F4.1 SQL view? a materialized view? an upsert-maintained projection table? an application cache?), and WebSocket fan-out. **F4.6 should open with an architecture document and an ADR**, both reviewed before any implementation lands. The F1 ingestion design (envelope `rvf.telemetry.v1`, `IngestionAdapter` interface, `LateTelemetryQuarantine` model) was deleted in F4.4F; F4.6 will design afresh against the F4 `telemetry_readings` columns and the `integration_sources` / `integration_mappings` placeholders.

Suggested sequencing:

1. **F4.5a** — frontend cuts non-telemetry screens (tenants list, wells list, canonical-tag dictionary, equipment types + units, jobs list + detail) from the mock adapter to the live `/api/v1/{tenants,wells,tags,equipment,jobs}` endpoints, one screen per PR. Reconcile the breaking shape changes documented in §7 (UUIDs instead of slugs, renamed fields, new include shapes).
2. **F4.6 architecture + ADR** — open an architecture doc (`docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Architecture.md`) and a fresh ADR (e.g. `ADR-008`). Decide ingestion topology, dedup policy, projection mechanism, WebSocket fan-out, and alarm-event evaluation policy before writing implementation code.
3. **F4.6 implementation** — wire the first ingestion adapter (probably `manual` / `historian` REST POST first for testability, then `mqtt`). Lands a `POST /api/v1/telemetry` (or whatever the ADR settles on), writes to `telemetry_readings`, optionally maintains `live_readings_projection`.
4. **F4.5b** — once F4.6 populates the table, the trends / Operations screens cut from the mock adapter to the live `/api/v1/telemetry/trends` endpoint.
5. **A later phase** — alarm-event evaluation against `alarm_rules` × `telemetry_readings`, WebSocket broadcast of new alarms, real authentication.

If team capacity favors a different ordering, **F4.5 alone is a perfectly safe next phase** — the frontend reads do not require F4.6 to make progress on five of the six feature areas.

## 13. Acceptance Criteria

F4.4 is considered complete because:

1. All six reactivation sub-phases (F4.4A → F4.4F) are committed: `2f5c108`, `20dadca`, `0ec1099`, `3cdee45`, `ebaa23b`, `5e92a13`.
2. Every module quarantined in F4.2B is now active in `apps/backend/src/app.module.ts`: `TenantsModule`, `WellsModule`, `CanonicalTagsModule`, `EquipmentModule`, `JobsModule`, `TelemetryModule`.
3. Every module compiles against the F4 Prisma client; `prisma validate` is green; `prisma generate` is green.
4. Every quality gate the sub-phases reported is green at the final state: backend lint, backend typecheck, backend build, backend tests (69/69 across 10 files), workspace lint, workspace typecheck, workspace build.
5. The F4.2B quarantine machinery is fully unwound — `tsconfig.json`, `eslint.config.mjs`, and `vitest.config.ts` carry no feature-directory exclude / ignore.
6. No frontend, no Prisma schema change, no migration change, no seed change, no telemetry ingestion, no live-readings projection, no alarm-event generation, no WebSocket telemetry routing was implemented by any F4.4 sub-phase.
7. A per-sub-phase closeout report exists under `docs/architecture/RVF_Malinois_F4_4{A,B,C,D,E,F}_*.md`.
8. This consolidated F4.4 closeout report exists at `docs/architecture/RVF_Malinois_F4_4_API_Reactivation_Closeout_Report.md`.

## 14. Out of Scope

Repeated explicitly so the reader cannot infer F4.4 quietly shipped any of these:

- **F4.5 UI wiring.** No file under `apps/web/` was modified by any F4.4 sub-phase.
- **F4.6 telemetry persistence / ingestion.** No write to `telemetry_readings`, no ingestion adapter, no MQTT / Node-RED / ThingsBoard / OPC-UA / Modbus client, no `integration_sources` / `integration_mappings` populated beyond the disabled F4.3 placeholder.
- **Live-readings projection.** The `live_readings_projection` view is defined in the F4.2 baseline migration but is not queried by any F4.4 service.
- **WebSocket telemetry broadcasting.** `RealtimeModule` is scaffolded only.
- **Real-time alarm-event generation.** No `alarm_events` rows are written.
- **Reports module.** Not in F4 scope.
- **Real authentication.** `CallerContext` is plumbed but inert.
- **Production deployment.** No production target exists. Developer-driven local reset is the only DB workflow documented.
- **External integrations.** ThingsBoard / Node-RED / MQTT / OPC-UA / Modbus all defer to F4.6.

---

*F4.4 closeout. Recommended next phase: F4.5 UI / API wiring (immediate) + F4.6 architecture + ADR in parallel before ingestion code.*
