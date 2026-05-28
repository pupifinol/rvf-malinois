# RVF Malinois — F4.5G.2.2-0 Operations Tile Latest-value Cutover Plan

> Phase **F4.5G.2.2-0 — Operations Tile Latest-value Cutover Plan**. Plan-first per the codified project pattern (F4.2A → F4.2B, F4.6A.0 → F4.6A.1, F4.6B-0 → F4.6B.1, F4.6C-0 → F4.6C.1, F4.6D-0 → F4.6D.1, F4.6E-0 → F4.6E.1, F4.6F-0 → F4.6F.1, F4.5G-0 → F4.5G.1, F4.5G.2-0 → F4.5G.2.1, F4.6C.2-0 → F4.6C.2.1).
> Documentation-only artifact. No frontend, backend, schema, migration, or runtime code is modified by F4.5G.2.2-0. Implementation lands in **F4.5G.2.2.1**.
> Last known head at authoring time: commit `5dd9826` (Refresh master roadmap after F4.6C.2.1).
>
> Upstream references:
> - Master Roadmap (most recent refresh): `docs/architecture/RVF_Malinois_Master_Roadmap.md` (commit `5dd9826`).
> - F4.6C.2.1 closeout (the latest-value API + adapter this phase consumes): `docs/architecture/RVF_Malinois_F4_6C_2_1_Latest_Value_Read_API_Closeout.md` (commit `acd68d5`).
> - F4.6C.2-0 plan (locks the backend contract this phase relies on): `docs/architecture/RVF_Malinois_F4_6C_2_Latest_Value_Read_API_Plan.md` (commit `c077478`).
> - F4.5G.2.1 closeout (the realtime hook whose `getSlotValue` this phase overlays): `docs/architecture/RVF_Malinois_F4_5G_2_1_Operations_Realtime_Tile_Status_Wiring_Closeout.md` (commit `2457c4d`).
> - F4.5G.2-0 plan (the §9 UUID gap this phase finally closes): `docs/architecture/RVF_Malinois_F4_5G_2_Operations_Realtime_Tile_Status_Wiring_Plan.md` (commit `583da2b`).
> - F4.5G.1 closeout (the chart pair this phase preserves untouched): `docs/architecture/RVF_Malinois_F4_5G_1_Operations_Chart_Adapter_Expanded_Trend_View_Closeout.md` (commit `916d067`).
> - F4.4D — Equipment / Units API (the resolution surface this phase reads): see `apps/backend/src/equipment/` and `GET /api/v1/equipment/units`.
> - DX-3 (Definition of Done): `docs/operations/RVF_Malinois_Definition_of_Done.md` (commit `65cb736`).
> - ADR-005 (browser boundary; the browser does **not** evaluate alarms; "never lie about freshness").
> - ADR-008 (telemetry persistence; realtime is delivery, not source of truth).

## 1. Purpose

F4.5G.2.2-0 is the **plan-first** phase for cutting over the Operations screen's tile / current-value UI from the F2 simulator path to the canonical latest-value API shipped by F4.6C.2.1 (`acd68d5`). F4.6C.2.1 introduced `GET /api/v1/telemetry/latest` + `adapterGetTelemetryLatest` over the `live_readings` projection populated by F4.6C.1 — but the adapter is **dormant**: no UI surface consumes it. Tile primary values still render from the F2 simulator path even in api mode, and the realtime hook from F4.5G.2.1 (`useOperationsRealtimeF4`) carries a per-slot view-model that no tile reads. F4.5G.2.2 converts the dormant adapter into a real consumer and finally **closes the F4.5G.2-0 §9 UUID gap** by introducing a small unit-resolver helper that maps Operations catalog identifiers to backend `MeasurementUnit.id` UUIDs via the F4.4D units list — without inventing any mapping table or coercing simulator strings.

This phase **locks the decisions** F4.5G.2.2.1 (implementation) must respect:

- The new `useOperationsLatestValues({ unitId })` hook contract (TanStack Query; cache key shape; refetch policy).
- The unit-resolver strategy (how `OPERATIONS_JOBS` rows resolve to backend UUIDs without fake mapping).
- The realtime-overlay merge rules on top of REST latest values (REST is primary; realtime is best-effort tail).
- Source / freshness labeling per ADR-005 (`Mock fixture` / `Live backend` / `Reconnecting` / `Disconnected · last value HH:MM:SS UTC` / `No backend unit match` / `No latest value`).
- The mock / simulator fallback policy (never silently labeled as live).
- The test plan and acceptance criteria for F4.5G.2.2.1.

What this phase does **not** do:

- Does not implement any backend / frontend / schema / migration / runtime code.
- Does not modify F4.6C.2.1's `latest.service.ts` / `contracts/latest.ts` / controller route / Zod refines.
- Does not modify F4.5G.2.1's `useOperationsRealtimeF4` contract (cache key, predicate, event policy unchanged).
- Does not modify F4.5G.1's chart pair or its `useOperationsTrendSeries` cache key.
- Does not migrate `<LiveActiveAlarmsPanel>` off its browser-side `evaluateReading(...)` path.
- Does not introduce alarm chart annotations.
- Does not add a multi-unit batch endpoint (single `unitId` per request; UI-side fan-out).
- Does not introduce `packages/types/` changes, env vars, or new dependencies.
- Does not migrate Wells / Equipment / Catalog / Tags / Settings / Reports screens.

## 2. Current Repository State

Drawn from `git log`, the master roadmap (`5dd9826`), and direct inspection of `apps/web/`.

| Phase | Status | Commit |
|---|---|---|
| Backend telemetry-persistence arc (F4.6B.1 → F4.6F.1) | Closed end-to-end | `1495457` / `49a8349` / `d35a2b8` / `51dc626` / `946a023` |
| F4.5G.1 Operations chart + drawer | Closed | `916d067` |
| F4.5G.2-0 / F4.5G.2.1 Operations realtime status wiring | Closed | `583da2b` / `2457c4d` |
| F4.6C.2-0 / F4.6C.2.1 Latest-value Read API + adapter | Closed | `c077478` / `acd68d5` |
| Master roadmap refresh after F4.6C.2.1 | Closed | `5dd9826` |
| **F4.5G.2.2-0 — Operations Tile Latest-value Cutover Plan** (this document) | **Current** | *(pending)* |
| F4.5G.2.2.1 — Operations Tile Latest-value Cutover Implementation | Deferred (next implementation phase) | — |

### 2.1 What Operations tiles render today

`apps/web/components/operations/LiveMultiphaseUnitCard.tsx` (one card per active job) hosts a 3×2 grid of `<LiveVariableTile>` instances (`apps/web/components/operations/LiveVariableTile.tsx`) for the six canonical tiles defined in `apps/web/components/operations/viewModel.ts` (`OPERATIONS_TILES`):

| Tile id | Label | Canonical tag |
|---|---|---|
| `q_liquid` | Oil Rate | `CANONICAL_TAGS.QLiquid` |
| `q_gas` | Gas Rate | `CANONICAL_TAGS.QGas` |
| `water_cut` | Water Cut | `CANONICAL_TAGS.WaterCut` |
| `p_inlet` | Pressure | `CANONICAL_TAGS.PInlet` |
| `t_inlet` | Temperature | `CANONICAL_TAGS.TInlet` |
| `dp_weir` | Differential P. | `CANONICAL_TAGS.DpWeir` |

Each tile reads its current value via:

- `useLiveValue(tile.tag, { jobId, snapshot, nowMs })` — F2 store selector, returns `{ value, unit, status }`.
- `useAlarmState(tile.tag, { jobId, snapshot, nowMs })` — F2 evaluator output (`alarm_high` / `warning_low` / `no_data` etc.).
- `useHistoryBuffer(jobId, tile.tag)` — F2 ring buffer for the sparkline strip.
- `useNowTick(5000)` — re-render every 5 s for stale detection.

All four hooks are F2-simulator-backed. There is no current `<LiveVariableTile>` data path that touches `live_readings` or `adapterGetTelemetryLatest`.

The unit-card footer (`<LiveMultiphaseUnitCard>` lines 209–242) renders four small metrics: `Duration`, `Last Update`, `Active Alarms`, `Stale Signals` — all derived from `useUnitTelemetrySnapshot({ jobId, snapshot })` over the F2 store. Same posture: simulator-only.

### 2.2 What F4.6C.2.1 ships (and how it stays dormant)

- **Backend.** `GET /api/v1/telemetry/latest` over `live_readings`; tenant-scoped via `CallerContext`; canonical-tag XOR optional; `200 OK` with `values: []` for unknown / empty paths; response envelope `{ unitId, generatedAt, source: 'live_readings', values: LatestValueRow[] }`. **The endpoint is fully functional — no UI surface calls it.**
- **Frontend adapter** at `apps/web/lib/api-data/f4/latest.ts`: `adapterGetTelemetryLatest(params, options)` dual-mode (mock branch resolves from `MOCK_F4_TELEMETRY_LATEST` keyed by HP-001 UUID / LP-001 UUID; api branch delegates to `getTelemetryLatest` from `@/lib/api/f4` after the `assertUuidShaped(unitId, '/telemetry/latest')` guard rejects non-UUID inputs with `RvfApiError(400, ...)`). **The adapter is exported from `@/lib/api-data/f4` but nothing imports it outside the test file** (verified via `grep -rn 'adapterGetTelemetryLatest' apps/web` showing usage only in `latest.ts` itself and `latest.test.ts`).
- **Mock fixtures.** `MOCK_F4_TELEMETRY_LATEST` map: `HP_001_ID` (UUID `00000000-0000-0000-0000-000000004411`) carries two rows (`p_inlet` + `q_gas`); `LP_001_ID` (UUID `00000000-0000-0000-0000-000000004412`) carries one row (`p_inlet`). The mock branch returns `values: []` for any unknown `unitId`.
- **Tests.** Backend 217/217; web 394/394. Existing tests stay green.

### 2.3 What F4.5G.2.1 gives us as a tail-overlay seam

`apps/web/lib/hooks/useOperationsRealtimeF4.ts` already returns:

```ts
{
  enabled: boolean,
  connection: { kind: 'disabled' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected', ... },
  source: 'mock' | 'rest' | 'rest+realtime',
  lastEventReceivedAt: string | null,
  slots: ReadonlyMap<`${unitId}::${canonicalTagId}`, SlotLiveValue>,
  alarmEventsSeen: number,
  getSlotValue: (unitId: string, canonicalTagId: string) => SlotLiveValue | undefined,
}
```

The hook accepts `trackedSlots: TrackedSlot[]` (UUID-shaped `(unitId, canonicalTagId)` pairs). On a `live_reading.updated` envelope, the matching slot's `value` / `timestamp` / `ingestionTimestamp` / `receivedAt` are updated; older timestamps are dropped. The hook **stays disabled** when `!isApiSource()` or `!isUuidShaped(tenantId)` — no `subscribe` emit ever leaves the browser.

**No UI surface binds to `getSlotValue` today**: it is the forward-compat seam F4.5G.2.2.1 finally consumes.

### 2.4 What F4.5G.1 + F4.5G.2.1 leave untouched (and must stay that way)

- `<LiveTrendsPanelLive>` + `<TrendDrawer>` consume F4.6F.1 trend reads through `useOperationsTrendSeries`. Cache key `['f4-trends', unitId, canonicalTagName, window, ...]`. **F4.5G.2.2.1 must not change this path.**
- `<LiveCommunicationHealthPanel>` F4 row is hook-driven by `useOperationsRealtimeF4` per F4.5G.2.1. **Untouched.**
- `<LiveActiveAlarmsPanel>` evaluates alarms in the browser against the F2 simulator path. **Untouched** in this phase (migration waits on candidate F4.6D.2).
- `<FieldConditionsPanel>` carries no backend dependency. **Untouched.**
- `<OperationsHeaderRight>` reads `useAlarmSummary(HEADER_JOBS)` (F2-store-based). **Untouched** in this phase.

### 2.5 The OPERATIONS_JOBS / unit-resolver gap (critical)

Direct repository evidence:

- `apps/web/components/operations/data/operationsJobs.ts` exports `OPERATIONS_JOBS`, a typed 3-tuple of `OperationsJobBinding` rows. Each row carries:

  ```ts
  interface OperationsJobBinding {
    displayNumber: number;
    displayName?: string;
    job: ActiveJobSnapshot;     // .unitId is the simulator catalog id
    profile: SimulationProfile;
  }
  ```

- `apps/web/lib/jobs/snapshots.mock.ts` sets each job's `unitId` from `apps/web/lib/catalog/units.mock.ts`: `EMMAD-01`, `EMMAD-02`, `PSK-03`. These are **equipment-type-style catalog identifiers**, not asset codes.
- F4 backend `MeasurementUnit.code` values (per `apps/web/lib/api-data/f4/mock-fixtures.ts` lines 355–369 mirroring the F4.3 seed): `HP-001`, `LP-001`. These are **asset codes**.
- `EquipmentType.name` (e.g. `EMMAD`, `EMGAD`) sits one level above — a model family, not an asset.
- **No field on either side bridges `EMMAD-01` ↔ `HP-001` directly.** A regex on prefixes would produce false positives; a hardcoded table would be the fake mapping the project forbids.

This is the gap F4.5G.2.2 must close honestly. See §9.

### 2.6 What F4.4D + F4.5C / F4.5F already give us as resolver substrate

- **Backend route** `GET /api/v1/equipment/units` (F4.4D) returns `MeasurementUnitListRow[]` with `{ id (UUID), tenantId, equipmentTypeId, code, serialNumber, name, status, operatingProfile, location, createdAt, updatedAt, equipmentType?: { id, name, pidReference } }`.
- **Frontend adapter** `adapterListMeasurementUnits(params, options)` at `apps/web/lib/api-data/f4/equipment.ts` (F4.5C) — dual-mode (mock returns `MOCK_F4_MEASUREMENT_UNITS`; api hits the route).
- **Existing hook** `useUnitsFleet()` at `apps/web/lib/hooks/useUnitsFleet.ts` (F4.5F) — already calls `adapterListMeasurementUnits` in api mode and exposes `{ items: { id, unitNumber, name?, code? }[], isLoading, error, source }`. **F4.5G.2.2.1 reuses this hook rather than re-implementing the fetch.**
- **No** existing `useResolveBackendUnitId(catalogCode)` helper. F4.5G.2.2.1 introduces it.

### 2.7 Latest roadmap anchor

Master roadmap refreshed at `5dd9826`. §3 names F4.5G.2.2-0 as the current phase; §7 names F4.5G.2.2.1 as the next implementation step.

## 3. Architectural Position

Desired Operations tile data flow once F4.5G.2.2.1 ships:

```
┌─────────────────── On Operations mount (api mode) ──────────────────────┐
│                                                                          │
│  useUnitsFleet()                                                         │
│    → adapterListMeasurementUnits()  (F4.5C, already wired)               │
│                                                                          │
│  useResolveBackendUnitId(catalogCode)  ── NEW hook in F4.5G.2.2.1 ──     │
│    → finds the MeasurementUnitListRow whose `code` matches               │
│      OPERATIONS_JOBS[i].backendUnitCode (NEW explicit annotation)        │
│    → returns the resolved UUID, or `null` if no match                    │
│                                                                          │
│  useOperationsLatestValues({ unitId: <resolved UUID> })                  │
│    → adapterGetTelemetryLatest({ unitId })   (F4.6C.2.1, dormant today)  │
│    → cache key: ['f4-latest', unitId]                                    │
│    → TanStack Query refetchInterval (matches F4.5G.1's 30 s default)     │
│                                                                          │
│  useOperationsRealtimeF4({ tenantId, trackedSlots })                     │
│    → already running per F4.5G.2.1; F4.5G.2.2.1 hands it the resolved   │
│      `(unitId, canonicalTagId)` slots for the six tiles                 │
│                                                                          │
│  <LiveVariableTile>:                                                     │
│    primary value:    REST latest-value row for (unit, tag)               │
│    realtime overlay: useOperationsRealtimeF4.getSlotValue(unit, tag)     │
│                      — applied only when its timestamp > REST timestamp  │
│    source chip:      'Live backend' | 'Reconnecting' | ...               │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─────────────────── On Operations mount (mock / simulator mode) ─────────┐
│                                                                          │
│  Existing F2 simulator path stays verbatim — no resolver, no latest       │
│  fetch, no realtime subscription. Tile source chip reads `Mock fixture` │
│  (or the equivalent F2 label inherited from the existing                 │
│  <OperationsHeaderRight>).                                               │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─────────────────── On reconnect ─────────────────────────────────────────┐
│                                                                          │
│  useOperationsRealtimeF4 already invalidates ['f4-trends'] (F4.5G.2.1). │
│  F4.5G.2.2.1 extends the reconnect handler to also invalidate            │
│  ['f4-latest'] so tiles refetch through REST as the canonical resync.    │
│  The trend-cache invalidation behavior stays byte-identical.             │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

Three principles govern this placement:

1. **REST is primary, realtime is overlay.** Tile primary values come from `adapterGetTelemetryLatest`. The realtime hook's `getSlotValue` is consulted as a *tail freshness hint* — its value is preferred only when the realtime `timestamp > restSlot.timestamp`. On reconnect, the REST cache is invalidated and the next render re-hydrates from `live_readings`. Realtime is never persisted as durable state.
2. **No fake mapping.** OPERATIONS_JOBS is augmented with an explicit `backendUnitCode?: string` (or equivalent) annotation per row — a deliberate "this simulator job stands for this backend asset" declaration. The resolver does a clean `code === binding.backendUnitCode` lookup. No regex, no fake guess, no silent coercion. If the annotation is missing, the tile stays on the simulator path with an honest `No backend unit match` label.
3. **Browser does not evaluate alarms.** Tile shell coloring stays on the F2 evaluator path in this phase (the F2 path consumes `useAlarmState(tag, ...)` against the snapshot's commissioning thresholds — ADR-005-compliant because the snapshot is the source of truth, not a live computation). The realtime hook's `alarmEventsSeen` counter is not used for tile shell color; it remains a forward-compat seam for candidate F4.5G.3.

## 4. Ownership and Boundaries

| Concern | Owner |
|---|---|
| Unit resolver (catalog code → backend UUID) | **New hook `useResolveBackendUnitId`** at `apps/web/lib/hooks/useResolveBackendUnitId.ts` (path TBD). Composes the existing `useUnitsFleet()`; matches by `MeasurementUnitListRow.code === binding.backendUnitCode`; returns `{ unitId: string \| null, source: 'mock' \| 'api' \| 'unresolved', isLoading, error }`. |
| Latest-value REST fetch | **New hook `useOperationsLatestValues({ unitId })`** at `apps/web/lib/hooks/useOperationsLatestValues.ts` (path TBD). TanStack Query on top of `adapterGetTelemetryLatest`; cache key `['f4-latest', unitId]`; refetch interval 30 s (matches F4.5G.1's mini-chart pacing). Returns `{ valuesByTagName: Map<string, TelemetryLatestValue>, isLoading, isError, lastDataAt, source }`. |
| Realtime overlay (best-effort tail) | Existing `useOperationsRealtimeF4` (F4.5G.2.1) — composed unchanged. F4.5G.2.2.1 hands it the resolved UUIDs as `trackedSlots`. |
| Tile view-model merge | Inline in `<LiveVariableTile>` (or a small `mergeTileValue(restValue, realtimeSlot)` helper colocated with the new hook). Rule: prefer realtime when `realtime.timestamp > rest.timestamp`; otherwise REST. |
| Source / freshness label | New `tileSourceLabel({ enabled, restState, realtimeConnection, lastDataAt, hasMatch })` derivation in the tile (or the hook). Returns one of: `Mock fixture` / `Live backend` / `Reconnecting` / `Disconnected · last value HH:MM:SS UTC` / `No backend unit match` / `No latest value`. |
| Fallback behavior | When `!isApiSource()`: F2 simulator path verbatim. When `isApiSource() && resolverReturnsNull`: F2 path stays as the visible source, label shows `No backend unit match`, no backend fetch is issued. |
| Reconnect invalidation | Extend `useOperationsRealtimeF4`'s existing reconnect callback (or the new `useOperationsLatestValues` hook) to also `invalidateQueries({ queryKey: ['f4-latest'] })`. **Cache key shapes for both `['f4-trends']` and `['f4-latest']` are independent and additive — no shared key.** |
| Error / empty / loading states | Existing tile design already has `no_data` / `disabled` shells; F4.5G.2.2.1 adds api-mode-specific `loading` (skeleton) and `error` (muted "couldn't load" footer chip). Tile primary number falls back to `—` (existing F2 `formatValue(null)` behavior). |

## 5. Existing Tile / Operations Surface Inventory

Direct repo evidence as of `5dd9826`.

### 5.1 Tile components

- `apps/web/components/operations/LiveVariableTile.tsx` — six per unit card. Props: `{ jobId, snapshot, tile: OperationsTileDescriptor, density? }`. Renders icon row + big number + sparkline; shell color flips on alarm state.
- `apps/web/components/operations/LiveMultiphaseUnitCard.tsx` — wraps a 3×2 tile grid plus header (well / job / unit / started) and footer (duration / last update / active alarms / stale signals). Props: `{ job: ActiveJobSnapshot, displayNumber, displayName?, connectionStatus, density? }`.
- `apps/web/components/operations/LiveMultiphaseUnitGrid.tsx` — composes three cards from `OPERATIONS_JOBS`.
- `apps/web/components/operations/viewModel.ts` — `OPERATIONS_TILES` (the 6-tile catalog used by every card), plus `rollUpUnitStatus(...)` for the card badge.
- `apps/web/components/operations/Sparkline.tsx` — pure SVG; consumes `data: readonly number[]`. F4.5G.2.2.1 may leave the sparkline on the F2 ring buffer (no migration of trend history through latest API; trend history lives in F4.5G.1's path).

### 5.2 Current value / quality / freshness display

- **Primary number:** `formatValue(live?.value ?? null)` — `—` when null.
- **Unit label:** `live?.unit ?? tile.fallbackUnit`.
- **Tile shell color:** `shellByState[alarmState]` (F2 evaluator output).
- **Status label** (top-right of the tile): `'Disabled' | 'Stale' | 'Offline' | ''` derived from F2 `live.status`.
- **No "source: mock vs live backend" indicator on the tile today.** F4.5G.2.2.1 introduces one — see §12.

### 5.3 Existing tests for tiles + cards

- `apps/web/components/operations/MultiphaseUnitCard.test.tsx` — 4 tests (static rendering smoke).
- `apps/web/components/operations/Sparkline.test.tsx` — 3 tests.
- `apps/web/components/operations/viewModel.test.ts` — 13 tests (rollup logic).
- `apps/web/components/operations/alarmSummary.test.ts` — 7 tests.
- `apps/web/components/operations/operationsRuntime.test.ts` — 5 tests.
- **No spec covers `<LiveVariableTile>` directly** today; F4.5G.2.2.1 will add one (mock + api + reconnect + unresolved-unit + source-label cases).

### 5.4 Coupling between tiles and chart

None today. `<LiveTrendsPanelLive>` reads from `useOperationsTrendSeries` (REST trends in api mode; ring buffer in mock mode); tiles read from `useLiveValue` / `useAlarmState` (F2 store) regardless of api mode. F4.5G.2.2.1 introduces a new shared seam: the **resolved backend UUID** for each unit card is the same one both the new tile hook and the existing `useOperationsRealtimeF4` slot list will key off. But the chart cache (`['f4-trends']`) and the new tile cache (`['f4-latest']`) stay disjoint.

### 5.5 No existing source / freshness label on tiles

The page header carries `<OperationsHeaderRight>` (alarm summary chip) but no global "mock vs live" indicator on tiles today. F4.5G.1 added a label on the chart subtitle (`F4.6F.1 backend trends` vs `F2 simulated normalized stream`); F4.5G.2.1 added one on the `<LiveCommunicationHealthPanel>` Backend WebSocket row. F4.5G.2.2.1 inherits the same posture: each tile reads its source label from the resolver / hook output, never from a stale prop.

## 6. Existing Latest API / Adapter Inventory

Direct repo evidence as of `acd68d5`.

### 6.1 Backend contract (F4.6C.2.1)

- **Route:** `GET /api/v1/telemetry/latest`.
- **Query params:** `unitId` UUID required; `canonicalTagId` UUID **or** `canonicalTagName` string 1..64 optional (XOR; both rejected as ambiguous). Omitting both returns every latest value for the unit. `.strict()` rejects unknown fields (including `tenantId`).
- **Response envelope:** `{ unitId, generatedAt: ISO-8601, source: 'live_readings', values: LatestValueRow[] }`.
- **Per-row fields:** `sensorId`, `canonicalTag: { id, name, displayName, canonicalUnit, category, precision }`, `value: string` (Decimal-as-string), `engineeringUnit`, `quality: 'good' | 'uncertain' | 'bad'` (always `'good'` per F4.6C.1; surfaced for forward compatibility), `timestamp` (ISO-8601), `ingestionTimestamp` (ISO-8601 | null), `source` (string | null), `latestTelemetryReadingId` (string | null).
- **No-data behavior:** `200 OK` with `values: []` (known-empty unit / unknown unit / unknown canonical tag); never 404.
- **Tenant scoping:** server-side `CallerContext`; no `tenantId` on the wire.
- **Validation errors:** `400` for non-UUID `unitId`, both tag identifiers supplied, unknown query field, malformed `canonicalTagName`.

### 6.2 Frontend adapter

- `apps/web/lib/api/f4/endpoints.ts`: `getTelemetryLatest({ unitId, canonicalTagId?, canonicalTagName? }, options)` — typed wrapper composing `/telemetry/latest?…`.
- `apps/web/lib/api-data/f4/latest.ts`: `adapterGetTelemetryLatest(params, options)` dual-mode. Api branch runs `assertUuidShaped(unitId, '/telemetry/latest')` first; non-UUID raises `RvfApiError(400, …, 'unitId must be UUID-shaped …')` **before** any fetch. Mock branch tolerates simulator strings by returning the empty envelope.
- **Helpers exported via the api-data barrel:** `assertUuidShaped`, `isLatestUnitIdUuidShaped` (the renamed `isUuidShaped` predicate), `MOCK_F4_TELEMETRY_LATEST` fixture.

### 6.3 Mock fixtures

`MOCK_F4_TELEMETRY_LATEST` keyed by `MeasurementUnit.id`:
- `HP_001_ID` (`00000000-0000-0000-0000-000000004411`): 2 rows — `p_inlet` (3800.something psi) + `q_gas` (3.0 MMSCFD), timestamp-aligned to the last point of `MOCK_F4_TELEMETRY_TRENDS`.
- `LP_001_ID` (`00000000-0000-0000-0000-000000004412`): 1 row — `p_inlet` (480.0 psi).

Unknown unit IDs fall through to `{ unitId, generatedAt, source: 'live_readings', values: [] }`.

### 6.4 Test coverage today

- `apps/web/lib/api-data/f4/latest.test.ts` — 19 tests (mock + api + UUID guardrail). The api-mode tests assert URL composition with / without tag filters and the 400 surfacing for refines.
- **No consumer test exists** because no UI binds to the adapter yet. F4.5G.2.2.1 adds them.

## 7. Existing Units Resolver Surface Inventory

### 7.1 Backend route

`GET /api/v1/equipment/units` (F4.4D) — returns `MeasurementUnitListRow[]`:

```ts
interface MeasurementUnitListRow {
  id: string;                  // UUID — the resolver's target
  tenantId: string;            // UUID
  equipmentTypeId: string;     // UUID
  code: string;                // 'HP-001' / 'LP-001' — the asset code
  serialNumber: string | null; // 'RVF-HP-001' / 'RVF-LP-001'
  name: string;                // 'High Pressure / High Flow Test Unit'
  status: 'active' | 'inactive' | 'offline' | 'maintenance';
  operatingProfile: 'high_pressure_high_flow' | 'medium' | 'low' | 'custom';
  location: string | null;
  createdAt: string;
  updatedAt: string;
  equipmentType?: { id: string; name: string; pidReference: string | null };
}
```

The `code` field is the human-readable asset id ("HP-001"); the `name` field is the long form; `equipmentType.name` is the model family (`EMMAD`, `EMGAD`).

### 7.2 Frontend adapter + hook

- `adapterListMeasurementUnits(params, options)` — `apps/web/lib/api-data/f4/equipment.ts` (F4.5C). Dual-mode; mock returns `MOCK_F4_MEASUREMENT_UNITS` (HP-001 + LP-001 rows with the deterministic UUIDs above).
- `useUnitsFleet()` — `apps/web/lib/hooks/useUnitsFleet.ts` (F4.5F). In api mode, calls `adapterListMeasurementUnits()` once on mount and exposes `{ items, isLoading, error, source }`. **F4.5G.2.2.1 reuses this hook** rather than introducing a parallel fetch. The new `useResolveBackendUnitId(catalogCode)` composes `useUnitsFleet()` and does a `.find(...)` on `items`.

### 7.3 What fields are stable enough to match against?

| Field on `MeasurementUnitListRow` | Stable? | Suitable for resolver? |
|---|---|---|
| `id` (UUID) | Yes | This is what we resolve **to**, not from. |
| `code` (e.g. `HP-001`) | Yes — operational asset code, human-readable, unique | **Recommended match key.** |
| `name` (long display) | Mostly stable but verbose | Acceptable fallback if `code` is unavailable. |
| `serialNumber` (e.g. `RVF-HP-001`) | Stable but internal | Not user-meaningful; skip. |
| `equipmentType.name` (e.g. `EMMAD`) | Stable but ambiguous — one EquipmentType ↔ many MeasurementUnits | **Cannot resolve uniquely.** |
| `location` | Operational metadata; not unique | Skip. |

**`code` is the right match target.** The F4.4D `MeasurementUnitListRow.code` is the asset code, which is what an operator would type ("HP-001"). The resolver's job is to find the row whose `code` matches a value the simulator job binding declares it stands for.

### 7.4 What is missing today

- **`OperationsJobBinding` has no field naming a backend asset code.** `job.unitId` is the simulator catalog id (`EMMAD-01`), not a backend `code`. F4.5G.2.2.1 must introduce a small additive `backendUnitCode?: string` (or equivalent — name decided at implementation time) on `OperationsJobBinding`, populated explicitly per row in `apps/web/components/operations/data/operationsJobs.ts`. Rows without the annotation stay on the simulator path with an honest `No backend unit match` label.
- **The mock backend fixtures only carry HP-001 and LP-001 today** (F4.5C `MOCK_F4_MEASUREMENT_UNITS`). The simulator's three jobs (HP/HF, MP, STALE drill) only have two real backend assets to point at — so at most two of the three OPERATIONS_JOBS rows can resolve in mock-api mode. The third tile card will display `No backend unit match` per the §12 label policy. This is the right honesty: the simulator deliberately exposes more job profiles than the F4.3 seed mints assets, and the cutover must reflect that.

## 8. Proposed F4.5G.2.2.1 Implementation Boundary

F4.5G.2.2.1 ships **frontend-only tile cutover + resolver + tests**. No backend change.

### 8.1 In-scope for F4.5G.2.2.1

- **Augment `OperationsJobBinding`** at `apps/web/components/operations/data/operationsJobs.ts` with an optional `backendUnitCode?: string` field. Populate explicit per row where a corresponding backend asset exists in the F4.3 seed (likely HP/HF → `'HP-001'`; MP → `'LP-001'`; STALE drill → omit, since no third backend asset exists in the seed). **No fake mapping**: an unset field is the honest "no match" answer.
- **New hook `useResolveBackendUnitId(catalogCode)`** at `apps/web/lib/hooks/useResolveBackendUnitId.ts`. Composes the existing `useUnitsFleet()`; matches by `code` strict equality against the returned `items`; returns `{ unitId: string | null, isLoading: boolean, error: Error | null, source: RvfDataSource }`. Throws no errors for unmatched codes — `null` is the honest answer.
- **New hook `useOperationsLatestValues({ unitId, enabled })`** at `apps/web/lib/hooks/useOperationsLatestValues.ts`. TanStack Query on top of `adapterGetTelemetryLatest`. Cache key `['f4-latest', unitId]`. `refetchInterval: 30_000` (matches F4.5G.1's mini-chart pacing). `enabled: false` when `unitId` is `null` (no resolver match) or non-UUID. Returns `{ valuesByTagName, isLoading, isError, lastDataAt, source }` where `valuesByTagName` is a `Map<string, TelemetryLatestValue>` keyed by `canonicalTag.name` for O(1) lookup from a tile.
- **`<LiveVariableTile>` cutover.** Tile reads from the new hooks **only when `isApiSource()` AND the resolver returned a UUID**; otherwise falls back to `useLiveValue` (F2 path). Tile primary value preference order in api+resolved mode:
  1. realtime slot value when `realtime.timestamp > rest.timestamp`,
  2. REST latest-value row,
  3. previous value preserved during `isLoading` (TanStack Query `placeholderData` semantics).
- **`<LiveMultiphaseUnitCard>` resolver wiring.** The card resolves the backend UUID once per render (from `useResolveBackendUnitId(binding.backendUnitCode)`), threads it down to each `<LiveVariableTile>`, and hands the realtime hook the six UUID-shaped slots `{ unitId, canonicalTagId }`. Card footer (`Last Update`, etc.) **may** consume REST timestamps in api+resolved mode (cosmetic improvement; defer to implementation if disruptive).
- **Source / freshness label per tile.** Small chip in the tile header (top-right) per §12. Existing `statusLabel` ('Disabled' / 'Stale' / 'Offline') remains — the new source chip is additive, not a replacement.
- **Reconnect invalidation extension.** F4.5G.2.2.1 extends `useOperationsRealtimeF4`'s reconnect handler (or co-locates a parallel `useEffect` in the new latest hook) to also call `queryClient.invalidateQueries({ queryKey: ['f4-latest'] })` on `'connected'` after `'reconnecting'`. **`['f4-trends']` invalidation behavior stays byte-identical** (F4.5G.2.1 owns it).
- **Mock fixtures untouched.** `MOCK_F4_TELEMETRY_LATEST` from F4.6C.2.1 carries HP-001 + LP-001 rows; F4.5G.2.2.1 reuses them. No new mock data.
- **Tests** per §15.

### 8.2 Out-of-scope for F4.5G.2.2.1

- **No backend change.** F4.6C.2.1's surface is sufficient.
- **No multi-unit batch endpoint.** Each card issues its own `adapterGetTelemetryLatest({ unitId })` call (TanStack Query parallel) — at most 3 concurrent calls in the current OPERATIONS_JOBS triple. Candidate **F4.6C.3** if a future screen demands a single round-trip across N units.
- **No `<LiveActiveAlarmsPanel>` migration.** Stays on F2 simulator path; awaits candidate F4.6D.2.
- **No alarm chart annotations.** Candidate F4.5G.3.
- **No chart realtime tail.** Candidate F4.5G.2.3.
- **No non-telemetry screen migrations.** Candidate F4.5H.
- **No env vars / dependencies / `packages/types/` changes.**
- **No new backend endpoint or schema change.**
- **No global Operations source label** (each tile carries its own; that's enough honesty without adding a redundant header chip).
- **Sparkline data source stays on F2.** Trend history for the sparkline strip continues to come from `useHistoryBuffer` in both modes. Migrating sparklines to REST trends is a future concern (the trend cache would have to extend to per-tile resolution); not in this phase.

### 8.3 What F4.5G.2.2.1 explicitly does not touch

- `apps/backend/` — no change.
- `packages/types/` — no change.
- `apps/web/lib/realtime/{socket,RealtimeProvider,telemetryStore,ringBuffer}.ts` — no change.
- `apps/web/lib/hooks/useOperationsRealtimeF4.ts` — interface unchanged (the reconnect-handler extension is additive; cache key on the realtime hook is unchanged).
- `apps/web/lib/hooks/useOperationsTrendSeries.ts` — no change. `['f4-trends']` cache key unchanged.
- `apps/web/lib/api-data/f4/latest.ts` — no change (consumer-only).
- `apps/web/lib/api-data/f4/equipment.ts` / `useUnitsFleet.ts` — composed unchanged.
- `apps/web/components/operations/{LiveTrendsPanelLive,TrendDrawer,LiveCommunicationHealthPanel,LiveActiveAlarmsPanel,FieldConditionsPanel,OperationsHeaderRight}.tsx` — no change.
- `docker-compose.yml`, root `package.json`, lockfile, `turbo.json`, `tsconfig*.json`, `.env*`, CI workflow, `vitest.config.ts` — no change.

## 9. Unit Resolver Strategy

This is the central design choice; the §2.5 gap (`EMMAD-01` ↔ no clean backend match) is what F4.5G.2.2 must close honestly.

### 9.1 The four options framed in the brief

- **(A) Frontend resolver hook reading the F4.4D units list and matching by some field.** Feasible only if a stable, unambiguous match key exists across simulator + backend.
- **(B) Redesign `OPERATIONS_JOBS` to carry backend UUIDs natively.** Trades one form of static binding for another; UUIDs in source code are brittle and tie the simulator to a specific seed run.
- **(C) Fetch backend job set in api mode and render Operations from that.** Larger scope — touches the simulator/F2 runtime boot, the job-snapshot model, and possibly the alarm panel. Out of scope for F4.5G.2.2.
- **(D) Defer tile API binding until unit selection is redesigned.** Leaves F4.6C.2.1's adapter dormant indefinitely.

### 9.2 The repo-evidence finding that shapes the recommendation

`OPERATIONS_JOBS[i].job.unitId` is `EMMAD-01` / `EMMAD-02` / `PSK-03`. The F4 backend's `MeasurementUnit.code` is `HP-001` / `LP-001`. The two sides have **no field in common** — `EMMAD-01` is a simulator catalog id; `HP-001` is a backend asset code. A regex would lie; a hardcoded table would lie.

But there is a small, honest way out: **the simulator binding can declare which backend asset it stands in for.** `OperationsJobBinding` already declares everything else about the job (snapshot, profile, display number); adding an optional `backendUnitCode?: string` annotation per row is the same kind of explicit declaration. It is not a "mapping table" — it is the simulator side saying "this job impersonates the HP/HF unit, which in the backend is `HP-001`." When the annotation is missing, the resolver returns `null` and the tile stays on the simulator path with an honest label.

### 9.3 Recommendation: **Option (A) — with the explicit `backendUnitCode` annotation on `OperationsJobBinding`**

Concretely:

1. **Augment `OperationsJobBinding`** at `apps/web/components/operations/data/operationsJobs.ts` with `backendUnitCode?: string`.
2. **Populate per row** (likely): HP/HF binding → `'HP-001'`; MP binding → `'LP-001'`; STALE drill binding → **omit** (the F4.3 seed mints only two assets; the third tile card honestly displays `No backend unit match` in api mode).
3. **New `useResolveBackendUnitId(code: string | undefined)`** hook at `apps/web/lib/hooks/useResolveBackendUnitId.ts`:
   - Returns `{ unitId: null }` immediately when `code === undefined`.
   - In mock mode: matches against `MOCK_F4_MEASUREMENT_UNITS` directly (via the existing `useUnitsFleet()` mock path).
   - In api mode: matches against `useUnitsFleet().items` once the fetch resolves.
   - On no match: returns `{ unitId: null, error: null }` — `null` is the honest answer, not an error.
4. **The new latest hook gates on `unitId !== null`** so `enabled: false` skips both the fetch and any realtime tracking.

**Hard rule:** F4.5G.2.2.1 must never hardcode a mapping table from simulator catalog codes to backend UUIDs anywhere — not in the resolver, not in the tile, not in the mock fixtures. The `backendUnitCode` annotation is an *explicit declaration on the binding*, not a *mapping table that someone has to maintain*. Each binding declares for itself.

### 9.4 What fails closed when the resolver returns null

- **No backend REST call** is issued (`useOperationsLatestValues` has `enabled: false`).
- **No Socket.IO `subscribe` emit** carries the slot (F4.5G.2.1's `isUuidShaped` predicate already filters the slot index; the new latest hook adds the second defensive layer).
- **The tile renders from the F2 simulator path** with the `No backend unit match` chip — operator sees that this tile is *intentionally* on the simulator side because no backend asset is bound to it.
- **The chart and the drawer continue to behave as F4.5G.1 left them** (their data path is independent of the resolver).

This is the honest answer for the third OPERATIONS_JOBS row (STALE drill) in api mode, and the framework F4.5G.2.2.1 will extend cleanly if a future job binding adds a `backendUnitCode` for a real asset.

## 10. Latest-value Query Strategy

### 10.1 One request per unit (recommended), not per tile

- F4.6C.2.1's endpoint already supports "omit tag → return every latest value for the unit." A single call per resolved unit returns up to ~6 rows (one per tile) in one round-trip.
- One call per tile would mean 6 round-trips per card × 3 cards = 18 concurrent calls; one call per unit is 3 concurrent calls (one per card). **Pick per-unit.**
- F4.5G.2.2.1's new hook signature is `useOperationsLatestValues({ unitId })` — the unit is the natural key.

### 10.2 Tile-side filtering by canonical tag name

- The response carries `values: LatestValueRow[]` where each row's `canonicalTag.name` is `'p_inlet'` / `'q_gas'` / etc.
- The hook builds a `Map<string, TelemetryLatestValue>` keyed by `canonicalTag.name` for O(1) tile lookup.
- Tiles consume `valuesByTagName.get('p_inlet')` (or the appropriate tag name from `OPERATIONS_TILES`). Missing tag → tile shows `No latest value` per §12.

### 10.3 Cache key and refetch policy

- **Cache key:** `['f4-latest', unitId]`. Independent of `['f4-trends', ...]` — no shared key.
- **Refetch interval:** `30_000` (matches F4.5G.1's mini-chart cadence). Realtime overlay closes the rest of the gap.
- **Stale-while-revalidate:** TanStack Query's default — the tile shows the previous REST value while a refetch is in flight (avoids flashing `—`).
- **Retry policy:** match the project default (`retry: 2` per `QueryProvider`).
- **`enabled:`** `isApiSource() && isUuidShaped(unitId)` — the same UUID guardrail as F4.6C.2.1's adapter; defense in depth.

### 10.4 No-data / loading / error states

| Hook state | Tile presentation |
|---|---|
| `isLoading` (first load) | Tile shows a `—` value with a small "Loading…" footnote chip. |
| `isError` | Tile shows `—` value with a `Couldn't load latest` chip (muted-red). |
| Response `values: []` (unit empty / unknown) | Tile shows `—` value with a `No latest value` chip. |
| Tile's canonical tag missing in the response | Same: `—` + `No latest value` chip. |
| Resolved unit but realtime disconnected | Last REST value shown; chip flips to `Reconnecting` / `Disconnected · last value HH:MM:SS UTC`. |

### 10.5 No multi-unit batch in this phase

F4.6C.2.1 ships single-unit per request by design. Three concurrent calls (one per card) is well within budget. A candidate **F4.6C.3** can ship a `GET /api/v1/telemetry/latest/batch?unitIds=…` only if profiling demonstrates the parallel-call pattern is too noisy on the backend. Not in F4.5G.2.2.1.

## 11. Realtime Overlay Strategy

### 11.1 Matching key and merge rule

- **Matching key:** `(unitId, canonicalTagId)` — both UUID-shaped. F4.5G.2.2.1 hands the realtime hook the six tracked slots per resolved card (`UNIT_UUID × each of the six tile canonicalTagId`).
- **Merge rule per tile:** at render time, the tile computes `effectiveValue = realtimeSlot && realtimeSlot.timestamp > restRow.timestamp ? realtimeSlot : restRow`. Both layers expose the same `value` / `timestamp` / `engineeringUnit` fields (per F4.5G.2.1's `SlotLiveValue` and F4.6C.2.1's `LatestValueRow`).
- **Older realtime timestamps are dropped at the hook level** by F4.5G.2.1's existing logic (the slot's `timestamp` is monotonically non-decreasing per slot). The tile only needs to compare REST vs realtime.

### 11.2 Realtime never replaces REST as durable source

- The realtime overlay is never persisted as the displayed value across re-renders if the underlying TanStack Query cache changes — the cache is the source. On every render, the tile re-evaluates the merge rule against the *current* REST value.
- On **reconnect**, F4.5G.2.2.1's extended invalidation flushes the `['f4-latest']` cache; the next render takes the REST refetch as authoritative. The realtime overlay then applies on top of the fresher REST value.

### 11.3 Tag mapping between layers

- Both layers carry `canonicalTagId` (UUID) — the realtime envelope's payload field; F4.6C.2.1's `LatestValueRow.canonicalTag.id`.
- The tile's `OperationsTileDescriptor.tag` is the canonical-tag *name* (`CANONICAL_TAGS.PInlet === 'p_inlet'`). The hook converts: the resolved REST row's `canonicalTag.id` is the realtime-overlay key.
- **No new mapping table.** The hook simply iterates `valuesByTagName` once after the REST resolves and produces a parallel `valuesByCanonicalTagId: Map<string, TelemetryLatestValue>` for the merge step. Implementation detail decided at write time.

### 11.4 Chart path unchanged

- `useOperationsRealtimeF4` already invalidates `['f4-trends']` on reconnect (F4.5G.2.1). F4.5G.2.2.1 adds the parallel invalidation for `['f4-latest']` — the two cache keys are independent and additive. The trend cache key shape stays byte-identical.
- The chart never reads `useOperationsLatestValues`; the tile never reads `useOperationsTrendSeries`. No coupling.

### 11.5 Event filters preserved

- `live_reading.updated` is the only kind consumed for tile overlays.
- `telemetry.reading.accepted` stays ignored (F4.5G.2.1 §8.1).
- `alarm.event.created` is **not** used for tile shells or any per-tile signal. The browser does not evaluate alarms; the tile shell color stays on the F2 evaluator path against the commissioning snapshot (ADR-005-compliant because the snapshot's thresholds are the source of truth, not a live computation). A future candidate F4.5G.3 may render alarm annotations on the chart; nothing in F4.5G.2.2.1 changes tile shell coloring.

## 12. Source / Freshness Labeling

ADR-005 binding contract: never lie about freshness. F4.5G.2.2.1 introduces a small per-tile chip in the top-right of `<LiveVariableTile>`, additive to the existing `statusLabel` (`Disabled` / `Stale` / `Offline`).

| Mode / state | Chip text |
|---|---|
| `!isApiSource()` (default mock) | `Mock fixture` |
| `isApiSource()` && `binding.backendUnitCode === undefined` | `No backend unit match` |
| `isApiSource()` && resolver returned `null` (code didn't match any unit) | `No backend unit match` |
| `isApiSource()` && `useOperationsLatestValues.isLoading` (first load) | `Loading…` |
| `isApiSource()` && `useOperationsLatestValues.isError` | `Couldn't load latest` |
| `isApiSource()` && REST resolved, tag missing from response | `No latest value` |
| `isApiSource()` && REST resolved, realtime `connected` | `Live backend` |
| `isApiSource()` && REST resolved, realtime `reconnecting` | `Reconnecting` |
| `isApiSource()` && REST resolved, realtime `disconnected` with `lastDataAt` | `Disconnected · last value HH:MM:SS UTC` (formatted from the REST row's `timestamp`) |
| `isApiSource()` && REST resolved, realtime `disabled` (non-UUID tenant, etc.) | `Live backend` (chip still honest — REST is the durable source; realtime is overlay-only) |

**Placement:** small text chip in the tile header (top-right, replacing or complementing the existing `statusLabel` placement). The chip is `text-micro uppercase tracking-micro` matching the existing tile typography.

**Card footer:** `<LiveMultiphaseUnitCard>`'s existing footer (`Last Update`, etc.) **may** be re-derived from REST timestamps in api+resolved mode if the implementation finds it tractable; defer if disruptive (the F2-derived footer is still honest in mock mode and acceptable in api mode during F4.5G.2.2.1).

## 13. Mock / Fallback Policy

- **Default for local dev** stays `NEXT_PUBLIC_RVF_DATA_SOURCE !== 'api'` (mock). Tiles render from the F2 simulator path via `useLiveValue` etc., verbatim. No REST fetch, no resolver fetch, no realtime subscription. Per-tile chip reads `Mock fixture`.
- **Opt-in to backend mode** by setting `NEXT_PUBLIC_RVF_DATA_SOURCE=api`. Tiles run the resolver → REST → realtime overlay chain. Cards whose binding lacks `backendUnitCode` (or whose `code` doesn't match any unit) **fall back to the F2 path with the `No backend unit match` chip**.
- **Production behavior.** Production deployments must set `NEXT_PUBLIC_RVF_DATA_SOURCE=api`. Production builds with the env var unset are misconfigured and caught at deploy time (env loads at build time for `NEXT_PUBLIC_*`). The chip never silently labels mock data as live (the explicit `Mock fixture` chip is the only honest answer).
- **No silent fallback to simulator in api mode.** If the resolver returns `null` (no match), the tile honestly says `No backend unit match` — not a generic mock label. Operators see exactly which tile cards have a backend binding and which do not.
- **Mock fixtures stay mock-only.** F4.5G.2.2.1 does not introduce any new fixture; it consumes `MOCK_F4_TELEMETRY_LATEST` (HP-001 + LP-001) from F4.6C.2.1 and `MOCK_F4_MEASUREMENT_UNITS` (HP-001 + LP-001) from F4.5C through the existing dual-mode adapters.

## 14. Non-Goals

Explicitly out of scope for F4.5G.2.2.1 (each with the phase that should own it):

- **Backend changes.** None — F4.6C.2.1's surface is sufficient.
- **Latest API changes.** No new query params, no batch endpoint, no schema change.
- **Multi-unit batch endpoint.** Candidate F4.6C.3 if profiling demands it.
- **`<LiveActiveAlarmsPanel>` migration.** Stays on F2 simulator path; candidate F4.6D.2.
- **Alarm chart annotations.** Candidate F4.5G.3.
- **Chart realtime tail.** Candidate F4.5G.2.3.
- **Full Operations redesign.** No — only the tile cutover.
- **All Operations panels at once.** Only `<LiveVariableTile>` / `<LiveMultiphaseUnitCard>` tile-grid binding (+ resolver wiring on the card). Other panels untouched.
- **Sparkline migration to REST trends.** Sparklines continue to read F2 ring-buffer history; a future phase can revisit.
- **Non-telemetry screen migrations.** Wells / Equipment / Catalog / Tags / Settings / Reports — candidate F4.5H.
- **Auth / rate limiting.** Inherited no-auth posture.
- **ThingsBoard / Node-RED integration.** No.
- **`packages/types/` changes.** No.
- **New env variables, dependencies, or build-tool changes.** No.

## 15. Test Plan

Mirrors the F4.5G.2.1 / F4.6C.2.1 vitest posture (jsdom + Testing Library + mocked hook substrate).

### 15.1 New / extended frontend tests

**`apps/web/lib/hooks/useResolveBackendUnitId.test.tsx`** (new):

1. Returns `{ unitId: null }` synchronously when `code === undefined`.
2. Mock mode: matches `MOCK_F4_MEASUREMENT_UNITS` row whose `code === 'HP-001'` → returns the HP-001 UUID.
3. Mock mode: no-match (e.g. `code === 'XX-999'`) → returns `{ unitId: null }`.
4. Api mode: composes a fetch (via `useUnitsFleet`'s api branch); returns the matched UUID when present.
5. Api mode + unresolved fetch (units list still loading) → `isLoading: true`, `unitId: null`.
6. Api mode + fetch error → `error` populated; `unitId: null`.
7. Source label tracks mock vs api via `useUnitsFleet().source`.

**`apps/web/lib/hooks/useOperationsLatestValues.test.tsx`** (new):

1. `enabled: false` when `unitId` is `null` — no `adapterGetTelemetryLatest` call issued.
2. `enabled: false` when `unitId` is non-UUID — no call (defense in depth, matches the F4.6C.2.1 guard).
3. Mock mode happy path: `unitId: HP_001_ID` → `valuesByTagName` carries `p_inlet` + `q_gas` entries.
4. Mock mode unknown unit: `unitId` is a valid UUID with no fixture → `valuesByTagName.size === 0`; `isLoading: false`; `isError: false`.
5. Api mode URL composition: query carries `unitId=<UUID>`; no extra params.
6. Api mode 400 surface: `RvfApiError` from the adapter propagates as `isError: true`.
7. Cache key `['f4-latest', unitId]` invalidation triggers refetch.
8. `refetchInterval: 30_000` configured.

**`apps/web/components/operations/LiveVariableTile.test.tsx`** (new — no current spec):

1. Mock mode: tile renders from the F2 simulator path (F2 `useLiveValue` mock substrate) — no REST call.
2. Mock mode chip: reads `Mock fixture`.
3. Api mode + resolved UUID + REST hit: tile renders the REST `value`; chip reads `Live backend` when realtime connected.
4. Api mode + resolved UUID + missing tag in response: tile shows `—`; chip reads `No latest value`.
5. Api mode + unresolved binding (`backendUnitCode` missing): tile renders F2 value; chip reads `No backend unit match`; no REST call issued.
6. Api mode + REST `isLoading`: chip reads `Loading…`; tile shows `—`.
7. Api mode + REST `isError`: chip reads `Couldn't load latest`; tile shows `—`.
8. Realtime overlay precedence: realtime slot with `timestamp > restRow.timestamp` is preferred; same-or-older timestamps fall through to REST.
9. Realtime overlay disabled (mock mode or non-UUID tenant) — tile uses pure REST value when api mode.

**`apps/web/components/operations/LiveMultiphaseUnitCard.test.tsx`** (new — no current spec; the existing `MultiphaseUnitCard.test.tsx` covers a different static-card surface):

1. Card resolves binding to backend UUID via `useResolveBackendUnitId`.
2. Card hands the six tile slots to `useOperationsRealtimeF4` (`trackedSlots` parameter shape).
3. Card renders three `<LiveVariableTile>`s with the F2 path in mock mode; six in api+resolved mode reading the new hooks.
4. Footer `Last Update` honest in both modes (F2-derived acceptable in F4.5G.2.2.1).

**Reconnect-invalidation tests (extension of `useOperationsRealtimeF4.test.tsx` or co-located):**

1. On `'connected'` after `'reconnecting'`, **both** `['f4-trends']` and `['f4-latest']` are invalidated exactly once each.
2. Pre-existing F4.5G.2.1 reconnect tests for `['f4-trends']` invalidation stay green unchanged.

### 15.2 Tests that must keep passing unchanged

- All F4.5G.1 chart pair tests (`LiveTrendsPanelLive.test.tsx`, `TrendDrawer.test.tsx`, `useOperationsTrendSeries.test.tsx`, `trendsToChartSeries.test.ts`).
- All F4.5G.2.1 tests (`useOperationsRealtimeF4.test.tsx`, `LiveCommunicationHealthPanel.test.tsx`).
- All F4.6C.2.1 tests (`latest.service.spec.ts` backend; `latest.test.ts` frontend adapter).
- All existing tile / card / panel specs (`MultiphaseUnitCard.test.tsx`, `Sparkline.test.tsx`, `viewModel.test.ts`, `alarmSummary.test.ts`, `operationsRuntime.test.ts`).
- All F4.5F units-fleet specs (`useUnitsFleet.test.tsx`).
- All backend tests (217/217 — F4.5G.2.2.1 makes no backend change).

### 15.3 Test counts

| Metric | Before F4.5G.2.2.1 (`5dd9826`) | After F4.5G.2.2.1 (projected) |
|---|---|---|
| Backend tests | 217 / 217 | **217 / 217** (no backend change) |
| Frontend tests | 394 / 394 | **+~18–28 new tests** (~7 resolver + ~8 latest hook + ~9 tile + ~4 card + ~2 reconnect extension) |

### 15.4 Validation commands (DX-3 §"Runtime phases")

- `pnpm --filter @rvf/web run lint -- --max-warnings 0`
- `pnpm --filter @rvf/web run typecheck`
- `pnpm --filter @rvf/web run build`
- `pnpm --filter @rvf/web run test`
- Workspace `pnpm lint` / `typecheck` / `build` — both apps green; backend cached (untouched).

### 15.5 What F4.5G.2.2-0 itself runs

**Nothing.** Documentation-only phase. DX-3 §"Documentation-only phases" prescribes only `git status` + `git diff --stat` confirming only `docs/` changed.

## 16. Risks and Guardrails

| Risk | Mitigation |
|---|---|
| **Fake mapping from catalog IDs to UUIDs.** Hardcoded `EMMAD-01 → HP_001_ID` table anywhere in the resolver, the tile, or the fixtures. | §9.3 hard rule. The `backendUnitCode?: string` annotation on `OperationsJobBinding` is an *explicit per-binding declaration*, not a *mapping table*. Reviewer rejects any PR that introduces a `Record<string, string>` of catalog-code → UUID anywhere in `apps/web/`. |
| **Stale values shown as live.** Tile chip says `Live backend` while the underlying REST value is 5 minutes old. | Chip state is hook-driven. When the realtime socket is `disconnected`, the chip flips to `Disconnected · last value HH:MM:SS UTC` even if the REST cache hasn't yet expired. ADR-005 binding contract. |
| **Double source of truth between REST and realtime.** Tile shows realtime value indefinitely while REST cache silently goes stale. | The merge rule re-evaluates on every render against the *current* REST cache value; reconnect invalidates the REST cache. Realtime is overlay, never durable. |
| **Overfetching per tile.** N tiles × N calls = N² traffic. | §10.1: one REST call per unit (not per tile). Three concurrent calls for the current OPERATIONS_JOBS triple. UI-side fan-out via TanStack Query parallel. No batch endpoint required. |
| **Breaking F4.5G.1 chart / drawer path.** Resolver / tile rewrite accidentally touches `useOperationsTrendSeries` or its cache key. | §8.3 lists the untouched files explicitly. Reviewer rejects any diff on those files. |
| **Silently falling back to simulator in production.** Api-mode build deployed without resolver matches → tile renders F2 values labeled as live. | §13 + §12 chip palette. `No backend unit match` is the explicit answer; `Mock fixture` is reserved for mock mode; `Live backend` only when REST resolved AND realtime is up. |
| **Coupling static Operations catalog to backend schema too tightly.** Hardcoding `'HP-001'` in `OPERATIONS_JOBS` ties the simulator to the F4.3 seed. | The `backendUnitCode` annotation is *declarative*. If the seed renames `HP-001` → `HP-002`, the simulator-side annotation updates explicitly (one-line change). No hidden coupling — the declaration is the contract. |
| **Trying to solve all Operations panels at once.** Bundling `<LiveActiveAlarmsPanel>` / `<LiveCommunicationHealthPanel>` / `<FieldConditionsPanel>` migrations. | §8.2 + §14. Reviewer rejects any PR that bundles cross-panel changes. F4.6D.2 / F4.5G.3 / etc. are the right places. |
| **Resolver fetches every render.** The new hook accidentally re-fetches `useUnitsFleet()` per tile. | `useUnitsFleet()` is already singleton-per-page; the resolver hook only filters its `items` array. TanStack Query (if used inside `useUnitsFleet`) dedupes the request. Reviewer asserts no extra fetch in the resolver-hook spec. |
| **Realtime hook's `trackedSlots` array thrashing.** Re-creating the array on every render invalidates the realtime hook's subscription. | F4.5G.2.2.1's card composes the `trackedSlots` array via `useMemo({ ... }, [unitId])` so the reference is stable per resolved unit. Reviewer asserts no re-subscribe in the test. |
| **Sparkline data drift between api-mode primary value (REST latest) and sparkline tail (F2 ring buffer).** Operator sees REST 3800 psi but a sparkline that doesn't include that point. | §8.2 explicit: sparkline stays on F2 ring buffer. Operator-facing label clarifies the primary value source; sparkline visual continuity is acceptable during F4.5G.2.2.1 (and can be migrated to REST trends in a follow-up if disruptive). |
| **Resolver returns `null` and the tile still issues a backend call.** | The `useOperationsLatestValues` hook's `enabled` flag is the gate: `enabled: isApiSource() && isUuidShaped(unitId)`. Reviewer asserts the spec covers the `null`-unitId case as "no fetch." |
| **`trackedSlots` slot list grows unbounded when navigating Operations cards.** | The realtime hook's slot index is rebuilt per render; F4.5G.2.2.1's card hands it the six per-card slots only. The hook itself owns subscription lifecycle and dedup. Reviewer asserts the slot count matches `OPERATIONS_TILES.length * resolvedCardCount`. |

## 17. Acceptance Criteria for F4.5G.2.2.1

F4.5G.2.2.1 is complete when **all** of the following are true:

- [ ] `OperationsJobBinding` extended with an optional `backendUnitCode?: string` annotation at `apps/web/components/operations/data/operationsJobs.ts`. The three current bindings declare their values explicitly: HP/HF → `'HP-001'`; MP → `'LP-001'`; STALE drill → **omitted** (no third backend asset in the F4.3 seed). No mapping table introduced anywhere else.
- [ ] New `useResolveBackendUnitId(code: string | undefined)` hook at `apps/web/lib/hooks/useResolveBackendUnitId.ts`. Composes the existing `useUnitsFleet()`. Returns `{ unitId: string | null, isLoading, error, source }`. `null` is the honest answer for `code === undefined` and for no-match cases; no errors thrown on those paths.
- [ ] New `useOperationsLatestValues({ unitId, enabled? })` hook at `apps/web/lib/hooks/useOperationsLatestValues.ts`. TanStack Query on `adapterGetTelemetryLatest`. Cache key `['f4-latest', unitId]`. `refetchInterval: 30_000`. `enabled` gated on `isApiSource() && isUuidShaped(unitId)`. Returns `{ valuesByTagName, isLoading, isError, lastDataAt, source }`.
- [ ] `<LiveVariableTile>` modified to read from the new hooks **only when** `isApiSource() && resolverReturnedUuid`; otherwise falls back to `useLiveValue` (F2 path). No prop signature change required (or, if a new prop is needed, it is additive optional).
- [ ] `<LiveMultiphaseUnitCard>` resolves the backend UUID per render via `useResolveBackendUnitId(binding.backendUnitCode)`; threads the resolved UUID to each child tile; hands the realtime hook a stable `trackedSlots` array (`useMemo`).
- [ ] Per-tile source / freshness chip implemented per §12: `Mock fixture` / `Live backend` / `Reconnecting` / `Disconnected · last value HH:MM:SS UTC` / `Loading…` / `Couldn't load latest` / `No latest value` / `No backend unit match`.
- [ ] Realtime overlay merge rule per §11.1 — realtime preferred only when `realtime.timestamp > rest.timestamp`. Implemented in the tile or a small co-located helper.
- [ ] Reconnect invalidation: on `'connected'` after `'reconnecting'`, **both** `['f4-trends']` and `['f4-latest']` are invalidated. F4.5G.2.1's existing `['f4-trends']` behavior stays byte-identical.
- [ ] Mock mode (`NEXT_PUBLIC_RVF_DATA_SOURCE !== 'api'`) leaves the F2 simulator path untouched. Tiles render exactly as before. No REST fetch, no resolver fetch, no realtime subscription on tile mount. Chip reads `Mock fixture`.
- [ ] Api mode with the binding's `backendUnitCode` unresolvable → tile renders F2 path with `No backend unit match` chip; no backend call issued; no realtime emit issued.
- [ ] Production posture preserved: `NEXT_PUBLIC_RVF_DATA_SOURCE=api` is required at build time; the chip never silently presents mock data as live.
- [ ] **No backend change.** No `apps/backend/` modification; no Prisma schema / migration / seed change.
- [ ] **No `packages/types/` change.**
- [ ] **No new env variable; no new dependency.**
- [ ] **No fake mapping** from `EMMAD-01` / `EMMAD-02` / `PSK-03` to backend UUIDs anywhere — not in the resolver, the tile, the card, the mock fixtures, or any new helper.
- [ ] **No other UI screen migration** (`<LiveActiveAlarmsPanel>`, Wells / Equipment / Catalog / Tags / Settings / Reports — all untouched).
- [ ] **No browser-side alarm evaluation introduced** (the F2 evaluator path against the commissioning snapshot stays; no new computation against `live_readings` values).
- [ ] Tests added per §15.1; expected ~18–28 new frontend tests. Existing frontend 394/394 + backend 217/217 stay green unchanged.
- [ ] DX-3 §"Runtime phases" validation surface passes end to end: `lint --max-warnings 0` / `typecheck` / `build` / `test` for `@rvf/web`.
- [ ] F4.5G.2.2.1 closeout report exists at `docs/architecture/RVF_Malinois_F4_5G_2_2_1_Operations_Tile_Latest_Value_Cutover_Closeout.md`. Reports the final test count, lists files touched, names any deferred work.
- [ ] Master roadmap §3 / §7 refresh — deferred to a small follow-up hygiene commit per the established pattern.

## 18. Recommended Next Step

**Next step after F4.5G.2.2-0: F4.5G.2.2.1 — Operations Tile Latest-value Cutover Implementation.** Scope per §8; resolver strategy per §9; query strategy per §10; overlay strategy per §11; labeling per §12; fallback per §13; tests per §15; acceptance per §17.

After F4.5G.2.2.1, the master roadmap §7 sequence continues with whichever of these the team picks based on observed need:

- **Candidate F4.5G.2.3 — Operations chart realtime tail.** Append `live_reading.updated` points to `<TrendChart>` series instead of only invalidating on reconnect. Sized only if profiling shows the 30 s / 60 s `refetchInterval` cadence is too coarse.
- **Candidate F4.5G.3 — Alarm chart annotations.** Wire `alarm.event.created` overlays onto `<TrendChart>` / `<TrendDrawer>`. Browser does not evaluate.
- **Candidate F4.6D.2 — Alarm Events Read API.** Public read surface over `alarm_events`; unblocks `<LiveActiveAlarmsPanel>` migration off its browser-side `evaluateReading(...)` path.
- **Candidate F4.6C.3 — Latest-value batch / multi-unit endpoint.** Only if the post-cutover profile shows the per-card parallel-call pattern is too noisy.
- **Candidate F4.5H — Non-telemetry screen adapter wiring.** Per-screen migrations for Wells / Equipment / Catalog / Tags / Settings / Reports.

These are named so they have a place to land. None is committed to as part of F4.5G.2.2.1. The next implementation phase is **F4.5G.2.2.1**.

---

*F4.5G.2.2-0 plan, authored at HEAD `5dd9826` (Refresh master roadmap after F4.6C.2.1). Plan-only. Update on phase close (`Current` → `Closed` with commit hash) and when F4.5G.2.2.1 lands its closeout.*
