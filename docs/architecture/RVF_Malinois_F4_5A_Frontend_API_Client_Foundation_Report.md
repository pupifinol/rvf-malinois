# RVF Malinois — F4.5A Frontend API Client Foundation Report

> Phase **F4.5A — Frontend API Client Foundation**.
> First F4.5 sub-phase. Foundation-only: introduces an opt-in F4 backend
> client without migrating any screen. The frontend continues to render
> from the F3 mock adapter by default.
>
> References:
> - F4.4 closeout: `docs/architecture/RVF_Malinois_F4_4_API_Reactivation_Closeout_Report.md` (commit `e6b40b6`)
> - F4 architecture: `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md` (commit `f36923a`)
> - ADR-007: `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md` (commit `8147399`)
> - F4.4A–F sub-phase reports: see F4.4 closeout §3 for commit hashes.

## 1. Summary

F4.5A adds a small, reversible **frontend API client foundation** that lets future F4.5 sub-phases migrate screens from the F3 mock adapter to the live F4 backend one consumer at a time. Nothing in the existing UI changes: every screen still reads from `apps/web/lib/api-data/`, every existing test (237 passing across 29 files) keeps passing, and the build output for `@rvf/web` is byte-for-byte the same as before (the new module is tree-shaken away when no consumer imports it).

The foundation has six files under `apps/web/lib/api/f4/`:

- `config.ts` — pure resolvers + `getDataSource()` / `getApiBaseUrl()` / `isMockSource()` / `isApiSource()` helpers. Backed by two new `NEXT_PUBLIC_*` env vars (defaults preserve mock behavior).
- `errors.ts` — `RvfApiError` class with `status`, `url`, `body`.
- `client.ts` — `buildUrl` + `getJson` (generic-over-params `GET`-only fetch wrapper). No retries, no caching, no auth, no WebSocket.
- `types.ts` — frontend types for every F4.4 response shape (Tenant, Well, CanonicalTag, EquipmentType, MeasurementUnit{ListRow,Detail}, Job{ListRow,Detail}, CommissioningSnapshot, TelemetryTrendsResponse, …). **No `@prisma/client` import** — the frontend bundle stays free of backend ORM internals.
- `endpoints.ts` — 13 typed wrappers matching the F4.4 endpoint inventory.
- `index.ts` — barrel for consumer imports (`@/lib/api/f4`).

Plus two new test files (`config.test.ts`, `client.test.ts` — 18 new tests, mocked-`fetch` only) and a documentation-only update to `apps/web/lib/env.ts` that adds the two new public env entries to the central `publicEnv` object.

All quality gates pass: backend + workspace `lint` / `typecheck` / `build` (no backend file touched); frontend `pnpm test` is **237/237 across 29 files** (existing 219 + 18 new). No backend, no Prisma, no migration, no seed changes. No commit was made.

## 2. Files Changed

| Path | Change |
|---|---|
| `apps/web/lib/api/f4/config.ts` | **New.** `RVF_DATA_SOURCES` tuple, `resolveDataSource` / `resolveApiBaseUrl` pure resolvers, `getDataSource` / `getApiBaseUrl` / `isMockSource` / `isApiSource` runtime helpers. |
| `apps/web/lib/api/f4/errors.ts` | **New.** `RvfApiError` class — readable error returned by every failure mode of the fetch wrapper. |
| `apps/web/lib/api/f4/client.ts` | **New.** `buildUrl` (composes base + path + query) + `getJson<T, P extends object>` (generic-over-params `GET` helper) + `QueryValue` / `QueryParams` / `GetOptions` types. |
| `apps/web/lib/api/f4/types.ts` | **New.** Frontend types matching the F4 backend response shapes; no `@prisma/client` dependency. |
| `apps/web/lib/api/f4/endpoints.ts` | **New.** 13 typed wrappers: `listTenants` / `getTenant`, `listWells` / `getWell`, `listCanonicalTags` / `getCanonicalTag`, `listEquipmentTypes` / `getEquipmentType`, `listMeasurementUnits` / `getMeasurementUnit`, `listJobs` / `getJobById`, `getTelemetryTrends`. |
| `apps/web/lib/api/f4/index.ts` | **New.** Barrel export. |
| `apps/web/lib/api/f4/config.test.ts` | **New.** 9 tests of `resolveDataSource` + `resolveApiBaseUrl` (defaults, unknown values fall back, trailing-slash stripping). |
| `apps/web/lib/api/f4/client.test.ts` | **New.** 9 tests of `buildUrl` (param coercion, skipping, ISO dates, booleans) + `getJson` (happy path, 4xx → `RvfApiError`, network failure → `status: 0`, signal forwarding, empty body → `null`). Uses `vi.stubGlobal('fetch', …)`. |
| `apps/web/lib/env.ts` | **Modified.** Added `rvfDataSource` and `rvfApiBaseUrl` entries to `publicEnv` with documentation. No existing entry touched. |
| `docs/architecture/RVF_Malinois_F4_5A_Frontend_API_Client_Foundation_Report.md` | **New.** This document. |

No file under `apps/backend/`, `apps/backend/prisma/`, `packages/`, `docker-compose.yml`, root config, or any existing `apps/web/` screen / component / hook was modified. No file was deleted.

## 3. Data-Source Switch Design

Two public environment variables gate F4 backend access:

| Variable | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_RVF_DATA_SOURCE` | `mock` | `mock` — every screen reads from the F3 mock adapter (`apps/web/lib/api-data/`). `api` — opt-in: future-migrated screens read from the F4 backend via `@/lib/api/f4`. |
| `NEXT_PUBLIC_RVF_API_BASE_URL` | `http://localhost:4000/api/v1` | Backend base URL. Trailing slashes are stripped at resolution time. |

Resolution is **safe by construction**:

- `resolveDataSource(undefined | '' | <typo>)` → `'mock'`. Only the literal strings `'mock'` and `'api'` opt in.
- `resolveApiBaseUrl(undefined | '')` → `'http://localhost:4000/api/v1'`. Empty / missing values get a local-dev default; the build never hits a remote host.
- No env var can throw at startup — F4.5A intentionally does not error on misconfiguration so a typo in a developer's `.env.local` cannot brick the app.

Runtime helpers:

```ts
import { getDataSource, getApiBaseUrl, isMockSource, isApiSource } from '@/lib/api/f4';

getDataSource();  // 'mock' | 'api'
getApiBaseUrl();  // string, never empty, never trailing-slashed
isMockSource();   // boolean
isApiSource();    // boolean
```

The pure `resolve*` functions are exported separately so unit tests pin behavior deterministically (Next.js inlines `process.env.NEXT_PUBLIC_*` at build time, which makes runtime mutation tricky in test contexts).

`apps/web/lib/env.ts` now also surfaces `rvfDataSource` and `rvfApiBaseUrl` in the central `publicEnv` constant for callers who prefer a single env import.

## 4. API Base URL Config

Default: `http://localhost:4000/api/v1`.

Rationale:

- The repo's existing `publicEnv.apiUrl` defaults to `http://localhost:4000` (`apps/web/lib/env.ts`). Keeping the F4 client on the same host avoids confusion when developers run `pnpm --filter @rvf/backend run dev` locally.
- The `/api/v1` suffix matches the global prefix set in `apps/backend/src/main.ts` (`app.setGlobalPrefix('api/v1', { exclude: ['health'] })`). Every F4.4 endpoint listed in §5 is reachable at `${BASE_URL}<route>`.
- Trailing slashes are stripped during resolution so callers can append paths without doubled `//`.
- The default is only used in dev; CI builds / production builds will set `NEXT_PUBLIC_RVF_API_BASE_URL` explicitly when the time comes.

## 5. API Client Design

### 5.1 `buildUrl`

Generic over the params shape (`<P extends object>`) so endpoint-wrapper `interface`s can be passed directly without the `Record<string, unknown>` index-signature friction TypeScript enforces. Iteration uses `Object.entries(...)` and a per-value type narrow:

- `undefined` / `null` → skipped.
- `Date` → `ISO-8601` string.
- `boolean` → `'true'` / `'false'`.
- `number` / `string` → `String(value)`.
- Anything else (object / function / symbol) → silently skipped rather than coerced into `'[object Object]'`.

### 5.2 `getJson<T, P extends object>(path, params?, options?)`

`GET`-only fetch wrapper. Behavior:

- Composes the URL via `buildUrl(getApiBaseUrl() | options.baseUrl, path, params)`.
- `fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, signal: options?.signal })`.
- On `fetch` rejection (network / abort / `ECONNREFUSED`) → `throw new RvfApiError(0, url, null, message)`.
- Reads `await response.text()`; if non-empty, attempts `JSON.parse` (regardless of `Content-Type`, with `text` fallback when the body isn't valid JSON).
- On `!response.ok` → `throw new RvfApiError(status, url, parsedBody)`.
- On success → returns the parsed body cast to `T`.

The wrapper is intentionally minimal. F4.5B+ can layer caching / retry / token injection on top by wrapping `getJson` once at the consumer (e.g. inside a React Query `queryFn`).

### 5.3 `RvfApiError`

```ts
class RvfApiError extends Error {
  readonly status: number;   // 0 for network failures
  readonly url: string;      // the URL that was actually requested
  readonly body: unknown;    // parsed body when available; null otherwise
}
```

Consumers can `if (err instanceof RvfApiError && err.status === 404) …` to map specific backend errors to UI states. The body field typically carries the Nest exception envelope `{ statusCode, message, error }`.

### 5.4 `GetOptions`

```ts
interface GetOptions {
  signal?: AbortSignal;   // forwarded to fetch — enables React Query cancellation
  baseUrl?: string;       // test seam; overrides config-derived base URL
}
```

The `baseUrl` field is exposed primarily so unit tests can drive the client deterministically (every test in `client.test.ts` injects its own base URL instead of mocking `process.env`).

## 6. Endpoint Wrappers Added

All 13 wrappers map directly to the F4.4 endpoint inventory documented in the F4.4 closeout (§5).

| Wrapper | Method + path | Params | Returns |
|---|---|---|---|
| `listTenants(params?)` | `GET /tenants` | `ListTenantsParams` (optional `status`) | `Tenant[]` |
| `getTenant(id)` | `GET /tenants/:id` | — | `Tenant` |
| `listWells(params?)` | `GET /wells` | `ListWellsParams` (optional `tenantId`, `fieldOrSite`, `type`, `fluid`) | `Well[]` |
| `getWell(id)` | `GET /wells/:id` | — | `Well` |
| `listCanonicalTags(params?)` | `GET /tags` | `ListCanonicalTagsParams` (optional `category`, `canonicalUnit`, `deprecated`) | `CanonicalTag[]` |
| `getCanonicalTag(name)` | `GET /tags/:name` | — | `CanonicalTag` |
| `listEquipmentTypes()` | `GET /equipment/types` | — | `EquipmentType[]` |
| `getEquipmentType(id)` | `GET /equipment/types/:id` | — | `EquipmentType` |
| `listMeasurementUnits(params?)` | `GET /equipment/units` | `ListMeasurementUnitsParams` (optional `tenantId`, `equipmentTypeId`, `status`, `operatingProfile`) | `MeasurementUnitListRow[]` |
| `getMeasurementUnit(id)` | `GET /equipment/units/:id` | — | `MeasurementUnitDetail` |
| `listJobs(params?)` | `GET /jobs` | `ListJobsParams` (optional `tenantId`, `wellId`, `unitId`, `status`) | `JobListRow[]` |
| `getJobById(id)` | `GET /jobs/:id` | — | `JobDetail` |
| `getTelemetryTrends(params)` | `GET /telemetry/trends` | `GetTelemetryTrendsParams` (`unitId`, `from`, `to` required; one of `canonicalTagId` / `canonicalTagName`; optional `jobId` / `quality` / `source` / `limit`) | `TelemetryTrendsResponse` |

Each wrapper accepts an optional `options: GetOptions` parameter so a future React Query call site can pass `signal` for cancellation:

```ts
useQuery({
  queryKey: ['tenants'],
  queryFn: ({ signal }) => listTenants(undefined, { signal }),
});
```

## 7. Types Added

`apps/web/lib/api/f4/types.ts` declares the full frontend view of every F4.4 response shape, derived from the F4.4A → F4.4F report tables. Key conventions:

- **No `@prisma/client` import.** The frontend bundle must not depend on the backend ORM. Types are hand-authored to match the JSON the controllers emit (per the closeout reports' field-by-field tables).
- **Dates are strings** (ISO-8601). NestJS / Prisma serialize `Date` via `toISOString()`; the frontend reconstructs `Date` objects only at the use site that needs math.
- **Decimals are strings.** Prisma's `Decimal.toJSON` emits a string. Types annotate this explicitly (`/** Decimal — serialized as a string. */`) on every NUMERIC-backed field: `min_range / max_range`, every alarm threshold, every operating-envelope ceiling, every `telemetry_readings.value`. Consumers call `Number(...)` when math is needed.
- **Nested includes are typed as `?` optional**, so a single type (e.g. `Well`) covers both the list and detail responses without separate type families.
- **String-literal unions mirror F4 CHECK constraints**: `TenantStatus`, `MeasurementUnitStatus`, `MeasurementUnitOperatingProfile`, `TransmitterProtocol`, `TransmitterInstallationStatus`, `SensorType`, `AlarmSeverity`, `JobStatus`, `TelemetryQuality`, `TelemetrySource`.
- **Unknown JSON columns are `unknown`**: `designLimits`, `defaultSensorTemplate`, `configuration`, `engineeringUnitSet`, `effectiveThresholds`, `sensorMappings`, `engineeringEnvelope`, `ruleVersions`. F4.5B+ can refine these with Zod parsers when a specific screen consumes them.

### 7.1 Type inventory

`TenantStatus`, `Tenant`, `TenantSummary`, `Well`, `CanonicalTag`, `CanonicalTagSummary`, `EquipmentType`, `EquipmentTypeSummary`, `MeasurementUnitStatus`, `MeasurementUnitOperatingProfile`, `MeasurementUnitListRow`, `MeasurementUnitDetail`, `TransmitterProtocol`, `TransmitterInstallationStatus`, `TransmitterDevice`, `SensorType`, `SensorWithTransmitters`, `UnitConfigurationRow`, `UnitOperatingEnvelopeRow`, `AlarmSeverity`, `AlarmRuleWithTag`, `JobStatus`, `CommissioningSnapshot`, `JobListRow`, `JobEngineerSummary`, `JobDetail`, `TelemetryQuality`, `TelemetrySource`, `TelemetryPoint`, `TelemetryTrendsResponse`.

## 8. How Mock Behavior Remains Default

This was the single most important constraint of F4.5A. The verification:

1. **No screen / hook / route handler was modified.** Every consumer of `apps/web/lib/api-data/` still imports the same functions and receives the same Promise resolutions.
2. **The new `apps/web/lib/api/f4/` is tree-shaken away** if no consumer imports it. `pnpm --filter @rvf/web run build` confirms the existing route bundle sizes are unchanged.
3. **`NEXT_PUBLIC_RVF_DATA_SOURCE` defaults to `'mock'`**. Even when a developer explicitly imports from `@/lib/api/f4`, no F4 fetch fires unless they call one of the typed wrappers — and no current call site does.
4. **The mock adapter is untouched.** `apps/web/lib/api-data/index.ts` and its `mockUnits` / `mockSensors` / `mockAlarms` / `mockTelemetry` siblings are byte-for-byte identical.
5. **F3 contracts are untouched.** `apps/web/types/api/` (the F3 canonical surface) is byte-for-byte identical. The new F4 types live in their own namespace under `lib/api/f4/types.ts`, intentionally separate so the F3 type contracts don't shift mid-migration.
6. **Existing test suite is byte-for-byte unaffected.** Pre-F4.5A: 219 tests across 27 files. Post-F4.5A: 237 tests across 29 files. The delta is exactly the 18 new tests in the two new spec files. The 219 pre-existing tests still pass.

## 9. How F4.5B Can Use the Foundation

A typical F4.5B / F4.5C screen migration will:

1. Replace the screen's `import { getUnits } from '@/lib/api-data'` (or similar) with a React Query call:

   ```ts
   import { listMeasurementUnits, isApiSource } from '@/lib/api/f4';
   import { getUnits } from '@/lib/api-data';

   const dataSource = isApiSource() ? 'api' : 'mock';

   const { data, isLoading, error } = useQuery({
     queryKey: ['units', dataSource],
     queryFn: ({ signal }) =>
       dataSource === 'api'
         ? listMeasurementUnits(undefined, { signal })
         : getUnits(),
   });
   ```

2. Adapt the response shape consumed by the component. The F4 shape (`MeasurementUnitListRow[]`) differs from the F3 shape (`MeasurementUnit[]`) — see F4.4D §3 for the field map (UUID identification, no `pressureUnit`/`flowUnit`, etc.). The migration may produce a small `toViewModel` helper to bridge until the F3 mock adapter is retired.

3. Add or extend the screen's vitest coverage with mocked `listMeasurementUnits` (or whichever wrapper) so the conversion is asserted.

4. Document the migration in a F4.5B-specific report.

`isApiSource()` and `isMockSource()` are the toggle. Screens migrated by F4.5B+ can default to the mock branch when `NEXT_PUBLIC_RVF_DATA_SOURCE` is unset / `'mock'`, and the API branch when explicitly set to `'api'`. This keeps the migration **reversible per screen** — if a problem surfaces on a specific page, flipping the env var falls back to mock without redeploying.

## 10. Commands Run and Results

| Command | Result |
|---|---|
| `pnpm --filter @rvf/web run lint` | clean exit (fixed 1 `@typescript-eslint/prefer-optional-chain` on `looksLikeJson` during authoring). |
| `pnpm --filter @rvf/web run typecheck` | clean. (Fixed two issues during authoring: stray `Job` import in `endpoints.ts`, and interface-vs-`Record<string, …>` friction resolved by making `buildUrl` / `getJson` generic over `P extends object`.) |
| `pnpm --filter @rvf/web run test` | **237/237 across 29 files** (219 existing + 18 new). |
| `pnpm --filter @rvf/web run build` | clean (`next build`); existing route bundle sizes unchanged. |
| `pnpm run lint` (workspace) | 4/4 tasks successful. |
| `pnpm run typecheck` (workspace) | 4/4 tasks successful. |
| `pnpm run build` (workspace) | 2/2 tasks successful. |
| `pnpm --filter @rvf/web run test:e2e` | **Not run.** Playwright E2E suite covers existing screens via the mock adapter; F4.5A introduces no UI change, so no behavior change to validate. F4.5B onward will add E2E coverage as screens migrate. |

## 11. Known Limitations

1. **No screen consumes the new client yet.** This is foundation-only. Importing the wrappers without calling them is fine (tree-shaken); the actual cut-over happens screen-by-screen in F4.5B+.
2. **No retry / cache / dedup / hydration.** `getJson` issues one fetch per call. F4.5B will likely wrap it in TanStack Query (the dependency is already in `apps/web/package.json`), which provides those concerns out of the box.
3. **No auth.** F4.5A does not add `Authorization` headers. The backend has no auth yet (per ADR-007 §7). When auth lands, `GetOptions` can grow a `token?: string` field or the client can be re-architected with an interceptor.
4. **No request body handling.** F4.5A only exposes a `GET` helper. F4.6 will need write paths (`POST /telemetry`, etc.); they will return as a separate helper alongside `getJson` (e.g. `postJson`) when that phase lands.
5. **Decimal values surface as strings.** Frontend math callers must `Number(value)`. Documented inline on every type field; F4.5B consumers that render a chart or compute aggregates should remember to do this.
6. **Param coercion is permissive, not strict.** `buildUrl` silently skips object / function / symbol values rather than throwing. The endpoint-wrapper interfaces constrain the public surface to `QueryValue`-shaped values, so this only matters if a caller bypasses the wrapper.
7. **No request timeout beyond `AbortSignal`.** Callers that need a hard timeout pass `AbortSignal.timeout(ms)` themselves. The wrapper does not impose one.
8. **`getDataSource()` reads `process.env` at call time, not module load.** Next.js inlines `NEXT_PUBLIC_*` at build, so the value is effectively static per build. Tests use the pure `resolveDataSource(raw)` instead.
9. **Frontend types are derived, not generated.** They were hand-authored from the F4.4A → F4.4F report tables. A future OpenAPI / typed-client generator step would close the drift window; out of scope for F4.5A.
10. **The F3 contracts (`apps/web/types/api/`) and the F4 types (`apps/web/lib/api/f4/types.ts`) coexist intentionally.** The F4 types are NOT a drop-in replacement — F4 dropped fields the F3 mock surface still exposes (e.g. `pressureUnit`, `flowUnit`, `sensorsCount` on `MeasurementUnit`). F4.5B+ will produce per-screen adapters that bridge the gap or commit to the F4 shape outright.

## 12. Out of Scope

Repeated explicitly so the reader cannot infer F4.5A shipped any of these:

- **F4.5B — Tenants / Wells / Tags screen migrations.** Next phase.
- **F4.5C / D / E** — equipment / jobs / telemetry-trends screen migrations.
- **F4.6** — telemetry persistence / ingestion / live readings projection / WebSocket fan-out / alarm-event generation.
- **Auth wiring.**
- **Frontend write paths.** `POST` / `PATCH` / `DELETE` helpers are not introduced. F4.6 will add them when needed.
- **Service worker / offline cache.**
- **Server-side data fetching.** No server components consume the new client today.
- **Operations chart / Sparkline data wiring.** The Operations / Sensors screens still draw from the simulated / mock adapter.
- **WebSocket frontend telemetry.** `lib/realtime/` and `lib/telemetry/` are untouched.
- **Reports / authentication / production secrets.**
- **Backend changes of any kind.** No file under `apps/backend/` or `apps/backend/prisma/` was modified.

## 13. Next Phase Recommendation

**Recommend F4.5B — Tenants / Wells / Tags API wiring — as the next phase.**

Rationale:

- The three modules share the simplest response shapes (no nested includes beyond a tenant scalar), the smallest number of consumer screens (mostly settings / reference panels), and the cleanest F4.3 seed coverage (one tenant + one well + 22 canonical tags). They are ideal first migration targets.
- After F4.5B lands the data-source switch will have at least one real consumer per category — F4.5C / D / E follow the same pattern with progressively more complex includes (equipment unit detail, job detail, telemetry trends).
- F4.6 (telemetry persistence) should run in parallel as its own architecture + ADR stream; F4.5B–E does not depend on F4.6 since the F4 read-only trends endpoint already returns `points: []` deterministically.

Suggested F4.5B scope:

1. Choose 1–2 screens per module (whatever currently consumes `lib/api-data/` for tenants / wells / tags — likely a settings or directory page).
2. Add a thin React Query hook wrapping the F4 wrapper (`useTenants()`, `useWells()`, `useCanonicalTags()`).
3. Mount the hook behind `isApiSource()` so flipping `NEXT_PUBLIC_RVF_DATA_SOURCE` = `api` switches the screen at runtime.
4. Add per-screen vitest coverage that asserts both branches render correctly with mocked data.
5. Document the migration in `docs/architecture/RVF_Malinois_F4_5B_Tenants_Wells_Tags_API_Wiring_Report.md`.

## 14. Acceptance Criteria — Status

| # | Criterion | Status |
|---|---|---|
| 1 | Frontend API client foundation exists. | **Met.** `apps/web/lib/api/f4/` with 6 source files + 2 spec files. |
| 2 | Mock data remains default. | **Met.** `NEXT_PUBLIC_RVF_DATA_SOURCE` defaults to `'mock'`; no screen consumes the new client. |
| 3 | Data source can be switched to API via env / config. | **Met.** `NEXT_PUBLIC_RVF_DATA_SOURCE=api` is the opt-in. |
| 4 | Backend API base URL is configurable. | **Met.** `NEXT_PUBLIC_RVF_API_BASE_URL` (default `http://localhost:4000/api/v1`). |
| 5 | Typed wrappers exist for F4.4 endpoints. | **Met.** 13 wrappers covering every F4.4A–F endpoint. |
| 6 | No backend files modified. | **Met.** Only `apps/web/` and `docs/architecture/` files changed. |
| 7 | No Prisma / migration / seed files modified. | **Met.** |
| 8 | No major screen rewrite. | **Met.** Zero screen / hook / route handler touched. |
| 9 | Existing UI remains mock-backed by default. | **Met.** §8 verification. |
| 10 | `lint` passes. | **Met.** Frontend + workspace. |
| 11 | `typecheck` passes. | **Met.** Frontend + workspace. |
| 12 | `build` passes. | **Met.** Frontend (`next build`) + workspace. |
| 13 | F4.5A report created. | **Met.** This document. |
| 14 | No commit made. | **Met.** All changes are working-tree only. |

All acceptance criteria are met.
