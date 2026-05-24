# RVF Malinois — F3.1 Units Live Instrument Readings Closeout Report

> Closeout note for enhancement F3.1 of the RVF Malinois project.
> This is a short operational closeout following F3, not a new architecture document. Scope is limited to the Units screen.

## 1. Executive Summary

F3.1 was completed successfully and is closed. It improves the Units screen by exposing the current readings of each instrument / transmitter of a measurement unit, so that operations engineers can see the unit's technical-operational state at a glance without leaving the Units context. Units does not become a trends screen: production behavior, process trends, and operational dashboards remain the responsibility of Operations. F3.1 also removes Live Trends from Units to enforce that boundary.

## 2. Closeout Metadata

| Field | Value |
|---|---|
| Enhancement | F3.1 — Units Live Instrument Readings |
| Status | Closed |
| Commit | `5d40ac0` — F3.1: add live instrument readings to Units screen |
| Tag | `v0.8.1-f3.1-units-live-readings` |
| Date | 2026-05-24 |
| Related phase | F3 — Backend / API Foundation (closed under `v0.8-f3-backend-api-foundation`) |
| Scope | Units screen: Live Instrument Readings panel, SeparatorDiagram value chips, removal of Live Trends panel |

## 3. Implementation Summary

F3.1 added a **Live Instrument Readings** panel to the Units screen. The panel lists every instrument / transmitter of the selected unit with the following columns:

- Tag · Type · Location · Current Value · Engineering Unit · Status · Quality · Last Reading

The **SeparatorDiagram** component was updated so that each ISA bubble on the separator now shows the current value of its instrument directly on the diagram. Representative examples drawn from the seed data:

- `PIT-100 — 1,820 psi`
- `TIT-100 — 156 °F`
- `FIT-300 — 4,220 bopd`
- `PIT-201 — 3,150 psi`
- `DPIT-400 — 245 psi`
- `FIT-501 — 6.2 MMSCFD`
- `WCIT-600 — 32 %`
- `FIT-601 — 4,252 blpd`

The previous **Live Trends** panel was removed from the Units screen. Trends, production behavior, and process visualization belong to Operations, not Units; keeping the trends panel here was creating a UI responsibility overlap that F3.1 closes.

## 4. UX / Operational Intent

F3.1 reinforces a clear separation of responsibility between the two consoles:

- **Units.** Unit configuration, telemetry source preparation, alarm thresholds, engineering limits, instrument health, current transmitter readings, and the separator digital twin snapshot. Static / current state of the asset.
- **Operations.** Process visualization, production trends, operational behavior, and process dashboards. Live operational view over time.

This split prevents the two screens from competing for the same role. A user opens Units to ask *"what is this unit and how is each of its instruments doing right now?"* and Operations to ask *"how is this unit producing over time?"*. F3.1 makes that distinction visible in the UI without redefining either screen.

## 5. Files Changed

| Change | Path |
|---|---|
| Modified | `apps/web/app/(rvf-console)/units/page.tsx` |
| Modified | `apps/web/components/units-twin/SeparatorDiagram.tsx` |
| Added | `apps/web/components/units-twin/LiveInstrumentReadingsPanel.tsx` |
| Deleted | `apps/web/components/units-twin/ProcessTrendsPanel.tsx` |

## 6. Data Source and Future API Bridge

F3.1 reads from the existing Units Twin local model at `components/units-twin/data/twin.mock.ts`. This was the safest choice for the enhancement because the Units screen already consumed that model and because the F3 API namespace is not yet bridged to the Units Twin namespace.

A future enhancement can wire the Live Instrument Readings panel and the SeparatorDiagram value chips to the canonical RVF Malinois API:

- `GET /api/sensors?unitId=...` for instrument metadata.
- `GET /api/telemetry/latest?unitId=...` for the latest value per sensor.

That bridge is deliberately out of scope for F3.1 and will be addressed when the Units Twin model is reconciled with the F3 domain models in a later phase.

## 7. QA Results

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm --filter @rvf/web lint` | Passed (0 warnings) |
| Typecheck | `pnpm --filter @rvf/web typecheck` | Passed |
| Tests | `pnpm --filter @rvf/web test` | Passed (214 / 214) |
| Build | `pnpm --filter @rvf/web build` | Passed |
| `/units` route size | Build output | Decreased from ~13.6 kB to ~13.2 kB after removing the trends panel |
| `/operations` · `/alarms` · `/portal` | Build output | Unchanged |

## 8. Known Limitations

- Data source is still the local Units Twin mock, not the F3 API.
- Diagram value chips are sized from a text-length estimate, not from a measured layout.
- No dedicated unit test was added for SeparatorDiagram chip rendering.
- Real timestamps and true latest telemetry will arrive when Units Twin is bridged to the F3 API.
- Disabled / offline / maintenance readings are represented defensively through visual tone and state; future real telemetry quality semantics should refine this.

## 9. Closure Statement

F3.1 — Units Live Instrument Readings is closed. The Units screen now shows the current state of every instrument of a measurement unit without taking on trend or production responsibilities, and the previous trends panel has been removed to keep the boundary clean. The project is ready to proceed toward F4 — Database Foundation, in line with the roadmap recorded in the F2 Closeout Report.
