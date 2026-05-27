# RVF Malinois — F4.6E-0 WebSocket / SSE Fan-out Plan

> Phase **F4.6E-0 — WebSocket / SSE Fan-out Plan**. Plan-first per the codified project pattern (F4.2A → F4.2B, F4.6A.0 → F4.6A.1, F4.6B-0 → F4.6B.1, F4.6C-0 → F4.6C.1, F4.6D-0 → F4.6D.1).
> Documentation-only artifact. No backend, frontend, schema, migration, or runtime code is modified by F4.6E-0. Implementation lands in F4.6E.1.
> Last known head at authoring time: commit `637724c` (Refresh master roadmap after F4.6D.1).
>
> Upstream references:
> - Master Roadmap (most recent refresh): `docs/architecture/RVF_Malinois_Master_Roadmap.md` (commit `637724c`).
> - Local DB Migration Validation Procedure (DX-2): `docs/operations/RVF_Malinois_Local_DB_Migration_Validation_Procedure.md` (commit `e3ccb52`).
> - Definition of Done (DX-3): `docs/operations/RVF_Malinois_Definition_of_Done.md` (commit `65cb736`).
> - DX-4 Roadmap Update + Docker Runtime Note: `docs/architecture/RVF_Malinois_DX_4_Roadmap_Update_Docker_Runtime_Note_v1.0.md` (commit `04dadc4`).
> - F4 architecture: `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md`.
> - ADR-005 (Snapshot / Browser / Freeze boundary): `docs/adr/RVF_Malinois_Adenda_Arquitectura_ADR_001_006_v1.4.md`.
> - ADR-006 (RVF as primary platform): `docs/adr/ADR-006_RVF_Malinois_Primary_Platform_System_of_Record.md`.
> - ADR-008 (Telemetry Persistence / Ingestion, **Proposed**): `docs/adr/ADR-008_RVF_Malinois_Telemetry_Persistence_Ingestion.md`.
> - F4.6 architecture: `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Architecture.md` (commit `c12a29c`).
> - F4.6B-0 plan: `docs/architecture/RVF_Malinois_F4_6B_Ingestion_Boundary_Plan.md` (commit `c4ea18a`).
> - F4.6B.1 closeout: `docs/architecture/RVF_Malinois_F4_6B_1_Ingestion_Boundary_Skeleton_Closeout_Report_v1.0.md` (commit `1495457`).
> - F4.6C-0 plan: `docs/architecture/RVF_Malinois_F4_6C_Live_Readings_Projection_Updater_Plan.md` (commit `f126c5c`).
> - F4.6C.1 closeout: `docs/architecture/RVF_Malinois_F4_6C_1_Live_Readings_Projection_Updater_Closeout_Report_v1.0.md` (commit `49a8349`).
> - F4.6D-0 plan: `docs/architecture/RVF_Malinois_F4_6D_Alarm_Evaluation_Boundary_Plan.md` (commit `901cd22`).
> - F4.6D.1 closeout: `docs/architecture/RVF_Malinois_F4_6D_1_Alarm_Evaluation_Boundary_Closeout.md` (commit `d35a2b8`).

## 1. Purpose

F4.6E-0 is the **plan-first** phase for the RVF Malinois realtime fan-out boundary.

What this phase does:

- Locks the protocol choice (Socket.IO over WebSocket — see §6) so F4.6E.1 has no protocol-selection ambiguity to negotiate at code time.
- Defines the architectural placement of fan-out in the RVF-owned data path (always downstream of canonical persistence, never source of truth).
- Inventories the existing realtime surface (backend Socket.IO gateway scaffold + frontend client + shared `RealtimeMessage` contract) and names exactly which parts are reused, which are extended, and which remain untouched.
- Names the narrow scope, event types, channel topology, transactional emission semantics, throttling policy, reconnect/resync strategy, security posture, test plan, risks, and acceptance criteria for **F4.6E.1 — WebSocket / SSE Fan-out Implementation**.
- States non-goals so F4.6E.1 cannot quietly absorb work that belongs to a future authentication phase, a public-DTO read API, or any external broker bridge.

What this phase does **not** do:

- It does not add any emit / subscribe logic to `apps/backend/src/realtime/` (that is F4.6E.1).
- It does not write any code under `apps/backend/src/` or `apps/web/`.
- It does not add or modify Prisma schema or migrations.
- It does not introduce notifications, escalations, external delegation, or any cross-region pub/sub.

Fan-out is the **next logical step** after `telemetry_readings` insertion (F4.6B.1), `live_readings` projection upsert (F4.6C.1), and `alarm_events` creation (F4.6D.1). All three writers now commit together inside the per-sample `prisma.$transaction`; F4.6E defines how those committed events become a low-latency live stream for connected operators without ever becoming a parallel source of truth.

## 2. Current Repository State

Drawn from `git log`, the master roadmap, and direct inspection of the source files referenced in §5.

| Phase | Status | Commit |
|---|---|---|
| F4.6 architecture + ADR-008 (`Proposed`) | Closed | `c12a29c` |
| F4.6 closeout | Closed | `334bfc5` |
| F4.6A.0 — Schema Hardening Plan | Closed | `014df37` |
| F4.6A.1 — Schema Hardening Migration | Closed | `6be7842` |
| F4.6B-0 — Ingestion Boundary Plan | Closed | `c4ea18a` |
| F4.6B.1 — Telemetry Ingestion Boundary Skeleton | Closed | `1495457` |
| F4.6C-0 — Live Readings Projection Updater Plan | Closed | `f126c5c` |
| F4.6C.1 — Live Readings Projection Updater | Closed | `49a8349` |
| F4.6D-0 — Alarm Evaluation Boundary Plan | Closed | `901cd22` |
| F4.6D.1 — Alarm Evaluation Boundary Implementation | Closed | `d35a2b8` |
| DX-1 / DX-2 / DX-3 / DX-4 | Closed | `b19e77a` / `e3ccb52` / `65cb736` / `04dadc4` |
| Master roadmap refreshes | Closed | `7c54f82` / `66bfc79` / `637724c` |
| **F4.6E-0 — WebSocket / SSE Fan-out Plan** (this document) | **Current** | *(pending)* |
| F4.6E.1 — WebSocket / SSE Fan-out Implementation | Deferred (next implementation phase) | — |

What this means for the per-sample write path in the running backend (the upstream this plan must respect):

- **`telemetry_readings`** — canonical, append-only. F4.6B.1 inserts here via `POST /api/v1/telemetry/ingest` (gated by `RVF_INGEST_ENABLED`).
- **`live_readings`** — derived latest-good projection. F4.6C.1 upserts inside the same per-sample `prisma.$transaction` as the canonical insert, quality-gated to `good`, watermark-gated by `timestamp`.
- **`alarm_events`** — operational signal. F4.6D.1 creates `state='active'` rows from inside the same `prisma.$transaction` after the projection step, with a duplicate-active guard and a frozen `rule_snapshot` JSONB.
- **Realtime fan-out** — **not implemented yet.** Backend `apps/backend/src/realtime/realtime.gateway.ts` exists as a Socket.IO scaffold (boots, accepts a connection, replies to `ping`) but routes no business events. Frontend `apps/web/lib/realtime/socket.ts` and the F2D `BackendWebSocketTelemetryAdapter` are wired against the same path but receive nothing the backend currently sends.

Roadmap anchor: **`637724c` (Refresh master roadmap after F4.6D.1)**. §7 there names F4.6E-0 as the next plan-first phase.

## 3. Architectural Position

Fan-out sits **downstream of canonical persistence** and **downstream of derived operational state**, never upstream of either. The full RVF-owned data path is:

```
external input → ingestion boundary → telemetry_readings → live_readings → alarm evaluation → alarm_events
   (any kind)      (F4.6B.1)          (canonical,           (latest-good     (F4.6D.1)          (state='active')
                                       append-only)          projection,
                                                             F4.6C.1)
                                                                                                       │
                                                                                                       ▼
                                                                                                 fan-out boundary
                                                                                                   (F4.6E.1)
                                                                                                       │
                                                                                                       ▼
                                                                                                browser subscribers
                                                                                                 (read-only push)
```

Two principles govern the placement:

1. **Fan-out is downstream-only and never canonical.** A browser that loses its connection and reconnects does not "replay" missed events from any in-memory buffer the backend holds; it re-reads from REST. The persisted tables (`telemetry_readings`, `live_readings`, `alarm_events`) are the system's recovery surface. This preserves ADR-008 §3 decision 5 (projection is derived, never canonical) and extends the same principle to fan-out.
2. **Emit happens AFTER commit, never inside the transaction.** A failed transaction must not emit; an emit failure must not break the transaction. F4.6D.1's `prisma.$transaction(async (tx) => { … })` returns its outcomes to the ingestion service, which decides what to emit. Emit cannot live inside the transaction callback — see §10 for the exact wiring.

What stays the same:

- `telemetry_readings` / `live_readings` / `alarm_events` remain the canonical surfaces. Fan-out never writes to them.
- F4.6B.1's `RVF_INGEST_ENABLED` env gate stays the only switch for ingestion-driven traffic. F4.6E.1 adds its own env gate (see §13) for the *emission* side; the gateway socket itself remains addressable.
- WebSocket / SSE channels never carry control commands to field equipment. ADR-001 (no PLC), ADR-005 (browser boundary). This is monitoring fan-out, not command-and-control.

## 4. Ownership / Source of Truth

RVF Malinois owns, end to end, every concern in the fan-out path:

- **The wire schemas** for fan-out events. Living in `packages/types/src/realtime.ts` (already exists with the F0/F2-era `RealtimeMessage` discriminated union) — extended in F4.6E.1 with the F4-era event shapes (see §7).
- **The channel topology** (which subscribers see which events — see §8).
- **The transactional emission semantics** (when, after what, with what payload — see §9).
- **The reconnect / resync contract** (REST is the recovery surface — see §11).
- **The security posture** (env-gated emission; auth deferred to a candidate later phase — see §12).
- **Connection lifecycle** (`ConnectionState` transitions surfaced to the UI per ADR-005 §"never lie about freshness").

What RVF Malinois does **not** delegate to any external system:

- No external broker (MQTT / Modbus / OPC-UA / Kafka / RabbitMQ / NATS / Redis pub-sub / SQS / PubSub) sits in the fan-out path. The backend emits Socket.IO frames directly to subscribed sockets it manages.
- ThingsBoard / Node-RED do **not** push events to RVF subscribers. They may, in some far-future phase, *consume* RVF fan-out as an integration sink — but not produce.
- Cross-region replication and multi-replica pub/sub are out of scope (see §15). F4.6E.1 ships single-process emit only.

This continues the principle ADR-006 / ADR-007 / ADR-008 / F4.6D-0 §4 established at the API / data / telemetry / alarm layers, now extended to the live-push layer.

## 5. Existing Realtime Surface Inventory

Direct repository evidence as of `637724c`. No surface is invented here.

### 5.1 Backend gateway (scaffold)

`apps/backend/src/realtime/realtime.gateway.ts` — `@WebSocketGateway` from `@nestjs/websockets`, namespace `/realtime`, path `/api/v1/stream`, CORS open to the same allowed origins as the HTTP API. Implements `OnGatewayInit`, `OnGatewayConnection`, `OnGatewayDisconnect`:

- `afterInit()` — logs allowed origins.
- `handleConnection(client)` — logs the connect and emits a single `connection` greeting event carrying a `ConnectionState`.
- `handleDisconnect(client)` — logs the disconnect.
- `@SubscribeMessage('ping')` `handlePing()` — replies with `{ kind: 'pong', ts }`. Echo-style.

Per the file's docstring: this is the F0 / F2 foundation; it intentionally does **not** authenticate, does **not** accept subscription requests, does **not** route messages, does **not** touch the database, and does **not** touch any business module.

`apps/backend/src/realtime/realtime.module.ts` — `RealtimeModule` providing and exporting `RealtimeGateway`. Registered unconditionally in `apps/backend/src/app.module.ts` (`RealtimeModule` in `imports`).

### 5.2 Frontend client (scaffold)

`apps/web/lib/realtime/socket.ts` — `createSocketClient(url)` using `socket.io-client@^4.8.1`. Connects to `/api/v1/stream`, `transports: ['websocket']`, exponential backoff with jitter (`reconnectionDelay: 1000`, `reconnectionDelayMax: 10_000`, `randomizationFactor: 0.5`). Surfaces `ConnectionState` to listeners; routes typed `RealtimeMessage` to message listeners; records `lastDataAt` for staleness reporting per ADR-005 §"never lie about freshness."

Per its docstring: F0 wires the connection lifecycle and surfaces typed `ConnectionState`. F2 was supposed to add the subscribe/unsubscribe API, the ring buffer for telemetry, the rAF tick, and the REST catch-up call. The store / ring buffer / hooks ship today (F2D); the subscribe protocol does not.

`apps/web/lib/realtime/RealtimeProvider.tsx` — React provider mounting the Socket.IO client. `apps/web/lib/realtime/telemetryStore.ts` — Zustand store / ring buffer fed by an adapter (today: the F2A simulator or the F2D `BackendWebSocketTelemetryAdapter`).

`apps/web/lib/telemetry/adapters/websocket.ts` — `BackendWebSocketTelemetryAdapter` (F2D). Connects to `NEXT_PUBLIC_RVF_TELEMETRY_WS_URL`, strict-parses inbound JSON against a `NormalizedTelemetryMessage` shape, drops malformed frames silently in prod, surfaces `CommunicationStatus`. **Important nuance:** this adapter expects a *normalized telemetry message contract* the backend does not yet produce; it currently runs against either nothing (no URL configured → factory falls back to the simulator) or test fixtures.

### 5.3 Shared types (`packages/types/src/realtime.ts`)

```ts
export type RealtimeMessage =
  | { kind: 'telemetry'; payload: TelemetryMessage }
  | { kind: 'alarm'; payload: AlarmMessage }
  | { kind: 'sensor_health'; payload: SensorHealthSample }
  | { kind: 'connection'; payload: ConnectionState };

export type ConnectionState =
  | { status: 'connecting' }
  | { status: 'connected'; since: string }
  | { status: 'reconnecting'; attempt: number; lastDataAt: string | null }
  | { status: 'disconnected'; lastDataAt: string | null };

export interface SubscribeRequest {
  kind: 'subscribe';
  job_id?: JobId;
  well_ids?: WellId[];
  tags?: string[];
}

export interface UnsubscribeRequest {
  kind: 'unsubscribe';
  job_id?: JobId;
  well_ids?: WellId[];
}
```

`TelemetryMessage` and `AlarmMessage` in `packages/types/src/telemetry.ts` are the **F2-era edge envelope shapes** — they reference `job_id` (which remains deferred in F4) and use compact `measurements: Record<CanonicalTag, TelemetryMeasurement>` payloads. F4.6E.1 must define payload shapes consistent with the **F4-era persisted data** (no `jobId` field today — it is always `null` per F4.6B.1 / F4.6C.1 / F4.6D.1; per-sample one-tag-per-reading); see §7. The existing F2 types remain in place for backward compatibility but are not what F4.6E.1's new event types reuse verbatim.

### 5.4 Dependencies

Backend (`apps/backend/package.json`): `@nestjs/websockets@^10.4.7`, `@nestjs/platform-socket.io@^10.4.7`, `socket.io@^4.8.1` already present.

Frontend (`apps/web/package.json`): `socket.io-client@^4.8.1` already present.

No new dependency is required for F4.6E.1.

### 5.5 What does NOT exist

- No subscribe / unsubscribe handler on the backend.
- No room / namespace logic beyond `/realtime`.
- No emit hook on the ingestion path (the gateway is never called from `TelemetryIngestionService`, `LiveReadingsProjectionService`, or `AlarmEvaluationService` — verified by the F4.6B.1 / F4.6C.1 / F4.6D.1 isolation invariants).
- No SSE (`/sse`, `EventSource`, `text/event-stream`) anywhere in the repo.
- No authentication on the WebSocket. CORS is open to `ALLOWED_ORIGINS` only.
- No env gate on the gateway itself (it boots unconditionally).
- No backend-side rate limit / throttle / coalesce.

## 6. Protocol Recommendation — Socket.IO over WebSocket

**Recommendation: keep Socket.IO over WebSocket. Do not add SSE as a parallel transport in F4.6E.1.**

Analysis:

| Concern | Socket.IO (existing) | SSE |
|---|---|---|
| Bidirectional | ✅ Required for `subscribe` / `unsubscribe` messages | ❌ Unidirectional; subscribe would need a separate POST endpoint |
| Repo evidence | ✅ Backend `RealtimeGateway` + `@nestjs/websockets` + `socket.io@^4.8.1`; frontend `socket.io-client@^4.8.1` + `createSocketClient` + `BackendWebSocketTelemetryAdapter` all already wired | ❌ Zero references to `EventSource` / `text/event-stream` / `/sse` anywhere in the codebase |
| Reconnect | ✅ Built into socket.io with exponential backoff + jitter; the frontend client already implements it | ✅ Built into `EventSource` natively, but with simpler semantics (last-event-id) — would need server-side tracking we have not designed |
| HTTP/2 multiplexing pressure | ⚠️ One WS connection per client (already designed for "single multiplexed connection") | ⚠️ Six-connection-per-origin limit on HTTP/1.1; only mitigated by HTTP/2 |
| Binary frames | ✅ Supported (not needed today) | ❌ Text only |
| Operational simplicity | ⚠️ Sticky sessions required if we ever scale beyond one backend replica (Socket.IO adapter needed) | ✅ Stateless on HTTP — easier to put behind any LB |
| Auth flow | ⚠️ Connection-time handshake (future) | ⚠️ Cookie / header on the initial HTTP GET (future) |

**The "two transports" anti-pattern.** Adding SSE alongside Socket.IO doubles the surface F4.6E.1 has to author, double the test surface, doubles the backend emit fan-out (every event must be emitted to two transport stacks consistently), and burdens the frontend with two reconnect models. The repo investment in Socket.IO is substantial; nothing in the operator workflow that we know of today benefits from SSE-specific properties (read-only consumers on bandwidth-constrained links, simple cron consumers) badly enough to justify it.

**When SSE may revisit.** A future small phase (candidate **F4.6E.2 — Read-only SSE Mirror**) could expose a curated subset of events over SSE for low-touch consumers (kiosk dashboards, third-party readers that should not require a WebSocket client) once F4.6E.1 has settled. Not committed to here.

**F4.6E.1 ships Socket.IO over WebSocket only.** All payload shapes, channel topology, and acceptance criteria below assume that.

## 7. Proposed F4.6E.1 Implementation Boundary

F4.6E.1 introduces emission logic — but **only** as collaborators called by `TelemetryIngestionService` after the per-sample transaction commits. The gateway already exists; F4.6E.1 extends it.

### 7.1 In-scope for F4.6E.1

- **`RealtimeEmitterService`** at `apps/backend/src/realtime/realtime-emitter.service.ts` (path TBD by F4.6E.1; the directory `apps/backend/src/realtime/` exists per §5.1). Single responsibility: take an in-memory event description and emit it to the appropriate Socket.IO room(s). It does not subscribe to anything itself; it does not call Prisma; it does not touch the transaction. Injected into the gateway (or the gateway is injected into it — F4.6E.1 picks the cleanest direction).
- **Subscription protocol on the gateway.** Two new `@SubscribeMessage` handlers:
  - `subscribe { tenantId: string; unitIds?: string[] }` → the gateway adds the socket to the tenant room and optionally per-unit rooms (see §8 for exact room naming). Returns an acknowledgement payload describing the rooms joined.
  - `unsubscribe { tenantId?: string; unitIds?: string[] }` → leaves the named rooms; if both omitted, leaves all rooms the socket has joined.
  Both handlers validate the shape and silently no-op (with a logged warning) for malformed payloads. **Server-side scope validation** is a forward-compat seam: F4.6E.1 trusts the requested tenant id (no auth exists yet); the seam exists so a future auth phase can reject mismatches.
- **Three new event types** emitted, each carrying canonical persisted ids (not raw input):
  - `telemetry.reading.accepted` — emitted once per `accepted` outcome from `ingestBatch`, regardless of `quality`. Payload: `{ telemetryReadingId, tenantId, unitId, sensorId, canonicalTagId, value, engineeringUnit, quality, timestamp, source, sequence }`.
  - `live_readings.updated` — emitted once per projection outcome of `created` or `updated`. Skipped for `skipped_stale`, `skipped_equal_timestamp`, `skipped_quality`. Payload: `{ liveReadingId | null (for 'updated'), tenantId, unitId, sensorId, canonicalTagId, value, engineeringUnit, timestamp, source, ingestionTimestamp }`.
  - `alarm.event.created` — emitted once per `triggered` per-rule outcome (one emit per matched-and-triggered rule). Skipped for `skipped_duplicate_active`, `no_threshold_violated`. Payload: `{ alarmEventId, tenantId, unitId, canonicalTagId, alarmRuleId, severity, triggeredValue, thresholdViolated, state: 'active', firstTriggeredAt }`.
- **Post-commit emission hook.** `TelemetryIngestionService` collects the per-sample emit descriptors *inside* the transaction (without emitting), and emits them *after* `prisma.$transaction(async (tx) => …)` resolves successfully. Any throw inside the transaction skips the emit entirely.
- **Env gate `RVF_REALTIME_EMIT_ENABLED`.** Mirrors F4.6B.1's `RVF_INGEST_ENABLED` pattern. When unset, `RealtimeEmitterService` is wired but no-ops (logs once at boot). Gateway / subscribe / unsubscribe / ping all continue to work (so the frontend can connect and see `ConnectionState` even when emission is off — preserves the F0 contract).
- **Wire types extension.** Add new variants to the `RealtimeMessage` union in `packages/types/src/realtime.ts` (or a sibling `realtime.f4.ts` if cleaner), discriminated by `kind`. The existing F2 variants stay untouched. Frontend consumers narrow on the new `kind` values. Naming options for F4.6E.1 to lock: `'telemetry.reading.accepted'` / `'live_reading.updated'` / `'alarm.event.created'` (dotted convention used here) **or** `'telemetry_reading_accepted'` etc. Pick one in F4.6E.1; the plan picks dotted for clarity.
- **Unit-test coverage.** Mocked-Socket.IO + mocked Prisma vitest specs covering: post-commit-only emit; rollback skips emit; emit invoked the right number of times per outcome; payloads carry the resolved canonical ids; subscribe / unsubscribe handlers add / remove rooms; env-gate disable behavior; isolation (no DB call from the emitter; gateway never touches Prisma).
- **Ingestion-spec extension.** Add ~5 tests to `telemetry-ingestion.service.spec.ts` covering the post-commit emit invocations (one per outcome type) and the env-gate off path.

### 7.2 Out-of-scope (deferred — see §13)

Auth on the gateway; SSE; per-sensor rooms; replay / catch-up buffer (recovery stays REST); coalesce / batching; broker-backed fan-out (Redis adapter); cross-replica pub/sub; CLI / TUI clients; binary frames; rate limit enforcement; client-side reconnect protocol changes (the existing socket.io reconnect stays); the F2D `BackendWebSocketTelemetryAdapter`'s normalized-message-shape migration (deserves its own per-screen migration once F4.6E.1 ships).

### 7.3 What F4.6E.1 explicitly does **not** touch

- `apps/backend/prisma/schema.prisma` — no model change.
- `apps/backend/prisma/migrations/` — no new migration.
- `apps/backend/prisma/seed.f4.ts` — no seed change.
- `apps/backend/src/alarms/` — no change. The alarm evaluator stays in the transaction; emission reads its outcome.
- `apps/backend/src/telemetry/projection/` — no change. Same reasoning.
- `apps/backend/src/{tenants,wells,equipment,jobs,tags,health}/` — no change.
- `apps/web/app/` — no Next.js page change. The frontend wiring is a separate per-screen migration (after F4.6E.1 ships server-side emission, the F2D adapter or a new F4-shape adapter can consume the new event types).
- `docker-compose.yml`, root `package.json`, lockfile, `turbo.json`, `tsconfig*.json`, `.env*`, CI config.

## 8. Event Types and Payload Shapes

Naming convention: dotted lowercase `noun.subject.verb` (`telemetry.reading.accepted`, `live_reading.updated`, `alarm.event.created`). Wire schema versioning is added in the payload (`schema: 'rvf.realtime.v1'`) so future versions can evolve without breaking older clients.

### 8.1 `telemetry.reading.accepted`

Emitted once per `accepted` outcome from `TelemetryIngestionService.ingestBatch`, regardless of `quality`. Lets a subscriber observe every successful canonical insert.

```ts
{
  schema: 'rvf.realtime.v1',
  kind: 'telemetry.reading.accepted',
  payload: {
    telemetryReadingId: string;        // UUID
    tenantId: string;                  // UUID
    unitId: string;                    // UUID
    sensorId: string;                  // UUID
    canonicalTagId: string;            // UUID
    value: string;                     // Decimal as string (precision)
    engineeringUnit: string;           // 'psi', 'degC', …
    quality: 'good' | 'uncertain' | 'bad';
    timestamp: string;                 // ISO-8601 — reading's timestamp
    source: string;                    // source.kind (e.g. 'manual', 'mqtt')
    sequence: string | null;           // bigint as string, or null when omitted
  };
}
```

### 8.2 `live_reading.updated`

Emitted once per projection outcome of `created` or `updated`. Skipped for the three non-write outcomes (`skipped_stale`, `skipped_equal_timestamp`, `skipped_quality`).

```ts
{
  schema: 'rvf.realtime.v1',
  kind: 'live_reading.updated',
  payload: {
    liveReadingId: string | null;      // UUID for 'created'; null for 'updated' (the projection service only returns id on create)
    tenantId: string;
    unitId: string;
    sensorId: string;
    canonicalTagId: string;
    value: string;                     // Decimal as string
    engineeringUnit: string;
    quality: 'good';                   // by construction
    timestamp: string;                 // ISO-8601
    source: string;
    ingestionTimestamp: string;        // ISO-8601 — when the backend accepted it
    outcome: 'created' | 'updated';    // discriminator for consumers that care
  };
}
```

### 8.3 `alarm.event.created`

Emitted once per per-rule outcome of `triggered`. Skipped for `skipped_duplicate_active` and `no_threshold_violated`. Multiple emits in one batch if a single reading triggers multiple rules (the F4.3 seed's warning + critical pattern).

```ts
{
  schema: 'rvf.realtime.v1',
  kind: 'alarm.event.created',
  payload: {
    alarmEventId: string;              // UUID
    tenantId: string;
    unitId: string;
    canonicalTagId: string;
    alarmRuleId: string;               // UUID
    severity: 'info' | 'warning' | 'critical';
    triggeredValue: string;            // Decimal as string
    thresholdViolated: 'low_low' | 'low' | 'high' | 'high_high';
    state: 'active';                   // F4.6E.1 only emits creations; lifecycle deferred
    firstTriggeredAt: string;          // ISO-8601 — equal to the reading's timestamp
  };
}
```

### 8.4 What is NOT in the F4.6E.1 wire surface

- **No raw HTTP `connection` / `pong` echoes added or modified** — the existing F0 `connection` greeting and `ping → pong` handler keep their shape.
- **No projection-skip events.** Subscribers do not see `skipped_stale` etc.; if a subscriber needs to know "we attempted a projection update," that's a different concern and stays out.
- **No quarantine events.** The ingestion service writes to `telemetry_ingestion_errors`, but those rows are not pushed over fan-out; operator visibility into quarantine is a future read-API concern.
- **No alarm lifecycle events.** F4.6D.1 only writes `state='active'` rows; lifecycle transitions are F4.6D.3. When that lands, F4.6E will add `alarm.event.acknowledged` / `alarm.event.cleared` variants; F4.6E.1 does not pre-declare them.
- **No `sensor_health` events.** The F2-era `'sensor_health'` variant in `RealtimeMessage` is not emitted by F4.6E.1. It is a future concern tied to its own data source (none today).
- **No public DTO / Swagger entry.** The gateway is internal; the wire types live in `packages/types` for frontend consumers.

## 9. Channel / Subscription Topology

### 9.1 Rooms

Socket.IO rooms (per the `socket.io` library's built-in room API) are used as the fan-out unit. F4.6E.1 defines two tiers:

1. **Per-tenant room.** Name: `tenant:${tenantId}`. The minimum scope for a subscriber. Every emitted event is sent to its tenant's room. A client that subscribes to only `{ tenantId }` (no `unitIds`) joins this room and sees every event for that tenant.
2. **Per-unit room.** Name: `unit:${unitId}`. Optional finer-grain scope. A client subscribes to `{ tenantId, unitIds: [u1, u2] }` and joins `tenant:${tenantId}` **plus** `unit:u1` and `unit:u2`. Per-unit rooms exist for emitter convenience and as a future precision filter; F4.6E.1 sends each event to both `tenant:${tenantId}` and `unit:${unitId}` so that subscribers with either subscription see it. Duplicate delivery is avoided by Socket.IO's `to(rooms).except(...)` semantics — but the simplest implementation is to emit only to the tenant room in F4.6E.1, and treat per-unit rooms as a forward-compat seam (decided in F4.6E.1).

**F4.6E.1 picks the simplest correct implementation.** Recommendation: **emit only to the per-tenant room** in F4.6E.1. Per-unit rooms are joined but not yet used as a fan-out target. Reasoning: a per-tenant room with N units and M subscribers fans out to M sockets, not M×N — Socket.IO already filters. The per-unit room becomes load-bearing only when a tenant has many units AND the client wants to subscribe to a subset; that case is not yet operationally observed. F4.6E.1 ships the room-join wiring but the emitter targets the tenant room.

### 9.2 Subscription messages

Wire shapes (added to `packages/types/src/realtime.ts`):

```ts
export interface SubscribeF4Request {
  kind: 'subscribe';
  tenantId: string;
  unitIds?: string[];
}

export interface UnsubscribeF4Request {
  kind: 'unsubscribe';
  tenantId?: string;       // omit + unitIds omitted = leave all rooms
  unitIds?: string[];
}

export interface SubscribeAcknowledgement {
  kind: 'subscribed';
  tenantRoom: string;      // 'tenant:<uuid>'
  unitRooms: string[];     // ['unit:<uuid>', ...]
}
```

The legacy F2-era `SubscribeRequest` / `UnsubscribeRequest` (which use `job_id` / `well_ids` / `tags`) **stay in place but are not used by F4.6E.1.** A future per-screen migration may consolidate them; the plan does not.

### 9.3 Connection-time defaults

Per the F0 contract, every new connection joins **no rooms** and receives the existing `connection` greeting. The client must explicitly send `subscribe` to begin receiving fan-out events. This keeps the gateway's CPU profile flat for casual connections (browser tab opened to the wrong page).

### 9.4 Multi-tenant subscriptions

A single socket may subscribe to multiple `tenantId`s by sending multiple `subscribe` messages. Server-side scope validation (deferred — see §12) would reject mismatched tenants once auth lands; F4.6E.1 allows them silently with a logged warning.

## 10. Transaction and Emission Semantics

### 10.1 The fundamental rule — emit AFTER commit

The per-sample `prisma.$transaction(async (tx) => { … })` in `TelemetryIngestionService` commits or rolls back atomically. F4.6E.1 must:

1. **Collect emit descriptors inside the transaction**, in memory, as the projection and alarm steps return outcomes.
2. **Emit only after the transaction promise resolves successfully.** The await on `$transaction` returns the canonical row's id; the emit hook runs on the next line.
3. **Skip emit entirely if the transaction throws.** The outer `catch (err)` in `processSample` (which handles P2002 → dedup classification and other errors → `mapping_engine_failure`) cannot reach the emit path because the success path is the only path that holds the collected descriptors.

### 10.2 Concrete wiring sketch (for F4.6E.1 to refine)

```ts
// Inside processSample:
let pendingEmits: PendingEmit[] = [];

try {
  const created = await this.prisma.$transaction(async (tx) => {
    const row = await tx.telemetryReading.create({ … });
    pendingEmits.push(makeTelemetryAcceptedEmit(row, …));

    if (sample.quality === 'good') {
      const projectionOutcome = await this.projection.updateFromAcceptedTelemetry({ … }, tx);
      if (projectionOutcome.outcome === 'created' || projectionOutcome.outcome === 'updated') {
        pendingEmits.push(makeLiveReadingUpdatedEmit(projectionOutcome, …));
      }
      const alarmResult = await this.alarms.evaluate({ … }, tx);
      if (alarmResult.outcome === 'evaluated') {
        for (const perRule of alarmResult.perRule) {
          if (perRule.status === 'triggered') {
            pendingEmits.push(makeAlarmEventCreatedEmit(perRule, …));
          }
        }
      }
    }
    return row;
  });

  // Past this line, the transaction has committed. Emit fan-out.
  await this.emitter.emitMany(pendingEmits);   // never throws (see §10.4)

  return { sampleIndex, outcome: 'accepted', telemetryReadingId: created.id };
} catch (err) {
  // pendingEmits is intentionally discarded here — the transaction rolled back.
  if (!isUniqueViolation(err)) throw err;
  return this.classifyDedup({ … });   // emit is not invoked on dedup paths
}
```

Why both **`projectionOutcome` collection and `alarmResult` collection happen inside the transaction**: the services already run inside `tx`, and their return values are not persistent state — they are in-memory descriptors. Collecting them inside the transaction is just where the data is at hand; emission strictly happens on the success continuation.

### 10.3 What `emitMany` does

`RealtimeEmitterService.emitMany(events)` iterates the collected events and for each one calls `gateway.server.to('tenant:' + event.payload.tenantId).emit(event.kind, event.payload)`. Wrapped in `try { … } catch { logger.error(…) }` per event so a single bad emit cannot trip the rest of the batch.

### 10.4 Failure semantics — emit is best-effort

If `emitMany` throws (unexpected), it is **caught and logged** but does not roll back the transaction (already committed) and does not change the ingestion outcome the caller sees. The persisted state is the source of truth; the operator gets a delayed read via REST. This is the F4.6E.1 implementation of ADR-008 §3 decision 5 — losing a projection event is recoverable; losing canonical history is not.

### 10.5 What never happens

- The emit path never reads from Prisma. All payload data comes from the descriptors collected inside the transaction.
- The emit path never writes anywhere — not Prisma, not Redis, not a file. Only `server.to(room).emit(kind, payload)`.
- The transaction is never extended to wait for emit acknowledgements. Emit is fire-and-forget.

## 11. Throttling / Backpressure / Coalescing Policy

**F4.6E.1 implements no throttle, no batching, no coalescing.** Every emit descriptor produces exactly one Socket.IO emit. Reasoning:

- The ingestion path is already gated by `RVF_INGEST_ENABLED` and the boundary validates batches of `1..1000` samples (per F4.6B.1). The observed traffic per backend instance is bounded by the rate at which the boundary accepts samples — which today, in dev, is "operator clicks a button" or "a future bridge POSTs a batch."
- The fan-out cost per emit is `O(subscribers in the tenant room)`; Socket.IO handles the deduplication / serialization.
- Adding coalescing (e.g. "merge consecutive `live_reading.updated` for the same key within a 100 ms window") is an optimization that needs data we don't have. Locking it now risks under- or over-engineering.

**When to revisit:** if any of the following appear, F4.6E.x should add coalesce / throttle:

- A real bridge POSTs > 100 samples/second sustained and a frontend chart starts dropping frames.
- A single tenant has > 50 concurrent subscribers in one room and emit latency starts to dominate.
- The browser ring buffer (Zustand store) shows back-pressure symptoms.

Until then, F4.6E.1 ships the simplest correct fan-out.

## 12. Reconnect / Resync Strategy

**Reconnect** — handled by the existing `socket.io-client` configuration in `apps/web/lib/realtime/socket.ts`: exponential backoff with jitter (`reconnectionDelay: 1000`, `reconnectionDelayMax: 10_000`, `randomizationFactor: 0.5`, `reconnectionAttempts: Infinity`). F4.6E.1 changes none of this.

**Resync after reconnect** — **REST is the recovery path. No replay buffer on the backend.** The contract:

1. The connection drops.
2. The client surfaces `ConnectionState { status: 'reconnecting', attempt, lastDataAt }` to the UI (already wired).
3. The client reconnects and re-sends its `subscribe` messages.
4. The client re-fetches its current state via existing REST endpoints (per-unit current values via the future F4.6C.2 endpoint when it exists; per-tenant active alarms via the future F4.6D.2 endpoint when it exists; meanwhile, the F2 catch-up pattern from `engineering-architecture.md` §13 applies).
5. New events flow in over WebSocket from that point on.

**No last-event-id semantics, no sequence numbers, no server-side per-socket buffer.** A subscriber that disconnects for 30 seconds will miss any events emitted in that window. They are not lost — they are still in `telemetry_readings` / `live_readings` / `alarm_events`; the operator re-reads via REST.

**Why no replay buffer:** ADR-008 §3 decision 5 already establishes that derived state is rebuildable from canonical state. A replay buffer would either (a) duplicate canonical state in memory (wasteful) or (b) be lossy in a way subscribers cannot detect (worse than re-reading via REST). REST reconnect is the simplest correct recovery.

## 13. Security / Authorization

**F4.6E.1 inherits today's auth posture: no authentication.** The gateway accepts any connection from any allowed origin (CORS). This matches:

- F4.4 read APIs (no auth; tenant scoping is a forward-compat seam in `CallerContext`).
- F4.6B.1 ingestion (no auth on `POST /api/v1/telemetry/ingest`; gated by `RVF_INGEST_ENABLED`).
- The existing `RealtimeGateway` (no auth on connection or subscribe).

F4.6E.1 adds:

- **Env gate `RVF_REALTIME_EMIT_ENABLED`.** When unset or not `'true'`, the `RealtimeEmitterService.emitMany` becomes a no-op (logs once at boot). The gateway remains addressable so the frontend's `ConnectionState` keeps working; only the fan-out is suppressed. Mirrors `RVF_INGEST_ENABLED`.
- **Server-side scope validation seam** in the `subscribe` handler. F4.6E.1 trusts the requested `tenantId` (no auth exists), but the function signature is shaped so a future auth phase can replace `validateScope(socket, { tenantId, unitIds })` with a real implementation without changing the wire shape or the room logic.
- **Origin enforcement preserved.** CORS continues to enforce `ALLOWED_ORIGINS`. F4.6E.1 does not relax this.
- **No credentials in payloads.** The emitted events carry canonical ids and values; no API keys, no session tokens, no PII beyond what's already in the database.

**Future work (NOT in F4.6E.1):**

- Candidate **ADR-009 — Authentication / Authorization Architecture** decides whether the WebSocket auth handshake is a Bearer JWT, a session cookie, or a connection-time `auth` payload validated against a `CallerContext` provider. Auth lands in its own dedicated phase, owning both REST and WebSocket auth uniformly.
- Per-channel authorization (a subscriber can only `subscribe` to tenant ids their session is scoped to) rides the same future phase.
- Rate limiting per connection rides the same future phase or a sibling.

**F4.6E.1 must not pretend to have auth.** No "API key" parameter, no token validation theater. The plan locks the no-auth posture explicitly so a future auth phase can introduce it cleanly without retrofitting a half-measure.

## 14. Non-Goals

Explicitly **out of scope** for F4.6E.1, each with the phase that should own it:

- **Authentication / authorization on the gateway.** Candidate ADR-009 + dedicated phase. F4.6E.1 only adds the validation seam.
- **SSE transport.** Candidate **F4.6E.2 — Read-only SSE Mirror** if a use case appears.
- **Redis / message broker adapter for multi-replica Socket.IO.** When the backend horizontally scales, a `@socket.io/redis-adapter` (or equivalent) ensures emits reach subscribers on other replicas. Until the backend runs more than one replica (today: one container per `docker compose up`), this is not needed.
- **Cross-region / multi-datacenter fan-out.** Not in the F4.6 arc.
- **Replay buffer / last-event-id resync.** REST reconnect remains the recovery path. See §12.
- **Per-sensor / per-canonical-tag rooms.** Per-tenant + per-unit is enough scope today. Finer scope is added when a screen migration needs it.
- **Coalescing / throttling / batching emits.** See §11.
- **External broker bridges** (MQTT / Modbus / OPC-UA / ThingsBoard / Node-RED / PLC / historian) as fan-out **sinks**. Each is its own future phase.
- **Public HTTP API documenting the wire types in Swagger.** The wire types live in `packages/types` for typed consumers; Swagger documents REST, not WebSocket.
- **Frontend per-screen wiring against the new event types.** F4.6E.1 ships the server-side emission; a follow-up per-screen migration wires consumers screen by screen.
- **Migrating the F2D `BackendWebSocketTelemetryAdapter` to consume the new event shape.** Its current shape is a normalized telemetry message envelope (F2-era). Migrating it to consume `telemetry.reading.accepted` / `live_reading.updated` is a separate frontend task (candidate part of F4.5G+).
- **`alarm.event.acknowledged` / `alarm.event.cleared` emit.** Owned by the future F4.6D.3 (Alarm Lifecycle). F4.6E.1 does not pre-declare them.
- **`sensor_health` emit.** No backend data source produces it yet; the F2 envelope remains a forward-compat seam.
- **Removing or renaming the legacy F2 `SubscribeRequest` / `UnsubscribeRequest` / `RealtimeMessage` variants.** They stay for backward compatibility; F4.6E.1 only adds new variants.
- **Audit logging of subscribe / unsubscribe / emit events.** Audit lives on `audit_logs` and is tied to ADR-005 mandates for lifecycle transitions — not low-level transport events.
- **Rate limiting per connection.** Rides ADR-009 or a sibling phase.
- **Binary frames / compression.** Default Socket.IO behavior is fine; specific compression / binary payloads are not justified today.

## 15. Test Plan

### 15.1 New backend tests for F4.6E.1

**`apps/backend/src/realtime/realtime-emitter.service.spec.ts` — ~10–12 mocked-Socket.IO tests:**

| # | Test | Asserts |
|---|---|---|
| 1 | telemetry.reading.accepted emitted to tenant room | `server.to('tenant:<uuid>').emit('telemetry.reading.accepted', payload)` called once with correct payload |
| 2 | live_reading.updated emitted only for created/updated outcomes | `created` and `updated` produce emits; `skipped_*` produce none |
| 3 | alarm.event.created emitted only for triggered per-rule outcomes | one emit per `triggered`; zero for `skipped_duplicate_active` / `no_threshold_violated` |
| 4 | emitMany processes a batch atomically per event | a throw on one emit does not block subsequent emits in the batch |
| 5 | RVF_REALTIME_EMIT_ENABLED unset → no emit | `emitMany([…])` no-ops; logs once at boot |
| 6 | RVF_REALTIME_EMIT_ENABLED=true → emit | `emitMany([…])` invokes `server.to(...).emit(...)` |
| 7 | isolation: emitter never touches Prisma | mocked `prisma.*` has no calls after `emitMany` |
| 8 | isolation: emitter never writes to live_readings / telemetry_readings / alarm_events | reaffirms F4.6B.1 / F4.6C.1 / F4.6D.1 isolation invariants |
| 9 | payload shape: all required fields present, no extras | strict object-shape match against the F4.6E-0 §8 specs |
| 10 | Decimal serialization: value / triggeredValue serialized as string | preserves precision |
| 11 | timestamp serialization: ISO-8601 with timezone | matches `live-readings-projection.service.spec.ts` posture |
| 12 | unexpected error logged but not rethrown | `emitMany` does not throw out to the caller |

**`apps/backend/src/realtime/realtime.gateway.spec.ts` — ~6–8 mocked-Socket.IO tests:**

- subscribe joins tenant room → ack payload names the rooms joined.
- subscribe with unitIds joins tenant room + per-unit rooms.
- unsubscribe leaves named rooms.
- unsubscribe with both fields omitted leaves all rooms.
- malformed subscribe payload logs warning and does not crash.
- existing F0 `ping` / `pong` and `connection` greeting unchanged.

**`apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` — ~5 new integration tests:**

- accepted-good → emitter invoked once per accepted sample with `telemetry.reading.accepted`.
- accepted-good + projection 'created' → emitter additionally invoked with `live_reading.updated`.
- accepted-good + alarm triggered → emitter additionally invoked with `alarm.event.created` (one per matched-and-triggered rule).
- duplicate / conflict_quarantined / rejected_quarantined → emitter NOT invoked.
- projection failure → rollback → emitter NOT invoked (the `pendingEmits` list never reaches the emit hook).

### 15.2 Existing isolation invariants

The F4.6B.1 / F4.6C.1 / F4.6D.1 spec assertions stay green:

- ingestion does not call `prisma.liveReading.*` directly (delegates).
- ingestion does not call `prisma.alarmEvent.*` / `prisma.alarmRule.*` directly (delegates).
- ingestion adds one new positive invariant: it now calls `realtime.emitMany(...)` **after** `prisma.$transaction` resolves, **never inside** the callback. Both halves of that invariant get a dedicated test.

### 15.3 Frontend tests — F4.6E.1 ships none

The frontend test plan is a future per-screen migration concern. F4.6E.1 ships server-side emission only; the frontend continues to consume the F2 wire shape via the F2D adapter until a screen migration cuts over.

### 15.4 Validation commands (DX-3 §"Runtime phases")

- `pnpm --filter @rvf/backend exec prisma validate`
- `pnpm --filter @rvf/backend exec prisma generate` (no change expected)
- `pnpm --filter @rvf/backend run lint -- --max-warnings 0`
- `pnpm --filter @rvf/backend run typecheck`
- `pnpm --filter @rvf/backend run build`
- `pnpm --filter @rvf/backend run test` — expected **~165–170 tests** (current 140 + ~10–12 emitter + ~6–8 gateway + ~5 ingestion-integration).
- Workspace-wide `pnpm lint` / `typecheck` / `build` — clean. Web build expected cached (no frontend change).

### 15.5 What F4.6E-0 itself runs

**Nothing.** This is a docs-only plan phase. DX-3 §"Documentation-only phases" prescribes only `git status` and `git diff --stat` confirming only `docs/` (and the closeout file itself) changed.

## 16. Risks and Guardrails

| Risk | Mitigation |
|---|---|
| Emit inside the transaction, then transaction rolls back → subscriber sees a "ghost" event for a row that does not exist. | §10 specifies emit-after-commit explicitly; the implementation sketch separates `pendingEmits` collection from the post-`$transaction` `emitMany` call. Tests #5 in the ingestion integration suite assert this. Reviewer rejects any PR that emits inside the transaction callback. |
| Emit failure breaks the ingestion outcome → an operator's POST returns 5xx for a write that committed. | §10.4 specifies emit is best-effort, wrapped per-event in try/catch, logs but never throws out to the caller. The persisted state is the source of truth; lost emits are recoverable via REST. |
| Backend horizontally scales but Socket.IO has no Redis adapter → subscribers on replica B miss events emitted by replica A. | Out of scope for F4.6E.1 (single replica today). Documented as deferred. When a second replica is added, the `@socket.io/redis-adapter` is the standard fix; that becomes a small dedicated phase. |
| Subscriber misses events during a disconnect and assumes "no events happened." | §12 mandates REST as the recovery path. The connection-state machine surfaces `lastDataAt` per ADR-005. The frontend already shows the "data N min old" banner when applicable. F4.6E.1 changes nothing here. |
| Pseudo-auth in F4.6E.1 — connecting to the WebSocket gives access to every tenant's events. | §13 explicitly inherits the existing no-auth posture and forbids any pretend-auth surface. A future ADR-009 + dedicated phase ships real auth. Until then, ALLOWED_ORIGINS CORS and the network boundary are the only walls. |
| Coalescing / batching gets added speculatively. | §11 forbids it for F4.6E.1. When real backpressure is observed, a sibling phase adds the right primitive (per-key coalesce window, per-tenant rate cap, etc.) with data. |
| Per-sensor rooms get added because they "feel cleaner." | §9 explicitly defers per-sensor rooms. Per-tenant is the only fan-out target; per-unit rooms are forward-compat seam only. |
| Frontend per-screen migration absorbs F4.6E scope. | §14 separates server-side emission (F4.6E.1) from frontend consumption (a separate per-screen migration). Reviewer rejects any PR that bundles them. |
| Mocked-Socket.IO tests prove the contract but not the network behavior. | Same posture as F4.6B.1 / F4.6C.1 / F4.6D.1's mocked Prisma. A live-system integration test (real WebSocket client → real backend → assert emit received) is a candidate cross-phase deliverable, not F4.6E.1 scope. Documented in master roadmap §10. |
| Browser CPU pressure from high-frequency emits. | The frontend ring buffer + Zustand store + rAF tick pattern (already present in `lib/realtime/telemetryStore.ts`) is designed for high-frequency input. If a tenant's emit rate exceeds the browser's render budget, the store is the throttle layer — not the backend emitter. |
| Subscribers inadvertently see another tenant's events because of the trusted-tenantId posture. | §13 documents this. CORS contains it to first-party origins; the no-auth posture is project-wide today, not a fan-out-specific weakness. ADR-009 fixes it project-wide. |
| The legacy F2-era `RealtimeMessage` / `TelemetryMessage` / `AlarmMessage` types in `packages/types` confuse future consumers. | §5.3 documents their role (forward-compat / F2-era). F4.6E.1 adds new variants without removing old. A future consolidation task (not in F4.6E) may rationalize them once a screen migration proves the F4 shape is the right one. |

## 17. Acceptance Criteria for F4.6E.1

F4.6E.1 is complete when **all** of the following are true:

- [ ] `RealtimeEmitterService` exists at `apps/backend/src/realtime/realtime-emitter.service.ts` (or equivalent path under `apps/backend/src/realtime/`). Single public `emitMany(events)` method (plus any narrowly-scoped helpers).
- [ ] Subscribe / unsubscribe handlers exist on `RealtimeGateway` for the new F4-shape protocol (`subscribe { tenantId, unitIds? }` / `unsubscribe { tenantId?, unitIds? }`), with the per-tenant room join logic from §9.
- [ ] `TelemetryIngestionService` collects `pendingEmits` inside the `prisma.$transaction` and calls `emitter.emitMany(pendingEmits)` **after** the transaction resolves successfully. Tests assert: emit invoked on success; emit NOT invoked on duplicate / conflict / rejected / projection-rollback / alarm-rollback paths.
- [ ] Three event types implemented per §8: `telemetry.reading.accepted`, `live_reading.updated` (created / updated only), `alarm.event.created` (triggered only). Payload shapes match §8 exactly; Decimal-as-string preserved; timestamps ISO-8601.
- [ ] Wire types added to `packages/types/src/realtime.ts` (or `realtime.f4.ts`) — three new `RealtimeMessage` variants discriminated by `kind`; subscribe / unsubscribe / ack request shapes per §9.2. Legacy F2 variants untouched.
- [ ] `RVF_REALTIME_EMIT_ENABLED` env gate respected. Default unset → no-op emit (gateway still connects; subscribers still get `connection` greeting; `ping`/`pong` still works).
- [ ] Emit is best-effort: per-event try/catch in `emitMany`; one bad emit does not block the rest of the batch; nothing thrown out to the caller. Logged via the existing Pino logger.
- [ ] No Prisma change, no migration, no seed change. No `apps/web/` change. No `docker-compose.yml` / `package.json` / lockfile / `turbo.json` / `tsconfig*.json` / `.env*` / CI change. (`.env.example` may gain `RVF_REALTIME_EMIT_ENABLED=` as a documented variable — at F4.6E.1's discretion, in keeping with the pattern from F4.6B.1's `RVF_INGEST_ENABLED`.)
- [ ] **Emit-after-commit invariant** is asserted by an ingestion-spec test: the mocked `$transaction` resolves first, then `emitMany` is called. Order is observable via call-order assertions.
- [ ] **No-emit-on-rollback invariant** is asserted by a test that makes the projection or the alarm evaluator throw: `emitMany` is never called.
- [ ] No external broker, no Redis adapter, no replay buffer, no SSE, no per-sensor rooms, no auth introduced.
- [ ] Existing F4.6B.1 / F4.6C.1 / F4.6D.1 isolation invariants still hold — ingestion still delegates `prisma.liveReading.*` and `prisma.alarmEvent.*` / `prisma.alarmRule.*` to their respective services.
- [ ] DX-3 §"Runtime phases" validation surface passes end to end: `prisma validate` / `generate`, backend `lint -- --max-warnings 0` / `typecheck` / `build` / `test` (expected ~165–170 tests), workspace `lint` / `typecheck` / `build`.
- [ ] F4.6E.1 closeout report exists at `docs/architecture/RVF_Malinois_F4_6E_1_WebSocket_SSE_Fan_Out_Closeout.md`, follows the established closeout structure, reports the final test count, and flags any deviation from this plan.
- [ ] Master roadmap §3 / §7 refresh — deferred to a small follow-up hygiene commit per the established pattern (post-F4.6D-0 / post-F4.6D.1).

## 18. Recommended Next Step

**Next step after F4.6E-0: F4.6E.1 — WebSocket / SSE Fan-out Implementation.** Plan-first → implementation per the codified DX-3 pattern. Scope per §7 / §8 / §9 / §10 / §13; non-goals per §14; tests per §15; acceptance per §17.

After F4.6E.1, the Master Roadmap §7 sequence continues:

- **F4.6F-0 / F4.6F.1** — Historical Trend API plan + implementation. Bucketing / downsampling / multi-tag reads, plus the Operations chart cutover from the F2 simulator. Now downstream of a stable realtime push.
- **F4.5G** — Resume per-screen UI migrations (Wells, Equipment, Catalog, Tags, Settings, plus the alarm-events screen migration that consumes F4.6E.1's emissions).

Candidate follow-ups not in the main sequence (named so they have a place to land):

- **Candidate F4.6E.2 — Read-only SSE Mirror.** Adds an `EventSource`-compatible mirror of the same three event types for low-touch consumers. Only worth doing if a use case emerges.
- **Candidate F4.6E.3 — Multi-replica Socket.IO Adapter.** Adds the `@socket.io/redis-adapter` (or equivalent) so emits reach subscribers on any replica. Trigger: a second backend replica appears in deployment.
- **Candidate ADR-009 — Authentication / Authorization Architecture.** Owns auth across REST + WebSocket uniformly. Independent of F4.6E; lands when authentication is the highest-value unblock.
- **Candidate F4.6E.4 — Coalesce / Throttle Policy.** Sized to observed traffic. Not needed today.
- **Candidate F4.6C.2 — Latest-value Read API** and **Candidate F4.6D.2 — Alarm Events Read API** — both unblocked by F4.6E.1 because subscribers reconnecting need REST surfaces for resync. Sized when a screen migration requires them.

These are named, not committed to. The next implementation phase is **F4.6E.1**.

---

*F4.6E-0 plan, authored at HEAD `637724c` (Refresh master roadmap after F4.6D.1). Plan-only. Update on phase close (`Current` → `Closed` with commit hash) and when F4.6E.1 lands its closeout.*
