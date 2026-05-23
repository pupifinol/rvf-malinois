import { cn } from '@rvf/ui';

import type { SafetyState, UnitTwin } from './data/twin.mock';

import { Panel } from '@/components/shell/Panel';

/**
 * EngineeringLimitsPanel — right-rail roll-up of the unit's remaining
 * operating headroom.
 *
 * Same row rhythm as UnitHealthPanel / CommunicationHealthPanel:
 * label on the left, monospace value on the right, tone derived from
 * the margin (green ≥ 20%, amber 10-19%, red < 10%). A safety-state
 * pill in the panel meta tells the operator at a glance whether the
 * unit is in its normal envelope.
 */
const SAFETY: Record<SafetyState, { text: string; bg: string; dot: string }> = {
  NORMAL: { text: 'text-status-normal', bg: 'bg-status-normal/15', dot: 'bg-status-normal' },
  CAUTION: { text: 'text-status-warn', bg: 'bg-status-warn/15', dot: 'bg-status-warn' },
  TRIP: { text: 'text-status-alarm', bg: 'bg-status-alarm/15', dot: 'bg-status-alarm' },
};

const marginTone = (pct: number): string =>
  pct >= 20 ? 'text-status-normal' : pct >= 10 ? 'text-status-warn' : 'text-status-alarm';

export interface EngineeringLimitsPanelProps {
  twin: UnitTwin;
}

export const EngineeringLimitsPanel = ({ twin }: EngineeringLimitsPanelProps) => {
  const { margins, safetyState } = twin.config;
  const s = SAFETY[safetyState];
  return (
    <Panel
      title="Engineering Limits"
      density="compact"
      meta={
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs font-semibold uppercase tracking-micro',
            s.bg,
            s.text,
          )}
        >
          <span aria-hidden="true" className={cn('inline-block w-1.5 h-1.5 rounded-full', s.dot)} />
          {safetyState}
        </span>
      }
    >
      <ul className="flex flex-col">
        <Row
          label="Pressure Margin"
          value={`${margins.pressurePct} %`}
          tone={marginTone(margins.pressurePct)}
        />
        <Row
          label="Flow Margin"
          value={`${margins.flowPct} %`}
          tone={marginTone(margins.flowPct)}
        />
        <Row
          label="Temperature Margin"
          value={`${margins.temperaturePct} %`}
          tone={marginTone(margins.temperaturePct)}
        />
        <Row label="Safety State" value={safetyState} tone={s.text} />
      </ul>
    </Panel>
  );
};

const Row = ({ label, value, tone }: { label: string; value: string; tone: string }) => (
  <li className="flex items-center justify-between py-2 border-b border-border-subtle last:border-b-0">
    <span className="text-xs text-text-secondary">{label}</span>
    <span className={cn('text-xs font-semibold tabular-nums uppercase tracking-micro', tone)}>
      {value}
    </span>
  </li>
);
