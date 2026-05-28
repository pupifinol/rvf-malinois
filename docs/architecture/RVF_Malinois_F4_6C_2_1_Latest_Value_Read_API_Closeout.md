# RVF Malinois — F4.6C.2.1 Latest-value Read API Closeout

> Phase **F4.6C.2.1 — Latest-value Read API Implementation**. Implements the plan locked in F4.6C.2-0 against repository HEAD `5d2d3b5` (Refresh master roadmap after F4.6C.2-0).
>
> Upstream references:
> - F4.6C.2-0 plan: `docs/architecture/RVF_Malinois_F4_6C_2_Latest_Value_Read_API_Plan.md` (commit `c077478`).
> - F4.6C.1 closeout (the projection this API reads): `docs/architecture/RVF_Malinois_F4_6C_1_Live_Readings_Projection_Updater_Closeout_Report_v1.0.md` (commit `49a8349`).
> - F4.6F.1 closeout (the trend API whose contract this phase mirrors): `docs/architecture/RVF_Malinois_F4_6F_1_Historical_Trend_API_Closeout.md` (commit `946a023`).
> - F4.5G.2.1 closeout (introduced the `isUuidShaped` predicate that anchors the guardrail posture): `docs/architecture/RVF_Malinois_F4_5G_2_1_Operations_Realtime_Tile_Status_Wiring_Closeout.md` (commit `2457c4d`).

## 1. Purpose

F4.6C.2.1 implements the canonical *current-value* read API over the `live_readings` projection populated by F4.6C.1. Before this phase, the platform had no public surface for "what is the current value of this unit's inlet pressure right now?" — the trend API is range-scan-shaped, the realtime fan-out is tail / notification (not durable hydration), and `live_readings` was populated but unreadable except by the projection writer. F4.6C.2.1 fills that gap with a small read-only NestJS service + controller method, plus a matching frontend dual-mode adapter so screens can consume the new endpoint through the existing F4.5E pattern.

## 2. Scope Implemented

- **Backend Zod contract** at `apps/backend/src/telemetry/contracts/latest.ts`: `LatestQuerySchema` (`unitId` UUID required; `canonicalTagId` / `canonicalTagName` XOR optional; `.strict()` rejection of unknown fields); response types `LatestValueRow` and `LatestResponse`; re-exports `TELEMETRY_QUALITIES` / `TelemetryQuality` from the trends contract for shared use.
- **Backend service** at `apps/backend/src/telemetry/latest.service.ts`: read-only `LatestService.query(ctx, input)` over `prisma.liveReading.findMany` with the existing `CallerContext` tenant-scoping seam, the existing `CanonicalTagResolver` for the optional tag-by-id-or-name path, and a defensive `narrowQuality` mapper that collapses any unexpected stored quality string to `'good'` (the F4.6C.1 invariant). Constant `source: 'live_readings'`; server-side `generatedAt`. **First backend module authorized to *read* `prisma.liveReading.*`** (the projection service remains the only writer).
- **Controller method** `@Get('latest')` on the existing `TelemetryController` with Swagger decorators mirroring the F4.6F.1 trend route's documentation depth.
- **Module wiring** at `apps/backend/src/telemetry/telemetry.module.ts`: `LatestService` added to `providers` + `exports`. `TelemetryController` constructor now injects both `TrendsService` and `LatestService`.
- **Narrowed ingestion isolation invariant** at `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` test #17: invariant is now expressed as "the ingestion service does not **write** `prisma.liveReading.*` directly" (no `create` / `upsert` / `updateMany`). Read assertion removed because read access is permitted (by the new `LatestService`) at the module level — the ingestion service itself still does not read the projection, but the assertion narrows so it stays accurate about *what it protects*: nobody writes the projection except F4.6C.1's `LiveReadingsProjectionService`.
- **Backend spec** at `apps/backend/src/telemetry/latest.service.spec.ts`: 22 new tests covering empty-envelope, list-by-unit, single-tag filtering (by id and by name), tenant-scoping under `SystemContext` vs explicit `tenantId`, response-shape stability (no `tenantId` / `id` / `createdAt` / `updatedAt` / `status` leaks), `select` clause shape, Decimal pass-through, `generatedAt` freshness, constant `source`, isolation from `telemetry_readings`, defensive quality narrowing, plus 9 Zod-validation tests (accept-only-unitId / accept-with-id / accept-with-name / reject-both-ids / reject-non-UUID-unitId / reject-unknown-field / reject-empty-name / reject-long-name / reject-from-to-fields).
- **Frontend types** at `apps/web/lib/api/f4/types.ts`: additive `TelemetryLatestValue` + `TelemetryLatestResponse` mirroring the backend response shape (with Decimal serialized as a string per the F4.4F raw-mode posture).
- **Frontend typed endpoint wrapper** at `apps/web/lib/api/f4/endpoints.ts`: `getTelemetryLatest(params, options)` + `GetTelemetryLatestParams`.
- **Frontend barrel** at `apps/web/lib/api/f4/index.ts`: re-exports the new symbols and types.
- **Frontend dual-mode adapter** at `apps/web/lib/api-data/f4/latest.ts`: `adapterGetTelemetryLatest(params, options)` (mock branch resolves from new fixtures; api branch delegates to `getTelemetryLatest` after the UUID guardrail); exports `isUuidShaped(value)` and `assertUuidShaped(unitId, url)` so the api-mode entry rejects simulator catalog strings with a deterministic `RvfApiError(400, ..., 'unitId must be UUID-shaped …')` **before** issuing the HTTP call.
- **Mock fixtures** at `apps/web/lib/api-data/f4/mock-fixtures.ts`: deterministic synthetic latest rows for HP-001 (two rows — `p_inlet` + `q_gas`, aligned to the last point of the corresponding `MOCK_F4_TELEMETRY_TRENDS` synthetic series) and LP-001 (one row — `p_inlet`). Sensor ids reuse the F4.5C `hashSuffix` pattern; `latestTelemetryReadingId` carries a deterministic synthetic id; quality is always `'good'`; source is always `'mock'`.
- **Api-data barrel** at `apps/web/lib/api-data/f4/index.ts`: re-exports `adapterGetTelemetryLatest`, `assertUuidShaped`, `isUuidShaped` (renamed to `isLatestUnitIdUuidShaped` to avoid collision with the F4.5G.2.1 hook's predicate of the same name), and `MOCK_F4_TELEMETRY_LATEST`.
- **Frontend adapter tests** at `apps/web/lib/api-data/f4/latest.test.ts`: 19 new tests covering the UUID predicate / guardrail, mock-mode happy paths (list-by-unit, filter-by-id, filter-by-name), mock-mode unknown-unit / unknown-tag empty-envelope, mock-mode XOR rejection, mock-mode Decimal pass-through, api-mode URL composition for all three call shapes, api-mode UUID guardrail (no fetch issued for non-UUID), api-mode empty envelope, and api-mode 400 surfacing.

## 3. Architecture Decision

- **Source of truth is `live_readings`.** F4.6C.2.1 reads the projection directly — never `telemetry_readings`, never the preserved `live_readings_projection` SQL VIEW, never the F4.6E.1 Socket.IO state, never frontend mock state.
- **Trend endpoint is not the latest-value API.** The plan's hard rule is enforced by separation: `GET /telemetry/trends` keeps its range-scan contract byte-identical; `GET /telemetry/latest` owns the current-value answer.
- **Realtime is delivery, not source of truth** (ADR-008 §3 decision 11). F4.6C.2.1 never consumes Socket.IO state. A future Operations tile binding phase will compose the two: REST hydration on mount + reconnect (this endpoint), realtime tail overlay (F4.5G.2.1's hook).
- **Browser does not evaluate alarms** (ADR-005). The latest-value endpoint surfaces the projection's `quality` field but never compares values against thresholds, and the frontend adapter never derives alarm state.
- **No UI tile migration in this phase.** `<LiveVariableTile>` / `<MultiphaseUnitCard>` continue to render from the F2 simulator path. The new adapter is the seam future tile cutover will read.
- **No backend unit resolver in this phase.** The resolution surface already exists via F4.4D `GET /api/v1/equipment/units`; choosing where the resolver lands (frontend hook, OPERATIONS_JOBS redesign, or backend-fetched jobs) is the tile-cutover phase's call. The `assertUuidShaped` guardrail prevents simulator catalog strings from reaching the backend in the interim.
- **No mapping table baked into the adapter.** Simulator strings → backend UUIDs is *not* synthesized anywhere; the guardrail is honest about the gap (mock mode tolerates simulator strings by returning the empty envelope; api mode refuses them with a deterministic 400).

## 4. Files Changed

| Path | Action | Notes |
|---|---|---|
| `apps/backend/src/telemetry/contracts/latest.ts` | **New.** | Zod schema + response types. |
| `apps/backend/src/telemetry/latest.service.ts` | **New.** | Read-only `LatestService.query(ctx, input)`. |
| `apps/backend/src/telemetry/telemetry.controller.ts` | Modified | `@Get('latest')` method added; constructor injects `LatestService`; imports extended. |
| `apps/backend/src/telemetry/telemetry.module.ts` | Modified | `LatestService` registered in `providers` and `exports`. |
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` | Modified | Test #17 narrowed to write-only isolation invariant with an updated comment naming the F4.6C.2.1 read permission. |
| `apps/backend/src/telemetry/latest.service.spec.ts` | **New.** | 22 mocked-Prisma tests (12 service + 9 schema + 1 isolation). |
| `apps/web/lib/api/f4/types.ts` | Modified | Additive `TelemetryLatestValue` / `TelemetryLatestResponse`. |
| `apps/web/lib/api/f4/endpoints.ts` | Modified | New `getTelemetryLatest` + `GetTelemetryLatestParams`. |
| `apps/web/lib/api/f4/index.ts` | Modified | Re-exports for the new endpoint + types. |
| `apps/web/lib/api-data/f4/latest.ts` | **New.** | Dual-mode adapter + `assertUuidShaped` / `isUuidShaped`. |
| `apps/web/lib/api-data/f4/mock-fixtures.ts` | Modified | `MOCK_F4_TELEMETRY_LATEST` map added; HP-001 (2 rows) + LP-001 (1 row). |
| `apps/web/lib/api-data/f4/index.ts` | Modified | Re-exports for the new adapter, guard, and fixture. |
| `apps/web/lib/api-data/f4/latest.test.ts` | **New.** | 19 vitest cases. |
| `docs/architecture/RVF_Malinois_F4_6C_2_1_Latest_Value_Read_API_Closeout.md` | **New.** | This document. |

No other file modified. Explicitly:

- No `apps/backend/prisma/schema.prisma` change.
- No `apps/backend/prisma/migrations/` change.
- No `apps/backend/prisma/seed.f4.ts` change.
- No file under `apps/backend/src/{tenants,wells,equipment,jobs,tags,health,alarms,realtime}/`.
- No file under `apps/backend/src/telemetry/{ingestion,projection}/` runtime (only the ingestion-spec test #17 narrowing).
- No file under `apps/web/components/` (no UI tile / panel migration).
- No file under `apps/web/lib/hooks/` (the F4.5G.2.1 realtime hook stays untouched).
- No `packages/types/` change.
- No `packages/ui/` change.
- No `docker-compose.yml`, root `package.json`, lockfile, `turbo.json`, `tsconfig*.json`, `.env*`, CI workflow, or `vitest.config.ts` change.
- No new env variable.
- No new dependency.

## 5. API Contract

**Route:** `GET /api/v1/telemetry/latest`.

**Query parameters:**

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `unitId` | UUID | yes | Backend `MeasurementUnit.id`. Non-UUID rejected with 400 via Zod refine. |
| `canonicalTagId` | UUID | optional | XOR with `canonicalTagName`. |
| `canonicalTagName` | string `1..64` | optional | XOR with `canonicalTagId`. |

Omitting both tag identifiers returns every latest value for the unit. No `from` / `to` / `limit` / `quality` / `qualityPolicy` / `source` / `jobId` / `tenantId` parameters are accepted (`.strict()`).

**Validation refines:**

- `unitId` UUID-shape.
- Supplying both `canonicalTagId` and `canonicalTagName` is rejected as ambiguous.
- Unknown query fields are rejected (`.strict()`).
- `canonicalTagName` length 1..64.

**Response shape (200 OK):**

```ts
{
  unitId: string,
  generatedAt: Date,     // ISO-8601 server-generated
  source: 'live_readings',
  values: Array<{
    sensorId: string,
    canonicalTag: {
      id, name, displayName, canonicalUnit, category, precision
    },
    value: string,       // Decimal serialized via Decimal.toJSON
    engineeringUnit: string,
    quality: 'good' | 'uncertain' | 'bad',  // always 'good' per F4.6C.1
    timestamp: Date,
    ingestionTimestamp: Date | null,
    source: string | null,
    latestTelemetryReadingId: string | null,
  }>,
}
```

**No-data behavior:** `200 OK` with `values: []` for:
- known unit with no projection rows yet,
- unknown unit,
- known unit with unknown canonical tag.

Never 404 on these paths (matches the F4.4F empty-array posture).

**Tenant scoping:** derived from server-side `CallerContext`. No `tenantId` query parameter is accepted (`.strict()` rejects it). `SystemContext` performs a cross-tenant read; a future ADR-009 / auth phase will introduce a real authenticated context — the service signature does not need to change at that point.

## 6. Quality / Freshness Semantics

- **Quality.** The projection's `quality` column is always `'good'` by the F4.6C.1 contract. The endpoint surfaces the field for forward compatibility (a future projection lane could relax this) but the value is `'good'` in every row F4.6C.1 wrote. The service defensively narrows an unexpected stored string back to `'good'` rather than leaking it.
- **Timestamp / watermark.** `timestamp` is the canonical reading timestamp — the same value `telemetry_readings.timestamp` carries. `ingestionTimestamp` is when the backend accepted the reading. The watermark guarantee from F4.6C.1 (strict `new.timestamp > stored.timestamp`) means callers receive only the freshest accepted `good` value per `(unitId, sensorId, canonicalTagId)` slot.
- **No staleness threshold invented.** F4.6C.2.1 does not compute `isStale`. The frontend already has a per-tag stale detector in `apps/web/lib/quality/stale.ts` parametrized by the commissioning snapshot — the endpoint surfaces the raw timestamps and lets the frontend decide. A future phase can additively expose `isStale` per row if a global default threshold is wanted.
- **No alarm evaluation.** ADR-005 invariant preserved. The endpoint never compares values against thresholds.

## 7. Frontend Adapter Contract

- **Typed endpoint wrapper.** `getTelemetryLatest(params, options): Promise<TelemetryLatestResponse>` in `apps/web/lib/api/f4/endpoints.ts`. Composes the URL `/telemetry/latest?unitId=…[&canonicalTagId=… | &canonicalTagName=…]`.
- **Dual-mode adapter.** `adapterGetTelemetryLatest(params, options)` in `apps/web/lib/api-data/f4/latest.ts`. `isApiSource()` switches between the mock branch and the live branch.
- **Mock branch** resolves from `MOCK_F4_TELEMETRY_LATEST` keyed by `unitId`; returns the empty envelope for unknown units and unknown tags; mirrors the backend XOR refine by rejecting both tag identifiers supplied together.
- **API branch** runs `assertUuidShaped(params.unitId, '/telemetry/latest')` first; non-UUID raises `RvfApiError(400, …, 'unitId must be UUID-shaped …')` **before** any fetch is issued. UUID-shaped ids fall through to `getTelemetryLatest(...)`.
- **No UI migration.** The adapter exists and is testable; binding a tile to it is a separate phase. The `<LiveVariableTile>` / `<MultiphaseUnitCard>` data path stays on the F2 simulator path in this phase.

## 8. Database / Migration Impact

**None.**

- No `apps/backend/prisma/schema.prisma` change.
- No new migration.
- No `apps/backend/prisma/seed.f4.ts` change.
- No new index — the existing `live_readings_tenant_unit_idx` / `live_readings_unit_idx` access paths cover the list-by-unit query.
- The reserved `status` column on `live_readings` is **not** exposed on the wire (per F4.6C.2-0 §9.2). Forward-compat seam: a future phase can additively gain the field when F4.6C.1's contract relaxes.
- No `packages/types/` change — F4.6C.2.1 keeps the response shape on the backend (TypeScript in `apps/backend/`) + frontend (TypeScript in `apps/web/`). A shared `@rvf/types` re-export is not introduced unless a real cross-app consumer appears.

## 9. Tests / Validation

### 9.1 Tests added

| File | Added | Notes |
|---|---|---|
| `apps/backend/src/telemetry/latest.service.spec.ts` | +22 | 12 service tests + 9 Zod-schema tests + 1 isolation-from-`telemetry_readings` test. |
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` | 0 (1 modified) | Test #17 narrowed to write-only invariant; assertions preserved minus the read assertion. |
| `apps/web/lib/api-data/f4/latest.test.ts` | +19 | UUID predicate (3) + guard (2) + mock-mode (8) + api-mode (6). |

### 9.2 Test counts

| Metric | Before F4.6C.2.1 (`5d2d3b5`) | After F4.6C.2.1 |
|---|---|---|
| Backend tests | 195 / 195 | **217 / 217** (+22) |
| Frontend tests | 375 / 375 | **394 / 394** (+19) |

### 9.3 Validation commands run

- `pnpm --filter @rvf/backend run lint` — clean (0 errors, 0 warnings).
- `pnpm --filter @rvf/backend run typecheck` — clean.
- `pnpm --filter @rvf/backend run test` — 16 files / **217 tests** passing.
- `pnpm --filter @rvf/backend run build` — `nest build` clean.
- `pnpm --filter @rvf/web run lint` — clean (0 errors, 0 warnings).
- `pnpm --filter @rvf/web run typecheck` — clean.
- `pnpm --filter @rvf/web run test` — 41 files / **394 tests** passing.
- `pnpm --filter @rvf/web run build` — Next.js prod build clean; route footprint unchanged.

## 10. Known Limitations / Deferred Work

- **Operations tile UI binding deferred.** `<LiveVariableTile>` / `<MultiphaseUnitCard>` still render from the F2 simulator path. The new adapter is the seam; tile cutover is a separate small frontend phase (likely "Operations tile latest-value cutover").
- **Backend unit resolver / UUID mapping deferred.** F4.5G.2-0 §9 gap (simulator catalog strings ↔ backend UUIDs) is **defended** by `assertUuidShaped` but not **closed** by F4.6C.2.1. Resolution lives in the tile-cutover phase: either a small frontend resolver hook using F4.4D `GET /api/v1/equipment/units`, an OPERATIONS_JOBS redesign carrying backend UUIDs, or a backend-fetched job set in api mode.
- **Latest-value batch / multi-unit endpoint deferred.** F4.6C.2.1 stays single-unit per request. UI-side fan-out (TanStack Query parallel) is the answer for a tile grid against multiple units; a real batch endpoint can be candidate **F4.6C.3** if a screen consumer demands it.
- **Alarm read API deferred** to candidate F4.6D.2.
- **Browser-side `<LiveActiveAlarmsPanel>` evaluation** still active in F2 mode; awaits F4.6D.2 + a frontend panel-migration phase.
- **Alarm chart annotations deferred** to candidate F4.5G.3.
- **Operations chart realtime tail deferred** to candidate F4.5G.2.2.
- **Wells / Equipment / Catalog / Tags / Settings / Reports screen migrations deferred** to candidate F4.5H.
- **Auth / rate limiting deferred.** Inherits project-wide no-auth posture; `SystemContext` performs cross-tenant reads until ADR-009 / auth lands.
- **Mocked-Prisma posture** inherited from every F4.6 sub-phase. The `live_readings_tenant_unit_idx` / `live_readings_unit_idx` access paths are not exercised against a real Postgres yet; a live-DB integration suite remains a candidate cross-phase deliverable (master roadmap §10).

## 11. Acceptance Criteria

F4.6C.2-0 §17 criteria — confirmed:

- [x] `GET /api/v1/telemetry/latest` exists on the existing `TelemetryController`. No new controller class.
- [x] Zod schema enforces UUID on `unitId`, length 1..64 on `canonicalTagName`, XOR between the two tag identifiers, and `.strict()` rejection of unknown fields.
- [x] Backend service reads `prisma.liveReading.findMany` with `tenantId` filter when `ctx.tenantId` is set. Reads `live_readings` only.
- [x] Response envelope shape: `{ unitId, generatedAt, source: 'live_readings', values: LatestValueRow[] }`. `tenantId` / `id` / `createdAt` / `updatedAt` / `status` are **not** on the wire.
- [x] `value` is Decimal serialized to string. `timestamp` / `ingestionTimestamp` / `generatedAt` are ISO-8601 (`Date` on the backend; ISO string after JSON round-trip).
- [x] Empty response (`values: []`) returned for known unit with no rows, unknown unit, and known unit with unknown canonical tag. Never 404 on these paths.
- [x] Invalid UUID `unitId` → 400; both `canonicalTagId` and `canonicalTagName` together → 400; unknown fields → 400.
- [x] No `quality` / `qualityPolicy` / `source` / `jobId` / `from` / `to` / `limit` / `tenantId` query parameters introduced.
- [x] No schema / migration / seed change.
- [x] `TelemetryModule` registers the new service additively; `TelemetryController` constructor updated.
- [x] Ingestion-spec isolation invariant narrowed to forbid `liveReading.create / update / updateMany / upsert / delete` outside the projection service; read access permitted.
- [x] Frontend typed endpoint wrapper + types added; dual-mode adapter added; mock fixtures added.
- [x] `assertUuidShaped(unitId)` guard at the api-mode adapter entry; non-UUID raises `RvfApiError(400, ...)` before any fetch. Mock branch tolerates simulator strings.
- [x] No UI screen migration. No backend unit resolver. No `packages/types/` change. No new env variable. No new dependency.
- [x] Backend tests **+22 new** (above the 10–15 estimate). Frontend tests **+19 new** (above the 6–10 estimate). Existing 195 backend / 375 frontend stay green.
- [x] DX-3 §"Runtime phases" validation passes end to end for both `@rvf/backend` and `@rvf/web`: `lint --max-warnings 0` / `typecheck` / `build` / `test` all green.
- [x] F4.6C.2.1 closeout report exists at this path, follows the established closeout structure, reports the final test counts.
- [ ] Master roadmap §3 / §7 refresh — recommended as a separate small hygiene commit per the established pattern (`121803d`, `cafccb6`, `1d0f659`, `2aa6140`, `5d2d3b5`); see §12 below.

## 12. Recommended Next Step

Land the master roadmap hygiene update as a separate small commit (matches the precedent of every prior phase closeout): mark F4.6C.2.1 as **Closed** at the implementation commit, advance the "next phase" pointer, and identify the next deliverable from the candidates locked by F4.6C.2-0 §18:

- **Candidate "Operations tile latest-value cutover"** (small follow-up frontend phase). The natural next step — binds `<LiveVariableTile>` / `<MultiphaseUnitCard>` to `adapterGetTelemetryLatest` as the primary source on mount + reconnect; overlays F4.5G.2.1's realtime hook as the tail update; introduces a small unit-resolver helper (catalog code → backend UUID via the F4.4D units list) to close the OPERATIONS_JOBS UUID gap.
- **Candidate F4.5G.3 — Alarm chart annotations.** Stays in the Operations track; consumes the `alarmEventsSeen` seam F4.5G.2.1 already exposed.
- **Candidate F4.6D.2 — Alarm Events Read API.** Cleans up `<LiveActiveAlarmsPanel>`'s browser-side `evaluateReading` path.
- **Candidate F4.5G.2.2 — Operations chart realtime tail.** Append `live_reading.updated` points to the rendered `<TrendChart>` series.
- **Candidate F4.5H — Non-telemetry screen adapter wiring.** Per-screen migrations for Wells / Equipment / Catalog / Tags / Settings / Reports.

Recommendation: **the Operations tile latest-value cutover** is the natural next step because it converts F4.6C.2.1's adapter (currently dormant, no UI binding) into a real consumer — and it closes the F4.5G.2-0 §9 UUID gap by introducing the small unit-resolver that has been deferred since F4.5G.2.1 closeout §10.

---

*F4.6C.2.1 closeout, authored at HEAD `5d2d3b5`. Implementation lives at the next commit pending review. Update on phase close (`Current` → `Closed` with commit hash) once committed.*
