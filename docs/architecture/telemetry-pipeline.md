# RVF Malinois — Telemetry Pipeline (F1.5 → F2)

> Engineering reference. Covers the storage layer, the interpretation
> spine, the read-side query layer, and the abstraction that future
> ingestion adapters slot into. Pairs with:
>
> - `docs/architecture/domain-model.md` (entities, immutability rules)
> - `docs/architecture/telemetry-foundation.md` (canonical tags, §4 envelope, §17 multi-tenant)
> - `docs/adr/adr-register-v1.2.md` (ADR-001..ADR-004)

## 0. What F1.5 ships vs what F2 will ship

| Layer | F1.5 status | Notes |
|---|---|---|
| `telemetry`, `sensor_health`, `late_telemetry_quarantine` tables | **shipped** | Prisma models in `apps/backend/prisma/schema.prisma` |
| TimescaleDB hypertables + compression + retention + 1m/15m/1h continuous aggregates | **shipped** | Raw SQL in `prisma/migrations/.../20260520185255_f1_5_telemetry_hypertables/migration.sql` |
| `TelemetryEnvelopeSchema` (Zod, §4 contract) | **shipped** | `src/telemetry/contracts/envelope.ts` |
| `TelemetryValidator` | **shipped** | `src/telemetry/telemetry.validator.ts` |
| `UnitConverter` (query-time only) | **shipped** | `src/telemetry/unit-converter.ts` |
| `CanonicalTagResolver` (in-memory LRU) | **shipped** | `src/telemetry/canonical-tag-resolver.ts` |
| Aggregation contracts (`RawSample`, `BucketAggregate`, `QualityMix`) | **shipped** | `src/telemetry/contracts/trends.ts` |
| `TrendsService` (read-only) | **shipped** | `src/telemetry/trends.service.ts` |
| Sample telemetry generator | **shipped (dev tool)** | `scripts/generate-sample-telemetry.ts` |
| `IngestionAdapter` interface | **shipped (contract only)** | `src/telemetry/contracts/ingestion-adapter.ts` |
| `TelemetryController` placeholder routes | **shipped (501 stubs)** | `src/telemetry/telemetry.controller.ts` |
| Concrete adapters (MQTT, Node-RED, REST bridge, ThingsBoard export, edge direct) | **F2** | One adapter per transport |
| `TelemetryIngestionService` (validate → dedup → quarantine → insert) | **F2** | |
| WebSocket live stream | **F2** | |
| Frontend dashboards / charts | **post-F2** | Waiting on ThingsBoard screenshots |
| Alarm engine | **F3+** | |
| Predictive analytics | **F4+** | |

## 1. Telemetry lifecycle

### Edge

```
Sensor (SignalFire) → 900 MHz mesh → Gateway Stick (Modbus) → Node-RED
                                                                  │
                                                       store-and-forward queue
                                                                  │
                                                                MQTT/TLS
```

The edge is the only place that knows about specific PLC register
addresses or sensor radio profiles. Node-RED (ADR-001) translates the
raw register read into a canonical-tag-keyed value and assigns
`quality` based on the sensor's health envelope. It buffers up to
**7 days** on disk so a satellite outage does not lose data
(telemetry-foundation §11).

### Cloud arrival

```
MQTT broker / REST bridge / ThingsBoard export / edge HTTPS
        │
        ▼
IngestionAdapter.envelopes() — one TelemetryEnvelope per §4 message
        │
        ▼
TelemetryIngestionService            (F2)
  1. TelemetryValidator.validate()   shape only, no transform
  2. Idempotency check               (unit_id, seq, canonical_tag_name)
  3. Active job lookup               CanonicalTagResolver
  4. Decision:
       ├─ accepted    → INSERT N rows into `telemetry` hypertable
       ├─ duplicate   → noop
       └─ quarantined → INSERT into `late_telemetry_quarantine`
                         (reason ∈ LateTelemetryReason)
```

### Storage

Two hypertables + one regular table:

- **`telemetry`** — long format, one row per (ts, job_id, canonical_tag).
  Compression after 7 d. Retention 90 d. Continuous aggregates
  `telemetry_1m`, `telemetry_15m`, `telemetry_1h` refresh on schedule
  with a 5-min lag for late deliveries.
- **`sensor_health`** — separate hypertable, distinct lifecycle. Kept
  indefinitely (low volume + useful for ADR-001 audit).
- **`late_telemetry_quarantine`** — regular table, never silently
  dropped data. Stores the raw envelope as JSONB + a reason
  (`beyond_late_window | missing_active_job | unknown_canonical_tag |
  duplicate_seq | invalid_envelope`).

### Read

```
HTTP / WebSocket
        │
        ▼
TrendsService.query({ jobCode, canonicalTagName, fromTs, toTs, bucket })
        │
        ├─ bucket === 'raw'  → SELECT FROM telemetry          (RawSample[])
        ├─ bucket === '1m'   → SELECT FROM telemetry_1m       (BucketAggregate[])
        ├─ bucket === '15m'  → SELECT FROM telemetry_15m
        └─ bucket === '1h'   → SELECT FROM telemetry_1h
        │
        ▼
For each row:
  UnitConverter.convert(value, value_unit_as_stored, canonical_unit_from_snapshot)
        │
        ▼
Response: values in CANONICAL units; quality preserved per row /
          quality_mix preserved per bucket.
```

## 2. Job isolation — the §29 spine

**Every telemetry row carries `job_id`.** No exceptions. A row whose
job is unknown is **not** inserted into `telemetry`; it is **quarantined**
with `reason = missing_active_job`. This rule is the difference between
"data is information" and "data is noise" (domain-model §29).

The job, in turn, carries:

- **tenant boundary** — `Job.tenantId` is the only way a telemetry row
  knows which tenant owns it. Trend queries always join through `jobs`
  for tenant scoping. Telemetry endpoints will **never** accept a
  `tenantId` from the request body or query string (telemetry-foundation
  §17 — server-derived only).
- **interpretation context** — `Job.snapshot.sensorSnapshots` is the
  per-tag dictionary for *this* job's measurements. The query layer
  reads canonical unit + range + alarm limits from the frozen
  snapshot, never from the live catalog.
- **time bounds** — `Job.startedAt` and `Job.endedAt` describe the
  window during which telemetry was valid. Queries can clip to this
  window if a consumer asks for "JOB-2026-0001 forever" without
  giving explicit `from`/`to`.

A reading **without** an active job on its emitting unit is orphan
(§29). `CanonicalTagResolver.resolveByUnitAndInstrumentTag` enforces
this: it returns the interpretation only when exactly one
`in_progress` job exists on the unit. Zero → `NotFoundException`.
Two or more → `ConflictException` (operator intervention required).

## 3. The commissioning snapshot — why it's the source of truth

When a job is created (`CommissioningService.createJobWithSnapshot`),
a snapshot is taken **in the same Prisma transaction**. The snapshot
captures, **by copy**:

- Every sensor on the equipment unit at that moment
- Each sensor's instrument tag (P&ID), sensor type, Modbus register
- The canonical tag it mapped to **as a literal string**, not a FK
- The engineering unit, range, and alarm envelope at that moment

The snapshot is **immutable**. F1 enforces this at the service layer
(`assertSnapshotMutable` / `assertJobMutable` in
`CommissioningService`). F1.5+ will add Postgres triggers as
defense-in-depth.

### Why this matters for telemetry

Telemetry from JOB-2026-0001 must read the same way in 2030 as it did
the day it was measured. If we resolved canonical tag meaning from
the live `CanonicalTag` table, then a rename or unit change in 2027
would silently corrupt historical interpretations. By storing the
**copy** in `JobSensorSnapshot` and the **raw stored unit** in
`telemetry.value_unit`, we guarantee:

1. Trend queries always know what `value` *means*, even if the live
   catalog drifts.
2. Mid-job unit drift surfaces as separate aggregate rows per
   `value_unit` rather than a silently-averaged nonsense.
3. Renaming a canonical tag is refused by the service if any snapshot
   references it (and the snapshot itself stores the literal name, so
   even if the rename slipped through, the snapshot row still resolves).

## 4. Raw fidelity at ingest

Per F1.5 guidance, the ingest path **never** mutates a measurement:

- **No** smoothing.
- **No** filtering.
- **No** interpolation.
- **No** resampling.
- **No** unit conversion at write time. The row's `value_unit` is the
  unit as received; the `UnitConverter` runs only at read time.

Bad-quality samples are written as-is (with `quality: 'bad'`); the
read layer is responsible for excluding them from aggregates and from
AI training data. This is the §14 contract: "un dato malo se sigue
leyendo como malo en 2030."

## 5. Future ingestion adapters (F2)

`src/telemetry/contracts/ingestion-adapter.ts` defines the contract:

```ts
interface IngestionAdapter {
  readonly id: string;                              // e.g. 'mqtt'
  start(): Promise<void>;
  stop(): Promise<void>;
  envelopes(): AsyncIterable<AdapterEnvelope>;
}
```

Concrete adapters planned for F2 (one per transport):

| Adapter id          | Source                                         | F2 milestone |
|---------------------|------------------------------------------------|--------------|
| `mqtt`              | ThingsBoard MQTT broker (production path)      | F2.1         |
| `rest-bridge`       | HTTP `POST /api/v1/telemetry` (low-rate path)  | F2.2         |
| `thingsboard-export`| Bulk historical replay from ThingsBoard        | F2.3         |
| `edge-direct`       | Direct HTTPS from gateway (PLC-future per ADR-001) | F2.4     |
| `simulator`         | Already shipped — `scripts/generate-sample-telemetry.ts` | F1.5.4 |

All adapters produce the same `TelemetryEnvelope` shape. From the
storage layer's perspective, every row looks identical except for the
`source_adapter` audit column.

### Idempotency

Timescale rejects UNIQUE indexes on hypertables that don't include the
partitioning column, so we can't have `UNIQUE (unit_id, seq, canonical_tag_name)`.
Instead:

- A non-unique index on `(unit_id, seq, canonical_tag_name)` keeps the
  pre-INSERT existence check cheap.
- `TelemetryIngestionService.ingest()` (F2) performs the existence
  check inside its transaction. A hit returns
  `{ kind: 'duplicate', suppressed: N }` and writes nothing.

Adapters are free to deliver replays of the same `(unit, seq, tag)`
triple — the system absorbs them.

### Resilience to intermittent connectivity

The F1.5 design assumes the edge has its own `store-and-forward`
buffer that can hold up to 7 days. When the cloud comes back online,
the edge sends its backlog. The ingest service:

- **Accepts out-of-order timestamps.** No monotonic-ts check at the
  validator. The hypertable is content-addressed by `(ts, job, tag)`.
- **Accepts duplicates.** Dedup is on `(unit_id, seq, canonical_tag_name)`.
- **Accepts large bursts.** Adapters use `createMany` in 1000-row
  batches.
- **Quarantines anything older than 7 days** with reason
  `beyond_late_window` so the operator can decide whether to
  back-fill manually.

## 6. Read patterns

### Single tag, live or near-live

```
GET /api/v1/telemetry/jobs/JOB-2026-0001/series
    ?tag=p_inlet&from=...&to=...&bucket=raw
```

Goes directly to the `telemetry` hypertable. Suitable for the
"last 30 minutes" strip chart.

### Single tag, multi-day trend

```
GET /api/v1/telemetry/jobs/JOB-2026-0001/series
    ?tag=p_inlet&from=...&to=...&bucket=15m
```

Routes to `telemetry_15m`. Pre-aggregated by Timescale, so a 30-day
trend is a few thousand rows instead of 2.5 million.

### Last-known value per tag

```
GET /api/v1/telemetry/jobs/JOB-2026-0001/last?tag=p_inlet
```

Backed by an in-memory cache (F2). The cache is per-process; the
ingest service updates it on every successful row write.

## 7. Operational concerns

- **Compressed-chunk updates.** A row that lands more than 7 days
  after `ts` lands in a compressed chunk. Timescale 2.11+ supports
  this but at a cost. Anything beyond the 7-day soft limit is
  quarantined.
- **Continuous-aggregate refresh.** Default policies leave a 5-min
  lag so late deliveries land in raw before aggregation. To force a
  refresh manually:
  ```
  CALL refresh_continuous_aggregate('telemetry_1m', NULL, NULL);
  ```
- **Tag dictionary governance.** Renaming a `CanonicalTag` is
  service-refused if any snapshot references it. The snapshot stores
  the name as a string copy, so even a forced rename in SQL does not
  corrupt historical interpretation.

## 8. Frontend status

Per F1.5 guidance #10, the frontend stays **placeholder-only** for
telemetry until ThingsBoard screenshots are uploaded. The eventual
charts will mirror the current ThingsBoard operational screens — this
document fixes the API shape they will consume.
