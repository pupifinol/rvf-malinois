# RVF Malinois — F4.5 UI/API Wiring Foundation Closeout Report

> Phase **F4.5 — UI / API Wiring Foundation** (closeout).
> Documentation-only deliverable. Consolidates the five sub-phase reports
> (F4.5A → F4.5E) into a single record of what changed across the F4.5
> arc, what remains out of scope, and what the platform looks like as
> F4.5 completes.
>
> Upstream references:
> - F4.4 closeout: `docs/architecture/RVF_Malinois_F4_4_API_Reactivation_Closeout_Report.md` (commit `e6b40b6`)
> - F4.4F telemetry backend: `docs/architecture/RVF_Malinois_F4_4F_Telemetry_API_Reactivation_Report.md` (commit `5e92a13`)
> - F4 architecture: `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md` (commit `f36923a`)
> - ADR-007: `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md` (commit `8147399`)
> - F4.5A → F4.5E sub-phase reports: see §3 commit timeline.

## 1. Executive Summary

F4.5 closes the gap between the F4 backend API (reactivated module-by-module in F4.4A → F4.4F) and the frontend. The arc is **foundation-only**: it builds a controlled, fully tested, opt-in path for the frontend to consume the live F4 API without touching any rendered screen, hook, route handler, or visual component. The F3 mock adapter (`apps/web/lib/api-data/index.ts` + its `mockUnits` / `mockSensors` / `mockAlarms` / `mockTelemetry` siblings) remains the default data source; the existing UI continues to render exactly as it did before F4.5A landed.

The arc delivered five layers, in order:

1. **F4.5A** — a tiny F4 API client foundation (`apps/web/lib/api/f4/`): config + safe `GET` wrapper + typed endpoint wrappers + frontend types + `RvfApiError` class. Two env vars (`NEXT_PUBLIC_RVF_DATA_SOURCE`, `NEXT_PUBLIC_RVF_API_BASE_URL`) gate the integration. Default: `mock`.
2. **F4.5B** — data-source-aware adapters for `Tenants` / `Wells` / `CanonicalTags`, with deterministic mock fixtures mirroring the F4.3 seed.
3. **F4.5C** — `EquipmentType` + `MeasurementUnit` adapters with the first set of view-model helpers (`derive{Sensors,Alarms}Count`, `derive{Pressure,Flow,Gas}Unit`, `toMeasurementUnitSummaryViewModel`) for the F3-vs-F4 shape gap.
4. **F4.5D** — `Job` + `CommissioningSnapshot` adapter with three jobs-specific helpers (`deriveJobRuntime`, `deriveCommissioningSummary`, `toJobListItemViewModel`).
5. **F4.5E** — telemetry-trends adapter with two deterministic 60-point synthetic traces (HP-001 / `p_inlet`, HP-001 / `q_gas`) and three numeric-conversion helpers (`toNumericTelemetryPoint`, `toNumericTelemetrySeries`, `isTelemetryTrendEmpty`).

Every F4.4 read endpoint now has a parallel `@/lib/api-data/f4/` adapter ready for screen-by-screen migration. The frontend bundle output is byte-for-byte unchanged for every existing route — the new adapters tree-shake away from current consumers. The frontend test suite grew from **219 → 311 tests across 27 → 33 files** without rewriting a single pre-existing test. No backend, Prisma, migration, seed, or screen / component / hook / route handler was modified across F4.5. The arc is reversible per env var (`NEXT_PUBLIC_RVF_DATA_SOURCE=mock` restores the mock branch) and per phase (each commit is self-contained).

## 2. Scope of F4.5

### Included

- **Frontend API client foundation** at `apps/web/lib/api/f4/` (F4.5A): `config.ts`, `client.ts`, `errors.ts`, `types.ts`, `endpoints.ts`, `index.ts`.
- **Data-source switch** via `NEXT_PUBLIC_RVF_DATA_SOURCE` (mock | api; default `mock`) and `NEXT_PUBLIC_RVF_API_BASE_URL` (default `http://localhost:4000/api/v1`).
- **Typed F4 endpoint wrappers** for all 13 F4.4 read endpoints.
- **F4 adapters for Tenants / Wells / Tags** (F4.5B): `tenants.ts`, `wells.ts`, `tags.ts`.
- **F4 adapters for Equipment / Units** (F4.5C): `equipment.ts` with `EquipmentType` + `MeasurementUnit` (list + detail).
- **F4 adapter for Jobs** (F4.5D): `jobs.ts` with `Job` (list + detail) + `CommissioningSnapshot` read model.
- **F4 adapter for Telemetry Trends** (F4.5E): `telemetry.ts` with synthetic mock traces + numeric helpers.
- **F4 mock fixtures** at `apps/web/lib/api-data/f4/mock-fixtures.ts` mirroring the F4.3 seed where applicable.
- **View-model helpers** for F3-vs-F4 shape gaps (12 helpers total across F4.5C–E).
- **Tests** for adapters, source switching, mock determinism, API URL composition, validation parity, and every helper.
- **Per-sub-phase closeout reports** under `docs/architecture/`.

### Excluded

The following concerns are **not** part of F4.5 and remain for later phases:

- **Screen migration.** No page or component was modified. Every screen continues to read from the F3 mock adapter (`apps/web/lib/api-data/index.ts`).
- **UI redesign.** No CSS / Tailwind / component-shape change.
- **Operations chart wiring.** The Operations / Units screens still draw from the simulated / mock adapter.
- **Units live-readings wiring.** No `live_readings_projection` query, no real-time value chips.
- **Expanded chart view.**
- **Telemetry ingestion.** No `POST /telemetry`, no MQTT / Node-RED / ThingsBoard / OPC-UA / Modbus client, no insert into `telemetry_readings`. F4.6.
- **WebSocket telemetry broadcasting.** `lib/realtime/` is untouched.
- **Alarm-event generation.** No row written to `alarm_events`.
- **Backend changes** of any kind. No file under `apps/backend/`.
- **Prisma / migration / seed changes.** No file under `apps/backend/prisma/`.
- **Authentication.** `RvfApiError` does not carry auth headers; `getJson` does not inject them. ADR-007 §7 keeps auth out of F4.
- **Production deployment.** No CI / CD wiring. No production secrets. `NEXT_PUBLIC_RVF_API_BASE_URL` defaults to `http://localhost:4000/api/v1`.

## 3. Commit Timeline

### F4.5 arc

| Commit | Sub-phase | Title |
|---|---|---|
| `20d45ec` | **F4.5A** | Add F4.5A frontend API client foundation |
| `4b824d7` | **F4.5B** | Add F4.5B tenants wells tags API wiring |
| `f7ecf6c` | **F4.5C** | Add F4.5C equipment units API wiring |
| `9d24831` | **F4.5D** | Add F4.5D jobs API wiring |
| `6af42fa` | **F4.5E** | Add F4.5E telemetry trends API wiring |

### Upstream references

| Commit | Title |
|---|---|
| `e6b40b6` | Add F4.4 API reactivation closeout report |
| `5e92a13` | Reactivate F4.4F telemetry trends API |

## 4. F4.5A — API Client Foundation Summary

Files added under `apps/web/lib/api/f4/`:

| File | Purpose |
|---|---|
| `config.ts` | `RVF_DATA_SOURCES` tuple; `resolveDataSource` / `resolveApiBaseUrl` pure resolvers (test seam); `getDataSource` / `getApiBaseUrl` / `isMockSource` / `isApiSource` runtime helpers. Default `mock`. Unknown values fall back to `mock`. |
| `client.ts` | `buildUrl<P extends object>(baseUrl, path, params?)` + `getJson<T, P extends object>(path, params?, options?)`. `GET`-only safe fetch wrapper: composes URL, attaches `Accept: application/json`, forwards `AbortSignal`, parses JSON, surfaces every failure as `RvfApiError`. |
| `errors.ts` | `RvfApiError extends Error` with `status` (0 for network failures), `url`, `body`. Single error class for both branches of the adapter layer. |
| `types.ts` | Frontend types for every F4.4 response shape (Tenant, Well, CanonicalTag, EquipmentType, MeasurementUnit{ListRow,Detail}, Job{ListRow,Detail}, CommissioningSnapshot, TelemetryTrendsResponse, plus 25+ supporting types). **No `@prisma/client` import.** Hand-authored from the F4.4A → F4.4F report tables. |
| `endpoints.ts` | 13 typed wrappers (`listTenants` / `getTenant`, `listWells` / `getWell`, `listCanonicalTags` / `getCanonicalTag`, `listEquipmentTypes` / `getEquipmentType`, `listMeasurementUnits` / `getMeasurementUnit`, `listJobs` / `getJobById`, `getTelemetryTrends`). |
| `index.ts` | Barrel export. Consumers import from `@/lib/api/f4`. |

Key design decisions:

- **No Prisma types reach the frontend.** Types are hand-authored against the JSON shape the F4.4 controllers emit.
- **Decimal values surface as strings.** Prisma `Decimal.toJSON` serializes to a string; every NUMERIC-backed field on the frontend types is typed `string` with an inline `/** Decimal — serialized as a string. */` comment. Consumers needing math call `Number(value)`.
- **No retry / cache / dedup / auth.** Single `fetch` per call. Screens migrating to the adapter layer should wrap with TanStack Query (already a frontend dependency).
- **Generic-over-params `getJson`.** `<P extends object>` keeps endpoint-wrapper `interface` types from needing an explicit index signature.

## 5. Data Source Switch

Two public env vars gate the F4 integration:

| Variable | Default | Effect |
|---|---|---|
| `NEXT_PUBLIC_RVF_DATA_SOURCE` | `mock` | `mock` → every adapter serves from in-memory F4 fixtures. `api` → opt-in: adapters delegate to the F4.5A endpoint wrappers. Unknown / typo values (`apii`, `production`, `MOCK`) fall back to `mock` — `resolveDataSource` never throws. |
| `NEXT_PUBLIC_RVF_API_BASE_URL` | `http://localhost:4000/api/v1` | F4 backend base URL. Trailing slashes are stripped. Matches `apps/backend/src/main.ts` global prefix `/api/v1`. |

Behavior guarantees:

1. **Mock mode never calls `fetch`.** Every sub-phase test installs a throwing-fetch guard before mock-mode cases run; every test passes.
2. **API mode does not silently fall back to mock.** A network failure, 4xx, or 5xx surfaces as `RvfApiError(status, url, body)` to the caller. Silent fallback would mask backend bugs and contradict the F4.5A error-handling contract.
3. **The switch is per-request, not per-app.** `getDataSource()` is consulted on each adapter call. Toggling `NEXT_PUBLIC_RVF_DATA_SOURCE` at build time inlines the value for the bundle (Next.js convention).
4. **Pure resolvers exist** (`resolveDataSource(raw)`, `resolveApiBaseUrl(raw)`) so tests drive the switch deterministically — the runtime helpers read `process.env.NEXT_PUBLIC_*`, which Next.js inlines.
5. **`apps/web/lib/env.ts`** exposes `rvfDataSource` and `rvfApiBaseUrl` alongside the existing `apiUrl` / `wsUrl` / `telemetrySource` entries for callers who prefer the central `publicEnv` import.

## 6. Adapter Inventory After F4.5

Every F4.4 read endpoint has a parallel adapter under `apps/web/lib/api-data/f4/`. The mock branch returns deterministic F4-shaped fixtures; the api branch delegates to the F4.5A wrapper.

| Domain | Adapter file | Functions exported | Mock fixtures | F4.5A wrapper used | Helper functions |
|---|---|---|---|---|---|
| Tenants | `tenants.ts` | `adapterListTenants`, `adapterGetTenant` | `MOCK_F4_TENANTS` (1 row: RVF Internal) | `listTenants` / `getTenant` | — |
| Wells | `wells.ts` | `adapterListWells`, `adapterGetWell` | `MOCK_F4_WELLS` (1 row: Reference Well A, with tenant include) | `listWells` / `getWell` | — |
| Canonical Tags | `tags.ts` | `adapterListCanonicalTags`, `adapterGetCanonicalTag` | `MOCK_F4_CANONICAL_TAGS` (22 rows mirroring F4.3 seed) | `listCanonicalTags` / `getCanonicalTag` | — |
| Equipment Types | `equipment.ts` | `adapterListEquipmentTypes`, `adapterGetEquipmentType` | `MOCK_F4_EQUIPMENT_TYPES` (EMMAD + EMGAD) | `listEquipmentTypes` / `getEquipmentType` | — |
| Measurement Units | `equipment.ts` | `adapterListMeasurementUnits`, `adapterGetMeasurementUnit` | `MOCK_F4_MEASUREMENT_UNITS` (HP-001 + LP-001 list rows) + `MOCK_F4_MEASUREMENT_UNIT_DETAILS` (HP-001 full include: 7 sensors + 14 alarm rules + current config + current envelope; LP-001 representative) | `listMeasurementUnits` / `getMeasurementUnit` | `deriveSensorsCount`, `deriveAlarmsCount`, `derivePressureUnit`, `deriveFlowUnit`, `deriveGasUnit`, `toMeasurementUnitSummaryViewModel` |
| Jobs | `jobs.ts` | `adapterListJobs`, `adapterGetJob` | `MOCK_F4_JOBS` (1 reference list row) + `MOCK_F4_JOB_DETAILS` (HP-001 reference job with full include) + `MOCK_F4_COMMISSIONING_SNAPSHOTS` | `listJobs` / `getJobById` | `deriveJobRuntime`, `deriveCommissioningSummary`, `toJobListItemViewModel` |
| Telemetry Trends | `telemetry.ts` | `adapterGetTelemetryTrends` | `MOCK_F4_TELEMETRY_TRENDS` (HP-001 / p_inlet @ 60 pts in psi; HP-001 / q_gas @ 60 pts in MMSCFD) + `MOCK_F4_TRENDS_RANGE` metadata | `getTelemetryTrends` | `toNumericTelemetryPoint`, `toNumericTelemetrySeries`, `isTelemetryTrendEmpty` |

Plus three orchestration files:

| File | Purpose |
|---|---|
| `mock-fixtures.ts` | Single source of all F4 mock data. Builder helpers (`buildSensorsWithTransmitters`, `buildAlarmRules`, `buildUnitConfiguration`, `buildUnitOperatingEnvelope`, `buildSyntheticPoints`) keep the file readable. Deterministic FNV-1a-flavored hash generates 12-hex-digit UUID suffixes from descriptive keys. |
| `index.ts` | Barrel: re-exports every adapter, helper, type alias, and fixture so consumers import from `@/lib/api-data/f4`. |
| `adapter.test.ts` + per-domain `*.test.ts` | Six test files; collectively 92 mocked-`fetch` tests. |

## 7. Fixtures Inventory

Every fixture is deterministic — no `Math.random`, no `Date.now`, no time-of-day dependency. UUIDs are placeholders shaped `00000000-0000-0000-0000-XXXXXXXXXXXX`; the leading 28 zero bits guarantee disjoint namespace from real `gen_random_uuid()` ids so a mock fixture cannot accidentally match a real DB row.

| Fixture | Rows | Source alignment |
|---|---|---|
| `MOCK_F4_TENANTS` | 1 — `RVF Internal` (`status: 'active'`, `residencyHint: 'local-dev'`) | mirrors F4.3 seed exactly |
| `MOCK_F4_WELLS` | 1 — Reference Well A (`fieldOrSite: 'Reference Field'`, `type: 'test'`, `fluid: 'multiphase'`, with tenant include) | mirrors F4.3 seed exactly |
| `MOCK_F4_CANONICAL_TAGS` | 22 — full F4.3 seed dictionary (pressure / temperature / flow / volume / level / vibration / status) | mirrors F4.3 seed exactly; deterministic ids derived from tag name |
| `MOCK_F4_EQUIPMENT_TYPES` | 2 — EMMAD + EMGAD with `defaultSensorTemplate` JSON | mirrors F4.3 seed |
| `MOCK_F4_MEASUREMENT_UNITS` | 2 — HP-001 + LP-001 list rows with `equipmentType` summary | mirrors F4.3 seed |
| `MOCK_F4_MEASUREMENT_UNIT_DETAILS` | 2 (lookup) — HP-001 full include (7 sensors + transmitters installed-only + 14 alarm rules + 1 current config + 1 current envelope); LP-001 representative subset (2 sensors + 2 alarm rules) | HP-001 mirrors F4.3 seed; LP-001 trimmed for fixture readability (HP-001 already exercises the full include shape) |
| `MOCK_F4_JOBS` | 1 — HP-001 reference list row | mirrors F4.3 seed exactly |
| `MOCK_F4_JOB_DETAILS` | 1 (lookup) — HP-001 reference job with full include + commissioning snapshot | mirrors F4.3 seed |
| `MOCK_F4_COMMISSIONING_SNAPSHOTS` | 1 — immutable snapshot (7 sensor mappings + 14 effective thresholds + 14 rule versions + engineering envelope) | derived from HP-001 sensor / alarm seeds — no data duplication |
| `MOCK_F4_TELEMETRY_TRENDS` | 2 traces (lookup) — HP-001 / `p_inlet` @ 60 pts in psi; HP-001 / `q_gas` @ 60 pts in MMSCFD | **synthetic** — F4.3 does not seed `telemetry_readings`; F4.5E synthesizes closed-form sinusoidal data so screen-readiness work doesn't wait for F4.6. Range is `2026-05-24T00:00:00Z` → `+60 min`, one point per minute. Values stay within F4.5C alarm thresholds. |

Why two scopes coexist:

- **F3 mock files** (`apps/web/lib/api-data/{index,mockUnits,mockSensors,mockAlarms,mockTelemetry}.ts`) remain **byte-for-byte untouched**. They feed the existing UI through the F3 contract types (`apps/web/types/api/`).
- **F4 mock fixtures** (`apps/web/lib/api-data/f4/mock-fixtures.ts`) are a **separate namespace**. They expose the F4 response shapes (UUIDs, Decimal-as-string, nested includes, CHECK-mirror string-literal unions). F4.5 does not bridge between the two — that decision is per-screen and lives in F4.5F+.

## 8. View-Model / Derived Helper Inventory

Twelve helpers across F4.5C → F4.5E. All are **explicit and opt-in** — the adapter response shape is never modified to smuggle computed fields. Migrating screens import the helper they need; the rest of the response stays verbatim.

### 8.1 Equipment / Units helpers (F4.5C)

| Helper | Returns | Source |
|---|---|---|
| `deriveSensorsCount(detail)` | `number \| undefined` | `detail.sensors?.length` — `undefined` on a list row (no sensors include). |
| `deriveAlarmsCount(detail)` | `number \| undefined` | `detail.alarmRules?.length` — counts current alarm rules only. |
| `derivePressureUnit(detail)` | `string \| undefined` | `unitOperatingEnvelopes[0].engineeringUnitSet.pressure`, runtime-narrowed. |
| `deriveFlowUnit(detail)` | `string \| undefined` | `engineeringUnitSet.liquid_flow`, runtime-narrowed. |
| `deriveGasUnit(detail)` | `string \| undefined` | `engineeringUnitSet.gas_flow`, runtime-narrowed. |
| `toMeasurementUnitSummaryViewModel(row)` | `MeasurementUnitSummaryViewModel` | Compact summary: `id / code / name / status / operatingProfile / location / equipmentTypeName / equipmentTypePidReference`. |

### 8.2 Jobs helpers (F4.5D)

| Helper | Returns | Source |
|---|---|---|
| `deriveJobRuntime(job, now?)` | `JobRuntime \| undefined` | `{ startedAt, closedAt, isClosed, runtimeMs }`. Returns `undefined` if `startedAt` is null / unparseable. Accepts optional `now` for deterministic tests. `Math.max(0, …)` clamp guards against clock skew. |
| `deriveCommissioningSummary(snapshot)` | `CommissioningSummary \| undefined` | `{ sensorMappingCount, effectiveThresholdCount, ruleVersionCount, takenAt, immutable }`. Defensive `Array.isArray` narrowing on each JSONB field — malformed payloads yield `0` rather than throwing. |
| `toJobListItemViewModel(row)` | `JobListItemViewModel` | Compact summary: `id / status / startedAt / closedAt / tenantName? / wellName? / unitCode? / unitName?`. |

### 8.3 Telemetry helpers (F4.5E)

| Helper | Returns | Source |
|---|---|---|
| `toNumericTelemetryPoint(point)` | `NumericTelemetryPoint` with `value: number \| null` | Converts the Prisma-`Decimal` string `value` to a JS `number`; returns `value: null` for NaN / Infinity / unparseable input (chart libs can gap-skip null). |
| `toNumericTelemetrySeries(response)` | `NumericTelemetrySeries` (`+ validCount`) | Shape-preserving map over the response. `validCount` surfaces the count of points that parsed cleanly. |
| `isTelemetryTrendEmpty(response)` | `boolean` | `response.points.length === 0`. Named helper so migrating screens read explicitly. |

### 8.4 Design principles

- **Raw F4 adapter response remains available.** Every helper takes a response (or part of it) as input and returns a derived value. The original response is never mutated.
- **`undefined` rather than fabricated defaults.** A helper returns `undefined` when the input cannot answer the question. Consumers decide whether to render an empty state, a placeholder, or to skip the field entirely.
- **Explicit naming.** `derive*` reads from an existing shape; `to*ViewModel` projects to a compact summary; `is*` is a boolean predicate. No `getX()`-style ambiguity.
- **Test seam exposed where time / now matters.** `deriveJobRuntime` accepts an optional `now: number` so SSR caching and tests are deterministic.

## 9. Endpoint Coverage

Every F4.4 read endpoint is now represented by an F4.5A typed wrapper AND a data-source-aware F4.5B–E adapter. Thirteen endpoints, six modules:

| # | Method | Path | Module | F4.5A wrapper | F4.5 adapter (in `@/lib/api-data/f4`) |
|---|---|---|---|---|---|
| 1 | `GET` | `/api/v1/tenants` | F4.4A TenantsModule | `listTenants` | `adapterListTenants` |
| 2 | `GET` | `/api/v1/tenants/:id` | F4.4A TenantsModule | `getTenant` | `adapterGetTenant` |
| 3 | `GET` | `/api/v1/wells` | F4.4B WellsModule | `listWells` | `adapterListWells` |
| 4 | `GET` | `/api/v1/wells/:id` | F4.4B WellsModule | `getWell` | `adapterGetWell` |
| 5 | `GET` | `/api/v1/tags` | F4.4C CanonicalTagsModule | `listCanonicalTags` | `adapterListCanonicalTags` |
| 6 | `GET` | `/api/v1/tags/:name` | F4.4C CanonicalTagsModule | `getCanonicalTag` | `adapterGetCanonicalTag` |
| 7 | `GET` | `/api/v1/equipment/types` | F4.4D EquipmentModule | `listEquipmentTypes` | `adapterListEquipmentTypes` |
| 8 | `GET` | `/api/v1/equipment/types/:id` | F4.4D EquipmentModule | `getEquipmentType` | `adapterGetEquipmentType` |
| 9 | `GET` | `/api/v1/equipment/units` | F4.4D EquipmentModule | `listMeasurementUnits` | `adapterListMeasurementUnits` |
| 10 | `GET` | `/api/v1/equipment/units/:id` | F4.4D EquipmentModule | `getMeasurementUnit` | `adapterGetMeasurementUnit` |
| 11 | `GET` | `/api/v1/jobs` | F4.4E JobsModule | `listJobs` | `adapterListJobs` |
| 12 | `GET` | `/api/v1/jobs/:id` | F4.4E JobsModule | `getJobById` | `adapterGetJob` |
| 13 | `GET` | `/api/v1/telemetry/trends` | F4.4F TelemetryModule | `getTelemetryTrends` | `adapterGetTelemetryTrends` |

No backend endpoint is reachable today that does not have a frontend wrapper.

## 10. Test / Quality Gate Summary

Each sub-phase report records its own quality-gate state; the table below consolidates the reported numbers:

| Sub-phase | Commit | Frontend tests | Test files | Frontend lint / typecheck / build | Workspace lint / typecheck / build |
|---|---|---|---|---|---|
| F4.5A | `20d45ec` | **237/237** | 29 | all green | 4/4, 4/4, 2/2 |
| F4.5B | `4b824d7` | **253/253** | 30 (+1 spec: `adapter.test.ts`) | all green | 4/4, 4/4, 2/2 |
| F4.5C | `f7ecf6c` | **271/271** | 31 (+1 spec: `equipment.test.ts`) | all green | 4/4, 4/4, 2/2 |
| F4.5D | `9d24831` | **288/288** | 32 (+1 spec: `jobs.test.ts`) | all green | 4/4, 4/4, 2/2 |
| F4.5E | `6af42fa` | **311/311** | 33 (+1 spec: `telemetry.test.ts`) | all green | 4/4, 4/4, 2/2 (FULL TURBO) |

The pre-F4.5 baseline was **219 tests across 27 files**. F4.5 added **92 tests across 6 new spec files** without rewriting any pre-existing test. Every backend gate (`prisma validate`, `prisma generate`, backend `lint` / `typecheck` / `build` / `test`) also remained green across the arc — no backend file was touched.

## 11. Known Limitations

1. **No screen consumes the new adapters yet.** F4.5 is foundation-only by design. Migrating a specific screen is a per-screen F4.5F+ exercise.
2. **Existing UI remains mock-backed.** The F3 mock adapter (`apps/web/lib/api-data/index.ts` + `mockX` siblings) is byte-for-byte preserved. Every page renders the same way it did before F4.5A.
3. **API mode requires a running, migrated, seeded backend.** Setting `NEXT_PUBLIC_RVF_DATA_SOURCE=api` against a backend that hasn't run `prisma migrate dev` (and ideally the F4.3 seed) will produce `RvfApiError` rejections.
4. **F4.3 does not seed `telemetry_readings`.** The api-mode trends endpoint returns `points: []` on the F4.2 baseline. F4.5E's synthetic mock fills the screen-readiness gap until F4.6 lands.
5. **Synthetic telemetry traces are mock-only.** They are not transmitted to the backend; they do not populate `telemetry_readings`; they are not visible from any other process. They exist purely so chart code can render against a deterministic data path before F4.6.
6. **No TanStack Query integration yet at screen level.** F4.5 ships the adapter; F4.5F+ will wrap it in React Query / SWR / etc. at the consuming screen. The adapter exposes `AbortSignal` forwarding so the chosen orchestrator can cancel cleanly.
7. **No E2E tests for API mode.** Playwright suites still run against the mock adapter. End-to-end coverage against a live backend returns once an F4 test-harness story lands.
8. **No auth headers.** Backend has no auth (ADR-007 §7). When auth lands, `GetOptions` can grow a `token?` field or an interceptor pattern.
9. **No retry / cache / dedup in the low-level client.** Single `fetch` per call. Migrating screens compose those concerns at the React Query layer.
10. **F3-vs-F4 shape gaps remain.** The F3 `MeasurementUnit` type carries `pressureUnit / flowUnit / sensorsCount / alarmsCount` directly on the row; the F4 backend doesn't. F4.5C's view-model helpers bridge most gaps; some screens will need a one-off `f4ToF3<Entity>` mapper at the migration boundary. The F3 contracts (`apps/web/types/api/`) are intentionally left intact.
11. **Mock IDs are deterministic placeholders, not real DB UUIDs.** Switching `NEXT_PUBLIC_RVF_DATA_SOURCE` between `mock` and `api` for the same entity will show different ids — by design, since the mock fixtures are decoupled from any real database state.
12. **Decimal values surface as strings.** Mock fixtures and api responses both serialize NUMERIC fields as strings (Prisma `Decimal.toJSON`). Chart code wanting numeric math should use `toNumericTelemetryPoint` / `Number(value)` once at the adapter boundary.

## 12. Operational Impact

- **Frontend can opt into the live backend on a per-deployment basis.** Setting `NEXT_PUBLIC_RVF_DATA_SOURCE=api` at build time routes every F4.5 adapter call through the F4.4 read endpoints. The flip is reversible; no code change is required.
- **Screen-by-screen migration is unblocked.** A consuming screen replaces its current data source with the corresponding `@/lib/api-data/f4` adapter; the adapter contract is identical across mock and api modes. F4.5F+ executes this per screen.
- **Mock remains available for demos and offline development.** No backend connection, no DATABASE_URL, no `prisma migrate dev` is required for the frontend to render in mock mode. Useful for CI, for design reviews, and for local development sprints where the backend is offline.
- **API mode is available for local integration.** Once a developer has run `docker compose up -d postgres && pnpm --filter @rvf/backend exec prisma migrate dev && pnpm --filter @rvf/backend run prisma:seed:f4 && pnpm --filter @rvf/backend run dev`, setting `NEXT_PUBLIC_RVF_DATA_SOURCE=api` in `.env.local` routes the frontend to the live backend. The F4.3 seed populates every non-telemetry endpoint; the telemetry endpoint returns `points: []` until F4.6.
- **The F3 → F4 cut-over is now a per-screen decision, not a big-bang.** Each future migration sub-phase (F4.5F, F4.5G, …) can move one screen at a time without affecting the others.
- **F4.5 creates the bridge** between the F4.4 backend API and future UI migration. The arc that started with F4.2B (Prisma + module quarantine) → F4.3 (seed) → F4.4 (API reactivation) → F4.5 (frontend adapter foundation) is now contiguous on both sides of the wire.

## 13. Recommended Next Steps

### Primary recommendation: F4.5F — first screen migration

Pick a single low-risk consumer and migrate it from the F3 mock adapter to the F4 adapter, using the data-source switch to keep mock available. Candidates ordered from lowest risk to highest:

1. **Settings / Catalog page** (if one exists) — read-only reference data (tenants, canonical tags, equipment types). No telemetry, no time-of-day dependency, deterministic seed data. The F4.5B / F4.5C adapters cover everything this page needs.
2. **Units summary list** — `adapterListMeasurementUnits` returns a small list-row shape with the `equipmentType` summary include. The `toMeasurementUnitSummaryViewModel` helper bridges to a presentation shape without needing the F3 `MeasurementUnit` row fields.
3. **A read-only internal diagnostics / API-debug screen**, if one exists — exercises the adapter end-to-end against the live backend without touching production UX.

**Avoid migrating Operations telemetry charts in F4.5F.** The Operations screen reads from the F2A simulator + F2D realtime adapter through `lib/realtime/` and `lib/telemetry/`; switching it to F4 telemetry is a substantial change that should wait for F4.6 (or use F4.5E's mock-only synthetic traces, clearly documented as intentionally synthetic).

Suggested F4.5F deliverables:

1. The chosen page's hook switches from `getUnits()` (F3 mock) to a TanStack Query call wrapping `adapterListMeasurementUnits()` (F4 adapter, both branches).
2. A small `toViewModel` per-screen helper bridges the F4 shape to whatever the rendered component expects (or the component is updated to the F4 view-model helpers directly).
3. Per-screen vitest coverage that asserts both branches render correctly with mocked adapter responses.
4. F4.5F closeout report.

### Parallel recommendation: F4.6 architecture + ADR (architecture-first)

F4.6 is the largest remaining piece of F4 and should **start with documentation, not code**. The phase carries decisions with long shadows:

- **Ingestion adapter design.** Single process or sidecars? `IngestionAdapter` interface shape? Adapter registration / lifecycle?
- **Deduplication strategy.** `integration_mappings.external_identifier` uniqueness vs app-layer dedup window? Time-bounded vs sequence-based?
- **Late-arrival quarantine.** Reintroduce `LateTelemetryQuarantine` (F1.5 had one; F4.2B removed it)? Or accept best-effort with audit logging?
- **Live-readings projection mechanism.** Raw `live_readings_projection` view as-is? Materialized view refreshed on ingest? Upsert-maintained projection table? Application cache?
- **WebSocket fan-out.** Per-tenant channel? Per-unit subscription? Throttling / batching policy?
- **Alarm-event evaluation policy.** Where does the evaluator run (backend cron? on each ingest tick? client-side over the trends endpoint)?

F4.6 should open with:

- `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Architecture.md` — the design document.
- `docs/adr/ADR-008_…` (or whichever number) — the architectural decision record locking the design.

Both documents reviewed before any implementation lands. F4.5E's adapter is forward-compatible: F4.6 only needs to populate `telemetry_readings` for the api branch's `points: []` envelope to start carrying real data — no F4.5E code change required.

### Sequencing

| Stream | Phase | Depends on |
|---|---|---|
| UI migration | F4.5F, F4.5G, … | F4.5 closeout (this document) |
| Telemetry persistence | F4.6 architecture + ADR | F4.5 closeout |
| Telemetry persistence | F4.6 implementation | F4.6 ADR sign-off |
| UI migration (charts) | F4.5* (after telemetry lands) | F4.6 implementation |

The two streams can run in parallel; F4.5F screen migrations and F4.6 architecture work do not block each other.

## 14. Acceptance Criteria

F4.5 is considered complete because:

1. **F4 API client foundation exists** at `apps/web/lib/api/f4/` (F4.5A, commit `20d45ec`).
2. **Data-source switch exists** — `NEXT_PUBLIC_RVF_DATA_SOURCE=mock | api` with `mock` as default; unknown values fall back to `mock`.
3. **Mock remains the default data source.** No screen / hook / component / route handler / test was modified across F4.5. The F3 mock adapter (`apps/web/lib/api-data/index.ts` and the `mockX` siblings) is byte-for-byte preserved.
4. **All F4.4 read endpoints have frontend wrappers / adapters.** 13 endpoints, 6 modules, all present in `@/lib/api/f4` (typed wrappers) and `@/lib/api-data/f4` (data-source-aware adapters).
5. **Adapters include deterministic fixtures.** Every fixture mirrors the F4.3 seed where applicable; telemetry traces are clearly labelled as synthetic.
6. **View-model helpers cover the major F3 / F4 shape gaps** — 6 equipment-side, 3 jobs-side, 3 telemetry-side. All explicit, all opt-in.
7. **Tests are green.** 311 / 311 frontend tests across 33 files at F4.5E. Workspace lint / typecheck / build green across the whole arc.
8. **No backend / Prisma / migration / seed files changed.** Verified by `git status` across every sub-phase.
9. **No screen / UI migration occurred yet.** Foundation-only by design.
10. **Per-sub-phase closeout reports exist** under `docs/architecture/RVF_Malinois_F4_5{A,B,C,D,E}_*.md`.
11. **This consolidated F4.5 closeout report exists** at `docs/architecture/RVF_Malinois_F4_5_UI_API_Wiring_Foundation_Closeout_Report.md`.

## 15. Out of Scope

Repeated explicitly so the reader cannot infer F4.5 quietly shipped any of these:

- **Screen migration.** No page / component / hook / route handler touched.
- **UI redesign.** No CSS / Tailwind / layout / typography change.
- **Backend changes.** No file under `apps/backend/`.
- **F4.6 ingestion / persistence.** No write path to `telemetry_readings`, no MQTT / OPC-UA / Modbus / Node-RED / ThingsBoard client, no scheduled writer, no integration-adapter implementation.
- **Live readings.** `live_readings_projection` is not queried by any F4.5 code.
- **WebSocket telemetry broadcasting.** `lib/realtime/` is untouched.
- **Alarm events.** No row written to `alarm_events`; no real-time evaluation.
- **Production deployment.** No CI / CD / production secrets.
- **Authentication.** `CallerContext` is plumbed but inert; no token injection.
- **F2A simulator retirement.** `lib/telemetry/` simulator + F2D adapter factory + WebSocket scaffolding continue to drive Operations / Sensors / Alarms.
- **F3 mock adapter retirement.** `apps/web/lib/api-data/{index,mockX}.ts` and `apps/web/types/api/` remain the F3 contract surface.

---

*F4.5 closeout. Recommended next phase: F4.5F (first screen migration, lowest-risk consumer) in parallel with F4.6 architecture + ADR (telemetry persistence design before implementation).*
