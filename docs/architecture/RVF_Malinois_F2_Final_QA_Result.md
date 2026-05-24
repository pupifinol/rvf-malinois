# RVF Malinois — F2 Final QA Result

> RVF Soluciones Energéticas C.A. — Confidential.
> Companion to `RVF_Malinois_F2_Closeout_Report_v1.0.md`. This document is
> the dated record of the regression / release-hardening pass that gates
> the F2 closeout tag (`v0.7-f2-closeout`).

## 1. Scope

QA-only pass over the F2 surface — **no product changes, no UI redesign,
no architecture changes**. Validates the four completed sub-phases:

| Sub-phase | Tag |
| --- | --- |
| F2A — Telemetry Domain Foundation | `v0.3-telemetry-foundation` |
| F2B — Live Operations UI | `v0.4-live-operations-ui` |
| F2C — Alarm Center Integration | `v0.5-alarm-center-integration` |
| F2D — Backend WebSocket Adapter | `v0.6-backend-websocket-adapter` |

## 2. Static validation

| Command | Result |
| --- | --- |
| `git status` (pre-QA) | clean, on `main`, HEAD `d6a693a` (Add F2 closeout report) |
| `pnpm --filter @rvf/web lint` | 0 errors, 0 warnings (`--max-warnings 0`) |
| `pnpm --filter @rvf/web typecheck` | `tsc --noEmit` clean |
| `pnpm --filter @rvf/web test` | **20 test files, 155/155 tests passing**, 1.7 s |
| `pnpm --filter @rvf/web build` | Compiled 2.2 s, 20/20 static pages, no warnings, no errors |

## 3. Browser smoke (Playwright on `pnpm next dev`)

A disposable smoke spec exercised every public route and validated the
F2 runtime invariants. **10/10 assertions passed**:

| Route | Heading | React-19 fatals | Notes |
| --- | --- | --- | --- |
| `/operations` | "Live Operations Overview" | ✅ none | Live tiles, runtime mounted, header alarm indicator updates |
| `/alarms` | "Alarm Center" | ✅ none | `useAlarmCenter` no loop, Active chip renders |
| `/units` | "Multiphase Unit #1" | ✅ none | Frozen catalog baseline preserved |
| `/sensors` | "Field Instrumentation Health" | ✅ none | Frozen baseline preserved |
| `/reports` | "Operational Reports" | ✅ none | Frozen baseline preserved |
| `/settings` | "Console Configuration" | ✅ none | Frozen baseline preserved |
| `/portal` | "Production Overview" | ✅ none | Crude/Gas/Water Cut charts render |

Additional runtime assertions:

- **Operations badge correctness.** After an 8-second simulator settle,
  `[data-card-status]` reports:
  - `JOB-HPHF-001` → `ALARM` (pressure exceeds `alarmHigh`)
  - `JOB-MP-001` → `TESTING` or `DEGRADED` (depending on which displayed
    tiles the snapshot covers — both acceptable per spec)
  - `JOB-STALE-001` → `OFFLINE` (every displayed tile is offline/no-data)

- **Client Portal alarm-free.** Locator counts for every forbidden term
  inside `/portal` are **zero**:
  `Alarm Center`, `Active Alarms`, `Acknowledge`, `Acknowledged`,
  `ISA-18.2`, `MQTT`, `Modbus`, `OPC-UA`, `Node-RED`, `ThingsBoard`,
  `Gateway Stick`, `Historian`.

The smoke spec was removed after the run (no permanent test surface
added).

## 4. Architecture compliance findings

### 4.1 Forbidden frontend protocols

| Term | Imports / package deps | Status |
| --- | --- | --- |
| `mqtt`, `modbus`, `opcua`, `opc-ua`, `plc`, `node-red`, `thingsboard`, `gateway stick`, `historian` | **0 imports**, **0 deps** in `package.json` | ✅ |

Code mentions exist but only as:
- UI labels in the **Settings** frozen baseline (`MQTT Broker`,
  `Node-RED Edge`, `Historian Database`, `ThingsBoard URL`) — displayed
  as static configuration fields, not active integrations.
- **Sensors** mock data lists `Modbus` as a source kind for display.
- **Units-twin** mock data lists protocol metadata with an explicit
  on-screen disclaimer: *"No MQTT / Modbus / OPC-UA / REST connection
  is active"*.
- **Catalog** page text references "Modbus registers" in the ADR-004
  mapping explanation.

All mentions are documentary; no frontend protocol implementation exists.

### 4.2 Singleton invariants

| Invariant | Result |
| --- | --- |
| Exactly one production `new TelemetryStore()` (the module-level singleton in `lib/realtime/telemetryStore.ts:210`) | ✅ |
| All other `new TelemetryStore()` occurrences are inside `*.test.ts` files or `scripts/sim-demo.ts` | ✅ |
| Exactly one runtime singleton — `operationsRuntime.ts`'s ref-counted handle — consumed by both `OperationsTelemetryRuntime.tsx` and `SharedTelemetryRuntime.tsx` | ✅ |
| Adapter construction happens **only** inside `lib/telemetry/adapterFactory.ts` (production) or `scripts/sim-demo.ts` (CLI) | ✅ |

### 4.3 ADR-005 Rule 1 — threshold provenance

- **Zero** references to `alarmHigh / alarmLow / warningHigh / warningLow / effectiveThresholds` anywhere under `components/units/`, `components/settings/`, `app/(rvf-console)/units/`, `app/(rvf-console)/settings/`.
- Every code path that produces or validates an alarm result carries the literal `thresholdsSource: 'commissioning_snapshot'`. The WebSocket adapter actively **rejects** any inbound `alarm` whose `thresholdsSource` differs (`websocket.ts:171`).

### 4.4 Alarm evaluation discipline

`evaluateReading()` appears in exactly one TSX file (`LiveActiveAlarmsPanel.tsx`), but inside a **module-level pure helper** `deriveEntries(store, jobs, nowMs)` — not in JSX. The component just invokes the helper. Acceptable; mirrors the F2C `deriveAlarmCenterSnapshot` pattern.

### 4.5 Default behaviour

`adapterFactory.getTelemetryAdapterConfig()` returns `source: 'simulated'` when env is unset → local dev never opens a WebSocket and the browser never reaches a backend.

## 5. Documentation consistency

| Required file | Present |
| --- | --- |
| `RVF_Malinois_F2_Closeout_Report_v1.0.md` | ✅ |
| `RVF_Malinois_F2_Runtime_Integration_Notes_v1.0.md` | ✅ |
| `RVF_Malinois_F2D_RESULT.md` | ✅ |
| `RVF_Malinois_Adenda_Arquitectura_ADR_001_005_v1.3.md` | ✅ |
| `RVF_Malinois_F2_Arquitectura_Telemetria_Tiempo_Real_v1.0.md` | ✅ |

The closeout report references:
- All five tags (`v0.2-settings-units-freeze` through `v0.6-backend-websocket-adapter`) — confirmed at line 376.
- **F3 — Backend / API Foundation** as the recommended next phase — confirmed at lines 340–360.
- The full no-industrial-protocols rule — confirmed at lines 30, 60, 121, 129, 266.
- Client Portal as read-only and alarm-free — confirmed at lines 22, 26, 52, 114, 222.

No factual errors or stale claims found; no document edits required.

## 6. Issues found

**None blocking.** The QA pass identified the following observations,
all of which are pre-existing and explicitly documented as F3 / F6 debt
in the closeout report:

| Observation | Where | Status |
| --- | --- | --- |
| Ack/Cleared alarms do not persist across refresh | F2C scope | Documented as F3 dependency (closeout §208, §334) |
| `AlarmTrendCard` (24 h sparkline) still renders mock data | F2C scope | Documented; backend history needed |
| `AlarmQuickActions` "Silence Horn", "Export Incident", "Create Ticket" remain inert | F2C scope | Backend-dependent |
| `onCatchUp` hook seam exists but no REST call wired | F2D scope | Documented seam; F3 territory (F2D_RESULT §16) |
| `operationsRuntime` could be renamed `sharedTelemetryRuntime` | Cosmetic | Deferred per Runtime Integration Notes §4 |

## 7. Files modified during QA

**None.** All static validation, browser smoke, architecture grep, and
documentation review passed without requiring a code change. This QA
result document is the only new file.

## 8. Final recommendation

**APPROVED FOR F2 CLOSEOUT TAG.**

The codebase is in the state the F2 closeout report describes:
- Static validation green across lint / typecheck / test / build.
- Every shipped route renders cleanly in a real browser with no React
  19 snapshot-identity errors, no hydration mismatch, no infinite
  re-render warnings.
- F2A/B/C/D runtime invariants hold (single store, single ref-counted
  runtime, simulator-by-default, factory-as-single-seam).
- ADR-005 Rules 1–6 hold: thresholds live only in the commissioning
  snapshot; the browser speaks only the normalized stream; no
  industrial protocols are implemented or imported; Client Portal stays
  alarm-free and diagnostic-free.
- Documentation is internally consistent and references every shipped
  tag plus F3 as the recommended next phase.

**Recommended tag:** `v0.7-f2-closeout`.

**Do NOT start F3 in this pass.** F3 — Backend / API Foundation is the
correct next phase per the closeout report, but it is out of scope for
this QA closeout.

*
