# RVF Malinois — F4.6C.2-0 Latest-value Read API Plan

> Phase **F4.6C.2-0 — Latest-value Read API Plan**. Plan-first per the codified project pattern (F4.2A → F4.2B, F4.6A.0 → F4.6A.1, F4.6B-0 → F4.6B.1, F4.6C-0 → F4.6C.1, F4.6D-0 → F4.6D.1, F4.6E-0 → F4.6E.1, F4.6F-0 → F4.6F.1, F4.5G-0 → F4.5G.1, F4.5G.2-0 → F4.5G.2.1).
> Documentation-only artifact. No backend, frontend, schema, migration, or runtime code is modified by F4.6C.2-0. Implementation lands in **F4.6C.2.1**.
> Last known head at authoring time: commit `2aa6140` (Refresh master roadmap after F4.5G.2.1).
>
> Upstream references:
> - Master Roadmap (most recent refresh): `docs/architecture/RVF_Malinois_Master_Roadmap.md` (commit `2aa6140`).
> - F4.6C.1 closeout (the projection this read API targets): `docs/architecture/RVF_Malinois_F4_6C_1_Live_Readings_Projection_Updater_Closeout_Report_v1.0.md` (commit `49a8349`).
> - F4.6A.1 closeout (the `live_readings` schema): `docs/architecture/RVF_Malinois_F4_6A_1_Schema_Hardening_Migration_Closeout_Report_v1.0.md` (commit `6be7842`).
> - F4.6F.1 closeout (the trend API this phase is *not* extending): `docs/architecture/RVF_Malinois_F4_6F_1_Historical_Trend_API_Closeout.md` (commit `946a023`).
> - F4.6E.1 closeout (the realtime push this phase complements but does not replace): `docs/architecture/RVF_Malinois_F4_6E_1_WebSocket_SSE_Fan_Out_Closeout.md` (commit `51dc626`).
> - F4.5G.1 closeout (Operations chart consumer of F4.6F.1; preserved): `docs/architecture/RVF_Malinois_F4_5G_1_Operations_Chart_Adapter_Expanded_Trend_View_Closeout.md` (commit `916d067`).
> - F4.5G.2.1 closeout (Operations realtime status / hook; preserved): `docs/architecture/RVF_Malinois_F4_5G_2_1_Operations_Realtime_Tile_Status_Wiring_Closeout.md` (commit `2457c4d`).
> - DX-3 (Definition of Done): `docs/operations/RVF_Malinois_Definition_of_Done.md` (commit `65cb736`).
> - ADR-008 (Telemetry persistence; status **Proposed**) — `live_readings` is a derived projection rebuildable from `telemetry_readings`.

## 1. Purpose

F4.6C.2-0 is the **plan-first** phase for a canonical *current-value* read API over the `live_readings` projection populated by F4.6C.1. The trend API (F4.6F.1) handles historical range scans; the realtime fan-out (F4.6E.1) handles tail / notification; neither is the right shape for a tile asking "what is the current value of this unit's inlet pressure right now?" F4.5G.1 wired the Operations chart to F4.6F.1, F4.5G.2.1 wired the Operations realtime status row to F4.6E.1, but Operations tiles still render from the F2 simulator path because no canonical pull surface for current values exists. F4.6C.2 fills that gap.

This phase **locks the decisions** that F4.6C.2.1 (implementation) must respect:

- The route, query-parameter shape, and Zod refines.
- The response payload shape and quality / freshness fields.
- Tenant-scoping posture (re-using the F4.4F / F4.6F.1 `CallerContext` seam — no new auth surface).
- The frontend adapter contract and its mock / api dual-mode behavior.
- The UUID / unit-resolver guardrail inherited from F4.5G.2-0 §9 — F4.6C.2.1 must never silently coerce simulator catalog strings into backend UUIDs.
- The test plan and acceptance criteria for F4.6C.2.1.

What this phase does **not** do:

- Does not implement any backend / frontend / schema / migration / runtime code.
- Does not modify `telemetry_readings`, `live_readings`, the ingestion boundary, the projection service, the alarm evaluator, the realtime fan-out, the trend API, or any Operations UI surface.
- Does not introduce a new transport. The latest-value endpoint is a standard REST GET — no WebSocket extension, no SSE, no GraphQL, no batch endpoint.
- Does not introduce external integrations. ThingsBoard / Node-RED / OPC-UA / MQTT / Modbus / PLC / historian / edge-gateway bridges may eventually feed `live_readings` indirectly through the ingestion boundary, but none owns canonical state.

## 2. Current Repository State

Drawn from `git log`, the master roadmap (`2aa6140`), and direct inspection of `apps/backend/`.

| Phase | Status | Commit |
|---|---|---|
| Backend telemetry-persistence arc (F4.6B.1 → F4.6F.1) | Closed end-to-end | `1495457` / `49a8349` / `d35a2b8` / `51dc626` / `946a023` |
| `live_readings` schema (F4.6A.1 migration) | Closed | `6be7842` |
| F4.6C.1 projection updater (writes `live_readings` transactionally) | Closed | `49a8349` |
| F4.5G.1 Operations chart consumes F4.6F.1 trends | Closed | `916d067` |
| F4.5G.2-0 / F4.5G.2.1 Operations realtime wiring | Closed | `583da2b` / `2457c4d` |
| Master roadmap refresh after F4.5G.2.1 | Closed | `2aa6140` |
| **F4.6C.2-0 — Latest-value Read API Plan** (this document) | **Current** | *(pending)* |
| F4.6C.2.1 — Latest-value Read API Implementation | Deferred (next implementation phase) | — |

### 2.1 What exists for canonical current values today

- **`live_readings` table** (F4.6A.1, `6be7842`) — populated by F4.6C.1 inside the same `prisma.$transaction` as the canonical `telemetry_readings` insert. Schema (per `apps/backend/prisma/schema.prisma` lines 678–707):

  ```
  id                       UUID  PK  (default gen_random_uuid)
  tenantId                 UUID  FK Tenant
  unitId                   UUID  FK MeasurementUnit
  sensorId                 UUID  FK Sensor
  canonicalTagId           UUID  FK CanonicalTag
  latestTelemetryReadingId UUID? FK TelemetryReading (nullable; SET NULL on delete)
  value                    Decimal
  engineeringUnit          String
  quality                  String         // always 'good' by F4.6C.1 contract
  status                   String?        // reserved; unused by F4.6C.1
  timestamp                Timestamptz    // the canonical reading timestamp
  source                   String?        // e.g. 'mqtt', 'manual', 'mock'
  ingestionTimestamp       Timestamptz?   // when the backend accepted the reading
  createdAt                Timestamptz    (default now())
  updatedAt                Timestamptz    (default now(), @updatedAt)

  UNIQUE (unitId, sensorId, canonicalTagId)  via live_readings_unit_sensor_tag_uk
  INDEX  (tenantId, unitId)                  via live_readings_tenant_unit_idx
  INDEX  (unitId)                            via live_readings_unit_idx
  INDEX  (sensorId)                          via live_readings_sensor_idx
  INDEX  (timestamp DESC)                    via live_readings_time_idx
  ```

  Reads by `(unitId)` or `(tenantId, unitId)` are indexed; reads by `(unitId, canonicalTagId)` use the UNIQUE composite index (covers the `(unitId, sensorId, canonicalTagId)` shape on the same column ordering for any predicate that includes `unitId` as the leading column).

- **F4.6C.1 quality / watermark contract:**
  - Only `quality === 'good'` rows update the projection; non-`good` samples are quarantined or skipped.
  - The projection's `quality` column is always `'good'` by construction. A future phase may relax this (e.g., a `quality === 'uncertain'` projection lane) but F4.6C.2.1 reads what F4.6C.1 wrote — no behavior change.
  - Strict `new.timestamp > stored.timestamp` watermark — stale arrivals never overwrite a newer projection row (they still persist canonically in `telemetry_readings`).
  - Race-safe upsert via `updateMany` → `findUnique` → `create` with `P2002` retry, all inside the ingestion transaction.

- **No backend read consumer of `live_readings` today.** `grep liveReading\\.` finds writes only (the projection service) plus isolation-invariant references in the ingestion spec. **`GET /api/v1/telemetry/latest` does not exist.**

- **No `live_readings_projection` API exposure.** The preserved F4.2B SQL VIEW `live_readings_projection` exists for non-destructive coexistence but is not modeled in Prisma and is not read by any controller / service. F4.6C.2.1 reads the `live_readings` table directly via the Prisma model, not the VIEW.

### 2.2 What F4.6F.1 / F4.6E.1 / F4.5G.1 / F4.5G.2.1 give us

- **F4.6F.1 trends** (`946a023`) — historical range scan over `telemetry_readings` with raw and bucketed modes. Range-scan-shaped; not a current-value API.
- **F4.6E.1 realtime fan-out** (`51dc626`) — Socket.IO per-tenant rooms emitting `telemetry.reading.accepted` / `live_reading.updated` / `alarm.event.created` after the canonical transaction commits. Delivery, not durable hydration; no replay buffer, no last-event-id.
- **F4.5G.1 Operations chart** (`916d067`) — consumes F4.6F.1 trend reads via `useOperationsTrendSeries`. Cache key `['f4-trends', …]`. Not the right shape for a tile.
- **F4.5G.2.1 Operations realtime status** (`2457c4d`) — `useOperationsRealtimeF4` exposes a per-slot view-model from `live_reading.updated` envelopes for UUID-shaped slots. **No tile UI currently binds to it** — F4.5G.2.1 is the *seam*, not the consumer. Hook returns `{ slots, getSlotValue, source, connection, ... }` so an Operations tile can opportunistically read tail values **once an initial hydration source exists**. That initial hydration source is F4.6C.2.

### 2.3 Known UUID / mock-ID gap (carried forward from F4.5G.2-0 §9)

`OPERATIONS_JOBS[i].job.unitId` resolves to simulator catalog strings (`EMMAD-01` / `EMMAD-02` / `PSK-03`) — not backend `MeasurementUnit.id` UUIDs. F4.5G.2.1 added a strict `isUuidShaped` predicate that prevents these from reaching any backend-bound emit. F4.6C.2.1 inherits this guardrail: **no backend REST call must embed a non-UUID `unitId`** in api mode.

The backend already exposes the resolution surface via `GET /api/v1/equipment/units` (F4.4D), which returns rows with `id` (UUID) and `code` (HP-001 / LP-001). A frontend unit-resolver helper that maps simulator catalog codes → backend UUIDs is **possible today without any new backend endpoint**, but its design touches the Operations job-selection model (which is broader than F4.6C.2 — it concerns *which* jobs Operations renders, not just *how* to resolve their ids). See §12 for the recommendation.

### 2.4 Latest roadmap anchor

Master roadmap most recently refreshed at `2aa6140` (Refresh master roadmap after F4.5G.2.1). §3 names F4.6C.2-0 as the current phase; §7 names F4.6C.2.1 as the next implementation step.

## 3. Architectural Position

Desired data flow once F4.6C.2.1 ships:

```
┌──────────────────── Ingestion (existing, unchanged) ─────────────────────┐
│                                                                          │
│  POST /api/v1/telemetry/ingest  →  telemetry_readings insert             │
│                                  →  live_readings projection upsert      │
│                                  →  alarm evaluation                     │
│                                  →  (commit)                             │
│                                  →  Socket.IO fan-out (F4.6E.1)          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────── Reads (today) ───────────────────────────────────────┐
│                                                                          │
│  GET /api/v1/telemetry/trends  →  telemetry_readings (range / bucketed)  │
│  Socket.IO 'live_reading.updated'  →  tail update (not durable history)  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────── Reads (F4.6C.2.1 adds) ──────────────────────────────┐
│                                                                          │
│  GET /api/v1/telemetry/latest  →  live_readings (current value per slot) │
│                                                                          │
│  Consumer pattern (future Operations tile phase):                        │
│    On mount  →  GET /api/v1/telemetry/latest (initial hydration)         │
│    Realtime  →  use F4.5G.2.1 hook's slot view-model (tail update)       │
│    Reconnect →  refetch GET /api/v1/telemetry/latest (canonical resync)  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

Three principles govern this placement:

1. **Each backend surface has one job.** Trends = history; realtime = tail / notification; **latest = current values from the projection**. F4.6C.2.1 does not duplicate any of the others.
2. **The latest-value API is a pull surface.** It is the canonical answer to "what is the current value?" Tile hydration on mount, resync on reconnect, and stateless refresh all go through it. Realtime updates (F4.6E.1) complement but do not replace it — they keep the tile fresh between resyncs without becoming source-of-truth (per ADR-008 §3 decision 11 and the F4.5G.2-0 §3 contract).
3. **The latest-value API reads `live_readings` only.** Never `telemetry_readings` (that's the trend job), never the projection VIEW (it's not modeled), never the Socket.IO in-memory state (not durable), never frontend mock state (not canonical). Browser never evaluates alarms; the latest-value API never evaluates anything either — it reads what F4.6C.1 wrote.

## 4. Ownership and Source of Truth

| Concern | Owner |
|---|---|
| Query semantics (`unitId` required; `canonicalTagId` / `canonicalTagName` XOR; etc.) | RVF backend — F4.6C.2.1 Zod contract |
| Response shape (envelope, value serialization, quality / timestamp fields) | RVF backend — F4.6C.2.1 service / contract |
| Tenant / unit scoping | RVF backend — inherited `CallerContext` posture (matches F4.4 / F4.6F.1) |
| Freshness metadata | RVF backend — derived from `live_readings.timestamp` and `live_readings.ingestionTimestamp` (no new column) |
| Quality semantics | RVF backend — `live_readings.quality` is always `'good'` per F4.6C.1; exposed on the wire for forward compatibility |
| Frontend adapter contract (mock / api dual-mode parity) | RVF frontend — F4.6C.2.1 wraps the new endpoint in `apps/web/lib/api/f4/` + `apps/web/lib/api-data/f4/` mirroring `getTelemetryTrends` / `adapterGetTelemetryTrends` |
| Authorization (currently no auth) | Project-wide — F4.6C.2.1 inherits the existing no-auth posture; not in scope to introduce |

**Explicitly:** ThingsBoard / Node-RED / OPC-UA / MQTT / Modbus / PLC / historian / edge-gateway bridges may eventually *feed* `live_readings` (indirectly, through the ingestion boundary), but **none owns canonical RVF latest-value state**. F4.6C.2 reads from `live_readings`, the RVF-owned derived projection.

## 5. Existing `live_readings` Surface Inventory

Direct repository evidence as of `2aa6140`. No surface is invented here.

### 5.1 Schema (Prisma model `LiveReading`)

`apps/backend/prisma/schema.prisma` lines 678–707 (table `live_readings`):

| Field | DB type | Nullable | Notes |
|---|---|---|---|
| `id` | UUID PK | No | `gen_random_uuid()` default |
| `tenantId` | UUID FK Tenant | No | onDelete: Restrict |
| `unitId` | UUID FK MeasurementUnit | No | onDelete: Restrict |
| `sensorId` | UUID FK Sensor | No | onDelete: Restrict |
| `canonicalTagId` | UUID FK CanonicalTag | No | onDelete: Restrict |
| `latestTelemetryReadingId` | UUID? FK TelemetryReading | Yes | onDelete: SetNull |
| `value` | Decimal | No | JSON-serializes to string via `Decimal.toJSON` |
| `engineeringUnit` | String | No | The unit the device sent |
| `quality` | String | No | Always `'good'` per F4.6C.1 |
| `status` | String? | Yes | **Reserved.** Not populated by F4.6C.1. F4.6C.2.1 does not consume. |
| `timestamp` | Timestamptz | No | Reading timestamp (the canonical) |
| `source` | String? | Yes | E.g. `'mqtt'`, `'manual'`, `'mock'` |
| `ingestionTimestamp` | Timestamptz? | Yes | When backend accepted the reading |
| `createdAt` | Timestamptz | No | Row creation time (default now) |
| `updatedAt` | Timestamptz | No | `@updatedAt` |

### 5.2 Uniqueness / indexing

- `UNIQUE (unitId, sensorId, canonicalTagId)` → `live_readings_unit_sensor_tag_uk` — used by the projection upsert and by the read path for `(unitId, canonicalTagId)` queries (the leading column on the index is `unitId`).
- `INDEX (tenantId, unitId)` → `live_readings_tenant_unit_idx` — primary access path for the latest-value read when tenant scoping is active.
- `INDEX (unitId)` → `live_readings_unit_idx` — alternative access path when reading without tenant scoping (e.g., `SystemContext`).
- `INDEX (sensorId)` → `live_readings_sensor_idx` — not used by F4.6C.2.1 (queries are unit-scoped).
- `INDEX (timestamp DESC)` → `live_readings_time_idx` — not used by F4.6C.2.1 (the latest API is unit-scoped, not time-scoped; the per-row timestamp is read from the column, not the index).

**No new index is required for F4.6C.2.1.** The list-by-unit query (most common shape) hits `live_readings_tenant_unit_idx` or `live_readings_unit_idx`.

### 5.3 Quality / timestamp / watermark semantics inherited from F4.6C.1

- `quality === 'good'` always (per F4.6C.1 §2). F4.6C.2.1 surfaces the column on the wire for forward compatibility (a future projection lane could relax this), but the value is `'good'` in every row written by F4.6C.1.
- `timestamp` is the canonical reading timestamp — the same value `telemetry_readings.timestamp` carries.
- `ingestionTimestamp` is when the backend accepted the reading (later than or equal to `timestamp`).
- Watermark guarantee: `timestamp` is monotonically non-decreasing per `(unitId, sensorId, canonicalTagId)` slot — late arrivals never overwrite a newer projection row. F4.6C.2.1 callers therefore do not need to re-sort or compare across responses; the row in `live_readings` for a slot **is** the freshest accepted `good` value.
- **Stale / bad rows do not exist in `live_readings` by design.** F4.6C.1's quality gate prevents non-`good` samples from ever writing the projection. F4.6C.2.1 callers therefore receive only `good` values; the API does not need an `includeBad` toggle.

### 5.4 Existing tests covering `live_readings`

- `apps/backend/src/telemetry/projection/live-readings-projection.service.spec.ts` — 11 unit tests covering the projection upsert (`created` / `updated` / `skipped_stale` / `skipped_equal_timestamp` / `skipped_quality` / `P2002` retry path).
- `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` — integration tests asserting the projection upsert lands inside the same transaction as the canonical insert, and the isolation invariant that **no other backend code calls `prisma.liveReading.*` directly**.

F4.6C.2.1 will be the second backend module authorized to access the table — **read-only**. The ingestion-spec isolation invariant must be tightened or scoped to write operations only when F4.6C.2.1 lands (see §15.6).

## 6. Existing API Surface Inventory

Direct repository evidence as of `2aa6140`.

### 6.1 Telemetry module today

- `apps/backend/src/telemetry/telemetry.module.ts` — wires `TelemetryController` + `TrendsService` + `CanonicalTagResolver` + `UnitConverter`. F4.6C.2.1 extends this module additively with a new service / controller method.
- `apps/backend/src/telemetry/telemetry.controller.ts` — single controller at base path `/telemetry`. One route today: `GET /trends`. **No `GET /latest` route exists.**
- `apps/backend/src/telemetry/trends.service.ts` — read-only range scan over `telemetry_readings`. Uses `CallerContext` for tenant scoping; uses `CanonicalTagResolver` to translate `canonicalTagId` / `canonicalTagName` into a tag summary.
- `apps/backend/src/telemetry/contracts/trends.ts` — Zod schema + types + enum tuples. Quality / source enums mirror the CHECK constraints in the F4.2B baseline migration.
- `apps/backend/src/telemetry/canonical-tag-resolver.ts` — small service that resolves `(canonicalTagId | canonicalTagName)` → tag summary. **F4.6C.2.1 reuses this verbatim** for the same XOR pattern.
- `apps/backend/src/telemetry/projection/live-readings-projection.service.ts` — F4.6C.1 writer. F4.6C.2.1 does not modify it.

### 6.2 Patterns to mirror

- **One controller method per route.** F4.6C.2.1 adds `@Get('latest')` alongside the existing `@Get('trends')` in the same `TelemetryController`. A separate controller is not required (the base path `/telemetry` already groups both reads).
- **Zod-validated query body via `ZodValidationPipe`.** F4.6C.2.1's Zod schema lives in a new `apps/backend/src/telemetry/contracts/latest.ts` mirroring the `contracts/trends.ts` structure.
- **`CallerContext` first-arg on the service method.** Tenant scoping is opt-in via `ctx.tenantId`; `SystemContext` reads cross-tenant (matches F4.4F / F4.6F.1).
- **`PrismaService` direct access** (`this.prisma.liveReading.findMany / findUnique`). No new `$queryRaw`; no `date_bin`; no SQL composition. The reads are straight Prisma.
- **Swagger decorators.** `@ApiTags('telemetry')` is already on the controller; F4.6C.2.1 adds `@ApiOperation` + `@ApiQuery` per parameter.
- **Test posture.** Mocked-Prisma (matches `trends.service.spec.ts`). Spec file at `apps/backend/src/telemetry/latest.service.spec.ts` mirroring the trends spec layout.

### 6.3 Frontend adapter pattern today

- `apps/web/lib/api/f4/endpoints.ts` — typed endpoint wrappers (no caching / retry / hydration; React Query composes on top).
- `apps/web/lib/api-data/f4/telemetry.ts` — dual-mode adapter switched by `isApiSource()`; mock branch resolves from `mock-fixtures.ts`, api branch delegates to the typed endpoint.
- `apps/web/lib/api/f4/types.ts` — frontend-typed shapes (independent of Prisma).
- `apps/web/lib/api/f4/index.ts` — barrel re-exporting types + helpers.

F4.6C.2.1 adds:
- A new typed endpoint wrapper `getTelemetryLatest` in `endpoints.ts`.
- New types in `types.ts` (mirror the backend response shape).
- A new dual-mode adapter `adapterGetTelemetryLatest` in `telemetry.ts` extending the existing F4.5E surface (or a sibling file if cleaner).
- Mock fixtures (a few deterministic `live_readings` rows under HP-001, paralleling the existing trend fixture structure).

### 6.4 Mocked-Prisma test posture

Every F4.6 sub-phase uses mocked Prisma (per the master roadmap §10 risk row "Mocked-Prisma test posture leaves real-DB integration semantics unverified"). F4.6C.2.1 inherits this posture — the partial index access paths, the watermark contract, and the cross-tenant filter behavior are exercised against mocks. A live-DB integration suite remains a candidate cross-phase deliverable.

## 7. Proposed F4.6C.2.1 Implementation Boundary

F4.6C.2.1 ships **backend + frontend adapter only**. Operations tile UI binding lands in a separate frontend phase.

### 7.1 In-scope for F4.6C.2.1

- **New backend service** `apps/backend/src/telemetry/latest.service.ts`. Read-only against `prisma.liveReading`. Accepts `CallerContext` first; honors `ctx.tenantId` when set.
- **New backend Zod contract** `apps/backend/src/telemetry/contracts/latest.ts` with the schema + response types defined in §8 / §9.
- **New controller method** `@Get('latest')` on the existing `TelemetryController` (no new controller class). Swagger decorators inline.
- **Updated `TelemetryModule`** to register the new service. No other provider changes.
- **Backend tests** in a new `apps/backend/src/telemetry/latest.service.spec.ts` (mocked-Prisma posture, mirroring `trends.service.spec.ts`).
- **Controller-level Zod-validation tests** colocated with the service spec (mirroring the F4.6F.1 pattern where validation tests live alongside the service spec).
- **Tighten the ingestion-spec isolation invariant**: today it asserts ingestion does not call `prisma.liveReading.*` *at all*. With F4.6C.2.1, the projection service remains the only writer; the latest-value service is added as the second authorized accessor (read-only). The assertion narrows to "no writes outside the projection service" — see §15.6.
- **New frontend typed endpoint wrapper** `getTelemetryLatest` in `apps/web/lib/api/f4/endpoints.ts`.
- **New frontend types** in `apps/web/lib/api/f4/types.ts` mirroring the backend response shape.
- **New frontend dual-mode adapter** `adapterGetTelemetryLatest` (location: extend `telemetry.ts` or add a sibling `latest.ts` — implementation decides based on file size).
- **Mock fixtures** for the new adapter — deterministic synthetic latest-value rows under HP-001 / LP-001 paralleling the existing `MOCK_F4_TELEMETRY_TRENDS` pattern.
- **Frontend adapter tests** at `apps/web/lib/api-data/f4/latest.test.ts` (or extension of `telemetry.test.ts`) covering mock + api mode.
- **F4.6C.2.1 closeout** at `docs/architecture/RVF_Malinois_F4_6C_2_1_Latest_Value_Read_API_Closeout.md`.

### 7.2 Out-of-scope for F4.6C.2.1

- **No Operations tile UI binding.** `<LiveVariableTile>` / `<MultiphaseUnitCard>` continue to render from the F2 simulator path. A future small frontend phase (candidate F4.5G.2.3 or "Operations tile latest-value binding") owns the tile cutover.
- **No backend unit resolver.** The mapping from simulator catalog code → backend UUID is a frontend concern; the backend already exposes the resolution surface via `GET /api/v1/equipment/units`. See §12 for the recommendation.
- **No new realtime emit kind.** F4.6E.1's `live_reading.updated` envelope already carries everything a tile needs for tail updates; F4.6C.2.1 does not add an `alarm.event.latest_value` or any new emit.
- **No schema / migration / seed change.** The `live_readings` table exists since F4.6A.1 (`6be7842`); `status` column is reserved but not populated; no new index is required.
- **No alarm-related work.** Alarm read API is candidate F4.6D.2; alarm chart annotations are candidate F4.5G.3; alarm lifecycle UI is candidate F4.6D.3.
- **No multi-unit / multi-tenant batch endpoint.** A single `unitId` is required per request. Multi-unit requires a UI-side fan-out (TanStack Query parallel fetches); a backend batch endpoint can be a small follow-up (candidate F4.6C.3) if a screen consumer needs it.
- **No staleness analytics.** F4.6C.2.1 exposes `timestamp` and `ingestionTimestamp` honestly; computing "this value is stale" against a per-tag threshold is a future concern (the frontend already has stale detectors per `lib/quality/stale.ts`).
- **No auth / rate limiting.** Inherits project-wide no-auth posture.

### 7.3 What F4.6C.2.1 explicitly does **not** touch

- `apps/backend/prisma/schema.prisma` — no change.
- `apps/backend/prisma/migrations/` — no change.
- `apps/backend/prisma/seed.f4.ts` — no change.
- `apps/backend/src/telemetry/ingestion/` — no change (the ingestion-spec isolation invariant is tightened, not the runtime).
- `apps/backend/src/telemetry/projection/` — no change.
- `apps/backend/src/telemetry/trends.service.ts` / `contracts/trends.ts` — no change.
- `apps/backend/src/alarms/` — no change.
- `apps/backend/src/realtime/` — no change.
- `apps/web/components/operations/` — no UI change in F4.6C.2.1 (tile cutover is a separate phase).
- `apps/web/lib/realtime/` — no change.
- `apps/web/lib/hooks/useOperationsRealtimeF4.ts` — no change (F4.5G.2.1's slot view-model already exposes a `getSlotValue` seam; the latest-value REST data does not flow through this hook).
- `apps/web/lib/hooks/useOperationsTrendSeries.ts` — no change.
- `packages/types/` — no change. F4.6C.2.1 keeps the response shape on the backend (TypeScript types in `apps/backend/`) + frontend (types in `apps/web/lib/api/f4/`) — a shared `@rvf/types` re-export is not introduced unless a real cross-app consumer appears.
- `docker-compose.yml`, root `package.json`, lockfile, `turbo.json`, `tsconfig*.json`, `.env*`, CI workflow, `vitest.config.ts` — no change.

## 8. Route and Query Contract

### 8.1 Route

**`GET /api/v1/telemetry/latest`** (controller base `/telemetry`, method path `latest`). Mirrors `GET /trends` placement under the same controller. The route name is **`latest`** (singular) — the response can be a single envelope or a list, but the API name is the noun "current value of."

### 8.2 Query parameters

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `unitId` | UUID | **Yes** | Backend `MeasurementUnit.id`. Validated as UUID v4-ish via Zod `z.string().uuid()`. Non-UUID rejected with 400 (matches the F4.4F / F4.6F.1 posture). |
| `canonicalTagId` | UUID | Optional | XOR with `canonicalTagName`. |
| `canonicalTagName` | string `1..64` | Optional | XOR with `canonicalTagId`. E.g. `p_inlet`. |

**Behavior when neither `canonicalTagId` nor `canonicalTagName` is provided:** the API returns **all current values for the unit** (every `live_readings` row keyed by `unitId`). This is the most useful shape for the Operations tile grid (six tiles per unit → one request hydrates all six). The XOR rule (exactly one tag identifier when filtering) still applies *when at least one is supplied*: supplying both is rejected as ambiguous.

**No `quality` / `qualityPolicy` parameter.** `live_readings` is `good`-only by F4.6C.1 contract; a quality filter would be redundant. Adding one is a future concern only if F4.6C.1's contract relaxes.

**No `source` / `jobId` parameter.** `live_readings` is keyed by `(unitId, sensorId, canonicalTagId)`; the per-row `source` is exposed in the response for traceability but not as a filter (the projection only stores the most recent `good` source). `jobId` is not on the projection schema and not relevant to current-value reads.

**No `from` / `to` parameter.** The latest-value API is by definition a point-in-time read; range scans go through `/trends`.

**No `limit` parameter.** A unit's `live_readings` cardinality is bounded by the number of sensors × canonical tags configured for that unit — typically <20 rows. No pagination needed.

**No `tenantId` parameter.** Tenant scoping is derived from the `CallerContext` server-side, never trusted from the client (matches F4.4 / F4.6F.1; matches ADR-005 / ADR-008).

### 8.3 Zod schema (illustrative, exact form decided in F4.6C.2.1)

```ts
// apps/backend/src/telemetry/contracts/latest.ts
import { z } from 'zod';

export const LatestQuerySchema = z
  .object({
    unitId: z.string().uuid(),
    canonicalTagId: z.string().uuid().optional(),
    canonicalTagName: z.string().min(1).max(64).optional(),
  })
  .strict()
  .refine(
    (q) => !(q.canonicalTagId !== undefined && q.canonicalTagName !== undefined),
    {
      message:
        'supplying both `canonicalTagId` and `canonicalTagName` is rejected as ambiguous; ' +
        'supply at most one, or omit both to receive all latest values for the unit',
      path: ['canonicalTagName'],
    },
  );

export type LatestQuery = z.infer<typeof LatestQuerySchema>;
```

### 8.4 No-data / unknown-id behavior

- **Known unit, no rows yet** (`live_readings` empty for the unit because no telemetry has been ingested) → `200 OK` with `values: []`. Mirrors the F4.4F empty-array posture; never `404`. Callers can render an "empty unit" tile state without distinguishing "unit doesn't exist" from "no telemetry yet".
- **Unknown unit** (`unitId` not in `MeasurementUnit`) → `200 OK` with `values: []`. F4.6C.2.1 does not verify the unit exists before reading the projection — it simply queries `live_readings WHERE unitId = $1`. Reasoning: a non-existent unit cannot have projection rows, so the same shape applies; explicitly checking unit existence adds a round-trip without changing the operator's view. (A future phase can add a `200 OK` envelope with a `unitExists: false` discriminator if a screen needs it.)
- **Known unit, unknown canonical tag** (when `canonicalTagId` / `canonicalTagName` is supplied) → `200 OK` with `values: []`. Same reasoning.
- **Invalid UUID** (`unitId` not UUID-shaped) → `400 Bad Request` via the Zod refine. The error message names the offending field.
- **Invalid combination** (both `canonicalTagId` and `canonicalTagName`) → `400 Bad Request` via the XOR refine.

### 8.5 Auth / scoping

- F4.6C.2.1 inherits the existing no-auth posture (matches F4.4 / F4.6F.1 / F4.6E.1 REST surfaces). The controller passes `SystemContext` to the service, meaning cross-tenant reads when no `tenantId` is in the caller context.
- A future ADR-009 + auth phase replaces `SystemContext` with a real authenticated context; F4.6C.2.1's service signature (`async query(ctx: CallerContext, input: LatestQuery)`) is the seam.

## 9. Response Shape

### 9.1 Envelope

A **single envelope** carrying one or more values. This matches the trend response (`unitId` / `canonicalTag` / `range` / `points`) — one envelope per request, regardless of how many sub-rows the request resolves to. F4.6C.2.1 mirrors the structure for consistency.

```ts
// apps/backend/src/telemetry/contracts/latest.ts (continued)
export interface LatestValueRow {
  sensorId: string;
  canonicalTag: {
    id: string;
    name: string;
    displayName: string;
    canonicalUnit: string;
    category: string;
    precision: number;
  };
  /** Decimal serialized via Decimal.toJSON → string. Callers Number(...) if needed. */
  value: string;
  engineeringUnit: string;
  /** Always 'good' per F4.6C.1; exposed for forward compatibility. */
  quality: 'good' | 'uncertain' | 'bad';
  /** ISO-8601 — the canonical reading timestamp (the watermark). */
  timestamp: string;
  /** ISO-8601 — when the backend accepted the reading. Nullable in projection. */
  ingestionTimestamp: string | null;
  /** E.g. 'mqtt', 'manual', 'mock'. Nullable in projection. */
  source: string | null;
  /** UUID of the `telemetry_readings` row this projection points at; nullable. */
  latestTelemetryReadingId: string | null;
}

export interface LatestResponse {
  unitId: string;
  /** ISO-8601 — when this envelope was generated server-side (Date.now()). */
  generatedAt: string;
  /** Constant string `'live_readings'` — names the canonical source. */
  source: 'live_readings';
  /** Zero or more rows, one per `(sensorId, canonicalTagId)` slot for the unit. */
  values: LatestValueRow[];
}
```

### 9.2 Decisions

- **Single envelope** carries `values: LatestValueRow[]`. Even the single-tag query returns the envelope shape (a one-element array). Callers always destructure the same way.
- **Decimal serialization** matches the F4.4F / F4.6F.1 raw-mode posture — `value` is a Decimal serialized to a string via `Decimal.toJSON`. Consumers needing numeric math call `Number(...)`. (Bucketed mode in F4.6F.1 coerces to JS `number` *because aggregation produces a number from PostgreSQL*; the latest API is not aggregated, so the raw posture applies.)
- **`canonicalTag` is a nested object**, not a flat field set, to match the F4.4F / F4.6F.1 trend shape. Reduces wire ambiguity and lets the frontend share helper code.
- **`generatedAt`** is a server-side timestamp (`new Date().toISOString()` at response time). Lets the frontend compute a "last fetched at" label without inferring it from the response timing.
- **Per-row `timestamp` + `ingestionTimestamp`** both exposed. `timestamp` is the canonical watermark; `ingestionTimestamp` is when the backend accepted it. The frontend's stale detector (see §10) keys off `timestamp`.
- **No `isStale` boolean.** §10 explains; the API exposes timestamps, the frontend decides what "stale" means against its per-tag thresholds (which already exist in `apps/web/lib/quality/stale.ts`).
- **`engineeringUnit`** is the unit the device sent — same as in `live_readings`. No conversion at read time (matches F4.4F: render what the device sent).
- **`status`** column is **not** exposed on the wire. It is reserved and unpopulated by F4.6C.1; surfacing it now would invite premature consumers. Forward-compat seam: when F4.6C.1's contract relaxes to populate `status`, F4.6C.2.1's response can additively extend with an optional field.

### 9.3 Raw-table-shape leakage avoidance

The response payload is a derived view, not a raw `live_readings` row dump. Specifically:
- `tenantId` is **not** on the wire (server-side concern; trusting it from the client is the anti-pattern §4 forbids).
- `id` (projection row primary key) is **not** on the wire (the projection is rebuildable from `telemetry_readings`; the row id is internal).
- `createdAt` / `updatedAt` are **not** on the wire (operational metadata, not telemetry).
- `latestTelemetryReadingId` **is** exposed because a future caller (e.g., the alarm-events read surface in candidate F4.6D.2) may want to anchor a follow-up query to the canonical row — it's the projection's only forward-link into `telemetry_readings`.

## 10. Quality / Freshness / Staleness Semantics

### 10.1 Quality

- `live_readings.quality === 'good'` by F4.6C.1 contract. F4.6C.2.1 exposes the field on the wire (typed as the F4.4F `TelemetryQuality` union) for forward compatibility.
- F4.6C.2.1 does **not** filter by quality. There is no `qualityPolicy` parameter, no `includeUncertain`, no `includeBad`.

### 10.2 Freshness

- `timestamp` is the canonical reading timestamp (the watermark) — `live_readings.timestamp`.
- `ingestionTimestamp` is when the backend accepted the reading — `live_readings.ingestionTimestamp`.
- **`generatedAt`** on the envelope is the server-side response-generation time.

### 10.3 Staleness

- F4.6C.2.1 does **not** compute `isStale`. Repo evidence: `apps/web/lib/quality/stale.ts` already implements a stale detector parametrized by `(jobId, tag)` thresholds from the commissioning snapshot (`delayedAfterSec` / `staleAfterSec` / `offlineAfterSec`). Computing staleness server-side would require either embedding those thresholds in the backend (a Jobs concern that ADR-005 / ADR-008 §3 decision 4 keeps in the snapshot, not in the projection) or hardcoding a one-size threshold (which would lie about per-tag operational reality).
- The frontend computes staleness from the exposed `timestamp` against its own per-tag thresholds. F4.6C.2.1 stays honest by surfacing the raw values.
- **Forward-compat seam:** if a future phase wants to expose a `staleAtSec` per-tag threshold from `CanonicalTag` (or a global default), the response can additively gain an `isStale: boolean` per row without breaking existing consumers.

### 10.4 Null / missing handling

- A unit with no projection rows yet → `values: []`. The empty array is the no-data answer (per §8.4).
- An invalid timestamp / corrupt Decimal would mean projection corruption — not in scope to defend against at the read layer; the projection writer is the contract.

## 11. Relationship to Trends, Realtime, and Operations UI

| Surface | Owns | Does not own |
|---|---|---|
| `GET /api/v1/telemetry/trends` (F4.6F.1) | Historical range scans; chart history | Current value; tile hydration |
| `GET /api/v1/telemetry/latest` (F4.6C.2.1, this phase) | Canonical current value per `(unit, tag, sensor)` slot | History; tail updates; alarm state |
| Socket.IO `live_reading.updated` (F4.6E.1) | Tail / freshness notification | Durable hydration; initial load; resync |
| Operations chart (`<LiveTrendsPanelLive>`, F4.5G.1) | Chart series rendering from trend reads | Tile current values |
| Operations realtime hook (`useOperationsRealtimeF4`, F4.5G.2.1) | Socket-state UI; per-slot view-model from `live_reading.updated`; reconnect → invalidate `['f4-trends']` | Initial value hydration; canonical resync |

**A future Operations tile binding phase** (candidate F4.5G.2.3 or "Operations tile latest-value cutover") composes these:

```
On mount  →  useOperationsLatest({ unitId })       // F4.6C.2.1 REST hydration
Realtime  →  useOperationsRealtimeF4 slot tail     // F4.5G.2.1 hook (already exists)
Reconnect →  invalidate the latest-value cache     // mirrors F4.5G.2.1's trend invalidation
```

F4.6C.2.1 itself **does not** wire this composition — it ships the backend + adapter and stops. The UI phase that picks it up gets to decide whether the tile binds to the REST result (primary) and overlays realtime tail (best-effort), or vice versa. Either composition is honest as long as the source is labeled (per F4.5G.2.1's "never lie about freshness" contract).

**Anti-patterns F4.6C.2.1 explicitly forbids:**
- Calling `/trends?from=now-1m&to=now&limit=1` to mean "current value." Wasteful per metric; semantically confused.
- Inferring current value from the F4.6E.1 Socket.IO stream without a prior REST hydration. Realtime is not source of truth; a tile must hydrate from REST first.
- Browser-side filtering of the response by tenant. The backend filters.

## 12. UUID / Unit Resolver Consideration

### 12.1 The known gap

Per F4.5G.2-0 §9 and F4.5G.2.1 closeout §6: `OPERATIONS_JOBS[i].job.unitId` is a simulator catalog string (`EMMAD-01` / `EMMAD-02` / `PSK-03`), not a backend `MeasurementUnit.id` UUID. F4.5G.2.1 added an `isUuidShaped` predicate that prevents these from ever reaching a backend-bound emit.

F4.6C.2.1 inherits this guardrail: **the frontend adapter must never embed a non-UUID `unitId` in a REST query**. The Zod refine on the backend would reject it as 400, but the right defense is client-side.

### 12.2 The three options

- **(A) F4.6C.2.1 includes only backend + adapter.** The adapter accepts a `unitId` (typed as `string` but expected UUID-shaped) and forwards it. The mock branch returns synthetic rows for known mock UUIDs (`HP_001_ID` = `00000000-0000-0000-0000-000000004411`, `LP_001_ID` = `00000000-0000-0000-0000-000000004412`); for unknown ids it returns the empty envelope. The api branch issues the request as-is and surfaces a 400 if the id is non-UUID — but the caller is expected to gate the call on `isUuidShaped` first (matching the F4.5G.2.1 posture).
- **(B) F4.6C.2.1 includes a small frontend unit-resolver helper.** A hook like `useResolveOperationsUnitId(catalogCode)` that calls `adapterListMeasurementUnits()` (F4.5C) and picks by `code`. Adds one new file (`apps/web/lib/hooks/useResolveOperationsUnitId.ts` or similar) + one new test file.
- **(C) Defer the resolver entirely to a separate Operations job-selection phase.** F4.6C.2.1 ships only the backend + adapter; the resolver lands when a tile UI consumer needs it.

### 12.3 Recommendation: **(A)**.

Reasoning:
- The backend already exposes the resolution surface via `GET /api/v1/equipment/units` (F4.4D); no new endpoint is needed to support a future resolver.
- A frontend resolver hook is small but its design touches the Operations *job selection* model (which jobs Operations renders, against which backend units) — a broader UX concern than F4.6C.2 should own. Pre-baking it into F4.6C.2.1 invites scope creep into "redesign Operations job binding."
- The `isUuidShaped` predicate from F4.5G.2.1 is already in the shared hook barrel (`@/lib/hooks`). The new latest-value adapter can refuse to issue a backend call when the caller-supplied `unitId` is non-UUID, mirroring the F4.5G.2.1 contract — the *guardrail* travels for free; the *resolver* doesn't.
- The tile UI cutover (the phase that actually consumes the latest-value adapter) is the natural place to choose between "resolve at the UI boundary" vs "redesign OPERATIONS_JOBS to carry backend UUIDs". Letting that phase decide, with both routes still available, is the right deferral.

**Hard rule** (binding F4.6C.2.1): the new frontend adapter exports an `assertUuidShaped(unitId)` guard at the entry of the api-mode branch, throwing a deterministic `RvfApiError(400, ..., 'unitId must be UUID-shaped')` *before* the HTTP call when `!isUuidShaped(unitId)`. No silent coercion. No mapping table baked into the adapter. The error surface is the same shape the backend would have returned if the call had been made — clients handle one error path, not two.

## 13. Security / Isolation

- **Tenant scoping.** Same posture as F4.4F / F4.6F.1: `ctx.tenantId` filters the `live_readings.findMany` `where` clause when set; cross-tenant reads when unset. F4.6C.2.1 inherits `SystemContext` (the F4.4 default).
- **Unit access assumption.** F4.6C.2.1 does not check whether a unit belongs to the caller's tenant beyond the `where: { tenantId, unitId }` predicate. A future auth phase introducing an authenticated `tenantId` will make this a real wall (a request from tenant A asking for tenant B's unit → empty result, not 403). Today, no auth → no wall, by project posture.
- **Cross-tenant leakage.** Possible today only because no auth exists. F4.6C.2.1 does not regress the posture: tenant scoping is in place at the SQL layer; the wire shape carries no `tenantId` (so a client cannot smuggle one in).
- **No tenant id trusted from client.** Mirrors the F4.6B.1 ingestion test #21 invariant — the `LatestQuery` schema has no `tenantId` field; `ZodValidationPipe` strips unknown fields (`.strict()`).
- **Future auth caveat.** When ADR-009 + auth phase lands, the controller switches from `SystemContext` to the authenticated `CallerContext` extractor. Service signature stays.

## 14. Non-Goals

Explicitly out of scope for F4.6C.2.1 (each with the phase that should own it, if any):

- **Operations tile UI binding to the new endpoint.** Owned by a separate frontend phase (candidate "Operations tile latest-value cutover" or F4.5G.2.3).
- **Full unit selector redesign.** Operations job selection is broader than F4.6C.2; out of scope.
- **Backend unit resolver.** Backend already exposes `GET /api/v1/equipment/units` (F4.4D). Resolver logic is a frontend / UX concern.
- **Alarm evaluation.** ADR-005 invariant; not in F4.6C.2.
- **Alarm read API.** Candidate F4.6D.2.
- **Alarm chart annotations.** Candidate F4.5G.3.
- **Trends aggregation changes.** F4.6F.1's contract is byte-identical; F4.6C.2.1 does not extend or refactor it.
- **Realtime push changes.** F4.6E.1's contract is byte-identical; F4.6C.2.1 does not add, remove, or modify any emit kind.
- **Frontend chart changes.** F4.5G.1's chart pair (`<LiveTrendsPanelLive>` + `<TrendDrawer>` + `useOperationsTrendSeries`) is byte-identical.
- **ThingsBoard / Node-RED / OPC-UA / MQTT / Modbus / PLC / historian / edge-gateway integration.** Future adapter phases; not a read-API concern.
- **Schema / migration / seed change.** `live_readings` exists since F4.6A.1; no new column, index, or constraint required.
- **`live_readings_projection` SQL VIEW change.** Preserved as-is per F4.6A.0 §5.E.
- **Multi-unit / multi-tenant batch endpoint.** Future concern; UI-side fan-out is fine for the tile use case.
- **Staleness analytics.** F4.6C.2.1 exposes timestamps; the frontend computes staleness against its existing per-tag thresholds.
- **`status` column exposure.** Reserved by F4.6A.1; unpopulated by F4.6C.1; not on the wire in F4.6C.2.1.
- **Auth / rate limiting.** Inherited no-auth posture.
- **Adding a new env variable.** No new flag.

## 15. Test Plan

Mocked-Prisma posture, mirroring `trends.service.spec.ts`.

### 15.1 New backend tests

**`apps/backend/src/telemetry/latest.service.spec.ts`** — new file. Tests cover:

1. **List-by-unit happy path** — returns every `live_readings` row matching `unitId`, mapped to the response envelope.
2. **Single-tag-by-id happy path** — adds `canonicalTagId` to the filter; returns one row.
3. **Single-tag-by-name happy path** — resolves via `CanonicalTagResolver`; returns one row.
4. **XOR refine — both ids supplied** — controller-level Zod test: `400 Bad Request`.
5. **XOR refine — same as F4.4F XOR** — both `canonicalTagId` and `canonicalTagName` rejected.
6. **Invalid `unitId`** (non-UUID) — `400 Bad Request`.
7. **Unknown unit** — empty array returned, not 404.
8. **Known unit with no projection rows yet** — empty array, `generatedAt` populated.
9. **Tenant scoping — `ctx.tenantId` set** — the Prisma `where` clause carries `tenantId`.
10. **Tenant scoping — `SystemContext`** — no `tenantId` filter; cross-tenant rows return.
11. **Response shape stability** — assert no `id` / `tenantId` / `createdAt` / `updatedAt` / `status` field leaks.
12. **Decimal serialization** — `value` is a string in JSON output.
13. **`generatedAt` is a fresh ISO-8601 timestamp** — generated server-side.
14. **`source: 'live_readings'` is the constant value** — exposed for traceability.

**`apps/backend/src/telemetry/latest.service.spec.ts` validation block** (controller-level Zod tests, mirroring F4.6F.1's pattern):

15. **`.strict()` rejects unknown fields** — e.g., `tenantId` query param rejected.
16. **`canonicalTagName` length refine** — 0-length and >64 rejected.
17. **All-optional-tag path accepted** — neither `canonicalTagId` nor `canonicalTagName` supplied.

### 15.2 Updated backend invariants

**`apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` isolation invariants** — narrow the existing "ingestion never calls `prisma.liveReading.*`" assertion to "ingestion never calls `prisma.liveReading.create / update / updateMany / upsert / delete`" — the new latest service is permitted to **read** the projection. The assertion remains forceful: only the projection service writes.

### 15.3 New frontend adapter tests

**`apps/web/lib/api-data/f4/latest.test.ts`** (or extension of `telemetry.test.ts`) — covers:

1. **Mock mode happy path** — list-by-unit returns fixture rows.
2. **Mock mode unknown unit** — empty envelope (`values: []`).
3. **API mode happy path** — composes the URL `/telemetry/latest?unitId=...`.
4. **API mode with `canonicalTagName`** — query string contains the param.
5. **API mode XOR rejection** — supplying both `canonicalTagId` and `canonicalTagName` raises `RvfApiError(400, ...)` before issuing the fetch (mirrors F4.4F mock-mode behavior).
6. **UUID guardrail in api mode** — non-UUID `unitId` raises `RvfApiError(400, ...)` before the fetch.
7. **Empty response handling** — `{ unitId, generatedAt, source: 'live_readings', values: [] }` parsed cleanly.
8. **Decimal `value` stays a string** — consumer responsibility to `Number(...)`.

### 15.4 Tests that must keep passing unchanged

- All backend telemetry tests (195/195 baseline).
- All projection tests (`live-readings-projection.service.spec.ts`).
- All ingestion tests (`telemetry-ingestion.service.spec.ts`) with the narrowed isolation invariant.
- All alarm / realtime / trend tests.
- All frontend tests (375/375 from F4.5G.2.1).

### 15.5 Expected test counts

| Metric | Before F4.6C.2.1 (`2aa6140`) | After F4.6C.2.1 (projected) |
|---|---|---|
| Backend tests | 195 / 195 | **+~10–15 new tests** (~7 service + ~3 validation + carry-forward assertions in ingestion isolation) |
| Frontend tests | 375 / 375 | **+~6–10 new tests** (adapter dual-mode + UUID guardrail + mock fixtures) |

### 15.6 Validation commands (DX-3 §"Runtime phases")

- `pnpm --filter @rvf/backend run lint -- --max-warnings 0`
- `pnpm --filter @rvf/backend run typecheck`
- `pnpm --filter @rvf/backend run build`
- `pnpm --filter @rvf/backend run test`
- `pnpm --filter @rvf/web run lint -- --max-warnings 0`
- `pnpm --filter @rvf/web run typecheck`
- `pnpm --filter @rvf/web run build`
- `pnpm --filter @rvf/web run test`
- Workspace `pnpm lint` / `typecheck` / `build` — all green.

### 15.7 What F4.6C.2-0 itself runs

**Nothing.** Documentation-only phase. DX-3 §"Documentation-only phases" prescribes only `git status` + `git diff --stat` confirming only `docs/` changed.

## 16. Risks and Guardrails

| Risk | Mitigation |
|---|---|
| **Trend endpoint abused as a latest-value API.** | §11 forbids it. Reviewer rejects any new caller that issues `/trends?from=now-1m&to=now&limit=1` to mean "current value." A future profiling / metrics dashboard can detect this pattern and surface it as a misuse. |
| **Stale values shown as live.** | §10 / §9: `timestamp` and `ingestionTimestamp` are exposed honestly. The frontend's stale detector (`lib/quality/stale.ts`) consumes the per-tag thresholds. F4.6C.2.1 never lies — it does not invent an `isStale` boolean from a hardcoded threshold. |
| **UUID / mock-ID mismatch surfaces as confusing 400s.** | §12 recommendation **(A)**: the frontend adapter's api-mode branch refuses non-UUID `unitId` *before* issuing the fetch and returns a deterministic `RvfApiError(400, ..., 'unitId must be UUID-shaped')`. Mock mode tolerates simulator strings by returning the empty envelope. |
| **Cross-tenant leakage.** | §13: the controller passes `ctx` to the service; the service filters by `tenantId` when set. The `LatestQuery` schema has no `tenantId` field. No new attack surface introduced. |
| **Overbuilding the unit resolver inside F4.6C.2.1.** | §12: explicit recommendation to defer. Reviewer rejects any PR that bundles a resolver hook into F4.6C.2.1. |
| **Silently mapping simulator IDs to backend UUIDs.** | §12 hard rule: no mapping table baked into the adapter. The `assertUuidShaped` guard surfaces the gap honestly. |
| **Frontend coupling to raw `live_readings` table shape.** | §9.3: the response is a derived view, not a Prisma row dump. `id` / `tenantId` / `createdAt` / `updatedAt` / `status` are stripped before the wire. |
| **Adding schema / migrations unnecessarily.** | §7.3 / §14: no schema / migration / seed change. The `live_readings` table from F4.6A.1 is sufficient. |
| **Exposing `status` prematurely.** | §9.2 / §14: `status` is reserved and unpopulated; not on the wire in F4.6C.2.1. Forward-compat seam: the response can additively gain the field when F4.6C.1's contract relaxes. |
| **Quality column becoming meaningless if F4.6C.1 ever projects non-`good`.** | §10.1: the field is typed as the F4.4F `TelemetryQuality` union (`'good' | 'uncertain' | 'bad'`) for forward compatibility. F4.6C.2.1 today reads what F4.6C.1 wrote, which is always `'good'`. |
| **Read-API becomes a write-API by accident.** | §15.6: the latest service is read-only — `findMany` / `findUnique` only. The ingestion-isolation invariant narrows to forbid `liveReading.create / update / updateMany / upsert / delete` outside the projection service. |
| **Multi-unit batch demand pushed into F4.6C.2.1.** | §7.2: single `unitId` per request. UI-side fan-out (TanStack Query parallel) is the answer. A real batch endpoint can be candidate F4.6C.3 if a screen consumer requires it. |
| **Adapter file size growing unbounded.** | §7.1: the implementation can split the new adapter into `apps/web/lib/api-data/f4/latest.ts` if `telemetry.ts` becomes unwieldy. The barrel export from `apps/web/lib/api-data/f4/index.ts` is the contract; internal file layout is free. |
| **Realtime hook regression.** | F4.5G.2.1 hooks unchanged. The new latest-value adapter does not flow through `useOperationsRealtimeF4`. |
| **Trend hook regression.** | F4.5G.1 hooks unchanged. The new latest-value adapter does not flow through `useOperationsTrendSeries`. |
| **Mocked-Prisma test posture leaves the projection-index access path unverified.** | Inherited risk from every F4.6 sub-phase. The `live_readings_tenant_unit_idx` / `live_readings_unit_idx` access paths are not exercised against a real Postgres yet. A live-DB integration suite remains a candidate cross-phase deliverable. |

## 17. Acceptance Criteria for F4.6C.2.1

F4.6C.2.1 is complete when **all** of the following are true:

- [ ] `GET /api/v1/telemetry/latest` exists on the existing `TelemetryController` and accepts the §8 query shape (`unitId` UUID required; `canonicalTagId` / `canonicalTagName` XOR optional). No new controller class introduced.
- [ ] Zod schema enforces UUID on `unitId`, length on `canonicalTagName`, XOR between the two tag identifiers, and `.strict()` rejection of unknown fields. Errors surface as `400 Bad Request` via the existing `ZodValidationPipe`.
- [ ] Backend service reads `prisma.liveReading.findMany` (or `findUnique` for the single-tag-by-id case) with `tenantId` filter when `ctx.tenantId` is set. Reads `live_readings` only — never `telemetry_readings`, never the `live_readings_projection` VIEW, never the F4.6E.1 Socket.IO state.
- [ ] Response envelope shape matches §9 exactly: `{ unitId, generatedAt, source: 'live_readings', values: LatestValueRow[] }`. `tenantId` / `id` / `createdAt` / `updatedAt` / `status` are **not** on the wire.
- [ ] `value` is a Decimal serialized to string via `Decimal.toJSON`. `timestamp` / `ingestionTimestamp` / `generatedAt` are ISO-8601.
- [ ] Empty response (`values: []`) returned for known unit with no rows, unknown unit, and known unit with unknown canonical tag. Never 404 on these paths.
- [ ] Invalid UUID `unitId` → 400; both `canonicalTagId` and `canonicalTagName` together → 400; unknown fields → 400.
- [ ] No `quality` / `qualityPolicy` / `source` / `jobId` / `from` / `to` / `limit` / `tenantId` query parameters introduced.
- [ ] No schema / migration / seed change.
- [ ] `apps/backend/src/telemetry/telemetry.module.ts` registers the new service additively; `TelemetryController` constructor updated to inject it. No other backend file modified beyond the four new / extended files (`contracts/latest.ts`, `latest.service.ts`, `telemetry.controller.ts`, `telemetry.module.ts`) and the test files.
- [ ] **Ingestion-spec isolation invariant narrowed** to forbid `liveReading.create / update / updateMany / upsert / delete` outside the projection service. Read access is permitted.
- [ ] Frontend typed endpoint wrapper `getTelemetryLatest` and types added to `apps/web/lib/api/f4/`. Frontend dual-mode adapter `adapterGetTelemetryLatest` added to `apps/web/lib/api-data/f4/` (file location: extend `telemetry.ts` or new `latest.ts` — implementation's call).
- [ ] Frontend adapter exports an `assertUuidShaped(unitId)` guard at the entry of the api-mode branch; non-UUID `unitId` raises `RvfApiError(400, ..., 'unitId must be UUID-shaped')` **before** the HTTP call. Mock branch tolerates simulator strings by returning the empty envelope.
- [ ] Mock fixtures for the new adapter added under `apps/web/lib/api-data/f4/mock-fixtures.ts` (deterministic synthetic rows under HP-001 / LP-001).
- [ ] **No UI screen migration** (`<LiveVariableTile>` / `<MultiphaseUnitCard>` / Operations tiles unchanged).
- [ ] **No backend unit resolver** introduced inside F4.6C.2.1.
- [ ] **No `packages/types/` change.**
- [ ] **No new env variable.**
- [ ] **No new dependency.**
- [ ] Backend tests **+~10–15 new** (per §15.5); existing 195/195 stay green. Frontend tests **+~6–10 new**; existing 375/375 stay green.
- [ ] DX-3 §"Runtime phases" validation surface passes end to end: `lint --max-warnings 0` / `typecheck` / `build` / `test` for both `@rvf/backend` and `@rvf/web`, plus workspace `lint` / `typecheck` / `build`.
- [ ] F4.6C.2.1 closeout report exists at `docs/architecture/RVF_Malinois_F4_6C_2_1_Latest_Value_Read_API_Closeout.md`, follows the established closeout structure, reports the final test counts, and explicitly names the UI binding deferral.
- [ ] Master roadmap §3 / §7 refresh — deferred to a small follow-up hygiene commit per the established pattern (`121803d`, `cafccb6`, `1d0f659`, `2aa6140`).

## 18. Recommended Next Step

**Next step after F4.6C.2-0: F4.6C.2.1 — Latest-value Read API Implementation.** Plan-first → implementation per the codified DX-3 pattern. Scope per §7; query contract per §8; response shape per §9; quality / freshness per §10; UUID guardrail per §12; tests per §15; acceptance per §17.

After F4.6C.2.1, the master roadmap §7 candidate sequence continues — the team picks based on observed need:

- **Candidate Operations tile latest-value cutover** (small follow-up frontend phase). Binds `<LiveVariableTile>` / `<MultiphaseUnitCard>` to the new latest-value adapter as the primary source; F4.5G.2.1's realtime hook becomes the tail update overlay. Naturally closes the OPERATIONS_JOBS UUID gap by introducing a small frontend unit-resolver helper (catalog code → backend UUID via the F4.4D units list).
- **Candidate F4.6D.2 — Alarm Events Read API.** Public read surface over `alarm_events`; unblocks `<LiveActiveAlarmsPanel>` migration off its browser-side `evaluateReading` path.
- **Candidate F4.5G.3 — Alarm chart annotations.** Wires `alarm.event.created` overlays into `<TrendChart>` / `<TrendDrawer>`; consumes the `alarmEventsSeen` seam shipped by F4.5G.2.1.
- **Candidate F4.5G.2.2 — Operations chart realtime tail.** Appends `live_reading.updated` points to the rendered `<TrendChart>` series instead of only invalidating on reconnect.
- **Candidate F4.5H — Non-telemetry screen adapter wiring.** Per-screen migrations for Wells / Equipment / Catalog / Tags / Settings / Reports off the F3 mock adapter.
- **Candidate F4.6C.3 — Latest-value batch / multi-unit endpoint.** Only if a multi-unit screen consumer demands it.

These are named so they have a place to land. None is committed to as part of F4.6C.2.1. The next implementation phase is **F4.6C.2.1**.

---

*F4.6C.2-0 plan, authored at HEAD `2aa6140` (Refresh master roadmap after F4.5G.2.1). Plan-only. Update on phase close (`Current` → `Closed` with commit hash) and when F4.6C.2.1 lands its closeout.*
