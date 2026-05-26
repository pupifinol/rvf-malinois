# RVF Malinois F4.6C-0 — Live Readings Projection Updater Plan

> Phase **F4.6C-0 — Live Readings Projection Updater Plan**. Plan-only / documentation-only.
> First plan in the F4.6C arc. Defines how `live_readings` will be populated and updated from accepted telemetry once F4.6C.1 ships. **No service, controller, module, contract, test, schema, migration, config, frontend, or CI file is created or modified in F4.6C-0.**
>
> Upstream references:
> - F4.6 architecture: `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Architecture.md` (commit `c12a29c`)
> - ADR-008 (Proposed): `docs/adr/ADR-008_RVF_Malinois_Telemetry_Persistence_Ingestion.md` (commit `c12a29c`)
> - F4.6 closeout: `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Closeout_Report_v1.0.md` (commit `334bfc5`)
> - F4.6A.0 schema-hardening plan: `docs/architecture/RVF_Malinois_F4_6A_Schema_Hardening_Plan.md` (commit `014df37`)
> - F4.6A.1 migration closeout: `docs/architecture/RVF_Malinois_F4_6A_1_Schema_Hardening_Migration_Closeout_Report_v1.0.md` (commit `6be7842`)
> - F4.6B-0 ingestion boundary plan: `docs/architecture/RVF_Malinois_F4_6B_Ingestion_Boundary_Plan.md` (commit `c4ea18a`)
> - F4.6B.1 ingestion skeleton closeout: `docs/architecture/RVF_Malinois_F4_6B_1_Ingestion_Boundary_Skeleton_Closeout_Report_v1.0.md` (commit `1495457`)
> - Master Roadmap (DX-1): `docs/architecture/RVF_Malinois_Master_Roadmap.md` (commit `b19e77a`)
> - Local DB Migration Validation Procedure (DX-2): `docs/operations/RVF_Malinois_Local_DB_Migration_Validation_Procedure.md` (commit `e3ccb52`)
> - Definition of Done (DX-3): `docs/operations/RVF_Malinois_Definition_of_Done.md` (commit `65cb736`)

## 1. Purpose

F4.6C-0 defines **how RVF Malinois will update the `live_readings` projection table from accepted telemetry readings**. The plan locks the placement, the trigger point, the transactional posture, the quality gate, the timestamp watermark, the upsert strategy, the idempotency rule, and the test plan that F4.6C.1 will implement mechanically.

Two architectural truths gate every decision in this plan:

1. **`telemetry_readings` remains canonical historical truth.** Append-only. Immutable. F4.6C touches neither its rows nor its shape.
2. **`live_readings` is a derived latest-value projection.** Rebuildable from `telemetry_readings`. Loss is recoverable. Not canonical.

F4.6C.1 will be the **first phase authorized to call `prisma.liveReading.*`**. Every other backend phase to date — including F4.6B.1, where `liveReading` access was explicitly forbidden by F4.6B-0 §14.2 and verified by isolation test #17 — has left this table empty. F4.6C is the dedicated scope per Master Roadmap §3 / §7 and Definition of Done §16. The DoD §12 forbidden-area answer to question 9 ("Did this phase write `live_readings`?") becomes **"yes — F4.6C scope authorizes it"** for the duration of F4.6C.1, and only for F4.6C.1's authorized code paths.

This plan does not implement code. F4.6C.1 will.

## 2. Current Scope

F4.6C-0 is strictly:

- **Plan-only.** A single new documentation file under `docs/architecture/`.
- **No runtime code.** No file under `apps/backend/src/`, `apps/web/`, `packages/`, or any root path is modified.
- **No Prisma schema changes.** `apps/backend/prisma/schema.prisma` untouched.
- **No migration added.** `apps/backend/prisma/migrations/` untouched.
- **No backend source / frontend / tests / config / package changes.**
- **No WebSocket / SSE.** `apps/backend/src/realtime/` untouched.
- **No alarm engine.** F4.6D's responsibility.
- **No external protocol integrations.** No MQTT / Modbus / OPC-UA / ThingsBoard / Node-RED / PLC / edge-gateway / historian client touched.
- **No simulator runtime.** Deferred.
- **No Jobs model or Jobs UI.** ADR-008 / F4.6 / F4.6B Jobs deferral preserved.

## 3. Inputs Reviewed

| Artifact | Path |
|---|---|
| F4.6 Telemetry Persistence Architecture | `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Architecture.md` |
| ADR-008 (Proposed) | `docs/adr/ADR-008_RVF_Malinois_Telemetry_Persistence_Ingestion.md` |
| F4.6A.0 schema-hardening plan | `docs/architecture/RVF_Malinois_F4_6A_Schema_Hardening_Plan.md` |
| F4.6A.1 closeout report | `docs/architecture/RVF_Malinois_F4_6A_1_Schema_Hardening_Migration_Closeout_Report_v1.0.md` |
| F4.6B-0 ingestion boundary plan | `docs/architecture/RVF_Malinois_F4_6B_Ingestion_Boundary_Plan.md` |
| F4.6B.1 closeout report | `docs/architecture/RVF_Malinois_F4_6B_1_Ingestion_Boundary_Skeleton_Closeout_Report_v1.0.md` |
| Master Roadmap (DX-1) | `docs/architecture/RVF_Malinois_Master_Roadmap.md` |
| Definition of Done (DX-3) | `docs/operations/RVF_Malinois_Definition_of_Done.md` |
| Local DB Migration Validation Procedure (DX-2) | `docs/operations/RVF_Malinois_Local_DB_Migration_Validation_Procedure.md` |
| Current Prisma schema | `apps/backend/prisma/schema.prisma` |
| Current ingestion module | `apps/backend/src/telemetry/ingestion/` (module / controller / service / contracts / spec) |
| F4.6A.1 migration | `apps/backend/prisma/migrations/20260526000000_f4_6a_telemetry_hardening/migration.sql` |

### Confirmed facts before authoring

- **`live_readings` table exists** (F4.6A.1) with the schema documented in §11 below. It has a `UNIQUE (unit_id, sensor_id, canonical_tag_id)` constraint (the `live_readings_unit_sensor_tag_uk` natural key) plus a surrogate `id` PK.
- **`live_readings_projection` SQL VIEW remains preserved** (non-destructive coexistence per F4.6A.0 §5.E). F4.6C-0 does not remove it.
- **The ingestion boundary** (`TelemetryIngestionService` in `apps/backend/src/telemetry/ingestion/`, commit `1495457`) currently calls `this.prisma.telemetryReading.create({...})` on accepted samples and explicitly does NOT touch `liveReading`. F4.6B.1 isolation test #17 enforces this.
- **F4.6B-0 §14.2 forbade** introducing a `ProjectionUpdater` interface, no-op stand-in, or DI provider in F4.6B.1. F4.6C is the authorized scope where the projection runtime is introduced for the first time. F4.6C.1 will edit `TelemetryIngestionService` minimally to wire the new collaborator at the point in the per-sample flow where it belongs.

## 4. Existing State After F4.6B.1

| Element | State |
|---|---|
| `telemetry_readings` | Populated by `TelemetryIngestionService` on `accepted` outcomes. Carries `integration_source_id`, `ingestion_id`, optional `sequence`, `job_id = null` (Jobs deferred). |
| `telemetry_ingestion_errors` | Populated on every non-acceptance outcome (`conflict_quarantined`, `rejected_quarantined`, `rejected_request`). 15 CHECK-enum reasons; no `closed_job`. |
| `live_readings` | **Table exists, empty.** F4.6B.1 never writes it. |
| `live_readings_projection` (VIEW) | Preserved verbatim from F4.2B baseline. Returns `DISTINCT ON (unit_id, sensor_id)` over `telemetry_readings`. No active consumer today. |
| Ingestion endpoint | `POST /api/v1/telemetry/ingest`, env-flag-guarded by `RVF_INGEST_ENABLED`; route does not register unless flag is `'true'`. |
| Alarm evaluator | None. `alarm_events` table provisioned but no row ever written. F4.6D scope. |
| WebSocket / SSE | `apps/backend/src/realtime/` mounted but routes no telemetry. F4.6E scope. |
| Jobs | No active flow. `job_id = null` on every canonical insert. F4.6B.1 isolation test #20 asserts this. |
| External integrations | None. No MQTT / Modbus / OPC-UA / ThingsBoard / Node-RED / PLC / edge-gateway / historian client mounted. |

The state above is the invariant F4.6C.1 inherits. F4.6C.1's job is to add the projection writer without disturbing any of these.

## 5. Projection Ownership Decision

### 5.1 Options evaluated

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Add projection logic directly inside `TelemetryIngestionService`. | Fewest moving parts; one service. | Mixes ingestion validation/dedup with projection concerns; harder to test in isolation; harder to retire/replace the projection mechanism later (e.g. if F4.6C+ swaps to a materialized view, every change touches the boundary service). |
| **B** | **Create a dedicated internal `LiveReadingsProjectionService` under the telemetry domain. Call it from the ingestion flow after a canonical `telemetryReading.create` succeeds.** | Clear separation of ingestion vs projection. Independently testable. Leaves the boundary service's surface stable. Keeps future F4.6D `AlarmEvaluator` and F4.6E `FanoutPublisher` collaborators each on their own seam. | Adds one Nest provider. |
| C | Create a generic projections module. | Anticipates future projections. | Over-engineering for one projection. F4.6C.1 has one job; abstraction can wait. |
| D | Use a database trigger. | "Always runs." | Hidden behavior outside backend ownership; harder to test; harder to evolve; reaches across the boundary the project is deliberately preserving (RVF-owned business logic, not DB-owned). Violates the spirit of ADR-008 §3 decision 10 (alarm evaluation backend-owned) by analogy. |

### 5.2 Recommendation

**Option B — dedicated backend-owned `LiveReadingsProjectionService`.**

The service lives under the telemetry domain (`apps/backend/src/telemetry/projection/` — see §6). It is **internal** to backend telemetry runtime; no HTTP controller, no public API surface. The ingestion flow calls it as the last step of the `accepted` path, after the canonical `telemetryReading.create` succeeds.

### 5.3 Rationale

1. **Separation of concerns.** Ingestion's job (validate → resolve → normalize → dedup → persist OR quarantine) and projection's job (maintain latest-value view of accepted history) are different responsibilities. Splitting them keeps each service's tests focused.
2. **Testability.** `LiveReadingsProjectionService` is unit-testable against a mocked Prisma in isolation from the full ingestion flow. The boundary service's existing 22 tests stay valid.
3. **No hidden DB-trigger behavior.** Triggers are invisible from the application code. RVF-owned business logic is preferred per ADR-008.
4. **Backward-compatible seam for future phases.** F4.6D will introduce a separate `AlarmEvaluator`; F4.6E will introduce a separate `FanoutPublisher`. Each gets its own service, each is called from the same per-sample `accepted` path. The pattern scales.
5. **Reversal cost.** If the project decides later to swap the upsert-table projection for a materialized view (or vice versa), only the projection service changes; the ingestion boundary does not.

### 5.4 What F4.6C.1 does NOT introduce

Per the F4.6B-0 §14 spirit, even though F4.6C.1 introduces a real collaborator, it must **not**:

- Introduce a `ProjectionUpdater` generic interface that pre-shapes F4.6D's `AlarmEvaluator` or F4.6E's `FanoutPublisher`. Each future collaborator decides its own shape at its own phase.
- Introduce DI provider abstractions designed for "future swappability" beyond what F4.6C.1 itself needs.
- Bundle alarm or fan-out hooks into the projection service.

## 6. Proposed File Placement for F4.6C.1

The following paths are **candidates** for F4.6C.1 to author. F4.6C-0 does not create them.

| Path | Purpose |
|---|---|
| `apps/backend/src/telemetry/projection/live-readings-projection.service.ts` | The `LiveReadingsProjectionService` class. Exports `applyAcceptedReading(...)` (or equivalent — F4.6C.1 picks the final method name). |
| `apps/backend/src/telemetry/projection/live-readings-projection.service.spec.ts` | Mocked-Prisma vitest spec covering every required behavior in §16. |

### 6.1 Module wiring

The `TelemetryIngestionModule` (currently exporting only `TelemetryIngestionService`) will **add the projection service as a provider** in F4.6C.1. The new service is NOT a candidate for a separate Nest module unless future structural needs require it. Bare-minimum wiring:

```ts
// In TelemetryIngestionModule (F4.6C.1 edit):
@Module({
  controllers: [TelemetryIngestionController],
  providers: [TelemetryIngestionService, LiveReadingsProjectionService],
  exports: [TelemetryIngestionService],
})
export class TelemetryIngestionModule {}
```

If F4.6C.1 finds an alternative project pattern (e.g. a separate sibling `TelemetryProjectionModule` already used elsewhere — none today), the closeout report should document the deviation. The default direction is "no new Nest module".

### 6.2 Ingestion service edit

`apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.ts` will be **minimally edited** in F4.6C.1 to:

- Inject `LiveReadingsProjectionService` via constructor.
- After a successful `telemetryReading.create()` for a `good`-quality sample, call `projection.applyAcceptedReading(...)` with the created row's data.
- On non-`good` quality (`uncertain` / `bad`), the call is **not** made (see §8).
- On dedup `duplicate` / `conflict_quarantined`, the call is **not** made (see §7).

### 6.3 What F4.6C.1 does NOT touch

- **No controller.** Projection has no HTTP surface in F4.6C.1.
- **No frontend file** under `apps/web/`.
- **No new module file.** `live-readings-projection.module.ts` is not authored unless the closeout report justifies it.
- **No contract file.** The projection service's input shape is a thin typed argument (likely a partial of `TelemetryReading` plus a couple of context fields); no public Zod schema is added.
- **No Prisma schema or migration change.** The F4.6A.1 schema already provides every column F4.6C.1 needs.

## 7. Projection Trigger Point

### 7.1 When the projection updater is invoked

The projection update **is invoked only after a canonical `telemetry_readings` row insert succeeds**.

### 7.2 When the projection updater is NOT invoked

The projection updater is **not** invoked when the sample's outcome is any of:

- `duplicate` — no canonical row was written; existing projection state is already correct.
- `conflict_quarantined` — no canonical row was written; the quarantine row in `telemetry_ingestion_errors` is the boundary's record of the conflict; projection must not reflect a value that was never accepted.
- `rejected_quarantined` — no canonical row was written.
- `rejected_request` — no canonical row was written.
- Malformed request — Zod fails before the service runs.
- Unknown mapping / unknown source / etc. — the corresponding quarantine reason already excluded the sample from canonical history; projection follows.

The boundary forbids the projection updater from being called from any quarantine path. F4.6C.1 tests must assert this.

### 7.3 Transaction behavior

The canonical `telemetryReading.create` and the `live_readings` upsert **share the same per-sample transactional unit** when practical, using Prisma's interactive transaction API (`prisma.$transaction(async (tx) => {...})`). The transaction:

1. Calls `tx.telemetryReading.create({...})`.
2. If `quality === 'good'`, calls `projection.applyAcceptedReading(tx, created, sourceKind, ...)`.
3. Both commit together.

### 7.4 Failure semantics

If the projection upsert fails inside the transaction, the transaction rolls back and the canonical insert is also rolled back. The sample's outcome then becomes `rejected_quarantined` with reason **`mapping_engine_failure`** (the existing F4.6A.1 CHECK-enum value covering unexpected internal failures; **no new reason is introduced**).

This is intentionally conservative: ADR-008 §3 decision 5 says canonical insert and live projection should atomically commit. F4.6C.1 honors that by tying them together. The cost: a rare projection failure rejects an otherwise-valid reading. The benefit: the canonical record and the live view are never inconsistent.

### 7.5 Where the P2002 dedup path lives

The F4.6B.1 dedup path (catch `Prisma.PrismaClientKnownRequestError` code `P2002`, look up the existing row, classify as `duplicate` vs `conflict_quarantined`) **lives outside** the new transaction. F4.6C.1's edit:

```ts
// Sketch (F4.6C-0 plan; F4.6C.1 implements).
try {
  const created = await this.prisma.$transaction(async (tx) => {
    const reading = await tx.telemetryReading.create({ data: {...} });
    if (sample.quality === 'good') {
      await this.projection.applyAcceptedReading(tx, reading, source.kind);
    }
    return reading;
  });
  return { sampleIndex, outcome: 'accepted', telemetryReadingId: created.id };
} catch (err) {
  if (isUniqueViolation(err)) {
    // Existing F4.6B.1 dedup classification — unchanged.
    return this.classifyDedup(...);
  }
  throw err; // Surfaces as mapping_engine_failure in the outer catch (existing behavior).
}
```

The dedup catch sees the unique violation regardless of whether the projection participated. Either:

- The canonical insert hit `telemetry_readings_dedup_seq_uk` / `_ts_uk` → dedup classification runs as in F4.6B.1.
- The projection upsert hit `live_readings_unit_sensor_tag_uk` → see §12 for race handling (treated inside the projection service, not at the dedup classification layer).

## 8. Quality Gate Decision

### 8.1 Options

| Option | Behavior |
|---|---|
| **A** | **Only `quality === 'good'` updates `live_readings`.** |
| B | `good` and `uncertain` both update `live_readings`. |
| C | All qualities (including `bad`) update `live_readings`; UI marks them. |

### 8.2 Recommendation

**Option A — only `good` updates `live_readings`.** This aligns with:

- **ADR-008 §3 decision 5** ("`new.quality = 'good'`").
- **F4.6 architecture §11.5** ("Update only on every `good` reading accepted by the ingestion service.").
- **F4.6 architecture §10.2** ("Only `good` readings update live and trigger alarms by default.").

### 8.3 Rationale

- **Conservative operational display semantics.** Operators see the last *known-good* value, never a transient `uncertain` or `bad` value that would mislead.
- **`uncertain` and `bad` remain in `telemetry_readings`.** Historical truth is preserved; no diagnostic data is lost.
- **Decouples projection from alarm policy.** F4.6D will decide whether `uncertain` should trigger any alarm rule independently of whether it updates the live view.
- **Future change is reversible.** If a future phase decides that `uncertain` should update the projection (perhaps with a `status='stale'` marker), the change is one conditional in the projection service. No schema change required (`status TEXT` is already nullable in F4.6A.1's `live_readings` schema).

### 8.4 What this implies for the F4.6C.1 code

- The projection service's entry point is called only when `sample.quality === 'good'` (gate inside the ingestion service before invoking the projection — see §7.3).
- The projection service itself can defensively assert `incoming.quality === 'good'` and reject otherwise. (Belt-and-suspenders; the gate at the call site is the primary control.)
- The `live_readings.quality` column always carries `'good'` on rows F4.6C.1 writes; the F4.6A.1 CHECK enum (`good | uncertain | bad`) still allows the other two values for future flexibility.

## 9. Timestamp Watermark / Late Arrival Policy

### 9.1 Update rule

The `live_readings` row updates **only when the incoming `telemetry_reading.timestamp` is strictly newer than the stored `live_readings.timestamp`** (`new.timestamp > stored.timestamp`).

### 9.2 Tie behavior

If `incoming.timestamp === stored.timestamp`:

- **Do not overwrite.** F4.6C.1 treats equal timestamps as already-projected.
- No deterministic tie-breaker is defined in F4.6C-0. If a future phase identifies a real-world need (two valid `good` readings at the exact same microsecond from the same sensor — operationally implausible at PostgreSQL's `TIMESTAMPTZ` precision), the tie-breaker (`created_at`, `telemetry_reading.id` lex order, etc.) becomes its own documented decision.

### 9.3 Late arrival

- **Late historical samples remain in `telemetry_readings`.** F4.6C.1 does not gate canonical insert on the live projection's state; the canonical record is always written first (in the same transaction).
- **Late samples whose timestamp is older than the current projection row do NOT overwrite `live_readings`.** The watermark rule (§9.1) ensures this.
- **F4.6C.1 tests must include late-arrival cases** that verify the projection row is unchanged after a late reading is accepted.

### 9.4 New-row semantics

If no `live_readings` row exists yet for `(unit_id, sensor_id, canonical_tag_id)`, an accepted `good` reading **creates** the row, regardless of its `timestamp`. The watermark applies only when a row already exists.

## 10. Projection Key

The projection key is fixed by F4.6A.1's `live_readings_unit_sensor_tag_uk` constraint:

```
(unit_id, sensor_id, canonical_tag_id)
```

### 10.1 Why this key

1. **`unit_id`** — supports unit-scoped UI reads (Operations, Units screens that filter by measurement unit) without an extra join.
2. **`sensor_id`** — preserves physical-instrument identity per ADR-008 §3 decision 4 (transmitter-first principle). Two sensors on the same unit publishing related canonical measurements do not collide.
3. **`canonical_tag_id`** — preserves semantic measurement identity. A sensor whose active `SensorTagBinding` rebinds it to a new canonical tag does not collapse old and new projection entries.

This triple is the **natural address** of "the current value of this canonical measurement on this physical instrument on this unit". F4.6C-0 confirms it; F4.6C.1 must not deviate.

### 10.2 What this key does not collapse

- Two pressure transmitters on EMMAD-01 (e.g. inlet vs outlet) remain distinct projection rows: same `unit_id`, different `sensor_id`, different `canonical_tag_id` (`p_inlet` vs `p_outlet`).
- A re-binding of a sensor across canonical tags during its lifecycle produces two projection rows over time (one per `(sensor_id, canonical_tag_id)` pair). The natural key encodes this intentionally.

## 11. Projection Data Shape

The `live_readings` columns to populate (verified against `apps/backend/prisma/schema.prisma` at commit `1495457`):

| Field | Source | Notes |
|---|---|---|
| `tenantId` | `accepted_reading.tenantId` (= `source.tenantId`) | Tenant scoping; always server-derived. |
| `unitId` | `accepted_reading.unitId` | From the resolved `IntegrationMapping`. |
| `sensorId` | `accepted_reading.sensorId` | From the resolved sensor (mapping FK or active `SensorTagBinding`). |
| `canonicalTagId` | `accepted_reading.canonicalTagId` | From the resolved canonical tag. |
| `latestTelemetryReadingId` | `accepted_reading.id` | FK back to the canonical row that produced this projection state. `ON DELETE SET NULL`. |
| `value` | `accepted_reading.value` (Prisma `Decimal`) | Same value as the canonical row. |
| `engineeringUnit` | `accepted_reading.engineeringUnit` | Same unit as the canonical row (F4.6B.1 preserves; no conversion). |
| `quality` | `'good'` literal | F4.6C.1 only updates on `good`; the projection's `quality` column always reflects the last `good` reading's quality. |
| `status` | `null` in F4.6C.1 | Reserved for future use (e.g. `'stale'` marker). F4.6C.1 does not write a value; F4.6A.1's schema declares the column as nullable `TEXT` with no CHECK. |
| `timestamp` | `accepted_reading.timestamp` | The watermark column. |
| `source` | `source.kind` (= the `IntegrationSource.kind` CHECK-enum value) | One of the ten F4.6A.1 source kinds. |
| `ingestionTimestamp` | `now()` server-side at the moment of the projection update, or pulled from the canonical row's `createdAt` (F4.6C.1 picks). | Operational metadata, not a watermark. |
| `createdAt` | `now()` on insert | Default. |
| `updatedAt` | `now()` on every update | `@updatedAt` Prisma default; Prisma maintains. |

### 11.1 What F4.6C.1 does NOT do

- **Does not invent new columns.** The F4.6A.1 schema is final for F4.6C.
- **Does not store `rawPayload` or `metadata`.** Those are quarantine concerns (`telemetry_ingestion_errors`), not projection concerns.
- **Does not encode operational-context fields** (`job_id` or equivalent). Jobs remain deferred; F4.6A.1's `live_readings` schema deliberately has no `job_id` column.

### 11.2 Recoverability invariant

A `live_readings` row is **fully reconstructible** from `telemetry_readings` via a deterministic query:

```sql
-- F4.6C-0 sketch; actual rebuild query is F4.6C.1's deliverable.
SELECT DISTINCT ON (unit_id, sensor_id, canonical_tag_id)
    tenant_id, unit_id, sensor_id, canonical_tag_id,
    id AS latest_telemetry_reading_id,
    value, engineering_unit, quality, timestamp, source
FROM telemetry_readings
WHERE quality = 'good'
ORDER BY unit_id, sensor_id, canonical_tag_id, timestamp DESC;
```

F4.6C.1 should include this rebuild logic as either a documented operator procedure or a small internal helper. Either way, **loss of `live_readings` is recoverable**; loss of `telemetry_readings` is not.

## 12. Upsert Strategy

### 12.1 Constraints

- Must be **race-safe** in the presence of concurrent ingestion (two batches landing for the same `(unit_id, sensor_id, canonical_tag_id)` at near-overlapping moments).
- Must enforce the **watermark rule** (§9.1): older `timestamp` does not overwrite newer.
- Must respect the `live_readings_unit_sensor_tag_uk` unique constraint.
- Prisma's native `upsert` cannot express conditional update predicates (its `where` must be a unique constraint, and its `update` clause has no `WHERE timestamp < ?` analogue) — so the upsert is composed manually.

### 12.2 Recommended pattern

The canonical pattern for F4.6C.1 (final code shape is F4.6C.1's call; this is a sketch):

1. **`updateMany` with the natural key + watermark predicate.**
   ```ts
   const updateResult = await tx.liveReading.updateMany({
     where: {
       unitId, sensorId, canonicalTagId,
       timestamp: { lt: incoming.timestamp },
     },
     data: {
       latestTelemetryReadingId: incoming.id,
       value: incoming.value,
       engineeringUnit: incoming.engineeringUnit,
       quality: 'good',
       timestamp: incoming.timestamp,
       source: incoming.source,
       ingestionTimestamp: now,
     },
   });
   ```
   If `updateResult.count === 1`, the row existed, was older, and is now updated. Done.

2. **If `updateResult.count === 0`,** either the row does not exist or it exists with `timestamp >= incoming.timestamp` (stale incoming). Check:
   ```ts
   const existing = await tx.liveReading.findUnique({
     where: { live_readings_unit_sensor_tag_uk: { unitId, sensorId, canonicalTagId } },
     select: { timestamp: true },
   });
   ```

3. **If `existing` and `existing.timestamp >= incoming.timestamp`**: incoming is stale. **Skip.** Late-arrival case — `live_readings` keeps its newer value.

4. **If `!existing`**: create.
   ```ts
   try {
     await tx.liveReading.create({ data: { ...everything... } });
   } catch (err) {
     if (isUniqueViolation(err)) {
       // Race: another transaction created the row between step 2 and step 4.
       // Re-run step 1 (timestamp-gated updateMany). If that returns count 0
       // again, our incoming is stale relative to the newly-created row.
       const retry = await tx.liveReading.updateMany({...same as step 1...});
       if (retry.count === 0) {
         // Confirmed stale; skip.
       }
     } else {
       throw err;
     }
   }
   ```

### 12.3 Atomicity caveat

The above sequence (updateMany → findUnique → create) is **inside the per-sample interactive transaction** (§7.3). Within a serializable / read-committed transaction, the race window is bounded by Prisma's transaction isolation. The `try/catch` on `P2002` handles the residual race conservatively without escalating the failure to the caller.

### 12.4 Alternative — raw SQL `INSERT ... ON CONFLICT DO UPDATE WHERE`

PostgreSQL supports:

```sql
INSERT INTO live_readings (...) VALUES (...)
ON CONFLICT ON CONSTRAINT live_readings_unit_sensor_tag_uk
DO UPDATE SET ... WHERE live_readings.timestamp < EXCLUDED.timestamp;
```

This is a single round-trip and inherently race-safe (PostgreSQL serializes the `INSERT ... ON CONFLICT` correctly). F4.6C.1 may use `prisma.$executeRaw` / `$executeRawUnsafe` for this pattern if the resulting code is clearer and the project is comfortable with the small amount of raw SQL.

**F4.6C-0 does not pick between the two approaches.** F4.6C.1 picks based on what reads cleaner against the existing codebase. Either is acceptable; tests must cover the race behavior either way.

## 13. Idempotency

### 13.1 Required behavior

- **Reprocessing the same accepted `telemetry_reading` is idempotent.** Calling `applyAcceptedReading(...)` twice with the same input ends in the same `live_readings` state (one row, same column values).
- **`duplicate` ingestion outcomes do NOT call the projection updater.** F4.6B.1's `duplicate` outcome already means a canonical row exists; the projection state for that row is whatever the **earlier** successful insert produced. Re-calling the updater on the second submission would have either no effect (timestamp watermark rejects the same timestamp per §9.2) or — in a pathological "stuck clock" case — race against itself harmlessly.
- **No duplicate projection rows.** The `live_readings_unit_sensor_tag_uk` constraint structurally prevents duplicate rows for the same `(unit_id, sensor_id, canonical_tag_id)`.

### 13.2 What idempotency does NOT mean

- It does not mean rolling back a successful canonical insert. If projection later finds the same reading "uninteresting" (older than current), the canonical row stays — the canonical record always reflects what was accepted, even if it never became the live value.

### 13.3 Tests required

See §16. At minimum, F4.6C.1 must include a test that calls the projection service twice with identical input and asserts `live_readings` ends with one row and the expected column values.

## 14. Interaction with Existing `live_readings_projection` VIEW

### 14.1 Decision

**F4.6C.1 does NOT drop or rename the F4.2 `live_readings_projection` SQL VIEW.** Coexistence is preserved per F4.6A.0 §5.E and F4.6A.1 §8.

### 14.2 Reasoning

1. The VIEW has no active consumer today. Dropping it is technically safe.
2. Coexistence is **non-destructive** and reversible. F4.6C.1 introduces the upsert-maintained table without touching the VIEW.
3. F4.6C.1 may add comparison tests (informational, not gating) that read the VIEW and the new table and assert they describe the same "latest per `(unit_id, sensor_id)`" semantics — useful as a sanity check during development. The VIEW uses `(unit_id, sensor_id)` (not `(unit_id, sensor_id, canonical_tag_id)`), so the comparison is not 1:1: the VIEW collapses across canonical tags via `DISTINCT ON`, while the table keeps them distinct. Tests should treat this difference as expected.
4. View removal / consumer cutover is **deferred** to a later phase (likely F4.6F or a dedicated read-API refinement phase). F4.6C-0 does not schedule it.

### 14.3 What F4.6C.1 must not do to the VIEW

- Drop it.
- Rename it.
- Alter its definition.

### 14.4 What the future phase that retires the VIEW will look like

A small focused phase that:

- Confirms no consumer reads the VIEW.
- Updates the F4.2B baseline migration's documentation or ships a small DROP VIEW migration.
- Closeout documents the removal.

F4.6C.1 does not anticipate this work beyond the §14.3 prohibition.

## 15. API / Consumer Impact

### 15.1 Public API surface in F4.6C.1

**None.** F4.6C.1 does NOT:

- Add a `GET /api/v1/telemetry/latest` endpoint.
- Add any other public HTTP route.
- Modify the existing `GET /api/v1/telemetry/trends` endpoint.
- Modify the existing `POST /api/v1/telemetry/ingest` endpoint's wire shape or response envelope.

The projection updater is **internal-only** in F4.6C.1.

### 15.2 Frontend impact in F4.6C.1

**None.** The Operations / Units UI continues to render from the F2 simulator / F3 mock / F4.5E synthetic trace, unchanged. No frontend file under `apps/web/` is modified.

### 15.3 Why defer the latest-value API

- F4.6C.1's job is to establish the projection writer reliably. A read endpoint that consumes the projection is a separate, smaller phase that can land after F4.6C.1 has proven the writer works.
- Introducing the read endpoint in F4.6C.1 would broaden the test surface and the review surface unnecessarily.
- The Master Roadmap §3 already lists the latest-value API as a future deliverable inside the F4.6C arc; F4.6C-0 narrows F4.6C.1 to the writer only.

### 15.4 Possible F4.6C-2 follow-up

A small follow-up phase (e.g. F4.6C-2 — Latest-Value Read Endpoint) may introduce `GET /api/v1/telemetry/latest?unitId=...` once F4.6C.1 has shipped and a brief soak period confirms projection stability. F4.6C-0 does not define that phase.

## 16. Tests Required for F4.6C.1

### 16.1 `LiveReadingsProjectionService` spec — projection-service-level tests

| # | Test | Verifies |
|---|---|---|
| 1 | Empty projection + new `good` reading → row created with all expected fields populated. | Insert path. |
| 2 | Existing row + newer `good` reading → row updated; `latestTelemetryReadingId`, `value`, `timestamp`, etc. reflect the new reading. | Watermark + update path. |
| 3 | Existing row + older `good` reading → no overwrite; existing row's fields unchanged. | Late-arrival policy (§9.3). |
| 4 | Existing row + equal-timestamp `good` reading → no overwrite. | Tie behavior (§9.2). |
| 5 | Reprocessing the same `good` reading twice → idempotent end-state (one row, same values). | Idempotency (§13). |
| 6 | Two concurrent inserts racing for the same key → no duplicate row created; one wins, the other becomes a no-op or update. | Race safety (§12.2 step 4). |
| 7 | Service preserves the projection key `(unit_id, sensor_id, canonical_tag_id)` exactly. | Key fidelity (§10). |
| 8 | (Optional) Comparison test: VIEW and table return consistent latest-per-instrument values when both are populated identically. | Coexistence sanity check (§14.2). |

### 16.2 `TelemetryIngestionService` spec updates — integration-with-projection tests

These extend the F4.6B.1 spec (currently 22 tests, all green at commit `1495457`):

| # | Test | Verifies |
|---|---|---|
| 9 | `accepted` outcome with `quality === 'good'` → `LiveReadingsProjectionService.applyAcceptedReading` is called once with the canonical row's data. | Trigger path (§7.1). |
| 10 | `accepted` outcome with `quality === 'uncertain'` → projection updater is NOT called. | Quality gate (§8). |
| 11 | `accepted` outcome with `quality === 'bad'` → projection updater is NOT called. | Quality gate (§8). |
| 12 | `duplicate` outcome → projection updater is NOT called. | Trigger path (§7.2). |
| 13 | `conflict_quarantined` outcome → projection updater is NOT called. | Trigger path (§7.2). |
| 14 | `rejected_quarantined` outcome → projection updater is NOT called. | Trigger path (§7.2). |
| 15 | Projection updater throws inside the transaction → outcome is `rejected_quarantined` with `reason='mapping_engine_failure'`; the canonical row does not appear in `telemetry_readings` (rolled back). | Failure semantics (§7.4). |

### 16.3 Isolation tests — F4.6B.1's invariants carried forward

These tests already exist in the F4.6B.1 spec (#17, #18, #19, #20). They must remain green after F4.6C.1, **with one adjustment**:

| # | Test (from F4.6B.1) | After F4.6C.1 |
|---|---|---|
| 17 | Service does not call any `liveReading` mutation. | **Updated**: the test becomes "Service does not call `liveReading` mutation **for non-`good`-quality samples or non-`accepted` outcomes**." Or, equivalently, the isolation guard moves to the projection-service spec and the ingestion spec asserts the projection method **was** called only for the authorized cases. F4.6C.1 picks the cleanest split. |
| 18 | Service does not call any `alarmEvent` mutation. | **Unchanged.** F4.6D scope. |
| 19 | Service does not reference realtime / WebSocket prisma surfaces. | **Unchanged.** F4.6E scope. |
| 20 | Service does not look up or write Jobs / CommissioningSnapshot. | **Unchanged.** Jobs deferred. |

### 16.4 Test framework

vitest + mocked Prisma (pattern from `trends.service.spec.ts` and the existing `telemetry-ingestion.service.spec.ts`). No live DB in unit tests. Live-DB integration testing is a separate future deliverable.

### 16.5 Coverage target

F4.6C.1 should ship with **at least 8 new projection-service tests + at least 7 modified/new ingestion-service tests = at least 15 new test cases**, bringing the backend total from 91 (at commit `1495457`) to ≥ 106. F4.6C.1's closeout report lists the exact count.

## 17. Validation Requirements for F4.6C.1

F4.6C.1 is a **backend runtime phase**. Per DoD §8 / §13, the required validation:

```
pnpm --filter @rvf/backend exec prisma validate
pnpm --filter @rvf/backend exec prisma generate
pnpm --filter @rvf/backend run lint
pnpm --filter @rvf/backend run typecheck
pnpm --filter @rvf/backend run build
pnpm --filter @rvf/backend run test
pnpm run lint
pnpm run typecheck
pnpm run build
```

All commands must pass before F4.6C.1 is considered closed.

### 17.1 Local DB validation

Per DX-2, **clean local DB validation (§5 of the procedure)** should be run before F4.6C.1 begins, to confirm:

- The F4.2 baseline migration applies cleanly.
- The F4.6A.1 telemetry-hardening migration applies cleanly on top.
- The `live_readings` table is empty and ready for F4.6C.1 to populate.
- The `live_readings_projection` VIEW is still present.

The clean-DB procedure does not need to be re-run after F4.6C.1's *code* changes, only if F4.6C.1 *modifies the schema or migrations* — which it should not (see §17.2).

### 17.2 Schema gap escalation rule

**F4.6C.1 must not silently add a schema or migration change.** If F4.6C-0 (this document) or F4.6C.1 implementation discovers a schema gap (e.g. a missing column that the F4.6A.1 schema does not provide), the work pauses and a small intermediate phase is opened:

**F4.6C-A — Live Readings Schema Adjustment Plan** (hypothetical; only if a gap is discovered) → **F4.6C.1** resumes against the adjusted schema.

The schema gap must be documented in the new phase plan with the same `migrate deploy` validation per DX-2.

### 17.3 Closeout report

F4.6C.1's closeout report follows the F4.6B.1 template (DoD §11 canonical structure). It must include:

- Executive summary.
- Commit context with real hashes.
- Files changed.
- Validation results (table of commands + outcomes).
- Explicit non-implementation confirmation answering each §12 DoD question.
- Specifically: a line documenting that **F4.6C.1 is the first phase authorized to write `live_readings`**, and that the projection writer's call sites are limited to `LiveReadingsProjectionService` and the `accepted` + `quality === 'good'` path inside `TelemetryIngestionService`.
- Deferred work (latest-value API → future F4.6C-2; alarm evaluation → F4.6D; WebSocket fan-out → F4.6E).
- Recommended next phase.

## 18. Out of Scope for F4.6C.1

Explicitly **not** part of F4.6C.1:

- **Alarm evaluation.** F4.6D scope.
- **`alarm_events` creation.** F4.6D scope.
- **WebSocket / SSE fan-out.** F4.6E scope.
- **Operations trend API extensions.** F4.6F scope.
- **Units API cutover** to the new projection. Deferred to a future per-screen migration phase.
- **Frontend changes.** No file under `apps/web/`.
- **MQTT integration.**
- **Modbus integration.**
- **OPC-UA integration.**
- **ThingsBoard bridge.**
- **Node-RED bridge.**
- **PLC adapter.**
- **Historian adapter.**
- **Edge-gateway adapter.**
- **Simulator runtime.**
- **Production authentication changes.** ADR-009 scope.
- **Jobs model.** Deferred per ADR-008.
- **Jobs UI.** Deferred.
- **TimescaleDB hypertables.** ADR-010 scope.
- **DB triggers.** Explicitly rejected in §5 / §5.3.
- **VIEW removal.** §14.
- **Latest-value read endpoint** (`GET /telemetry/latest`). §15.4 (possible F4.6C-2 follow-up).

## 19. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Projection diverges from `telemetry_readings`. | low | high | Same-transaction commit (§7.3). Deterministic rebuild query (§11.2) exists; lost projection is recoverable. Periodic comparison (future operational task) can detect drift. |
| Older readings overwrite newer projection. | low | high (operationally misleading) | Watermark rule (§9.1) enforced by `updateMany WHERE timestamp < incoming` (§12.2 step 1). Tests #3, #4 in §16.1 verify late-arrival and tie behavior. |
| `uncertain` or `bad` data appears as live current value. | low | medium | Quality gate (§8) restricts to `good`. The gate lives at the call site inside `TelemetryIngestionService`; projection-service-side defensive check is an optional second line. |
| Race condition creates duplicate rows. | very low | medium | `live_readings_unit_sensor_tag_uk` UNIQUE constraint structurally prevents it. The upsert pattern (§12.2) handles the race by re-running the timestamp-gated `updateMany` on `P2002`. Test #6 in §16.1 verifies. |
| Projection failure creates partial persistence inconsistency. | low | medium | Same-transaction commit (§7.3). Failure rolls back the canonical insert; the sample becomes `rejected_quarantined` with `mapping_engine_failure`. Test #15 in §16.2 verifies. |
| Future API consumers read the wrong source (VIEW vs new table). | medium | medium | VIEW is preserved (§14); no consumer is forced to switch. Consumer cutover is a separately-planned phase. F4.6C-0's API impact section (§15) reaffirms no public read endpoint in F4.6C.1. |
| Scope creep into alarms / WebSocket / UI / external integrations during F4.6C.1. | medium | high | DoD §8 special checks restate the prohibitions. F4.6C.1's closeout must explicitly answer "yes — F4.6C scope authorizes" only for `live_readings` writes; every other §12 question must be `no`. Reviewer rejects PRs that smuggle in alarm / WebSocket / external work. |
| Hidden dependency on existing `live_readings_projection` VIEW. | low | low | No consumer reads the VIEW today (verified at F4.6B.1 closeout). VIEW removal is a future phase; F4.6C.1 does not touch it. |
| `LiveReadingsProjectionService` design prematurely shapes future `AlarmEvaluator` / `FanoutPublisher`. | medium | medium | §5.4 forbids generic-interface abstractions. F4.6C.1 ships a concrete service, not an interface scaffold. F4.6D / F4.6E pick their own shapes when they arrive. |

## 20. Acceptance Criteria for F4.6C-0

F4.6C-0 is considered complete when all of the following are true:

| # | Criterion |
|---|---|
| 1 | Plan document created at `docs/architecture/RVF_Malinois_F4_6C_Live_Readings_Projection_Updater_Plan.md`. |
| 2 | Projection ownership decided (§5) — dedicated `LiveReadingsProjectionService` under the telemetry domain. |
| 3 | Trigger point decided (§7) — only after a successful canonical `telemetryReading.create` on `accepted` outcomes; never on `duplicate` / `conflict_quarantined` / `rejected_quarantined` / `rejected_request`. |
| 4 | Quality gate decided (§8) — only `quality === 'good'` updates `live_readings` in F4.6C.1. |
| 5 | Timestamp watermark rule decided (§9) — `new.timestamp > stored.timestamp`; equal does not overwrite; late readings do not overwrite. |
| 6 | Projection key confirmed (§10) — `(unit_id, sensor_id, canonical_tag_id)`, matching F4.6A.1's `live_readings_unit_sensor_tag_uk`. |
| 7 | Upsert / idempotency strategy documented (§12 / §13). |
| 8 | VIEW coexistence decision documented (§14) — `live_readings_projection` VIEW preserved in F4.6C.1. |
| 9 | F4.6C.1 tests defined (§16) — at minimum 8 projection-service tests + 7 ingestion-service updates + carry-forward isolation tests. |
| 10 | F4.6C.1 validation requirements defined (§17) — backend runtime DoD §8, with explicit DX-2 local DB validation as precondition. |
| 11 | Out-of-scope items documented (§18). |
| 12 | Schema gap escalation rule documented (§17.2). |
| 13 | **Documentation-only.** No code, Prisma schema, migration, test, config, CI, frontend, or runtime file changed. |
| 14 | No commit made yet. |

## 21. Recommended Next Step

**F4.6C.1 — Live Readings Projection Updater Implementation.**

After this plan is reviewed and approved, F4.6C.1 may begin. F4.6C.1 implements exactly the scope locked in this document.

**Special precondition for F4.6C.1:**

Before F4.6C.1 begins, the developer should run **DX-2 §5 (clean local DB validation)** to confirm the F4.6A.1 schema is applied locally and `live_readings` is empty. This is the first phase that depends materially on the F4.6A.1 schema state.

**Schema-gap escalation:**

If F4.6C.1 implementation discovers a schema gap that this plan did not anticipate (e.g. an additional column the projection genuinely needs but `live_readings` does not provide), F4.6C.1 **pauses** and an intermediate **F4.6C-A schema plan + migration** is authored first. F4.6C.1 must **not** silently add a schema or migration change. This rule comes from DX-3 §16 / §7 and the project's plan-first pattern (F4.6A.0 → F4.6A.1).

Parallel work that does not depend on F4.6C-0 / F4.6C.1:

- **F4.5G+** — per-screen migration of Wells / Equipment / Catalog from the F3 mock adapter to the corresponding F4.5B / F4.5C adapter. Cero dependencia con F4.6.

---

*F4.6C-0 plan. Projection ownership, trigger, quality gate, watermark, key, upsert strategy, idempotency, VIEW coexistence, API impact, tests, validation, and risks all locked. F4.6C.1 implements them.*
