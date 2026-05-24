/**
 * LiveMultiphaseUnitGrid — F2B.
 *
 * Renders one LiveMultiphaseUnitCard per OPERATIONS_JOBS binding, using
 * the same grid breakpoints as the legacy static page. Subscribes to the
 * connection status once and forwards it down so every card's signal icon
 * agrees with the global connection.
 */
'use client';

import { OPERATIONS_JOBS } from './data/operationsJobs';
import { LiveMultiphaseUnitCard } from './LiveMultiphaseUnitCard';

import { useConnectionStatus } from '@/lib/hooks';

const gridColsByCount = (n: number): string => {
  if (n <= 1) return 'grid-cols-1';
  if (n <= 4) return 'grid-cols-1 xl:grid-cols-2';
  return 'grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3';
};

export const LiveMultiphaseUnitGrid = () => {
  const conn = useConnectionStatus();
  const density: 'comfortable' | 'compact' =
    OPERATIONS_JOBS.length >= 5 ? 'compact' : 'comfortable';
  const gridCols = gridColsByCount(OPERATIONS_JOBS.length);

  return (
    <section className={`grid gap-3 ${gridCols}`} aria-label="Active multiphase units">
      {OPERATIONS_JOBS.map((b) => (
        <LiveMultiphaseUnitCard
          key={String(b.job.jobId)}
          job={b.job}
          displayNumber={b.displayNumber}
          displayName={b.displayName}
          connectionStatus={conn}
          density={density}
        />
      ))}
    </section>
  );
};
