import { cn } from '@rvf/ui';

import type { UnitTwin } from './data/twin.mock';

import { Panel } from '@/components/shell/Panel';

/**
 * UnitHealthPanel — rollup of the unit's operational health.
 *
 * Highest-level "do I trust this unit right now?" answer in one chip,
 * backed by three sub-indicators: data quality, instrument health,
 * calibration cadence. Matches the right-rail Panel discipline.
 */
export interface UnitHealthPanelProps {
  twin: UnitTwin;
}

type Verdict = 'HEALTHY' | 'DEGRADED' | 'CRITICAL';

const verdictStyles: Record<Verdict, { text: string; bg: string; dot: string }> = {
  HEALTHY: { text: 'text-status-normal', bg: 'bg-status-normal/15', dot: 'bg-status-normal' },
  DEGRADED: { text: 'text-status-warn', bg: 'bg-status-warn/15', dot: 'bg-status-warn' },
  CRITICAL: { text: 'text-status-alarm', bg: 'bg-status-alarm/15', dot: 'bg-status-alarm' },
};

export const UnitHealthPanel = ({ twin }: UnitHealthPanelProps) => {
  const badInstruments = twin.instruments.filter((i) => i.health === 'BAD').length;
  const degradedInstruments = twin.instruments.filter((i) => i.health === 'DEGRADED').length;
  const overdueCal = twin.calibrations.filter((c) => c.dueDays < 0).length;

  const verdict: Verdict =
    badInstruments > 0 || twin.status === 'ALARM' || twin.dataQualityPct < 90
      ? 'CRITICAL'
      : degradedInstruments > 0 || overdueCal > 0 || twin.dataQualityPct < 97
        ? 'DEGRADED'
        : 'HEALTHY';

  const v = verdictStyles[verdict];

  return (
    <Panel
      title="Unit Health"
      meta={
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs font-semibold uppercase tracking-micro',
            v.bg,
            v.text,
          )}
        >
          <span aria-hidden="true" className={cn('inline-block w-1.5 h-1.5 rounded-full', v.dot)} />
          {verdict}
        </span>
      }
    >
      <ul className="flex flex-col">
        <Indicator
          label="Data Quality"
          value={`${twin.dataQualityPct.toFixed(1)}%`}
          tone={
            twin.dataQualityPct >= 97
              ? 'text-status-normal'
              : twin.dataQualityPct >= 90
                ? 'text-status-warn'
                : 'text-status-alarm'
          }
        />
        <Indicator
          label="Instruments"
          value={`${twin.instruments.length - badInstruments - degradedInstruments}/${twin.instruments.length}`}
          tone={
            badInstruments > 0
              ? 'text-status-alarm'
              : degradedInstruments > 0
                ? 'text-status-warn'
                : 'text-status-normal'
          }
        />
        <Indicator
          label="Calibration"
          value={overdueCal > 0 ? `${overdueCal} overdue` : 'Current'}
          tone={overdueCal > 0 ? 'text-status-alarm' : 'text-status-normal'}
        />
        <Indicator
          label="Communication"
          value={twin.comm}
          tone={
            twin.comm === 'ONLINE'
              ? 'text-status-normal'
              : twin.comm === 'DEGRADED'
                ? 'text-status-warn'
                : 'text-status-alarm'
          }
        />
      </ul>
    </Panel>
  );
};

const Indicator = ({ label, value, tone }: { label: string; value: string; tone: string }) => (
  <li className="flex items-center justify-between py-2 border-b border-border-subtle last:border-b-0">
    <span className="text-xs text-text-secondary">{label}</span>
    <span className={cn('text-xs font-semibold tabular-nums uppercase tracking-micro', tone)}>
      {value}
    </span>
  </li>
);
