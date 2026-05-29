# RVF Malinois — F4.6D.2.1 Alarm Events Read API Closeout

> Phase **F4.6D.2.1 — Alarm Events Read API Implementation**. Implements the plan locked in F4.6D.2-0 against repository HEAD `10102bc` (Refresh master roadmap after F4.6D.2-0).
>
> Upstream references:
> - F4.6D.2-0 plan: `docs/architecture/RVF_Malinois_F4_6D_2_Alarm_Events_Read_API_Plan.md` (commit `53df3cc`).
> - F4.6D.1 closeout (the evaluator that wrote the rows this phase exposes): `docs/architecture/RVF_Malinois_F4_6D_1_Alarm_Evaluation_Boundary_Closeout.md` (commit `d35a2b8`).
> - F4.6E.1 closeout (the realtime push that complements this read API): `docs/architecture/RVF_Malinois_F4_6E_1_WebSocket_SSE_Fan_Out_Closeout.md` (commit `51dc626`).
> - F4.6C.2.1 closeout (the precedent for adapter-only frontend phases; this phase mirrors its narrowing posture): `docs/architecture/RVF_Malinois_F4_6C_2_1_Latest_Value_Read_API_Closeout.md` (commit `acd68d5`).
> - F4.6F.1 closeout (the trend API contract this phase also mirrors): `docs/architecture/RVF_Malinois_F4_6F_1_Historical_Trend_API_Closeout.md` (commit `946a023`).
> - ADR-005 (browser boundary; the browser does **not** evaluate alarms; "never lie about freshness").

## 1. Purpose

F4.6D.2.1 implements the Alarm Events Read API defined in F4.6D.2-0. F4.6D.1 (`d35a2b8`) has been writing server-evaluated `alarm_events` rows transactionally since the alarm-evaluation boundary landed, but **no read API exposed them** — `<LiveActiveAlarmsPanel>` continued to evaluate alarms in the browser against the F2 simulator path (an ADR-005 violation). This phase introduces the canonical pull surface — a small NestJS controller / service / Zod contract over `alarm_events` plus the matching frontend dual-mode adapter — so a future panel migration phase can consume server-evaluated `severity` / `state` / `thresholdViolated` directly without re-implementing threshold comparison client-side.

The new `AlarmEventsReadService` is the **second** backend collaborator authorized to touch `prisma.alarmEvent.*` — **read-only**. F4.6D.1's `AlarmEvaluationService` remains the only writer. The write-isolation invariant is preserved via a new isolation test on the read service and a narrowing-of-intent update on the ingestion-spec test #18.

No `<LiveActiveAlarmsPanel>` migration, no chart annotations, no alarm lifecycle transitions, no schema / migration / seed change — exactly the scope F4.6D.2-0 §7 locked.

## 2. Scope Implemented

### 2.1 Backend

- **New `AlarmEventsQuerySchema`** at `apps/backend/src/alarms/contracts/events.ts`. All parameters optional. Defaults: `state='active'` (operator-meaningful; matches F4.6D.1's current write set) and `limit=100` (max 500). Refines: `canonicalTagId` ↔ `canonicalTagName` XOR; `from` ↔ `to` both-or-neither with `from < to`; `.strict()` rejection of unknown fields. Enums mirror the F4.6A.1 CHECK constraints: `state` ∈ `{active, acknowledged, cleared}`; `severity` ∈ `{info, warning, critical}`; `thresholdViolated` ∈ `{low_low, low, high, high_high}`.
- **New `AlarmEventsReadService`** at `apps/backend/src/alarms/alarm-events-read.service.ts`. Reads `prisma.alarmEvent.findMany` with `tenantId` filter when `ctx.tenantId` is set; orders by `firstTriggeredAt DESC`; applies the optional `unitId` / `canonicalTagId` / `severity` / time-window filters; takes `limit`. The `canonicalTagName` path resolves via the existing `CanonicalTagResolver` (mirrors latest / trends). Decimal `triggeredValue` passes through untouched (JSON-serializes to a string). State / severity / threshold-band fields are narrowed defensively against their typed unions; an unknown stored value falls through to a known default rather than leaking an opaque string (mirrors F4.6C.2.1's `narrowQuality` posture).
- **New `AlarmsController`** at `apps/backend/src/alarms/alarms.controller.ts`. Carries `@Get('events')` under controller base path `/alarms` — final route `GET /api/v1/alarms/events`. Full Swagger decorators (`@ApiTags('alarms')`, `@ApiOperation`, per-parameter `@ApiQuery`). Wires `ZodValidationPipe(AlarmEventsQuerySchema)` and passes `SystemContext` to the service (matches F4.6F.1 / F4.6C.2.1 — no auth surface in F4.6D.2.1; the seam stays clean for ADR-009).
- **New `AlarmsModule`** at `apps/backend/src/alarms/alarms.module.ts`. Imports `TelemetryModule` to reuse the existing `CanonicalTagResolver`. Provides + exports `AlarmEventsReadService`; declares `AlarmsController`. Intentionally does **not** re-register `AlarmEvaluationService` — F4.6D.1's evaluator remains provided by `TelemetryIngestionModule` so the ingestion transaction injects it directly (plan §6.2 named this as a deliberate decision to avoid churn against F4.6D.1's existing wiring and tests).
- **`AppModule` wiring** at `apps/backend/src/app.module.ts` adds `AlarmsModule` to the `imports` array — small additive change.
- **Ingestion-spec test #18 intent narrowing.** `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` test #18 comment + label rewritten from "does not call `prisma.alarmEvent.*`" to "does not **write** `prisma.alarmEvent.*`" to reflect that read access at the module level is now permitted (the new `AlarmEventsReadService` is the second authorized accessor — read-only). Assertions themselves are unchanged: the ingestion service still never touches `alarmEvent.create` / `findFirst` / `alarmRule.findMany` directly.

### 2.2 Frontend (adapter + types only — no UI migration)

- **New types** in `apps/web/lib/api/f4/types.ts`: `AlarmEventState`, `AlarmEventSeverity`, `AlarmEventThresholdBand`, `AlarmEventRow`, `AlarmEventsResponse`. The wire shape is a derived view (`alarmEventId` rename, nested `canonicalTag` summary, lifecycle nullables present for forward compatibility). `tenantId` / `ruleSnapshot` / `createdAt` / `updatedAt` / `jobId` are **not** on the wire.
- **New typed endpoint wrapper** `getAlarmEvents(params: GetAlarmEventsParams)` in `apps/web/lib/api/f4/endpoints.ts`. Delegates to `getJson<AlarmEventsResponse>('/alarms/events', params, options)`.
- **New dual-mode adapter** `adapterGetAlarmEvents` at `apps/web/lib/api-data/f4/alarms.ts`. Mock branch resolves from `MOCK_F4_ALARM_EVENTS`; api branch delegates to the typed wrapper. Mock-mode mirrors all backend refines (XOR on tag identifiers, `from`/`to` both-or-neither with `from < to`); applies all filter combinations (`state`, `unitId`, `canonicalTagId`/`Name`, `severity`, time window, `limit`); orders results `firstTriggeredAt DESC`. Empty envelope for unknown unit / unknown tag (matches the F4.4F empty-array posture).
- **New mock fixture** `MOCK_F4_ALARM_EVENTS` in `apps/web/lib/api-data/f4/mock-fixtures.ts`. HP-001 carries one `active` `warning` event on `p_inlet` (synthetic `triggeredValue: '4612.0'` above the seeded `4500` warning-high threshold; `alarmRuleId` computed via the same `hashSuffix` helper that seeds the alarm rule); LP-001 carries an empty array. Narrow set on purpose — F4.6D.2.1 is a backend + adapter phase, not a fixture-coverage phase.
- **Barrel re-exports** updated in `apps/web/lib/api/f4/index.ts` and `apps/web/lib/api-data/f4/index.ts` so consumers import from a single location.

### 2.3 Out of scope — preserved

- **No `<LiveActiveAlarmsPanel>` UI migration.** The panel continues to render from the F2 simulator path. The adapter exists, is testable, but no `apps/web/components/operations/` file consumes it. A separate follow-up phase will bind the panel.
- **No alarm chart annotations** on `<TrendChart>` / `<TrendDrawer>`. Candidate F4.5G.3.
- **No alarm lifecycle transitions.** F4.6D.2.1 is read-only — no POST / PUT / PATCH endpoint on the new controller. Candidate F4.6D.3.
- **No schema / migration / seed change.** `alarm_events` table exists since F4.6A.1; existing `alarm_events_unit_time_idx` / `alarm_events_tenant_idx` cover the access path.
- **No `packages/types/` change. No new env variable. No new dependency.**
- **No auth / rate limiting.** Inherits no-auth posture; the service seam (`async query(ctx: CallerContext, …)`) stays clean for ADR-009.

## 3. Architecture Decisions

- **`alarm_events` is the source of truth.** F4.6D.2.1 reads only the canonical table. Realtime (`alarm.event.created` from F4.6E.1) is tail / notification, not durable hydration; the read API is the canonical answer to "what alarm events exist for this tenant / unit / window?". A future panel migration composes REST hydration + realtime append + reconnect invalidate — same posture as F4.5G.2.2.1's tile-side pattern.
- **Wire envelope is a derived view, not a row dump.** `id` is renamed to `alarmEventId` (matches the F4.6E.1 envelope's `payload.alarmEventId`, so a future panel can dedup REST + realtime entries by id). `canonicalTag` is hydrated into the same nested summary the trends / latest APIs return. `tenantId` / `ruleSnapshot` / `createdAt` / `updatedAt` / `jobId` are stripped. Lifecycle columns surface as `null` so F4.6D.3 can land lifecycle transitions without an additive contract bump.
- **`ruleSnapshot` is intentionally NOT on the wire.** Exposing the raw JSONB (thresholds, deadband, delay_seconds, message_template) would invite browser-side threshold re-interpretation — exactly the ADR-005 violation this API exists to prevent. A future `thresholdContext` derived field can be added additively if a consumer demands "value is 4612 vs. 4500 warning-high limit" copy.
- **Defaults are operator-meaningful.** `state` defaults to `'active'` (the open alarms the operator wants by default; matches F4.6D.1's current write set). `limit` defaults to `100`, max `500` — smaller than F4.6F.1's `5000` because alarm panels are operator-visible, not a programmatic API.
- **No-fake-ID rule.** The mock-mode `alarmRuleId` is computed via the same `hashSuffix` helper that seeds the mock alarm rules under `buildAlarmRules`, so a future UI consumer joining the event back to its rule sees the same id in both modes. No `Record<string, string>` translation table.
- **Tenant scoping is server-derived, not on the wire.** `AlarmEventsQuerySchema` has no `tenantId` field; `.strict()` rejects it. Cross-tenant reads are possible today only because no auth exists; the seam is identical to F4.4F / F4.6F.1 / F4.6C.2.1.
- **Write-isolation invariant preserved.** F4.6D.1's `AlarmEvaluationService` remains the only writer. The read service's spec includes an explicit assertion that `create` / `update` / `updateMany` / `upsert` / `delete` are never called. The ingestion-spec test #18 intent narrowing makes clear that reads are now permitted at the module level (the new read service), but writes are still forbidden everywhere except the evaluator.

## 4. Files Changed

### Backend (new + modified)

| Path | Action | Notes |
|---|---|---|
| `apps/backend/src/alarms/contracts/events.ts` | **New.** | Zod schema + types. Enums, refines (XOR, both-or-neither, `from < to`, `.strict()`), defaults (`state='active'`, `limit=100`). Constants `ALARM_EVENTS_LIMIT_DEFAULT` / `ALARM_EVENTS_LIMIT_MAX`. |
| `apps/backend/src/alarms/alarm-events-read.service.ts` | **New.** | Read-only `findMany` against `prisma.alarmEvent`. Tenant-scoping seam, time-window filter, `select` matching the response shape exactly, defensive narrowing for `severity` / `state` / `thresholdViolated`. |
| `apps/backend/src/alarms/alarm-events-read.service.spec.ts` | **New.** | 26 service tests + 17 Zod tests = 43 new backend tests. Covers empty envelope, default `state`, every filter individually + combined, tenant scoping (set + unset), select / orderBy / take shape, response shape stability, Decimal passthrough, lifecycle null, source / generatedAt invariants, defensive narrowing, isolation (no writes). Zod block covers acceptance / rejection of each refine. |
| `apps/backend/src/alarms/alarms.controller.ts` | **New.** | `@Get('events')` under `/alarms`. Full Swagger decorators. `ZodValidationPipe(AlarmEventsQuerySchema)`; passes `SystemContext` to the service. |
| `apps/backend/src/alarms/alarms.module.ts` | **New.** | Imports `TelemetryModule` (for `CanonicalTagResolver`); provides + exports `AlarmEventsReadService`; declares `AlarmsController`. Header comment documents the F4.6D.1 evaluator's continued registration in `TelemetryIngestionModule`. |
| `apps/backend/src/app.module.ts` | Modified | Adds `AlarmsModule` import + registration. |
| `apps/backend/src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` | Modified | Test #18 intent narrowing — comment + label rewritten from "does not call" to "does not **write**" so the invariant accurately names what it protects post-F4.6D.2.1. Assertions unchanged. |

### Frontend (new + modified)

| Path | Action | Notes |
|---|---|---|
| `apps/web/lib/api/f4/types.ts` | Modified | New types appended: `AlarmEventState`, `AlarmEventSeverity`, `AlarmEventThresholdBand`, `AlarmEventRow`, `AlarmEventsResponse`. |
| `apps/web/lib/api/f4/endpoints.ts` | Modified | New `GetAlarmEventsParams` + `getAlarmEvents` wrapper. |
| `apps/web/lib/api/f4/index.ts` | Modified | Barrel adds the new types + endpoint export. |
| `apps/web/lib/api-data/f4/alarms.ts` | **New.** | `adapterGetAlarmEvents` dual-mode adapter. Mock branch mirrors all backend refines + filters; api branch delegates. |
| `apps/web/lib/api-data/f4/alarms.test.ts` | **New.** | 14 mock-mode tests + 6 api-mode tests = 20 new frontend adapter tests. Covers default state, every filter, XOR / time-range rejections, empty envelopes, URL composition, 400 surfacing as `RvfApiError`. |
| `apps/web/lib/api-data/f4/mock-fixtures.ts` | Modified | Adds `MOCK_F4_ALARM_EVENTS` keyed by `MeasurementUnit.id`. HP-001 → one `active` `warning` event on `p_inlet`; LP-001 → empty. `alarmRuleId` matches the seeded rule via shared `hashSuffix`. |
| `apps/web/lib/api-data/f4/index.ts` | Modified | Barrel adds the new adapter + types + fixture export. |
| `docs/architecture/RVF_Malinois_F4_6D_2_1_Alarm_Events_Read_API_Closeout.md` | **New.** | This document. |

Explicitly **NOT** changed:

- No file under `apps/backend/prisma/` (schema / migrations / seed unchanged).
- No file under `apps/backend/src/telemetry/` runtime (only the ingestion-spec test #18 intent narrowing).
- No file under `apps/backend/src/alarms/alarm-evaluation.service.ts` (F4.6D.1 contract is binding).
- No file under `apps/backend/src/realtime/` (no new realtime emit kind — F4.6E.1's `alarm.event.created` is sufficient; lifecycle envelopes belong to F4.6D.3).
- No file under `apps/web/components/operations/` (no panel migration).
- No file under `apps/web/lib/hooks/` (no UI consumer wired in F4.6D.2.1).
- No `packages/types/` change. No `packages/ui/` change.
- No `docker-compose.yml`, root `package.json`, lockfile, `turbo.json`, `tsconfig*.json`, `.env*`, CI workflow, or `vitest.config.ts` change.

## 5. Tests

Pre-change baseline at commit `10102bc`:
- Backend: 217 / 217.
- Frontend: 458 / 458.

After F4.6D.2.1:
- **Backend: 260 / 260** (+43 new tests).
- **Frontend: 480 / 480** (+22 new tests; 20 in the new adapter spec + 2 unrelated incidental count differences from the existing suite's drawer / panel tests that were re-counted after the F4.5G.2.2.2 commit landed).

| Backend test file | Prior | After | Delta | Notes |
|---|---:|---:|---:|---|
| `src/alarms/alarm-events-read.service.spec.ts` | 0 | 43 | +43 | New file. 26 service + 17 Zod tests per plan §16.1 / §16.2. |
| `src/telemetry/ingestion/telemetry-ingestion.service.spec.ts` | 23 | 23 | 0 | Test #18 intent narrowing only; assertions unchanged. |
| All other backend test files | 194 | 194 | 0 | Untouched. |
| **Backend total** | **217** | **260** | **+43** | All passing. |

| Frontend test file | Prior | After | Delta | Notes |
|---|---:|---:|---:|---|
| `lib/api-data/f4/alarms.test.ts` | 0 | 20 | +20 | New file. 14 mock + 6 api per plan §16.4. |
| All other frontend test files | 458 | 460 | +2 | Unchanged behaviorally — incidental run-count difference. |
| **Frontend total** | **458** | **480** | **+22** | All passing. |

Validation commands (per DX-3 §"Runtime phases"; all green):

```
pnpm --filter @rvf/backend run lint           # clean
pnpm --filter @rvf/backend run typecheck      # clean
pnpm --filter @rvf/backend run test           # 17 files, 260 tests
pnpm --filter @rvf/backend run build          # ✓ nest build

pnpm --filter @rvf/web run lint               # clean
pnpm --filter @rvf/web run typecheck          # clean
pnpm --filter @rvf/web run test               # 47 files, 480 tests
pnpm --filter @rvf/web run build              # ✓ compiled; /operations 11.4 kB
```

## 6. Acceptance Criteria — Mapped to Evidence

Each box from F4.6D.2-0 §18:

- [x] **`GET /api/v1/alarms/events`** exists on the new `AlarmsController` at `apps/backend/src/alarms/alarms.controller.ts`. Controller base path `/alarms`; method path `events`.
- [x] **New `AlarmsModule`** at `apps/backend/src/alarms/alarms.module.ts` registers the controller + read service; imports `TelemetryModule` (for `CanonicalTagResolver`). `apps/backend/src/app.module.ts` registers `AlarmsModule` additively.
- [x] **Zod schema** at `apps/backend/src/alarms/contracts/events.ts` enforces UUID on `unitId` / `canonicalTagId`, length 1..64 on `canonicalTagName`, enums on `state` / `severity`, time-range refines (`from`/`to` together, `from < to`), `limit` bound `1..500` default `100`, XOR between the two tag identifiers, and `.strict()` rejection of unknown fields. Errors surface as `400` via the existing `ZodValidationPipe`. Defaults: `state='active'`, `limit=100`.
- [x] **`AlarmEventsReadService`** reads `prisma.alarmEvent.findMany` with `tenantId` filter when `ctx.tenantId` is set; orders by `firstTriggeredAt DESC`; honors `unitId` / `canonicalTagId` / `severity` / `state` / time-window filters; takes `limit`.
- [x] **`CanonicalTagResolver`** used for the `canonicalTagName` path.
- [x] **Response envelope** matches §9.1 exactly: `{ generatedAt, source: 'alarm_events', state, events: AlarmEventRow[] }`. `tenantId` / `ruleSnapshot` / `createdAt` / `updatedAt` / `jobId` are **not** on the wire (asserted by spec).
- [x] **`triggeredValue` Decimal serialized to string**; timestamps ISO-8601.
- [x] **Empty response** returned for known tenant with no events, unknown unit, unknown canonical tag (asserted by spec + adapter test).
- [x] **Invalid UUID / unknown enum / bad time range / unknown field → 400**; field path in error.
- [x] **No schema / migration / seed change.**
- [x] **Write-isolation invariant preserved.** Ingestion-spec test #18 intent narrowed; new isolation test in `alarm-events-read.service.spec.ts` asserts the read service performs no writes.
- [x] **Frontend typed endpoint wrapper** `getAlarmEvents` + types added.
- [x] **Frontend dual-mode adapter** `adapterGetAlarmEvents` added; mock branch resolves from fixture, api branch delegates; XOR + time-range refines mirrored client-side.
- [x] **Mock fixtures** `MOCK_F4_ALARM_EVENTS` (HP-001 one active row, LP-001 empty).
- [x] **No `<LiveActiveAlarmsPanel>` UI migration.** No file under `apps/web/components/operations/` consumes the new adapter.
- [x] **No alarm chart annotations.** `<TrendChart>` / `<TrendDrawer>` untouched.
- [x] **No alarm lifecycle transitions.** No POST / PUT / PATCH endpoint added.
- [x] **No `packages/types/` change. No new env variable. No new dependency.**
- [x] **Backend +43 new tests; existing 217 stay green. Frontend +22 net; existing 458 baseline preserved.**
- [x] **DX-3 §"Runtime phases" validation** passes end-to-end for both packages.
- [x] **F4.6D.2.1 closeout** lives at the established path; reports final counts.
- [ ] **Master roadmap §3 / §7 refresh** — deferred to a follow-up hygiene commit per the established pattern (`121803d`, `e03fbfc`, `6ded9f1`, `10102bc`). The user owns that commit; this closeout does not touch the roadmap.

## 7. Operator / Consumer View

- **`GET /api/v1/alarms/events`** returns the operator's open alarms by default (`state='active'`), ordered newest-first, capped at 100 rows.
- **Per-unit drill:** `GET /api/v1/alarms/events?unitId={uuid}` for a Multiphase Unit card's active alarms.
- **Per-tag filter:** `?canonicalTagName=p_inlet` for a single variable's events; `canonicalTagId` UUID form supported equivalently.
- **Audit / history:** `?state=cleared` and `?from=…&to=…` for backwards-looking reads — empty today (F4.6D.1 writes only `active`), populated when F4.6D.3 ships lifecycle transitions.
- **Severity filter:** `?severity=critical` for a panicked-only view.
- **Wire honesty:** `source: 'alarm_events'` constant names the read source explicitly. `state` echoes the parsed query so the consumer can label "showing active events" without re-reading the query string.

The frontend adapter exposes the same shape with the same refines via `adapterGetAlarmEvents`. **No screen consumes it yet** — that's the next phase.

## 8. Constraints Honored

User / plan hard constraints, mapped to evidence:

- "**Do not modify backend code (other than the new files + intent-narrowing comment)**." — Only `app.module.ts`'s additive registration + the ingestion-spec test #18 comment label were touched outside the new `apps/backend/src/alarms/` directory.
- "**Do not modify Prisma schema or migrations.**" — No file under `apps/backend/prisma/` modified.
- "**Do not modify telemetry ingestion runtime, live_readings projection, alarm evaluation, realtime fan-out, trend API, latest-value API.**" — All untouched. `alarm-evaluation.service.ts` is byte-identical.
- "**Do not migrate `<LiveActiveAlarmsPanel>`.**" — `apps/web/components/operations/LiveActiveAlarmsPanel.tsx` untouched. No file under `apps/web/components/operations/` consumes the new adapter.
- "**Do not add alarm chart annotations.**" — `<TrendChart>` / `<TrendDrawer>` untouched.
- "**Do not introduce lifecycle transitions, alarm rule CRUD, or external integrations.**" — No POST / PUT / PATCH endpoints, no rule writes, no third-party bridges.
- "**No `Record<string, string>` mapping table.**" — Mock-mode `alarmRuleId` uses the same `hashSuffix` helper that seeds `buildAlarmRules`. No translation map.
- "**No new env variable, dependency, `packages/types/` change.**" — None introduced.

## 9. Deferred / Out of Scope (for the candidate sequence)

- **Operations `<LiveActiveAlarmsPanel>` migration to the new API.** Natural next step. Converts the new (currently dormant) adapter into a real consumer; removes the browser-side `evaluateReading(...)` call; applies the established ADR-005 source / freshness chip palette. Closes the last operator-visible browser-side alarm evaluation in the Operations screen.
- **F4.5G.3 — Alarm chart annotations.** Wires `alarm.event.created` realtime envelopes + this read API (for historical window context) as overlay markers on `<TrendChart>` / `<TrendDrawer>`. Browser does not evaluate; consumes server-evaluated `alarm_events` only.
- **F4.6D.3 — Alarm Lifecycle.** `active → acknowledged → cleared` transitions, dedup against open events, `audit_logs` writes per ADR-005. Introduces POST / PATCH endpoints, the matching realtime emit kinds (`alarm.event.acknowledged` / `alarm.event.cleared`), and the UI lifecycle pattern. Surfaces the `acknowledgedAt` / `acknowledgedBy` / `clearedAt` columns that F4.6D.2.1 already exposed on the wire as `null`.
- **F4.6D.4 — Stateful threshold semantics.** `deadband` / `delay_seconds` / rate-of-change. Evaluator-side change; this read API exposes the same `severity` / `state` / `thresholdViolated` fields with no contract change.
- **F4.5G.2.3 — Operations chart realtime tail.** Append `live_reading.updated` points to the rendered `<TrendChart>` series.
- **F4.5H — Non-telemetry screen adapter wiring.** Per-screen migrations for Wells / Equipment / Catalog / Tags / Settings / Reports.

None of these is committed to as part of F4.6D.2.1.

## 10. Next Steps

1. **User review** at `http://localhost:4000/api/docs` (Swagger) to confirm the new `/api/v1/alarms/events` route appears with the documented query parameters and defaults.
2. **Frontend smoke** via the test harness — the adapter spec asserts the URL composition; no UI binding exists yet.
3. **On acceptance:** master roadmap §3 / §7 refresh in a small follow-up hygiene commit (per the established pattern). The next implementation phase is the user's choice — the most natural follow-up is the **Operations `<LiveActiveAlarmsPanel>` migration** that converts the dormant adapter into a real consumer.

---

*F4.6D.2.1 closeout, authored at HEAD `10102bc` (Refresh master roadmap after F4.6D.2-0). Backend 217 → 260, frontend 458 → 480, lint / typecheck / build all green for both packages.*
