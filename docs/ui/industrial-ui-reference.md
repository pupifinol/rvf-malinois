# RVF Malinois — Industrial UI Reference (Frozen Baseline)

> **Status:** Phase F1/F2 visual baseline. Frozen.
> **Companion document:** [`industrial-design-system.md`](./industrial-design-system.md) — the long-form design system (~37 sections, in Spanish). This file is the short operational reference and the freeze record.

## Freeze ledger

| Surface | Status | Frozen on |
|---|---|---|
| `/operations` | V1 Frozen Baseline | 2026-05-22 |
| `/units` | V1 Frozen Baseline | 2026-05-22 |
| `/sensors` | V1 Frozen Baseline | 2026-05-22 |
| `/alarms` | V1 Frozen Baseline | 2026-05-22 |
| `/reports` | V1 Frozen Baseline | 2026-05-22 |
| `/settings` | Pending | — |

After freeze, edits to a baseline surface are limited to: data integration, backend connectivity, responsive fixes, bug fixes, performance work. **No further aesthetic redesigns** unless explicitly requested.

---

## Purpose

The current implementations of `/operations`, `/units`, `/sensors`, `/alarms`, and `/reports` are the **official RVF Malinois visual baseline** for all future industrial UI work. They are not to be redesigned. New surfaces (`/settings` and any future operational module) must inherit their spacing, hierarchy, panel structure, telemetry density, and operational visual language.

When a question comes up about "how should this new screen look?", the answer is: **open the closest baseline screen and use that as the template.** This document explains *why* that template looks the way it does.

---

## A. Visual Philosophy

RVF Malinois is **industrial instrumentation software** for an oilfield control room, not a SaaS dashboard. The visual language reflects that.

**Core traits:**

- **ISA-101 inspired.** The high-performance HMI standard. In normal state the screen is ~90% neutral; color saturates only what is abnormal.
- **Industrial SCADA aesthetic.** Honeywell Forge, Emerson DeltaV, AVEVA PI Vision, SLB SensorWatch — that family. Not Stripe, not Linear, not Notion.
- **Matte dark surfaces.** Low-luminance canvas (`--bg-canvas` ≈ #0e1620), no halo, no glow. Designed for a 12-hour shift.
- **Restrained blue accents.** `--brand-primary` and `--brand-accent` mark "live data" and active state. Never decoration.
- **Operational readability first.** Density is earned with hierarchy and tabular alignment, never with padding.
- **Low-glow environment.** No drop shadows for separation — 1-px borders carry that job.
- **Dense but readable telemetry layouts.** Many numbers on screen, but every number lives in the same place every time, in the same shape.
- **Oilfield instrumentation focus.** The numbers are pressure, temperature, flow, water cut, calibration days. Not impressions, conversions, MRR.

**This platform is explicitly NOT:**

- A SaaS dashboard (no glassmorphism, no big rounded KPI cards, no marketing gradients)
- A cyberpunk UI (no neon glow, no scanlines, no chromatic effects)
- A fintech / trading UI (no red/green washes, no candlestick-style decoration)
- A crypto / web3 UI (no holographic accents, no live-pulsing widgets for their own sake)

If a design proposal would look at home on Dribbble, it does not belong in RVF Malinois.

---

## B. Typography Rules

**Fonts** — `var(--font-sans)` = Inter / IBM Plex Sans for prose; `var(--font-mono)` = IBM Plex Mono / JetBrains Mono for tags, IDs, and every live-updating number.

**Hierarchy (top → bottom):**

| Role | Class | Where |
|---|---|---|
| Page title | `text-lg font-bold uppercase tracking-tight text-text-primary` | `<PageHeader>` H1 |
| Page subtitle | `text-sm text-text-secondary` | `<PageHeader>` subtitle |
| Panel heading | `text-micro uppercase tracking-wide font-bold text-text-primary` | `<Panel>` title |
| Section sub-heading (inside a Panel) | `text-micro uppercase tracking-wide font-bold text-text-primary mb-1` | e.g. "Health Metrics" inside Instrumentation Overview |
| Big telemetry value | `text-2xl` or `text-3xl` `font-bold tabular-nums leading-none text-text-primary` | Line Pressure card, Sensor Detail value |
| Variable tile value | `text-2xl font-semibold tabular-nums leading-none text-text-primary` | `<ProcessVariableTile>` |
| Mini-trend value | `text-base font-semibold tabular-nums leading-none text-text-primary` | `<ProcessTrendsPanel>` cards |
| Field label (label-over-value) | `text-micro uppercase tracking-micro text-text-muted leading-none` | every `dt` in a `dl` grid |
| Field value (text) | `text-sm font-semibold uppercase tracking-micro text-text-primary` | every `dd` |
| Field value (number) | `text-sm font-semibold font-mono tabular-nums text-text-primary` | every numeric `dd` |
| Table cell | `text-xs tabular-nums` | inventory tables |
| ISA instrument tag | `font-mono uppercase` | "PIT-101", "WCIT-600" — always monospace |
| Event console row | `text-xs` for message, `text-micro font-mono` for timestamp + kind chip | `<SensorEventsTimeline>` |
| Status chip text | `text-micro uppercase tracking-micro font-bold` | `<StatusChip>` |
| Footer micro label | `text-micro uppercase tracking-micro text-text-muted` | "Phase F0 · foundations" |

**Rules that are not negotiable:**

1. Every live-updating number uses `tabular-nums` (set globally on `body`, reaffirmed locally). Proportional figures dance — operators read column-aligned data.
2. Every ISA tag (PIT, TIT, FIT, WCIT, DPIT, LIT) uses `font-mono`. Never proportional.
3. Labels are `uppercase tracking-micro` (`letter-spacing: 0.08em`). Values are not uppercase unless they are tags or status pills.
4. Page title is the ONLY uppercase H1. Panel titles are micro-uppercase (a different visual weight entirely).
5. Numbers always lead. Labels are below or to the side, in muted text. The eye lands on the number first.

---

## C. Panel System

The platform's structural primitive is `<Panel>` (`apps/web/components/shell/Panel.tsx`). Every titled block on every operational surface is a Panel. Do not invent new container components — extend Panel via `meta` and `density`.

**Visual treatment:**

```
┌────────────────────────────────────────────────────────┐
│ SECTION TITLE                              meta/count  │  ← title strip
│                                                        │
│ <body>                                                 │
└────────────────────────────────────────────────────────┘
```

- Surface: `bg-surface` (slightly above canvas)
- Border: `border border-border-subtle` (1 px, `#243240` dark / `#d8e0e8` light)
- Radius: `rounded-sm` (4 px). Tables and mimics may use `rounded-none`. Never `rounded-md` or `rounded-lg` on operational surfaces — that's a SaaS tell.
- Padding: `p-4` (comfortable, 16 px) or `p-3` (compact, 12 px) via the `density` prop. Mimic-style internal cells may use `px-3 py-2.5`.
- Internal gap: `flex flex-col gap-3` (Panel default) or `gap-2.5` for tight clusters.

**Spacing standards (applied at the page level):**

| Grid gap between top-level panels | `gap-3` (12 px) | Tightest, for the main content grid |
| Vertical gap between right-rail panels | `gap-2.5` (10 px) | Compact rail rhythm |
| Gap between section bands (e.g. variable clusters → diagram) | `gap-3` |
| Header → status strip gap | `gap-3` |
| Inside the page root | `<div className="flex flex-col gap-3">` |

**Border opacity:**

- `border-border-subtle` (default) — divider lines, panel outlines.
- `border-border-strong` — hover lift on a card (instead of shadow), or a flange/pipe end.
- `border-l-2 border-l-status-X` — accent stripe on alarm-laden cards (`MultiphaseUnitCard`, event timeline rows).

**Density:**

- 1–4 active units on the fleet grid → `density="comfortable"`
- 5+ active units → `density="compact"` (the page auto-switches)
- Right-rail panels are always comfortable; their interior tables/lists may be compact.

**Sidebar behavior:**

- Fixed left, always visible (control rooms have no hamburger).
- Collapse/expand is persisted to `localStorage` via `uiStore`, gated by a `mounted` flag for SSR parity.
- Width: `w-56` expanded, `w-14` collapsed.
- Active route gets a 2-px `border-l-brand-accent` strip + `bg-surface-raised` row fill.

**Right-rail behavior:**

- The main content grid is `[minmax(0,1fr) _ 280–320px]` (or three columns on `/sensors`).
- The right rail breaks below `2xl` (or `xl`) and stacks under the main column.
- Right-rail panels: Active Alarms / Comm Health / Field Conditions on `/operations`; Unit Health / Instrument Summary / Comm / Calibrations on `/units`; Comm / Calibration Dial / Maintenance Due / Quick Actions on `/sensors`.
- Each right-rail panel is comfortable-padded but contains compact internal layout.

---

## D. Color System

Tokens live in `packages/ui/src/tokens/tokens.css` and are exposed as Tailwind utility colors via `packages/ui/src/tailwind/preset.ts`. **Raw hex is forbidden in app code** — the `no-restricted-syntax` ESLint rule enforces this.

**Semantic intent (the four-word color language):**

| Token | Hex (dark) | Meaning | Used for |
|---|---|---|---|
| `--status-normal` | `#3da56b` | Healthy, online, within band | Small dots, % values when healthy, "Up to date" arc |
| `--status-warn` | `#e0a12e` | Degraded, due soon, drifting | Battery 20-40%, RF 60-80%, calibration due in 14 d, packet loss 1-3% |
| `--status-alarm` | `#d24a3d` | Alarm, overdue, critical | Battery <20%, RF <60%, calibration overdue, alarm events |
| `--status-critical` | `#b6362b` | Hard failure | Used sparingly; reserved for unrecoverable states |
| `--status-stale` | `#8a95a2` | No telemetry, unknown | Stale sensors, "Unknown" calibration bucket |
| `--status-info` | `#5aa8e8` | Live process state | TESTING status, line-pressure accent, Node-RED route notes |
| `--brand-primary` | `#1f5fa8` | Active selection, brand surfaces | Unit selector active button, inventory row selection |
| `--brand-accent` | `#39b6e8` | "Live data" indicator, focus ring | Sidebar active strip, focus rings, WCIT analyzer accent, in-pipe flow arrows |

**Phase tokens** (separator-specific, fixed across the platform):

| Token | Hex (dark) | Use |
|---|---|---|
| `--phase-gas` | `#d4b840` | Gas band (top of vessel), gas flow trends, GAS swatches |
| `--phase-oil` | `#2a1d12` | Crude/oil band (middle of vessel), CRUDE swatches |
| `--phase-water` | `#2a6fb8` | Water band (bottom of vessel), water-cut readout, water flow trends |

**Chart series palette** (categorical, desaturated): `--series-1` through `--series-6`. Never use these for status. Series colors are decorative-but-disciplined — they exist to distinguish overlapping lines, nothing else.

**Operational guidance:**

- **Green is rare.** "All systems nominal" earns one small green dot in the status chip. The rest of the screen is neutral. If everything is green, nothing is green.
- **Yellow + red are finite attention.** Use them only when the underlying state is genuinely degraded or alarmed. Cosmetic warn/alarm in a "fun" empty state destroys their value when a real alarm hits.
- **One color, one meaning, system-wide.** Red is alarm everywhere — `MultiphaseUnitCard`, the alarms panel, the sensor row, the calibration arc. Never reuse red for "selected" or "important", only for alarmed.
- **Gray means stale, not "secondary".** A stale sensor row is gray. Secondary text is `text-text-secondary` (a different gray). They look similar by design — stale data should fade into the secondary read level.
- **Tone classes never appear on whole-card backgrounds.** Status is communicated by (a) a small dot, (b) a left accent stripe, or (c) a text-color tone on the value. Never `bg-status-alarm` filling an entire card.

---

## E. Chart / Trend Rules

The platform ships two charting primitives. Neither uses a third-party chart library. **Do not add one.**

**`<Sparkline>`** (`components/operations/Sparkline.tsx`):

- One series, `currentColor` stroke, `strokeWidth ≤ 1.6`.
- Caller themes it via Tailwind text class (`text-series-1`, `text-phase-gas`, `text-status-info`).
- No axes, no grid, no labels.
- Used everywhere a tile or row needs a "is this trending up or down" hint.

**`<TrendChart>`** (`components/operations/TrendChart.tsx`):

- Multi-series SVG line chart, fluid X via `preserveAspectRatio='none'`.
- `1.6` stroke width, `strokeLinejoin='round'`.
- Y-axis: muted dashed gridlines, monospace tick labels in `var(--text-secondary)`.
- Used in the Live Trends panel and the bottom `/units` trend strip.

**Rules:**

1. **Muted strokes.** Stroke widths between 1.1 and 1.6 px. Never thicker.
2. **No gradients.** No area fills under the curve. No "glow" filters. Period.
3. **No glossy charts.** No 3D effects, no skeuomorphic gauges, no rainbow segment dials.
4. **No SaaS analytics appearance.** No "compare to last period" arrows, no animated counter rolls, no celebratory confetti.
5. **Solid colors only, sourced from tokens.** Each series uses `var(--series-N)` or a phase/status token. If you need a new color, add a token.
6. **No autoscale tricks.** The y-range is data-driven, but the axis labels are honest — if the y range is 1,640 → 1,660 psi, label it that way; don't truncate to make noise look like an event.
7. **Sparklines never carry axis chrome.** They are a *direction indicator*, not a chart. If you need labels, use a TrendChart.

---

## F. Industrial UI Rules (forbidden styles)

The following patterns are NOT permitted on any RVF Malinois operational surface. If a design proposal includes one of these, push back.

| ❌ Forbidden | Why |
|---|---|
| Glassmorphism (backdrop blur, translucent surfaces) | Reads as iOS/macOS, not industrial. Also illegible under bright field conditions. |
| Crypto / web3 dashboard aesthetics (holographic gradients, "pulse" widgets) | Connotation is speculative finance, not safety-critical operations. |
| Excessive animation (bouncy hover, magnetic cursor, animated KPI counters) | Operators read the screen during incidents. Motion competes with alarm signal. |
| Neon glow (`text-shadow`, `filter: blur` on text/borders) | Looks like a game UI. Reduces contrast for older operators. |
| Floating widgets (cards detached from grid, draggable tiles) | Breaks muscle memory ("where is oil rate on unit 3?"). |
| Oversized KPI cards (`text-display-lg`, large padded marketing cards) | Wastes operational pixels. The number is large enough at `text-2xl` if tabular. |
| Skeuomorphic gauges (3D dials, mercury thermometers) | The hallmark of amateur industrial software. |
| Rainbow alarm dials | Color = meaning. A rainbow undermines the entire ISA-101 discipline. |
| Animated alarm strobing | ISA-18.2 violation. Use a steady tone + the alarm color. |
| Raw hex literals in component code | Enforced by `no-restricted-syntax` — always use a semantic token. |
| Decorative emoji | The platform serves engineers. No emoji in operational copy. |
| "Empty state" illustrations | A stale row reads as stale. No mascot necessary. |
| `box-shadow` for card separation | Use a 1-px border (`border-border-subtle`). |
| Border radius `> 4 px` on operational containers | The platform reads as precise because corners are tight. |
| Multi-line docstrings or comments in component code | One short line max; don't restate what the code already says. |

---

## G. Screen Reference Status

The three operational surfaces below are **frozen as the platform's visual baseline.** Treat them as the canonical answer to "how does an RVF Malinois screen look?"

### `/operations` — Official Operational Overview Reference

**Mockup:** [`apps/web/public/mockups/operations-reference-v1.png`](../../apps/web/public/mockups/operations-reference-v1.png)
**Implementation:** [`apps/web/app/(rvf-console)/operations/page.tsx`](../../apps/web/app/(rvf-console)/operations/page.tsx)

**What it locks in:**

- The platform's canonical PageHeader rhythm (title + subtitle + right-aligned chip cluster).
- The "1+N" main grid: a left content column + right rail at `[minmax(0,1fr) _ 320px]`.
- The MultiphaseUnitCard composition: status chip + meta dl + 3×2 VariableTile grid + 4-cell footer strip.
- The Live Trends panel: multi-series TrendChart with monospace y-tick labels.
- The right rail's "always-present" panels: Active Alarms, Communication Health, Field Conditions.

Use as the template for any *fleet overview* or *multi-entity status* surface.

### `/units` — Official Digital Twin / Process Visualization Reference

**Mockup:** [`apps/web/public/mockups/operations-units-screen-reference-v1.png`](../../apps/web/public/mockups/operations-units-screen-reference-v1.png)
**Implementation:** [`apps/web/app/(rvf-console)/units/page.tsx`](../../apps/web/app/(rvf-console)/units/page.tsx)

**What it locks in:**

- The in-header **unit selector** (`<UnitSelector>`) pattern: segmented chip-button bar that re-binds every panel on the page when selection changes.
- The **UnitStatusBar** — 6-cell label-over-value strip directly under the page header. Reusable for any per-entity context page.
- The **hero diagram** convention: a single large SVG visualization (`SeparatorDiagram`) flanked by variable clusters above and a process-bar row below.
- The **ISA-101 separator visualization** discipline: solid phase fills, 1.6 px outlines, ISA instrument tags as circles with kind-over-loop text, marching-ants flow arrows in `--brand-accent` only on the pipes themselves, semantic phase colors (gas top yellow, oil middle dark, water bottom blue).
- The right-rail "instrument context" stack: Unit Health · Instrument Summary · Communication · Last Calibrations.
- The bottom Live Trends strip: compact 5-up trend cards.

Use as the template for any *single-entity deep-dive* surface (e.g. a future `/units/sand-trap` or `/wells/[id]`).

### `/sensors` — Official Instrumentation & Telemetry Reliability Reference

**Mockup:** [`apps/web/public/mockups/sensors-screen-reference-v1.png`](../../apps/web/public/mockups/sensors-screen-reference-v1.png)
**Implementation:** [`apps/web/app/(rvf-console)/sensors/page.tsx`](../../apps/web/app/(rvf-console)/sensors/page.tsx)

**What it locks in:**

- The **7-cell status strip** pattern (Total / Online / Degraded / Offline / Avg Latency / Avg RF Quality / Battery Alerts) — the canonical "summary band" for any inventory-driven surface.
- The **3-column main grid** at `[minmax(0,300px) _ 1fr _ minmax(0,300px)]` — left rollup column + center main table + right rail.
- The **InstrumentationOverviewPanel** pattern: category cards (icon + total + online/degraded sub-stats) above a thin-divider block of named diagnostic counters. Reusable for any inventory rollup.
- The **tabbed + filtered table** pattern: kind tabs on top, then a row of subtle `<select>` dropdowns (Unit / Status / Calibration), then a sticky-header scrollable table with row selection.
- The **CalibrationStatusDial** pattern: a single SVG donut over four semantic buckets + center "% up-to-date" + legend list — for any "categorical rollup with a single highlighted number" use case.
- The **MaintenanceDuePanel** pattern: derived punch list from multiple independent triggers (battery, calibration, health), with a per-reason monochrome icon chip.
- The **SensorDetailPreview** pattern: three banded `dl` grids stacked vertically (provenance / reliability / live health), separated by thin border rules. Reusable for any "selected entity detail" panel.
- The **SensorEventsTimeline** SCADA-log pattern: 4-column grid (`timestamp · kind chip · tag · message`), left accent border by tone, dimmed timestamps, promoted text on critical rows.
- The **QuickActionsPanel** pattern: four restrained icon + label utility buttons; *not* a CTA strip.

Use as the template for any *instrument / device / asset inventory* surface (e.g. a future `/wells`, `/equipment`, or `/audit`).

### `/alarms` — Official Alarm Operations Center Reference

**Status:** V1 Frozen Baseline — 2026-05-22.
**Mockup:** [`apps/web/public/mockups/operations-alarms-screen-reference-v1.png`](../../apps/web/public/mockups/operations-alarms-screen-reference-v1.png)
**Implementation:** [`apps/web/app/(rvf-console)/alarms/page.tsx`](../../apps/web/app/(rvf-console)/alarms/page.tsx)

**Main panels (top → bottom, left → right):**

1. `CriticalAlarmBanner` — single-line strip surfacing the highest-priority active alarm. Tonal `bg-gradient-to-r from-status-alarm/18 …` + 3-px alarm-toned left stripe; filled URGENT chip; centered inline `Active for` timer + Acknowledge button.
2. `AlarmSeverityCards` — six compact counters (Urgent / High / Medium / Low / Acknowledged / Ack Rate). Single-row dense layout: label-over-state on the left, large number on the right baseline. Per-card 2-px accent stripe.
3. `AlarmTrendCard` — secondary widget at ~240 px wide. 28 px sparkline, opacity 0.65, no axis chrome. Reads as supporting telemetry, never as a hero chart.
4. `AlarmFilterBar` — segmented `ALL / ACTIVE / ACKED / CLEARED / URGENT / HIGH / MEDIUM / LOW` tabs above a row of subtle Unit / Source / State `<select>` dropdowns.
5. `ActiveAlarmsTable` — primary operational area. Columns: Priority · Title · Source · Unit · Raised · Active For · State · Ack. 3-px priority stripe per row; URGENT+ACTIVE rows pick up a faint tonal wash; ACKED rows step the title back to `text-text-secondary`.
6. `AlarmHistoryTable` — lower-emphasis archive under the active queue (`opacity-90`, `max-h-[168px]`).
7. `RealtimeAlarmFeed` — right-rail SCADA event log. Severity icon in a tonally-tinted chip + uppercase title + `unit · source` + monospace timestamp. Single pulsing "Live" dot is the only animation on the page.
8. `AlarmQuickActions` — six restrained icon-chip buttons (Ack All · Ack Low · Silence Horn · Open Unit · Export · Create Ticket).

**Visual design principles that lock in here:**

- **ISA-18.2 four-tier priority palette** introduced as platform tokens — `--alarm-urgent` (red) / `--alarm-high` (amber) / `--alarm-medium` (muted yellow) / `--alarm-low` (blue). MEDIUM is the only new color hex; the rest alias the canonical `--status-*` palette.
- The shared `<AlarmPriorityChip>` is the single source of truth for priority rendering. Every alarm table + the realtime feed consume the same `PRIORITY_STYLE` map.
- Filled chip for URGENT in the banner is the most saturated element on the page — used exactly once.
- Severity-toned `border-l-2` accent stripes; never `bg-status-X` filling an entire row.
- One pulsing dot ("Live" in the feed) and CSS-transition row hovers are the only motion.

Use as the template for any *event-stream operational console* surface (a future SCADA control surface, dispatch board, or shift-handover screen).

### `/reports` — Official Operational Deliverables & Audit Archive Reference

**Status:** V1 Frozen Baseline — 2026-05-22.
**Mockup:** _(no approved mockup; the current implementation is itself the visual baseline.)_
**Implementation:** [`apps/web/app/(rvf-console)/reports/page.tsx`](../../apps/web/app/(rvf-console)/reports/page.tsx)

**Main panels (top → bottom, left → right):**

1. `ReportStatusStrip` — 6-cell counter strip (Reports Today / Ready / In Pipeline / Failed / Pending Approval / Avg Generation). Same label-over-value rhythm as `/units`' `<UnitStatusBar>` and `/sensors`' `<SensorStatusStrip>`.
2. `ReportsArchiveTable` — primary operational area. 13 columns including operational rollups (Duration, Alarms, Avg Pressure psi, Avg Water Cut %, Approved By). Inline `+ Generate` button in the panel meta with refined outline treatment. Selectable rows drive the detail preview below.
3. `ReportDetailPreview` — audit-style document preview. Left column: three banded `dl` grids (Provenance · Operational Summary · File) separated by thin `border-b` rules with generous `gap-y-3` row spacing. Right column: numbered "Included Sections" list with `§01 / §02 / …` and a green check per rendered section. Reads as a document handoff card, not a dashboard widget.
4. `GenerationQueuePanel` — right-rail pipeline view. Each item: kind dot + label + state, then a `h-1.5` progress bar (`bg-canvas` track + `bg-status-warn` or `bg-text-secondary/50` fill), then stage label + `%`+`ETA Nm` line. Subtle, no glow.
5. `ReportTemplatesPanel` — versioned template list. Each row shows kind-dot + name + version (mono primary text), kind · owner (with owner promoted to `text-text-primary`), and `lastUpdated · used lastUsed`.
6. `ReportActivityPanel` — audit-log timeline. Fixed-width monospace timestamp + action + `reportId · user` per row. Left accent border by tone. **No "Live" indicator** — this is a read-mostly audit ledger, not a live stream.
7. `ReportActionsPanel` — six operator actions. Only Generate Report and Send to Client Portal carry accent stripes (brand-accent / info); the rest stay neutral.

**Semantic color usage on `/reports`:**

| State | Token | Where it appears |
|---|---|---|
| `READY` | `--status-info` (blue) | Newly-rendered report awaiting review |
| `GENERATING` | `--status-warn` (amber) | In-flight queue items + progress bar fill |
| `PENDING_APPROVAL` | `--status-warn` (amber) | Stripe on the row + "Pending" approver text |
| `DELIVERED` | `--status-normal` (green) | Sent to client portal, sealed |
| `FAILED` | `--status-alarm` (red) | Stripe on the row + state badge |
| `QUEUED` | `--status-stale` (gray) | Waiting on the pipeline |

**Report-kind dot colors** (`ReportKindChip`, also driving `KIND_DOT` reused by Templates and Queue):

- Well Test → `--status-info` (blue) — the headline deliverable.
- Daily Ops → `--text-secondary` (neutral muted) — routine.
- Buildup → `--series-5` (calm purple) — distinct from process tones so it never reads as alarm.
- Audit → `--status-stale` (gray) — administrative, low-emphasis.
- Incident → `--status-alarm` (red) — incidents inherit the alarm palette.

**Visual design principles that lock in here:**

- **Reports is intentionally calmer than Alarms.** Where `/alarms` has saturated gradients, pulsing indicators, and per-row tonal washes, `/reports` has muted chips, no live pulse, and neutral row backgrounds. The screen reads as an archive, not a control surface.
- **Archive readability + audit traceability are the priorities.** Every operational decision (volume of breathing room in the detail preview, monospace tabular timestamps in the activity log, versioned template metadata, sealed/open audit indicator) optimizes for "can a reviewer trust this in three months?" not "can an operator react in three seconds?"
- **Only `FAILED` and `PENDING_APPROVAL` rows use severity stripes.** `READY`, `DELIVERED`, `QUEUED`, `GENERATING` rows stay neutral. The archive reads peaceful by default; abnormal states earn the color.
- **Minimal motion.** The only animation on the page is the CSS-width transition on the progress bar and the standard `transition-colors duration-fast` on row hovers. No "Live" pulse, no spinners, no skeleton loaders, no counter rolls.
- **Density inherits from `/alarms`.** All panels use `<Panel density="compact">`; container gap is `gap-2.5`; table cell padding is `px-2 py-1.5`. Same spacing rhythm — the screen feels like the same product, just at a different tempo.

**Relationship with the other baselines:**

| `/operations` | Reports inherits the PageHeader-plus-StatusChip cluster pattern and the right-rail Panel composition. |
| `/units` | Reports inherits the `<UnitStatusBar>`-style 6-cell counter strip pattern (`ReportStatusStrip`) and the three-band-`dl` detail-preview pattern (`ReportDetailPreview` mirrors `SensorDetailPreview`). |
| `/sensors` | Reports inherits the sticky-header scrollable table pattern, the `KIND_DOT` lookup approach (mirrors the `SensorKind` dot map), and the `density="compact"` Panel rhythm. |
| `/alarms` | Reports inherits the compact button styling (`AlarmQuickActions` → `ReportActionsPanel`), the `border-l-[3px]`-on-tone row treatment (used sparingly), and the right-rail proportions (`max-w-[288px]`, ~12 px tighter than alarms to give the archive table the freed width). |

Use as the template for any *document archive / audit deliverable / regulator-facing* surface (e.g. a future `/audit`, `/compliance`, or `/handovers`).

---

## H. Screenshot Reference Folder

All approved visual references live in `apps/web/public/mockups/`. Filenames are stable; downstream tools and reviewers point at them directly.

| File | Maps to |
|---|---|
| `operations-reference-v1.png` | `/operations` frozen baseline |
| `operations-units-screen-reference-v1.png` | `/units` frozen baseline |
| `sensors-screen-reference-v1.png` | `/sensors` frozen baseline |
| `operations-alarms-screen-reference-v1.png` | `/alarms` frozen baseline |
| _(none yet)_ | `/reports` — the current implementation is the visual baseline |

When a future iteration produces a v2 of any of these, **add a new file** (`*-v2.png`); do not overwrite v1. The version pin in the filename is the freeze record.

---

## I. Future Screen Guidance

The same rules apply to every surface that doesn't exist yet. The guidance below identifies which baseline screen each future surface should clone, plus the surface-specific notes. (`/alarms` and `/reports` were originally documented in this section; they are now frozen baselines and live under §G.)

### `/settings`

**Inherits from:** `/operations` (header + right rail) but with a vertical-sectioned content column instead of a grid of cards.

**Layout sketch:**

1. PageHeader: title "Console Settings" + chip ("Last saved: 02 min ago").
2. Main grid `[minmax(0,1fr) _ 320px]`:
   - **Left**: a vertical stack of `<Panel>` sections — Operator Profile · Display Preferences (theme, density, sidebar default) · Telemetry Defaults (auto-refresh, history window) · Alarm Acknowledgement Defaults · Hotkeys · Data Export Defaults · About / Diagnostics.
   - **Right rail**: Saved Profiles (load/save preset bundles), Comm Health (always present), Recent Changes (audit log of settings mutations), Quick Actions (Reset to Operational Defaults · Export Settings JSON · Import).
3. Optional bottom row only if a settings change has unsaved state: a sticky `Save / Discard` strip with a left accent stripe in `--status-info`.

**Key disciplines:**

- Every setting reads as a label-over-control row. Toggles are single line, selects are single line, sliders are restrained track + value chip.
- Destructive actions (Reset, Reset All Profiles) require a typed confirmation — never a single click, never a modal with a colorful illustration.
- "Saved" state is communicated by the right-rail Recent Changes log, not by a transient toast.

### Future operational modules (general rule)

Any new operational surface must answer the following four questions *before* a single line is written. If the answer to any of them is "I don't know yet", the screen isn't ready to build:

1. **Inheritance.** Which of `/operations`, `/units`, `/sensors` is this surface closest to? Open that file. Copy its layout shape.
2. **Status semantics.** What state does this surface communicate? Map that state into the existing semantic palette. If you can't map it, push back — don't invent new tokens.
3. **Telemetry density.** What numbers does the operator read first? Promote those into a status strip or hero card. Push the rest into a `<Panel>` table.
4. **Right rail.** Comm Health is always present. The other 2-3 rail panels are surface-specific but follow the same Panel composition. Plan them up front, not as an afterthought.

---

## J. Validation Discipline

Every change to a frozen surface — and every new surface that inherits from one — must pass:

```bash
pnpm lint        # ESLint + the no-restricted-syntax / no-raw-hex / import-order rules
pnpm typecheck   # strict TS, noUncheckedIndexedAccess on
pnpm test        # vitest unit tests
```

A change that fails lint isn't a "style issue" — the lint rules enforce the design system. A raw hex literal in a component is a lint error because the platform's color discipline depends on every color being a semantic token. Treat lint output as design feedback.

When adding a new screen, also build for production locally (`pnpm --filter web build`) to catch SSR / client-component mismatches before they ship.

---

## K. What's Frozen, What's Open

**Frozen (do not redesign):**

- `/operations` layout, MultiphaseUnitCard composition, Live Trends panel
- `/units` layout, SeparatorDiagram geometry, UnitSelector pattern, phase colors
- `/sensors` layout, InstrumentationOverview pattern, inventory table tabs+filters, SCADA event log row shape
- `/alarms` layout, CriticalAlarmBanner composition, 6-cell severity counter row, ActiveAlarmsTable column set, RealtimeAlarmFeed row shape, ISA-18.2 priority tokens (`--alarm-urgent / -high / -medium / -low`)
- `/reports` layout, 6-cell ReportStatusStrip, ReportsArchiveTable 13-column set, ReportDetailPreview three-band metadata + sections list, GenerationQueuePanel progress-bar treatment, ReportKindChip `KIND_DOT` map
- The semantic color palette (status-normal/warn/alarm/critical/stale/info, brand-primary/accent, phase-gas/oil/water, alarm-urgent/high/medium/low)
- The Panel + PageHeader + StatusChip primitives
- The typography hierarchy in §B
- The sidebar + topbar shell

**Open for evolution after freeze (data + plumbing only):**

- Data integration: replacing the mock arrays with live API / WebSocket sources behind the same component contracts.
- Backend connectivity: wiring `onAck`, `onSelect`, `onGenerate`, `onAction` handlers to real mutation services.
- Responsive fixes: collapsing the right rail at narrower breakpoints, ensuring table horizontal scroll behaves on field tablets.
- Bug fixes: anything observable in production that doesn't match the documented behavior.
- Performance: virtualization on tables once they cross ~200 rows, memoization, code-splitting; visual output must remain identical.

**Open for evolution (with care, beyond the frozen surfaces):**

- Adding new surface-specific components inside the established Panel system.
- Adding new sensor kinds (extend `SensorKind` + add to `SENSOR_CATEGORIES`).
- Adding new alarm kinds or stages (extend `AlarmKind` / `ReportStage` enums).
- Adding new chart series via the existing `series-N` palette (or a new token if absolutely required).
- Localization of operator-facing copy (the token system + iconography stay constant).

When in doubt: ship a smaller change. The platform's credibility is built on consistency, not novelty.
