import type { UnitTwin } from './data/twin.mock';

import { Panel } from '@/components/shell/Panel';

/**
 * UnitConfigurationSummary — engineered identity + operational ratings
 * for a single multiphase well-testing unit.
 *
 * Industrial table-style metadata block (no cards, no widgets): two
 * columns of label/value rows, monospace values, no alarm thresholds.
 * Alarm setpoints live in their own panel (UnitAlarmThresholdsPanel)
 * so the operator can tell at a glance which numbers are equipment
 * ratings and which are alarm policy.
 *
 * Per the platform IA: alarm thresholds are unit-specific (configured
 * here on the unit), while global behavior defaults live in /settings.
 */
export interface UnitConfigurationSummaryProps {
  twin: UnitTwin;
}

const fmt = {
  psi: (v: number) => `${v.toLocaleString('en-US')} psi`,
  bpd: (v: number) => `${v.toLocaleString('en-US')} bpd`,
  mmscfd: (v: number) => `${v} MMSCFD`,
  degF: (v: number) => `${v} °F`,
  mmS: (v: number) => `${v} mm/s`,
  sec: (v: number) => `${v} s`,
};

export const UnitConfigurationSummary = ({ twin }: UnitConfigurationSummaryProps) => {
  const c = twin.config;
  return (
    <Panel
      title="Unit Configuration"
      density="compact"
      meta={
        <span className="font-mono uppercase tracking-micro">
          {c.profileTag} · MU #{twin.unitNumber}
        </span>
      }
    >
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 px-1">
        <Field label="Unit Name" value={twin.name} />
        <Field label="Unit Class" value={c.unitClass} />
        <Field label="Unit Type" value={c.unitType} />
        <Field label="Location" value={`${twin.location.site} · ${twin.location.area}`} />
        <Field label="Pressure Rating" value={fmt.psi(c.pressureRatingPsi)} mono />
        <Field label="Separator Design Pressure" value={fmt.psi(c.separatorDesignPsi)} mono />
        <Field label="Max Liquid Flow" value={fmt.bpd(c.maxLiquidFlowBpd)} mono />
        <Field label="Max Gas Flow" value={fmt.mmscfd(c.maxGasFlowMmscfd)} mono />
        <Field label="Max Temperature" value={fmt.degF(c.maxTemperatureF)} mono />
        <Field label="Max Vibration" value={fmt.mmS(c.maxVibrationMmS)} mono />
        <Field label="Telemetry Timeout" value={fmt.sec(c.telemetryTimeoutSec)} mono />
        <Field label="Calibration Policy" value={c.calibrationPolicy} />
      </dl>

      <p
        className="px-1 pt-2 mt-1 border-t border-border-subtle text-micro uppercase tracking-micro text-text-muted"
        aria-label="Per-unit configuration scope"
      >
        Note · Operational ratings, thresholds, and sensor assignment are configured per unit.
      </p>
    </Panel>
  );
};

const Field = ({
  label,
  value,
  mono = false,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: string;
}) => (
  <div className="flex items-center justify-between gap-3 py-1 border-b border-border-subtle last:border-b-0">
    <dt className="text-micro uppercase tracking-micro text-text-muted leading-none">{label}</dt>
    <dd
      className={`text-xs font-semibold leading-none truncate tabular-nums ${mono ? 'font-mono' : ''} ${tone ?? 'text-text-primary'}`}
    >
      {value}
    </dd>
  </div>
);
