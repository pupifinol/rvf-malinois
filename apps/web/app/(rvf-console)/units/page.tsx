'use client';

import { useMemo, useState } from 'react';

import { CommunicationHealthPanel } from '@/components/operations/CommunicationHealthPanel';
import { PageHeader, StatusChip } from '@/components/shell/PageHeader';
import { Panel } from '@/components/shell/Panel';
import { CalibrationStatusPanel } from '@/components/units-twin/CalibrationStatusPanel';
import { CompositionBars } from '@/components/units-twin/CompositionBars';
import { twins } from '@/components/units-twin/data/twin.mock';
import { EngineeringLimitsPanel } from '@/components/units-twin/EngineeringLimitsPanel';
import { InstrumentSummaryPanel } from '@/components/units-twin/InstrumentSummaryPanel';
import { LinePressureCard } from '@/components/units-twin/LinePressureCard';
import { LiveInstrumentReadingsPanel } from '@/components/units-twin/LiveInstrumentReadingsPanel';
import { ProcessVariableTile } from '@/components/units-twin/ProcessVariableTile';
import { SeparatorDiagram } from '@/components/units-twin/SeparatorDiagram';
import { TelemetrySourcePanel } from '@/components/units-twin/TelemetrySourcePanel';
import { UnitAlarmThresholdsPanel } from '@/components/units-twin/UnitAlarmThresholdsPanel';
import { UnitConfigurationSummary } from '@/components/units-twin/UnitConfigurationSummary';
import { UnitHealthPanel } from '@/components/units-twin/UnitHealthPanel';
import { UnitProfileTag } from '@/components/units-twin/UnitProfileTag';
import { UnitSelector } from '@/components/units-twin/UnitSelector';
import { UnitStatusBar } from '@/components/units-twin/UnitStatusBar';
import { UnitTabs } from '@/components/units-twin/UnitTabs';
import { useUnitsFleet } from '@/lib/hooks/useUnitsFleet';

/**
 * Units — Process Twin (active unit).
 *
 * Per-unit telemetry engineering screen. A digital twin of one multiphase
 * well-testing separator focused on the *real* process: one multiphase
 * inlet, one gas outlet, one liquid outlet (oil + water combined, water
 * cut measured by an inline analyzer).
 *
 * Layout (tuned for a 16:9 control room monitor):
 *   1. Operational header: title, unit selector (#1/#2), status chip
 *   2. UnitStatusBar — well/job/status/started/duration/quality+comm
 *   3. Main grid (1fr + 280px right rail):
 *        a) Variable tile clusters — GAS / SEPARADOR / ENTRADA above diagram
 *        b) Hero separator diagram (instrument bubbles show live readings)
 *        c) Below-diagram row: PRESIÓN DE LÍNEA + COMPOSICIÓN + VARIABLES DESCARGA
 *        d) Unit configuration · alarm thresholds · telemetry source
 *        e) Live Instrument Readings table (F3.1)
 *      Right rail: Unit Health · Instrument Summary · Communication · Last Cal.
 *
 * Production trends live on /operations, not here.
 */
export default function UnitsPage() {
  // F4.5F — selector roster comes from the data-source-aware hook (mock or
  // F4 backend). The active digital-twin payload (telemetry, instruments,
  // calibration, alarm thresholds, …) still resolves out of the local
  // `twins` mock because F4 has no live-reading payload yet — F4.6 will
  // populate that side of the wire. When the active id has no local twin
  // match (api mode listing F4 units that don't exist in the local mock),
  // the page falls back to `twins[0]` so the process-twin panels still
  // render without a runtime crash.
  const fleet = useUnitsFleet();
  const selectorItems = fleet.items.length > 0 ? fleet.items : twins;
  const [activeId, setActiveId] = useState<string>(twins[0].id);
  const twin = useMemo(() => {
    const match = twins.find((u) => u.id === activeId);
    return match ?? twins[0];
  }, [activeId]);

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title={`Multiphase Unit #${twin.unitNumber}`}
        subtitle={`Process visualization · digital twin · ${twin.config.unitClass}`}
        right={
          <>
            <UnitProfileTag profile={twin.config.profileTag} />
            <UnitSelector units={selectorItems} activeId={twin.id} onSelect={setActiveId} />
            <StatusChip
              tone={
                twin.status === 'ALARM'
                  ? 'alarm'
                  : twin.status === 'OFFLINE' || twin.status === 'MAINTENANCE'
                    ? 'stale'
                    : 'info'
              }
            >
              {twin.status}
            </StatusChip>
          </>
        }
      />

      <UnitStatusBar twin={twin} />

      <UnitTabs active="Overview" />

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_280px] gap-3">
        {/* ===== Central process visualization ===== */}
        <div className="flex flex-col gap-3 min-w-0">
          {/* Variable groupings above the diagram — GAS / SEPARADOR / ENTRADA. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <Panel title="Variables Gas" density="compact">
              <div className="grid grid-cols-2 gap-2">
                <ProcessVariableTile
                  variable={twin.gasOutlet.pressure}
                  sparkColor="text-series-1"
                />
                <ProcessVariableTile variable={twin.gasOutlet.flow} sparkColor="text-phase-gas" />
              </div>
            </Panel>
            <Panel title="Variables Separador" density="compact">
              <div className="grid grid-cols-2 gap-2">
                <ProcessVariableTile
                  variable={twin.separation.pressure}
                  sparkColor="text-series-1"
                />
                <ProcessVariableTile
                  variable={twin.separation.temperature}
                  sparkColor="text-series-2"
                />
              </div>
            </Panel>
            <Panel title="Variables Entrada" density="compact">
              <div className="grid grid-cols-2 gap-2">
                <ProcessVariableTile variable={twin.inlet.pressure} sparkColor="text-series-1" />
                <ProcessVariableTile variable={twin.inlet.flow} sparkColor="text-series-2" />
              </div>
            </Panel>
          </div>

          {/* Hero diagram */}
          <section
            className="bg-surface border border-border-subtle rounded-sm p-3 flex flex-col gap-2"
            aria-label="Process visualization"
          >
            <header className="flex items-center justify-between">
              <h2 className="text-micro uppercase tracking-wide font-bold text-text-primary">
                Separator · Three-Phase Process Flow
              </h2>
              <div className="flex items-center gap-3 text-micro uppercase tracking-micro font-mono">
                <PhaseSwatch label="Gas" color="bg-phase-gas" />
                <PhaseSwatch label="Crude" color="bg-phase-oil" ringed />
                <PhaseSwatch label="Water" color="bg-phase-water" />
                <span className="text-text-muted">P-201</span>
              </div>
            </header>
            <SeparatorDiagram twin={twin} />
          </section>

          {/* Below-diagram row: PRESIÓN DE LÍNEA + COMPOSICIÓN + VARIABLES DESCARGA.
              The DESCARGA panel intentionally surfaces water cut next to liquid
              flow + temperature — the operator's "what is leaving the vessel"
              line. Water cut is %, not bwpd, because water has no dedicated pipe. */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
            <LinePressureCard variable={twin.linePressure} />
            <CompositionBars composition={twin.composition} />
            <Panel
              title="Variables Descarga (Liquid Outlet)"
              density="compact"
              meta={<span className="font-mono">FIT-601 · WCIT-600</span>}
            >
              <div className="grid grid-cols-3 gap-2">
                <ProcessVariableTile variable={twin.liquidOutlet.flow} sparkColor="text-series-2" />
                <ProcessVariableTile
                  variable={twin.liquidOutlet.temperature}
                  sparkColor="text-series-2"
                />
                <ProcessVariableTile
                  variable={twin.liquidOutlet.waterCut}
                  sparkColor="text-phase-water"
                />
              </div>
            </Panel>
          </div>

          {/* ===== Per-unit configuration band — identity, thresholds, telemetry ===== */}
          <UnitConfigurationSummary twin={twin} />
          <UnitAlarmThresholdsPanel twin={twin} />
          <TelemetrySourcePanel twin={twin} />

          {/* ===== F3.1: live transmitter snapshot — current reading per
              instrument. Intentionally NOT a trends/production view; the
              Operations screen owns process visualization + history. ===== */}
          <LiveInstrumentReadingsPanel twin={twin} />
        </div>

        {/* ===== Right operational rail ===== */}
        <aside className="flex flex-col gap-2.5 2xl:max-w-[280px]">
          <UnitHealthPanel twin={twin} />
          <EngineeringLimitsPanel twin={twin} />
          <InstrumentSummaryPanel twin={twin} />
          <CommunicationHealthPanel />
          <CalibrationStatusPanel twin={twin} />
        </aside>
      </div>
    </div>
  );
}

const PhaseSwatch = ({
  label,
  color,
  ringed = false,
}: {
  label: string;
  color: string;
  ringed?: boolean;
}) => (
  <span className="inline-flex items-center gap-1.5 text-text-secondary">
    <span
      aria-hidden="true"
      className={`inline-block w-2.5 h-2.5 rounded-xs ${color} ${
        ringed ? 'border border-border-strong' : ''
      }`}
    />
    {label}
  </span>
);
