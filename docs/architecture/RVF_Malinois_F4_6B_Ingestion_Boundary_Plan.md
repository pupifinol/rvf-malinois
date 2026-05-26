# RVF Malinois F4.6B-0 — Ingestion Boundary Interface Plan

> Phase **F4.6B-0 — Ingestion Boundary Interface Plan**. Plan-only / documentation-only.
> Translates ADR-008 and the F4.6A.1 schema-hardening implementation into a concrete backend ingestion-boundary plan that will gate F4.6B.1 (the runtime skeleton). **No service / controller / module / DTO / test / Prisma / migration / config file is created or modified in F4.6B-0.**
>
> Upstream references:
> - F4 architecture: `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md` (commit `f36923a`)
> - ADR-007: `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md` (commit `8147399`)
> - F4.6 architecture: `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Architecture.md` (commit `c12a29c`)
> - ADR-008 (Proposed): `docs/adr/ADR-008_RVF_Malinois_Telemetry_Persistence_Ingestion.md` (commit `c12a29c`)
> - F4.6 closeout: `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Closeout_Report_v1.0.md` (commit `334bfc5`)
> - F4.6A.0 schema-hardening plan: `docs/architecture/RVF_Malinois_F4_6A_Schema_Hardening_Plan.md` (commit `014df37`)
> - F4.6A.1 migration closeout: `docs/architecture/RVF_Malinois_F4_6A_1_Schema_Hardening_Migration_Closeout_Report_v1.0.md` (commit `6be7842`)

## 1. Purpose

F4.6B-0 translates ADR-008's ingestion-boundary principles and the F4.6A.1 schema additions (`telemetry_readings.integration_source_id`, the two partial unique dedup indexes, `telemetry_ingestion_errors`, `live_readings`) into a concrete backend implementation plan. It locks down the service contract, the HTTP wire shape, the validation strategy, the env-flag gate, the tenant scoping rule, the mapping-resolution flow, the dedup and conflict policy, the persistence-and-quarantine ordering, and the test plan that F4.6B.1 will implement.

This document does not write runtime code. Every concrete file, class, method, route, schema, DTO, and test that F4.6B.1 produces is reviewed at the planning level here so the F4.6B.1 PR is a mechanical translation rather than a relitigation.

## 2. Current Scope

F4.6B-0 is strictly:

- **Plan-only.** A single new documentation file under `docs/architecture/`.
- **No runtime code.** No file under `apps/backend/src/`, `apps/web/`, `packages/`, or any root path is modified.
- **No Prisma schema changes.** `apps/backend/prisma/schema.prisma` untouched.
- **No migration added.** `apps/backend/prisma/migrations/` untouched.
- **No backend source / frontend / tests / config / package changes.**
- **No WebSocket / SSE.** `apps/backend/src/realtime/` untouched.
- **No alarm engine.** F4.6D's responsibility.
- **No external protocol integrations.** No MQTT / Modbus / OPC-UA / ThingsBoard / Node-RED / PLC / edge-gateway / historian client touched.
- **No Jobs model or Jobs UI.** ADR-008 / F4.6 Jobs deferral preserved.

## 3. Inputs Reviewed

| Artifact | Path |
|---|---|
| F4.6 Telemetry Persistence Architecture | `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Architecture.md` |
| ADR-008 | `docs/adr/ADR-008_RVF_Malinois_Telemetry_Persistence_Ingestion.md` |
| F4.6A.0 Schema Hardening Plan | `docs/architecture/RVF_Malinois_F4_6A_Schema_Hardening_Plan.md` |
| F4.6A.1 Closeout Report | `docs/architecture/RVF_Malinois_F4_6A_1_Schema_Hardening_Migration_Closeout_Report_v1.0.md` |
| Current Prisma schema | `apps/backend/prisma/schema.prisma` |
| F4.6A.1 migration SQL | `apps/backend/prisma/migrations/20260526000000_f4_6a_telemetry_hardening/migration.sql` |
| F4.6A.1 reverse SQL | `apps/backend/prisma/migrations/20260526000000_f4_6a_telemetry_hardening/down.sql` |
| Existing backend module / controller / service pattern | `apps/backend/src/telemetry/{telemetry.controller.ts, telemetry.module.ts, trends.service.ts, canonical-tag-resolver.ts, unit-converter.ts}` plus `apps/backend/src/{tenants,wells,equipment,jobs,tags,health}/` |
| Existing Zod usage | `apps/backend/src/telemetry/contracts/trends.ts`, `apps/backend/src/common/zod-validation.pipe.ts` |
| CallerContext seam | `apps/backend/src/common/caller-context.ts` |
| Existing test / mocked-Prisma pattern | `apps/backend/src/telemetry/trends.service.spec.ts`, `apps/backend/src/telemetry/canonical-tag-resolver.spec.ts` |
| AppModule wiring | `apps/backend/src/app.module.ts` |

### Confirmed conventions

- **Validation:** Zod schemas in `contracts/` files, plus the shared `ZodValidationPipe` (`apps/backend/src/common/zod-validation.pipe.ts`). CHECK-enum mirror tuples live next to Zod schemas (e.g. `TELEMETRY_QUALITIES`, `TELEMETRY_SOURCES`).
- **CallerContext:** `apps/backend/src/common/caller-context.ts`. Services accept `CallerContext` as first argument. `SystemContext` is the F1 default (empty, no tenant scope).
- **Controllers:** `@Controller('<feature>')` registered under the global `/api/v1` prefix from `main.ts`. Swagger annotations (`@ApiTags`, `@ApiOperation`, `@ApiQuery`) are used.
- **Decimal:** Prisma `Decimal @db.Decimal` serializes to a JSON **string** via `Decimal.toJSON`; consumers parse numerically only when needed.
- **Tests:** vitest with mocked Prisma. No live DB in unit specs. Pattern lives in `trends.service.spec.ts`.

## 4. Implementation Placement

### 4.1 Options evaluated

| Option | Path | Pros | Cons |
|---|---|---|---|
| **A** | `apps/backend/src/telemetry/ingestion/` (new submodule, sibling of the existing `TelemetryModule`) | Keeps ingestion under the telemetry domain. Matches the existing `telemetry/contracts/` precedent for cohabiting submodules. Independent module file makes env-flag-conditional registration trivial. | Two telemetry-related modules (read + write); minor duplication of imports. |
| B | Inside the existing `TelemetryModule` (add ingest controller + service to current module) | Single module; minor file additions. | Couples the env-flag gate to a module that also serves the unconditional `/telemetry/trends` read endpoint — disabling ingestion requires conditional registration of controllers, which is awkward. Violates single-responsibility for the module. |
| C | Generic `integrations/` module | Reflects external-integration framing. | Misframes the boundary. ADR-008 §3 decision 2 says external systems do not write directly to canonical tables; the ingestion boundary is **RVF-owned**, not external-platform-shaped. This option leaks an external mental model into our module structure. Rejected. |

### 4.2 Recommendation

**Option A.** A new submodule under `apps/backend/src/telemetry/ingestion/`. This:

- Keeps ingestion backend-owned and located inside the telemetry domain (per ADR-008's "RVF owns telemetry persistence end to end").
- Decouples the env-flag gate (§8) from the unconditional `TelemetryModule` that serves `/telemetry/trends`.
- Follows the existing repo precedent of nested subdirectories within a feature domain (`telemetry/contracts/`).
- Avoids the "integrations" framing that would prematurely suggest external-protocol-shaped architecture.

### 4.3 Expected files for F4.6B.1 (conceptual; not created in F4.6B-0)

| File | Purpose |
|---|---|
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.module.ts` | NestJS module wiring (`controllers`, `providers`, `imports: [PrismaModule, TelemetryModule]`, exports). |
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.controller.ts` | Single `POST` controller for `/telemetry/ingest`. Uses `ZodValidationPipe` against the request schema. Swagger-annotated. |
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.ts` | Boundary service. Exposes `ingestBatch(input, ctx)`. Owns mapping resolution, normalization, dedup, persistence, quarantine writes. Stubbed hooks for projection/alarm/fanout. |
| `apps/backend/src/telemetry/ingestion/contracts/ingestion.ts` | Zod schemas + inferred types + outcome / reason mirror tuples (matching the new CHECK enum on `telemetry_ingestion_errors.reason`). |
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` | Mocked-Prisma vitest spec covering every outcome. |
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.controller.spec.ts` | Optional controller spec; mocks the service to verify request/response shape and env-flag behavior. |

The new module is **registered conditionally** in `app.module.ts` per §8.2.

The existing `TelemetryModule` is **not modified** in F4.6B.1 except for exporting `UnitConverter` and `CanonicalTagResolver` (already exported per the current module) so the new module can depend on them.

**None of these files exist yet. F4.6B-0 only proposes them.**

## 5. Service Contract

### 5.1 Conceptual interface

```ts
ingestBatch(
  input: IngestTelemetryBatchInput,
  ctx: IngestionCallerContext,
): Promise<IngestTelemetryBatchResult>
```

### 5.2 Conceptual types (final shapes locked in F4.6B.1 contracts file)

```ts
// Input — the batch the caller submits.
interface IngestTelemetryBatchInput {
  integrationSourceId: string;          // UUID. Required. Tenant resolved from this.
  correlationId?: string;               // free-form. Echoed in the result and stored on errors.
  samples: IngestTelemetrySampleInput[];// >= 1, <= INGEST_BATCH_MAX (§7).
}

interface IngestTelemetrySampleInput {
  externalIdentifier: string;           // resolves IntegrationMapping. Required.
  timestamp: string;                    // ISO-8601 UTC. Required.
  value: number | string;               // numeric; backend parses to Decimal. Required.
  engineeringUnit?: string;             // optional; defaults to mapping's canonical unit.
  quality: 'good' | 'uncertain' | 'bad';// strict on the wire; aliasing is a future bridge concern.
  sequence?: number | string;           // optional. Source-local monotonic counter.
  rawPayload?: unknown;                 // verbatim opaque blob stored on quarantine rows.
  metadata?: Record<string, unknown>;   // boundary-side notes (rare on input; usually internal).
}

// Caller context — extends the existing CallerContext seam. Tenant is
// derived server-side, NOT trusted from input.
interface IngestionCallerContext extends CallerContext {
  // F4.6B.1 inherits the existing CallerContext (tenantId?: string; userId?:
  // string; role?: string). Tenant scoping derives from the
  // IntegrationSource row at resolution time (§9). No new field.
}

// Result — per-sample outcomes plus aggregate counts.
interface IngestTelemetryBatchResult {
  batchId: string;                       // UUID generated server-side.
  correlationId?: string;                // echoed.
  acceptedCount: number;
  duplicateCount: number;
  conflictQuarantinedCount: number;
  rejectedQuarantinedCount: number;
  rejectedRequestCount: number;          // rare; whole-batch rejection lives in the controller layer
  results: IngestTelemetrySampleResult[];
}

interface IngestTelemetrySampleResult {
  sampleIndex: number;                   // index in the request `samples` array.
  outcome:
    | 'accepted'
    | 'duplicate'
    | 'conflict_quarantined'
    | 'rejected_quarantined'
    | 'rejected_request';
  telemetryReadingId?: string;           // present when outcome === 'accepted' (and on observed 'duplicate' if the existing row is resolvable cheaply; F4.6B.1 may set null for 'duplicate' to avoid an extra query).
  telemetryIngestionErrorId?: string;    // present when outcome is one of the *_quarantined or *_request values.
  reason?: TelemetryIngestionErrorReason;// present for *_quarantined / *_request outcomes.
  reasonDetail?: string;                 // free-form elaboration. Never raw stack traces.
}
```

### 5.3 Mode of operation — decisions

- **Batch-first.** The HTTP and service surface accepts batches. A single reading is `samples: [{...}]` (batch of 1). No separate single-sample endpoint.
- **Synchronous DB writes.** No queue, no worker, no async confirmation in F4.6B.1. Each sample is processed inline within the request lifecycle.
- **Per-sample transactional unit.** Each sample's processing (mapping resolution + normalization + dedup check + canonical insert OR quarantine insert) is its own short-lived transaction. The batch returns a per-sample outcome; one sample's failure does not abort the others. This matches the partial-success contract in §15.
- **No queue / worker.** F4.6B.1 does not introduce a job queue, scheduler, or background worker. If throughput pressure ever needs that, a later phase introduces it as its own ADR.
- **No external protocol assumptions.** The service does not know whether the caller is the simulator, a curl in local dev, or a future bridge process; it only sees the HTTP request via the controller.
- **`UnitConverter` and `CanonicalTagResolver` are reused.** Both are already exported by `TelemetryModule` (per `telemetry.module.ts`). The new module imports and uses them. No duplicated normalization logic.

## 6. Wire Contract / HTTP Boundary

### 6.1 Route

```
POST /api/v1/telemetry/ingest
```

Mounted by the new `TelemetryIngestionModule` only when the env flag is set (§8). The path is consistent with the existing `GET /api/v1/telemetry/trends`.

### 6.2 Request body — Zod-validated, camelCase

```json
{
  "integrationSourceId": "00000000-0000-0000-0000-000000000000",
  "correlationId": "optional-string",
  "samples": [
    {
      "externalIdentifier": "sep-001.pt-inlet",
      "timestamp": "2026-05-26T12:00:00.000Z",
      "value": 4123.4,
      "engineeringUnit": "psi",
      "quality": "good",
      "sequence": 1001,
      "rawPayload": { "...": "..." },
      "metadata": { "...": "..." }
    }
  ]
}
```

Field-shape conventions:

- **camelCase on the wire.** Consistent with existing API (e.g. `canonicalTagId`, `unitId`). The service maps to Prisma fields (also camelCase via `@map` in `schema.prisma`) without a separate adapter layer.
- **No snake_case wire fields.** No alternative casing accepted.
- **`integrationSourceId` is required at the request root.** It scopes the batch to one source. A single batch never spans multiple sources — keeps mapping resolution and tenant resolution cheap.
- **`samples` is non-empty and bounded.** `min(1).max(INGEST_BATCH_MAX)` — see §7.
- **`rawPayload` and `metadata` are opaque JSON.** Stored only on quarantine rows; ignored on accepted rows (canonical telemetry already records every field on the row itself).
- **`source` (the CHECK-enum kind string) is NOT in the wire shape.** It is derived from the resolved `IntegrationSource.kind` (already validated to be one of the ten allowed values by the DB CHECK). The boundary writes the kind into `telemetry_readings.source` after resolution. Untrusted callers cannot lie about source kind.

### 6.3 Batch limits

| Limit | Value | Rationale |
|---|---|---|
| `INGEST_BATCH_MAX` | **1000** | Conservative starting point. Trends endpoint defaults to 1000 / max 5000 reads (`TRENDS_LIMIT_DEFAULT`, `TRENDS_LIMIT_MAX`); writes start at the same floor with no upward stretch in F4.6B.1. Raised by F4.6C+ after profiling. |
| Request body size | governed by NestJS / Express default; not raised in F4.6B.1. | Same reasoning. |

### 6.4 Response

See §15 for the full response contract. Partial success is allowed (some samples accepted, some quarantined).

### 6.5 Error envelope (whole-request failures)

```json
{
  "statusCode": 400,
  "code": "INVALID_REQUEST",
  "message": "...",
  "issues": [ /* Zod issues array when applicable */ ]
}
```

- **No raw stack traces.** Logged server-side, never echoed in the response.
- **HTTP status codes used:**
  - `200` — batch processed (may include per-sample quarantine outcomes; partial success).
  - `400` — request shape invalid (Zod failure, malformed JSON, exceeds `INGEST_BATCH_MAX`).
  - `404` — endpoint not registered because env flag is unset (Nest default for unknown route). See §8.
  - `409` — **not** used. Conflicts are per-sample quarantine outcomes, not a batch-level error.
  - `500` — surfaced only on truly unexpected errors (e.g. DB unreachable). Logged server-side.

### 6.6 Partial success — explicit

The batch endpoint always returns `200` when the request body is structurally valid, even if every sample in the batch was quarantined. Per-sample outcomes are reported in `results[]`. This avoids the antipattern where one bad sample causes the entire batch to be reported as failed.

## 7. Validation Strategy

### 7.1 Layered validation

| Layer | Where | Job |
|---|---|---|
| **Wire schema** | `ZodValidationPipe` on the controller, against the request schema defined in `contracts/ingestion.ts`. | Reject malformed JSON, missing required fields, wrong types, unknown fields (`.strict()`), invalid UUIDs, invalid ISO-8601 timestamps, invalid quality strings, batch size > `INGEST_BATCH_MAX`, batch size < 1. → HTTP 400. |
| **Mapping resolution** | service (§10). | Reject `unknown_mapping`, `disabled_mapping`, `unresolved_sensor`, `unresolved_tag`, `tenant_mismatch`, `mapping_engine_failure`. → per-sample `rejected_quarantined` outcome. |
| **Normalization** | service (§11). | Reject `invalid_value`, `unit_mismatch`. → per-sample `rejected_quarantined` outcome. |
| **Temporal policy** | service (§11). | Reject `late_outside_window`, `future_timestamp`. → per-sample `rejected_quarantined` outcome. |
| **Dedup** | service (§12). | Detect `duplicate` (no-op) and `conflict_dedup` (quarantine). |

### 7.2 Strict Zod schema

```ts
// Sketch — final lives in contracts/ingestion.ts.
const INGEST_BATCH_MAX = 1000;

const IngestTelemetrySampleInputSchema = z.object({
  externalIdentifier: z.string().min(1).max(256),
  timestamp: z.string().datetime({ offset: true }), // RFC-3339 UTC
  value: z.union([z.number().finite(), z.string().regex(/^-?\d+(\.\d+)?$/)]),
  engineeringUnit: z.string().min(1).max(64).optional(),
  quality: z.enum(['good', 'uncertain', 'bad']),
  sequence: z.union([
    z.number().int().nonnegative(),
    z.string().regex(/^\d+$/),
  ]).optional(),
  rawPayload: z.unknown().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

const IngestTelemetryBatchInputSchema = z.object({
  integrationSourceId: z.string().uuid(),
  correlationId: z.string().min(1).max(128).optional(),
  samples: z.array(IngestTelemetrySampleInputSchema).min(1).max(INGEST_BATCH_MAX),
}).strict();
```

### 7.3 Wire-side aliasing

**Strict Zod enum for `quality`.** Aliases such as `suspect` → `uncertain` are **not** accepted at the wire. Rationale: keeps the boundary's outward contract precise; aliasing is a property of the upstream bridge that knows its source vocabulary, not of RVF's controlled boundary. If real upstream traffic ever forces it, an alias-table is added at the bridge layer (F4.6B+) or via a future small refinement of this Zod schema, but **not** unilaterally inside `TelemetryIngestionService`.

### 7.4 Outcome vocabulary (final, locked)

| Outcome | Description |
|---|---|
| `accepted` | Validated, mapped, deduped, persisted. One `telemetry_readings` row written. |
| `duplicate` | Dedup key matched an existing row with the same value. No row written. |
| `conflict_quarantined` | Dedup key matched an existing row with a different value. One `telemetry_ingestion_errors` row written with `reason = 'conflict_dedup'`. |
| `rejected_quarantined` | Mapping / normalization / temporal / envelope rule failed. One `telemetry_ingestion_errors` row written with the matching `reason`. |
| `rejected_request` | Sample passed wire validation but the wider request failed a request-level invariant (e.g. duplicate `(sampleIndex)` impossible because the array is indexed; reserved for future use). May not be emitted by F4.6B.1; included in the type for stability. |

The five outcome strings are the F4.6B.1 contract; F4.6C+ may extend but not rename.

### 7.5 Reason vocabulary — F4.6A.1 CHECK enum only

Quarantine `reason` strings on `telemetry_ingestion_errors.reason` are drawn **exclusively** from the CHECK enum that F4.6A.1 already landed in the database (commit `6be7842`):

```
late_outside_window | future_timestamp | unknown_source |
unknown_mapping | disabled_mapping | unresolved_sensor |
unresolved_tag | tenant_mismatch | invalid_quality |
invalid_value | unit_mismatch | outside_envelope |
conflict_dedup | inactive_context | mapping_engine_failure
```

**F4.6B.1 introduces no new `reason` value.** Every quarantine emitted by the boundary maps to one of these 15 strings. Any future need for a new reason requires a follow-up migration that widens the CHECK constraint and an explicit review — F4.6B.1 does not author such a migration.

In particular, `unknown_source` is an **approved F4.6A.1 reason value** used **only** to signal "the ingestion boundary cannot resolve the `integrationSourceId` provided in the request" (see §9.2 step 2). It is an **internal quarantine signal**, not an external-integration feature: it does not imply, enable, or assume support for any external bridge, broker, protocol, or vendor SDK (MQTT, Modbus, OPC-UA, ThingsBoard, Node-RED, PLC, edge-gateway, historian, etc., all remain out of scope per §17). The same neutrality applies to every other reason on the list.

The application-side mirror tuple lives in `contracts/ingestion.ts` (a Zod `enum` alongside the schema, mirroring the pattern of `TELEMETRY_QUALITIES` / `TELEMETRY_SOURCES` in the existing `contracts/trends.ts`), so the API response types and the runtime reasons stay in lockstep with the DB CHECK.

## 8. Environment Flag / Safety Gate

### 8.1 Flag name — decision

**`RVF_INGEST_ENABLED`.**

Resolved at backend boot via `ConfigModule` (already in `AppModule`).

### 8.2 Registration model — decision

**Conditional module registration in `AppModule`**, not a guard inside the controller.

```ts
// Sketch — final lives in app.module.ts. Conditional import.
const ingestEnabled = process.env.RVF_INGEST_ENABLED === 'true';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot(/* ... */),
    PrismaModule,
    HealthModule,
    RealtimeModule,
    TenantsModule,
    WellsModule,
    CanonicalTagsModule,
    EquipmentModule,
    JobsModule,
    TelemetryModule,
    ...(ingestEnabled ? [TelemetryIngestionModule] : []),
  ],
})
export class AppModule {}
```

**Why conditional module, not controller guard:**

- A guard returns 404 / 401 at request time, but the route still appears in Swagger and the controller is still instantiated. That is a footgun.
- Conditional module registration means the route truly does not exist when the flag is unset — Nest's default 404 is returned automatically.
- It mirrors the F4.2B quarantine pattern (modules excluded from `AppModule.imports`).

### 8.3 Behavior

| `RVF_INGEST_ENABLED` | Behavior |
|---|---|
| unset / `false` / any non-`'true'` value | `POST /api/v1/telemetry/ingest` returns HTTP 404 (Nest default). `TelemetryIngestionModule` is not instantiated. Swagger does not list the endpoint. |
| `'true'` | Endpoint mounted. Accepts requests with no auth (F4.6 inherits ADR-007 §7 no-auth posture). |

**Default production posture:** flag unset → endpoint not exposed. A production deployment must set the flag explicitly to expose it, and should pair the flag with network-layer isolation and a future auth boundary (successor ADR-009).

### 8.4 Service testability

`TelemetryIngestionService` may be **unit-tested directly** regardless of the env flag — vitest specs construct the service with a mocked Prisma and call `ingestBatch(...)` without going through Nest's HTTP layer. The flag only governs route registration in the running app.

### 8.5 Authentication / authorization

No real auth in F4.6B.1. F4.6 / ADR-008 already document this. F4.6B.1's only safety is the env flag plus network isolation expectations documented for operators. A successor ADR (candidate ADR-009) will design API-key / HMAC / OAuth for the ingestion endpoint.

## 9. Tenant Scoping

### 9.1 Decision

**Tenant identity is derived from `IntegrationSource`, never trusted from the request payload.**

### 9.2 Resolution flow

1. The request carries `integrationSourceId` (required, UUID).
2. The service loads the `IntegrationSource` row.
   - If absent → whole-sample outcome `rejected_quarantined`, `reason = 'unknown_source'` (an approved F4.6A.1 CHECK enum value; see §7.5), FK fields null. No tenant available — quarantine row's `tenant_id` is null. **No new reason is introduced by F4.6B.1.**
   - If `status !== 'active'` → quarantine `disabled_mapping` (when the boundary chooses to recycle the existing reason) or `inactive_context`. **F4.6B.1 decision: use `inactive_context`** for an `inactive` source (no Jobs implied; this is the operational-context-disabled meaning the brief allows). Quarantine row's `tenant_id` is populated from the source.
3. `tenantId := IntegrationSource.tenant_id`.
4. Downstream queries (mapping lookup, sensor lookup, canonical-tag lookup, dedup check, canonical insert) filter by this `tenantId`.

### 9.3 What the request never controls

- The request **cannot** specify a `tenantId`.
- The request **cannot** override the tenant resolved from the source.
- A mapping whose `tenant_id` does not match the source's `tenant_id` → quarantine `tenant_mismatch`. (Multi-tenant safety guard against misconfigured mappings.)

### 9.4 Dev / manual fallback

For dev / manual / curl usage, the F4.3 seed already provisions:

- One tenant: `RVF Internal`.
- One `IntegrationSource` row (currently inactive in seed): operators must either re-seed an active source or update its `status` to `active` before posting.

F4.6B-0 does **not** propose loosening the resolution rule for dev — instead, the seed (or a future small `seed.f4.dev.ts`, out of scope here) provisions an active dev source. Loosening the rule would create a foot-gun that leaks into production.

### 9.5 No `tenantId` header

A `tenantId` HTTP header (Option B from the brief) is rejected: it bypasses the IntegrationSource resolution and creates a path where the caller asserts tenancy. Until real auth lands, tenancy is server-derived.

## 10. Mapping Resolution

### 10.1 Flow

Per sample:

1. **Lookup `IntegrationMapping`** by `(integration_source_id, external_identifier)`. The existing `integration_mappings_source_external_uk` UNIQUE constraint guarantees at most one match.
2. **Check existence.**
   - Zero matches → `unknown_mapping`.
3. **Check enabled.**
   - `enabled = false` → `disabled_mapping`.
4. **Tenant alignment.**
   - `IntegrationMapping.tenant_id !== IntegrationSource.tenant_id` → `tenant_mismatch`. (Should not happen given how mappings are created; defensive.)
5. **Resolve `unit_id`.** Already on the mapping (NOT NULL FK).
6. **Resolve `sensor_id`.**
   - If `IntegrationMapping.sensor_id` is non-null → use it.
   - Else → resolve via active `SensorTagBinding`:
     - Search `sensor_tag_bindings` where `unit_id` matches and `canonical_tag_id = mapping.canonical_tag_id` (if mapping provides) and `effective_to IS NULL`.
     - Exactly one match → use that sensor.
     - Zero or multiple matches → `unresolved_sensor` (multiple = ambiguous, the partial unique on the binding shouldn't allow this but defensive).
7. **Resolve `canonical_tag_id`.**
   - If `IntegrationMapping.canonical_tag_id` is non-null → use it.
   - Else → derive from the active `SensorTagBinding` of the resolved sensor (zero matches → `unresolved_tag`).
8. **No payload-trust.**
   - The sample's `engineeringUnit` is checked against `IntegrationMapping.engineering_unit_override` (if set) or the canonical tag's `canonical_unit` (§11).
   - A `canonicalTagName` in the payload is **not** part of the wire shape (§6.2). If a future payload variant adds it, the boundary refuses to honor it when a mapping exists for the same `(integration_source_id, external_identifier)`.

### 10.2 Ambiguity matrix

| Resolution outcome | Quarantine reason |
|---|---|
| No mapping | `unknown_mapping` |
| Mapping disabled | `disabled_mapping` |
| Tenant mismatch | `tenant_mismatch` |
| Multiple active sensor candidates (defensive) | `mapping_engine_failure` |
| No sensor resolvable | `unresolved_sensor` |
| No canonical_tag resolvable | `unresolved_tag` |
| Mapping FK references a row that has been deleted (shouldn't happen, FK is `ON DELETE RESTRICT`) | `mapping_engine_failure` |

### 10.3 What never happens at the boundary

- The boundary does **not** create a mapping on the fly. Unknown external identifiers go to quarantine.
- The boundary does **not** modify or upgrade existing mappings. Mapping changes are an operator-driven flow (out of scope for F4.6B.1).
- The boundary does **not** trust source-side hints about which sensor a reading came from. Resolution is mapping-driven only.

## 11. Normalization Rules

### 11.1 Timestamp

- Parse the wire string as ISO-8601 (Zod `datetime({ offset: true })`).
- Convert to UTC `Date`. Store as `TIMESTAMPTZ`.
- **Future window:** if `timestamp > now() + INGESTION_MAX_FUTURE_SKEW` → `future_timestamp`. Default skew: **5 minutes**. Constant in `contracts/ingestion.ts`.
- **Late window:** if `timestamp < now() - INGESTION_MAX_LATE_WINDOW` → `late_outside_window`. Default: **7 days**. Constant in `contracts/ingestion.ts`.

Both windows are F4.6B.1 defaults; F4.6C+ can refine per-source if needed.

### 11.2 Value

- Parse to a numeric (Number or string-as-numeric). Convert to a Prisma `Decimal` for the insert.
- Reject `NaN`, `±Infinity`, unparseable → `invalid_value`.
- Reject string values that parse but lose precision in a way that JS can detect → also `invalid_value`. (Pragmatic check; if upstream needs higher precision, send the value as a string.)

### 11.3 Engineering unit

- If the sample's `engineeringUnit` is **omitted** → use the mapping's `engineering_unit_override` (if set) or the canonical tag's `canonical_unit`. Stored as-is.
- If the sample's `engineeringUnit` **matches** the expected unit (mapping override or canonical) → stored as-is.
- If the sample's `engineeringUnit` **differs** → F4.6B.1 quarantines as `unit_mismatch`. **No conversion at ingest time in F4.6B.1.** The retained `UnitConverter` provider is available for a future refinement (probably F4.6C+) that performs ingest-time conversion when a known conversion path exists. Engineering-unit **preservation** is the F4.6B.1 rule; **conversion** is a follow-up.

### 11.4 Quality

- Wire enum: `'good' | 'uncertain' | 'bad'`. Strictly validated by Zod (§7.3).
- No alias normalization at the boundary in F4.6B.1 (`suspect` → `uncertain` is a future bridge concern).
- `invalid_quality` quarantine reason is reserved for future scenarios where aliasing or relaxed validation is introduced and an unmappable value arrives.

### 11.5 `rawPayload`

- Accepted from the wire as `unknown`. **Not stored on the canonical `telemetry_readings` row** (canonical telemetry only carries the structured columns).
- **Stored on `telemetry_ingestion_errors.raw_payload`** when the sample is quarantined or rejected, to give operators forensic context.

### 11.6 `metadata`

- Accepted from the wire as opaque object. Same storage rule: not on canonical rows, **stored on `telemetry_ingestion_errors.metadata` only when quarantined**.
- The boundary may also write its own diagnostic snapshot into `metadata` (resolved IDs, dedup conflict snapshot `{ existing_value, incoming_value }`). The boundary-side and caller-side metadata are merged with the caller's keys taking precedence (or stored under separate top-level keys — F4.6B.1 picks at implementation time; this plan does not over-specify).

### 11.7 `ingestionTimestamp`

- Stored on quarantine rows: `now()` at the moment of the boundary's processing.
- Not stored on canonical telemetry rows separately — `telemetry_readings.created_at` already records the insert wall clock.

### 11.8 `outside_envelope` policy

- The `outside_envelope` quarantine reason exists in the CHECK enum, but **F4.6B.1 does NOT implement envelope checks.** Per-canonical-tag implausibility thresholds (e.g. negative pressure, vibration > 100×) are deferred to a later sub-phase that decides where envelope thresholds live (extension of `unit_operating_envelopes` or a new `canonical_tag_envelopes` table).
- F4.6B.1's `reason` enum still includes `outside_envelope` (DB CHECK already enforces the value), but no code path in F4.6B.1 emits it.

## 12. Deduplication and Conflict Policy

### 12.1 Dedup keys (F4.6A.1 schema)

- **Form A — sequence-based, source-aware:**
  `(integration_source_id, sensor_id, canonical_tag_id, sequence) WHERE sequence IS NOT NULL AND integration_source_id IS NOT NULL`.
  Enforced by `telemetry_readings_dedup_seq_uk`.
- **Form B — timestamp-based, canonical-instrument-keyed:**
  `(sensor_id, canonical_tag_id, "timestamp") WHERE sequence IS NULL`.
  Enforced by `telemetry_readings_dedup_ts_uk`.

### 12.2 F4.6B.1 dedup behavior

Per sample, after resolution and normalization:

1. **Attempt canonical insert** via `prisma.telemetryReading.create({ data: {...} })`.
2. **Catch `Prisma.PrismaClientKnownRequestError` with `code === 'P2002'`** (Postgres unique constraint violation on either dedup index).
3. On `P2002`:
   - Look up the existing row by the same dedup key.
   - Compare `value`, `quality`, `engineering_unit`, `source` field-by-field.
   - If **all match** → outcome `duplicate`. No quarantine row. No-op. Counter incremented in the batch result.
   - If **any differ** → outcome `conflict_quarantined`. Write a `telemetry_ingestion_errors` row with `reason = 'conflict_dedup'`, `metadata = { existing: {...}, incoming: {...} }`.

### 12.3 Why catch P2002 instead of pre-checking

Pre-checking ("does a row with this key exist?") is a TOCTOU race: a concurrent insert could land between the check and the insert. Catching the unique-violation error is the only race-safe pattern. The error path costs one extra round-trip on duplicate; the happy path costs zero. Acceptable.

### 12.4 No silent overwrite — binding

The boundary **never** issues `UPDATE` or `UPSERT` against `telemetry_readings`. `telemetry_readings` is append-only by architecture (F4 §F, ADR-007, F4.1 SQL). Conflicts always go to quarantine, never overwrite history.

### 12.5 `ingestion_id` on canonical rows

- F4.6B.1 sets `telemetry_readings.ingestion_id := sample.externalIdentifier` for forensic traceability.
- The `telemetry_readings_ingestion_id_idx` partial index (F4.6A.1) supports the lookup.
- This does not affect dedup — `ingestion_id` is not part of either dedup key in F4.6A.1. It is forensic only.

## 13. Persistence Flow

### 13.1 Per-sample order of operations

For each `sample` in `request.samples`:

1. **Wire validation passed** (already enforced by Zod pipe before the controller invokes the service; service treats inputs as validated shapes).
2. **Resolve source / tenant** (§9). On failure → write quarantine row, record outcome, continue to next sample.
3. **Resolve mapping** (§10). On failure → quarantine, continue.
4. **Normalize** (§11): timestamp, value, engineering unit, quality. On failure → quarantine, continue.
5. **Temporal policy check** (§11.1): late / future windows. On failure → quarantine, continue.
6. **Build the canonical row.** Fields:
   - `tenantId`, `unitId`, `sensorId`, `canonicalTagId` ← resolved.
   - `integrationSourceId` ← from request root.
   - `timestamp`, `value`, `engineeringUnit`, `quality` ← normalized sample.
   - `source` ← `IntegrationSource.kind` (CHECK-enum string).
   - `ingestionId` ← `sample.externalIdentifier`.
   - `sequence` ← `sample.sequence` (BigInt) if present, else null.
   - `jobId` ← null (no Jobs in F4.6B.1).
7. **Attempt insert** (`prisma.telemetryReading.create`). On success → outcome `accepted`, record `telemetryReadingId`, continue.
8. **Handle dedup outcome** (§12.2): `duplicate` → no row written; `conflict_quarantined` → write quarantine row.
9. **No live_readings update.** F4.6B.1 explicitly does not write to `live_readings` — that is F4.6C's job.
10. **No alarm evaluation.** F4.6B.1 does not write to `alarm_events` — that is F4.6D's job.
11. **No WebSocket emit.** F4.6B.1 does not publish realtime events — that is F4.6E's job.

### 13.2 No batch-level transaction

F4.6B.1 does **not** wrap the entire batch in one transaction. Each sample is independently transactional. Rationale:

- Partial success is the contract (§6.6). A batch transaction would force whole-batch rollback on any single failure, which contradicts partial-success.
- Per-sample atomicity is sufficient: each canonical row is either committed or its quarantine row is committed; never both, never neither (for a given sample).
- Throughput: per-sample transactions allow parallelism via Prisma's connection pool; a long batch transaction would serialize and block other requests.

### 13.3 What is **not** in F4.6B.1's persistence flow

- **No `live_readings` upsert.** F4.6C.
- **No `alarm_events` insert.** F4.6D.
- **No realtime emit.** F4.6E.
- **No `audit_logs` write for telemetry rows.** Telemetry rows themselves are not audited (canonical, append-only). Mapping or source changes — if F4.6B.1 ever modified them, which it does not — would write audit rows; F4.6B.1 only reads them.

## 14. Hooks / Extension Points

F4.6B.1 does **not** overreach into projection, alarm-evaluation, or fan-out runtime. The boundaries of the downstream phases are respected by *not building anything that belongs to them*, including no-op stand-ins.

### 14.1 What F4.6B.1 may do

- F4.6B.1 **may** define small extension seams as **internal TypeScript types or interfaces inside the ingestion module** (e.g. `apps/backend/src/telemetry/ingestion/contracts/ingestion.ts` or a sibling file) **only if** they materially improve code clarity for F4.6B.1's own logic. Examples of acceptable internal seams: a `MappingResolution` interface that captures the resolved `(tenantId, unitId, sensorId, canonicalTagId)` triple; an internal `IngestionOutcome` discriminated union mirroring §7.4.
- These seams are **internal to the ingestion module**. They are not exported as cross-module contracts, they do not anticipate the shape of `ProjectionUpdater` / `AlarmEvaluator` / `FanoutPublisher`, and they are not registered as Nest DI providers for downstream modules to swap.

### 14.2 What F4.6B.1 must not do

- **No projection module.** F4.6B.1 does not create any module / service / provider responsible for updating `live_readings`. **No `prisma.liveReading.*` mutation** is invoked. The `live_readings` table introduced by F4.6A.1 remains empty after F4.6B.1.
- **No alarm module.** F4.6B.1 does not create any alarm evaluator, threshold resolver, or `alarm_events` writer. **No `prisma.alarmEvent.*` mutation** is invoked.
- **No WebSocket / SSE fan-out module.** F4.6B.1 does not modify `apps/backend/src/realtime/`, does not introduce a Socket.IO gateway, and does not emit any realtime event. **No realtime publisher** is constructed.
- **No external adapter module.** F4.6B.1 does not create any module / service / file representing an MQTT, Modbus, OPC-UA, ThingsBoard, Node-RED, PLC, edge-gateway, or historian bridge. **No external library** is added to `apps/backend/package.json` for any such protocol.
- **No no-op stand-in modules.** F4.6B.1 does not register a `NoopProjectionUpdater` / `NoopAlarmEvaluator` / `NoopFanoutPublisher` (or any equivalent) as a Nest provider. The boundary's behavior is exactly: validate → resolve → normalize → dedup → persist OR quarantine. Hooks for the future phases live in the future phases themselves.

### 14.3 Ownership of the deferred concerns

| Concern | Owning phase | F4.6B.1 posture |
|---|---|---|
| `ProjectionUpdater` (writing `live_readings`) | **F4.6C** | F4.6B.1 does not introduce the interface, the provider, the no-op, or the call site. |
| `AlarmEvaluator` (writing `alarm_events`) | **F4.6D** | F4.6B.1 does not introduce the interface, the provider, the no-op, or the call site. |
| `FanoutPublisher` (WebSocket / SSE emit) | **F4.6E** | F4.6B.1 does not introduce the interface, the provider, the no-op, or the call site. |
| `ExternalAdapterBridge` (MQTT / OPC-UA / Modbus / ThingsBoard / Node-RED / PLC / edge-gateway / historian) | later adapter-specific phase, **per concrete bridge** | F4.6B.1 does not stub a generic bridge interface. Each future bridge phase will design its own seam against the public HTTP endpoint or, where in-process makes sense, against the service's public `ingestBatch` method. |

### 14.4 How F4.6C / F4.6D / F4.6E add their behavior later

When the time comes, each owning phase will:

- Introduce its own module / service inside `apps/backend/src/telemetry/` (or a sibling location appropriate to its concern).
- Decide *at that phase* whether the integration point with the ingestion service is a Nest DI provider swap, a direct service-to-service call, a domain-event mechanism, or a post-commit hook on a small in-module event emitter.
- Modify the ingestion service **at that time**, not in F4.6B.1, to invoke the new collaborator at the right point in the persistence flow.

F4.6B.1's job is to land a clean boundary that **does its own work correctly**. The downstream phases will retrofit their collaborator wiring without rewriting the boundary's core logic, because the persistence flow (§13) is a stable seam that subsequent edits will add side effects to rather than restructure.

## 15. HTTP Response Contract

### 15.1 Success response (HTTP 200)

```json
{
  "batchId": "00000000-0000-0000-0000-000000000000",
  "correlationId": "echoed-if-supplied",
  "acceptedCount": 0,
  "duplicateCount": 0,
  "conflictQuarantinedCount": 0,
  "rejectedQuarantinedCount": 0,
  "rejectedRequestCount": 0,
  "results": [
    {
      "sampleIndex": 0,
      "outcome": "accepted",
      "telemetryReadingId": "00000000-0000-0000-0000-000000000000"
    },
    {
      "sampleIndex": 1,
      "outcome": "duplicate"
    },
    {
      "sampleIndex": 2,
      "outcome": "conflict_quarantined",
      "telemetryIngestionErrorId": "00000000-0000-0000-0000-000000000000",
      "reason": "conflict_dedup",
      "reasonDetail": "existing.value=4123.4 incoming.value=4124.0"
    },
    {
      "sampleIndex": 3,
      "outcome": "rejected_quarantined",
      "telemetryIngestionErrorId": "00000000-0000-0000-0000-000000000000",
      "reason": "unknown_mapping"
    }
  ]
}
```

### 15.2 Field-shape conventions

- `batchId`: server-generated UUID. Echoed by the service; useful for log correlation.
- `correlationId`: caller-supplied (optional); echoed verbatim.
- Counts: every outcome category has its own count for monitoring / dashboarding.
- `results`: one entry per request `sample`, in the original order. `sampleIndex` makes order-independent inspection trivial.
- `telemetryReadingId`: present **only** when `outcome === 'accepted'`. `duplicate` does not return the existing row's id (cheap-path optimization; F4.6C may revise).
- `telemetryIngestionErrorId`: present **only** for `*_quarantined` and `rejected_request` outcomes.
- `reason`: present **only** for `*_quarantined` and `rejected_request` outcomes. Drawn from the 15-value enum on `telemetry_ingestion_errors.reason`.
- `reasonDetail`: optional free-form elaboration. **Never** contains raw stack traces. Bounded length.

### 15.3 Failure response (HTTP 400 / 5xx)

```json
{
  "statusCode": 400,
  "code": "INVALID_REQUEST",
  "message": "request body did not match the ingest schema",
  "issues": [
    { "path": ["samples", 0, "quality"], "message": "expected 'good'|'uncertain'|'bad'" }
  ]
}
```

Standard Nest exception shape (matches existing error handling pattern from `ZodValidationPipe`). No raw stack traces. Issues array is structured (Zod `issues`) when applicable.

### 15.4 No partial-body streaming

F4.6B.1 emits the whole response after processing all samples. Server-sent events / streaming responses for large batches are a possible F4.6C+ refinement; not in F4.6B.1.

## 16. Test Plan for F4.6B.1

### 16.1 Test framework and pattern

- **vitest** (already in use), with **mocked Prisma** (the same pattern as `trends.service.spec.ts` and `canonical-tag-resolver.spec.ts`).
- **No live DB in unit tests.** A live-DB integration suite is out of scope for F4.6B.1 and a separate F4 test-harness story.
- **No real HTTP roundtrip in service specs.** Controller specs (optional in F4.6B.1) may use Nest's `TestingModule` to mock the service and verify request/response shape.

### 16.2 Required service-level specs (`telemetry-ingestion.service.spec.ts`)

The mocked-Prisma suite must cover every outcome plus the structural invariants:

| # | Test | Verifies |
|---|---|---|
| 1 | Wire-validated input that resolves cleanly → `accepted`, one canonical row inserted into `telemetry_readings` with the resolved `(tenantId, unitId, sensorId, canonicalTagId, integrationSourceId)`. | Happy path. |
| 2 | Same dedup key + identical value → `duplicate`. No quarantine row. | Form A or B dedup, identical case. |
| 3 | Same dedup key + different value → `conflict_quarantined`, one quarantine row with `reason='conflict_dedup'`. | Conflict path. Mock raises `Prisma.PrismaClientKnownRequestError` with `code='P2002'`; spec asserts the boundary's lookup-then-classify behavior. |
| 4 | `integrationSourceId` not found → `rejected_quarantined`, `reason='unknown_source'`. | Source resolution. |
| 5 | `IntegrationSource.status='inactive'` → `rejected_quarantined`, `reason='inactive_context'`. | Disabled source. |
| 6 | Mapping not found → `rejected_quarantined`, `reason='unknown_mapping'`. | Mapping resolution. |
| 7 | Mapping disabled → `rejected_quarantined`, `reason='disabled_mapping'`. | Disabled mapping. |
| 8 | Mapping without `sensor_id`, active binding ambiguous → `rejected_quarantined`, `reason='unresolved_sensor'`. | Resolution edge case. |
| 9 | Mapping without `canonical_tag_id`, no active binding → `rejected_quarantined`, `reason='unresolved_tag'`. | Resolution edge case. |
| 10 | `IntegrationMapping.tenant_id !== IntegrationSource.tenant_id` → `rejected_quarantined`, `reason='tenant_mismatch'`. | Multi-tenant safety. |
| 11 | Sample `value` is `NaN` / unparseable → `rejected_quarantined`, `reason='invalid_value'`. | Value normalization. |
| 12 | Sample `engineeringUnit` differs from mapping's expected unit → `rejected_quarantined`, `reason='unit_mismatch'`. | Unit preservation rule. |
| 13 | Sample `timestamp` > now + 5 min → `rejected_quarantined`, `reason='future_timestamp'`. | Future window. |
| 14 | Sample `timestamp` < now - 7 days → `rejected_quarantined`, `reason='late_outside_window'`. | Late window. |
| 15 | Batch with 5 samples — mixed outcomes (accepted + duplicate + conflict + rejected_quarantined) — verify per-sample results, counts, and that one bad sample does not block the others. | Partial success. |
| 16 | Service does **not** call `prisma.liveReading.create` or any other `liveReading` mutation. | Live projection isolation. |
| 17 | Service does **not** call `prisma.alarmEvent.create`. | Alarm isolation. |
| 18 | Service does **not** call any realtime / WebSocket / Socket.IO publisher. | Fan-out isolation. |
| 19 | Service does **not** look up or write any Jobs / CommissioningSnapshot row. | Jobs deferral. |
| 20 | `ingestBatch` accepts the existing `CallerContext` seam and resolves tenant from the source, **ignoring** any `ctx.tenantId` passed in. | CallerContext / tenant resolution rule. |

### 16.3 Optional controller spec (`telemetry-ingestion.controller.spec.ts`)

| Test | Verifies |
|---|---|
| Env flag unset → module not registered → request returns 404 (verified by absence of route in `TestingModule`). | §8.2 conditional registration. |
| Env flag set + Zod-invalid body → 400 with structured `issues`. | Wire validation. |
| Env flag set + valid body → service called once; response echoes service result. | Happy controller path. |

### 16.4 Mocks and partial unique indexes

Vitest mocks of `prisma.telemetryReading.create` do **not** automatically enforce the partial unique indexes. The dedup tests (#2, #3, #15) work by **explicitly throwing** `Prisma.PrismaClientKnownRequestError` with `code='P2002'` from the mock for the matching dedup key. The spec verifies the boundary's reaction to that error rather than the index itself. A future live-DB integration suite (out of scope) verifies the real index behavior.

### 16.5 No new test infrastructure

F4.6B.1 does not introduce new test fixtures, helpers, or runtime configuration beyond what F4.4F established. The existing pattern is sufficient.

## 17. Out of Scope for F4.6B.1

Explicitly **not** part of F4.6B.1:

- **MQTT integration.** No broker selection, no library install, no consumer process.
- **Modbus integration.**
- **OPC-UA integration.**
- **ThingsBoard bridge.**
- **Node-RED bridge.**
- **PLC adapter.**
- **Historian adapter.**
- **Edge-gateway adapter.**
- **Simulator runtime.** No in-process simulator module is mounted in F4.6B.1. The `RVF_TELEMETRY_SIMULATOR` flag suggested in F4.6 architecture is **not** wired by F4.6B.1; a later sub-phase introduces it as its own deliverable.
- **`live_readings` updater.** F4.6C.
- **Alarm evaluator and `alarm_events` writes.** F4.6D.
- **WebSocket / SSE fan-out.** F4.6E.
- **Jobs model wiring.** Deferred; no `closed_job` reason; no `jobId` on `telemetry_readings` populated by F4.6B.1.
- **Jobs UI.**
- **Frontend changes.** No file under `apps/web/` is modified.
- **Production authentication / authorization.** ADR-009 candidate.
- **Queue / worker architecture.** Out of scope.
- **TimescaleDB.** ADR-010 candidate.
- **Quarantine retention / pruner job.** Default 30-day guidance; no pruner implemented.
- **`outside_envelope` code path.** Reason exists in the CHECK enum; no F4.6B.1 code emits it.
- **Engineering-unit conversion at ingest time.** F4.6B.1 preserves; conversion is a refinement.
- **Quality aliasing at the boundary.** Strict three-value enum on the wire.
- **Updates to `IntegrationSource` / `IntegrationMapping` rows.** F4.6B.1 only reads them. Operator-driven CRUD for these tables is a later phase.
- **Removal of `live_readings_projection` VIEW.** Preserved per F4.6A.0 §5.E.

## 18. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Ingestion endpoint accidentally exposed in production. | medium | high | Conditional module registration via `RVF_INGEST_ENABLED` (§8.2); default unset = endpoint not registered (Nest returns 404, no module instantiated). Operational checklist: production builds run with the flag unset until ADR-009 lands real auth. |
| Trusting payload canonical identity (e.g. payload-supplied `tenantId` or `canonicalTagName`). | low | high | Wire schema (§7.3) does not contain `tenantId`. Tenant is server-derived from `IntegrationSource` (§9). Mapping resolution is FK-driven, not label-driven (§10). Reviewer rejects any PR that adds tenant or canonical-tag-name trust at the boundary. |
| Dedup bug — partial unique index NULL-handling. | medium | medium | The two partial indexes (F4.6A.1) include explicit `WHERE` predicates excluding NULL. F4.6B.1 inserts populate `integration_source_id` when known, leaving NULL for legacy / simulator paths (which don't exist in F4.6B.1 itself). Spec #2 / #3 / #15 cover the dedup behavior with mocked P2002 errors. A live-DB integration test (future) verifies the real index. |
| Dedup TOCTOU race between concurrent inserts. | medium | medium | Catch `P2002` after insert rather than pre-check (§12.3). |
| Quarantine overuse — too many drafts ending up as `rejected_quarantined` due to over-strict validation. | medium | low | Wire schema is strict but not capricious (datetime offset required, value parseable, quality enum). Reason vocabulary (15 values) gives operators clear signals. Retention default (30 days) bounds growth. F4.6B.1 tests verify each reason is emitted only where intended. |
| Tenant leakage via misconfigured mapping. | low | high | Mapping-tenant vs source-tenant alignment check (§10.1 step 4) → `tenant_mismatch` quarantine. Service-side filter on every Prisma query uses the source-resolved tenantId, not the request. |
| Accidentally introducing an external-platform dependency (MQTT/OPC-UA library install). | low | high | F4.6B.1 scope (§17) explicitly excludes all external libraries. Reviewer rejects any `pnpm add mqtt` / `opcua-client` / `modbus-serial` / etc. in F4.6B.1. |
| Mutating `live_readings` too early. | medium | medium | F4.6B.1 service must not call `prisma.liveReading.*`. Service spec #16 fails if it does. F4.6C explicitly owns this. |
| Test mocks diverging from the partial unique indexes' real behavior. | medium | low | Mocks throw `P2002` to simulate the violation; the boundary's reaction is what's tested. A future live-DB integration test verifies index behavior at the DB layer. Documented in §16.4. |
| `closed_job` / Jobs-specific behavior leaking into the boundary. | very low | medium | `reason` enum in `contracts/ingestion.ts` mirrors the DB CHECK exactly — no `closed_job`. Service spec #19 fails if any Jobs lookup happens. Reviewer rejects any introduction. |
| Forgetting to wire `integrationSourceId` on canonical inserts. | low | medium | Insert builder (§13.1 step 6) is explicit: `integrationSourceId` is one of the named fields. Service spec #1 asserts `integration_source_id` is set on the inserted row. |
| `engineeringUnit` casing / normalization mismatch (e.g. `Psi` vs `psi`). | low | low | F4.6B.1 compares unit strings verbatim (no case-folding). Reviewer can decide to add a small normalization layer later if real upstream traffic shows it's needed; F4.6B.1 stays strict. |
| Decimal precision loss when parsing values from JSON numbers. | low | medium | Wire accepts numeric **or** string-as-numeric (§7.3). Upstream sources requiring > 15 significant digits should send strings. Documented in the controller's Swagger description. |

## 19. Acceptance Criteria for F4.6B-0

F4.6B-0 is considered complete when all of the following are true:

| # | Criterion |
|---|---|
| 1 | Plan document created at `docs/architecture/RVF_Malinois_F4_6B_Ingestion_Boundary_Plan.md`. |
| 2 | Endpoint contract decided (§6): `POST /api/v1/telemetry/ingest`, camelCase wire, batch-first, partial success, response shape with per-sample results and aggregate counts. |
| 3 | Service interface decided (§5): `ingestBatch(input, ctx)` with the locked-down `IngestTelemetryBatchInput` / `IngestTelemetrySampleInput` / `IngestTelemetryBatchResult` / `IngestTelemetrySampleResult` shapes. |
| 4 | Env flag decided (§8): **`RVF_INGEST_ENABLED`**, conditional module registration in `AppModule.imports`, default unset → endpoint not registered. |
| 5 | Tenant scoping policy decided (§9): tenant derived from `IntegrationSource`, never trusted from payload; no `tenantId` header. |
| 6 | Mapping resolution policy decided (§10): mapping-driven, FK-based, ambiguity-quarantined. `canonicalTagName` from untrusted payloads not honored when a mapping exists. |
| 7 | Dedup / conflict policy decided (§12): Form A (source-aware sequence) and Form B (canonical-instrument timestamp) from F4.6A.1; identical-duplicate = no-op, value-conflict = quarantine, never overwrite. |
| 8 | Persistence + quarantine flow decided (§13): per-sample transactional unit; no batch-level transaction; partial success; no `live_readings` or `alarm_events` writes. |
| 9 | F4.6B.1 scope is clearly bounded (§17): no MQTT / Modbus / OPC-UA / ThingsBoard / Node-RED / PLC / historian / simulator / live_readings updater / alarm evaluator / WebSocket / Jobs / frontend changes. |
| 10 | Test plan decided (§16): 20 service tests + optional controller tests; mocked Prisma; no live DB. |
| 11 | No runtime code changed by F4.6B-0. |
| 12 | No Prisma schema changed by F4.6B-0. |
| 13 | No migration added by F4.6B-0. |
| 14 | No frontend changed by F4.6B-0. |
| 15 | No backend service / controller / module / route added by F4.6B-0. |
| 16 | No external integrations introduced by F4.6B-0. |
| 17 | Jobs remain deferred; no Jobs flow, lookup, or quarantine reason introduced. |
| 18 | RVF Malinois reaffirmed as canonical system of record; PostgreSQL reaffirmed as baseline; TimescaleDB and external systems remain non-mandatory. |
| 19 | Transmitter-first / sensor-first direction preserved (dedup key, mapping resolution, persistence flow). |
| 20 | Historical telemetry vs live projection distinction preserved (`live_readings` not written by F4.6B.1). |
| 21 | F4.6B.1 may begin only after this plan is reviewed and approved. |

## 20. Recommended Next Step

**F4.6B.1 — Telemetry Ingestion Boundary Runtime Skeleton.**

After this plan is reviewed and approved, F4.6B.1 may begin. F4.6B.1 implements exactly the scope locked in this document and produces:

- A new submodule under `apps/backend/src/telemetry/ingestion/` with: `telemetry-ingestion.module.ts`, `telemetry-ingestion.controller.ts`, `telemetry-ingestion.service.ts`, `contracts/ingestion.ts`, plus the mocked-Prisma service spec (and optionally the controller spec).
- Conditional registration in `apps/backend/src/app.module.ts` behind `RVF_INGEST_ENABLED`.
- Reuse of the existing `CanonicalTagResolver` and `UnitConverter` providers exported by `TelemetryModule`.
- Optional small internal extension seams *inside the ingestion module only*, if useful for code clarity (§14.1). **No** `ProjectionUpdater` / `AlarmEvaluator` / `FanoutPublisher` / `ExternalAdapterBridge` module, provider, no-op, or call site. Those belong to F4.6C / F4.6D / F4.6E and later adapter-specific phases respectively.
- Green quality gates: `prisma validate`, `prisma generate`, backend `lint / typecheck / build / test` (target: 69 baseline + ≥ 20 new = 89+ tests).
- Closeout report at `docs/architecture/RVF_Malinois_F4_6B_1_Ingestion_Boundary_Skeleton_Closeout_Report_v1.0.md`.

F4.6B.1 **must not** begin until F4.6B-0 is reviewed and approved.

Parallel work that does not depend on F4.6B-0 / F4.6B.1:

- **F4.5G+** — per-screen migration of Wells / Equipment / Catalog from the F3 mock adapter to the corresponding F4.5B / F4.5C adapter, following the F4.5F template. Cero dependencia con F4.6.

---

*F4.6B-0 plan. Service contract locked, wire shape locked, env-flag gate locked, mapping / dedup / quarantine flow locked. F4.6B.1 implements them.*
