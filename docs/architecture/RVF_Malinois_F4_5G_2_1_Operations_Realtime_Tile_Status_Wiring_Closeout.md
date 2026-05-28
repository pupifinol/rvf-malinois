# RVF Malinois — F4.5G.2.1 Operations Realtime Tile / Status Wiring Closeout

> Phase **F4.5G.2.1 — Operations Realtime Tile / Status Wiring Implementation**. Implements the plan locked in F4.5G.2-0 against repository HEAD `1d0f659` (Refresh master roadmap after F4.5G.2-0).
>
> Upstream references:
> - F4.5G.2-0 plan: `docs/architecture/RVF_Malinois_F4_5G_2_Operations_Realtime_Tile_Status_Wiring_Plan.md` (commit `583da2b`).
> - F4.5G.1 closeout (chart pair preserved by this phase): `docs/architecture/RVF_Malinois_F4_5G_1_Operations_Chart_Adapter_Expanded_Trend_View_Closeout.md` (commit `916d067`).
> - F4.6E.1 closeout (realtime envelopes consumed): `docs/architecture/RVF_Malinois_F4_6E_1_WebSocket_SSE_Fan_Out_Closeout.md` (commit `51dc626`).
> - F4.6F.1 closeout (trend cache key reused for reconnect invalidation): `docs/architecture/RVF_Malinois_F4_6F_1_Historical_Trend_API_Closeout.md` (commit `946a023`).

## 1. Purpose

F4.5G.2.1 implements the Operations realtime tile / status wiring defined in F4.5G.2-0. The Operations screen now opens an honest, narrow F4.6E.1 subscription path: a new hook composes the existing Socket.IO connection, narrows inbound payloads on the `rvf.realtime.v1` envelope, consumes only `live_reading.updated` for tracked `(unitId, canonicalTagId)` slots, ignores `telemetry.reading.accepted`, and invalidates the F4.5G.1 trend cache on reconnect so REST stays the canonical resync. `<LiveCommunicationHealthPanel>`'s `Backend WebSocket` row is the only UI surface that changes — it now reflects the F4 socket's true state instead of the static `NOT CONNECTED` placeholder. No backend code, no Prisma schema, no migration, no ingestion / projection / alarm / realtime / trend behavior, and no other Operations panel or other screen is touched.

## 2. Scope Implemented

- **New F4-aware realtime hook** at `apps/web/lib/hooks/useOperationsRealtimeF4.ts`. Returns `{ enabled, connection, source, lastEventReceivedAt, slots, alarmEventsSeen, getSlotValue }`. Subscribes to `tenant:<tenantId>` on mount; unsubscribes on unmount. Connection state derives from the existing `RealtimeProvider` `useRealtime().state`.
- **Per-event consumption policy** per F4.5G.2-0 §8: `live_reading.updated` is the primary kind; `telemetry.reading.accepted` is **ignored** to avoid double-counting against the `good_only` projection; `alarm.event.created` increments a counter only — **no browser-side threshold comparison**.
- **`<LiveCommunicationHealthPanel>` F4 row update** at `apps/web/components/operations/LiveCommunicationHealthPanel.tsx`. The static `Backend WebSocket: NOT CONNECTED` row is replaced by a hook-driven label: `NOT CONNECTED · MOCK MODE` / `CONNECTING` / `CONNECTED · F4.6E.1` / `RECONNECTING (attempt N)` / `DISCONNECTED · LAST EVENT HH:MM:SS UTC`. No other row changes.
- **Reconnect invalidation seam** — on the first `'connected'` state transition that follows a `'reconnecting'` state, the hook calls `queryClient.invalidateQueries({ queryKey: ['f4-trends'] })`. F4.5G.1's `useOperationsTrendSeries` cache key shape (`['f4-trends', unitId, canonicalTagName, window, …]`) is reused unchanged.
- **UUID / mock-ID guardrail** per F4.5G.2-0 §9: a strict UUID-shape predicate (`isUuidShaped`) gates both the tenant subscription (a non-UUID `tenantId` keeps the hook disabled — no emit ever leaves the browser) and the per-slot filter (slots whose `unitId` or `canonicalTagId` is not UUID-shaped are skipped — simulator strings like `EMMAD-01` / `EMMAD-02` / `PSK-03` from `OPERATIONS_JOBS` never reach the backend).
- **`isUuidShaped` predicate** exported alongside the hook so consumers can pre-filter slots without re-implementing the regex.
- **Hook barrel export** at `apps/web/lib/hooks/index.ts` adds the new symbol and types.
- **Tests** — 18 new frontend tests across two new spec files (see §9). Total frontend tests **375/375** (+19 vs the F4.5G.1 baseline of 356). Existing F4.5G.1 chart pair tests stay green unchanged.

## 3. Architecture Decision

- **Realtime is delivery, not source of truth.** The chart's history continues to come from F4.6F.1 REST reads through `useOperationsTrendSeries`; realtime is a tail / freshness notification path. On reconnect, the cache is invalidated and REST refetches — there is no replay buffer, no last-event-id, and the hook never builds history out of realtime events.
- **Browser does not evaluate alarms.** `alarm.event.created` increments a counter; the hook never compares values against thresholds. ADR-005 invariant preserved.
- **Non-UUID simulator IDs never reach the backend.** A regex gate runs before every backend-bound emit. The browser does not invent or coerce identifiers to make a backend call possible.
- **F4.5G.1 chart path remains stable.** `useOperationsTrendSeries`, `<LiveTrendsPanelLive>`, `<TrendDrawer>`, and `trendsToChartSeries` are all unchanged. The cache key shape is the contract; the new hook only invalidates it.
- **Latest-value REST API remains deferred** (candidate F4.6C.2). Tile primary values continue to render from the F2 simulator path until either F4.6C.2 lands or a backend-job-selection follow-up resolves the §9 UUID gap.
- **No `packages/types/`, `socket.ts`, `RealtimeProvider.tsx`, or `TelemetryStore` change.** The hook composes the existing surfaces; the F2 store is intentionally left untouched because its `(jobId, tag)` key cannot align with the F4 envelope's `(unitId, canonicalTagId)` UUIDs.

## 4. Files Changed

| Path | Action | Notes |
|---|---|---|
| `apps/web/lib/hooks/useOperationsRealtimeF4.ts` | **New.** | F4-aware realtime hook. Composes `useRealtime().client`; opens a tenant-scoped Socket.IO subscription when `isApiSource() && isUuidShaped(tenantId)`; narrows on `rvf.realtime.v1` envelopes; per-slot view-model keyed by `${unitId}::${canonicalTagId}`; reconnect invalidation against `['f4-trends']`. Exports `isUuidShaped`, `TrackedSlot`, `SlotLiveValue`, `OperationsRealtimeSource`, `OperationsRealtimeConnection`, `UseOperationsRealtimeF4Input`, `UseOperationsRealtimeF4Result`. |
| `apps/web/lib/hooks/index.ts` | Modified | Re-exports the new hook + types. Order preserved. |
| `apps/web/components/operations/LiveCommunicationHealthPanel.tsx` | Modified | Only the `Backend WebSocket` row label / status is now hook-driven (`NOT CONNECTED · MOCK MODE` / `CONNECTING` / `CONNECTED · F4.6E.1` / `RECONNECTING (attempt N)` / `DISCONNECTED · LAST EVENT HH:MM:SS UTC`). Other rows (Normalized Stream, F2 Simulated Source, Field Protocols) unchanged. Added a small `formatHHMMSS` helper local to the file. |
| `apps/web/lib/hooks/useOperationsRealtimeF4.test.tsx` | **New.** | 13 tests covering: `isUuidShaped` predicate (3), mock-mode disabled (1), api-mode subscribe / unsubscribe (1), api-mode source label (1), non-UUID tenant gate (1), non-UUID slot ignored (1), mismatched-tenant event (1), older-timestamp dropped (1), `telemetry.reading.accepted` not consumed (1), `alarm.event.created` counter without evaluation (1), reconnect invalidation (1). |
| `apps/web/components/operations/LiveCommunicationHealthPanel.test.tsx` | **New.** | 6 tests covering: mock-mode label, connected label, reconnecting label, disconnected-with-timestamp label, disconnected-without-timestamp label, legacy rows preserved. |
| `docs/architecture/RVF_Malinois_F4_5G_2_1_Operations_Realtime_Tile_Status_Wiring_Closeout.md` | **New.** | This document. |

No other file modified. Explicitly:

- No file under `apps/backend/`.
- No `apps/backend/prisma/` change.
- No `packages/types/` change (F4.6E.1 envelope types remain available as-is).
- No `packages/ui/` change.
- No change to `apps/web/lib/realtime/{socket,RealtimeProvider,telemetryStore,ringBuffer}.ts`.
- No change to `apps/web/lib/telemetry/` (F2D adapter, simulator, store).
- No change to `apps/web/lib/api/f4/` or `apps/web/lib/api-data/f4/`.
- No change to `apps/web/lib/hooks/useOperationsTrendSeries.ts` (F4.5G.1 cache key contract).
- No change to `apps/web/components/operations/{TrendDrawer,LiveTrendsPanelLive,LiveActiveAlarmsPanel,LiveMultiphaseUnitCard,LiveVariableTile}.tsx`.
- No `docker-compose.yml`, root `package.json`, lockfile, `turbo.json`, `tsconfig*.json`, `.env*`, CI workflow, or `vitest.config.ts` change.
- No new env variable required (the F4.3 seed tenant UUID `00000000-0000-0000-0000-000000000001` is hardcoded as `DEFAULT_TENANT_ID` inside the new hook; a comment in the source links it back to the canonical seed reference in `mock-fixtures.ts`).

## 5. Realtime Event Policy

| Event kind | Consumed? | Behavior |
|---|---|---|
| `telemetry.reading.accepted` | **No** | Intentionally ignored. No named listener; the `onAny` fallback drops the kind on the floor. Reasoning: this event fires for every accepted reading regardless of quality; consuming it alongside `live_reading.updated` would double-count `good`-quality samples and conflict with the `good_only` policy that gates the projection. A future audit / forensics surface that needs every accepted sample (any quality) consumes this kind explicitly. |
| `live_reading.updated` | **Yes (primary)** | Updates the per-`(unitId, canonicalTagId)` view-model when: (a) the payload's `tenantId` matches the subscribed tenant, (b) the slot is in the tracked set, and (c) the payload's `timestamp` is strictly newer than the slot's last. Otherwise dropped. Slot view-model fields: `{ value, engineeringUnit, timestamp, ingestionTimestamp, receivedAt }`. `lastEventReceivedAt` is bumped on every accepted update. |
| `alarm.event.created` | **Yes (count only)** | Increments `alarmEventsSeen` and bumps `lastEventReceivedAt`. **No browser-side threshold evaluation.** No value compare. No alarm-state derivation. The counter is intentionally narrow — it serves as a forward-compat seam for a future status-badge / annotation phase (candidate F4.5G.3). |

**Mismatched / older event behavior:**
- Mismatched `tenantId` → dropped.
- Slot not in the tracked set → dropped.
- Timestamp `<= existing slot timestamp` → dropped (defends against late arrivals reordering the view-model).
- Envelope failing the `rvf.realtime.v1` discriminator (or `kind` enum) → dropped.

**Reconnect behavior:** `useEffect` watches `useRealtime().state`. On `'reconnecting'`, a `wasReconnectingRef` flag is set; on the next `'connected'`, the flag clears and `queryClient.invalidateQueries({ queryKey: ['f4-trends'] })` fires exactly once. The mini chart and `<TrendDrawer>` then refetch through the F4.5G.1 trend hook against the F4.6F.1 REST surface — REST is the canonical resync, never a replay buffer.

## 6. UUID / Mock-ID Guardrail

Repo evidence:
- `OPERATIONS_JOBS[i].job.unitId` resolves to simulator catalog strings (`EMMAD-01` / `EMMAD-02` / `PSK-03`) from `apps/web/lib/catalog/units.mock.ts`.
- F4.6E.1 envelopes carry backend UUIDs for `tenantId` / `unitId` / `canonicalTagId` (per `packages/types/src/realtime.ts`).
- The backend trend API and the gateway subscribe handler reject non-UUID identifiers (Zod refines / type contracts).

Implementation:
- **Regex predicate** `UUID_RE` matches the canonical lower-case hex-with-dashes shape; `isUuidShaped(value)` is exported for callers.
- **Tenant gate.** The hook only opens the subscription when `isApiSource() && isUuidShaped(tenantId)`. A non-UUID tenant keeps the hook disabled (`enabled: false`, `connection.kind === 'disabled'`, `source === 'mock'`); **no `subscribe` emit ever leaves the browser**.
- **Slot gate.** The internal slot index is built with `isUuidShaped(unitId) && isUuidShaped(canonicalTagId)` so non-UUID slots are silently dropped at hook init. Events for those slots can never match the index — defense in depth on top of the tenant gate.
- **No identifier coercion.** The hook never modifies a slot identifier, never invents UUIDs for simulator strings, and never falls through to a non-UUID call.

Deferred:
- Backend unit selection (mapping simulator catalog strings to backend `MeasurementUnit.id` UUIDs) is intentionally **not** introduced by F4.5G.2.1 — it is the right place for the future Operations job-selection redesign or a small unit-resolver hook paired with candidate F4.6C.2. F4.5G.2.1's contract is "ship the connection + reconnect-invalidation honestly; leave the identifier-resolution problem for the phase that owns it."

## 7. UI / UX Behavior

### `<LiveCommunicationHealthPanel>` — `Backend WebSocket` row

| Hook state | Row label | Row dot |
|---|---|---|
| Disabled (mock mode or non-UUID tenant) | `NOT CONNECTED · MOCK MODE` | stale (gray) |
| `connecting` | `CONNECTING` | warn (amber) |
| `connected` | `CONNECTED · F4.6E.1` | normal (green) |
| `reconnecting` | `RECONNECTING (attempt N)` | warn (amber) |
| `disconnected` with `lastDataAt` | `DISCONNECTED · LAST EVENT HH:MM:SS UTC` | stale (gray) |
| `disconnected` without `lastDataAt` | `DISCONNECTED` | stale (gray) |

Other rows (Normalized Stream, F2 Simulated Source, Field Protocols) are byte-equivalent to the F4.5G.1 baseline.

### Tile / chart UI

- `<LiveVariableTile>` / `<LiveMultiphaseUnitCard>` continue to render from the F2 simulator path. F4.5G.2.1 does **not** ship a per-tile "last live HH:MM:SS" chip — the §10 / §12 optional decoration is deferred to a future phase rather than disrupt the F2 visual baseline.
- `<LiveTrendsPanelLive>` and `<TrendDrawer>` are unchanged. On reconnect, the trend cache invalidation causes a transparent refetch; the chart stays visible during the gap because TanStack Query keeps the previous data as `isPlaceholderData`.
- `<LiveActiveAlarmsPanel>` is unchanged and continues to evaluate alarms in the browser against the F2 simulator path. Its migration to the server-evaluated `alarm.event.created` path is owned by candidate F4.6D.2 + a follow-up frontend phase.

### Disconnected / reconnecting

The F4 row carries the only honest signal for the F4.6E.1 socket. Tiles do not stale-flip on F4 disconnect because they do not depend on the F4 socket in this phase — they depend on the F2 simulator path. When F4.5G.2.2 (or a future phase) flips a tile to consume realtime as its primary source, the freshness label will need to follow the F4 row's state.

## 8. API / Backend Impact

**Zero backend impact.** F4.5G.2.1 is entirely frontend:

- No `apps/backend/` change.
- No schema / migration / seed change.
- No new REST endpoint.
- No new realtime emit kind, room topology, or schema bump.
- No latest-value API.
- No alarm read API.
- No `packages/types/` change — F4.6E.1 envelope types are consumed as-is.
- No new env variable.
- No new dependency.

## 9. Tests / Validation

### 9.1 Frontend tests added

| File | Added | Notes |
|---|---|---|
| `apps/web/lib/hooks/useOperationsRealtimeF4.test.tsx` | +13 | `isUuidShaped` predicate (3); mock-mode disabled; api-mode subscribe / unsubscribe; api-mode source label; non-UUID tenant guardrail; non-UUID slot dropped; mismatched-tenant event; older-timestamp dropped; `telemetry.reading.accepted` not consumed; `alarm.event.created` counter without evaluation; reconnect invalidation. |
| `apps/web/components/operations/LiveCommunicationHealthPanel.test.tsx` | +6 | Mock-mode label; connected label; reconnecting label; disconnected-with-timestamp; disconnected-without-timestamp; legacy rows preserved. |

### 9.2 Test counts

| Metric | Before F4.5G.2.1 (`1d0f659`) | After F4.5G.2.1 |
|---|---|---|
| Backend tests | 195 / 195 | **195 / 195** (no backend change; not rerun this phase) |
| Frontend tests | 356 / 356 | **375 / 375** (+19 new across 2 new spec files) |

### 9.3 Validation commands run

- `pnpm --filter @rvf/web run lint` — clean (0 warnings, 0 errors).
- `pnpm --filter @rvf/web run typecheck` — clean.
- `pnpm --filter @rvf/web run test` — **40 files / 375 tests passing**.
- `pnpm --filter @rvf/web run build` — Next.js prod build green; `/operations` route unchanged at 9.6 kB.

## 10. Known Limitations / Deferred Work

- **Latest-value REST API deferred to candidate F4.6C.2.** Tile primary values continue to render from the F2 simulator path. F4.5G.2.1 does not abuse the trend endpoint as a latest-value API; the realtime hook's `slots` view-model holds the most recent value per `(unitId, canonicalTagId)` for slots that are UUID-shaped, but no UI surface in F4.5G.2.1 actually binds to it yet — it is the seam future tile migration will read.
- **Alarm Events Read API deferred to candidate F4.6D.2.** `<LiveActiveAlarmsPanel>` continues to call `evaluateReading(...)` in the browser against the F2 simulator path. Once F4.6D.2 lands, a follow-up frontend phase migrates the panel to consume server-evaluated `alarm_events` and `alarm.event.created` envelopes — the realtime hook already counts the latter as the forward-compat seam.
- **Browser-side `<LiveActiveAlarmsPanel>` evaluation still requires future migration** for the api-mode path to be fully ADR-005-clean. F4.5G.2.1 leaves this intact because the F2 simulator path is the only data source that reaches the panel today, and migrating it requires (a) a backend read API and (b) the alarm-lifecycle UI deferred to candidate F4.6D.3.
- **Non-telemetry screens (Wells / Equipment / Catalog / Tags / Settings / Reports) deferred to candidate F4.5H.** No change.
- **Full chart realtime tail deferred.** The chart still refreshes through TanStack Query's `refetchInterval` (30 s mini / 60 s drawer) — F4.5G.2.1's reconnect-invalidation only triggers on reconnect, not on every `live_reading.updated`. Appending realtime points to the rendered chart series is a candidate F4.5G.2.2 follow-up if profiling shows the 30-second refetch is too coarse in practice.
- **Alarm chart annotations deferred to candidate F4.5G.3.** The realtime hook's `alarmEventsSeen` counter is the forward-compat seam.
- **Backend unit selection / UUID resolver deferred.** Until simulator job snapshots (`OPERATIONS_JOBS`) carry backend `MeasurementUnit.id` UUIDs (or an `(catalogCode → UUID)` resolver lands), the per-slot realtime view-model in F4.5G.2.1 is dormant against the simulator-string `unitId`s — by design, per the §9 guardrail. The F4 connection-health row works in all modes.
- **Per-tile "last live HH:MM:SS" chip** suggested as optional in F4.5G.2-0 §12.2 is **not shipped** — the §13 advice was to defer if it risks disturbing the F2 visual baseline. The realtime hook's `slots` map and `getSlotValue` helper expose the data so a future phase can render it without changing the hook contract.
- **Auth / rate limiting** inherited project-wide no-auth posture; not introduced.

## 11. Acceptance Criteria

F4.5G.2-0 §16 criteria — confirmed:

- [x] New `useOperationsRealtimeF4` hook at `apps/web/lib/hooks/useOperationsRealtimeF4.ts`. Composes the existing `useRealtime().client`; does not modify `socket.ts` or `RealtimeProvider.tsx`.
- [x] In api mode with a UUID-shaped `tenantId`, the hook emits `subscribe { tenantId }` exactly once on mount and `unsubscribe { tenantId }` on unmount.
- [x] In mock mode (default), the hook stays disabled — no `subscribe` emit; no listeners attached.
- [x] `live_reading.updated` for tracked `(unitId, canonicalTagId)` pairs updates the hook's view-model; mismatched / older / cross-tenant events are ignored.
- [x] `telemetry.reading.accepted` is **not** consumed by the hook.
- [x] `alarm.event.created` does not trigger browser-side threshold comparison; only a counter increments.
- [x] Reconnect (`'connected'` after `'reconnecting'`) triggers exactly one `queryClient.invalidateQueries({ queryKey: ['f4-trends'] })`. F4.5G.1 cache key unchanged.
- [x] `<LiveCommunicationHealthPanel>` renders an honest F4 row in every state.
- [x] UUID-shape predicate enforced: non-UUID `tenantId` keeps the hook disabled; non-UUID slots never receive realtime updates.
- [x] F4.5G.1 chart pair renders unchanged — `useOperationsTrendSeries`, `<LiveTrendsPanelLive>`, `<TrendDrawer>`, and existing tests all green.
- [x] No screen migration beyond `<LiveCommunicationHealthPanel>` F4 row + the new hook.
- [x] No backend change; no Prisma / migration / seed change; no `packages/types/` change; no `docker-compose.yml` / root `package.json` / lockfile / `turbo.json` / `tsconfig*.json` / `.env*` / CI change.
- [x] No new env variable required (`DEFAULT_TENANT_ID` is hardcoded in the hook).
- [x] No browser-side alarm evaluation.
- [x] Source / freshness labeling never silently presents mock data as live (per §11 of the plan).
- [x] Tests added per F4.5G.2-0 §14.1; **+19** new frontend tests (above the 10–16 estimate; the predicate + reconnect-invalidation suites added a few extra cases). Existing tests 356/356 + 195/195 backend stay green unchanged.
- [x] DX-3 §"Runtime phases" validation passes: `lint --max-warnings 0` / `typecheck` / `build` / `test` for `@rvf/web` all green.
- [x] F4.5G.2.1 closeout exists at the agreed path; reports the final test count and names the deferrals.
- [ ] Master roadmap §3 / §7 refresh — recommended as a separate small hygiene commit per the established pattern (`121803d` post-F4.5G-0, `cafccb6` post-F4.5G.1, `1d0f659` post-F4.5G.2-0); see §12 below.

## 12. Recommended Next Step

Land the master roadmap hygiene update as a separate small commit (matches the precedent of every prior phase closeout): mark F4.5G.2.1 as **Closed** at the implementation commit, advance the "next phase" pointer, and identify the next deliverable from the candidates locked by F4.5G.2-0 §17:

- **Candidate F4.5G.3 — Alarm chart annotations.** Wires `alarm.event.created` overlays into `<TrendChart>` / `<TrendDrawer>`. Browser does not evaluate; consumes server-evaluated events only. Builds on the `alarmEventsSeen` seam introduced here.
- **Candidate F4.6C.2 — Latest-value Read API.** Public `GET /api/v1/telemetry/latest` over `live_readings`. Pairs naturally with a small unit-resolver hook to close the §9 UUID gap and unblock primary-source tile migration.
- **Candidate F4.6D.2 — Alarm Events Read API.** Public read surface over `alarm_events`; unblocks `<LiveActiveAlarmsPanel>` migration off its browser-side `evaluateReading` path.
- **Candidate F4.5H — Non-telemetry screen adapter wiring.** Per-screen migrations for Wells / Equipment / Catalog / Tags / Settings / Reports off the F3 mock adapter.

Recommendation: **Candidate F4.6C.2 — Latest-value Read API** is the natural next *backend* step — it pairs with a small unit-resolver hook to make the F4.5G.2.1 per-slot view-model actually drive a tile in api mode. **Candidate F4.5G.3 — Alarm chart annotations** is the natural next *frontend* step if the team prefers to stay in the Operations track. Either is a reasonable pick; **Candidate F4.6D.2** is a good third option if `<LiveActiveAlarmsPanel>`'s browser-side evaluation is the highest-leverage cleanup. **Candidate F4.5H** is the right pick if the priority is breadth (more screens off the F3 mock adapter) over depth.

---

*F4.5G.2.1 closeout, authored at HEAD `1d0f659`. Implementation lives at the next commit pending review. Update on phase close (`Current` → `Closed` with commit hash) once committed.*
