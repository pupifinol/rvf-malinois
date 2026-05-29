import { OPERATIONS_JOBS } from '@/components/operations/data/operationsJobs';
import { FieldConditionsPanel } from '@/components/operations/FieldConditionsPanel';
import { LiveActiveAlarmsPanel } from '@/components/operations/LiveActiveAlarmsPanel';
import { LiveCommunicationHealthPanel } from '@/components/operations/LiveCommunicationHealthPanel';
import { LiveMultiphaseUnitGrid } from '@/components/operations/LiveMultiphaseUnitGrid';
import { LiveTrendsPanelLive } from '@/components/operations/LiveTrendsPanelLive';
import { OperationsHeaderRight } from '@/components/operations/OperationsHeaderRight';
import { OperationsTelemetryRuntime } from '@/components/operations/OperationsTelemetryRuntime';
import { OperationsTrendDrawerProvider } from '@/components/operations/OperationsTrendDrawer';
import { PageHeader } from '@/components/shell/PageHeader';

/**
 * Operations Console — Live Operations Overview (F2B).
 *
 * Server component shell that:
 *
 *   1. Mounts the OperationsTelemetryRuntime once on the client — that
 *      starts the F2A SimulatedNormalizedTelemetryAdapter and connects
 *      it to the singleton TelemetryStore.
 *   2. Renders the page chrome statically (header, layout) so the SSR
 *      output is fast and indexable.
 *   3. Delegates the data-rendering parts to client components that
 *      subscribe to the store through F2A hooks.
 *
 * Visual baseline preserved from F2A — same grid, same right rail, same
 * page header. Static panels (FieldConditionsPanel) remain unchanged;
 * data-driven panels are F2B "Live*" components rendered alongside them.
 */

export default function OperationsPage() {
  return (
    <OperationsTrendDrawerProvider>
      <div className="flex flex-col gap-4">
        <OperationsTelemetryRuntime />

        <PageHeader
          title="Live Operations Overview"
          subtitle="Real-time status of active well testing units · F2 simulated normalized stream"
          right={<OperationsHeaderRight />}
        />

        <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
          {/* Main column — units + trends */}
          <div className="flex flex-col gap-4 min-w-0">
            <LiveMultiphaseUnitGrid />
            <LiveTrendsPanelLive />
          </div>

          {/* Right rail */}
          <aside className="flex flex-col gap-3 2xl:max-w-[320px]">
            <LiveActiveAlarmsPanel jobs={OPERATIONS_JOBS.map((b) => b.job)} />
            <LiveCommunicationHealthPanel />
            <FieldConditionsPanel />
          </aside>
        </div>
      </div>
    </OperationsTrendDrawerProvider>
  );
}
