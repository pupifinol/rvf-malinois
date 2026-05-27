# RVF Malinois — F4.6E.1 WebSocket / SSE Fan-out Closeout

> Phase **F4.6E.1 — WebSocket / SSE Fan-out Implementation**. First backend collaborator authorized to emit business events from `RealtimeGateway.server`.
>
> Implements the F4.6E-0 plan (commit `22fa2ca`). Per the project's commit/push discipline this closeout ships alongside the implementation; the task brief instructs **not to commit yet**.
>
> Upstream references:
> - F4.6E-0 plan: `docs/architecture/RVF_Malinois_F4_6E_WebSocket_SSE_Fan_Out_Plan.md` (commit `22fa2ca`).
> - Master roadmap (most recent refresh): `docs/architecture/RVF_Malinois_Master_Roadmap.md` (commit `cf97943`).
> - F4.6D.1 closeout: `docs/architecture/RVF_Malinois_F4_6D_1_Alarm_Evaluation_Boundary_Closeout.md` (commit `d35a2b8`).
> - F4.6C.1 closeout: `docs/architecture/RVF_Malinois_F4_6C_1_Live_Readings_Projection_Updater_Closeout_Report_v1.0.md` (commit `49a8349`).
> - F4.6B.1 closeout: `docs/architecture/RVF_Malinois_F4_6B_1_Ingestion_Boundary_Skeleton_Closeout_Report_v1.0.md` (commit `1495457`).
> - ADR-005 / ADR-006 / ADR-008 (Proposed).
> - DX-3 (Definition of Done): `docs/operations/RVF_Malinois_Definition_of_Done.md` (commit `65cb736`).

## 1. Purpose

F4.6E.1 implements the WebSocket fan-out boundary defined in F4.6E-0. It introduces `RealtimeEmitterService` — the **first backend collaborator authorized to emit business events from `RealtimeGateway.server`** — extends the existing F0/F2 `RealtimeGateway` with F4-shape `subscribe` / `unsubscribe` handlers, and wires `TelemetryIngestionService` to collect emit descriptors inside the per-sample `prisma.$transaction` and hand them to the emitter only **after** the transaction has successfully committed.

The emitter consumes canonical persisted state only — every payload field is resolved inside the transaction from values that were just written. The browser never sees a "ghost" event for a row that did not commit; the emitter never reads from Prisma; failure paths never invoke the emitter.

## 2. Scope Implemented

- **`RealtimeEmitterService`** at `apps/backend/src/realtime/realtime-emitter.service.ts` (~150 lines). Single public `emitMany(events)` method. Internal — no controller, no HTTP, no public DTO, no `apps/web/` import.
- **Gateway subscribe / unsubscribe**, added to the existing `RealtimeGateway` at `apps/backend/src/realtime/realtime.gateway.ts`. Two new `@SubscribeMessage` handlers (`'subscribe'`, `'unsubscribe'`) that validate input, join / leave Socket.IO rooms, and return typed acknowledgement payloads. Existing F0 `connection` greeting and `ping → pong` echo are preserved verbatim and covered by carry-forward tests.
- **Three event kinds** emitted per F4.6E-0 §8 — `telemetry.reading.accepted`, `live_reading.updated`, `alarm.event.created`. Wire envelope `{ schema: 'rvf.realtime.v1', kind, emittedAt, payload }` (see §6).
- **Per-tenant rooms only** — naming `tenant:${tenantId}`. Per-unit rooms (`unit:${unitId}`) are joined on subscribe but **not used as a fan-out target** in F4.6E.1 (forward-compat seam per F4.6E-0 §9.1).
- **Env gate `RVF_REALTIME_EMIT_ENABLED`** — when unset or not the literal string `'true'`, `emitMany` no-ops with a single logged warning. Gateway remains addressable: subscribers still connect, get the `connection` greeting, can `ping`/`pong`, can `subscribe`/`unsubscribe`. Only the business emit is suppressed. Mirrors F4.6B.1's `RVF_INGEST_ENABLED` posture.
- **Post-commit emission** — `TelemetryIngestionService.processSample` collects `pendingEmits: PendingRealtimeEmit[]` inside the `prisma.$transaction(async (tx) => …)` callback as the projection / alarm steps return their outcomes, then invokes `realtime.emitMany(pendingEmits)` on the line **after** the transaction promise resolves. On any throw inside the transaction (P2002 dedup, projection failure, alarm evaluator failure, unexpected DB error), `pendingEmits` is discarded by the catch block and emission never happens.
- **Best-effort emit** — per-event `try { gateway.server.to(room).emit(...) } catch (logger.error)`. A single bad emit cannot block the rest of the batch and nothing is thrown out to the caller — the ingestion outcome the API caller sees is unchanged by emit failures.
- **Wire type extension** — `packages/types/src/realtime.ts` gains `RealtimeF4Event` (discriminated union of the three envelope shapes), per-payload interfaces (`TelemetryReadingAcceptedPayload`, `LiveReadingUpdatedPayload`, `AlarmEventCreatedPayload`), and the subscribe / unsubscribe / ack shapes. The legacy F0/F2 `RealtimeMessage` / `SubscribeRequest` / `UnsubscribeRequest` types stay in place untouched (no breaking change for any current frontend consumer).
- **Tests** — 21 new vitest specs across two new files plus 12 new integration tests appended to the existing ingestion spec. Total: **173/173 across 15 spec files** (140 baseline → 173 with F4.6E.1's additions).

## 3. Architecture Decision

Reaffirms and exercises the platform-ownership principles already locked by ADR-005 / ADR-006 / ADR-008 / F4.6E-0 §4:

- **Socket.IO over WebSocket implemented** — per F4.6E-0 §6 protocol recommendation. The existing backend `RealtimeGateway` (`@nestjs/websockets` + `socket.io@^4.8.1`) is reused; no new transport dependency. SSE is **intentionally deferred** as F4.6E.2 if a use case appears.
- **Fan-out occurs only after canonical persistence.** `realtime.emitMany(...)` is called on the line after `await this.prisma.$transaction(...)` resolves successfully. The transactional contract from F4.6B.1 (canonical insert) + F4.6C.1 (projection upsert) + F4.6D.1 (alarm evaluation) all commits together; emit happens on the success continuation only.
- **Fan-out is not a source of truth.** Subscribers that miss events during a disconnect do not "replay" — they re-read from REST. `telemetry_readings`, `live_readings`, and `alarm_events` are the recovery surfaces. No in-memory buffer, no last-event-id, no durable outbox.
- **Browser does not evaluate alarms** (ADR-005 invariant preserved). The `alarm.event.created` payload carries the alarm evaluator's already-resolved decision; the browser only renders, never decides.
- **External tools do not own RVF realtime state.** No external broker (MQTT / Redis pub-sub / Kafka), no vendor delegation (ThingsBoard / Node-RED), no inbound "alarm-already-evaluated" payload. Events are emitted by RVF code directly to Socket.IO rooms RVF manages.

ADR-008 remains **Proposed**. F4.6E.1 is the fourth sub-phase exercising its principles in code (after F4.6B.1 / F4.6C.1 / F4.6D.1) but a live-DB and live-Socket.IO integration suite is still the outstanding precondition for graduation (per master roadmap §10 risk table).

## 4. Files Changed

| Path | Action | Notes |
|---|---|---|
| `apps/backend/src/realtime/realtime-emitter.service.ts` | **New.** | The fan-out service. Single public `emitMany(events: readonly PendingRealtimeEmit[]): void` method. ~150 lines including documentation. Env-gated; best-effort per-event try/catch; envelope wrapping (`schema`, `kind`, `emittedAt`, `payload`). |
| `apps/backend/src/realtime/realtime-emitter.service.spec.ts` | **New.** | 10 mocked-Socket.IO vitest tests covering the three event kinds, env-gate behavior (off / on / mid-test flip), best-effort throw handling, tenant room isolation, mixed-batch ordering, schema-version lock. |
| `apps/backend/src/realtime/realtime.gateway.ts` | **Modified.** | Adds `@SubscribeMessage('subscribe')` and `@SubscribeMessage('unsubscribe')` handlers with shape validation and Socket.IO `client.join` / `client.leave`. Adds exported `tenantRoomName(id)` / `unitRoomName(id)` helpers so the emitter and tests share the room-naming convention deterministically. Existing F0 `connection` greeting, `ping → pong` handler, namespace `/realtime`, path `/api/v1/stream`, and CORS are all preserved verbatim. JSDoc updated to record the F4.6E.1 extensions while still naming the still-deferred no-auth posture. |
| `apps/backend/src/realtime/realtime.gateway.spec.ts` | **New.** | 11 mocked-Socket.IO vitest tests covering: F0 `connection` greeting still fires; `ping → pong` unchanged; subscribe joins per-tenant + per-unit rooms with the expected ack shape; subscribe rejects malformed payloads without joining; unsubscribe leaves named rooms; bodyless unsubscribe leaves every fan-out room while preserving the socket-id room; tenant / unit room naming functions are deterministic. |
| `apps/backend/src/realtime/realtime.module.ts` | **Modified.** | Adds `RealtimeEmitterService` to `providers` and `exports`. `RealtimeModule` continues to be unconditionally imported by `AppModule` so the gateway is always addressable regardless of `RVF_INGEST_ENABLED` / `RVF_REALTIME_EMIT_ENABLED`. |
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.module.ts` | **Modified.** | Adds `RealtimeModule` to `imports` so `TelemetryIngestionService` can inject the emitter. JSDoc updated to record the F4.6E.1 wiring. |
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.ts` | **Modified.** | Adds `RealtimeEmitterService` constructor injection (fourth parameter after `prisma`, `projection`, `alarms`). Collects `pendingEmits: PendingRealtimeEmit[]` inside the existing `prisma.$transaction(async (tx) => …)` callback as each step (canonical insert, projection upsert, alarm evaluation) returns its outcome. Calls `this.realtime.emitMany(pendingEmits)` on the line **after** `await this.prisma.$transaction(...)` resolves successfully. On any throw (P2002 dedup, projection / alarm rollback, unexpected error), the catch block discards `pendingEmits` and emission never happens. JSDoc updated to record the F4.6E.1 delegation. |
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` | **Modified.** | Imports `RealtimeEmitterService` + `PendingRealtimeEmit` + the result-type discriminated unions (`LiveReadingProjectionResult`, `AlarmEvaluationResult`) so per-outcome mocks typecheck without casts. Widens the existing `projectionUpdate` / `alarmsEvaluate` mock return types from `Promise<{ outcome: string }>` to the real discriminated-union types. Adds a `realtimeEmitMany` mock + injected `realtime` service. Service construction now takes four arguments. 12 new integration tests (#40–#51) appended at the bottom covering: telemetry + projection events emitted on `accepted` good; all three event kinds emitted when alarm rules trigger; quality='bad' only emits telemetry.reading.accepted; projection `skipped_*` does not emit `live_reading.updated`; alarm `no_threshold_violated` / `skipped_duplicate_active` do not emit `alarm.event.created`; rejected_quarantined / unknown_mapping / duplicate / conflict_quarantined / projection-rollback / alarm-rollback paths all do NOT invoke the emitter; emit happens AFTER `$transaction` resolves (call-order assertion). |
| `packages/types/src/realtime.ts` | **Modified.** | Adds: `RealtimeF4EventSchemaVersion` (`'rvf.realtime.v1'`), payload interfaces (`TelemetryReadingAcceptedPayload`, `LiveReadingUpdatedPayload`, `AlarmEventCreatedPayload`), envelope union `RealtimeF4Event`, subscribe / unsubscribe request / ack / error shapes (`SubscribeF4Request`, `UnsubscribeF4Request`, `SubscribeF4Acknowledgement`, `UnsubscribeF4Acknowledgement`, `SubscribeF4Error`). Legacy F0/F2 types (`RealtimeMessage`, `ConnectionState`, `SubscribeRequest`, `UnsubscribeRequest`, `ClientMessage`) are untouched. |
| `docs/architecture/RVF_Malinois_F4_6E_1_WebSocket_SSE_Fan_Out_Closeout.md` | **New.** | This document. |

No other file modified, created, or deleted. Explicitly:

- No file under `apps/web/` (no frontend per-screen wiring).
- No file under `apps/backend/src/alarms/`, `apps/backend/src/telemetry/projection/`, `apps/backend/src/{tenants,wells,equipment,jobs,tags,health}/`.
- No `apps/backend/prisma/schema.prisma` / migrations / seed change.
- No `package.json`, lockfile, `turbo.json`, `tsconfig*.json`, `vitest.config.ts`, `eslint.config.mjs`, `docker-compose.yml`, CI workflow, `apps/backend/src/config/env.ts` change.
- No `.env.example` change — see §5.

## 5. Runtime / Environment Impact

### 5.1 `RVF_REALTIME_EMIT_ENABLED`

New environment variable, optional. Mirrors `RVF_INGEST_ENABLED`'s posture.

- **When unset or not the literal string `'true'`** — `RealtimeEmitterService.emitMany` no-ops. A single warning is logged the first time a non-empty batch is dropped (suppressed for subsequent drops to avoid spam). `TelemetryIngestionService` still collects `pendingEmits` and still calls `emitMany`; the gate lives inside the emitter so the ingestion-side code path is unchanged.
- **When `'true'`** — `RealtimeEmitterService.emitMany` emits each descriptor to `gateway.server.to(\`tenant:${tenantId}\`).emit(kind, envelope)`.
- **Gateway addressability is independent of the gate.** Subscribers can connect, receive the F0 `connection` greeting, send `ping` and receive `pong`, send `subscribe` / `unsubscribe` and receive acks — regardless of `RVF_REALTIME_EMIT_ENABLED`. The gate only affects whether business events emit.
- **Read at emit time, not construct time.** The gate is checked inside `emitMany`, so tests can flip the value mid-test (asserted by `realtime-emitter.service.spec.ts` test #5) and production deployments can change the env without restarting the gateway.

### 5.2 `.env.example` not modified

`.env.example` does not document `RVF_INGEST_ENABLED` (F4.6B.1 did not add it; ingestion is an opt-in production flag, not a default-dev surface). F4.6E.1 follows the same convention and does **not** add `RVF_REALTIME_EMIT_ENABLED` to `.env.example`. Developers who want to exercise the emit path locally set the env var manually (e.g. `RVF_REALTIME_EMIT_ENABLED=true RVF_INGEST_ENABLED=true docker compose up -d backend`).

### 5.3 No other runtime change

- `apps/backend/src/config/env.ts` Zod schema is unchanged. F4.6E.1 reads the gate from `process.env` directly (matching the F4.6B.1 pattern of reading `RVF_INGEST_ENABLED` at module-registration time in `app.module.ts`).
- `docker-compose.yml`, the backend `Dockerfile.dev`, the `/health` endpoint, and the existing `RealtimeModule` registration in `AppModule.imports` are all unchanged. The gateway boots on `pnpm docker:up` exactly as before; the only behavioral delta is the new `subscribe` / `unsubscribe` handlers and the (gated) emit path.
- Local development is **not broken**: the default-dev posture (no `RVF_REALTIME_EMIT_ENABLED` set, no `RVF_INGEST_ENABLED` set) keeps the realtime gateway accepting connections + ping/pong + subscribe/unsubscribe, and the ingestion endpoint stays 404 as before.

## 6. Event Contract

Every wire envelope carries `{ schema: 'rvf.realtime.v1', kind, emittedAt, payload }`. The `kind` field is also the Socket.IO event name on `client.on(kind, handler)`.

### 6.1 `telemetry.reading.accepted`

Emitted once per `accepted` outcome from `TelemetryIngestionService.ingestBatch`, regardless of `quality`. Lets subscribers observe every successful canonical insert.

```ts
{
  schema: 'rvf.realtime.v1',
  kind: 'telemetry.reading.accepted',
  emittedAt: string,                     // ISO-8601 — when the emitter wrapped the envelope
  payload: {
    telemetryReadingId: string,          // UUID
    tenantId: string,                    // UUID
    unitId: string,                      // UUID
    sensorId: string,                    // UUID
    canonicalTagId: string,              // UUID
    value: string,                       // Decimal serialized as string for precision
    engineeringUnit: string,             // 'psi', 'degC', ...
    quality: 'good' | 'uncertain' | 'bad',
    timestamp: string,                   // ISO-8601 — the reading's timestamp
    source: string,                      // IntegrationSource.kind (e.g. 'manual', 'mqtt')
    sequence: string | null,             // bigint serialized as string, or null when omitted
  },
}
```

### 6.2 `live_reading.updated`

Emitted once per projection outcome of `created` or `updated`. **Skipped** for the three non-write outcomes (`skipped_stale`, `skipped_equal_timestamp`, `skipped_quality`). For `quality !== 'good'` samples, the projection step is not invoked at all, so this event is never emitted for non-good readings.

```ts
{
  schema: 'rvf.realtime.v1',
  kind: 'live_reading.updated',
  emittedAt: string,
  payload: {
    liveReadingId: string | null,        // UUID for 'created'; null for 'updated'
    tenantId: string,
    unitId: string,
    sensorId: string,
    canonicalTagId: string,
    value: string,                       // Decimal serialized as string
    engineeringUnit: string,
    quality: 'good',                     // always 'good' by construction
    timestamp: string,                   // ISO-8601
    source: string,
    ingestionTimestamp: string,          // ISO-8601 — when the backend accepted the reading
    outcome: 'created' | 'updated',
  },
}
```

### 6.3 `alarm.event.created`

Emitted once per per-rule outcome of `triggered`. **Skipped** for `skipped_duplicate_active` and `no_threshold_violated`. Multiple emits in one batch if a single reading triggers multiple rules (the F4.3 seed's warning + critical pattern).

```ts
{
  schema: 'rvf.realtime.v1',
  kind: 'alarm.event.created',
  emittedAt: string,
  payload: {
    alarmEventId: string,                // UUID
    tenantId: string,
    unitId: string,
    canonicalTagId: string,
    alarmRuleId: string,                 // UUID
    severity: 'info' | 'warning' | 'critical',
    triggeredValue: string,              // Decimal serialized as string
    thresholdViolated: 'low_low' | 'low' | 'high' | 'high_high',
    state: 'active',                     // F4.6E.1 only emits creations; lifecycle deferred
    firstTriggeredAt: string,            // ISO-8601 — equal to the reading's timestamp
  },
}
```

### 6.4 What is NOT in the wire surface

- No raw Prisma rows; every payload field is a primitive (string / number / null / fixed union).
- No raw HTTP ingestion request body. The payloads describe the **canonical persisted state** produced by the per-sample transaction.
- No quarantine event. `telemetry_ingestion_errors` rows are not fanned out; operator visibility into quarantine is a future read-API concern.
- No projection-skip / alarm-skip event. Subscribers do not see `skipped_stale` etc.; they see only the outcomes that wrote to the database.
- No alarm lifecycle event. F4.6D.1 only writes `state='active'` rows; lifecycle transitions (acknowledge / clear) are deferred to F4.6D.3 which will add `alarm.event.acknowledged` / `alarm.event.cleared` variants at that time.
- No `sensor_health` event. No backend data source produces it yet.

## 7. Room / Subscription Contract

### 7.1 Room naming

Two deterministic helpers exported from `realtime.gateway.ts`:

- `tenantRoomName(tenantId)` → `tenant:${tenantId}`
- `unitRoomName(unitId)` → `unit:${unitId}`

`RealtimeEmitterService` uses `tenantRoomName(event.payload.tenantId)` directly; the room naming is the same in tests and in production code.

### 7.2 Fan-out target — per-tenant only

F4.6E.1 emits each event **only** to its tenant room (`tenant:${event.payload.tenantId}`). Per-unit rooms are joined on subscribe but receive no events in F4.6E.1; they are a forward-compat seam per F4.6E-0 §9.1. Reasoning: a per-tenant room with N units and M subscribers fans out to M sockets, not M×N — Socket.IO already filters. Per-unit fan-out becomes load-bearing only when a tenant has many units AND a subscriber wants only a subset, a situation not observed operationally today.

### 7.3 Subscribe protocol

**Event name:** `'subscribe'`. **Body shape:** `{ tenantId: string, unitIds?: string[] }`.

On success the handler joins:

1. `tenantRoomName(tenantId)` — required.
2. `unitRoomName(id)` for each `unitId` in the optional `unitIds` array — forward-compat seam.

Returns the acknowledgement (Socket.IO callback pattern, same as the F0 `ping` handler):

```ts
{ kind: 'subscribed', tenantRoom: string, unitRooms: string[] }
```

On malformed input (missing tenantId, non-string entries, etc.) the handler logs a warning and returns:

```ts
{ kind: 'subscribe_error', reason: string }
```

without joining any room.

### 7.4 Unsubscribe protocol

**Event name:** `'unsubscribe'`. **Body shape:** `{ tenantId?: string, unitIds?: string[] }`. If both fields are omitted (or the body is `undefined` / `{}`), the handler leaves **every fan-out room** the socket has joined (filtered to rooms starting with `tenant:` or `unit:`; the socket-id room is preserved).

Returns:

```ts
{ kind: 'unsubscribed', rooms: string[] }
```

### 7.5 Authorization posture (inherited from project-wide no-auth state)

F4.6E.1 **trusts the requested `tenantId`** on subscribe. No authentication exists yet on REST or WebSocket; F4.6E.1 inherits that posture intentionally and does not invent a half-measure. The validation seam (`parseSubscribeBody`) is shaped so a future auth phase can reject mismatches without changing the wire shape. Documented as a known limitation — see §11.

CORS continues to enforce `ALLOWED_ORIGINS` on the Socket.IO handshake; first-party origins are the only wall today.

### 7.6 What never happens at the gateway

- No emit from the gateway itself — `RealtimeEmitterService` is the only authorized emitter, and it is invoked only by `TelemetryIngestionService` after the transaction commits.
- No Prisma access from the gateway or the emitter.
- No mutation of the `RealtimeMessage` legacy union (F2-era types untouched).

## 8. Transaction / Emission Semantics

### 8.1 The rule — emit AFTER commit

```ts
const pendingEmits: PendingRealtimeEmit[] = [];

try {
  const created = await this.prisma.$transaction(async (tx) => {
    const row = await tx.telemetryReading.create({ … });
    pendingEmits.push({ kind: 'telemetry.reading.accepted', payload: … });

    if (sample.quality === 'good') {
      const projectionOutcome = await this.projection.updateFromAcceptedTelemetry(…, tx);
      if (projectionOutcome.outcome === 'created' || projectionOutcome.outcome === 'updated') {
        pendingEmits.push({ kind: 'live_reading.updated', payload: { …, outcome: projectionOutcome.outcome } });
      }

      const alarmResult = await this.alarms.evaluate(…, tx);
      if (alarmResult.outcome === 'evaluated') {
        for (const perRule of alarmResult.perRule) {
          if (perRule.status === 'triggered') {
            pendingEmits.push({ kind: 'alarm.event.created', payload: … });
          }
        }
      }
    }
    return row;
  });

  // Past this line, the transaction has committed. Fan out — best-effort.
  this.realtime.emitMany(pendingEmits);

  return { sampleIndex, outcome: 'accepted', telemetryReadingId: created.id };
} catch (err) {
  // pendingEmits is intentionally discarded — the transaction rolled back.
  if (!isUniqueViolation(err)) throw err;
  return this.classifyDedup({ … });
}
```

### 8.2 No emit before commit

`pendingEmits` is populated **inside** the transaction callback but `emitMany` is **never** called inside it. The transaction promise must first resolve. Asserted by integration test #51 (`emit-after-commit order`): the mocked `$transaction` records `transaction_start` and `transaction_resolved` markers; `emitMany` records `realtime_emit`; the final order is always `transaction_start → transaction_resolved → realtime_emit`.

### 8.3 No emit on rollback

If any of the steps inside the transaction throws — the canonical `telemetryReading.create` raising P2002 (dedup), the `LiveReadingsProjectionService` throwing (mapping_engine_failure), the `AlarmEvaluationService` throwing (mapping_engine_failure), an unexpected DB error — the transaction rolls back and the outer `catch (err)` runs. `pendingEmits` (a local of `processSample`) goes out of scope unread; `emitMany` is never called. Asserted by integration tests #47 / #48 (P2002 dedup paths), #49 (projection rollback), #50 (alarm evaluator rollback), #45 / #46 (rejected_quarantined paths — the transaction never even starts).

### 8.4 Payload represents persisted canonical state

Every field on every payload (`telemetryReadingId`, `liveReadingId`, `alarmEventId`, `tenantId`, `unitId`, …) is resolved inside the transaction from values that were just written. No raw HTTP input is forwarded; no Prisma row is leaked verbatim; Decimals are stringified for precision; Dates are ISO-8601. The browser sees the same `(unitId, sensorId, canonicalTagId, value, timestamp)` tuple it would have read from REST.

### 8.5 No durable outbox

F4.6E.1 ships single-process in-memory emit only. There is no transactional outbox table, no Kafka, no Redis pub-sub, no exactly-once delivery. Reasoning: F4.6E-0 §11 / §12 explicitly chose REST reconnect as the recovery surface. A subscriber that disconnects for 30 seconds misses any events emitted in that window — they are not lost (they are still in `telemetry_readings` / `live_readings` / `alarm_events`); the subscriber re-reads via REST. A future multi-replica deployment will need a Socket.IO adapter (candidate F4.6E.3); a durable outbox is **not on the roadmap** and is not required by current code.

### 8.6 No replay buffer

Same reasoning. No server-side per-socket buffer, no last-event-id semantics, no sequence numbers in the wire envelope. The `emittedAt` field is informational (when the emitter wrapped the envelope), not a resync identifier.

## 9. API / Frontend Impact

### 9.1 No frontend screen wiring implemented

Per F4.6E-0 §14 — F4.6E.1 ships server-side emission only. Migrating the F2D `BackendWebSocketTelemetryAdapter` (or authoring a new F4-shape adapter) to consume the new event kinds is a separate frontend task (candidate part of F4.5G+).

### 9.2 Existing frontend socket client compatible / unchanged

- `apps/web/lib/realtime/socket.ts` (`socket.io-client` wrapper) continues to connect to the same path `/api/v1/stream` and the same namespace `/realtime`. The F0 `connection` greeting still fires on connect; `lastDataAt` tracking still works; exponential-backoff reconnect is unchanged.
- The frontend currently does not send `subscribe` messages, so it joins no rooms and receives no F4.6E.1 events. This is **by design** until a per-screen migration wires consumption.
- The legacy F0/F2 `RealtimeMessage` discriminator on the wire is untouched; any existing exhaustive `switch (msg.kind)` continues to compile and run without changes.

### 9.3 Shared type updates

`packages/types/src/realtime.ts` gains additive exports only:

- New: `RealtimeF4Event`, `RealtimeF4EventSchemaVersion`, `TelemetryReadingAcceptedPayload`, `LiveReadingUpdatedPayload`, `AlarmEventCreatedPayload`, `SubscribeF4Request`, `UnsubscribeF4Request`, `SubscribeF4Acknowledgement`, `UnsubscribeF4Acknowledgement`, `SubscribeF4Error`.
- Unchanged: `RealtimeMessage`, `ConnectionState`, `SubscribeRequest`, `UnsubscribeRequest`, `ClientMessage`.

The workspace `@rvf/web` build re-ran on this commit (no cache hit) and passed — the new exports do not break any existing consumer.

### 9.4 No public REST API added

F4.6E.1 adds no HTTP route, no controller, no Swagger entry. The gateway path remains `/api/v1/stream` (Socket.IO namespace `/realtime`); the F4.6B.1 `POST /api/v1/telemetry/ingest` route remains the only HTTP touch into telemetry; the F4.4 read API surface is unchanged.

## 10. Tests / Validation

### 10.1 New tests

| File | Tests | Coverage |
|---|---|---|
| `apps/backend/src/realtime/realtime-emitter.service.spec.ts` | 10 | Three event kinds + per-tenant room targeting; env-gate off / on / mid-test flip; best-effort throw containment; tenant room isolation (cross-tenant leakage prevented); empty-batch no-op; mixed-batch ordering preserved; schema-version locked to `'rvf.realtime.v1'`. |
| `apps/backend/src/realtime/realtime.gateway.spec.ts` | 11 | F0 `connection` greeting still fires; `ping → pong` unchanged; subscribe joins per-tenant + per-unit rooms with ack; subscribe rejects malformed payloads (missing tenantId, non-string unitIds) without joining; unsubscribe leaves named rooms only; bodyless unsubscribe leaves every fan-out room while preserving the socket-id room; tenant / unit room naming is deterministic. |
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` (modified) | +12 | accepted-good → telemetry + projection events; alarm-triggered → all three event kinds, 2 alarm emits when warning + critical fire; quality='bad' → telemetry only; projection `skipped_stale` → telemetry only; alarm `no_threshold_violated` / `skipped_duplicate_active` → telemetry + projection only; rejected_quarantined (unknown_source / unknown_mapping) → no emit; duplicate / conflict_quarantined (P2002) → no emit; projection rollback → no emit; alarm rollback → no emit; emit-after-commit call-order assertion. |

### 10.2 Test totals

| Metric | Before F4.6E.1 (`d35a2b8`) | After F4.6E.1 |
|---|---|---|
| Backend spec files | 13 | **15** (+2) |
| Backend tests passing | 140 / 140 | **173 / 173** (+33) |

### 10.3 Validation commands run

| Command | Result |
|---|---|
| `pnpm --filter @rvf/backend exec prisma validate` | ✅ "The schema at prisma/schema.prisma is valid 🚀" — no schema or migration delta. |
| `pnpm --filter @rvf/backend run lint` | ✅ clean (`--max-warnings 0`) — fixed several lint findings during development (no-floating-promises on Socket.IO `join`/`leave`, array-type style, unsafe destructure, unnecessary type assertion). |
| `pnpm --filter @rvf/backend run typecheck` | ✅ clean (src + prisma tsconfigs) — widened mock return types to the real `LiveReadingProjectionResult` / `AlarmEvaluationResult` discriminated unions for per-outcome `mockResolvedValueOnce(...)` calls. |
| `pnpm --filter @rvf/backend run build` | ✅ `nest build` clean. |
| `pnpm --filter @rvf/backend run test` | ✅ **173/173 across 15 spec files**. |
| `pnpm run lint` (workspace) | ✅ clean — all 4 packages (backend, web, types, ui) fresh and green. |
| `pnpm run typecheck` (workspace) | ✅ clean — backend, web, types, ui all fresh. |
| `pnpm run build` (workspace) | ✅ clean — backend + web both fresh; web consumed the new `@rvf/types` exports without errors. |

DX-3 §"Runtime phases" validation surface fully exercised.

## 11. Known Limitations / Deferred Work

Each of these has a dedicated future phase or stays explicitly out of F4.6E.1 scope (per F4.6E-0 §14):

- **No SSE.** WebSocket via Socket.IO is the only transport per F4.6E-0 §6. Candidate sub-phase **F4.6E.2 — Read-only SSE Mirror** only if a use case appears (kiosks, third-party readers on bandwidth-constrained links).
- **No frontend per-screen realtime wiring.** Server-side emission only. Per-screen migration of the F2D adapter (or a new F4-shape adapter) to consume the three event kinds is a follow-up frontend task (candidate part of F4.5G+).
- **No authentication on the gateway.** Inherits the project-wide no-auth posture (matches REST today). Candidate ADR-009 + dedicated phase owns auth across REST + WebSocket uniformly. Until then: trust the requested `tenantId`; rely on CORS `ALLOWED_ORIGINS` and the network boundary as the only walls.
- **No multi-replica Socket.IO adapter.** Single-process emit only. Candidate sub-phase **F4.6E.3 — Multi-replica Socket.IO Adapter** when a second backend replica appears in deployment (adds `@socket.io/redis-adapter` or equivalent).
- **No durable outbox / replay buffer / last-event-id resync.** Out of scope by design (F4.6E-0 §10.5 / §12). Recovery is REST reconnect against `telemetry_readings` / `live_readings` / `alarm_events`.
- **No throttling / coalescing / batching.** Each emit descriptor produces exactly one Socket.IO emit. Candidate sub-phase **F4.6E.4 — Coalesce / Throttle Policy** when real backpressure is observed.
- **No external protocol bridges.** MQTT / Modbus / OPC-UA / ThingsBoard / Node-RED / PLC / historian fan-out **sinks** remain forbidden in the F4.6E arc. Each is its own future phase / ADR.
- **Per-unit rooms not used as a fan-out target yet.** F4.6E.1 joins them on subscribe but emits only to the per-tenant room. A future phase can flip per-unit emit on once a real subscriber needs it (and a metric proves the tenant room is too coarse for that case).
- **No `alarm.event.acknowledged` / `alarm.event.cleared` events.** F4.6D.1 only writes `state='active'` rows. F4.6E.1 only emits `alarm.event.created`. Lifecycle is owned by candidate sub-phase **F4.6D.3 — Alarm Lifecycle**, which will add the corresponding emit kinds at that time.
- **Mocked-Socket.IO posture leaves live-network semantics unverified.** Same posture as F4.6B.1 / F4.6C.1 / F4.6D.1's mocked Prisma. A live-system integration test (real WebSocket client → real backend → assert emit received) is a candidate cross-phase deliverable (per master roadmap §10), not F4.6E.1 scope.
- **`.env.example` not modified.** Following F4.6B.1's `RVF_INGEST_ENABLED` convention; both flags are opt-in production gates that should not appear as a default-dev surface. Developers set them manually when exercising the path locally.

## 12. Acceptance Criteria

Per F4.6E-0 §17. Every criterion below has been confirmed:

- [x] `RealtimeEmitterService` exists at `apps/backend/src/realtime/realtime-emitter.service.ts`. Single public `emitMany(events)` method.
- [x] Subscribe / unsubscribe handlers exist on `RealtimeGateway` for the F4-shape protocol (`subscribe { tenantId, unitIds? }` / `unsubscribe { tenantId?, unitIds? }`), with per-tenant + per-unit room join logic per F4.6E-0 §9.
- [x] `TelemetryIngestionService` collects `pendingEmits` inside the `prisma.$transaction` and calls `emitter.emitMany(pendingEmits)` **after** the transaction resolves successfully. Tests assert: emit invoked on success; emit NOT invoked on duplicate / conflict / rejected / projection-rollback / alarm-rollback paths (tests #45–#51).
- [x] Three event types implemented per F4.6E-0 §8: `telemetry.reading.accepted`, `live_reading.updated` (created / updated only), `alarm.event.created` (triggered only). Payload shapes match the plan exactly; Decimal-as-string preserved; timestamps ISO-8601.
- [x] Wire types added to `packages/types/src/realtime.ts` — `RealtimeF4Event` envelope union + per-payload interfaces + subscribe / unsubscribe / ack shapes. Legacy F2 variants untouched.
- [x] `RVF_REALTIME_EMIT_ENABLED` env gate respected. Default unset → no-op emit (gateway still connects; subscribers still get `connection` greeting; `ping`/`pong` and `subscribe`/`unsubscribe` still work).
- [x] Emit is best-effort: per-event try/catch in `emitMany`; one bad emit does not block the rest of the batch; nothing thrown out to the caller. Logged via the existing Nest `Logger`.
- [x] No Prisma change, no migration, no seed change. No `apps/web/` change. No `docker-compose.yml` / root `package.json` / lockfile / `turbo.json` / `tsconfig*.json` / `.env*` / CI change. (`.env.example` not modified — see §5.2.)
- [x] **Emit-after-commit invariant** asserted by ingestion-spec test #51: the mocked `$transaction` resolves first, then `emitMany` is called. Call order recorded and verified.
- [x] **No-emit-on-rollback invariant** asserted by tests #49 / #50: projection or alarm-evaluator throw never invokes the emitter.
- [x] No external broker, no Redis adapter, no replay buffer, no SSE, no per-sensor rooms, no auth introduced.
- [x] Existing F4.6B.1 / F4.6C.1 / F4.6D.1 isolation invariants still hold — ingestion still delegates `prisma.liveReading.*` and `prisma.alarmEvent.*` / `prisma.alarmRule.*` to their respective services; no realtime emit from any other service.
- [x] DX-3 §"Runtime phases" validation surface passes end to end: `prisma validate` / `generate`, backend `lint -- --max-warnings 0` / `typecheck` / `build` / `test` (173/173 across 15 spec files), workspace `lint` / `typecheck` / `build`.
- [x] F4.6E.1 closeout report exists at `docs/architecture/RVF_Malinois_F4_6E_1_WebSocket_SSE_Fan_Out_Closeout.md` (this document), follows the established closeout structure, reports the final test count, and flags any deviation from the plan.
- [ ] Master roadmap §3 / §7 refresh — **deferred to a small follow-up hygiene commit** (see §13). Cleaner to keep this commit "code + closeout" only; the roadmap update is a one-file documentation edit best done in its own commit after the F4.6E.1 commit lands.

## 13. Recommended Next Step

**Two follow-ups in order, both small:**

1. **Master roadmap hygiene refresh.** Flip F4.6E.1 from *"Next"* → **Closed** with the F4.6E.1 commit hash in §3; remove F4.6E.1 from §7's numbered sequence (it becomes the new "already closed" preamble entry); promote **F4.6F-0** from *Deferred* → **Next**; update §2's "WebSocket / SSE fan-out" row from *Planned* to populated/closed. Mirror the pattern used after F4.6D-0 (commit `66bfc79`), F4.6D.1 (commit `637724c`), and F4.6E-0 (commit `cf97943`). Documentation-only, ~30 lines diff.

2. **F4.6F-0 — Historical Trend API Plan.** The next plan-first phase per master roadmap §7 (after the hygiene refresh above). Scope (per current master-roadmap entries):
   - Bucketing / downsampling / multi-tag read decisions for `/api/v1/telemetry/trends`.
   - UI cutover plan for Operations charts off the F2 simulator + F3 mock and onto live `telemetry_readings` reads.
   - Optional interaction with the F4.6C.2 (latest-value read API) and F4.6E.1 (realtime push) surfaces — when does the trend API call complement vs. duplicate the realtime stream?
   - Test plan / risks / acceptance criteria for F4.6F.1.
   - Plan-first per the DX-3 pattern.

After F4.6F, master roadmap §7 continues with **F4.5G — Resume UI adapter wiring** (including the frontend consumption of the new F4.6E.1 event kinds once a screen migration needs them).

Candidate follow-ups specific to the fan-out track, named in F4.6E-0 §18 but not on the main sequence:

- **F4.6E.2 — Read-only SSE Mirror** (if a use case appears).
- **F4.6E.3 — Multi-replica Socket.IO Adapter** (when a second backend replica appears).
- **F4.6E.4 — Coalesce / Throttle Policy** (when real backpressure is observed).
- **ADR-009 — Authentication / Authorization Architecture** (owns auth across REST + WebSocket uniformly; independent of F4.6F).

These are named so they have a place to land. None is committed to as part of F4.6E.1.

---

*F4.6E.1 closeout, authored at HEAD `cf97943` (Refresh master roadmap after F4.6E-0). Implementation commit pending per the task brief's "do not commit" instruction. Update on commit (replace "pending" with the F4.6E.1 commit hash) and again when the roadmap hygiene commit lands.*
