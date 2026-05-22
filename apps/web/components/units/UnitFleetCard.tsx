import { cn } from '@rvf/ui';
import { CalendarClock, ClipboardSignature, MapPin } from 'lucide-react';

import { formatHours, type UnitFleetEntry, type UnitFleetStatus } from './data/fleet.mock';

import { UnitImage } from '@/components/operations/UnitImage';

/**
 * UnitFleetCard — registry-style card for a single unit. Shares the visual
 * DNA of MultiphaseUnitCard (left status accent, header chip, label-over-
 * value meta, label-over-value footer) but renders fleet metadata instead
 * of live telemetry — the right tool for the /units surface.
 */
const statusStyles: Record<UnitFleetStatus, { chip: string; accent: string; dot: string }> = {
  DEPLOYED: {
    chip: 'bg-status-info/15 text-status-info border-status-info/50',
    accent: 'border-l-status-info',
    dot: 'bg-status-info',
  },
  IDLE: {
    chip: 'bg-status-stale/15 text-status-stale border-status-stale/50',
    accent: 'border-l-status-stale',
    dot: 'bg-status-stale',
  },
  MAINTENANCE: {
    chip: 'bg-status-warn/15 text-status-warn border-status-warn/50',
    accent: 'border-l-status-warn',
    dot: 'bg-status-warn',
  },
  DECOMMISSIONED: {
    chip: 'bg-status-alarm/15 text-status-alarm border-status-alarm/50',
    accent: 'border-l-status-alarm',
    dot: 'bg-status-alarm',
  },
};

const calibrationTone = (days: number): { label: string; cls: string } => {
  if (days < 0) return { label: `${Math.abs(days)} d overdue`, cls: 'text-status-alarm' };
  if (days <= 7) return { label: `Due in ${days} d`, cls: 'text-status-warn' };
  return { label: `Due in ${days} d`, cls: 'text-text-primary' };
};

export const UnitFleetCard = ({ unit }: { unit: UnitFleetEntry }) => {
  const styles = statusStyles[unit.status];
  const cal = calibrationTone(unit.calibrationDueDays);

  return (
    <article
      className={cn(
        'flex flex-col gap-3.5',
        'bg-surface border border-border-subtle rounded-sm border-l-2',
        styles.accent,
        'p-4',
        'transition-colors duration-fast ease-industrial hover:border-border-strong',
      )}
      aria-label={`Unit ${unit.unitNumber}`}
    >
      <header className="flex items-start gap-3">
        <UnitImage className="w-14 h-9" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold tracking-wide uppercase text-text-primary">
              Multiphase Unit #{unit.unitNumber}
            </h3>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-xs',
                'text-micro uppercase tracking-micro font-bold border',
                styles.chip,
              )}
            >
              <span
                aria-hidden="true"
                className={cn('inline-block w-1.5 h-1.5 rounded-full', styles.dot)}
              />
              {unit.status}
            </span>
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-0.5 text-xs">
            <Meta label="Asset" value={unit.assetTag} mono />
            <Meta label="Last Well" value={unit.lastWell} mono />
            <Meta label="Hours" value={formatHours(unit.operatingHours)} mono />
          </dl>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border-subtle">
        <FooterMetric
          icon={<CalendarClock className="w-3 h-3" aria-hidden="true" />}
          label="Calibration"
          value={cal.label}
          valueClass={cal.cls}
        />
        <FooterMetric
          icon={<ClipboardSignature className="w-3 h-3" aria-hidden="true" />}
          label="Last Cal."
          value={unit.lastCalibrationDate}
        />
        <FooterMetric
          icon={<MapPin className="w-3 h-3" aria-hidden="true" />}
          label="Location"
          value={unit.location}
        />
      </div>
    </article>
  );
};

const Meta = ({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) => (
  <div className="min-w-0">
    <dt className="text-micro uppercase tracking-micro text-text-muted">{label}</dt>
    <dd
      className={cn('text-text-primary truncate', mono ? 'font-mono tabular-nums' : 'font-medium')}
    >
      {value}
    </dd>
  </div>
);

const FooterMetric = ({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) => (
  <div className="flex flex-col gap-0.5 min-w-0">
    <span className="text-micro uppercase tracking-micro text-text-muted flex items-center gap-1">
      {icon}
      {label}
    </span>
    <span
      className={cn(
        'text-xs font-semibold tabular-nums truncate',
        valueClass ?? 'text-text-primary',
      )}
    >
      {value}
    </span>
  </div>
);
