# RVF Malinois F4.6B.1 — Ingestion Boundary Runtime Skeleton Closeout Report v1.0

> Phase **F4.6B.1 — Telemetry Ingestion Boundary Runtime Skeleton**. First real backend runtime module in the F4.6 arc.
>
> Upstream references:
> - F4.6 architecture: `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Architecture.md` (commit `c12a29c`)
> - ADR-008 (Proposed): `docs/adr/ADR-008_RVF_Malinois_Telemetry_Persistence_Ingestion.md` (commit `c12a29c`)
> - F4.6 closeout: `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Closeout_Report_v1.0.md` (commit `334bfc5`)
> - F4.6A.0 schema-hardening plan: `docs/architecture/RVF_Malinois_F4_6A_Schema_Hardening_Plan.md` (commit `014df37`)
> - F4.6A.1 migration closeout: `docs/architecture/RVF_Malinois_F4_6A_1_Schema_Hardening_Migration_Closeout_Report_v1.0.md` (commit `6be7842`)
> - F4.6B-0 ingestion boundary plan (the gate this phase implements): `docs/architecture/RVF_Malinois_F4_6B_Ingestion_Boundary_Plan.md` (commit `c4ea18a`)

## 1. Executive Summary

F4.6B.1 implements the F4.6B-0 ingestion boundary plan. It lands the **first runtime module that writes to `telemetry_readings`**: a new submodule under `apps/backend/src/telemetry/ingestion/` with a Zod-validated `POST /api/v1/telemetry/ingest` endpoint, a `TelemetryIngestionService` that owns the per-sample resolve → normalize → dedup → persist (or quarantine) flow, a strict `contracts/ingestion.ts` wire schema, and 22 mocked-Prisma vitest tests covering each outcome and isolation invariant.

The endpoint is **build-time / boot-time guarded**: registered in `AppModule.imports` only when `process.env.RVF_INGEST_ENABLED === 'true'`. When the flag is unset (the default), the module is never instantiated, the controller is not mounted, the route does not appear in Swagger, and Nest returns its default 404.

What this phase does NOT do is as load-bearing as what it does. Per the F4.6B-0 §14.2 prohibitions:

- **No `live_readings` mutation.** The F4.6A.1 projection table stays empty. F4.6C owns the upsert.
- **No `alarm_events` mutation.** F4.6D owns the evaluator.
- **No realtime / WebSocket / SSE emission.** F4.6E owns the fan-out.
- **No external bridges** (MQTT / Modbus / OPC-UA / ThingsBoard / Node-RED / PLC / edge-gateway / historian). Each is its own future phase.
- **No Jobs flow.** Telemetry rows are inserted with `job_id = null`; the boundary performs no `Job` or `CommissioningSnapshot` lookup.
- **No `ProjectionUpdater` / `AlarmEvaluator` / `FanoutPublisher` interfaces or no-op stand-in providers.** F4.6B-0 §14 explicitly forbids these in F4.6B.1; the prohibition is verified by the isolation tests in this commit.

All quality gates pass: `prisma validate`, `prisma generate`, backend `lint` / `typecheck` / `build` / `test` (**91 / 91 across 11 spec files**, +22 from F4.6A.1 baseline), workspace-wide `lint` / `typecheck` / `build`. Web target is cached (FULL TURBO) — confirmed no frontend diff. ADR-008 remains **Proposed**: an end-to-end live-DB integration suite and at least one downstream sub-phase need to ship before the ADR can graduate.

## 2. Commit Context

This report records the *intended* commit for F4.6B.1. The phase has been authored, validated, and verified at the working-tree level; the brief instructs **not to commit yet**.

| Commit | Title |
|---|---|
| `c12a29c` | Add F4.6 telemetry persistence architecture ADR |
| `334bfc5` | Add F4.6 telemetry persistence closeout report |
| `014df37` | Add F4.6A schema hardening plan |
| `6be7842` | Add F4.6A telemetry schema hardening migration |
| `c4ea18a` | Add F4.6B ingestion boundary plan |
| *(pending)* | Add F4.6B telemetry ingestion boundary skeleton (this work) |

## 3. Files Changed

| Path | Change | Notes |
|---|---|---|
| `apps/backend/src/telemetry/ingestion/contracts/ingestion.ts` | **New.** | Zod schemas (`IngestTelemetryBatchInputSchema`, `IngestTelemetrySampleInputSchema`) + mirror tuples (`INGESTION_QUALITIES`, `INGESTION_QUARANTINE_REASONS` with 15 F4.6A.1 values, `INGESTION_OUTCOMES` with 5 values) + tunables (`INGEST_BATCH_MAX=1000`, `INGESTION_MAX_FUTURE_SKEW_MS=5min`, `INGESTION_MAX_LATE_WINDOW_MS=7days`) + TypeScript response types. |
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.ts` | **New.** | `TelemetryIngestionService` — the boundary. Implements per-sample resolve / normalize / dedup / persist / quarantine. ~600 lines including documentation. |
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.controller.ts` | **New.** | `POST /telemetry/ingest` with `ZodValidationPipe`, Swagger annotations, HTTP 200 partial-success contract. |
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.module.ts` | **New.** | NestJS module wiring controller + service. No external imports (`PrismaModule` is global). |
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` | **New.** | 22 mocked-Prisma vitest tests. |
| `apps/backend/src/app.module.ts` | **Modified.** | Minimal edit: conditional import via `optionalIngestionModule()` that returns `[TelemetryIngestionModule]` only when `RVF_INGEST_ENABLED === 'true'`. |
| `docs/architecture/RVF_Malinois_F4_6B_1_Ingestion_Boundary_Skeleton_Closeout_Report_v1.0.md` | **New.** | This document. |

No other file modified, created, or deleted. Explicitly:

- No file under `apps/web/`.
- No file under `apps/backend/src/realtime/`.
- No file under `apps/backend/src/{tenants,wells,equipment,jobs,tags,health}/`.
- No `apps/backend/prisma/schema.prisma` change.
- No `apps/backend/prisma/migrations/` change.
- No `apps/backend/prisma/seed.f4.ts` change.
- No `package.json`, lockfile, `turbo.json`, `tsconfig*.json`, `vitest.config.ts`, `eslint.config.mjs`, `docker-compose.yml`, CI workflow, or `packages/` change.

## 4. Runtime Skeleton Implemented

### 4.1 Module structure

The new submodule lives entirely under `apps/backend/src/telemetry/ingestion/`. It is a sibling of the existing `TelemetryModule` (which hosts the F4.4F read endpoint `GET /telemetry/trends`), and does not modify that module.

### 4.2 Service

`TelemetryIngestionService.ingestBatch(ctx, input, now?)` returns `Promise<IngestTelemetryBatchResult>`. Per-sample independence: one sample's failure never aborts the batch. The optional `now` parameter is a test seam for deterministic temporal-window assertions.

Per-sample flow inside `processSample()`:

1. Load `IntegrationMapping` by `(integrationSourceId, externalIdentifier)`.
2. Check `enabled` and `tenantId` alignment.
3. Resolve sensor and canonical tag, falling back to active `SensorTagBinding` when one of them is null on the mapping.
4. Load canonical tag and verify the sample's `engineeringUnit` matches the expected unit (mapping override or canonical unit). No conversion at ingest.
5. Normalize timestamp; reject as `future_timestamp` or `late_outside_window` per the 5-minute / 7-day windows.
6. Numerically validate the value (Zod already enforced finiteness; defensive recheck for the string variant).
7. Insert into `telemetry_readings` via `prisma.telemetryReading.create`. The insert sets `integration_source_id` (new column from F4.6A.1), `ingestion_id := externalIdentifier`, `sequence` when present, and `job_id = null`.
8. On `Prisma.PrismaClientKnownRequestError` with `code === 'P2002'`, classify as `duplicate` (identical canonical row found via dedup key) or `conflict_quarantined` (different value — writes a quarantine row with `reason = 'conflict_dedup'` and a `metadata.dedup = { existing, incoming }` snapshot).

### 4.3 Controller

Single `@Post('ingest')` handler. Uses `ZodValidationPipe(IngestTelemetryBatchInputSchema)` against the request body. Always returns HTTP 200 on a structurally-valid request (partial success in `results[]`); HTTP 400 on Zod validation failure with structured `errors` array; HTTP 404 (Nest default) when the env flag is unset and the module is not registered.

The controller is intentionally thin: validate → delegate → return. Tenant scoping happens server-side from the resolved `IntegrationSource`; the wire never carries a `tenantId`. Authentication is **not** introduced (per ADR-008 §13; deferred to a successor ADR candidate ADR-009).

### 4.4 Module

`TelemetryIngestionModule` provides `TelemetryIngestionService` and registers `TelemetryIngestionController`. It imports nothing — `PrismaService` is available because `PrismaModule` is `@Global()`. The module exports `TelemetryIngestionService` for forward compatibility (future internal callers may inject it directly without going through HTTP).

### 4.5 No extension seams introduced

Per F4.6B-0 §14.2, F4.6B.1 does NOT introduce:

- `ProjectionUpdater` / `AlarmEvaluator` / `FanoutPublisher` / `ExternalAdapterBridge` interfaces, providers, no-op classes, or DI registrations.
- Side-effect call sites for future projection / alarm / fan-out wiring.
- Any external-protocol library (MQTT, Modbus, OPC-UA, etc.).

The boundary's behavior is exactly: validate → resolve → normalize → dedup → persist OR quarantine. Future phases (F4.6C / F4.6D / F4.6E) will retrofit their collaborator wiring by editing the service at that time, not by relying on no-op seams shipped here.

## 5. Endpoint and Env Flag

| Property | Value |
|---|---|
| HTTP method + path | `POST /api/v1/telemetry/ingest` |
| Controller-relative path | `'telemetry'` + `@Post('ingest')` |
| Global prefix | `/api/v1` (set by `apps/backend/src/main.ts`) |
| Env flag | `RVF_INGEST_ENABLED` |
| Gate mechanism | Conditional module registration in `AppModule.imports` |
| Behavior when flag unset | Module not instantiated; route returns Nest default 404; not listed in Swagger |
| Behavior when flag set to `'true'` | Module registered; route accepts requests; no authentication |
| Authentication | None (ADR-008 §13 posture; deferred to a successor ADR) |

The conditional registration is implemented as:

```ts
const optionalIngestionModule = (): (DynamicModule | typeof TelemetryIngestionModule)[] =>
  process.env.RVF_INGEST_ENABLED === 'true' ? [TelemetryIngestionModule] : [];

@Module({
  imports: [
    /* ... existing modules ... */
    TelemetryModule,
    ...optionalIngestionModule(),
  ],
})
export class AppModule {}
```

Boot-time evaluation: the array spread runs when `AppModule` is parsed at app startup, so the module's presence or absence is fixed for the process lifetime. No runtime guard inside the controller — the route's existence is structural, not advisory.

## 6. Validation Approach

### 6.1 Wire validation (Zod)

Strict Zod schema (`.strict()`) rejects unknown fields. Validation runs in the controller via `ZodValidationPipe`. Failures surface as HTTP 400 with the Zod issue list.

Key constraints (full list in `contracts/ingestion.ts`):

- `integrationSourceId` — UUID, required.
- `correlationId` — string `1..128`, optional.
- `samples` — array, `min(1).max(1000)`.
- Per sample: `externalIdentifier` (string, `1..256`), `timestamp` (ISO-8601 with offset), `value` (finite number or numeric string), `engineeringUnit` (string, `1..64`), `quality` (enum `'good' | 'uncertain' | 'bad'`), `sequence` (non-negative integer or numeric string, optional), `rawPayload` (unknown, optional), `metadata` (record, optional).

No `tenantId` field. No `source.kind` field. No `unitId` / `sensorId` / `canonicalTagId` fields. No `jobId` field. Server-side resolution is the only path.

### 6.2 Quality and reason vocabulary

Wire-side `quality`: strict 3-value enum. No aliasing in F4.6B.1 (no `suspect → uncertain`).

Quarantine `reason`: 15 strings drawn **exclusively** from the F4.6A.1 CHECK enum (commit `6be7842`). F4.6B.1 emits no value outside the enum. `closed_job` is intentionally absent (Jobs deferred). `inactive_context` is the neutral signal used when `IntegrationSource.status !== 'active'`.

### 6.3 Service-side validation

The service runs additional checks past the wire layer:

- Source must exist and be `active`; otherwise every sample in the batch quarantines.
- Mapping must exist, be `enabled`, and have matching `tenant_id`.
- Sensor / canonical tag must resolve unambiguously (mapping FK or active `SensorTagBinding`).
- Engineering unit must match the expected unit; mismatches quarantine as `unit_mismatch` (no conversion).
- Timestamp must fall inside `[now - 7d, now + 5min]`.
- Value must parse to a finite number.

Every failure path writes one row to `telemetry_ingestion_errors` and emits a per-sample result with the matching reason — no exceptions reach the controller for per-sample failures. Truly unexpected internal errors emit `mapping_engine_failure` (existing F4.6A.1 CHECK value) and are logged server-side (Pino) without echoing details in the HTTP response.

## 7. Tenant and Mapping Resolution

### 7.1 Tenant

Derived **only** from `IntegrationSource.tenant_id`. The wire never carries a `tenantId`. The existing `CallerContext` is accepted as the first argument to `ingestBatch` for forward compatibility, but its `tenantId` is intentionally ignored in F4.6B.1 — this is asserted by test #21.

### 7.2 Mapping

Resolution path per F4.6B-0 §10:

1. Lookup `IntegrationMapping` by `(integrationSourceId, externalIdentifier)` (the F4.1 UNIQUE constraint).
2. Reject `unknown_mapping` if absent, `disabled_mapping` if `enabled = false`, `tenant_mismatch` if `mapping.tenantId !== source.tenantId`.
3. If `mapping.sensorId` and `mapping.canonicalTagId` are both set, use them directly.
4. If `mapping.sensorId` is null and `mapping.canonicalTagId` is set, search for a unique active `SensorTagBinding` on the mapping's unit that matches the tag. Zero candidates → `unresolved_sensor`; multiple → `mapping_engine_failure`.
5. If `mapping.canonicalTagId` is null and `mapping.sensorId` is set, look up the sensor's active binding. Missing → `unresolved_tag`.
6. Both null → `unresolved_sensor`.

The payload's `canonicalTagName` / `unitName` are **not** accepted at all (they are not part of the wire schema). Mapping is the only canonical-identity source.

## 8. Dedup and Quarantine Handling

### 8.1 Insert + catch P2002

The boundary calls `prisma.telemetryReading.create()` and catches `Prisma.PrismaClientKnownRequestError` with `code === 'P2002'`. This is the race-safe pattern (no pre-check TOCTOU window).

### 8.2 Classification on P2002

On `P2002`, the service looks up the existing canonical row via the dedup key in force:

- Sequence present → `(integration_source_id, sensor_id, canonical_tag_id, sequence)`.
- Sequence absent → `(sensor_id, canonical_tag_id, timestamp, sequence: null)`.

Then compares `value` (Decimal string), `engineeringUnit`, `quality`, and `source` (kind) field-by-field:

- All match → outcome `duplicate`, no quarantine row, batch counter incremented.
- Any differ → outcome `conflict_quarantined`. Writes one `telemetry_ingestion_errors` row with `reason = 'conflict_dedup'` and a `metadata.dedup = { existing, incoming }` snapshot for operator triage.

The boundary **never** issues `UPDATE` or `UPSERT` against `telemetry_readings`. `telemetry_readings` remains append-only per ADR-008.

### 8.3 Quarantine row content

Every quarantine row populates:

- FK fields (`tenantId`, `integrationSourceId`, `integrationMappingId`, `unitId`, `sensorId`, `canonicalTagId`) up to the resolution depth reached at the time of failure.
- `externalIdentifier`, `timestamp` (if parseable), `quality`, `engineeringUnit`, `value` (if numeric).
- `reason` (CHECK-enum value) and `reasonDetail` (free-form, never raw stack traces).
- `rawPayload` (verbatim caller payload) and `metadata` (caller-supplied + boundary-supplied notes).
- `correlationId` (verbatim from request).
- `ingestion_timestamp` defaults to `now()` server-side.

## 9. Explicit Non-Implementation Confirmation

F4.6B.1 explicitly did **not**:

- **Update `live_readings`.** No code path calls `prisma.liveReading.*`. Verified by test #17. F4.6C will own the upsert.
- **Write `alarm_events`.** No code path calls `prisma.alarmEvent.*`. Verified by test #18. F4.6D will own alarm evaluation.
- **Modify `apps/backend/src/realtime/`.** Untouched. F4.6E will own fan-out.
- **Emit WebSocket / SSE events.** No publisher constructed; no Socket.IO gateway modified.
- **Wire MQTT / Modbus / OPC-UA / ThingsBoard / Node-RED / PLC / edge-gateway / historian.** Zero external libraries added; `package.json` and lockfile untouched.
- **Introduce Jobs / Jobs UI / active-job lookup.** Inserted rows carry `job_id = null`. Verified by test #20.
- **Introduce a simulator runtime.** No `RVF_TELEMETRY_SIMULATOR` flag wired. No in-process simulator module.
- **Add no-op `ProjectionUpdater` / `AlarmEvaluator` / `FanoutPublisher` / `ExternalAdapterBridge` providers.** Per F4.6B-0 §14.2.
- **Add production authentication.** `RVF_INGEST_ENABLED` is the interim build-time gate; real auth is a successor ADR.
- **Add a queue / worker architecture.** Synchronous per-sample processing only.
- **Modify Prisma schema or migrations.** `apps/backend/prisma/schema.prisma` and `apps/backend/prisma/migrations/` are byte-for-byte unchanged from commit `6be7842`.
- **Modify frontend.** `apps/web/**` untouched.
- **Modify package files or config.** No `package.json`, lockfile, `turbo.json`, `tsconfig*.json`, `vitest.config.ts`, `eslint.config.mjs`, or `docker-compose.yml` change.
- **Modify CI / workflows.** No `.github/` change.
- **Modify seed.** `apps/backend/prisma/seed.f4.ts` untouched.
- **Write any row to any canonical table.** `prisma migrate dev` was not run; no DB connection was opened during validation.

## 10. Tests and Validation Performed

### 10.1 Service tests

22 mocked-Prisma vitest cases in `telemetry-ingestion.service.spec.ts`, mapped to the F4.6B-0 §16 test plan plus additional coverage:

| # | Case | Outcome verified |
|---|---|---|
| 1 | Valid sample → canonical row inserted with resolved IDs | `accepted` |
| 2 | Missing `IntegrationSource` → every sample quarantines | `unknown_source` |
| 3 | `IntegrationSource.status='inactive'` → every sample quarantines | `inactive_context` |
| 4 | Missing `IntegrationMapping` → quarantine | `unknown_mapping` |
| 5 | Mapping `enabled=false` → quarantine | `disabled_mapping` |
| 6 | Mapping tenant != source tenant → quarantine | `tenant_mismatch` |
| 7 | Mapping `sensorId=null` + zero active bindings → quarantine | `unresolved_sensor` |
| 8 | Mapping `canonicalTagId=null` + no active binding → quarantine | `unresolved_tag` |
| 9 | Mapping `sensorId=null` + multiple candidates → quarantine | `mapping_engine_failure` |
| 10 | Sample unit != expected unit → quarantine | `unit_mismatch` |
| 11 | Sample timestamp > now + 5 min → quarantine | `future_timestamp` |
| 12 | Sample timestamp < now - 7 days → quarantine | `late_outside_window` |
| 13 | P2002 with identical existing row → no quarantine | `duplicate` |
| 14 | P2002 with different value → quarantine | `conflict_quarantined` / `conflict_dedup` |
| 15 | Sequence-absent dedup path uses ts-based key | `duplicate` (Form B verified) |
| 16 | Partial success across 3-sample batch | mixed outcomes preserved per-sample |
| 17 | Isolation: no `liveReading` mutation | guards assert never called |
| 18 | Isolation: no `alarmEvent` mutation | guards assert never called |
| 19 | Isolation: no realtime/WebSocket Prisma surfaces | guards assert never called |
| 20 | Isolation: no Jobs lookup; `jobId = null` on canonical row | asserted |
| 21 | `ctx.tenantId` ignored; tenant from `IntegrationSource` | asserted |
| 22 | `SensorTagBinding` fallback resolution path | `accepted` via binding |

### 10.2 Validation commands

| Command | Result |
|---|---|
| `pnpm --filter @rvf/backend exec prisma validate` | `The schema at prisma/schema.prisma is valid 🚀` |
| `pnpm --filter @rvf/backend exec prisma generate` | clean (Prisma Client v5.22.0) |
| `pnpm --filter @rvf/backend exec prisma format` | not run (no schema edits in F4.6B.1) |
| `pnpm --filter @rvf/backend run lint` | clean (0 errors, 0 warnings) |
| `pnpm --filter @rvf/backend run typecheck` | clean (src + prisma) |
| `pnpm --filter @rvf/backend run build` | clean (`nest build`) |
| `pnpm --filter @rvf/backend run test` | **91 passed / 91** across 11 spec files. 22 new tests, 69 baseline unchanged. Duration ~1.49s. |
| `pnpm run lint` (workspace) | 4 / 4 successful |
| `pnpm run typecheck` (workspace) | 4 / 4 successful |
| `pnpm run build` (workspace) | 2 / 2 successful (web cached and untouched) |

### 10.3 Not run (and why)

- `prisma migrate dev` / `prisma migrate deploy` — no schema or migration change; nothing to apply. Live-DB integration testing remains a separate (future) deliverable.
- Controller-level spec — judged optional in F4.6B-0 §16.3; the service spec covers the boundary's behavior and the conditional registration is verified by the absence of any controller-level wiring (the controller is structurally absent when the flag is unset). A future Nest `TestingModule`-based controller spec can be added in a small follow-up if desired.

## 11. Deferred Work

The following remain explicitly deferred per ADR-008 and F4.6B-0:

- **F4.6C — Live readings projection write path + latest-value endpoint.** Wires `prisma.liveReading.*` upsert from the boundary's post-insert hook (the hook itself will be authored as part of F4.6C, not retrofitted from F4.6B.1).
- **F4.6D — Alarm evaluation + `alarm_events` writes + alarm REST endpoints.** Owns the operational-context lookup that decides between `CommissioningSnapshot.effective_thresholds` and current `alarm_rules`.
- **F4.6E — WebSocket / SSE fan-out.** Owns the realtime emitter that fires after the transaction commits.
- **External adapter phases.** Each concrete bridge (MQTT, Modbus, OPC-UA, ThingsBoard, Node-RED, PLC, edge-gateway, historian) is its own future phase, possibly with its own ADR.
- **Production authentication / API keys / HMAC.** Candidate ADR-009.
- **Retention / archival / TimescaleDB.** Candidate ADR-010.
- **Historical correction workflow.** Candidate ADR-011.
- **Operational-context / Jobs wiring.** Candidate ADR-012.
- **`telemetry_ingestion_errors` retention pruner.** Default guidance is 30 days; operational task, not authored here.
- **`live_readings_projection` VIEW removal.** Preserved per F4.6A.0 §5.E. F4.6C decides.
- **Engineering-unit conversion at ingest time.** F4.6B.1 preserves; conversion using the retained `UnitConverter` is a candidate refinement.
- **Quality aliasing at the boundary** (e.g. `suspect` → `uncertain`). Future bridges may add it; F4.6B.1 keeps the wire strict.
- **Controller-level integration test against a real backend instance.** Out of scope; live-DB harness is a separate F4 work stream.

ADR-008 status remains **Proposed**. F4.6B.1 exercises ADR-008's principles in code for the first time, but a single sub-phase is insufficient to graduate the ADR — F4.6C and a live-DB integration suite are the natural next validation steps.

## 12. Recommended Next Phase

**F4.6C — Live Readings Projection Updater.**

F4.6C's recommended scope:

1. Author the projection-update hook inside the ingestion boundary's post-insert step. The hook upserts a row into `live_readings` keyed by `(unit_id, sensor_id, canonical_tag_id)`, gated by `new.timestamp > stored.timestamp` AND `new.quality === 'good'`.
2. Ship the candidate `GET /api/v1/telemetry/latest?unitId=...` endpoint that reads from `live_readings`.
3. Decide the fate of the F4.2 `live_readings_projection` VIEW: drop (if F4.6A.1 kept it as a fallback), rename, or keep as ad-hoc SQL surface.
4. Optionally update the F4.5 frontend adapter to consume the new endpoint, or defer that to a per-screen migration.
5. Backend tests for the projection-update behavior.
6. F4.6C closeout report.

**Important constraint for F4.6C:**

F4.6C **should focus only on populating / updating `live_readings` from accepted telemetry and exposing the latest-value read endpoint.** Specifically, F4.6C does NOT introduce:

- External protocols (MQTT / Modbus / OPC-UA / ThingsBoard / Node-RED / PLC / edge-gateway / historian).
- Alarm evaluation or `alarm_events` writes (F4.6D).
- WebSocket / SSE fan-out (F4.6E).
- Jobs flow.
- Production authentication.

Like F4.6B.1, F4.6C should remain strictly within its own concern. Bridge / alarm / realtime work each get their own dedicated sub-phase with its own plan if needed.

Parallel work that does not depend on F4.6B.1 / F4.6C:

- **F4.5G+** — per-screen migration of Wells / Equipment / Catalog from the F3 mock adapter to the corresponding F4.5B / F4.5C adapter. Cero dependencia con F4.6.

---

*F4.6B.1 closeout. Ingestion boundary skeleton is in place, 91/91 tests passing, all gates green, working tree intact. F4.6C is the next step — live readings projection write path only, no external protocols.*
