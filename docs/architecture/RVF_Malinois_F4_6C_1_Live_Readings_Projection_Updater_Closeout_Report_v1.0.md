# RVF Malinois F4.6C.1 — Live Readings Projection Updater Closeout Report v1.0

> Phase **F4.6C.1 — Live Readings Projection Updater Implementation**. First backend phase authorized to write `prisma.liveReading.*`.
>
> Upstream references:
> - F4.6 architecture: `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Architecture.md` (commit `c12a29c`)
> - ADR-008 (Proposed): `docs/adr/ADR-008_RVF_Malinois_Telemetry_Persistence_Ingestion.md` (commit `c12a29c`)
> - F4.6 closeout: `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Closeout_Report_v1.0.md` (commit `334bfc5`)
> - F4.6A.0 plan: `docs/architecture/RVF_Malinois_F4_6A_Schema_Hardening_Plan.md` (commit `014df37`)
> - F4.6A.1 migration closeout: `docs/architecture/RVF_Malinois_F4_6A_1_Schema_Hardening_Migration_Closeout_Report_v1.0.md` (commit `6be7842`)
> - F4.6B-0 plan: `docs/architecture/RVF_Malinois_F4_6B_Ingestion_Boundary_Plan.md` (commit `c4ea18a`)
> - F4.6B.1 closeout: `docs/architecture/RVF_Malinois_F4_6B_1_Ingestion_Boundary_Skeleton_Closeout_Report_v1.0.md` (commit `1495457`)
> - Master Roadmap (DX-1): `docs/architecture/RVF_Malinois_Master_Roadmap.md` (commit `b19e77a`)
> - Local DB Migration Validation Procedure (DX-2): `docs/operations/RVF_Malinois_Local_DB_Migration_Validation_Procedure.md` (commit `e3ccb52`)
> - Definition of Done (DX-3): `docs/operations/RVF_Malinois_Definition_of_Done.md` (commit `65cb736`)
> - F4.6C-0 plan (the gate this phase implements): `docs/architecture/RVF_Malinois_F4_6C_Live_Readings_Projection_Updater_Plan.md` (commit `f126c5c`)

## 1. Executive Summary

F4.6C.1 implements the F4.6C-0 plan. It introduces `LiveReadingsProjectionService` — the **first backend collaborator authorized to write `prisma.liveReading.*`** — and wires it into the ingestion boundary as the last step of the per-sample `accepted` flow. The canonical `telemetry_readings` insert and the `live_readings` projection upsert now share the same Prisma interactive transaction (`prisma.$transaction(async (tx) => { … })`), guaranteeing they commit together or roll back together.

The projection is **strictly gated** at every layer the plan called for:

- **Quality gate**: only `quality === 'good'` ever reaches the projection. `uncertain` and `bad` readings persist to `telemetry_readings` (canonical historical truth) but never update `live_readings`. The gate lives both at the call site inside `TelemetryIngestionService` (skipping the projection invocation for non-good) and inside the projection service itself (returning `skipped_quality` as a defensive second line).
- **Timestamp watermark**: a row updates only when the incoming `timestamp` is **strictly newer** than the stored row's `timestamp`. Equal timestamps do not overwrite (no tie-breaker is introduced in F4.6C.1). Late readings — those whose timestamp is older than the stored projection — persist as canonical rows but never overwrite the projection. Implemented via `updateMany WHERE timestamp < incoming.timestamp`, with a `findUnique` follow-up to distinguish `skipped_equal_timestamp` from `skipped_stale` from `created`.
- **Projection key**: `(unit_id, sensor_id, canonical_tag_id)` — the F4.6A.1 `live_readings_unit_sensor_tag_uk` natural key. Transmitter-first / sensor-first identity preserved per ADR-008 §3 decision 4. Composite-unique Prisma accessor: `unitId_sensorId_canonicalTagId`.
- **Race safety**: a P2002 conflict during the create branch (another transaction landed a row between this transaction's `findUnique` and `create`) triggers a retry via the same watermark-gated `updateMany`. If the retry still finds the stored row newer or equal, the final outcome is `skipped_stale` / `skipped_equal_timestamp` (the race-creator's row wins).
- **Transaction failure → rollback + quarantine**: if the projection writer throws an unexpected error inside the transaction, the canonical `telemetry_readings` insert rolls back and the outer ingestion catch surfaces the sample as `rejected_quarantined` with `reason='mapping_engine_failure'` (an existing F4.6A.1 CHECK enum value — **no new reasons introduced**).

Every isolation invariant from F4.6B.1 carries forward — F4.6C.1 still does not write `alarm_events`, does not modify `apps/backend/src/realtime/`, does not emit WebSocket / SSE, does not introduce external bridges, does not perform any Jobs lookup, and does not touch Prisma schema or migrations. The existing `live_readings_projection` SQL VIEW remains preserved verbatim (non-destructive coexistence per F4.6A.0 §5.E and F4.6C-0 §14).

All quality gates pass: backend `prisma validate`, `prisma generate`, `lint` (clean, `--max-warnings 0`), `typecheck`, `build`, and `test` (**111 / 111 across 12 spec files**, +20 net new tests from the F4.6B.1 baseline of 91). Workspace-wide `lint` / `typecheck` / `build` green. Web build target cached (FULL TURBO) — frontend untouched.

ADR-008 remains **Proposed**. F4.6C.1 is the second sub-phase exercising ADR-008's principles in code, after F4.6B.1. The Master Roadmap should move F4.6C from "Upcoming" to "Closed" when this commit lands.

## 2. Commit Context

This report records the *intended* commit for F4.6C.1. Per the project's commit/push discipline, the closeout doc ships with the implementation; the brief instructs **not to commit yet**.

| Commit | Title |
|---|---|
| `c12a29c` | Add F4.6 telemetry persistence architecture ADR |
| `334bfc5` | Add F4.6 telemetry persistence closeout report |
| `014df37` | Add F4.6A schema hardening plan |
| `6be7842` | Add F4.6A telemetry schema hardening migration |
| `c4ea18a` | Add F4.6B ingestion boundary plan |
| `1495457` | Add F4.6B telemetry ingestion boundary skeleton |
| `b19e77a` | Add RVF Malinois master roadmap |
| `e3ccb52` | Add local DB migration validation procedure |
| `65cb736` | Add RVF Malinois definition of done |
| `f126c5c` | Add F4.6C live readings projection plan |
| *(pending)* | Add F4.6C live readings projection updater (this work) |

## 3. Files Changed

| Path | Action | Notes |
|---|---|---|
| `apps/backend/src/telemetry/projection/live-readings-projection.service.ts` | **New.** | The projection service. ~220 lines including documentation. Race-safe `updateMany` → `findUnique` → `create` upsert pattern with P2002 retry. |
| `apps/backend/src/telemetry/projection/live-readings-projection.service.spec.ts` | **New.** | 11 mocked-Prisma vitest tests covering each outcome (`created`, `updated`, `skipped_stale`, `skipped_equal_timestamp`, `skipped_quality`) plus race-safety paths and key fidelity. |
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.ts` | **Modified.** | Imports `LiveReadingsProjectionService` and accepts it in the constructor. The `try { telemetryReading.create } catch { dedup }` block is rewrapped in `prisma.$transaction(async (tx) => { … })`; the projection updater is invoked inside the transaction only when `sample.quality === 'good'`. P2002 catch logic for the dedup classifier remains outside the transaction (unchanged behavior). |
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.module.ts` | **Modified.** | Adds `LiveReadingsProjectionService` to `providers`. No new module file. No exports changed. |
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` | **Modified.** | Extends the F4.6B.1 spec with: a `$transaction` mock that passes through the prisma shape; mocked `LiveReadingsProjectionService` injected into the service; 9 new tests covering projection integration (accepted-good calls projection, accepted-uncertain/bad do not, duplicate/conflict/rejected do not, projection failure → rollback + `mapping_engine_failure`, $transaction wraps create + projection). Existing 22 F4.6B.1 tests still pass unchanged in semantics; test #17 refined to "ingestion service does not call `prisma.liveReading.*` directly (delegates to projection)". |
| `docs/architecture/RVF_Malinois_F4_6C_1_Live_Readings_Projection_Updater_Closeout_Report_v1.0.md` | **New.** | This document. |

No other file modified, created, or deleted. Explicitly:

- No file under `apps/web/`.
- No file under `apps/backend/src/realtime/`.
- No file under `apps/backend/src/{tenants,wells,equipment,jobs,tags,health}/`.
- No `apps/backend/prisma/schema.prisma` change.
- No `apps/backend/prisma/migrations/` change.
- No `apps/backend/prisma/seed.f4.ts` change.
- No `package.json`, lockfile, `turbo.json`, `tsconfig*.json`, `vitest.config.ts`, `eslint.config.mjs`, `docker-compose.yml`, CI workflow, or `packages/` change.

## 4. Runtime Behavior Implemented

### 4.1 `LiveReadingsProjectionService.updateFromAcceptedTelemetry(input, client?)`

Single public method. Returns one of five internal outcomes (not a public API contract):

| Outcome | Meaning |
|---|---|
| `created` | New `live_readings` row inserted; returns `{ outcome: 'created', liveReadingId }`. |
| `updated` | Existing row updated via the watermark-gated `updateMany`. |
| `skipped_quality` | Incoming quality is `uncertain` or `bad`; no DB call made. |
| `skipped_stale` | Existing row's stored timestamp is strictly newer than incoming. |
| `skipped_equal_timestamp` | Existing row's stored timestamp equals incoming. No tie-breaker. |

The method accepts an optional `client: Prisma.TransactionClient` so the projection participates in the ingestion service's `$transaction`. If `client` is omitted, the constructor-injected `PrismaService` is used (test seam).

### 4.2 Per-sample flow inside `TelemetryIngestionService.processSample`

Before F4.6C.1:

```
try {
  const created = await this.prisma.telemetryReading.create({...});
  return accepted;
} catch (err) {
  if (P2002) return classifyDedup(...);
  throw err;
}
```

After F4.6C.1:

```
try {
  const created = await this.prisma.$transaction(async (tx) => {
    const row = await tx.telemetryReading.create({...});
    if (sample.quality === 'good') {
      await this.projection.updateFromAcceptedTelemetry(
        { telemetryReadingId: row.id, tenantId, unitId, sensorId, canonicalTagId,
          value, engineeringUnit, quality: 'good', timestamp, source, ingestionTimestamp },
        tx,
      );
    }
    return row;
  });
  return accepted;
} catch (err) {
  if (P2002) return classifyDedup(...);  // dedup classifier unchanged
  throw err;                              // surfaces as mapping_engine_failure via outer catch
}
```

The `classifyDedup` path (catching `Prisma.PrismaClientKnownRequestError` code `P2002` from `telemetry_readings_dedup_seq_uk` / `telemetry_readings_dedup_ts_uk`) is unchanged from F4.6B.1. The projection's own race path (P2002 on `live_readings_unit_sensor_tag_uk`) is handled **inside** `LiveReadingsProjectionService`, so the dedup classifier never sees it.

### 4.3 Outcome × projection-invocation matrix

| Ingestion outcome | Projection updater called? | Why |
|---|---|---|
| `accepted` + `quality === 'good'` | **Yes**, exactly once | The authorized scope. |
| `accepted` + `quality === 'uncertain'` | No | Quality gate at call site (and defensive gate inside service). |
| `accepted` + `quality === 'bad'` | No | Same as above. |
| `duplicate` (P2002, identical existing) | No | No canonical row was inserted; projection state already correct. |
| `conflict_quarantined` (P2002, different existing) | No | No canonical row was inserted. |
| `rejected_quarantined` (any reason) | No | No canonical row was inserted. |
| `rejected_request` | No | Wire validation rejects before processing. |

Tests #23–#31 verify every row.

## 5. Projection Ownership

Per F4.6C-0 §5 — **Option B: dedicated backend-owned `LiveReadingsProjectionService`** under the telemetry domain. Confirmed:

- Lives at `apps/backend/src/telemetry/projection/`.
- Sibling of the existing `apps/backend/src/telemetry/ingestion/` directory.
- Backend-owned. No external dependency. No DB trigger. No generic projection framework.
- **No new Nest module** authored. The service is registered as a provider of `TelemetryIngestionModule` (the existing module gained one entry in its `providers` array).
- No HTTP controller. No public API. Internal collaborator only.
- No `ProjectionUpdater` abstraction interface — F4.6C.1 ships a concrete class, not a scaffold for future F4.6D / F4.6E hooks. Each future phase will design its own collaborator at its own time.

## 6. Quality Gate

Per F4.6C-0 §8 — **Option A: only `quality === 'good'` updates `live_readings`**.

Two-layer gate:

1. **Call site** (`TelemetryIngestionService.processSample`): the projection updater is invoked only when `sample.quality === 'good'`. Non-good readings skip the call entirely — no DB work, no projection method invocation. Verified by tests #24, #25.
2. **Defensive gate inside the service** (`LiveReadingsProjectionService.updateFromAcceptedTelemetry`): if invoked with a non-`good` quality (defensive — should not happen given the call-site gate, but second-line correctness matters), the service returns `{ outcome: 'skipped_quality' }` without making any DB call. Verified by tests #5, #6 in the projection spec.

`uncertain` and `bad` readings still persist to `telemetry_readings` as canonical historical truth — F4.6C.1 only gates the projection, never the canonical insert.

## 7. Timestamp Watermark

Per F4.6C-0 §9 — strict `new.timestamp > stored.timestamp`.

- **No row exists** → `create` (no watermark applies on the first row). Outcome `created`.
- **`incoming.timestamp > stored.timestamp`** → `updateMany WHERE timestamp < incoming.timestamp` returns count 1 → outcome `updated`.
- **`incoming.timestamp === stored.timestamp`** → `updateMany` returns count 0; `findUnique` reveals the equal timestamp → outcome `skipped_equal_timestamp`. **No tie-breaker.**
- **`incoming.timestamp < stored.timestamp`** (late arrival) → `updateMany` returns count 0; `findUnique` reveals a newer stored timestamp → outcome `skipped_stale`.

Late readings still land in `telemetry_readings` (the canonical insert is independent of the watermark) but never overwrite `live_readings`. Verified by projection spec test #3.

## 8. Projection Key

Per F4.6C-0 §10 — `(unit_id, sensor_id, canonical_tag_id)`. This is the F4.6A.1 `live_readings_unit_sensor_tag_uk` UNIQUE constraint. The Prisma composite-unique accessor (generated from the field-name list) is `unitId_sensorId_canonicalTagId`.

The key:

- Preserves physical-instrument identity (`sensor_id`) per ADR-008 §3 decision 4 (transmitter-first).
- Preserves semantic measurement identity (`canonical_tag_id`).
- Carries `unit_id` for UI scoping convenience (denormalized; the join is otherwise one-hop via `sensor`).
- **Does not** use `job_id` (Jobs deferred — F4.6A.1 schema deliberately has no `job_id` column on `live_readings`).

Verified by projection spec test #9.

## 9. Upsert / Race-Safety Strategy

Per F4.6C-0 §12 — race-safe composed sequence:

1. **`liveReading.updateMany`** with the natural-key WHERE plus `timestamp: { lt: incoming.timestamp }`. The Prisma return shape is `{ count: number }`.
   - `count === 1` → return `updated`.
   - `count === 0` → fall through to step 2.
2. **`liveReading.findUnique`** by `unitId_sensorId_canonicalTagId`. If a row exists, distinguish `skipped_stale` (stored newer) vs `skipped_equal_timestamp` (stored equal). If no row exists, fall through to step 3.
3. **`liveReading.create`** with all fields populated. Wrapped in `try/catch` for `P2002`.
   - Success → return `{ outcome: 'created', liveReadingId }`.
   - `P2002` (race: another transaction created the row between step 2 and step 3) → fall through to step 4.
4. **Re-run** `updateMany` with the same watermark predicate.
   - `count === 1` → return `updated`.
   - `count === 0` → `findUnique` once more. Distinguish `skipped_equal_timestamp` from `skipped_stale`.

This sequence is race-safe under PostgreSQL's read-committed default isolation: the second `updateMany` sees the row that committed first. The cost of a race is one extra round-trip. Verified by projection spec tests #8 (race → `updated`) and #8b (race → `skipped_stale`).

The pattern is **chosen over** PostgreSQL `INSERT … ON CONFLICT … DO UPDATE WHERE` (also documented in F4.6C-0 §12.4 as an acceptable alternative). The Prisma-idiomatic composed sequence keeps the code testable with mocked Prisma; the raw-SQL alternative would require `$executeRaw` and a different test strategy. Either is correct; F4.6C.1 picked the Prisma-idiomatic path.

## 10. Ingestion Integration

Per F4.6C-0 §7 — same per-sample transactional unit.

The canonical `telemetry_readings` insert and the `live_readings` projection upsert now share **one Prisma interactive transaction** per accepted sample with `quality === 'good'`:

```ts
const created = await this.prisma.$transaction(async (tx) => {
  const row = await tx.telemetryReading.create({ /* … */ });
  if (sample.quality === 'good') {
    await this.projection.updateFromAcceptedTelemetry({ /* … */ }, tx);
  }
  return row;
});
```

### 10.1 Transactional commit / rollback semantics

- **Happy path**: both commit together. The canonical row exists; the projection reflects it (created, updated, or skipped per the watermark / quality rules).
- **Canonical insert fails with P2002**: the entire transaction rolls back (no projection write happens because the `tx.telemetryReading.create` threw before the projection call). The outer `try/catch` in `TelemetryIngestionService.processSample` catches the P2002 and routes to `classifyDedup` (unchanged from F4.6B.1). Outcome: `duplicate` or `conflict_quarantined`.
- **Projection updater throws unexpectedly inside the transaction** (non-P2002 error from `LiveReadingsProjectionService` — e.g. a DB connection drop): the transaction rolls back. The outer `try/catch` does **not** match `P2002` (the error is not a `Prisma.PrismaClientKnownRequestError` with code `P2002`), so it propagates to the outer per-sample handler in `ingestBatch`, which wraps it in a `mapping_engine_failure` quarantine row. The canonical row never commits; the sample's outcome is `rejected_quarantined`. Verified by test #30.
- **Projection updater throws P2002 (race on `live_readings_unit_sensor_tag_uk`)**: handled inside `LiveReadingsProjectionService` (§9 step 4). The error never escapes the projection service, so the outer dedup classifier does not see it. This prevents a spurious `conflict_dedup` quarantine row from being written when the conflict is actually on the projection table, not on `telemetry_readings`.

### 10.2 What the ingestion service does NOT do

The ingestion service **never calls `prisma.liveReading.*` directly**. Test #17 (refined in F4.6C.1) asserts this against all four model methods (`create`, `upsert`, `updateMany`, `findUnique`). The projection service is the only authorized caller; the ingestion service delegates to it via DI.

This preserves the F4.6B.1 architectural invariant — the ingestion boundary's job is ingestion + quarantine, the projection's job is projection — and keeps the two services independently testable.

## 11. Tests and Validation Performed

### 11.1 Test counts

| File | Tests (before) | Tests (after) | Δ |
|---|---|---|---|
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` | 22 | 31 | **+9** |
| `apps/backend/src/telemetry/projection/live-readings-projection.service.spec.ts` | — | 11 | **+11** |
| All other spec files | 69 | 69 | 0 |
| **Backend total** | **91** | **111** | **+20** |

All 12 spec files green. F4.6B.1's 22 ingestion tests remain valid (semantics preserved across the `$transaction` rewrap); the new tests cover projection integration; the new projection spec covers the service's own contract.

### 11.2 Validation matrix (DoD §8 / §13)

| Command | Result |
|---|---|
| `pnpm --filter @rvf/backend exec prisma validate` | `The schema at prisma/schema.prisma is valid 🚀` |
| `pnpm --filter @rvf/backend exec prisma generate` | clean (Prisma Client v5.22.0) |
| `pnpm --filter @rvf/backend run lint` | clean (0 errors, 0 warnings, `--max-warnings 0`) |
| `pnpm --filter @rvf/backend run typecheck` | clean (src + prisma) |
| `pnpm --filter @rvf/backend run build` | clean (`nest build`) |
| `pnpm --filter @rvf/backend run test` | **111 passed / 111** across 12 spec files. Duration ~1.64s. |
| `pnpm run lint` (workspace) | 4 / 4 successful |
| `pnpm run typecheck` (workspace) | 4 / 4 successful |
| `pnpm run build` (workspace) | 2 / 2 successful (web cached, untouched) |

### 11.3 Pre-validation status (per phase brief)

Before F4.6C.1 began, the pre-validation already completed:

- `prisma migrate status` — database schema is up to date.
- `prisma validate` — schema is valid.
- `prisma generate` — client generated.
- `git status` — clean.

DX-2 §5 clean local DB validation was the explicit precondition per F4.6C-0 §17.1. F4.6C.1 did not modify the schema or migrations, so no further DB-side validation was needed.

## 12. Explicit Non-Implementation Confirmation

Walking through the DoD §12 forbidden-area checklist:

| # | Question | Answer |
|---|---|---|
| 1 | Did this phase touch backend source? | **Yes — authorized.** Limited to `apps/backend/src/telemetry/ingestion/` (3 files) and `apps/backend/src/telemetry/projection/` (2 new files). |
| 2 | Did this phase touch frontend source? | **No.** `apps/web/**` untouched. |
| 3 | Did this phase touch the Prisma schema? | **No.** `apps/backend/prisma/schema.prisma` unchanged. |
| 4 | Did this phase create or modify a migration? | **No.** `apps/backend/prisma/migrations/**` unchanged. |
| 5 | Did this phase touch package / config / CI files? | **No.** `package.json`, lockfile, `turbo.json`, `tsconfig*.json`, `vitest.config.ts`, `eslint.config.mjs`, `docker-compose.yml`, `.github/**` all unchanged. |
| 6 | Did this phase touch seed data? | **No.** `apps/backend/prisma/seed.f4.ts` unchanged. |
| 7 | Did this phase introduce Jobs? | **No.** No `prisma.job.*` access. No Jobs lookup. No `closed_job` reason. No active-job state machine. Inserted `telemetry_readings` rows still carry `job_id: null` (carried forward from F4.6B.1). Inserted `live_readings` rows have no `job_id` column to populate. |
| 8 | Did this phase introduce external integrations? | **No.** No MQTT / Modbus / OPC-UA / ThingsBoard / Node-RED / PLC / edge-gateway / historian client. No external library added to any package file. |
| 9 | Did this phase write `live_readings`? | **Yes — F4.6C scope authorizes it.** F4.6C.1 is the **first phase authorized to write `prisma.liveReading.*`**. The writes are confined to `LiveReadingsProjectionService.updateFromAcceptedTelemetry` and only on `accepted` + `quality === 'good'` outcomes. The ingestion service never calls `prisma.liveReading.*` directly (test #17). |
| 10 | Did this phase write `alarm_events`? | **No.** No `prisma.alarmEvent.*` access. F4.6D scope. |
| 11 | Did this phase emit WebSocket / SSE? | **No.** `apps/backend/src/realtime/` untouched. No Socket.IO gateway added. No realtime publisher constructed. F4.6E scope. |
| 12 | Did this phase change auth / security behavior? | **No.** ADR-007 §7 inherited posture preserved. No new headers / tokens / middleware / role checks. |
| 13 | Did this phase change runtime flags? | **No.** No new `process.env.*` reads. The existing `RVF_INGEST_ENABLED` gate (F4.6B.1) continues to gate the controller's registration; the new projection service is registered alongside the ingestion service within the same conditional module. |

Additional confirmations:

- **`live_readings_projection` VIEW preserved.** F4.6C.1 does not drop, rename, or alter the F4.2B baseline VIEW. Verified by inspection of `apps/backend/prisma/migrations/20260524000000_f4_2_baseline/migration.sql` — unchanged at commit `1495457` and unchanged at the F4.6C.1 working tree.
- **No DB triggers added.** Explicitly rejected in F4.6C-0 §5.
- **No generic projection framework.** F4.6C.1 ships a concrete class, not an abstraction designed for F4.6D / F4.6E.
- **No new HTTP endpoint.** The candidate `GET /api/v1/telemetry/latest` documented in F4.6C-0 §15 remains unbuilt; deferred to a possible F4.6C-2 follow-up.

## 13. Deferred Work

The following remain explicitly deferred per ADR-008, the F4.6 architecture, and F4.6C-0:

- **`GET /api/v1/telemetry/latest` endpoint** that reads from `live_readings`. Possible F4.6C-2 follow-up after F4.6C.1 has shipped and projection stability is confirmed.
- **F4.6D — Alarm Evaluation Boundary**. Writes `alarm_events`; operational-context lookup mechanism (replacing the placeholder Jobs deferral). Plan-first.
- **F4.6E — WebSocket / SSE Fan-out**. Emits sanitized realtime events after the transaction commits. Plan-first.
- **F4.6F — Historical Trend API extensions**. Bucketing, downsampling, Operations chart cutover.
- **External adapter phases**. Each concrete bridge (MQTT, Modbus, OPC-UA, ThingsBoard, Node-RED, PLC, edge-gateway, historian) is its own future phase, possibly with its own ADR.
- **Production authentication / API keys / HMAC**. Candidate ADR-009.
- **Retention / archival / TimescaleDB**. Candidate ADR-010. `telemetry_readings` remains plain PostgreSQL append-only; `live_readings` remains rebuildable.
- **Historical correction workflow**. Candidate ADR-011.
- **Operational-context / Jobs wiring**. Candidate ADR-012.
- **`live_readings_projection` VIEW removal / cutover**. Deferred to F4.6F or a dedicated read-API refinement phase. Preserved verbatim today.
- **Engineering-unit conversion at ingest**. F4.6B.1 / F4.6C.1 preserve; `UnitConverter` provider remains available for a later refinement.

ADR-008 status remains **Proposed**. F4.6C.1 is the second sub-phase to exercise its principles in code (after F4.6B.1). Graduation to `Accepted` still warrants at least one more sub-phase plus a live-DB integration suite per DoD §5 special rule.

## 14. Risks / Follow-Up Notes

| Risk | Status after F4.6C.1 | Mitigation |
|---|---|---|
| Projection diverges from `telemetry_readings` | Low | Same-transaction commit guarantees co-commit. F4.6C-0 §11.2 deterministic rebuild query is documented; a future operational task can run it as a periodic reconciliation. |
| Older readings overwrite newer projection | Resolved | Watermark `updateMany WHERE timestamp < incoming.timestamp` enforced by all paths. Tests #3, #4 verify. |
| `uncertain` / `bad` data appears as live current value | Resolved | Two-layer quality gate. Tests #5, #6 in projection spec + #24, #25 in ingestion spec verify. |
| Race condition creates duplicate rows | Resolved | UNIQUE constraint structurally prevents it. P2002 retry path handles the race; tests #8, #8b verify. |
| Projection failure causes partial persistence inconsistency | Resolved | Same-transaction rollback. Test #30 verifies the outcome path (`mapping_engine_failure` quarantine, no canonical row). |
| Future API consumers read the wrong source (VIEW vs table) | Open (not introduced) | VIEW preserved; no consumer is forced to switch. F4.6F or a dedicated phase will own the cutover. |
| Scope creep into alarms / WebSocket / external integrations | Mitigated | Tests #17 / #18 / #19 / #20 from F4.6B.1 carry forward unchanged. F4.6C.1 closeout (this document) §12 walks every DoD forbidden-area question. |
| `live_readings_projection` VIEW hidden dependency | None today | No consumer reads the VIEW. F4.6C.1 leaves it intact for non-destructive coexistence. |
| Premature abstraction for F4.6D / F4.6E | Mitigated | F4.6C.1 shipped a concrete `LiveReadingsProjectionService`, not a `ProjectionUpdater` generic interface. F4.6D / F4.6E will design their own collaborators with the same pattern. |

### 14.1 Follow-up — possible F4.6C-2

A small follow-up phase (~1 endpoint, plan + implementation) could ship `GET /api/v1/telemetry/latest?unitId=…` reading from `live_readings`. F4.6C.1 deliberately did not include it; F4.6C-2 (if pursued) would be a candidate after a brief soak of F4.6C.1 in dev environments.

### 14.2 Follow-up — live-DB integration suite

F4.6C.1 covers behavior with mocked Prisma. A live-DB integration suite (running against a real `docker compose up postgres` instance, applying the migrations via `prisma migrate deploy`, exercising the full ingestion → projection flow) is a separately-planned future deliverable. It is the second of the two preconditions for moving ADR-008 from `Proposed` to `Accepted` (the first being at least one downstream sub-phase shipping, which F4.6C.1 satisfies for half).

## 15. Recommended Next Phase

**F4.6D-0 — Alarm Evaluation Boundary Plan.** Plan-only.

F4.6D-0's recommended scope:

1. Decide the placement of the alarm evaluator (sibling submodule of `ingestion/` and `projection/` under `apps/backend/src/telemetry/`).
2. Decide the trigger point and transactional posture relative to the existing ingestion `$transaction`.
3. Decide the operational-context lookup mechanism that resolves whether a `CommissioningSnapshot` is in force for the unit at the reading's timestamp — ADR-005 invariant.
4. Decide the threshold-resolution rule (snapshot vs current `alarm_rules`).
5. Decide the lifecycle write rules for `alarm_events` (activate / acknowledge / clear).
6. Decide the deduplication rule for repeat triggers (no duplicate `active` events for the same `(unit, canonical_tag, severity)` while one is open).
7. Decide whether `uncertain` quality should ever trigger alarms (F4.6C.1 follows the plan: only `good` updates the projection; the alarm-side decision is F4.6D's).

**Important constraints for F4.6D:**

- **Plan-only.** Like F4.6A.0 / F4.6B-0 / F4.6C-0, F4.6D-0 ships no runtime code.
- **Backend-owned.** Alarm evaluation **must remain backend-owned**. The browser never evaluates alarms (ADR-005 invariant).
- **No WebSocket / SSE emit** introduced by F4.6D-0 or F4.6D.1 — that is strictly F4.6E's scope. F4.6D ships persisted alarm events; the realtime broadcast layer ships separately.
- **No external protocol integrations.** MQTT / Modbus / OPC-UA / ThingsBoard / Node-RED / PLC / historian remain deferred.
- **No Jobs UI.** F4.6D may introduce an operational-context lookup mechanism but should not surface a Jobs UI.

Parallel work that does not depend on F4.6C.1 or F4.6D-0:

- **F4.5G+** — per-screen migration of Wells / Equipment / Catalog from the F3 mock adapter to the corresponding F4.5B / F4.5C adapter. Cero dependencia con F4.6.

---

*F4.6C.1 closeout. First write to `live_readings` shipped. Projection ownership and isolation invariants intact. F4.6D-0 (plan-only, alarm evaluation, backend-owned, no WebSocket, no external) is the next step.*
