# RVF Malinois — F4.6F.1 Historical Trend API Closeout

> Phase **F4.6F.1 — Historical Trend API Implementation**. Extends the existing F4.4F `GET /api/v1/telemetry/trends` endpoint with optional server-side bucketing.
>
> Implements the F4.6F-0 plan (commit `db86735`). Per the project's commit/push discipline this closeout ships alongside the implementation; the task brief instructs **not to commit yet**.
>
> Upstream references:
> - F4.6F-0 plan: `docs/architecture/RVF_Malinois_F4_6F_Historical_Trend_API_Plan.md` (commit `db86735`).
> - Master roadmap (most recent refresh): `docs/architecture/RVF_Malinois_Master_Roadmap.md` (commit `5996496`).
> - F4.4F closeout (the endpoint this phase extends): `docs/architecture/RVF_Malinois_F4_4F_Telemetry_API_Reactivation_Report.md` (commit `5e92a13`).
> - F4.5E closeout (frontend adapter wired to the endpoint): `docs/architecture/RVF_Malinois_F4_5E_Telemetry_Trends_API_Wiring_Report.md` (commit `6af42fa`).
> - F4.6E.1 closeout (realtime push the trend API complements): `docs/architecture/RVF_Malinois_F4_6E_1_WebSocket_SSE_Fan_Out_Closeout.md` (commit `51dc626`).
> - ADR-007 (Database Foundation, TimescaleDB optional): `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md`.
> - DX-3 (Definition of Done): `docs/operations/RVF_Malinois_Definition_of_Done.md` (commit `65cb736`).

## 1. Purpose

F4.6F.1 implements the bucketed-read extension defined in F4.6F-0. The existing `GET /api/v1/telemetry/trends` endpoint gains three optional query parameters (`bucket`, `aggregate`, `qualityPolicy`) that switch the response from raw range-scan rows to server-side aggregated buckets. The raw-mode behavior is preserved byte-identical — the F4.5E frontend adapter, the existing 5 raw-mode service tests, and any other consumer of the F4.4F shape keep working without changes.

The bucketing path runs entirely in plain PostgreSQL (`date_bin` + `generate_series` LEFT JOIN). No TimescaleDB feature is used; no migration is added; no new index is required; no materialized view / continuous aggregate / rollup table is introduced. The `(unit_id, canonical_tag_id, timestamp DESC)` index from F4 §F is the access path for both modes.

## 2. Scope Implemented

- **Contract extensions** at `apps/backend/src/telemetry/contracts/trends.ts`:
  - New tuples: `TRENDS_BUCKETS` (`'1m' | '5m' | '15m' | '1h' | '1d'`), `TRENDS_AGGREGATES` (`'avg' | 'min' | 'max' | 'count' | 'first' | 'last'`), `TRENDS_QUALITY_POLICIES` (`'good_only' | 'include_uncertain' | 'include_all'`).
  - New constants: `TRENDS_BUCKET_MS` (per-bucket-size width in milliseconds, used by the cap-overflow refine), `TRENDS_BUCKETS_MAX = 1500`.
  - `TrendsQuerySchema` extended with optional `bucket` / `aggregate` / `qualityPolicy` fields.
  - **Three new `.refine()` validators**: `bucket` ↔ `aggregate` must appear together; `qualityPolicy` rejected when `bucket` absent; bucket-count overflow (`Math.ceil((to - from) / bucketMs) > TRENDS_BUCKETS_MAX`) rejected with a clear message naming the requested count and the cap.
  - `TrendsResponse` interface extended with optional `bucket`, `aggregate`, `qualityPolicy`, `buckets: TrendBucket[]` fields (absent in raw mode).
  - New `TrendBucket` interface: `{ bucketStart: Date, bucketEnd: Date, value: number | null, sampleCount: number }`.

- **Service branching** at `apps/backend/src/telemetry/trends.service.ts`:
  - When `input.bucket === undefined` — runs the F4.4F `findMany` path verbatim; response shape byte-identical to F4.4F.
  - When `input.bucket` is set — runs `runBucketedQuery(...)` (new private method) using `prisma.$queryRaw` with a `Prisma.sql` composition.
  - SQL composition: `date_bin(interval, ts, '2000-01-01'::timestamp)` for bucket binning; `generate_series(...)` LEFT JOIN for empty-bucket emission; aggregate expression composed from a server-controlled `Prisma.sql` switch (no user input reaches the aggregate function name); tenant / job / quality / source / quality-policy filters composed conditionally as `Prisma.sql` / `Prisma.empty` fragments.
  - Result rows are mapped from snake_case raw rows to the camelCase `TrendBucket` interface; Decimal-typed values are coerced to JS `Number` for consistency across aggregates; bigint sample counts are coerced to `Number`.

- **Controller Swagger update** at `apps/backend/src/telemetry/telemetry.controller.ts`:
  - `@ApiOperation` description updated to describe both modes, the validation refines, the bucket cap, and the on-empty-DB behavior.
  - Three new `@ApiQuery` entries for `bucket`, `aggregate`, `qualityPolicy` with `enum` lists drawn from the contract tuples.

- **Spec extension** at `apps/backend/src/telemetry/trends.service.spec.ts`:
  - Existing 5 F4.4F raw-mode tests **preserved verbatim** (functionality / shape unchanged).
  - Mock harness extended with `$queryRaw` (default returns `[]`).
  - 8 new bucketed-mode service tests: bucketed-avg path; aggregate value coercion to `Number` (parametrized over `min` / `max` / `count` / `first` / `last`); empty-bucket rows preserved through the parser; `qualityPolicy` default + explicit-policy parametrized; response shape (raw-mode metadata absent); tenant filter preserved on the bucketed path.
  - 10 new Zod-validation tests (controller-level): bucket without aggregate / aggregate without bucket / qualityPolicy without bucket all rejected; invalid bucket / aggregate enum values rejected; bucket-count overflow rejected with the expected error message; upper-bound count (exactly `TRENDS_BUCKETS_MAX`) accepted; invalid date range still rejected (F4.4F refine preserved); well-formed bucketed-mode and raw-mode queries both accepted.
  - Plus 4 carry-forward assertion additions inside the existing F4.4F tests (assert raw mode does **not** populate the new bucketed-mode response fields).

## 3. Architecture Decision

Reaffirms and exercises the platform-ownership principles already locked by ADR-006 / ADR-007 / ADR-008 / F4.6F-0:

- **Read API hardened against canonical state only.** The bucketed path reads `telemetry_readings` directly. It never reads `live_readings` (which is a single-row latest-value projection per `(unit, sensor, tag)`; no history), never reads the Socket.IO push stream (which is in-memory fan-out, not durable storage), and never reads a frontend mock.
- **Plain PostgreSQL, no TimescaleDB.** ADR-007 §4 keeps Timescale optional. F4.6F.1 uses `date_bin` (PG 14+; present in the running PG 16 image `timescale/timescaledb:latest-pg16` per `docker-compose.yml`). No `time_bucket`, no `time_bucket_gapfill`, no hypertable, no continuous aggregate.
- **No materialized state.** No rollup table, no materialized view, no caching layer. Reads compute buckets at query time. A future phase (candidate F4.6F.4) may add a materialized projection only if profiling demonstrates the live aggregate is too slow.
- **Raw-mode contract preserved.** F4.4F response shape is byte-identical; F4.5E frontend adapter (mock-default, switchable to live API) keeps working; existing 5 service tests remain unchanged.
- **Plan-first locked the design.** F4.6F.1 implements F4.6F-0 (§6 / §7 / §10 / §15) without redesign.

ADR-008 remains **Proposed**. F4.6F.1 exercises the read side of the canonical telemetry contract (ADR-008 §3 decision 5: "derived state is rebuildable from canonical state") but does not change the proposal status — a live-DB integration suite remains the outstanding precondition for graduation (per master roadmap §10 risk table).

## 4. Files Changed

| Path | Action | Notes |
|---|---|---|
| `apps/backend/src/telemetry/contracts/trends.ts` | **Modified.** | New tuples (`TRENDS_BUCKETS`, `TRENDS_AGGREGATES`, `TRENDS_QUALITY_POLICIES`), new constants (`TRENDS_BUCKET_MS`, `TRENDS_BUCKETS_MAX`), three new `.refine()` validators, extended `TrendsResponse` interface, new `TrendBucket` interface. Legacy F4.4F fields and their refines preserved verbatim. |
| `apps/backend/src/telemetry/trends.service.ts` | **Modified.** | Branches on `input.bucket`; the F4.4F path is unchanged. New `runBucketedQuery(...)` private method runs a `Prisma.$queryRaw` with `date_bin` + `generate_series` LEFT JOIN. New `aggregateExpression(...)` and `qualityPolicyFilter(...)` private helpers compose the SQL fragments. New `BUCKET_INTERVAL_LITERAL` const map provides the PostgreSQL `interval` string per allowed bucket enum value (server-controlled, never user input). |
| `apps/backend/src/telemetry/telemetry.controller.ts` | **Modified.** | Updated `@ApiOperation` description; three new `@ApiQuery` entries for `bucket` / `aggregate` / `qualityPolicy`. No route change. |
| `apps/backend/src/telemetry/trends.service.spec.ts` | **Modified.** | 5 existing F4.4F tests preserved verbatim (with 4 small additive assertions confirming raw-mode response carries no bucketed-mode metadata). 8 new bucketed-mode service tests. 10 new Zod-validation tests. Mock harness extended with `$queryRaw`. |
| `docs/architecture/RVF_Malinois_F4_6F_1_Historical_Trend_API_Closeout.md` | **New.** | This document. |

No other file modified, created, or deleted. Explicitly:

- No `apps/backend/prisma/schema.prisma` change.
- No `apps/backend/prisma/migrations/` change.
- No `apps/backend/prisma/seed.f4.ts` change.
- No file under `apps/backend/src/{tenants,wells,equipment,jobs,tags,health,alarms,realtime}/`.
- No file under `apps/backend/src/telemetry/{ingestion,projection}/`.
- No file under `apps/web/`.
- No `packages/` change.
- No `docker-compose.yml`, root `package.json`, lockfile, `turbo.json`, `tsconfig*.json`, `.env*`, CI workflow, or `vitest.config.ts` change.

## 5. API Contract

### 5.1 Route (unchanged)

`GET /api/v1/telemetry/trends`

### 5.2 Query parameters

**Preserved from F4.4F (unchanged):**

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `unitId` | UUID | yes | |
| `from` | ISO-8601 → `Date` | yes | |
| `to` | ISO-8601 → `Date` | yes | `from < to` |
| `canonicalTagId` | UUID | optional | XOR with `canonicalTagName` |
| `canonicalTagName` | string `1..64` | optional | XOR with `canonicalTagId` |
| `jobId` | UUID | optional | |
| `quality` | enum `good` / `uncertain` / `bad` | optional | Per-row strict-equality filter (raw and bucketed mode) |
| `source` | enum (10 values) | optional | |
| `limit` | int `1..5000`, default `1000` | optional | Raw-mode row cap; ignored in bucketed mode |

**Added by F4.6F.1:**

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `bucket` | enum `1m` / `5m` / `15m` / `1h` / `1d` | optional | Presence switches the endpoint to bucketed mode. |
| `aggregate` | enum `avg` / `min` / `max` / `count` / `first` / `last` | optional | **Required when `bucket` is present; rejected when `bucket` is absent.** |
| `qualityPolicy` | enum `good_only` / `include_uncertain` / `include_all` | optional | **Bucketed-mode only.** Default `good_only`. Rejected when `bucket` is absent. |

### 5.3 Validation refines

- `from < to` (preserved F4.4F).
- Exactly one of `canonicalTagId` / `canonicalTagName` (preserved F4.4F).
- `bucket` ↔ `aggregate` must appear together (new).
- `qualityPolicy` only when `bucket` present (new).
- Bucket count `ceil((to - from) / bucketMs) <= TRENDS_BUCKETS_MAX` (new). Error message names the requested count and the cap.

### 5.4 Response shape

**Raw mode (no `bucket`):** byte-identical to F4.4F.

```ts
{
  unitId: string,
  canonicalTag: { id, name, displayName, canonicalUnit, category, precision },
  range: { from: Date, to: Date },
  points: TrendPoint[],   // populated
  // bucket / aggregate / qualityPolicy / buckets — absent
}
```

**Bucketed mode (`bucket` + `aggregate` present):**

```ts
{
  unitId: string,
  canonicalTag: { id, name, displayName, canonicalUnit, category, precision },
  range: { from: Date, to: Date },
  points: [],             // empty array — shape stable for destructuring clients
  bucket: '1m' | '5m' | '15m' | '1h' | '1d',
  aggregate: 'avg' | 'min' | 'max' | 'count' | 'first' | 'last',
  qualityPolicy: 'good_only' | 'include_uncertain' | 'include_all',
  buckets: Array<{
    bucketStart: Date,          // ISO-8601 — left edge (inclusive)
    bucketEnd: Date,            // ISO-8601 — right edge (exclusive)
    value: number | null,       // null when sampleCount === 0
    sampleCount: number,        // rows that entered the aggregator
  }>,
}
```

### 5.5 Error responses (Zod validation)

All Zod refines surface via Nest's `BadRequestException` (HTTP 400), routed through the existing `ZodValidationPipe` from `apps/backend/src/common/zod-validation.pipe.ts`. Error messages are operator-friendly and name the offending field path.

## 6. Bucketing / Aggregation Semantics

### 6.1 Bucket binning

Implemented via PostgreSQL `date_bin(intervalLiteral::interval, "timestamp", '2000-01-01'::timestamp)`. The `'2000-01-01'` anchor is constant across all bucket sizes so bucket boundaries are deterministic and stable across requests / replicas.

Allowed bucket sizes and their interval literals (server-controlled, never user input):

| `bucket` | Interval literal | Bucket width (ms) |
|---|---|---|
| `1m` | `'1 minute'` | 60 000 |
| `5m` | `'5 minutes'` | 300 000 |
| `15m` | `'15 minutes'` | 900 000 |
| `1h` | `'1 hour'` | 3 600 000 |
| `1d` | `'1 day'` | 86 400 000 |

### 6.2 Bucket grid (empty-bucket emission)

A `WITH bucket_grid AS (SELECT generate_series(date_bin(interval, from, anchor), to - '1 microsecond'::interval, interval) AS bucket_start)` CTE generates every bucket between `from` and `to`. The bucket grid is LEFT JOINed against the aggregation CTE so buckets with no matching rows emit `value: null, sampleCount: 0` (per F4.6F-0 §7.6).

The `- '1 microsecond'` boundary on the `generate_series` end keeps the bucket immediately before `to` from spilling past the requested window when `to` falls exactly on a bucket boundary.

### 6.3 Aggregation expressions

| `aggregate` | SQL expression | Result |
|---|---|---|
| `avg` | `AVG("value")` | numeric → JS `Number` |
| `min` | `MIN("value")` | numeric → JS `Number` |
| `max` | `MAX("value")` | numeric → JS `Number` |
| `count` | `COUNT(*)::numeric` | numeric → JS `Number` (also reflected in `sampleCount`) |
| `first` | `(array_agg("value" ORDER BY "timestamp" ASC))[1]` | numeric → JS `Number` |
| `last` | `(array_agg("value" ORDER BY "timestamp" DESC))[1]` | numeric → JS `Number` |

**Precision caveat (per F4.6F-0 §14):** `first` / `last` return a single row's `value`, which is stored as `Decimal`. The bucketed response converts to `Number` for consistency across aggregates; callers needing full Decimal precision should use raw mode (which returns Decimal-as-string through `Decimal.toJSON`).

### 6.4 Quality semantics

Two parameters that interact cleanly:

- **`quality`** (existing F4.4F) — strict-equality per-row filter. Works in both modes. `quality=good` selects only `quality='good'` rows from `telemetry_readings`.
- **`qualityPolicy`** (new, bucketed-mode only) — policy governing which selected rows enter the aggregation:
  - `good_only` (default) — adds `AND quality = 'good'` to the SQL `WHERE`.
  - `include_uncertain` — adds `AND quality IN ('good', 'uncertain')`.
  - `include_all` — adds no quality filter.

When both are supplied, `quality` is applied first (per-row strict equality), then `qualityPolicy` (additional filter). A `quality=good` + `qualityPolicy=good_only` is redundant but allowed; `quality=bad` + `qualityPolicy=good_only` produces empty buckets.

### 6.5 Tenant scoping

Identical to F4.4F: when `ctx.tenantId` is set on `CallerContext`, the bucketed SQL composition includes `AND tenant_id = ${ctx.tenantId}::uuid`. When unset, reads are cross-tenant (the SystemContext default). The seam is preserved by the same mechanism the F4.4F raw path uses; the bucketed path uses a conditional `Prisma.sql` fragment instead of a Prisma `where` clause but the contract is identical.

### 6.6 Ordering

`ORDER BY bg.bucket_start ASC` on the outer query. Buckets are always returned in ascending chronological order (oldest first), matching the raw-mode `orderBy: { timestamp: 'asc' }` posture.

## 7. Database / Migration Impact

**No migration added.** Every artifact the implementation needs already exists:

- `telemetry_readings` table — F4.2B baseline migration (`20260524000000_f4_2_baseline`) + F4.6A.1 hardening (`20260526000000_f4_6a_telemetry_hardening`).
- `telemetry_readings_unit_tag_time_idx` on `(unit_id, canonical_tag_id, timestamp DESC)` — F4.2B baseline.
- `telemetry_readings_tenant_time_idx` on `(tenant_id, timestamp DESC)` — F4.2B baseline.
- `date_bin` PostgreSQL built-in — available in PG 14+; running PG 16 (`timescale/timescaledb:latest-pg16` per `docker-compose.yml`).
- `generate_series` PostgreSQL built-in — available since PG 8.x.
- `array_agg` PostgreSQL built-in — used for `first` / `last` aggregates.

`prisma validate` passes; no schema or migration delta. DX-2 (Local DB Migration Validation Procedure) does not need to run for this phase — there is nothing to validate.

## 8. API / Frontend Impact

### 8.1 No new public API

The route stays `GET /api/v1/telemetry/trends`. No parallel endpoint introduced. Swagger documents the extended query surface.

### 8.2 Frontend compatibility

- `apps/web/lib/api-data/f4/telemetry.ts` (F4.5E adapter, mock-default, switchable to live API) is **unchanged and remains compatible.** The raw-mode response shape is byte-identical to F4.4F; the new bucketed-mode fields are all optional. The existing `TelemetryTrendsResponse` consumer continues to read `points`.
- A future per-screen migration that consumes bucketed reads (candidate part of F4.5G+; Operations chart cutover from F2 simulator) will need an adapter update — but that update is **out of scope for F4.6F.1**.
- Operations charts on the live console still render from the F2 simulator + F3 mock per master roadmap §6. F4.6F.1 ships the server-side primitive; the cutover is a separate frontend task.

### 8.3 No shared-types change

The trend API response shape is owned by the backend (`apps/backend/src/telemetry/contracts/trends.ts`), not by `@rvf/types`. The new `TrendBucket` / `TrendsBucket` / `TrendsAggregate` / `TrendsQualityPolicy` types live in the backend contracts file.

## 9. Tests / Validation

### 9.1 Tests added

| File | Net new tests | Coverage |
|---|---|---|
| `apps/backend/src/telemetry/trends.service.spec.ts` | **+18** (5 existing F4.4F tests preserved verbatim + 4 small additive assertions on F4.4F raw-mode response shape + 8 new bucketed-mode service tests + 10 new Zod-validation tests; uses parametrized `it.each` for aggregate-coercion and qualityPolicy-echo cases) | Bucketed-avg invokes `$queryRaw`; aggregate value coercion to `Number` (min / max / count / first / last); empty buckets preserved through parser; qualityPolicy default + explicit echo; bucketed response shape; tenant filter preserved on bucketed path; controller-level Zod refines (bucket↔aggregate XOR, qualityPolicy-without-bucket, bucket-count overflow, invalid enums, upper-bound count accepted, invalid date range still rejected, well-formed both-modes queries accepted). |

### 9.2 Test totals

| Metric | Before F4.6F.1 (`5996496`) | After F4.6F.1 |
|---|---|---|
| Backend spec files | 15 | 15 (unchanged — extensions to existing file) |
| Backend tests passing | 173 / 173 | **195 / 195** (+22) |

The 22-test delta matches F4.6F-0 §6.1's "~16–18 trends-specific tests" projection plus the 4 small carry-forward assertions inside the existing F4.4F tests (each F4.4F test gained one assertion that the raw-mode response carries no bucketed-mode metadata — these aren't separate test cases but they prove the byte-identical-shape claim).

### 9.3 Validation commands run

| Command | Result |
|---|---|
| `pnpm --filter @rvf/backend exec prisma validate` | ✅ "The schema at prisma/schema.prisma is valid 🚀" — no schema or migration delta. |
| `pnpm --filter @rvf/backend run lint` | ✅ clean (`--max-warnings 0`) — fixed two findings during development (`non-nullable-type-assertion-style` and `consistent-type-definitions`); chose a runtime guard over `!` to avoid the dueling-lint-rules trap. |
| `pnpm --filter @rvf/backend run typecheck` | ✅ clean (src + prisma tsconfigs). |
| `pnpm --filter @rvf/backend run build` | ✅ `nest build` clean. |
| `pnpm --filter @rvf/backend run test` | ✅ **195/195 across 15 spec files**. |
| `pnpm run lint` (workspace) | ✅ clean; backend re-ran fresh, others cached. |
| `pnpm run typecheck` (workspace) | ✅ clean; same. |
| `pnpm run build` (workspace) | ✅ clean; web cached (no frontend change), backend fresh. |

DX-3 §"Runtime phases" validation surface fully exercised.

## 10. Known Limitations / Deferred Work

Each of these has a dedicated future phase or stays explicitly out of F4.6F.1 scope (per F4.6F-0 §12):

- **No multi-tag reads in a single request.** Single canonical tag per call (XOR `canonicalTagId` / `canonicalTagName`). Candidate sub-phase **F4.6F.2 — Multi-tag Trend Read**.
- **No multi-aggregation in a single request.** One `aggregate` per call. Candidate **F4.6F.3**.
- **No TimescaleDB adoption.** ADR-007 §4 keeps Timescale optional; F4.6F.1 uses plain-PostgreSQL `date_bin`. No `time_bucket` / `time_bucket_gapfill` / hypertable / continuous aggregate anywhere in the implementation.
- **No materialized view / continuous aggregate / rollup table.** Reads compute buckets at query time. Candidate **F4.6F.4** only if profiling shows the live aggregate is too slow.
- **No cursor / `since` pagination.** Raw-mode `limit` is the only pagination today; bucketed mode does not paginate (the cap is the ceiling). A real cursor primitive can be added later if a screen needs windows wider than `TRENDS_BUCKETS_MAX` at the finest resolution.
- **No downsampling on raw mode.** Raw mode stays raw — bucketing IS the downsampling primitive.
- **No conversion to canonical units at read time.** F4.4F doctrine preserved: every row / bucket carries `engineeringUnit` (raw mode) or assumes the canonical tag's unit (bucketed mode header); presentation conversion is a caller concern.
- **No frontend per-screen migration of the Operations chart.** F4.5G+ owns this task.
- **No authentication / authorization.** Inherits the project-wide no-auth posture. Candidate ADR-009 + dedicated phase owns auth across REST and WebSocket uniformly.
- **No rate limiting per request / per IP / per tenant.** Same future-phase concern as auth.
- **No live-DB integration test** for `date_bin` / `generate_series` / quality-policy filtering / `array_agg` ordering. Same mocked-Prisma posture as F4.6B.1 / F4.6C.1 / F4.6D.1 / F4.6E.1. A real-DB integration suite is a candidate cross-phase deliverable (master roadmap §10), not F4.6F.1 scope.
- **Precision caveat on `first` / `last`** — Decimal source values coerced to JS `Number` for response consistency. Callers needing full Decimal precision should use raw mode.

## 11. Acceptance Criteria

Per F4.6F-0 §15. Every criterion below has been confirmed:

- [x] `apps/backend/src/telemetry/contracts/trends.ts` adds the new optional Zod fields (`bucket`, `aggregate`, `qualityPolicy`) and the new constants (`TRENDS_BUCKETS_MAX`, `TRENDS_BUCKET_MS`); existing fields are unchanged.
- [x] `TrendsQuerySchema` enforces: `bucket` ↔ `aggregate` XOR-pair; `qualityPolicy` only when `bucket` present; bucket-count cap when `bucket` present (asserted by Zod-validation tests).
- [x] `apps/backend/src/telemetry/trends.service.ts` branches on `query.bucket`: when undefined, behaves verbatim as F4.4F today; when defined, runs the bucketed `date_bin` aggregation with the bucket-grid LEFT JOIN and returns `buckets[]` + the bucket-mode header fields.
- [x] Aggregation functions implemented: `avg`, `min`, `max`, `count`, `first`, `last`.
- [x] Quality policies implemented: `good_only` (default), `include_uncertain`, `include_all`.
- [x] Empty-bucket rows (`sampleCount: 0, value: null`) emitted for windows with no rows (asserted by service test).
- [x] Raw-mode response shape is byte-identical to F4.4F (existing 5 service tests stay green unchanged; new carry-forward assertions confirm bucket/aggregate/qualityPolicy/buckets are absent in raw mode).
- [x] Tenant scoping seam preserved — bucketed-mode SQL composition includes `tenant_id = ${ctx.tenantId}::uuid` when `ctx.tenantId` is set (asserted by service test).
- [x] No Prisma schema / migration / seed change. No `apps/web/` change. No `packages/types/` change. No `docker-compose.yml` / root `package.json` / lockfile / `turbo.json` / `tsconfig*.json` / `.env*` / CI change.
- [x] Controller `@ApiOperation` description and `@ApiQuery` entries updated to describe the new parameters. Swagger reflects the new query surface.
- [x] DX-3 §"Runtime phases" validation surface passes end to end: `prisma validate` / `generate`, backend `lint -- --max-warnings 0` / `typecheck` / `build` / `test` (**195/195**), workspace `lint` / `typecheck` / `build`.
- [x] F4.6F.1 closeout report exists at `docs/architecture/RVF_Malinois_F4_6F_1_Historical_Trend_API_Closeout.md` (this document), follows the established closeout structure, reports the final test count, and flags any deviation from the plan.
- [ ] Master roadmap §3 / §7 refresh — **deferred to a small follow-up hygiene commit** (see §12). Cleaner to keep this commit "code + closeout" only; the roadmap update is a one-file documentation edit best done in its own commit after the F4.6F.1 commit lands.

## 12. Recommended Next Step

**Two follow-ups in order, both small:**

1. **Master roadmap hygiene refresh.** Flip F4.6F.1 from *"Next"* → **Closed** with the F4.6F.1 commit hash in §3; remove F4.6F.1 from §7's numbered sequence (it becomes the new "already closed" preamble entry); promote **F4.5G** from *Pending / Parallelizable* → **Next** (or whatever the chosen next phase is); update §2's "Historical trend API" row from *Planned* to populated/closed; update §5 with the new capability bullet + test count. Mirror the pattern used after F4.6D-0 (commit `66bfc79`), F4.6D.1 (commit `637724c`), F4.6E-0 (commit `cf97943`), F4.6E.1 (commit `29efb7f`), F4.6F-0 (commit `5996496`). Documentation-only, ~30 lines diff.

2. **F4.5G — Resume per-screen UI migrations.** Per master roadmap §7. The Operations chart screen migration can now wire all three reads together: F4.6F.1 trend reads on mount + on reconnect, candidate F4.6C.2 latest-value reads (when it lands) for tile widgets, F4.6E.1 realtime push (`telemetry.reading.accepted` / `live_reading.updated` / `alarm.event.created`) for tail updates. Other non-telemetry screen migrations (Wells, Equipment, Catalog, Tags, Settings) can proceed in parallel from the existing F4.5B / F4.5C adapter base.

Candidate follow-ups specific to the trend track, named in F4.6F-0 §16 but not on the main sequence:

- **F4.6F.2 — Multi-tag Trend Read** (if a chart needs several canonical tags in one call).
- **F4.6F.3 — Multi-aggregation Trend Read** (if a screen needs avg + min + max for the same bucket in one call).
- **F4.6F.4 — Trend Aggregation Projection** (materialized view / continuous aggregate / rollup table — gated by real profiling demonstrating the live aggregate is too slow).

These are named so they have a place to land. None is committed to as part of F4.6F.1.

---

*F4.6F.1 closeout, authored at HEAD `5996496` (Refresh master roadmap after F4.6F-0). Implementation commit pending per the task brief's "do not commit" instruction. Update on commit (replace "pending" with the F4.6F.1 commit hash) and again when the roadmap hygiene commit lands.*
