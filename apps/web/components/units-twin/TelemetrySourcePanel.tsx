import { cn } from '@rvf/ui';

import type { TelemetryState, UnitTwin } from './data/twin.mock';

import { Panel } from '@/components/shell/Panel';

/**
 * TelemetrySourcePanel — planned/active telemetry source for the unit.
 *
 * F2 will subscribe the live stream to the endpoint + channel described
 * here. In F0/F1 the panel is display-only: every row reads from the
 * twin's `telemetry` block, and the state pill is always PLANNED until
 * F2 stands the source up. The "Planned · F2" badge in the panel meta
 * is the explicit reminder that this is wiring scaffolding, not a live
 * connection.
 *
 * Layout mirrors UnitConfigurationSummary: 2-column `dl`, monospace
 * values, muted footer note. No editable controls.
 */
const STATE_TONE: Record<TelemetryState, { text: string; bg: string; dot: string }> = {
  PLANNED: { text: 'text-status-stale', bg: 'bg-status-stale/15', dot: 'bg-status-stale' },
  PROVISIONED: { text: 'text-status-info', bg: 'bg-status-info/15', dot: 'bg-status-info' },
  STREAMING: { text: 'text-status-normal', bg: 'bg-status-normal/15', dot: 'bg-status-normal' },
};

export interface TelemetrySourcePanelProps {
  twin: UnitTwin;
}

export const TelemetrySourcePanel = ({ twin }: TelemetrySourcePanelProps) => {
  const t = twin.telemetry;
  const tone = STATE_TONE[t.state];
  return (
    <Panel
      title="Telemetry Source"
      density="compact"
      meta={
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs font-semibold uppercase tracking-micro',
            tone.bg,
            tone.text,
          )}
        >
          <span
            aria-hidden="true"
            className={cn('inline-block w-1.5 h-1.5 rounded-full', tone.dot)}
          />
          {t.state} · F2
        </span>
      }
    >
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 px-1">
        <Field label="Protocol" value={t.protocol} mono />
        <Field label="Sample Rate" value={`${t.sampleRateHz} Hz`} mono />
        <Field label="Endpoint" value={t.endpoint} mono />
        <Field label="Channel" value={t.channel} mono />
        <Field
          label="Last Sample"
          value={t.lastSampleUtc ?? '— (no live stream yet)'}
          mono
          tone={t.lastSampleUtc ? undefined : 'text-text-muted'}
        />
        <Field label="Stale Window" value={`${twin.config.telemetryTimeoutSec} s`} mono />
      </dl>

      <p
        className="px-1 pt-2 mt-1 border-t border-border-subtle text-micro uppercase tracking-micro text-text-muted"
        aria-label="Telemetry scope"
      >
        Note · F2 will wire the live source. No MQTT / Modbus / OPC-UA / REST connection is active
        in this build.
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
