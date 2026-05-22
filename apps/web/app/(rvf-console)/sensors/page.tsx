'use client';

import { useMemo, useState } from 'react';

import { CommunicationHealthPanel } from '@/components/operations/CommunicationHealthPanel';
import { CalibrationStatusDial } from '@/components/sensors/CalibrationStatusDial';
import { sensors, type SensorCategory } from '@/components/sensors/data/sensors.mock';
import { InstrumentationOverviewPanel } from '@/components/sensors/InstrumentationOverviewPanel';
import { MaintenanceDuePanel } from '@/components/sensors/MaintenanceDuePanel';
import { QuickActionsPanel } from '@/components/sensors/QuickActionsPanel';
import { SensorDetailPreview } from '@/components/sensors/SensorDetailPreview';
import { SensorEventsTimeline } from '@/components/sensors/SensorEventsTimeline';
import { SensorInventoryTable } from '@/components/sensors/SensorInventoryTable';
import { SensorStatusStrip } from '@/components/sensors/SensorStatusStrip';
import { PageHeader, StatusChip } from '@/components/shell/PageHeader';

/**
 * Sensors — Industrial Instrumentation & Reliability Center.
 *
 * Layout (tuned for a 16:9 control room monitor):
 *   1. Operational header + 7-cell status strip
 *   2. Main 3-column grid:
 *        Left:   InstrumentationOverviewPanel (category rollup + health metrics)
 *        Center: SensorInventoryTable (tabs + filters, selectable rows)
 *        Right:  Comm Health · Calibration Status · Maintenance Due ·
 *                Quick Actions
 *   3. Bottom 2-column row:
 *        Left:   SensorDetailPreview (driven by table selection)
 *        Right:  SensorEventsTimeline (SCADA event log)
 *
 * Selection lives in client state so the inventory table can drive the
 * detail preview without a round-trip. When F2 wires the live WebSocket
 * stream, the mocks are replaced and nothing else needs to change.
 */
export default function SensorsPage() {
  const [category, setCategory] = useState<SensorCategory>('ALL');
  const [selectedId, setSelectedId] = useState<string>(sensors[0]?.id ?? '');

  const selectedSensor = useMemo(
    () => sensors.find((s) => s.id === selectedId) ?? sensors[0],
    [selectedId],
  );

  const online = sensors.filter((s) => s.status === 'ONLINE').length;
  const attention = sensors.filter((s) => s.status !== 'ONLINE').length;

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Field Instrumentation Health"
        subtitle="Field instrumentation, telemetry integrity, and sensor reliability across deployed units"
        right={
          <>
            <StatusChip>
              {online}/{sensors.length} Online
            </StatusChip>
            <StatusChip tone={attention > 0 ? 'warn' : 'normal'}>
              {attention > 0 ? `${attention} Need Attention` : 'All Sensors Nominal'}
            </StatusChip>
          </>
        }
      />

      <SensorStatusStrip sensors={sensors} />

      {/* Main 3-column grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,300px)] gap-3">
        <InstrumentationOverviewPanel sensors={sensors} />
        <SensorInventoryTable
          sensors={sensors}
          category={category}
          onCategoryChange={setCategory}
          selectedSensorId={selectedSensor?.id ?? ''}
          onSelect={setSelectedId}
        />
        <aside className="flex flex-col gap-2.5 xl:max-w-[300px]">
          <CommunicationHealthPanel />
          <CalibrationStatusDial sensors={sensors} />
          <MaintenanceDuePanel sensors={sensors} />
          <QuickActionsPanel />
        </aside>
      </div>

      {/* Bottom row: detail + events */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        {selectedSensor ? (
          <SensorDetailPreview sensor={selectedSensor} />
        ) : (
          <div className="bg-surface border border-border-subtle rounded-sm p-4 text-xs text-text-muted">
            Select a sensor from the inventory to preview details.
          </div>
        )}
        <SensorEventsTimeline />
      </div>
    </div>
  );
}
