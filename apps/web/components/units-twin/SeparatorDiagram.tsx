'use client';

import { useEffect, useState } from 'react';

import type { Instrument, InstrumentKind, UnitTwin } from './data/twin.mock';

/**
 * Per-instrument display tone for the on-diagram value chips. Mirrors
 * the status taxonomy used by LiveInstrumentReadingsPanel so the two
 * surfaces stay coherent: a sensor flagged Stale here is Stale there.
 */
type ReadingTone = 'normal' | 'stale' | 'fault' | 'offline';

const TONE_FILL: Record<ReadingTone, string> = {
  normal: 'var(--text-primary)',
  stale: 'var(--status-stale)',
  fault: 'var(--status-alarm)',
  offline: 'var(--text-muted)',
};

const splitReading = (reading: string): { value: string; unit: string } => {
  const trimmed = reading.trim();
  const idx = trimmed.lastIndexOf(' ');
  if (idx === -1) return { value: trimmed, unit: '' };
  return { value: trimmed.slice(0, idx), unit: trimmed.slice(idx + 1) };
};

const deriveTone = (twin: UnitTwin, instrument: Instrument): ReadingTone => {
  if (!instrument.enabled) return 'offline';
  if (twin.comm === 'OFFLINE' || twin.status === 'OFFLINE' || twin.status === 'MAINTENANCE') {
    return 'offline';
  }
  if (instrument.health === 'BAD') return 'fault';
  if (instrument.health === 'DEGRADED' || twin.comm === 'DEGRADED') return 'stale';
  return 'normal';
};

/**
 * Index `twin.instruments` by ISA tag (`${kind}-${loop}`) so the diagram
 * can look up the current reading for each placed bubble without
 * threading per-tag wiring through every call site. If a tag is not
 * present in the inventory, the bubble simply renders without a value
 * chip — defensive against future tag-set drift.
 */
interface DiagramReading {
  value: string;
  unit: string;
  tone: ReadingTone;
}

const buildReadingIndex = (twin: UnitTwin): Map<string, DiagramReading> => {
  const out = new Map<string, DiagramReading>();
  for (const inst of twin.instruments) {
    const { value, unit } = splitReading(inst.reading);
    out.set(`${inst.kind}-${inst.loop}`, { value, unit, tone: deriveTone(twin, inst) });
  }
  return out;
};

/**
 * SeparatorDiagram — the hero of /units. A modernized, dark-theme process
 * flow visualization of a horizontal three-phase separator.
 *
 * Real-world piping (this is what RVF Malinois separators actually have):
 *   - ONE multiphase inlet (PIT, TIT, FIT) entering mid-elevation, left.
 *   - Vessel internals: PIT (line), TIT, DPIT (across the weir), LIT (level).
 *   - ONE gas outlet (top of vessel) carrying separated gas — PIT, TIT, FIT.
 *   - ONE liquid outlet (lower side) carrying oil + water *together* —
 *     PIT, TIT, FIT, plus an inline water-cut analyzer (WCIT) that reads
 *     the % water *inside* the liquid stream. Water does NOT have a
 *     dedicated pipe.
 *
 * The colored phase bands inside the vessel (gas top yellow, oil middle
 * dark, water bottom blue) communicate the *internal* separation only.
 * The diagram is careful never to draw a separate dedicated water outlet.
 *
 * Design discipline (ISA-101 / engineering doc §3, §6):
 *   - solid fills only, no gradients
 *   - one stroke weight (vector-effect non-scaling)
 *   - ISA-style circular instrument tags (kind on top, loop number below)
 *   - subtle marching-ants flow indication on the inlet/outlet pipes only
 *   - levels smoothly transition when telemetry updates
 */
export interface SeparatorDiagramProps {
  twin: UnitTwin;
}

const useLiveLevels = (initial: UnitTwin['levels']): UnitTwin['levels'] => {
  const [levels, setLevels] = useState(initial);
  useEffect(() => {
    setLevels(initial);
    const id = window.setInterval(() => {
      setLevels((prev) => {
        const gas = clamp(prev.gasPct + jitter(0.6), 20, 45);
        const oil = clamp(prev.oilPct + jitter(0.6), 25, 55);
        const water = Math.max(0, 100 - gas - oil);
        return { gasPct: gas, oilPct: oil, waterPct: water };
      });
    }, 2400);
    return () => window.clearInterval(id);
  }, [initial]);
  return levels;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const jitter = (amp: number) => (Math.random() - 0.5) * amp * 2;

// ----- diagram geometry --------------------------------------------------
// VB.h grew from 440 → 470 (F3.1) to make room for on-diagram value chips
// below the LIT-500 and liquid-outlet bubbles. The gas-outlet pipe also
// shifted down 18 px (50 → 68) so the gas-outlet bubble trio has clearance
// below it for a value chip.
const VB = { w: 1100, h: 470 };
const VESSEL = { x: 250, y: 110, w: 600, h: 220 } as const;
const GAS_OUT_Y = 68;

export const SeparatorDiagram = ({ twin }: SeparatorDiagramProps) => {
  const levels = useLiveLevels(twin.levels);
  const readings = buildReadingIndex(twin);

  const gasH = (VESSEL.h * levels.gasPct) / 100;
  const oilH = (VESSEL.h * levels.oilPct) / 100;
  const waterH = (VESSEL.h * levels.waterPct) / 100;

  const gasY = VESSEL.y;
  const oilY = gasY + gasH;
  const waterY = oilY + oilH;

  const vesselRightX = VESSEL.x + VESSEL.w;
  const vesselBottomY = VESSEL.y + VESSEL.h;
  const vesselMidY = VESSEL.y + VESSEL.h / 2;

  // Liquid outlet — single line, middle/lower section of the vessel.
  // Drops to just above the oil/water interface band: gravity-natural
  // drain point on a real horizontal three-phase separator. Oil + water
  // leave together through this one pipe; WCIT-600 reads water % inline.
  const liquidOutY = vesselMidY + 48;

  // The vessel's right cap is a half-ellipse with rx = h/2. The shell's
  // actual x at the outlet's y is computed from the ellipse so the nozzle
  // base always meets the curve, no matter the vessel dimensions.
  const capRx = VESSEL.h / 2;
  const dyAtOutlet = liquidOutY - vesselMidY;
  const shellXAtOutlet = vesselRightX - capRx + Math.sqrt(capRx * capRx - dyAtOutlet * dyAtOutlet);

  // Welded-nozzle composition:
  //   [reinforcement pad on shell] → [neck] → [flange face] → [pipe]
  // Each segment is its own rect so the silhouette reads as a real
  // forged nozzle instead of one flat block.
  const padX1 = shellXAtOutlet - 5;
  const padX2 = shellXAtOutlet + 9;
  const padHalfH = 20;

  const neckX1 = padX2;
  const neckX2 = shellXAtOutlet + 26;
  const neckHalfH = 11;

  const flangeX1 = neckX2;
  const flangeX2 = shellXAtOutlet + 36;
  const flangeHalfH = 17;

  const pipeStartX = flangeX2;
  const pipeEndX = vesselRightX + 200;

  return (
    <svg
      viewBox={`0 0 ${VB.w} ${VB.h}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-auto select-none"
      aria-label="Separator process diagram"
      role="img"
    >
      <defs>
        <marker
          id="flowArrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 Z" fill="var(--brand-accent)" opacity="0.9" />
        </marker>

        <clipPath id="vesselClip">
          <rect x={VESSEL.x} y={VESSEL.y} width={VESSEL.w} height={VESSEL.h} rx={VESSEL.h / 2} />
        </clipPath>
      </defs>

      {/* ============== Pipes ============== */}
      {/* INLET — single multiphase line from the left, entering at mid-elevation. */}
      <g stroke="var(--text-secondary)" strokeWidth="8" fill="none" strokeLinecap="round">
        <line
          x1="40"
          y1={vesselMidY}
          x2={VESSEL.x}
          y2={vesselMidY}
          vectorEffect="non-scaling-stroke"
        />
        {/* Inlet flange */}
        <line
          x1={VESSEL.x - 14}
          y1={vesselMidY - 14}
          x2={VESSEL.x - 14}
          y2={vesselMidY + 14}
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
        />
      </g>
      <FlowOverlay d={`M 40 ${vesselMidY} L ${VESSEL.x} ${vesselMidY}`} arrow />

      {/* GAS OUTLET — single line off the top of the vessel, exits upper-right. */}
      <g stroke="var(--text-secondary)" strokeWidth="8" fill="none" strokeLinecap="round">
        <path
          d={`M ${vesselRightX - 80} ${VESSEL.y + 18}
              L ${vesselRightX - 80} ${GAS_OUT_Y}
              L ${vesselRightX + 200} ${GAS_OUT_Y}`}
          vectorEffect="non-scaling-stroke"
        />
      </g>
      <FlowOverlay
        d={`M ${vesselRightX - 80} ${VESSEL.y + 18}
            L ${vesselRightX - 80} ${GAS_OUT_Y}
            L ${vesselRightX + 200} ${GAS_OUT_Y}`}
        arrow
      />

      {/* The liquid outlet is drawn *after* the vessel outline below, so
          its nozzle visibly bridges the curved cap and looks welded on
          rather than floating in space. */}

      {/* ============== Vessel ============== */}
      {/* Phase fills, clipped to the vessel outline. Internal separation only. */}
      <g clipPath="url(#vesselClip)" style={{ transition: 'all 800ms ease-in-out' }}>
        <rect
          x={VESSEL.x}
          y={gasY}
          width={VESSEL.w}
          height={gasH}
          fill="var(--phase-gas)"
          opacity="0.85"
        />
        <rect x={VESSEL.x} y={oilY} width={VESSEL.w} height={oilH} fill="var(--phase-oil)" />
        <rect
          x={VESSEL.x}
          y={waterY}
          width={VESSEL.w}
          height={waterH}
          fill="var(--phase-water)"
          opacity="0.9"
        />

        {/* Phase interfaces */}
        <line
          x1={VESSEL.x}
          y1={oilY}
          x2={vesselRightX}
          y2={oilY}
          stroke="var(--text-primary)"
          strokeWidth="1.2"
          opacity="0.7"
          vectorEffect="non-scaling-stroke"
          style={{ transition: 'all 800ms ease-in-out' }}
        />
        <line
          x1={VESSEL.x}
          y1={waterY}
          x2={vesselRightX}
          y2={waterY}
          stroke="var(--text-primary)"
          strokeWidth="1.2"
          opacity="0.7"
          vectorEffect="non-scaling-stroke"
          style={{ transition: 'all 800ms ease-in-out' }}
        />
        {/* Internal weir near the discharge end */}
        <rect
          x={vesselRightX - 130}
          y={VESSEL.y + 22}
          width="5"
          height={VESSEL.h - 44}
          fill="var(--text-primary)"
          opacity="0.4"
        />
        {/* Mist extractor hatch above gas outlet */}
        {[0, 6, 12, 18].map((dx) => (
          <line
            key={dx}
            x1={vesselRightX - 110 + dx}
            y1={VESSEL.y + 26}
            x2={vesselRightX - 80 + dx}
            y2={VESSEL.y + 56}
            stroke="var(--text-primary)"
            strokeWidth="0.6"
            opacity="0.4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>

      {/* Vessel outline + centerline */}
      <rect
        x={VESSEL.x}
        y={VESSEL.y}
        width={VESSEL.w}
        height={VESSEL.h}
        rx={VESSEL.h / 2}
        stroke="var(--text-secondary)"
        strokeWidth="1.8"
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={VESSEL.x + 28}
        y1={vesselMidY}
        x2={vesselRightX - 28}
        y2={vesselMidY}
        stroke="var(--text-muted)"
        strokeDasharray="4 4"
        strokeWidth="0.7"
        vectorEffect="non-scaling-stroke"
      />

      {/* Skid supports */}
      {[VESSEL.x + 90, vesselRightX - 130].map((x) => (
        <line
          key={x}
          x1={x}
          y1={vesselBottomY}
          x2={x}
          y2={vesselBottomY + 30}
          stroke="var(--text-muted)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <line
        x1={VESSEL.x + 40}
        y1={vesselBottomY + 30}
        x2={vesselRightX - 40}
        y2={vesselBottomY + 30}
        stroke="var(--text-muted)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />

      {/* ============== Liquid outlet (welded nozzle + pipe) ==============
          One pipe; no oil/water split. Drawn AFTER the vessel so the
          reinforcement pad visibly bridges the curved cap and the whole
          assembly reads as "welded onto the shell". Composition:
            pad (sits on the shell) → neck → flange → pipe → WCIT-600 inline.
          The pipe is rendered slightly heavier than gas/inlet to reflect
          that the liquid line carries the bulk mass throughput of a real
          three-phase separator. */}

      {/* Reinforcement pad on the shell. Taller than the neck so the
          silhouette reads "welded saddle pad → narrower nozzle". The
          inner edge bites 5 px into the shell so it visually overlaps the
          curved outline rather than tangenting it. */}
      <rect
        x={padX1}
        y={liquidOutY - padHalfH}
        width={padX2 - padX1}
        height={padHalfH * 2}
        fill="var(--bg-surface)"
        stroke="var(--text-secondary)"
        strokeWidth="1.8"
        vectorEffect="non-scaling-stroke"
      />

      {/* Nozzle neck — short cylindrical body between pad and flange. */}
      <rect
        x={neckX1}
        y={liquidOutY - neckHalfH}
        width={neckX2 - neckX1}
        height={neckHalfH * 2}
        fill="var(--bg-surface)"
        stroke="var(--text-secondary)"
        strokeWidth="1.8"
        vectorEffect="non-scaling-stroke"
      />

      {/* Bolted flange plate — taller again so the profile reads
          pad-neck-flange (a real forged or welded nozzle assembly). */}
      <rect
        x={flangeX1}
        y={liquidOutY - flangeHalfH}
        width={flangeX2 - flangeX1}
        height={flangeHalfH * 2}
        fill="var(--bg-surface)"
        stroke="var(--text-secondary)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      {/* Subtle bolt marks on the flange face — three small ticks, kept
          minimal to stay ISA-101 restrained. */}
      {[-flangeHalfH + 5, 0, flangeHalfH - 5].map((dy) => (
        <line
          key={dy}
          x1={flangeX2 - 3}
          y1={liquidOutY + dy}
          x2={flangeX2 - 1}
          y2={liquidOutY + dy}
          stroke="var(--text-muted)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {/* Liquid outlet pipe — heavier stroke than the gas/inlet lines to
          reflect the real diameter difference on a three-phase separator. */}
      <line
        x1={pipeStartX}
        y1={liquidOutY}
        x2={pipeEndX}
        y2={liquidOutY}
        stroke="var(--text-secondary)"
        strokeWidth="10"
        strokeLinecap="round"
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
      <FlowOverlay d={`M ${pipeStartX} ${liquidOutY} L ${pipeEndX} ${liquidOutY}`} arrow />

      {/* ============== Instrument tags ============== */}
      {/* Every bubble below is paired with a compact value chip showing
          the *current* reading next to its tag. Reading source = twin
          instrument inventory, looked up by ISA tag (`${kind}-${loop}`).
          The placement of each chip (`valueAnchor`) is chosen so it
          never collides with the leader line: above the bubble when the
          leader drops downward, below when the leader points upward. */}

      {/* --- Inlet line: PIT-100 + TIT-100 + FIT-300 --- */}
      <InstrumentTag
        cx={120}
        cy={vesselMidY - 60}
        kind="PIT"
        loop="100"
        reading={readings.get('PIT-100')}
        valueAnchor="top"
      />
      <TagLeader x1={120} y1={vesselMidY - 42} x2={120} y2={vesselMidY - 4} />

      <InstrumentTag
        cx={170}
        cy={vesselMidY - 60}
        kind="TIT"
        loop="100"
        reading={readings.get('TIT-100')}
        valueAnchor="top"
      />
      <TagLeader x1={170} y1={vesselMidY - 42} x2={170} y2={vesselMidY - 4} />

      <InstrumentTag
        cx={220}
        cy={vesselMidY + 60}
        kind="FIT"
        loop="300"
        reading={readings.get('FIT-300')}
        valueAnchor="bottom"
      />
      <TagLeader x1={220} y1={vesselMidY + 42} x2={220} y2={vesselMidY + 4} />

      {/* --- Vessel internals: PIT-101 (line), TIT-200, PIT-201, DPIT-400 --- */}
      <InstrumentTag
        cx={VESSEL.x + 90}
        cy={VESSEL.y - 60}
        kind="PIT"
        loop="101"
        reading={readings.get('PIT-101')}
        valueAnchor="top"
      />
      <TagLeader x1={VESSEL.x + 90} y1={VESSEL.y - 42} x2={VESSEL.x + 90} y2={VESSEL.y - 4} />

      <InstrumentTag
        cx={VESSEL.x + 230}
        cy={VESSEL.y - 60}
        kind="TIT"
        loop="200"
        reading={readings.get('TIT-200')}
        valueAnchor="top"
      />
      <TagLeader x1={VESSEL.x + 230} y1={VESSEL.y - 42} x2={VESSEL.x + 230} y2={VESSEL.y - 4} />

      <InstrumentTag
        cx={VESSEL.x + 360}
        cy={VESSEL.y - 60}
        kind="PIT"
        loop="201"
        reading={readings.get('PIT-201')}
        valueAnchor="top"
      />
      <TagLeader x1={VESSEL.x + 360} y1={VESSEL.y - 42} x2={VESSEL.x + 360} y2={VESSEL.y - 4} />

      <InstrumentTag
        cx={vesselRightX - 130}
        cy={VESSEL.y - 60}
        kind="DPIT"
        loop="400"
        reading={readings.get('DPIT-400')}
        valueAnchor="top"
      />
      <TagLeader
        x1={vesselRightX - 130}
        y1={VESSEL.y - 42}
        x2={vesselRightX - 130}
        y2={VESSEL.y - 4}
      />

      {/* LIT-500 — vessel level transmitter (below vessel). Value chip
          drops below the bubble; the leader runs upward from the bubble
          into the vessel base, so there is no overlap. */}
      <InstrumentTag
        cx={VESSEL.x + VESSEL.w / 2}
        cy={vesselBottomY + 78}
        kind="LIT"
        loop="500"
        reading={readings.get('LIT-500')}
        valueAnchor="bottom"
      />
      <TagLeader
        x1={VESSEL.x + VESSEL.w / 2}
        y1={vesselBottomY + 60}
        x2={VESSEL.x + VESSEL.w / 2}
        y2={vesselBottomY + 4}
      />

      {/* --- Gas outlet line: PIT-501 + TIT-501 + FIT-501 ---
          Bubbles sit at y=20 (canvas top); value chips drop into the
          band between the bubble and the gas-outlet pipe at GAS_OUT_Y. */}
      <InstrumentTag
        cx={vesselRightX + 60}
        cy={20}
        kind="PIT"
        loop="501"
        reading={readings.get('PIT-501')}
        valueAnchor="bottom"
      />
      <TagLeader x1={vesselRightX + 60} y1={32} x2={vesselRightX + 60} y2={GAS_OUT_Y - 4} />

      <InstrumentTag
        cx={vesselRightX + 110}
        cy={20}
        kind="TIT"
        loop="501"
        reading={readings.get('TIT-501')}
        valueAnchor="bottom"
      />
      <TagLeader x1={vesselRightX + 110} y1={32} x2={vesselRightX + 110} y2={GAS_OUT_Y - 4} />

      <InstrumentTag
        cx={vesselRightX + 160}
        cy={20}
        kind="FIT"
        loop="501"
        reading={readings.get('FIT-501')}
        valueAnchor="bottom"
      />
      <TagLeader x1={vesselRightX + 160} y1={32} x2={vesselRightX + 160} y2={GAS_OUT_Y - 4} />

      {/* --- Liquid outlet line: PIT-601 + TIT-601 + FIT-601 + WCIT-600 ---
          The water-cut analyzer is rendered emphasized (accent ring) so
          the operator can see at a glance that water is measured here,
          not piped separately. The standalone "WATER CUT 32%" caption
          previously rendered beside the analyzer is removed — its value
          is now visible directly on the WCIT-600 bubble's chip. */}
      <InstrumentTag
        cx={vesselRightX + 60}
        cy={liquidOutY + 62}
        kind="PIT"
        loop="601"
        reading={readings.get('PIT-601')}
        valueAnchor="bottom"
      />
      <TagLeader
        x1={vesselRightX + 60}
        y1={liquidOutY + 50}
        x2={vesselRightX + 60}
        y2={liquidOutY + 6}
      />

      <InstrumentTag
        cx={vesselRightX + 110}
        cy={liquidOutY + 62}
        kind="TIT"
        loop="601"
        reading={readings.get('TIT-601')}
        valueAnchor="bottom"
      />
      <TagLeader
        x1={vesselRightX + 110}
        y1={liquidOutY + 50}
        x2={vesselRightX + 110}
        y2={liquidOutY + 6}
      />

      <InstrumentTag
        cx={vesselRightX + 160}
        cy={liquidOutY + 62}
        kind="FIT"
        loop="601"
        reading={readings.get('FIT-601')}
        valueAnchor="bottom"
      />
      <TagLeader
        x1={vesselRightX + 160}
        y1={liquidOutY + 50}
        x2={vesselRightX + 160}
        y2={liquidOutY + 6}
      />

      <InstrumentTag
        cx={vesselRightX + 110}
        cy={liquidOutY - 74}
        kind="WCIT"
        loop="600"
        emphasized
        reading={readings.get('WCIT-600')}
        valueAnchor="top"
      />
      <TagLeader
        x1={vesselRightX + 110}
        y1={liquidOutY - 56}
        x2={vesselRightX + 110}
        y2={liquidOutY - 6}
      />
      {/* Inline analyzer "valve body" marker on the liquid pipe — small
          square that signals an inline measurement device (not just a
          pressure tap). Slightly enlarged to match the heavier pipe. */}
      <rect
        x={vesselRightX + 101}
        y={liquidOutY - 10}
        width="20"
        height="20"
        fill="var(--bg-surface)"
        stroke="var(--brand-accent)"
        strokeWidth="1.4"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={vesselRightX + 101}
        y1={liquidOutY}
        x2={vesselRightX + 121}
        y2={liquidOutY}
        stroke="var(--brand-accent)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />

      {/* ============== In-vessel level legend (right side) ============== */}
      <g
        transform={`translate(${vesselRightX + 240}, ${VESSEL.y + 14})`}
        style={{ transition: 'all 800ms ease-in-out' }}
      >
        <LevelBadge color="var(--phase-gas)" pct={levels.gasPct} label="GAS" yOffset={0} />
        <LevelBadge
          color="var(--phase-oil)"
          pct={levels.oilPct}
          label="OIL"
          yOffset={62}
          ringColor="var(--text-secondary)"
        />
        <LevelBadge color="var(--phase-water)" pct={levels.waterPct} label="WATER" yOffset={124} />
      </g>

      {/* Outlet & inlet captions.
          Anchored to the pipe ends with text-anchor="end" so they read
          *inward* from the right edge — keeps full text inside the SVG
          viewBox (no clipping) and clear of the right-side phase legend
          column. Gas caption sits *below* its pipe (instruments above);
          liquid caption sits *above* its pipe (PIT/TIT/FIT below). */}
      <OutletLabel x={pipeEndX} y={GAS_OUT_Y + 22} text="GAS OUTLET" anchor="end" />
      <OutletLabel x={pipeEndX} y={liquidOutY - 32} text="LIQUID OUTLET" anchor="end" />
      <OutletLabel x={48} y={vesselMidY - 14} text="MULTIPHASE INLET" />
    </svg>
  );
};

// ============== Helpers ==================================================

const FlowOverlay = ({ d, arrow }: { d: string; arrow?: boolean }) => (
  <path
    d={d}
    fill="none"
    stroke="var(--brand-accent)"
    strokeOpacity="0.6"
    strokeWidth="2"
    strokeDasharray="6 6"
    strokeLinecap="round"
    vectorEffect="non-scaling-stroke"
    markerEnd={arrow ? 'url(#flowArrow)' : undefined}
    className="flow-anim"
  />
);

const InstrumentTag = ({
  cx,
  cy,
  kind,
  loop,
  r = 18,
  emphasized = false,
  reading,
  valueAnchor = 'bottom',
}: {
  cx: number;
  cy: number;
  kind: InstrumentKind;
  loop: string;
  r?: number;
  /** Highlight ring + slightly heavier text. Used for the WCIT analyzer so
   *  it doesn't disappear into the row of standard PIT/TIT/FIT chips. */
  emphasized?: boolean;
  /** Optional current reading for the bubble. When provided, renders a
   *  compact value+unit chip directly above or below the bubble, with a
   *  small bg-canvas backing rect so it stays legible over any crossing
   *  leader line or pipe. Color follows the instrument's display tone. */
  reading?: DiagramReading;
  /** Which side of the bubble the value chip sits on. Chosen per call
   *  site so the chip never overlaps the leader line. */
  valueAnchor?: 'top' | 'bottom';
}) => {
  const chipY = valueAnchor === 'top' ? cy - r - 9 : cy + r + 11;
  const chipText = reading ? `${reading.value} ${reading.unit}`.trim() : '';
  // Width estimate: 7 px per character at 8 pt mono (close enough for a
  // backing rect; the rect is purely decorative — only there to mask the
  // dashed leader behind short on-diagram values).
  const chipW = chipText.length * 6.2 + 8;
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="var(--bg-surface)"
        stroke={emphasized ? 'var(--brand-accent)' : 'var(--text-secondary)'}
        strokeWidth={emphasized ? 1.8 : 1.4}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={cx - r}
        y1={cy}
        x2={cx + r}
        y2={cy}
        stroke={emphasized ? 'var(--brand-accent)' : 'var(--text-secondary)'}
        strokeWidth="0.8"
        opacity="0.6"
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={cx}
        y={cy - 3}
        textAnchor="middle"
        fontSize={kind === 'WCIT' || kind === 'DPIT' ? 8 : 9}
        fontFamily="var(--font-mono)"
        fontWeight="700"
        fill="var(--text-primary)"
        letterSpacing="0.05em"
      >
        {kind}
      </text>
      <text
        x={cx}
        y={cy + 11}
        textAnchor="middle"
        fontSize="9"
        fontFamily="var(--font-mono)"
        fill="var(--text-secondary)"
      >
        {loop}
      </text>
      {reading && chipText.length > 0 ? (
        <g>
          <rect
            x={cx - chipW / 2}
            y={chipY - 7}
            width={chipW}
            height={11}
            rx={1.5}
            fill="var(--bg-canvas)"
            opacity="0.92"
          />
          <text
            x={cx}
            y={chipY + 1}
            textAnchor="middle"
            fontSize="8"
            fontFamily="var(--font-mono)"
            fontWeight={reading.tone === 'normal' ? 600 : 700}
            fill={TONE_FILL[reading.tone]}
            letterSpacing="0.02em"
          >
            {chipText}
          </text>
        </g>
      ) : null}
    </g>
  );
};

const TagLeader = ({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) => (
  <line
    x1={x1}
    y1={y1}
    x2={x2}
    y2={y2}
    stroke="var(--text-secondary)"
    strokeWidth="0.8"
    strokeDasharray="2 3"
    opacity="0.5"
    vectorEffect="non-scaling-stroke"
  />
);

const LevelBadge = ({
  color,
  pct,
  label,
  yOffset,
  ringColor,
}: {
  color: string;
  pct: number;
  label: string;
  yOffset: number;
  ringColor?: string;
}) => (
  <g transform={`translate(0 ${yOffset})`}>
    <rect
      x="0"
      y="0"
      width="8"
      height="46"
      fill={color}
      stroke={ringColor ?? 'none'}
      strokeWidth={ringColor ? 0.8 : 0}
      vectorEffect="non-scaling-stroke"
    />
    <text
      x="18"
      y="16"
      fontSize="14"
      fontFamily="var(--font-mono)"
      fontWeight="700"
      fill="var(--text-primary)"
    >
      {pct.toFixed(1)}%
    </text>
    <text
      x="18"
      y="34"
      fontSize="9"
      fontFamily="var(--font-mono)"
      letterSpacing="0.1em"
      fill="var(--text-muted)"
    >
      {label}
    </text>
  </g>
);

const OutletLabel = ({
  x,
  y,
  text,
  anchor = 'start',
}: {
  x: number;
  y: number;
  text: string;
  /** Default `start` keeps inlet caption left-aligned. Outlet captions on
   *  the right side pass `end` so they read inward from the pipe end and
   *  stay clear of the right-side phase legend. */
  anchor?: 'start' | 'end';
}) => (
  <text
    x={x}
    y={y}
    textAnchor={anchor}
    fontSize="9"
    fontFamily="var(--font-mono)"
    fontWeight="600"
    letterSpacing="0.1em"
    fill="var(--text-muted)"
  >
    {text}
  </text>
);
