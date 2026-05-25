# RVF Malinois — F4.5C Equipment / Units API Wiring Report

> Phase **F4.5C — Equipment / Units API Wiring**.
> Third F4.5 sub-phase. Extends the F4.5B adapter pattern to the F4.4D
> equipment surface (`EquipmentType` + `MeasurementUnit`) and introduces
> the first explicit view-model helpers for fields the F4 schema does not
> carry directly on the row.
>
> References:
> - F4.5A foundation: `docs/architecture/RVF_Malinois_F4_5A_Frontend_API_Client_Foundation_Report.md` (commit `20d45ec`)
> - F4.5B tenants/wells/tags: `docs/architecture/RVF_Malinois_F4_5B_Tenants_Wells_Tags_API_Wiring_Report.md` (commit `4b824d7`)
> - F4.4D equipment backend: `docs/architecture/RVF_Malinois_F4_4D_Equipment_API_Reactivation_Report.md` (commit `3cdee45`)
> - F4.3 seed: `docs/architecture/RVF_Malinois_F4_3_Seed_Reference_Data_Report.md` (commit `91e17aa`)
> - F4.4 closeout: `docs/architecture/RVF_Malinois_F4_4_API_Reactivation_Closeout_Report.md` (commit `e6b40b6`)

## 1. Summary

F4.5C extends the F4.5B data-source-aware adapter pattern to two more F4 domains:

- **EquipmentType** (global template catalog) — `adapterListEquipmentTypes` / `adapterGetEquipmentType`.
- **MeasurementUnit** (tenant-scoped operational asset) — `adapterListMeasurementUnits` / `adapterGetMeasurementUnit`, returning the full F4.4D detail include (`equipmentType` + `sensors` with currently-installed transmitters + current `unitConfiguration` + current `unitOperatingEnvelope` + current `alarmRules` with canonical-tag scalars).

Plus the first set of explicit **view-model helpers** for fields the F4 schema does not carry directly on the row but legacy UI may want:

- `deriveSensorsCount(detail)` — array length, or `undefined` when called on a list row.
- `deriveAlarmsCount(detail)` — same shape, counts current alarm rules.
- `derivePressureUnit(detail)` / `deriveFlowUnit(detail)` / `deriveGasUnit(detail)` — read from `unitOperatingEnvelopes[0].engineeringUnitSet.{pressure, liquid_flow, gas_flow}` with runtime narrowing and explicit `undefined` for missing keys (no silent defaults).
- `toMeasurementUnitSummaryViewModel(row)` — projects a list-row to a compact summary suitable for table / card rendering without leaking `tenantId` / `equipmentTypeId` / audit timestamps.

Scope mirrors F4.5A/B: foundation-only. No existing screen consumes the new adapter; no UI change; no backend / Prisma / migration / seed change. Mock remains the default data source. The frontend bundle output is byte-for-byte unchanged for existing routes (next build confirms identical bundle sizes; the new module tree-shakes away from current consumers).

All quality gates pass: backend + workspace `lint` / `typecheck` / `build` (no backend file touched); frontend `pnpm test` is **271/271 across 31 files** (253 from F4.5B + 18 new in `equipment.test.ts`). No commit was made.

## 2. Files Changed

| Path | Change |
|---|---|
| `apps/web/lib/api-data/f4/mock-fixtures.ts` | **Extended.** F4.5C section adds: `MOCK_F4_EQUIPMENT_TYPES` (EMMAD + EMGAD), `MOCK_F4_MEASUREMENT_UNITS` (HP-001 + LP-001 list rows with `equipmentType` summary), `MOCK_F4_MEASUREMENT_UNIT_DETAILS` (a lookup keyed by unit id; HP-001 with full detail — 7 sensors + 14 alarm rules; LP-001 with a representative 2-sensor / 2-alarm subset). Builder helpers (`buildSensorsWithTransmitters`, `buildAlarmRules`, `buildUnitConfiguration`, `buildUnitOperatingEnvelope`) keep the fixture readable. F4.5B sections (tenants / wells / tags) untouched. |
| `apps/web/lib/api-data/f4/equipment.ts` | **New.** Adapter functions + view-model helpers. Adapter pattern matches F4.5B (`isApiSource()` → wrappers from `@/lib/api/f4`; otherwise serve from fixtures; mock-mode 404 surfaces as `RvfApiError(404, 'mock:/equipment/...', null, …)`). View-model helpers are named, explicit, and return `undefined` for absent inputs. |
| `apps/web/lib/api-data/f4/index.ts` | **Extended.** Re-exports the four equipment adapter functions, the six view-model helpers, `ListMeasurementUnitsParams`, `MeasurementUnitSummaryViewModel`, and the three new fixture exports. F4.5B exports preserved. |
| `apps/web/lib/api-data/f4/equipment.test.ts` | **New.** 18 mocked-`fetch` vitest tests covering mock-mode determinism, api-mode wiring + URL composition, the four list filters, detail include shape (sensors / transmitters installed-only / current config + envelope + alarm rules), NotFound parity, and every view-model helper. |
| `docs/architecture/RVF_Malinois_F4_5C_Equipment_Units_API_Wiring_Report.md` | **New.** This document. |

No file under `apps/backend/`, `apps/backend/prisma/`, `packages/`, `docker-compose.yml`, root config, or any existing `apps/web/` screen / component / hook / route handler / test was modified. The pre-F4.5C state of `apps/web/lib/api-data/f4/{tenants,wells,tags,adapter.test}.ts` is byte-for-byte preserved.

## 3. Equipment / Units Adapter Design

The four adapter functions share three structural decisions with the F4.5B adapters:

1. **Single delegation point per function.** Each function checks `isApiSource()` once and routes to either the F4.5A wrapper or the in-memory fixture path. No retries, no caching, no implicit fallback.
2. **Mock branch never calls `fetch`.** Tests prove this explicitly by stubbing the global with a throwing function.
3. **Uniform error type.** Both branches surface "not found" as `RvfApiError(404, …)` so callers can branch on `err.status` uniformly.

Beyond the F4.5B baseline, F4.5C adds:

4. **Two list / detail granularities.** The list endpoint returns rows WITHOUT the detail include (consistent with the F4.4D backend, where `findAll` issues only a small `equipmentType` summary include while `findById` issues the full include with sensors / transmitters / configuration / envelope / alarm rules). Callers that need the rich shape call `adapterGetMeasurementUnit(id)`.
5. **A separate detail-lookup table.** `MOCK_F4_MEASUREMENT_UNIT_DETAILS` is a `Record<id, MeasurementUnitDetail>` so the mock can serve `adapterGetMeasurementUnit(id)` in O(1) without scanning the list array. Adding a new mock unit requires updating both the list array and the detail map (this is documented inline).
6. **Explicit view-model helpers.** F4.5B was tenants / wells / tags — none of those screens had F3-vs-F4 field gaps. F4.5C is the first sub-phase where a real shape decision appeared (F3's `MeasurementUnit` has `pressureUnit / flowUnit / sensorsCount / alarmsCount` directly on the row; F4 does NOT). F4.5C answers this with named, optional helpers rather than smuggling computed fields into the response shape itself.

## 4. Data-Source Switch Behavior

Unchanged from F4.5A/B. The four new adapters honor `NEXT_PUBLIC_RVF_DATA_SOURCE`:

| Value | Equipment / Units reads route through |
|---|---|
| (unset) | mock branch (`MOCK_F4_EQUIPMENT_TYPES`, `MOCK_F4_MEASUREMENT_UNITS`, `MOCK_F4_MEASUREMENT_UNIT_DETAILS`) |
| `mock` | mock branch (same) |
| `api` | `listEquipmentTypes` / `getEquipmentType` / `listMeasurementUnits` / `getMeasurementUnit` from `@/lib/api/f4` |
| (other) | safely falls back to mock — `resolveDataSource` never throws |

Tests verify:

- Mock mode never calls `fetch` (guard fixture: `vi.stubGlobal('fetch', vi.fn(() => { throw … }))`).
- API mode composes the expected URL including all four filter parameters: `${API_BASE}/equipment/units?tenantId=…&equipmentTypeId=…&status=…&operatingProfile=…`.
- API mode forwards UUID path params verbatim: `${API_BASE}/equipment/units/00000000-0000-0000-0000-000000004411`.

No silent fallback from api → mock on failure: a 4xx / 5xx / network error from the backend propagates as `RvfApiError` to the caller, preserving the F4.5A contract.

## 5. Equipment Types Wiring

### 5.1 Surface

```ts
adapterListEquipmentTypes(options?: GetOptions): Promise<EquipmentType[]>
adapterGetEquipmentType(id: string, options?: GetOptions): Promise<EquipmentType>
```

### 5.2 Mock branch

- Returns `MOCK_F4_EQUIPMENT_TYPES` ordered by `name asc` (matches the F4.4D backend's `orderBy: { name: 'asc' }`). EMGAD precedes EMMAD lexicographically.
- Two entries:
  - **EMMAD** — well-testing / measurement template; full `defaultSensorTemplate` JSON mirroring the F4.3 seed (7 loops: inlet/outlet pressure, inlet temperature, liquid/gas flow, separator level, vibration_x).
  - **EMGAD** — gas-measurement template; 4 loops (pressure / temperature / gas flow / gas total).
- `adapterGetEquipmentType(<unknown UUID>)` rejects with `RvfApiError(404, 'mock:/equipment/types/<id>', null, …)`.

### 5.3 API branch

Delegates to `listEquipmentTypes` / `getEquipmentType` from `@/lib/api/f4`. The list endpoint takes no parameters; the by-id endpoint URL-encodes the UUID via the F4.5A `getJson` wrapper.

## 6. Measurement Units Wiring

### 6.1 Surface

```ts
adapterListMeasurementUnits(params?: ListMeasurementUnitsParams, options?: GetOptions): Promise<MeasurementUnitListRow[]>
adapterGetMeasurementUnit(id: string, options?: GetOptions): Promise<MeasurementUnitDetail>

interface ListMeasurementUnitsParams {
  tenantId?: string;
  equipmentTypeId?: string;
  status?: MeasurementUnitStatus;          // 'active' | 'inactive' | 'offline' | 'maintenance'
  operatingProfile?: MeasurementUnitOperatingProfile; // 'high_pressure_high_flow' | 'medium' | 'low' | 'custom'
}
```

### 6.2 Mock branch — list

- Returns `MOCK_F4_MEASUREMENT_UNITS` ordered by `(tenantId asc, code asc)` (matches the F4.4D backend).
- Two rows mirroring the F4.3 seed:
  - **HP-001** — High Pressure / High Flow Test Unit; `operatingProfile: 'high_pressure_high_flow'`; `status: 'active'`; `location: 'Yard / Test Bench'`; `equipmentType: EMMAD summary`.
  - **LP-001** — Low Pressure / Medium Flow Test Unit; `operatingProfile: 'low'`; `status: 'active'`; same location + EMMAD type.
- All four filters apply locally with strict equality (no fuzzy matching), exactly as the F4.4D backend's Prisma `where`.

### 6.3 Mock branch — detail

`adapterGetMeasurementUnit(id)` returns the full `MeasurementUnitDetail` shape with includes:

- `equipmentType` (the full row — not just the summary).
- `sensors[]` — ordered by `instrumentTag asc`, each with `transmitterDevices[]` filtered to `installationStatus = 'installed'` only (matches the F4.4D unit-detail include).
- `unitConfigurations[]` — exactly one entry (the current row, `isCurrent: true`).
- `unitOperatingEnvelopes[]` — exactly one entry (`isCurrent: true`) with `engineeringUnitSet` populated.
- `alarmRules[]` — only `isCurrent: true` rows; each joined with a `canonicalTag` scalar (`{ id, name, displayName, canonicalUnit, category, precision }`).

**HP-001 detail** mirrors the F4.3 seed in full: 7 sensors (`HP-PIT-001` / `HP-PIT-002` / `HP-TIT-001` / `HP-FIT-001` / `HP-FIT-002` / `HP-LIT-001` / `HP-VIT-001`), each with one currently-installed transmitter; 14 alarm rules (7 tags × {warning, critical}); the operating envelope mirrors the F4.3 seed's HP envelope (`maxPressure: 5000`, `maxFlowRate: 10000`, `maxGasRate: 5.0`, …).

**LP-001 detail** is a representative subset: 2 sensors (`LP-PIT-001`, `LP-FIT-001`), 2 alarm rules. The fixture file's comment notes the choice — LP-001's full sensor list adds nothing to the test plan that HP-001 doesn't already cover, and keeping the fixture readable mattered. F4.5D / F4.5E can extend LP-001 if a future test requires the full surface.

### 6.4 API branch

Delegates to `listMeasurementUnits` / `getMeasurementUnit`. The list endpoint composes a single query string from up to four filters; the by-id endpoint URL-encodes the UUID.

### 6.5 Decimal-value handling

Every numeric field on `MeasurementUnitDetail` (sensor `minRange` / `maxRange`, transmitter `calibrationRangeMin` / `calibrationRangeMax`, every alarm threshold, every operating envelope ceiling) is `Decimal` on the backend and **serialized as a string** via Prisma's `Decimal.toJSON`. The mock fixtures match this convention (using `String(numericLiteral)`). Migrating screens that need numeric math call `Number(value)`.

## 7. Mock Fixtures Added

| Fixture | Rows | Notes |
|---|---|---|
| `MOCK_F4_EQUIPMENT_TYPES` | 2 | EMMAD + EMGAD; each with `defaultSensorTemplate` JSON. |
| `MOCK_F4_MEASUREMENT_UNITS` | 2 | HP-001 + LP-001 list rows; each carries an `equipmentType: { id, name, pidReference }` summary. |
| `MOCK_F4_MEASUREMENT_UNIT_DETAILS` | 2 (lookup) | HP-001 (full: 7 sensors + 14 alarm rules + current config + current envelope); LP-001 (representative: 2 sensors + 2 alarm rules). |

All identifiers continue the F4.5B placeholder convention (`00000000-0000-0000-0000-XXXXXXXXXXXX`). Sensor / transmitter / alarm-rule / configuration / envelope UUIDs are derived from a deterministic FNV-1a-flavored hash of a descriptive key (e.g. `sensor:<unitId>:<instrumentTag>`, `tx:<unitId>:<instrumentTag>`, `alarm:<unitId>:<tag>:<severity>`). The leading 28 zero bits keep the mock namespace disjoint from real `gen_random_uuid()` output.

The fixture builder helpers (`buildSensorsWithTransmitters`, `buildAlarmRules`, `buildUnitConfiguration`, `buildUnitOperatingEnvelope`) keep the new section legible — a future addition (e.g. a third unit) is a five-line config object + two array entries.

## 8. View-Model / Derived-Field Decisions

This is the first F4.5 sub-phase where the F3-vs-F4 shape gap appears in practice. The decisions:

### 8.1 Approach: explicit, named, optional helpers

F4.5C does **NOT**:

- Smuggle computed fields into the adapter's response shape (e.g. attaching a `sensorsCount` to the list row).
- Default missing fields to `0` / `'unknown'` / `'psi'` silently.
- Wrap the F4 types in a private "internal" type to hide the difference.

F4.5C **DOES** export six small, named helpers that consumers opt into. Each helper documents what it returns and when it returns `undefined`. The adapter returns the API shape verbatim; the helper layer is composable.

### 8.2 Helpers introduced

| Helper | Returns | Definition |
|---|---|---|
| `deriveSensorsCount(detail)` | `number \| undefined` | `detail.sensors?.length`. Returns `undefined` on a list row (no sensors include) — callers must fetch the detail endpoint when count is needed. |
| `deriveAlarmsCount(detail)` | `number \| undefined` | `detail.alarmRules?.length`. Same shape. Counts only currently-active rules (the detail include filters to `isCurrent: true`). |
| `derivePressureUnit(detail)` | `string \| undefined` | Reads `detail.unitOperatingEnvelopes[0].engineeringUnitSet.pressure`. Returns `undefined` when the envelope is missing or the key is absent / non-string. |
| `deriveFlowUnit(detail)` | `string \| undefined` | Reads `engineeringUnitSet.liquid_flow`. Same shape. |
| `deriveGasUnit(detail)` | `string \| undefined` | Reads `engineeringUnitSet.gas_flow`. Same shape. |
| `toMeasurementUnitSummaryViewModel(row)` | `MeasurementUnitSummaryViewModel` | Projects a list-row to a compact summary (`id, code, name, status, operatingProfile, location, equipmentTypeName, equipmentTypePidReference`). |

### 8.3 Implementation notes

- The three `derive*Unit` helpers share a private runtime narrowing pass that converts `engineeringUnitSet: unknown` (typed as `unknown` because Prisma JSON is `unknown` at the type level) into a partial structural `EngineeringUnitSet` shape with `typeof === 'string'` checks per key. The eslint rule `@typescript-eslint/no-unnecessary-type-assertion` initially flagged a `raw as EngineeringUnitSet` cast in an earlier draft; the final implementation narrows each key explicitly which both satisfies the rule and surfaces malformed envelope JSON as `undefined` instead of a runtime crash.
- The view-model summary does NOT include `pressureUnit` / `flowUnit` / `gasUnit` because those values live on the detail's envelope, not the list row. A screen that wants them per-row would have to issue N detail fetches; if that becomes a real need a future phase can add an `?include=` parameter or a denormalized list view.

### 8.4 What F4.5C explicitly does NOT bridge

The F3 `MeasurementUnit` shape (`apps/web/types/api/unit.ts`) is **untouched**. Anything currently consuming `MeasurementUnit` from `@/types/api` continues to get the F3 shape (with `pressureUnit` / `flowUnit` / `sensorsCount` / `alarmsCount` on the row, F3 mock UUIDs like `unit-hp-001`). F4.5C produces the F4 surface alongside, not as a replacement. Each future screen migration will choose between:

1. Adopting the F4 shape outright (and using the view-model helpers).
2. Keeping the F3 shape locally and writing a one-off `f4ToF3Unit(detail): MeasurementUnit` mapper at the screen boundary.

Both are valid; F4.5C does not pre-empt the choice.

## 9. Confirmation: Mock Remains Default

Verified five ways:

1. **`NEXT_PUBLIC_RVF_DATA_SOURCE` defaults to `mock`** (F4.5A; verified in F4.5B; equipment adapter tests' "delete `process.env.NEXT_PUBLIC_RVF_DATA_SOURCE`" cases all pass).
2. **No screen / hook / route handler / component touched.** Equipment / Units pages (if any) still consume their current data source.
3. **Mock fixtures use placeholder UUIDs** (`00000000-…`). They cannot accidentally match a real `gen_random_uuid()` id.
4. **Existing test suite is unaffected.** Pre-F4.5C: 253 tests across 30 files. Post-F4.5C: 271 tests across 31 files. The delta is exactly the 18 new tests in `equipment.test.ts`. The 253 pre-existing tests still pass byte-for-byte.
5. **Bundle output unchanged for the existing routes.** `next build` reports the same per-route bundle sizes; the new adapter is tree-shaken.

## 10. Confirmation: No Backend / Prisma / Migration / Seed Changes

`git status` shows only frontend + docs changes:

```
modified:   apps/web/lib/api-data/f4/index.ts
modified:   apps/web/lib/api-data/f4/mock-fixtures.ts
?? apps/web/lib/api-data/f4/equipment.test.ts
?? apps/web/lib/api-data/f4/equipment.ts
?? docs/architecture/RVF_Malinois_F4_5C_Equipment_Units_API_Wiring_Report.md
```

No file under `apps/backend/`, `apps/backend/prisma/`, `apps/backend/prisma/migrations/`, `apps/backend/prisma/seed.f4.ts`, `packages/*`, `docker-compose.yml`, `turbo.json`, root `package.json`, `.github/`, or any existing `apps/web/` screen / component / hook / route handler / test was modified.

## 11. Commands Run and Results

| Command | Result |
|---|---|
| `pnpm --filter @rvf/web run lint` | clean exit (fixed three rounds during authoring: `@typescript-eslint/array-type` on `ReadonlyArray<unknown>` → `readonly unknown[]`; `@typescript-eslint/no-unnecessary-type-assertion` on `raw as EngineeringUnitSet` → per-key runtime narrowing). |
| `pnpm --filter @rvf/web run typecheck` | clean. |
| `pnpm --filter @rvf/web run test` | **271/271 across 31 files** (253 pre-existing + 18 new in `equipment.test.ts`). Fixed one test expectation during authoring (`['EMMAD', 'EMGAD']` → `['EMGAD', 'EMMAD']` — lexicographic order). |
| `pnpm --filter @rvf/web run build` | clean (`next build`); existing route bundle sizes unchanged. |
| `pnpm run lint` (workspace) | 4/4 tasks successful. |
| `pnpm run typecheck` (workspace) | 4/4 tasks successful. |
| `pnpm run build` (workspace) | 2/2 tasks successful (FULL TURBO). |
| `pnpm --filter @rvf/web run test:e2e` | **Not run.** No UI change; F4.5C introduces no rendered behavior. |

## 12. Known Limitations

1. **No screen consumes the new equipment adapter yet.** Foundation-shaped. A future per-screen migration will swap an existing component (likely an equipment / units settings page) from its current data source to `adapterListMeasurementUnits` + the view-model helpers.
2. **LP-001 detail is a representative subset.** 2 sensors + 2 alarm rules instead of the full F4.3 seed coverage (7 + 14). Reason: HP-001 already exercises the full include shape end-to-end, and keeping the fixture readable mattered. F4.5D or a later phase can extend if a specific test needs more.
3. **Decimal values surface as strings.** Same posture as F4.5A/B — Prisma `Decimal.toJSON` produces strings; mock fixtures match.
4. **No retry / cache / dedup.** Single async call per adapter. Migrating screens should wrap with TanStack Query (already a dependency).
5. **No mock-mode write paths.** F4 backend has no equipment write endpoints either — the adapter mirrors the read-only F4.4D surface.
6. **The view-model helpers are explicit, not magical.** A migrating screen must `import { deriveSensorsCount } from '@/lib/api-data/f4'` and call it; nothing computes counts implicitly on the adapter response.
7. **`MOCK_F4_MEASUREMENT_UNIT_DETAILS` has to be maintained alongside `MOCK_F4_MEASUREMENT_UNITS`.** Adding a new mock unit means two edits (one list row + one detail map entry). Documented inline; not enforced by types.
8. **No real-DB e2e.** Same posture as F4.5A/B.

## 13. Out of Scope

Repeated explicitly so the reader cannot infer F4.5C quietly shipped any of these:

- **F4.5D — Jobs API wiring.** Next phase.
- **F4.5E — Telemetry trends API wiring.**
- **F4.6 — Telemetry persistence / ingestion / live readings projection / WebSocket fan-out / alarm-event generation.**
- **Screen / page rewrites.** Zero pages or components changed.
- **Units screen wiring to the new adapter.** The Units / Operations / Sensors pages still consume their current sources.
- **F3 mock adapter retirement.** `apps/web/lib/api-data/index.ts` and its `mockX` siblings are byte-for-byte preserved.
- **Live readings.** The unit-detail response carries alarm rules (configuration) but not telemetry / alarm events.
- **Operations expanded chart view.**
- **Auth.**
- **Backend / Prisma / migration / seed changes.** None made.

## 14. Acceptance Criteria — Status

| # | Criterion | Status |
|---|---|---|
| 1 | Equipment types can be read through a data-source-aware frontend adapter. | **Met.** `adapterListEquipmentTypes` / `adapterGetEquipmentType`. |
| 2 | Measurement units can be read through a data-source-aware frontend adapter. | **Met.** `adapterListMeasurementUnits` / `adapterGetMeasurementUnit`. |
| 3 | Mock remains default. | **Met.** §9. |
| 4 | API mode uses `apps/web/lib/api/f4` wrappers. | **Met.** Each adapter function imports the corresponding wrapper from the F4.5A barrel. |
| 5 | Existing mock UI behavior remains intact. | **Met.** No screen / hook / component changed; F3 mock adapter byte-for-byte preserved. |
| 6 | No backend files modified. | **Met.** §10. |
| 7 | No Prisma / migration / seed files modified. | **Met.** |
| 8 | No major screen rewrite. | **Met.** Zero pages or components touched. |
| 9 | No Jobs / Telemetry UI wiring. | **Met.** F4.5D / F4.5E. |
| 10 | No frontend visual redesign. | **Met.** |
| 11 | Derived view-model helpers exist if needed for legacy UI compatibility. | **Met.** Six helpers: `deriveSensorsCount`, `deriveAlarmsCount`, `derivePressureUnit`, `deriveFlowUnit`, `deriveGasUnit`, `toMeasurementUnitSummaryViewModel`. §8. |
| 12 | Tests added / updated for equipment / units adapters and / or derived mappings. | **Met.** 18 new tests in `equipment.test.ts`. |
| 13 | `lint` passes. | **Met.** Frontend + workspace. |
| 14 | `typecheck` passes. | **Met.** Frontend + workspace. |
| 15 | `test` passes. | **Met.** 271 / 271. |
| 16 | `build` passes. | **Met.** Frontend + workspace. |
| 17 | F4.5C report created. | **Met.** This document. |
| 18 | No commit made. | **Met.** All changes are working-tree only. |

All acceptance criteria are met.

## 15. Next Phase Recommendation

**Recommend F4.5D — Jobs API wiring — as the next phase.**

Rationale:

- F4.5D extends the same adapter pattern to F4.4E's `Job` + `CommissioningSnapshot` surface (`GET /jobs`, `GET /jobs/:id`). The F4.3 seed already provisions one reference job + commissioning snapshot anchored on HP-001, so the mock fixtures have a natural baseline.
- F4.5D will exercise the largest detail include so far: `tenant` summary + `well` (with `designLimits`) + `unit` (with nested `equipmentType`) + `engineer` placeholder + the current `commissioningSnapshot` (immutable, with JSONB `effectiveThresholds` / `sensorMappings` / `engineeringEnvelope` / `ruleVersions`). The view-model helper pattern introduced in F4.5C will be reused — likely with one or two new helpers for `deriveCommissioningSummary(snapshot)` and `deriveJobRuntime(job)` (computing `closedAt - startedAt` for closed jobs, "in progress for N days" for open ones).
- After F4.5D, only F4.5E (telemetry trends) and screen-level migrations remain in the F4.5 stream. F4.5E can land in parallel with F4.6 architecture work since the trends endpoint is read-only and already deterministic (empty `points` until F4.6 populates `telemetry_readings`).

Suggested F4.5D scope:

1. `apps/web/lib/api-data/f4/jobs.ts` with `adapterListJobs(params?)` / `adapterGetJob(id)` and explicit view-model helpers for commissioning-snapshot summaries.
2. Extend `mock-fixtures.ts` with `MOCK_F4_JOBS` (list rows) + `MOCK_F4_JOB_DETAILS` (lookup) + one `MOCK_F4_COMMISSIONING_SNAPSHOT` fixture mirroring the F4.3 seed's HP-001 snapshot. Reuse the F4.5C `MOCK_F4_MEASUREMENT_UNITS` / `MOCK_F4_WELLS` for nested includes.
3. 10–15 new adapter tests following the F4.5C template.
4. F4.5D closeout report.

Two parallel streams remain:

- **F4.5 screen migrations** — start migrating the smallest equipment / units consumer when one is identified (likely a settings or directory page).
- **F4.6 architecture + ADR** — start the telemetry-persistence design.
