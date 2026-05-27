# RVF Malinois — F4.6F-0 Historical Trend API Plan

> Phase **F4.6F-0 — Historical Trend API Plan**. Plan-first per the codified project pattern (F4.2A → F4.2B, F4.6A.0 → F4.6A.1, F4.6B-0 → F4.6B.1, F4.6C-0 → F4.6C.1, F4.6D-0 → F4.6D.1, F4.6E-0 → F4.6E.1).
> Documentation-only artifact. No backend, frontend, schema, migration, or runtime code is modified by F4.6F-0. Implementation lands in F4.6F.1.
> Last known head at authoring time: commit `29efb7f` (Refresh master roadmap after F4.6E.1).
>
> Upstream references:
> - Master Roadmap (most recent refresh): `docs/architecture/RVF_Malinois_Master_Roadmap.md` (commit `29efb7f`).
> - Local DB Migration Validation Procedure (DX-2): `docs/operations/RVF_Malinois_Local_DB_Migration_Validation_Procedure.md` (commit `e3ccb52`).
> - Definition of Done (DX-3): `docs/operations/RVF_Malinois_Definition_of_Done.md` (commit `65cb736`).
> - F4.4F closeout (the F4.4 endpoint this plan extends): `docs/architecture/RVF_Malinois_F4_4F_Telemetry_API_Reactivation_Report.md` (commit `5e92a13`).
> - F4.4 closeout: `docs/architecture/RVF_Malinois_F4_4_API_Reactivation_Closeout_Report.md` (commit `e6b40b6`).
> - F4.5E closeout (frontend adapter wired to `/api/v1/telemetry/trends`): `docs/architecture/RVF_Malinois_F4_5E_Telemetry_Trends_API_Wiring_Report.md` (commit `6af42fa`).
> - F4.6 architecture: `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Architecture.md` (commit `c12a29c`).
> - F4.6B.1 closeout: `docs/architecture/RVF_Malinois_F4_6B_1_Ingestion_Boundary_Skeleton_Closeout_Report_v1.0.md` (commit `1495457`).
> - F4.6C.1 closeout: `docs/architecture/RVF_Malinois_F4_6C_1_Live_Readings_Projection_Updater_Closeout_Report_v1.0.md` (commit `49a8349`).
> - F4.6D.1 closeout: `docs/architecture/RVF_Malinois_F4_6D_1_Alarm_Evaluation_Boundary_Closeout.md` (commit `d35a2b8`).
> - F4.6E.1 closeout: `docs/architecture/RVF_Malinois_F4_6E_1_WebSocket_SSE_Fan_Out_Closeout.md` (commit `51dc626`).
> - ADR-007 (Database Foundation, TimescaleDB optional): `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md`.

## 1. Purpose

F4.6F-0 is the **plan-first** phase for the RVF Malinois historical trend API.

What this phase does:

- Locks the scope of the F4.6F.1 implementation phase: which query parameters land, which response shape lands, which bucketing / downsampling primitives land, which limits and validations land, and which non-goals stay out.
- Inventories the **existing** `/api/v1/telemetry/trends` surface (F4.4F, commit `5e92a13`) and names exactly what gets extended vs. preserved vs. left untouched.
- Decides how historical trend reads complement F4.6E.1 realtime push and any future F4.6C.2 latest-value read API — three reads that together cover "what's now / what just happened / what happened over time."
- States non-goals so F4.6F.1 cannot quietly absorb multi-tag reads, frontend per-screen migration, TimescaleDB adoption, a continuous-aggregate projection table, or any concern outside the read-side of `telemetry_readings`.

What this phase does **not** do:

- It does not add any code to `apps/backend/src/telemetry/`. The new bucketing / downsampling logic, the response-shape changes, and the test extensions all land in F4.6F.1.
- It does not modify `packages/types/` or any frontend file.
- It does not add or modify Prisma schema or migrations. The existing F4.4F indexes (see §5) are the only access paths F4.6F.1 will use.
- It does not introduce TimescaleDB. ADR-007 §4 keeps Timescale optional; F4.6F.1 ships plain-PostgreSQL aggregation only.
- It does not introduce a materialized view / continuous aggregate / rollup table. Reads compute buckets at query time against `telemetry_readings`. A future phase may add a materialized projection only if profiling proves the live aggregate is too slow.

The trend API is the third leg of the canonical-read tripod the F4.6 arc shipped (canonical write → projection → alarm → realtime push, and now: historical read on the same canonical record). It must consume `telemetry_readings` directly — not `live_readings` (which is a single-row projection per `(unit, sensor, tag)`), not the realtime push stream (which is an in-memory fan-out, not durable storage), and not any frontend mock.

## 2. Current Repository State

Drawn from `git log`, the master roadmap, and direct inspection of the source files referenced in §5.

| Phase | Status | Commit |
|---|---|---|
| F4.4F — Telemetry trends API reactivation (read-only `/api/v1/telemetry/trends`) | Closed | `5e92a13` |
| F4.5E — Frontend telemetry-trends adapter (mock-default, switchable to API) | Closed | `6af42fa` |
| F4.6 architecture + ADR-008 (`Proposed`) | Closed | `c12a29c` |
| F4.6A.0 / F4.6A.1 — Schema hardening | Closed | `014df37` / `6be7842` |
| F4.6B-0 / F4.6B.1 — Ingestion boundary | Closed | `c4ea18a` / `1495457` |
| F4.6C-0 / F4.6C.1 — Live readings projection | Closed | `f126c5c` / `49a8349` |
| F4.6D-0 / F4.6D.1 — Alarm evaluation | Closed | `901cd22` / `d35a2b8` |
| F4.6E-0 / F4.6E.1 — WebSocket fan-out | Closed | `22fa2ca` / `51dc626` |
| DX-1 / DX-2 / DX-3 / DX-4 | Closed | `b19e77a` / `e3ccb52` / `65cb736` / `04dadc4` |
| **F4.6F-0 — Historical Trend API Plan** (this document) | **Current** | *(pending)* |
| F4.6F.1 — Historical Trend API Implementation | Deferred (next implementation phase) | — |

What this means for the read surface in the running backend:

- **`telemetry_readings`** — canonical, append-only. **Populated by F4.6B.1** when `RVF_INGEST_ENABLED=true`. Carries `(tenantId, unitId, sensorId, canonicalTagId, timestamp, value, engineeringUnit, quality, source, ingestionId, sequence, jobId, integrationSourceId, createdAt)`. Indexed for trend access on `(unit_id, canonical_tag_id, timestamp DESC)` (see §5.2).
- **`/api/v1/telemetry/trends`** — read-only range scan, single tag, returns raw points sorted ascending. No bucketing today.
- **F4.5E frontend adapter** — at `apps/web/lib/api-data/f4/telemetry.ts`, mock-default, switchable to the live API via `NEXT_PUBLIC_RVF_DATA_SOURCE=api`. Operations charts still render from F2 simulator + F3 mock (per master roadmap §6).
- **No materialized view / continuous aggregate / rollup table exists** for telemetry. The `live_readings_projection` SQL VIEW from F4.2B is preserved but is a per-`(unit, sensor, tag)` latest-row projection, not a bucketed history.

Roadmap anchor: **`29efb7f` (Refresh master roadmap after F4.6E.1)**. §7 there names F4.6F-0 as the next plan-first phase.

## 3. Architectural Position

The historical trend API sits **on the read side** of the same canonical record that F4.6B.1 / F4.6C.1 / F4.6D.1 / F4.6E.1 populate. The full data flow is now:

```
external input → ingestion boundary → telemetry_readings  ←─────────────── F4.6F.1: historical trend reads (range scan + bucketing)
   (any kind)      (F4.6B.1)          (canonical,
                                       append-only)        ─→ live_readings ←─ candidate F4.6C.2: latest-value read API
                                                                                (single row per (unit, sensor, tag))
                                                          ─→ alarm evaluation
                                                          ─→ (commit)
                                                          ─→ realtime fan-out  (F4.6E.1: telemetry / projection / alarm events
                                                                                emitted to per-tenant Socket.IO rooms)
```

Three principles govern the placement:

1. **Trend reads consume canonical persisted telemetry, never derived state.** Reads target `telemetry_readings` directly. `live_readings` (one row per `(unit, sensor, tag)`) is **not** a substitute — it has no history. The Socket.IO push (F4.6E.1) is **not** a substitute — it is in-memory fan-out, not durable storage, and a disconnected subscriber that reconnects must re-read history from the trend endpoint or from `live_readings` (depending on the screen's need). This is the operational embodiment of ADR-008 §3 decision 5 ("derived state is rebuildable from canonical state") at the read layer.
2. **No frontend mock data feeds the API.** The endpoint queries Prisma against `telemetry_readings`. When the table is empty (F4.3 does not seed telemetry; the F4.6B.1 endpoint is the only writer), the response carries `points: []`. Empty is honest.
3. **Trend reads, latest-value reads, and realtime push are complementary, not competing.** A typical Operations chart pattern, once the relevant phases ship:
   - **On mount:** REST trend read (F4.6F.1) for the visible time window — initial paint.
   - **For "current value" widgets:** REST latest-value read (candidate F4.6C.2) — one row per metric, cheap to refresh, no time window.
   - **For tail updates:** Socket.IO `telemetry.reading.accepted` / `live_reading.updated` / `alarm.event.created` (F4.6E.1) — push as each canonical commit lands.
   - **On reconnect:** REST trend read covering the gap window — recovery without a replay buffer.

F4.6F.1 ships **only the historical / bucketed read primitive**. The chart-cutover migration on the frontend is a separate per-screen task (candidate part of F4.5G+; see §14).

## 4. Ownership / Source of Truth

RVF Malinois owns, end to end, every concern in the trend-read path:

- **Query semantics** — required parameters, validation, XOR constraints, bucketing rules, limits.
- **Response shape** — the JSON payload the API returns. Living in `apps/backend/src/telemetry/contracts/trends.ts`.
- **Aggregation functions** — what `avg` / `min` / `max` / `count` / `first` / `last` mean over a bucket window.
- **Tenant scoping** — the `CallerContext.tenantId` forward-compat seam established by F4.4 stays in place; F4.6F.1 inherits it without change.
- **Time-window discipline** — `from` / `to` validation, max window per bucket size, max bucket count per request.
- **Performance envelope** — the index access path (`(unit_id, canonical_tag_id, timestamp DESC)`), the per-request row cap, the bucket-count cap.

What RVF Malinois does **not** delegate to any external system:

- No external broker, no external rollup engine, no Druid / ClickHouse / TimescaleDB cloud / vendor query layer. Reads run against the same plain PostgreSQL the rest of the platform uses.
- ThingsBoard / Node-RED / historians may, in some far-future phase, **feed** telemetry through the F4.6B.1 ingestion boundary. They may not **serve** trend reads to RVF clients — the trend endpoint is the only read path and it queries the canonical RVF table.
- No client-side downsampling that the backend would treat as authoritative. The browser may render a sparser visualization than the API returns, but the trend payload is the canonical decision.

This is the same principle ADR-006 / ADR-007 / ADR-008 applied at the write / projection / alarm / realtime layers, now extended to the historical-read layer.

## 5. Existing Trend API Surface Inventory

Direct repository evidence as of `29efb7f`. No surface is invented here.

### 5.1 Backend endpoint

**Route:** `GET /api/v1/telemetry/trends`. Mounted by `apps/backend/src/telemetry/telemetry.controller.ts` under the `@ApiTags('telemetry')` `@Controller('telemetry')`, with the global API prefix `api/v1` from `main.ts`.

**Pipe:** `ZodValidationPipe(TrendsQuerySchema)` validates the query before the service runs.

**Required query parameters** (all per F4.4F):
- `unitId` — UUID.
- `from` — coerced to `Date` (ISO-8601).
- `to` — coerced to `Date`; must be strictly greater than `from` (`refine`).
- Exactly **one** of `canonicalTagId` (UUID) or `canonicalTagName` (string `min(1).max(64)`) — XOR enforced by `refine`; supplying both is rejected as ambiguous.

**Optional query parameters:**
- `jobId` — UUID.
- `quality` — enum from `TELEMETRY_QUALITIES` (`'good' | 'uncertain' | 'bad'`).
- `source` — enum from `TELEMETRY_SOURCES` (10 values mirroring the F4.2B baseline migration's CHECK constraint: `'mock'`, `'manual'`, `'field_gateway'`, `'historian'`, `'plc'`, `'mqtt'`, `'node_red'`, `'opc_ua'`, `'modbus'`, `'edge_gateway'`).
- `limit` — coerced integer, `min(1).max(5000)`, default `1000`. Constants: `TRENDS_LIMIT_DEFAULT = 1000`, `TRENDS_LIMIT_MAX = 5000`.

**Schema strictness:** `.strict()` — unknown query parameters are rejected.

### 5.2 Database — table and indexes

`apps/backend/prisma/schema.prisma` `TelemetryReading` model (lines 546–575):

- Columns: `id` UUID PK, `tenantId`, `unitId`, `sensorId`, `canonicalTagId`, `timestamp` (timestamptz(6)), `value` (Decimal), `engineeringUnit`, `quality`, `source`, `ingestionId?`, `sequence?` (BigInt), `jobId?`, `integrationSourceId?`, `createdAt`.
- Btree indexes (from `@@index`):
  - `telemetry_readings_unit_tag_time_idx` on `(unit_id, canonical_tag_id, timestamp DESC)` — **the trend access path**.
  - `telemetry_readings_tenant_time_idx` on `(tenant_id, timestamp DESC)`.
  - `telemetry_readings_sensor_time_idx` on `(sensor_id, timestamp DESC)`.
- Raw-SQL extras (per F4.2B baseline + F4.6A.1 hardening): partial indexes on `(job_id, timestamp DESC) WHERE job_id IS NOT NULL` and on `(integration_source_id)`, plus the two F4.6A.1 dedup partial unique indexes.

The `(unit_id, canonical_tag_id, timestamp DESC)` index is the access path the F4.4F service uses and the path F4.6F.1's bucketed reads will continue to use. **No new index is required for F4.6F.1's planned scope** (see §10).

### 5.3 Service

`apps/backend/src/telemetry/trends.service.ts`:

- Resolves the canonical tag via `CanonicalTagResolver` (either `canonicalTagId` or `canonicalTagName` → full tag row).
- Runs a single `prisma.telemetryReading.findMany` with `where: { tenantId?, unitId, canonicalTagId, timestamp: { gte: from, lt: to }, jobId?, quality?, source? }`, `select: { timestamp, value, engineeringUnit, quality, source }`, `orderBy: { timestamp: 'asc' }`, `take: limit`.
- Returns `{ unitId, canonicalTag: { id, name, displayName, canonicalUnit, category, precision }, range: { from, to }, points: TrendPoint[] }`.
- **No conversion at read time.** Per F4.4F doctrine: every reading carries its `engineeringUnit`; presentation conversion is a caller / future-phase concern.
- **No bucketing, no downsampling, no aggregation.** Raw rows only.
- **Single-tag only.** No multi-tag read.

The service docstring explicitly notes: "F4.6 will decide whether to reintroduce a materialized view / projection for higher-throughput bucketed reads." F4.6F-0 is that decision.

### 5.4 Frontend consumption (compatibility awareness only)

- `apps/web/lib/api-data/f4/telemetry.ts` — F4 adapter, mock-default, switchable to live API via `NEXT_PUBLIC_RVF_DATA_SOURCE=api`. Wired in F4.5E (commit `6af42fa`).
- `apps/web/lib/api/f4/` — typed client.
- Operations charts on the live console still render from the F2 simulator + F3 mock (per master roadmap §6).

**No frontend file is in F4.6F.1 scope.** The F4.5E adapter is forward-compatible with response-shape additions that are strict supersets (i.e., new optional fields don't break it). F4.6F.1 must take care: if the response shape changes in a non-additive way for bucketed responses, the existing adapter's `TelemetryTrendsResponse` consumer needs to be updated — but that update is a per-screen migration task, **not** part of F4.6F.1.

### 5.5 Tests

- `apps/backend/src/telemetry/trends.service.spec.ts` — 5 tests (mocked Prisma). Established the mock pattern the F4.6B.1 / F4.6C.1 / F4.6D.1 / F4.6E.1 spec families inherited.

### 5.6 What does NOT exist

- No bucketing parameter, no aggregation function selection, no multi-tag read, no continuous-aggregate / materialized-view consumption.
- No "since last seen at" cursor or pagination — current API tops out at `limit=5000`.
- No TimescaleDB-specific surface (`time_bucket`, `time_bucket_gapfill`, hypertable, continuous aggregate).
- No rate limit, no auth.
- No frontend Operations chart cut over to the live API.

## 6. Proposed F4.6F.1 Implementation Boundary

F4.6F.1 **extends** the existing `/api/v1/telemetry/trends` endpoint — does not replace it, does not introduce a sibling route — with **optional bucketing**. The default (no `bucket` parameter) behavior is preserved verbatim from F4.4F so existing callers (including the F4.5E mock-backed adapter and any future live-API call) keep working.

### 6.1 In-scope for F4.6F.1

- **New optional query parameter `bucket`** (Zod enum). Allowed values: one of a small fixed set — see §7.4. When omitted, the endpoint returns raw points exactly as F4.4F does today. When present, the endpoint returns bucketed points.
- **New optional query parameter `aggregate`** (Zod enum). Allowed values: `'avg' | 'min' | 'max' | 'count' | 'first' | 'last'`. Required when `bucket` is present; rejected when `bucket` is absent. Each request picks **one** aggregation (multi-aggregation per request is deferred — see §14).
- **New optional query parameter `qualityPolicy`** (Zod enum). Allowed values: `'good_only' | 'include_uncertain' | 'include_all'`. Default: `'good_only'` for bucketed requests (matches the F4.6C.1 projection convention — only `good` flows into derived state). For raw (non-bucketed) requests, no change vs. F4.4F's `quality` filter behavior — when `qualityPolicy` is supplied without `bucket` it is rejected as ambiguous.
- **Bucketed-response shape extension.** A new optional `buckets: BucketPoint[]` field on the response (alongside the existing `points` field), populated only when `bucket` was supplied. The existing `points` field is `[]` for bucketed responses (no raw rows). Per-bucket shape: `{ bucketStart: Date, bucketEnd: Date, value: number | null, sampleCount: number }`. `value` is `null` for buckets with `sampleCount === 0` after the quality filter (no points in the window). See §7.5 for the full shape decision.
- **Server-side bucketing via plain PostgreSQL `date_trunc`** + `GROUP BY` — see §7.4 for the bucket → `date_trunc` mapping. No TimescaleDB, no continuous aggregates, no rollup table.
- **Limit and validation extensions** (see §10).
  - Default bucket-count limit: 1500 buckets per request. Configurable via constant `TRENDS_BUCKETS_MAX`.
  - Reject requests where `(to - from) / bucket > TRENDS_BUCKETS_MAX` with a clear Zod error.
  - Raw-mode `limit` retains its current semantics (1..5000, default 1000).
- **Tenant scoping seam preserved.** `CallerContext.tenantId` continues to govern the `where: { tenantId? }` filter; no change to the F4.4 posture.
- **Documentation update on the controller's `@ApiOperation`** to describe the new parameters and Swagger entries via `@ApiQuery`.
- **Tests** — extension of `trends.service.spec.ts` with ~8–10 new mocked-Prisma tests covering bucketed paths (each aggregate; each bucket size at least once; quality-policy variants; the new validation errors), plus ~3 controller-level Zod validation tests (XOR `bucket` ↔ `aggregate`; bucket-count cap; `qualityPolicy` without `bucket` rejected). Existing 5 F4.4F service tests stay green unchanged. Expected total: ~16–18 trends-specific tests, bringing the backend suite to ~185–190 (was 173/173).

### 6.2 Out-of-scope (deferred — see §14)

Multi-tag reads in a single request; multi-aggregation in a single request; `time_bucket` / `time_bucket_gapfill` (TimescaleDB-specific); materialized view / continuous-aggregate / rollup table; cursor / `since` pagination beyond the existing `limit`; downsampling on raw mode (raw stays raw — bucketing IS the downsampling primitive); auth; rate limiting; frontend per-screen migration of the Operations chart; conversion to canonical units at read time.

### 6.3 What F4.6F.1 explicitly does **not** touch

- `apps/backend/prisma/schema.prisma` — no model change.
- `apps/backend/prisma/migrations/` — no new migration.
- `apps/backend/prisma/seed.f4.ts` — no seed change. (F4.3 still does not seed `telemetry_readings`; the response remains `{ points: [] }` or `{ buckets: [] }` on a stack without F4.6B.1 ingestion exercised.)
- `apps/backend/src/telemetry/ingestion/`, `apps/backend/src/telemetry/projection/`, `apps/backend/src/alarms/`, `apps/backend/src/realtime/` — no change. F4.6F.1 is read-side only.
- `apps/web/` — no frontend change. The F4.5E adapter consumes the existing response shape; the new optional `buckets` field is additive. A per-screen migration that uses bucketed reads is a separate task.
- `packages/types/` — no change. The trend API response shape is owned by the backend (`apps/backend/src/telemetry/contracts/trends.ts`), not by `@rvf/types`.
- `docker-compose.yml`, root `package.json`, lockfile, `turbo.json`, `tsconfig*.json`, `.env*`, CI config.

## 7. Query Parameters, Validation, and Response Payload

### 7.1 Preserved from F4.4F (no change)

| Parameter | Type | Notes |
|---|---|---|
| `unitId` | UUID, required | |
| `from` | ISO-8601 → `Date`, required | |
| `to` | ISO-8601 → `Date`, required | `from < to` |
| `canonicalTagId` | UUID, optional | XOR with `canonicalTagName` |
| `canonicalTagName` | string `min(1).max(64)`, optional | XOR with `canonicalTagId` |
| `jobId` | UUID, optional | |
| `quality` | enum (`good` / `uncertain` / `bad`), optional | Raw-mode point filter. Independent of the new `qualityPolicy` (see §7.3). |
| `source` | enum (10 values), optional | |
| `limit` | int `1..5000`, default `1000` | Raw-mode row cap. Ignored in bucketed mode (which uses `TRENDS_BUCKETS_MAX`). |

### 7.2 Added by F4.6F.1

| Parameter | Type | Notes |
|---|---|---|
| `bucket` | enum (see §7.4), optional | Presence switches the endpoint from raw mode to bucketed mode. |
| `aggregate` | enum `'avg' \| 'min' \| 'max' \| 'count' \| 'first' \| 'last'`, optional | **Required when `bucket` is present; rejected when `bucket` is absent.** |
| `qualityPolicy` | enum `'good_only' \| 'include_uncertain' \| 'include_all'`, optional | Bucketed-mode-only. Default: `'good_only'`. **Rejected when `bucket` is absent.** |

Validation refinements added to `TrendsQuerySchema` (Zod):

- `bucket` and `aggregate` must appear together (XOR-style refine: either both present or both absent).
- `qualityPolicy` may only be supplied when `bucket` is present.
- When `bucket` is present, the computed bucket count `ceil((to - from) / bucketMs)` must be `<= TRENDS_BUCKETS_MAX` (recommended `1500`). On overflow, the refine emits a clear message naming the requested count and the cap.

### 7.3 `quality` vs `qualityPolicy` semantics

The two parameters are distinct:

- **`quality`** (existing, raw mode) — a strict equality filter applied at the SQL `WHERE` clause. `quality=good` returns only `quality='good'` points; ignores `quality='uncertain'` and `quality='bad'`. F4.6F.1 preserves this verbatim.
- **`qualityPolicy`** (new, bucketed mode) — a *policy* governing which rows enter the aggregation. Values:
  - `'good_only'` (default): aggregate only `quality='good'` rows. Matches F4.6C.1 projection convention.
  - `'include_uncertain'`: aggregate `quality IN ('good', 'uncertain')`.
  - `'include_all'`: aggregate every row.

The two parameters cannot coexist in raw mode (rejected); in bucketed mode the existing `quality` parameter is treated as a per-row filter applied **before** `qualityPolicy`, so e.g. `quality=good` + `qualityPolicy=good_only` is redundant but allowed; `quality=bad` + `qualityPolicy=good_only` produces empty buckets.

### 7.4 Bucket sizes

Allowed `bucket` enum values, mapped to PostgreSQL `date_trunc` arguments. Fixed, small, finite enum — no arbitrary intervals (avoids unbounded `date_trunc` shapes and keeps the cap calculation simple):

| `bucket` | `date_trunc` | Bucket width (ms) | Suitable window |
|---|---|---|---|
| `'1m'` | `date_trunc('minute', timestamp)` | 60 000 | up to ~25 hours (1500 buckets) |
| `'5m'` | `date_trunc('minute', timestamp)` + arithmetic group (see note) | 300 000 | up to ~5 days |
| `'15m'` | (same) | 900 000 | up to ~15 days |
| `'1h'` | `date_trunc('hour', timestamp)` | 3 600 000 | up to ~62 days |
| `'1d'` | `date_trunc('day', timestamp)` | 86 400 000 | up to ~4 years |

**Note on `5m` / `15m`:** PostgreSQL's `date_trunc` only supports calendar-aligned units (`minute`, `hour`, `day`, …). To bucket on 5 / 15 minute intervals, F4.6F.1 will use the standard `to_timestamp(floor(extract(epoch from timestamp) / bucketSeconds) * bucketSeconds)` pattern (or `date_bin('5 minutes', timestamp, timestamp '2000-01-01')` if PostgreSQL ≥ 14 — which the TimescaleDB image `timescale/timescaledb:latest-pg16` provides — see `docker-compose.yml`). Per `docker-compose.yml` the postgres image is PG 16, so `date_bin` is available and is the preferred path.

F4.6F.1 picks `date_bin(intervalLiteral, timestamp, timestamp '2000-01-01')` (PostgreSQL 14+) for **every** bucket size for uniformity. `date_trunc` is mentioned here only as a fallback / cross-reference.

### 7.5 Response payload shape

Three rules:

1. **Raw mode (no `bucket`)** — response shape is **unchanged** from F4.4F. `points` is populated; new fields `buckets`, `aggregate`, `bucket` are absent or `undefined`.
2. **Bucketed mode (`bucket` present)** — `points` is `[]` (or omitted; F4.6F.1 picks one — recommendation: `points: []` to keep the shape stable for clients that always read it). `buckets`, `aggregate`, `bucket`, `qualityPolicy` are populated.
3. **Headers shared:** `unitId`, `canonicalTag { id, name, displayName, canonicalUnit, category, precision }`, `range { from, to }`.

Bucketed-point shape:

```ts
export interface BucketPoint {
  bucketStart: Date;          // ISO-8601 — left edge (inclusive)
  bucketEnd: Date;            // ISO-8601 — right edge (exclusive)
  value: number | null;       // aggregated value; null when sampleCount === 0
  sampleCount: number;        // rows that entered the aggregation (post quality / quality-policy filter)
}
```

`value` is a JSON number rather than a `Decimal`-as-string because aggregation already returns a number from PostgreSQL (`AVG`, `MIN`, `MAX`, `COUNT` are all numeric). For `'first'` / `'last'` (Decimal values from the row), F4.6F.1 may choose to stringify for precision or to convert to number — the plan recommends **convert to number** for consistency across aggregates, with the caveat that callers needing full precision should use raw mode.

Full response interface (extends the existing `TrendsResponse`):

```ts
export interface TrendsResponse {
  unitId: string;
  canonicalTag: { id: string; name: string; displayName: string; canonicalUnit: string; category: string; precision: number };
  range: { from: Date; to: Date };
  // Raw mode:
  points: TrendPoint[];           // empty array when in bucketed mode
  // Bucketed mode (F4.6F.1 additions; all optional):
  bucket?: '1m' | '5m' | '15m' | '1h' | '1d';
  aggregate?: 'avg' | 'min' | 'max' | 'count' | 'first' | 'last';
  qualityPolicy?: 'good_only' | 'include_uncertain' | 'include_all';
  buckets?: BucketPoint[];
}
```

### 7.6 Empty / gap behavior

When the aggregation produces no rows for a bucket (no readings in the window, or filtered out by `quality` / `qualityPolicy`), F4.6F.1 **emits a row with `sampleCount: 0, value: null`** rather than omitting the bucket. The full continuous bucket grid from `from` to `to` is returned. Reasoning: callers (charts especially) need to render gaps explicitly — silent omission of empty buckets makes the chart misleading.

This requires the implementation to LEFT JOIN against a generated bucket series (`generate_series(...)`), not just `GROUP BY date_bin(...)`. Standard PostgreSQL pattern.

## 8. How Historical Trends Complement F4.6E.1 Realtime Push

F4.6F.1 is **not** a replacement for the F4.6E.1 push, and the push is not a replacement for trend reads. They sit at different latencies and different scopes:

| Concern | Trend read (F4.6F.1) | Latest-value (candidate F4.6C.2) | Realtime push (F4.6E.1) |
|---|---|---|---|
| **Storage backing** | `telemetry_readings` (canonical, append-only) | `live_readings` (one row per `(unit, sensor, tag)`) | None (in-memory fan-out) |
| **Time scope** | A specific `[from, to)` window | "now" — the most recent good reading per metric | Each commit, as it happens |
| **Caller pull / push** | Pull (HTTP request) | Pull (HTTP request) | Push (Socket.IO emit) |
| **Recovery semantics** | Re-request the same window | Re-request the metric set | REST reconnect → trend / latest reads cover the gap |
| **Cost** | One range scan per call (bounded by index + limit) | One indexed point lookup per metric | Constant per-emit (no DB) |
| **Quality filter default** | None on raw mode; `good_only` on bucketed mode | `good` only (per F4.6C.1 projection) | Push every accepted reading + every projection write + every alarm create |
| **Gap behavior** | Empty bucket grid returned (gaps visible) | Stale row stays; client uses `timestamp` to detect freshness | No gap concept — emits when committed |

Recommended Operations chart pattern (informational — F4.6F.1 does **not** ship the chart):

```text
On mount:
   ── GET /api/v1/telemetry/trends?unitId=...&from=NOW-1h&to=NOW&bucket=1m&aggregate=avg
   ── (optional) GET /api/v1/telemetry/latest?... [candidate F4.6C.2]
   ── socket.emit('subscribe', { tenantId })

While mounted:
   ── socket.on('telemetry.reading.accepted', payload => store.append(payload))
   ── socket.on('alarm.event.created', payload => overlay.markAlarm(payload))

On reconnect / focus / window resize:
   ── re-issue the bucket request for the gap window, append to the store
```

This is operator-driven design — F4.6F-0 does not commit to it as a contract.

## 9. Relationship to Future F4.6C.2 Latest-value Endpoint

**Yes, still relevant.** F4.6C.2 (named in F4.6E-0 §15 candidate-follow-ups and F4.6D-0 §15) would expose `live_readings` over `GET /api/v1/telemetry/latest` (or equivalent). It is **independent of F4.6F.1** — it reads a different table, returns a different shape, addresses a different operational concern.

**Sequencing:** F4.6F.1 does not depend on F4.6C.2. Either may ship first; both are useful independently:

- An Operations dashboard that shows trend charts but no large numeric tile displays may need only F4.6F.1.
- A control-room overview with large "current value" tiles per metric may need F4.6C.2 first (cheaper than asking the trend endpoint for the most recent bucket).

**Constraint:** F4.6F.1 should not preempt F4.6C.2's URL space. The plan reserves `/api/v1/telemetry/latest` for F4.6C.2 (or whatever F4.6C.2's plan picks); F4.6F.1 stays on `/api/v1/telemetry/trends` and only extends its query parameters.

**Documentation:** F4.6F.1 closeout should mention F4.6C.2 in a "candidate follow-ups" section so future readers understand why trend reads do not also serve "current value."

## 10. Performance, Indexing, and Limits

### 10.1 Existing index is sufficient

The `(unit_id, canonical_tag_id, timestamp DESC)` btree index (`telemetry_readings_unit_tag_time_idx`) is the access path for both the existing raw-mode F4.4F query and the F4.6F.1 bucketed-mode query. The bucketed query's typical shape:

```sql
SELECT
  date_bin('1 minute', "timestamp", '2000-01-01'::timestamp) AS bucket_start,
  AVG("value") AS agg_value,
  COUNT(*) AS sample_count
FROM telemetry_readings
WHERE unit_id = $1
  AND canonical_tag_id = $2
  AND "timestamp" >= $3
  AND "timestamp" < $4
  AND quality = 'good'           -- when qualityPolicy = 'good_only'
GROUP BY bucket_start
ORDER BY bucket_start ASC;
```

PostgreSQL will use the existing index for the `WHERE` filter; the `GROUP BY date_bin(...)` is an in-memory aggregation over the matched rows. No new index needed.

The bucket-grid LEFT JOIN (per §7.6) uses `generate_series('from'::timestamptz, 'to'::timestamptz - '1 microsecond'::interval, '1 minute'::interval)` and is a small CPU-only operation (1500 rows max).

### 10.2 Limits

- **`TRENDS_LIMIT_MAX = 5000`** (existing, raw mode). Unchanged.
- **`TRENDS_LIMIT_DEFAULT = 1000`** (existing, raw mode). Unchanged.
- **`TRENDS_BUCKETS_MAX = 1500`** (new, bucketed mode). Rationale: a typical chart pixel-width is 800–1200; 1500 buckets per request is a comfortable upper bound that resists abuse without breaking common cases (24 hours at 1-minute bucket = 1440; 5 days at 5-minute = 1440; etc.).
- **Per-request memory ceiling:** the bucketed path holds at most `TRENDS_BUCKETS_MAX` rows of intermediate state plus the raw rows accumulating in the aggregator. The raw count is bounded by the time window, the (unit, tag) filter, and PostgreSQL's working memory — F4.6F.1 does not introduce a separate raw-row cap on bucketed mode (the aggregator processes in PostgreSQL, not in Node).

### 10.3 Validation that bites early

The bucket-count overflow check happens in Zod (`refine` on the parsed query), not in PostgreSQL. A 10-year window with `bucket='1m'` (~5.2M buckets) is rejected by Zod before any DB call.

Raw-mode `limit` enforcement stays as the F4.4F `take: limit` semantics — PostgreSQL stops after `limit` rows.

### 10.4 When to add a materialized view / continuous aggregate

**Not in F4.6F.1.** A continuous aggregate (TimescaleDB) or a manually-maintained rollup table (`telemetry_readings_1m`, etc.) becomes worth considering only if profiling shows the live aggregate is too slow under realistic load. Triggers for that future phase (candidate name: **F4.6F.2 — Trend Aggregation Projection**):

- Sustained ingestion > 1k samples/second/tenant.
- Multiple Operations dashboards open per tenant simultaneously.
- Bucket queries on multi-month windows exceeding ~500ms p95.

None of these are observed today. F4.6F.1 ships the live aggregate; F4.6F.2 candidate is named only as a forward-compat seam.

## 11. Security / Isolation

F4.6F.1 inherits the project-wide no-auth posture (matches REST + WebSocket today):

- **Tenant scoping seam preserved** — the F4.4 `CallerContext.tenantId` continues to govern the `where: { tenantId? }` filter. Today every request runs as `SystemContext` (no tenant filter); a future auth phase replaces `SystemContext` with an authenticated `CallerContext { tenantId }` without changing the service code.
- **Strict Zod schema** — `.strict()` rejects unknown query parameters (already F4.4F). F4.6F.1's new fields slot into the same `.strict()` posture.
- **No auth** — same posture as ingestion, alarms, realtime fan-out. Candidate **ADR-009** + dedicated phase owns auth across REST + WebSocket uniformly.
- **No rate limiting** — same posture as the rest of the read API. The bucket-count cap and `limit` cap defend memory; rate limiting defends throughput and is a separate concern.
- **No payload-trusted identity fields** — the response carries canonical RVF state only; no operator-supplied identity leaks back.

## 12. Non-Goals

Explicitly **out of scope** for F4.6F.1, each with the phase that should own it:

- **Multi-tag reads in a single request.** F4.6F.1 stays single-tag (one of `canonicalTagId` / `canonicalTagName`). Candidate sub-phase **F4.6F.2 — Multi-tag Trend Read** if a chart needs several series in one call.
- **Multi-aggregation in a single request.** One `aggregate` per call. If a screen needs avg + min + max for the same bucket, today it issues three calls. Candidate F4.6F.3 if traffic shows this is hot.
- **TimescaleDB adoption** (`time_bucket`, `time_bucket_gapfill`, hypertable, continuous aggregate). ADR-007 §4 keeps Timescale optional. F4.6F.1 uses plain-PostgreSQL `date_bin`.
- **Materialized view / continuous aggregate / rollup table.** Candidate **F4.6F.2 — Trend Aggregation Projection** only if profiling demands it.
- **Cursor / `since` pagination.** Raw-mode `limit` is the only pagination today. Bucketed mode does not paginate (the bucket cap is the ceiling). A real cursor primitive can be added later if a screen needs windows wider than `TRENDS_BUCKETS_MAX` at the finest resolution.
- **Downsampling on raw mode.** Raw mode stays raw — bucketing IS the downsampling primitive.
- **Conversion to canonical units at read time.** F4.4F doctrine preserved: the response carries `engineeringUnit` per row / per bucket header; presentation conversion is a caller concern.
- **Frontend per-screen migration of the Operations chart.** Part of F4.5G+ once a chart actually consumes the bucketed endpoint.
- **Auth / rate limit.** ADR-009 + dedicated phase.
- **Sensor-level reads** (per-sensor trend ignoring `canonical_tag_id`). Not in the request shape; sensor identity is observable in raw-mode point rows but the access path is canonical-tag-first.
- **Alarm-event range scan** (akin to a `/api/v1/alarms` history). Owned by candidate **F4.6D.2 — Alarm Events Read API**.
- **Schema / migration changes.** F4.6F.1 ships behavior only; the existing `telemetry_readings` schema and indexes are sufficient.

## 13. Test Plan

### 13.1 New backend tests

**`apps/backend/src/telemetry/trends.service.spec.ts` — ~8–10 new mocked-Prisma cases:**

| # | Test | Asserts |
|---|---|---|
| (existing 5) | F4.4F raw-mode coverage — preserved unchanged | Range scan; XOR tag resolution; quality / source filters; empty result; limit cap. |
| 6 | `bucket='1m', aggregate='avg'` runs the `date_bin` group query | Prisma `$queryRaw` (or `findMany` + in-memory) invoked with the expected SQL fragment / bucket interval; response carries `buckets[]` with the expected `bucketStart` cadence. |
| 7 | `bucket='5m', aggregate='min'` | Same shape; aggregate function reflected in SQL. |
| 8 | `bucket='1h', aggregate='max'` | Same. |
| 9 | `bucket='1d', aggregate='count'` | `count` returns integer; the rest unchanged. |
| 10 | `aggregate='first'` returns the earliest reading per bucket | Tested as a separate aggregate path. |
| 11 | `aggregate='last'` returns the latest reading per bucket | Same. |
| 12 | `qualityPolicy='good_only'` (default) filters out `quality != 'good'` rows | SQL `WHERE` contains the quality filter; assertion at the query-shape level. |
| 13 | `qualityPolicy='include_uncertain'` allows `quality IN ('good', 'uncertain')` | Same. |
| 14 | `qualityPolicy='include_all'` runs without a quality filter | Same. |
| 15 | Empty buckets (`sampleCount=0, value=null`) appear in the grid for windows with no rows | Bucket-grid LEFT JOIN behavior asserted. |

**Controller-level Zod tests (in the existing `trends.service.spec.ts` or a sibling controller spec):**

| # | Test | Asserts |
|---|---|---|
| 16 | `bucket` without `aggregate` → Zod refine error | Clear error message. |
| 17 | `aggregate` without `bucket` → Zod refine error | Same. |
| 18 | `qualityPolicy` without `bucket` → Zod refine error | Same. |
| 19 | Bucket-count overflow (`(to - from)/bucketMs > TRENDS_BUCKETS_MAX`) → Zod refine error naming the requested count and the cap | Same. |

### 13.2 Tests preserved from earlier phases (must stay green)

- 22 ingestion tests (F4.6B.1) + 11 projection tests (F4.6C.1) + 9 ingestion-projection integration tests (F4.6C.1) + 21 alarm tests (F4.6D.1) + 8 ingestion-alarm tests (F4.6D.1) + 1 refined isolation test (F4.6D.1) + 10 emitter tests (F4.6E.1) + 11 gateway tests (F4.6E.1) + 12 ingestion-realtime tests (F4.6E.1) + 5 existing trends tests + 69 baseline = **173/173 baseline**.
- F4.6F.1 adds ~10–15 new tests bringing the total to **~185–190**.
- No existing test should require modification; the F4.6F.1 changes are additive.

### 13.3 What F4.6F-0 itself runs

**Nothing.** This is a docs-only plan phase. DX-3 §"Documentation-only phases" prescribes only `git status` and `git diff --stat` confirming only `docs/` (and the closeout file itself) changed.

### 13.4 Validation commands the F4.6F.1 closeout will run

Per DX-3 §"Runtime phases":

- `pnpm --filter @rvf/backend exec prisma validate`
- `pnpm --filter @rvf/backend exec prisma generate` (no change expected)
- `pnpm --filter @rvf/backend run lint -- --max-warnings 0`
- `pnpm --filter @rvf/backend run typecheck`
- `pnpm --filter @rvf/backend run build`
- `pnpm --filter @rvf/backend run test`
- Workspace `pnpm lint` / `typecheck` / `build`.

## 14. Risks and Guardrails

| Risk | Mitigation |
|---|---|
| **F4.6F.1 absorbs frontend per-screen migration.** The Operations chart cutover is tempting to bundle with the API extension. | §6.2 / §12 explicitly defer the per-screen migration. Reviewer rejects any PR that bundles a frontend chart change with the F4.6F.1 endpoint extension. |
| **Bucket count grows unbounded for naive callers.** A 10-year window with `bucket='1m'` is a denial-of-service. | `TRENDS_BUCKETS_MAX` Zod refine bites in the controller before any DB call. Error message names the requested count and the cap so the caller can pick a coarser bucket or a narrower window. |
| **Materialized-view / continuous-aggregate creep.** "We could just add a `telemetry_readings_1m` table" sounds tempting. | Out of scope (§12). Materialized state is a separate phase (candidate F4.6F.2) gated by real profiling data, not by speculation. |
| **TimescaleDB creep.** `time_bucket` / `time_bucket_gapfill` is more ergonomic than `date_bin`. | ADR-007 §4 keeps Timescale optional. `date_bin` (PG 14+) is in the image we run (PG 16 via `timescale/timescaledb:latest-pg16`). Sticking with plain PostgreSQL preserves the "no Timescale dependency" guarantee F4 has held since the F4.1 schema. |
| **Multi-tag reads are tempting "while we're here."** | Out of scope (§12). The response-shape implications (one canonicalTag header vs. many; one buckets[] vs. many) materially change the contract. Candidate F4.6F.2 owns it. |
| **Conversion-to-canonical-unit creep at read time.** | F4.4F doctrine preserved — every row / bucket carries `engineeringUnit`; presentation is a caller concern. F4.6F.1 closeout calls this out explicitly. |
| **Decimal-precision loss in `'first'` / `'last'` aggregates.** Bucketed `'first'` / `'last'` return one row's `value` — converting to JSON number could lose precision past ~15 significant digits. | F4.6F.1 picks "convert to number" for consistency across aggregates and documents the precision caveat in the contract. Callers that need full precision use raw mode. |
| **Empty-bucket grid surprises charts.** Returning `value: null, sampleCount: 0` rows lets a chart draw gaps explicitly, but a chart written for "compact only" mode might rendered NaN. | The bucketed response is a strict superset; a chart is free to filter `sampleCount > 0` client-side. Documented in the §7.6 / §10 closeout sections. |
| **F4.6F.1 silently breaks the F4.5E adapter** by changing the raw-mode shape. | F4.6F.1 must add only additive optional fields to the response; the raw-mode shape stays byte-identical to F4.4F. Asserted by the existing 5 F4.4F service tests (they fail if the raw-mode shape changes). |
| **Quality / qualityPolicy combination ambiguity.** | §7.3 specifies that raw mode uses `quality` only, bucketed mode uses `qualityPolicy` (default `'good_only'`), and supplying `qualityPolicy` in raw mode is rejected at validation time. |
| **`generate_series` LEFT JOIN performance.** For 1500 buckets the cost is trivial; for a future F4.6F.1' that raises the cap to (say) 100k buckets, this would need profiling. | F4.6F.1 caps at 1500. The future-raise scenario lands in its own plan. |
| **Tenant scoping forgotten.** F4.4F includes `tenantId?` in the where; F4.6F.1's bucketed path must too. | Tests #6–#15 assert the where clause shape includes `tenantId` when `ctx.tenantId` is set, mirroring the F4.4F #1 / #2 pattern. |
| **Raw-mode tests inadvertently broken.** | Existing 5 F4.4F tests stay verbatim; F4.6F.1 adds new tests beneath them. The mock harness pattern (typed `vi.fn()` per Prisma method) extends additively. |
| **Mocked-Prisma posture leaves real-DB aggregation unverified.** Same posture as F4.6B.1 / F4.6C.1 / F4.6D.1 / F4.6E.1. | A live-DB integration test for `date_bin` / `generate_series` / quality-policy filtering is a candidate cross-phase deliverable (master roadmap §10), not F4.6F.1 scope. |

## 15. Acceptance Criteria for F4.6F.1

F4.6F.1 is complete when **all** of the following are true:

- [ ] `apps/backend/src/telemetry/contracts/trends.ts` adds the new optional Zod fields (`bucket`, `aggregate`, `qualityPolicy`) and the new constants (`TRENDS_BUCKETS_MAX`); existing fields are unchanged.
- [ ] `TrendsQuerySchema` enforces: `bucket` ↔ `aggregate` XOR-pair; `qualityPolicy` only when `bucket` present; bucket-count cap when `bucket` present.
- [ ] `apps/backend/src/telemetry/trends.service.ts` branches on `query.bucket`: when undefined, behaves verbatim as F4.4F today; when defined, runs the bucketed `date_bin` aggregation with the bucket-grid LEFT JOIN and returns `buckets[]` + the bucket-mode header fields.
- [ ] Aggregation functions implemented: `avg`, `min`, `max`, `count`, `first`, `last`.
- [ ] Quality policies implemented: `good_only` (default), `include_uncertain`, `include_all`.
- [ ] Empty-bucket rows (`sampleCount: 0, value: null`) emitted for windows with no rows (asserted by test #15).
- [ ] Raw-mode response shape is byte-identical to F4.4F (existing 5 service tests stay green unchanged).
- [ ] Tenant scoping seam preserved — bucketed-mode `where` clause includes `tenantId?` when `ctx.tenantId` is set.
- [ ] No Prisma schema / migration / seed change. No `apps/web/` change. No `packages/types/` change. No `docker-compose.yml` / root `package.json` / lockfile / `turbo.json` / `tsconfig*.json` / `.env*` / CI change.
- [ ] Controller `@ApiOperation` description and `@ApiQuery` entries updated to describe the new parameters. Swagger reflects the new query surface.
- [ ] DX-3 §"Runtime phases" validation surface passes end to end: `prisma validate` / `generate`, backend `lint -- --max-warnings 0` / `typecheck` / `build` / `test` (expected ~185–190 tests), workspace `lint` / `typecheck` / `build`.
- [ ] F4.6F.1 closeout report exists at `docs/architecture/RVF_Malinois_F4_6F_1_Historical_Trend_API_Closeout.md`, follows the established closeout structure, reports the final test count, and flags any deviation from this plan.
- [ ] Master roadmap §3 / §7 refresh — deferred to a small follow-up hygiene commit per the established pattern.

## 16. Recommended Next Step

**Next step after F4.6F-0: F4.6F.1 — Historical Trend API Implementation.** Plan-first → implementation per the codified DX-3 pattern. Scope per §6; bucketing semantics per §7; complementary-read positioning per §8 / §9; performance / limits per §10; tests per §13; acceptance per §15.

After F4.6F.1, the Master Roadmap §7 sequence continues:

- **F4.5G — Resume per-screen UI migrations** (Wells, Equipment, Catalog, …). The Operations chart screen migration can now wire all three reads together: F4.6F.1 trend reads on mount + on reconnect, candidate F4.6C.2 latest-value reads (if it lands first) for tile widgets, F4.6E.1 realtime push for tail updates.

Candidate follow-ups specific to the trend track, named here so they have a place to land:

- **F4.6F.2 — Multi-tag Trend Read** (if a chart needs several canonical tags in one call).
- **F4.6F.3 — Multi-aggregation Trend Read** (if a screen needs avg + min + max for the same bucket in one call).
- **F4.6F.4 — Trend Aggregation Projection** (materialized view / continuous aggregate / rollup table — gated by real profiling demonstrating the live aggregate is too slow).

These are named, not committed to. The next implementation phase is **F4.6F.1**.

---

*F4.6F-0 plan, authored at HEAD `29efb7f` (Refresh master roadmap after F4.6E.1). Plan-only. Update on phase close (`Current` → `Closed` with commit hash) and when F4.6F.1 lands its closeout.*
