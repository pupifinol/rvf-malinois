# RVF Malinois — F4.5B Tenants / Wells / Tags API Wiring Report

> Phase **F4.5B — Tenants / Wells / Tags API Wiring**.
> Second F4.5 sub-phase. Introduces a data-source-aware adapter layer for
> the three smallest F4 domains; mock remains default; no screen rewrite.
>
> References:
> - F4.5A foundation: `docs/architecture/RVF_Malinois_F4_5A_Frontend_API_Client_Foundation_Report.md` (commit `20d45ec`)
> - F4.4 closeout: `docs/architecture/RVF_Malinois_F4_4_API_Reactivation_Closeout_Report.md` (commit `e6b40b6`)
> - F4.4A tenants: `docs/architecture/RVF_Malinois_F4_4A_Tenants_API_Reactivation_Report.md` (commit `2f5c108`)
> - F4.4B wells: `docs/architecture/RVF_Malinois_F4_4B_Wells_API_Reactivation_Report.md` (commit `20dadca`)
> - F4.4C canonical tags: `docs/architecture/RVF_Malinois_F4_4C_CanonicalTags_API_Reactivation_Report.md` (commit `0ec1099`)
> - F4.3 seed: `docs/architecture/RVF_Malinois_F4_3_Seed_Reference_Data_Report.md` (commit `91e17aa`)

## 1. Summary

F4.5B adds a thin **data-source-aware adapter layer** at `apps/web/lib/api-data/f4/` for the three smallest F4 domains: **tenants**, **wells**, and **canonical tags**. Each domain exposes one stable surface (`adapterListX` / `adapterGetX`) that delegates to either the in-memory F4.5B fixtures (mock mode, default) or the F4 backend endpoint wrappers from F4.5A (api mode, opt-in via `NEXT_PUBLIC_RVF_DATA_SOURCE=api`).

The adapter is foundation-shaped, not screen-shaped: no existing page or component was modified. The current UI continues to render from the F3 mock adapter (`apps/web/lib/api-data/index.ts` and the `mockUnits` / `mockSensors` / `mockAlarms` / `mockTelemetry` siblings) exactly as before. F4.5C / D / E will continue the pattern for equipment / jobs / telemetry; future screen-by-screen migrations will then consume these adapters as their data source.

Highlights:

- **Mock fixtures mirror the F4.3 seed.** One tenant ("RVF Internal"), one well ("Reference Well A"), and the full 22-entry canonical-tag dictionary are reproduced from `apps/backend/prisma/seed.f4.ts`. UUIDs are deterministic placeholders shaped like `00000000-0000-0000-0000-XXXXXXXXXXXX` (the leading 28 zero bits never collide with real `gen_random_uuid()` ids).
- **Source switch is transparent to callers.** `getDataSource()` / `isApiSource()` / `isMockSource()` from F4.5A drive the delegation; a screen written against `adapterListWells({...})` will move with the flip of `NEXT_PUBLIC_RVF_DATA_SOURCE=api` without code changes.
- **Errors are uniform.** Mock-mode "not found" surfaces as `RvfApiError(404, 'mock:/<path>', null, …)` so callers can `catch (err) { if (err instanceof RvfApiError && err.status === 404) … }` regardless of source.
- **Mock mode never calls `fetch`.** The adapter tests guard this explicitly by stubbing `fetch` with a function that throws — every mock-mode test passes the guard.

All quality gates pass: backend + workspace `lint` / `typecheck` / `build` (no backend file touched); frontend `pnpm test` is **253/253 across 30 files** (237 from F4.5A + 16 new in `adapter.test.ts`). No commit was made.

## 2. Files Changed

| Path | Change |
|---|---|
| `apps/web/lib/api-data/f4/mock-fixtures.ts` | **New.** Deterministic F4-shaped fixtures mirroring the F4.3 seed: `MOCK_F4_TENANTS` (1 row), `MOCK_F4_WELLS` (1 row + tenant include), `MOCK_F4_CANONICAL_TAGS` (22 rows). |
| `apps/web/lib/api-data/f4/tenants.ts` | **New.** `adapterListTenants(params?)` / `adapterGetTenant(id)`. Delegates to F4.5A `listTenants` / `getTenant` in api mode; serves from fixtures in mock mode. |
| `apps/web/lib/api-data/f4/wells.ts` | **New.** `adapterListWells(params?)` / `adapterGetWell(id)`. Same shape; supports the four F4.4B filters (`tenantId`, `fieldOrSite`, `type`, `fluid`). |
| `apps/web/lib/api-data/f4/tags.ts` | **New.** `adapterListCanonicalTags(params?)` / `adapterGetCanonicalTag(name)`. Supports F4.4C filters (`category`, `canonicalUnit`, `deprecated`). |
| `apps/web/lib/api-data/f4/index.ts` | **New.** Barrel: re-exports the six adapter functions, three params interfaces, and the three mock-fixture arrays. |
| `apps/web/lib/api-data/f4/adapter.test.ts` | **New.** 16 mocked-`fetch` vitest tests covering mock-mode determinism, api-mode wiring, filter passthrough, NotFound parity, URL composition, and the safe-fallback on unknown `NEXT_PUBLIC_RVF_DATA_SOURCE` values. |
| `docs/architecture/RVF_Malinois_F4_5B_Tenants_Wells_Tags_API_Wiring_Report.md` | **New.** This document. |

No file under `apps/backend/`, `apps/backend/prisma/`, `packages/`, `docker-compose.yml`, root config, or any existing `apps/web/` screen / component / hook / route handler was modified. No file was deleted. The pre-F4.5B mock adapter at `apps/web/lib/api-data/{index,mockUnits,mockSensors,mockAlarms,mockTelemetry,adapter.test}.ts` is byte-for-byte untouched.

## 3. Data-Source Switch Behavior

The F4.5A foundation continues to govern the switch:

| `NEXT_PUBLIC_RVF_DATA_SOURCE` | Tenant / Well / Tag reads route through |
|---|---|
| (unset) | mock branch — `MOCK_F4_TENANTS` / `MOCK_F4_WELLS` / `MOCK_F4_CANONICAL_TAGS` |
| `mock` | mock branch (same) |
| `api` | api branch — `listTenants` / `listWells` / `listCanonicalTags` (and the by-id / by-name forms) from `@/lib/api/f4` |
| (any other value) | safely falls back to mock — `resolveDataSource()` never throws |

The adapter consults the switch on each call (`isApiSource()` reads `process.env.NEXT_PUBLIC_RVF_DATA_SOURCE` via the F4.5A `getDataSource` helper, then compares the resolved value to `'api'`). Next.js inlines `NEXT_PUBLIC_*` at build time, so the resolved value is effectively static per build — tests drive the switch by overwriting `process.env.NEXT_PUBLIC_RVF_DATA_SOURCE` before each scenario and restoring it in `afterEach`.

**Mock mode never calls `fetch`.** The adapter tests assert this directly:

```ts
const stubFetchThatThrows = (): void => {
  vi.stubGlobal('fetch', vi.fn(() => {
    throw new Error('fetch must not be called in mock-source mode');
  }));
};
```

Every mock-mode test installs this stub and passes — proving the network is untouched for the default code path. F4.5B does **not** introduce a "fall back to mock on api failure" behavior; api mode that hits a 4xx / 5xx / network failure propagates `RvfApiError` to the caller. (Adding silent fallback would mask bugs and contradict the F4.5A error-handling contract.)

## 4. Tenants Wiring

### 4.1 Surface

```ts
adapterListTenants(params?: ListTenantsParams, options?: GetOptions): Promise<Tenant[]>
adapterGetTenant(id: string, options?: GetOptions): Promise<Tenant>

interface ListTenantsParams { status?: TenantStatus; }
```

### 4.2 Mock branch

- Returns `MOCK_F4_TENANTS` filtered by the optional `status` parameter, ordered by `name asc`.
- The single seeded row is `RVF Internal` (status `active`, `residencyHint: 'local-dev'`, deterministic id `00000000-0000-0000-0000-000000000001`).
- `adapterGetTenant(id)` resolves on the matching id, otherwise rejects with `RvfApiError(404, 'mock:/tenants/<id>', null, …)`.

### 4.3 API branch

Delegates to `listTenants(params, options)` / `getTenant(id, options)` from F4.5A's `@/lib/api/f4` barrel, which compose the URL via `buildUrl` (e.g. `${baseUrl}/tenants?status=active`) and invoke the safe `getJson<T>` fetch wrapper.

## 5. Wells Wiring

### 5.1 Surface

```ts
adapterListWells(params?: ListWellsParams, options?: GetOptions): Promise<Well[]>
adapterGetWell(id: string, options?: GetOptions): Promise<Well>

interface ListWellsParams {
  tenantId?: string;
  fieldOrSite?: string;
  type?: string;
  fluid?: string;
}
```

### 5.2 Mock branch

- Returns `MOCK_F4_WELLS` after applying every truthy filter from `params`, ordered by `(tenantId asc, name asc)` — matching the F4.4B service-level ordering.
- Each row carries the `tenant: { id, name, status }` include attached, mirroring the F4 backend's response shape.
- The single seeded row is "Reference Well A" (`fieldOrSite: 'Reference Field'`, `type: 'test'`, `fluid: 'multiphase'`, `designLimits` mirroring the HP-001 envelope).

### 5.3 API branch

Delegates to `listWells` / `getWell`. The F4.5A fetch wrapper handles URL-encoding (e.g. `fieldOrSite=Reference Field` → `fieldOrSite=Reference+Field`), Date / boolean coercion, and `AbortSignal` forwarding.

## 6. Canonical Tags Wiring

### 6.1 Surface

```ts
adapterListCanonicalTags(params?: ListCanonicalTagsParams, options?: GetOptions): Promise<CanonicalTag[]>
adapterGetCanonicalTag(name: string, options?: GetOptions): Promise<CanonicalTag>

interface ListCanonicalTagsParams {
  category?: string;
  canonicalUnit?: string;
  deprecated?: boolean;
}
```

### 6.2 Mock branch

- Returns all 22 canonical tags from `MOCK_F4_CANONICAL_TAGS` after applying filters, ordered by `(category asc, name asc)` (matching F4.4C).
- The fixture preserves every field exactly as the F4.3 seed inserts them: `name`, `displayName`, `canonicalUnit`, `category`, `precision`, `description`, `deprecated = false`.
- The `deprecated` filter is explicit-tristate-safe: omitting the param returns every row; `deprecated: false` returns only undeprecated rows; `deprecated: true` returns only deprecated rows (zero with the F4.3 seed).
- `adapterGetCanonicalTag('p_inlet')` resolves immediately; `adapterGetCanonicalTag('not_a_real_tag')` rejects with `RvfApiError(404, 'mock:/tags/not_a_real_tag', …)`.

### 6.3 API branch

Delegates to `listCanonicalTags` / `getCanonicalTag`. The `name` parameter is URL-encoded via `encodeURIComponent` inside `getCanonicalTag` — tested explicitly to confirm names like `p_inlet`, `q_gas`, `level_separator` produce clean URLs without double-encoding.

## 7. Mapping / Normalization Decisions

F4.5B intentionally **does not** introduce shape-bridging adapters between F3 mock contracts and F4 API responses. Reasons:

- **No existing screen consumes tenants / wells / tags today.** A grep for `tenant` / `canonical.tag` / `listTenants` etc. across `apps/web/{app,components,lib}` confirms only label strings, types, and the F4.5A foundation itself reference these concepts. F1-style `tenant.code` / `well.tenantCode/code` / `tag.unit` are nowhere in the active UI.
- **Both mock and api branches return identical F4 shapes.** A future screen reads `Tenant`, `Well`, `CanonicalTag` from `@/lib/api/f4` (or transitively from `@/lib/api-data/f4`) and gets exactly the same TypeScript types regardless of source. No `as` casts at consumer sites; no F3-vs-F4 conditional rendering.
- **The F3 mock adapter (`apps/web/lib/api-data/index.ts`) is byte-for-byte preserved.** Anything that already consumes `getUnits()` / `getSensors()` / `getAlarms()` / `getTelemetry()` keeps its current contract. F4.5C / D / E will introduce per-screen migrations and, where the F4 response shape differs from the F3 mock contract, will produce explicit `toViewModel` helpers per screen.

The only structural decision is the deterministic mock-UUID format. Mock fixtures use UUIDs shaped `00000000-0000-0000-0000-XXXXXXXXXXXX`:

- Tenants: `00000000-0000-0000-0000-000000000001` (mirrors the F4.3 seed convention).
- Wells: `00000000-0000-0000-0000-000000004400`.
- Canonical tags: 12-hex-digit suffix derived from the tag name via a deterministic FNV-1a-flavored hash (so a future test that asserts tag-id stability has a reproducible target).

These ids will **not** collide with real `gen_random_uuid()` output (the leading 28 zero bits make the namespace disjoint).

## 8. Confirmation: Mock Remains Default

Verified six ways:

1. **`NEXT_PUBLIC_RVF_DATA_SOURCE` defaults to `mock`** (F4.5A; verified by the adapter tests' "treats an unknown / typo value as mock" case).
2. **No screen / hook / route handler / component changed.** F4.5B adds files only; nothing currently calls any of the new adapter functions.
3. **F3 mock adapter is byte-for-byte unchanged.** `apps/web/lib/api-data/{index,mockUnits,mockSensors,mockAlarms,mockTelemetry,adapter.test}.ts` were not touched.
4. **F4.5A pre-existing modules unchanged.** `apps/web/lib/api/f4/{config,errors,client,types,endpoints,index}.ts` and their two specs were not touched in F4.5B.
5. **Existing test suite is unaffected.** Pre-F4.5B: 237 tests across 29 files. Post-F4.5B: 253 tests across 30 files. The delta is exactly the 16 new tests in `adapter.test.ts`. The 237 pre-existing tests still pass byte-for-byte.
6. **Bundle output unchanged for the existing routes.** `next build` reports the same per-route bundle sizes as F4.5A. The new `apps/web/lib/api-data/f4/` is tree-shaken away since no screen imports it yet.

## 9. Confirmation: No Backend / Prisma / Migration / Seed Changes

Verified by `git status --short`:

```
?? apps/web/lib/api-data/f4/
?? docs/architecture/RVF_Malinois_F4_5B_Tenants_Wells_Tags_API_Wiring_Report.md
```

The only working-tree state outside `apps/web/lib/api-data/f4/` and the new doc is **none** — every other tracked file is unchanged.

Backend (`apps/backend/`), Prisma (`apps/backend/prisma/`), migrations (`apps/backend/prisma/migrations/`), seed (`apps/backend/prisma/seed.f4.ts`), packages (`packages/*`), infrastructure (`docker-compose.yml`, `turbo.json`, root `package.json`, `.github/`), and the F3 mock adapter (`apps/web/lib/api-data/{index,mockX,adapter.test}.ts`) are all untouched.

## 10. Commands Run and Results

| Command | Result |
|---|---|
| `pnpm --filter @rvf/web run lint` | clean exit (fixed three rounds of `import/order` + `no-non-null-assertion` during authoring; the alias `@/lib/api/f4` resolves to the `index` group of the rule, so the relative-sibling imports come first). |
| `pnpm --filter @rvf/web run typecheck` | clean (fixed one issue during authoring: `vi.fn(...)` with a zero-arg implementation produced a `[]`-tuple `mock.calls` type; switched to `vi.fn<typeof fetch>()`). |
| `pnpm --filter @rvf/web run test` | **253/253 across 30 files** (237 pre-existing + 16 new in `adapter.test.ts`). |
| `pnpm --filter @rvf/web run build` | clean (`next build`); existing route bundle sizes unchanged. |
| `pnpm run lint` (workspace) | 4/4 tasks successful. |
| `pnpm run typecheck` (workspace) | 4/4 tasks successful. |
| `pnpm run build` (workspace) | 2/2 tasks successful (FULL TURBO). |
| `pnpm --filter @rvf/web run test:e2e` | **Not run.** No UI change; F4.5B introduces no rendered behavior. E2E coverage returns when F4.5C+ migrates a specific screen. |

## 11. Known Limitations

1. **No screen consumes the new adapter yet.** This is intentional. Future migrations will swap a specific component's data source from the F3 mock adapter to the F4 adapter. Until then the new module is tree-shaken.
2. **Mock-mode UUIDs are placeholders.** A future screen that wires up the F4 endpoint via api mode and then back to mock mode (e.g. when the backend goes offline) will see different ids for the "same" tenant / well / tag. That is by design — the mock fixtures are decoupled from any real database state.
3. **Mock-mode filter semantics are deliberately strict equality.** F4 backend filters are also equality-based (per F4.4A–C), so mock and api modes agree. Substring / fuzzy / case-insensitive filtering is out of scope for F4.5B.
4. **No retry / cache / dedup.** The adapter is a single async call. Migrating screens should wrap calls in TanStack Query; the dependency is already present in `apps/web/package.json`.
5. **No auth.** Backend has no auth (ADR-007 §7). When auth lands, `options.signal` will be joined by an `options.token` (or interceptor pattern).
6. **`adapterGetCanonicalTag(name)` URL-encodes `name`** via the F4.5A `getJson` wrapper (`encodeURIComponent`). Lower-case snake_case names always pass through unchanged; the encoding is defence-in-depth.
7. **The `deprecated` query param is passed through directly to the F4.5A wrapper**, which the F4.4C backend serializes as the literal strings `'true'` / `'false'` via `buildUrl`'s boolean coercion. Matches the F4.4C `?deprecated=true|false` contract.
8. **Mock-mode rejections throw `RvfApiError(404, …)` not a synthetic backend error envelope.** The error's `body` is `null` in mock mode (consumers should rely on `status` / `message` rather than `body` for cross-mode portability).

## 12. Out of Scope

Repeated explicitly so the reader cannot infer F4.5B quietly shipped any of these:

- **F4.5C — Equipment / Units API wiring.** Next phase.
- **F4.5D — Jobs API wiring.**
- **F4.5E — Telemetry trends API wiring.**
- **F4.6 — Telemetry persistence / ingestion / live-readings projection / WebSocket fan-out / alarm-event generation.**
- **Screen / page rewrites.** Zero pages or components changed.
- **Operations expanded chart view.**
- **Live readings.**
- **Sensors / Alarms / Reports / Settings page wiring.**
- **F3 mock adapter retirement.** The `apps/web/lib/api-data/index.ts` flat surface (units / sensors / alarms / telemetry) is preserved.
- **Auth.**
- **Backend / Prisma / migration / seed changes.** None made.

## 13. Acceptance Criteria — Status

| # | Criterion | Status |
|---|---|---|
| 1 | Tenants / Wells / Tags can be read through a data-source-aware frontend adapter. | **Met.** Six functions across `tenants.ts` / `wells.ts` / `tags.ts`. |
| 2 | Mock remains default. | **Met.** §8. |
| 3 | API mode uses `apps/web/lib/api/f4` wrappers. | **Met.** Each adapter file imports `listTenants / listWells / listCanonicalTags` etc. from the F4.5A barrel. |
| 4 | Existing mock UI behavior remains intact. | **Met.** No screen / hook / component changed; F3 mock adapter is byte-for-byte preserved. |
| 5 | No backend files modified. | **Met.** §9. |
| 6 | No Prisma / migration / seed files modified. | **Met.** |
| 7 | No major screen rewrite. | **Met.** Zero pages or components touched. |
| 8 | No Equipment / Jobs / Telemetry UI wiring. | **Met.** F4.5C+ phases. |
| 9 | No frontend visual redesign. | **Met.** No CSS / component change. |
| 10 | Tests added / updated for source switching or adapters. | **Met.** 16 tests in `adapter.test.ts`. |
| 11 | `lint` passes. | **Met.** Frontend + workspace. |
| 12 | `typecheck` passes. | **Met.** Frontend + workspace. |
| 13 | `build` passes. | **Met.** Frontend + workspace. |
| 14 | F4.5B report created. | **Met.** This document. |
| 15 | No commit made. | **Met.** All changes are working-tree only. |

All acceptance criteria are met.

## 14. Next Phase Recommendation

**Recommend F4.5C — Equipment / Units API wiring — as the next phase.**

Rationale:

- F4.5C is the next step in the same pattern: introduce data-source-aware adapters for `EquipmentType` + `MeasurementUnit`, mirroring the F4.4D endpoint surface (`GET /equipment/types`, `GET /equipment/types/:id`, `GET /equipment/units`, `GET /equipment/units/:id`).
- The F4.3 seed already provisions 2 equipment types (EMMAD, EMGAD) and 2 measurement units (HP-001, LP-001) so the mock fixtures have natural data.
- The F4.4D unit-detail include is the most complex F4 read so far: it nests `equipmentType` + `sensors[]` (with currently-installed `transmitterDevices[]`) + current `unitConfigurations[]` + current `unitOperatingEnvelopes[]` + current `alarmRules[]` (each joined with a `canonicalTag` summary). F4.5C is where a real shape-bridging concern may finally appear — the F3 mock surface has `MeasurementUnit` with `pressureUnit / flowUnit / sensorsCount / alarmsCount` fields that F4 does NOT carry on the row. F4.5C will need to decide whether to derive these at the adapter boundary, in a `toViewModel` helper at each consuming screen, or simply expose the raw F4 shape and let migrating screens adapt.
- After F4.5C lands, the foundation for F4.5D (jobs — adds `commissioningSnapshot`) and F4.5E (telemetry trends — adds time-series shape concerns) becomes incremental.

Suggested F4.5C scope:

1. `apps/web/lib/api-data/f4/equipment.ts` with `adapterListEquipmentTypes()` / `adapterGetEquipmentType(id)` / `adapterListMeasurementUnits(params?)` / `adapterGetMeasurementUnit(id)`.
2. Extend `mock-fixtures.ts` with `MOCK_F4_EQUIPMENT_TYPES` and `MOCK_F4_MEASUREMENT_UNITS` rows mirroring the F4.3 seed.
3. Document the F3-vs-F4 unit-shape gap (`pressureUnit` / `flowUnit` / `sensorsCount` / `alarmsCount`) and propose a path (e.g. compute on demand from the `equipmentType` + `sensors` include, or freeze them in the F3 mock until the migrating screen explicitly takes the F4 shape).
4. 10–15 new adapter tests following the F4.5B template.
5. F4.5C closeout report.

Two non-F4.5 streams are also unblocked and can run in parallel:

- **F4.5 screen migrations** — start migrating the smallest non-telemetry consumer to read from the F4 adapter (likely a settings or directory page if one exists). Foundation-only F4.5A/B/C/D/E do not require this; the migrations can land per-screen any time after each foundation is in place.
- **F4.6 architecture + ADR** — start the telemetry-persistence design work in parallel. F4.5 read-path migrations do not block F4.6 ingestion design.
