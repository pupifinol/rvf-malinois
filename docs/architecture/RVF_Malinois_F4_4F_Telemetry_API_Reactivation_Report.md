# RVF Malinois — F4.4F TelemetryModule API Reactivation Report

> Phase **F4.4F — TelemetryModule API Reactivation (read-only trends).**
> Final F4.4 sub-phase. Closes the F4.2B quarantine.
>
> References:
> - F4 architecture: `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md` (commit `f36923a`)
> - ADR-007: `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md` (commit `8147399`)
> - F4.2B strategy: `docs/architecture/RVF_Malinois_F4_2B_Insulation_Strategy_Confirmation.md` (commit `a8862e2`)
> - F4.2B implementation: `docs/architecture/RVF_Malinois_F4_2B_Prisma_Baseline_Migration_Report.md` (commit `e37f7b5`)
> - F4.3 seed: `docs/architecture/RVF_Malinois_F4_3_Seed_Reference_Data_Report.md` (commit `91e17aa`)
> - F4.4A–E: `2f5c108`, `20dadca`, `0ec1099`, `3cdee45`, `ebaa23b`.

## 1. Summary

F4.4F reactivates `TelemetryModule` on the F4 canonical client in a strictly read-only posture: a single endpoint, `GET /api/v1/telemetry/trends`, executes a bounded range scan against `telemetry_readings` for one canonical tag on one measurement unit. No ingestion, no live readings, no WebSocket broadcasting, no alarm events, no Operations charts.

This is the heaviest F4.4 sub-phase by deletion volume but the simplest by added surface. The F1 module bundled five concerns: a placeholder controller (501 stubs for series / last-value / ingest), an ingestion envelope contract, an ingestion-adapter interface, a `TelemetryValidator` for inbound envelopes, and a `TrendsService` that read from TimescaleDB continuous aggregates via raw SQL. F4.2B retired the F1 Prisma schema. F4 stores telemetry in a plain PostgreSQL table (no hypertables, no continuous aggregates) and decouples reads from the commissioning snapshot — every reading carries `(tenant_id, unit_id, sensor_id, canonical_tag_id)` FKs, so the resolver no longer needs the F1 `JobSensorSnapshot` path. The F4.4F surface follows: one Zod-validated controller, one resolver, one service, one contracts file, the existing pure-math unit-converter retained as a provider for future use, and mocked-Prisma vitest suites in place of the live-DB F1 specs.

Four F1 files were **deleted** because they exclusively encoded the write/ingest path that F4.6 will redesign: `contracts/envelope.ts`, `contracts/ingestion-adapter.ts`, `telemetry.validator.ts`, `telemetry.validator.spec.ts`. F4.6 will introduce a fresh ingestion design aligned with the F4 `integration_sources` / `integration_mappings` tables and the canonical `telemetry_readings` columns; reviving the F1 envelope shape (with its retired `Quality` 5-value enum, lowercase `unit_id` slug, and adapter-stream interface) would have created dead code that drifts from reality before F4.6 lands.

F4.4F also **closes the F4.2B quarantine entirely**: `app.module.ts`, `tsconfig.json`, `eslint.config.mjs`, and `vitest.config.ts` no longer carry any feature-directory exclude/ignore. The F4.2B quarantine introduced in commit `e37f7b5` is fully unwound.

All quality gates pass: `prisma validate`, `prisma generate`, backend + workspace-wide `lint` / `typecheck` / `build`, plus the backend `vitest` suite (**69/69 tests** including 5 new trends tests + 6 new resolver tests + 16 retained unit-converter tests). No commit was made.

## 2. Files Changed

### 2.1 Deleted (F1 write/ingest path)

| Path | Reason |
|---|---|
| `apps/backend/src/telemetry/contracts/envelope.ts` | F1 ingestion envelope schema. Imported the removed `Quality` enum value. Encoded a wire-protocol shape (`schema: 'rvf.telemetry.v1'`, lowercase `unit_id` slug, `seq`, `measurements` map) that F4.6 will redesign against `telemetry_readings`. |
| `apps/backend/src/telemetry/contracts/ingestion-adapter.ts` | F1 generic ingestion-adapter interface + `LateTelemetryReason` (removed model). Tied to a specific F2-era ingestion architecture that F4 will not preserve verbatim. |
| `apps/backend/src/telemetry/telemetry.validator.ts` | F1 inbound-envelope validator. Depended on the deleted envelope contract. Redundant with the controller-side `ZodValidationPipe` for the F4.4F read endpoint. |
| `apps/backend/src/telemetry/telemetry.validator.spec.ts` | Tests for the deleted validator. |

### 2.2 Rewritten

| Path | Change |
|---|---|
| `apps/backend/src/telemetry/contracts/trends.ts` | Replaced. New `TELEMETRY_QUALITIES` / `TELEMETRY_SOURCES` CHECK mirrors, `TrendsQuerySchema` (Zod, with XOR refine on `canonicalTagId` / `canonicalTagName` and `from < to` refine), `TrendsResponse` / `TrendPoint` types. F1 `BucketSize` / `QualityMix` / `BucketAggregate` retired (F4.6 will design any bucketed views). |
| `apps/backend/src/telemetry/canonical-tag-resolver.ts` | Rewritten. Resolves by UUID or by `name` directly from `canonical_tags`. F1 cache + active-job lookup retired (no longer needed: `telemetry_readings.canonical_tag_id` is a hard FK). |
| `apps/backend/src/telemetry/trends.service.ts` | Rewritten. `prisma.telemetryReading.findMany` with `{ where: { unitId, canonicalTagId, timestamp, jobId?, quality?, source? }, orderBy: { timestamp: 'asc' }, take: limit, select: {...} }`. F1's hypertable + continuous-aggregate raw SQL retired. No unit conversion at read time. |
| `apps/backend/src/telemetry/telemetry.controller.ts` | Rewritten. Single endpoint `GET /api/v1/telemetry/trends` with Zod-validated query. F1 placeholder routes (`/jobs/:code/series`, `/jobs/:code/last`, `POST /telemetry`) removed. |
| `apps/backend/src/telemetry/telemetry.module.ts` | Trimmed. Providers list: `CanonicalTagResolver`, `TrendsService`, `UnitConverter`. F1's `TelemetryValidator` provider dropped along with the deleted file. |
| `apps/backend/src/telemetry/canonical-tag-resolver.spec.ts` | Replaced. 6-test mocked-Prisma suite. F1's live-DB suite (which tested `JobSensorSnapshot` resolution, active-job lookup, cache, idle TTL) is retired with the F1 code. |
| `apps/backend/src/telemetry/trends.service.spec.ts` | Replaced. 5-test mocked-Prisma suite. F1's live-DB suite (which exercised the hypertable + continuous-aggregate routing) is retired with the F1 code. |

### 2.3 Kept unchanged

| Path | Why |
|---|---|
| `apps/backend/src/telemetry/unit-converter.ts` | Pure math, F4-clean, zero Prisma dependency. Retained as a `TelemetryModule` provider for future projection-layer / ingestion-layer code that may need linear unit conversion (kPa↔psi, °C↔°F, m³/d↔bbl/d, Nm³/h↔MMscf/d, etc.). The F4.4F trend endpoint does **not** call it. |
| `apps/backend/src/telemetry/unit-converter.spec.ts` | 16 tests of the converter, all F4-clean. |

### 2.4 Quarantine closure

| Path | Change |
|---|---|
| `apps/backend/src/app.module.ts` | Added `TelemetryModule`; header rewritten to "F4.4 COMPLETE STATE". |
| `apps/backend/tsconfig.json` | Removed `src/telemetry/**` from `exclude`. `exclude` now lists only `node_modules`, `dist`, `test` — the F4.2B feature-directory excludes are entirely gone. |
| `apps/backend/eslint.config.mjs` | Removed the layered `ignores` block; file is back to the original 3-line `export default nest;`. |
| `apps/backend/vitest.config.ts` | Removed `src/telemetry/**` from `exclude`. `exclude` now lists only `node_modules/**` and `dist/**`. |

### 2.5 New documentation

| Path | Change |
|---|---|
| `docs/architecture/RVF_Malinois_F4_4F_Telemetry_API_Reactivation_Report.md` | **New.** This document. |

No edits under `apps/web/`, `packages/`, `apps/backend/prisma/`, `docker-compose.yml`, `.github/`, or root config files.

## 3. Telemetry API Behavior Restored

### 3.1 Endpoint surface (F4.4F)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/telemetry/trends` | Range scan against `telemetry_readings` for one canonical tag on one measurement unit. Read-only. |

No other telemetry endpoint is exposed. F1's `GET /telemetry/jobs/:code/last` is **gone**; the latest-readings concept moves to F4.5 (`live_readings_projection`) / F4.6. F1's `POST /telemetry` ingest placeholder is **gone**; ingestion belongs to F4.6.

### 3.2 Query parameters

| Param | Required | Type | Notes |
|---|---|---|---|
| `unitId` | yes | UUID | Validated by Zod. |
| `from` | yes | ISO-8601 timestamp | `z.coerce.date()`; must satisfy `from < to`. |
| `to` | yes | ISO-8601 timestamp | `z.coerce.date()`. |
| `canonicalTagId` | XOR | UUID | Exactly one of `canonicalTagId` / `canonicalTagName` must be supplied. |
| `canonicalTagName` | XOR | string (1..64) | e.g. `p_inlet`. Stable business key. |
| `jobId` | no | UUID | Filter by job. |
| `quality` | no | enum | `good \| uncertain \| bad` (mirrors F4 CHECK on `telemetry_readings.quality`). |
| `source` | no | enum | `mock \| manual \| field_gateway \| historian \| plc \| mqtt \| node_red \| opc_ua \| modbus \| edge_gateway` (mirrors F4 CHECK on `telemetry_readings.source`). |
| `limit` | no | int | Default `1000`, max `5000`. |

Validation behavior:
- **Missing required fields** → 400 with the Zod issue list.
- **Both `canonicalTagId` and `canonicalTagName`** → 400 (rejected as ambiguous; clearer than a precedence rule).
- **Neither** → 400 (same Zod refine).
- **`from >= to`** → 400.
- **Malformed UUID** → 400.
- **Unknown canonical tag** → 404 (`CanonicalTagResolver` surfaces it).
- **No telemetry rows in range** → 200 with `points: []`.

### 3.3 Response shape

```json
{
  "unitId": "00000000-0000-0000-0000-000000004411",
  "canonicalTag": {
    "id": "00000000-0000-0000-0000-0000000044f1",
    "name": "p_inlet",
    "displayName": "Inlet pressure",
    "canonicalUnit": "psi",
    "category": "pressure",
    "precision": 1
  },
  "range": {
    "from": "2026-05-24T00:00:00.000Z",
    "to":   "2026-05-25T00:00:00.000Z"
  },
  "points": [
    {
      "timestamp": "2026-05-24T00:00:30.000Z",
      "value": "4123.4",
      "engineeringUnit": "psi",
      "quality": "good",
      "source": "mock"
    }
  ]
}
```

`points[].value` is a Prisma `Decimal` which JSON-serializes to a **string** via `Decimal.toJSON`. Consumers that need a JavaScript `number` parse with `Number(...)`. F4.4F deliberately does no conversion at read time (per F4 §F): `engineeringUnit` is whatever was stored — typically equal to `canonicalTag.canonicalUnit`, but the field is exposed in case a future ingestion writes in an alternate unit and a downstream consumer needs to handle the discrepancy.

### 3.4 Tenant scoping

Identical to F4.4A–E: when `CallerContext.tenantId` is set, the `where` clause filters by tenant. With the current `SystemContext` (no auth), reads are cross-tenant — every reading for the given `(unitId, canonicalTagId, time range)` is returned.

## 4. Prisma Models Used

| Model | How |
|---|---|
| `TelemetryReading` | `prisma.telemetryReading.findMany` with `{ where, select, orderBy, take }`. |
| `CanonicalTag` | `prisma.canonicalTag.findUnique({ where: { id } })` or `{ where: { name } }` via `CanonicalTagResolver`. |

No raw SQL, no `$queryRaw`, no transactions, no write paths.

## 5. Treatment of Old Ingestion Paths

**Deleted, not adapted.** Rationale:

- F1's ingestion contracts (`envelope.ts`, `ingestion-adapter.ts`) and the `TelemetryValidator` encoded a specific F2-era ingestion architecture: an `IngestionAdapter` interface with `start() / stop() / envelopes(): AsyncIterable<AdapterEnvelope>`, a `TelemetryIngestionService` that returned `'accepted' | 'duplicate' | 'quarantined' | 'rejected'` outcomes, a `LateTelemetryQuarantine` table to never-silently-drop a payload. The F4 architecture (F4 §I) restructures integration metadata around `integration_sources` + `integration_mappings` and removes the `LateTelemetryQuarantine` model entirely. The F4.6 ingestion design will not replay the F1 shape verbatim.
- Adapting the F1 contracts to F4 (e.g. replacing the 5-value `Quality` enum with the F4 3-value string-literal union, dropping `LateTelemetryReason`, renaming `unit_id` slug to UUID) would have produced compiling-but-unused code that drifts as F4.6 evolves the integration design. Deleting them now and re-introducing fresh contracts in F4.6 is the lower-drift option.
- The F1 `TelemetryValidator` provided a "validate inbound envelope" service; with the envelope contract gone and the F4.4F read endpoint already using `ZodValidationPipe` at the controller boundary, the validator had no F4.4F consumer.

The retired surface is preserved in git history at commit `e37f7b5` (F4.2B baseline) where the F1 versions are last visible. F4.6 will introduce the new ingestion design from a clean slate.

No write endpoint, no scheduled job, no WebSocket broadcast, no MQTT/OPC-UA/Node-RED/ThingsBoard connection, no insert into `telemetry_readings`. The module exposes only the trend read.

## 6. Treatment of `canonical-tag-resolver.ts`

**Rewritten.** F1 implementation owned a substantial active-job + JobSensorSnapshot resolution path with an LRU-bounded process-local cache and an idle-TTL eviction. F4.4F retires the entire cache and the active-job lookup because F4 telemetry rows carry `canonical_tag_id` as a hard FK — the resolver no longer needs to traverse `Job → JobSensorSnapshot` on hot paths. The reactivated surface is two methods (`resolve({ id })` and `resolve({ name })`) over `canonical_tags.id @id` and `canonical_tags.name @unique`. PostgreSQL's unique indexes do the work; no application-layer cache is justified for the F4.4F read surface.

The resolver also guards independently against ambiguous input (`id` and `name` both supplied) and missing input (neither) — even though the controller-side Zod schema already rejects the same combinations. Defence-in-depth for direct service consumers (e.g. internal helpers that may bypass the controller in F4.6).

## 7. Treatment of `telemetry.validator.ts`, `contracts/*`, `unit-converter.ts`

| File | Treatment | Why |
|---|---|---|
| `telemetry.validator.ts` | **Deleted.** | F1 inbound-envelope shape validator; redundant with the controller's `ZodValidationPipe` for the F4.4F read endpoint, and depended on the deleted envelope contract. F4.6 will re-introduce a validator against the freshly designed ingest payload. |
| `contracts/envelope.ts` | **Deleted.** | F1 wire protocol (`rvf.telemetry.v1`); F4.6 will design a fresh ingest contract aligned with F4 `telemetry_readings` columns. |
| `contracts/ingestion-adapter.ts` | **Deleted.** | F1 `IngestionAdapter` interface tied to the F2 ingestion architecture; F4.6 owns the new design. |
| `contracts/trends.ts` | **Rewritten.** | F4 query / response types. Mirrors F4 CHECK lists (`TELEMETRY_QUALITIES`, `TELEMETRY_SOURCES`). Bucket/aggregate types dropped pending F4.6. |
| `unit-converter.ts` | **Kept unchanged.** | Pure math, F4-clean, zero Prisma. Retained as a `TelemetryModule` provider for downstream consumers; not called by the F4.4F trend endpoint. |
| `unit-converter.spec.ts` | **Kept unchanged.** | 16 tests of the converter, all F4-clean. |

## 8. Quarantine Changes — F4.2B Closure

F4.4F closes the F4.2B quarantine **entirely**. Before F4.4F (state immediately after F4.4E):

| File | Excluded directories |
|---|---|
| `apps/backend/tsconfig.json` `exclude` | `node_modules`, `dist`, `test`, `src/telemetry/**` |
| `apps/backend/eslint.config.mjs` `ignores` (layered) | `src/telemetry/**` |
| `apps/backend/vitest.config.ts` `exclude` | `node_modules/**`, `dist/**`, `src/telemetry/**` |

After F4.4F:

| File | Excluded directories |
|---|---|
| `apps/backend/tsconfig.json` `exclude` | `node_modules`, `dist`, `test` |
| `apps/backend/eslint.config.mjs` | `export default nest;` (no layered ignore block) |
| `apps/backend/vitest.config.ts` `exclude` | `node_modules/**`, `dist/**` |

The F4.2B-introduced quarantine machinery is fully unwound. Every feature module (`tenants / wells / tags / equipment / jobs / telemetry`) is back on the F4 client, lint-clean, typecheck-clean, build-clean, test-green.

In `apps/backend/src/app.module.ts`:
- `import { TelemetryModule } from './telemetry/telemetry.module';` added.
- `TelemetryModule` appended to `imports` (after `JobsModule`).
- Header rewritten from "F4.4E reactivation state" to "F4.4 COMPLETE STATE" with a reactivation history and out-of-scope pointers to F4.5 / F4.6.

## 9. Tests Added / Updated

11 mocked-Prisma vitest tests added across two new specs, replacing the two retired live-DB specs:

### 9.1 `canonical-tag-resolver.spec.ts` (6 tests)

| Test | Verifies |
|---|---|
| `resolve: looks up by UUID when only id is provided` | `findUnique({ where: { id } })` issued. |
| `resolve: looks up by name when only name is provided` | `findUnique({ where: { name } })` issued. |
| `resolve: throws BadRequestException when both id and name are supplied` | Ambiguous input rejected at the service layer. |
| `resolve: throws BadRequestException when neither id nor name is supplied` | Empty input rejected. |
| `resolve: throws NotFoundException when looking up by id misses` | Missing UUID → 404. |
| `resolve: throws NotFoundException when looking up by name misses` | Missing name → 404. |

### 9.2 `trends.service.spec.ts` (5 tests)

| Test | Verifies |
|---|---|
| `query: returns empty points + the canonical-tag metadata when telemetry_readings is empty` | Empty-table pass-through; response shape includes `unitId`, `range`, `canonicalTag` even when `points: []`. F4.4F expectation on the F4.3 baseline. |
| `query: issues the F4 where / orderBy / take / select shape` | Asserts the full Prisma call shape for the happy path (with `canonicalTagId`). |
| `query: passes through optional jobId / quality / source filters` | Optional filters appear in `where` exactly as supplied; `limit` propagates to `take`. |
| `query: adds the tenant filter when ctx.tenantId is present` | CallerContext scoping seam preserved. |
| `query: forwards the canonicalTagName variant to the resolver` | Alternative lookup form goes through the same resolver indirection. |

### 9.3 Retained

| Spec | Tests |
|---|---|
| `unit-converter.spec.ts` | 16 (psi↔kPa↔bar, degC↔degF↔K, m³/d↔bbl/d, Nm³/h↔MMscf/d, ratio↔pct, identity, alias normalization, unknown unit failure, supportedConversions diagnostic). |

### 9.4 Backend test totals after F4.4F

**69/69 pass**, across 10 spec files:
- `health.controller.spec.ts` — 1
- `tenants.service.spec.ts` — 6
- `wells.service.spec.ts` — 7
- `tags.service.spec.ts` — 7
- `equipment.service.spec.ts` — 10
- `jobs.service.spec.ts` — 7
- `commissioning.service.spec.ts` — 4
- `unit-converter.spec.ts` — 16
- `canonical-tag-resolver.spec.ts` — 6
- `trends.service.spec.ts` — 5

No DB connection required.

## 10. Commands Run and Results

| Command | Result |
|---|---|
| `pnpm --filter @rvf/backend exec prisma validate` | `The schema at prisma/schema.prisma is valid 🚀` |
| `pnpm --filter @rvf/backend exec prisma generate` | Clean (Prisma Client 5.22.0) |
| `pnpm --filter @rvf/backend run lint` | clean (fixed 1 `@typescript-eslint/consistent-type-imports` during authoring — `CanonicalTagResolver` only used as a type in the trends spec). |
| `pnpm --filter @rvf/backend run typecheck` | clean (src + prisma) |
| `pnpm --filter @rvf/backend run test` | **69 passed / 69** across 10 files |
| `pnpm --filter @rvf/backend run build` | clean (`nest build`) |
| `pnpm run lint` (workspace) | 4/4 successful |
| `pnpm run typecheck` (workspace) | 4/4 successful |
| `pnpm run build` (workspace) | 2/2 successful |

## 11. What Remains Out of Scope

- **Ingestion of any kind.** No `POST /telemetry`, no `POST /ingest`, no scheduled writer, no MQTT/Node-RED/ThingsBoard/OPC-UA/Modbus client. F4.6.
- **Live readings.** `live_readings_projection` view is not queried. No "latest" / "current value" endpoint. F4.5 / F4.6.
- **Alarm event generation.** No row written to `alarm_events`. Alarm-rule reads remain in `EquipmentModule`'s unit detail (F4.4D); alarm-event evaluation belongs to F4.6.
- **WebSocket telemetry broadcasting.** The `RealtimeModule` Socket.IO scaffolding is unchanged; no telemetry routing.
- **Bucketed / aggregate reads.** F1's `?bucket=1m|15m|1h` parameter is retired. F4.6 will decide whether to reintroduce server-side bucketing (materialized view, app-layer aggregation, or client-side).
- **Unit conversion at read time.** Trends return points in the stored `engineeringUnit`. If a future consumer needs canonical-unit output, conversion can layer on via the retained `UnitConverter`.
- **Search / full-text on points.** N/A; range scan only.
- **`packages/types` exports.** Not added; F4.5 will surface a shared TypeScript type for the trends response when the frontend starts consuming the live endpoint.
- **Controller integration tests against a real DB.** Deferred until the F4 test harness lands.
- **Schema or migration changes.** None made; none needed.

## 12. Risks / Limitations

1. **Breaking shape changes vs F1 (intentional).** F1 endpoints `/telemetry/jobs/:code/series`, `/telemetry/jobs/:code/last`, `POST /telemetry` are gone. The reactivated surface is `GET /telemetry/trends?unitId=...&from=...&to=...&canonicalTag*=...`. The frontend currently reads from the F3 `lib/api-data/` mock adapter; F4.5 must align.
2. **`points[].value` is a Prisma `Decimal` serialized as a string.** Consumers that expect a JavaScript `number` must `Number(value)`. Documented in §3.3.
3. **F4.3 does not seed `telemetry_readings`.** On the F4.2 baseline the endpoint returns `points: []`. This is correct behavior and is asserted by the spec. F4.6 will populate the table.
4. **`limit` defaults to 1000, capped at 5000.** F1's cap was 50_000 against a hypertable. F4.4F's lower cap is conservative for a plain table; if real workloads need higher caps F4.6 can raise it after measuring.
5. **No unit conversion at read time.** If a future ingestion path writes a row in a non-canonical engineering unit (e.g. `kPa` against a `psi` canonical tag), the API surfaces the stored unit verbatim. Consumers must reconcile. The retained `UnitConverter` makes this fix a 1-call patch when needed.
6. **CHECK constraints mirrored as application tuples.** `TELEMETRY_QUALITIES` / `TELEMETRY_SOURCES` could drift from the DB; reviewer catches.
7. **No real-DB e2e.** Same posture as F4.3 / F4.4A–E.
8. **`CommissioningService` and `CanonicalTagResolver` are now both small read helpers.** Different domains (commissioning vs telemetry resolution); kept separate per F4 §F / §G domain boundaries. No code is shared between them.

## 13. Acceptance Criteria — Status

| # | Criterion | Status |
|---|---|---|
| 1 | TelemetryModule is active in `app.module.ts`. | **Met.** |
| 2 | TelemetryModule compiles against F4 Prisma schema. | **Met.** |
| 3 | TelemetryModule removed from quarantine excludes. | **Met.** All three configs are clean. |
| 4 | TenantsModule remains active. | **Met.** |
| 5 | WellsModule remains active. | **Met.** |
| 6 | CanonicalTagsModule remains active. | **Met.** |
| 7 | EquipmentModule remains active. | **Met.** |
| 8 | JobsModule remains active. | **Met.** |
| 9 | All quarantined modules from F4.2B are now either reactivated or intentionally documented. | **Met.** All six reactivated; F1 ingestion path documented as deleted and re-introduction deferred to F4.6. |
| 10 | Telemetry API is read-only. | **Met.** Only `GET /trends`. |
| 11 | `GET /api/v1/telemetry/trends` exists. | **Met.** |
| 12 | Trends query uses `telemetry_readings`. | **Met.** `prisma.telemetryReading.findMany`. |
| 13 | Canonical tags resolve through `canonical_tags` by id/name. | **Met.** §6. |
| 14 | No telemetry ingestion implemented. | **Met.** |
| 15 | No writes to `telemetry_readings`. | **Met.** |
| 16 | No live readings implemented. | **Met.** |
| 17 | No WebSocket telemetry broadcasting implemented. | **Met.** |
| 18 | No alarm event generation. | **Met.** |
| 19 | `lint` passes. | **Met.** Backend + workspace. |
| 20 | `typecheck` passes. | **Met.** Backend (src + prisma) + workspace. |
| 21 | `build` passes. | **Met.** Backend (`nest build`) + workspace. |
| 22 | Backend tests pass / quarantined documented. | **Met.** 69/69 pass. No quarantined specs remain. |
| 23 | No frontend files changed. | **Met.** |
| 24 | No Prisma schema / migration changes. | **Met.** |
| 25 | No seed data added. | **Met.** |
| 26 | F4.4F report created. | **Met.** This document. |
| 27 | No commit made. | **Met.** All changes are working-tree only. |

All acceptance criteria are met.

## 14. Next Phase Recommendation

**Recommend F4.6 — Telemetry persistence / ingestion — as the next phase**, with **F4.5 (UI connection) running in parallel** wherever feasible.

Rationale for F4.6 first / parallel with F4.5:

- **F4.4 is complete.** All six F1 feature modules are reactivated against the F4 client. The backend exposes a complete read surface: `/api/v1/tenants`, `/wells`, `/tags`, `/equipment/{types,units}`, `/jobs`, `/telemetry/trends`. There is no remaining quarantined code.
- **F4.6 unblocks the most user-visible gap.** `telemetry_readings` is empty until ingestion lands. Every other endpoint already returns meaningful F4.3-seeded data. F4.5 can phase the frontend off the mock adapter for the read endpoints **now**, but the Operations / trends / live-readings screens stay on the mock until F4.6 finishes.
- **F4.6 has the biggest architectural decision surface** of the remaining phases: ingestion adapter design (one process? multiple? sidecars?), MQTT/OPC-UA/Modbus client choice, deduplication strategy (`integration_mappings.external_identifier` uniqueness vs an app-layer dedup window), late-arrival quarantine (do we recreate `LateTelemetryQuarantine` or accept best-effort?), live-readings projection (`live_readings_projection` view as-is? materialized view? upsert-maintained table?), and WebSocket fan-out. The architecture-doc + ADR work for F4.6 should start before the implementation does.
- **F4.5 in parallel** can deliver visible UI value on tenants / wells / tags / equipment / jobs immediately. Each of those modules has a deterministic seed and a working endpoint.

Suggested F4.5 + F4.6 sequencing:

- **F4.5a** — frontend cuts from `lib/api-data/` mock to live `/api/v1/{tenants,wells,tags,equipment,jobs}` endpoints, one screen at a time. The trends / Operations screens remain on the mock.
- **F4.6 architecture + ADR** — design the F4 ingestion surface and the live-readings projection mechanism. Update F4 §F / §I architecture docs and write an ADR-008 (or similar) before implementation.
- **F4.6 implementation** — wire the first adapter (probably `manual` / `historian` REST POST for testability, then `mqtt`). Lands `POST /api/v1/telemetry` (or the new ingest path), writes to `telemetry_readings`, optionally maintains `live_readings_projection`.
- **F4.5b** — frontend cuts the trends / Operations screens to live `/api/v1/telemetry/trends` once F4.6 has populated `telemetry_readings`.
- **F4.7** (or whichever number lands) — alarm-event evaluation against `alarm_rules` + `telemetry_readings`, WebSocket broadcast of new alarms.

If team capacity favors a different ordering, F4.5 alone is also a perfectly safe next phase — the frontend reads do not require F4.6.

The F4.4F PR can therefore be the final F4.4 PR; F4.5 and F4.6 open as separate streams.
