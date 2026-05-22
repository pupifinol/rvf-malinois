import { ActiveAlarmsPanel } from '@/components/operations/ActiveAlarmsPanel';
import { CommunicationHealthPanel } from '@/components/operations/CommunicationHealthPanel';
import { units } from '@/components/operations/data/units.mock';
import { FieldConditionsPanel } from '@/components/operations/FieldConditionsPanel';
import { LiveTrendsPanel } from '@/components/operations/LiveTrendsPanel';
import { MultiphaseUnitCard } from '@/components/operations/MultiphaseUnitCard';
import { PageHeader, StatusChip } from '@/components/shell/PageHeader';

/**
 * Operations Console — Live Operations Overview.
 *
 * Single-screen, single-glance view of every active multiphase well-testing
 * unit. Grid is driven by the `units` array, so a 3rd/4th/5th unit shows up
 * by appending to the mock (or, in F2, the live telemetry feed) — no layout
 * code changes.
 *
 * This page is also the **canonical visual baseline** for the rest of the
 * console (units, sensors, alarms, reports, settings). Shared chrome lives
 * in components/shell/PageHeader and components/shell/Panel.
 */

const gridColsByCount = (n: number): string => {
  if (n <= 1) return 'grid-cols-1';
  if (n <= 4) return 'grid-cols-1 xl:grid-cols-2';
  return 'grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3';
};

export default function OperationsPage() {
  const density: 'comfortable' | 'compact' = units.length >= 5 ? 'compact' : 'comfortable';
  const gridCols = gridColsByCount(units.length);

  const inAlarm = units.some((u) => u.status === 'ALARM' || u.status === 'OFFLINE');
  const globalState = inAlarm ? 'Attention Required' : 'All Systems Nominal';

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Live Operations Overview"
        subtitle="Real-time status of active well testing units"
        right={
          <>
            <StatusChip>
              {units.length} Active Unit{units.length === 1 ? '' : 's'}
            </StatusChip>
            <StatusChip tone={inAlarm ? 'alarm' : 'normal'}>{globalState}</StatusChip>
          </>
        }
      />

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
        {/* Main column — units + trends */}
        <div className="flex flex-col gap-4 min-w-0">
          <section className={`grid gap-3 ${gridCols}`} aria-label="Active multiphase units">
            {units.map((unit) => (
              <MultiphaseUnitCard key={unit.id} unit={unit} density={density} />
            ))}
          </section>

          <LiveTrendsPanel units={units} />
        </div>

        {/* Right rail */}
        <aside className="flex flex-col gap-3 2xl:max-w-[320px]">
          <ActiveAlarmsPanel />
          <CommunicationHealthPanel />
          <FieldConditionsPanel />
        </aside>
      </div>
    </div>
  );
}
