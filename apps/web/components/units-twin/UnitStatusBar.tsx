import { cn } from '@rvf/ui';

import { formatDuration, type TwinStatus, type UnitTwin } from './data/twin.mock';

/**
 * UnitStatusBar — six-cell status strip directly under the page header.
 *
 * Carries the operator's at-a-glance context: which well, which job, the
 * current operational status of the unit, where it physically lives,
 * data quality, and comm health. Same label-over-value pattern as the
 * MultiphaseUnitCard footer on /operations so the operator's eye is
 * already trained on the rhythm.
 */
export interface UnitStatusBarProps {
  twin: UnitTwin;
}

const STATUS_TONE: Record<TwinStatus, string> = {
  TESTING: 'text-status-info',
  STABILIZING: 'text-status-warn',
  ALARM: 'text-status-alarm',
  OFFLINE: 'text-status-stale',
  MAINTENANCE: 'text-status-stale',
};

export const UnitStatusBar = ({ twin }: UnitStatusBarProps) => {
  const qualityTone =
    twin.dataQualityPct >= 97
      ? 'text-status-normal'
      : twin.dataQualityPct >= 90
        ? 'text-status-warn'
        : 'text-status-alarm';

  const statusTone = STATUS_TONE[twin.status];

  const commTone = {
    ONLINE: 'text-status-normal',
    DEGRADED: 'text-status-warn',
    OFFLINE: 'text-status-alarm',
  }[twin.comm];

  return (
    <div
      className="bg-surface border border-border-subtle rounded-sm grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-5 gap-y-2 p-4"
      aria-label="Unit status"
    >
      <Cell label="Well" value={twin.well} mono />
      <Cell label="Job" value={twin.job} />
      <Cell label="Status" value={twin.status} valueClass={statusTone} mono />
      <Cell label="Location" value={twin.location.site} />
      <Cell label="Duration" value={formatDuration(twin.durationSec)} mono />
      <Cell
        label="Quality / Comm"
        value={`${twin.dataQualityPct.toFixed(1)}% · ${twin.comm}`}
        valueClass={cn(qualityTone, commTone)}
        mono
      />
    </div>
  );
};

const Cell = ({
  label,
  value,
  valueClass,
  mono = false,
}: {
  label: string;
  value: string;
  valueClass?: string;
  mono?: boolean;
}) => (
  <div className="min-w-0 flex flex-col gap-0.5">
    <span className="text-micro uppercase tracking-micro text-text-muted">{label}</span>
    <span
      className={cn(
        'text-sm font-semibold truncate',
        mono ? 'font-mono tabular-nums' : '',
        valueClass ?? 'text-text-primary',
      )}
    >
      {value}
    </span>
  </div>
);
