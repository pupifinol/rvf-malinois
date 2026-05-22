import { cn } from '@rvf/ui';
import { Check } from 'lucide-react';

import type { ReactNode } from 'react';

import { PageHeader, StatusChip } from '@/components/shell/PageHeader';
import { Panel } from '@/components/shell/Panel';

/**
 * Settings — Console Configuration.
 *
 * Per-operator preferences plus platform configuration. The choices here
 * shape what every other screen renders (units of measure, density, alarm
 * thresholds, etc.). Display surface only in F2 — persistence + the
 * integrations sub-page land later.
 *
 * Visual language inherited from /operations.
 */
export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Console Configuration"
        subtitle="Operator preferences and platform integrations"
        right={
          <>
            <StatusChip tone="stale" dot>
              Saved 2 min ago
            </StatusChip>
          </>
        }
      />

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
        <div className="flex flex-col gap-4 min-w-0">
          <Panel title="Display">
            <SettingsList>
              <SettingRow
                label="Theme"
                value="Dark · Control Room"
                hint="Default for the RVF console"
              />
              <SettingRow
                label="Density"
                value="Comfortable"
                hint="Switches to Compact at 5+ active units"
              />
              <SettingRow
                label="Numeric font"
                value="IBM Plex Mono"
                hint="Tabular numerals across telemetry"
              />
              <SettingRow
                label="Reduced motion"
                value="System"
                hint="Honors prefers-reduced-motion"
              />
            </SettingsList>
          </Panel>

          <Panel title="Units of Measure">
            <SettingsList>
              <SettingRow label="Pressure" value="psi" hint="Wellhead, separator, differential" />
              <SettingRow label="Temperature" value="°F" hint="All thermometric channels" />
              <SettingRow label="Flow · Liquid" value="bopd" hint="Oil rate" />
              <SettingRow label="Flow · Gas" value="MMSCFD" hint="Gas rate" />
              <SettingRow label="Volume" value="bbl" hint="Surge tank inventory" />
            </SettingsList>
          </Panel>

          <Panel title="Alarms">
            <SettingsList>
              <SettingRow
                label="High pressure threshold"
                value="1,950 psi"
                hint="MU class A · default"
              />
              <SettingRow
                label="Low battery threshold"
                value="20 %"
                hint="Below this raises a LOW alarm"
              />
              <SettingRow
                label="Stale data window"
                value="60 s"
                hint="Time before STALE is asserted"
              />
              <SettingRow label="Auto-ACK at clear" value="On" hint="ISA-18.2 §6.4" />
            </SettingsList>
          </Panel>

          <Panel title="Notifications">
            <SettingsList>
              <ToggleRow label="Console banner" enabled />
              <ToggleRow label="SMS on URGENT alarms" enabled />
              <ToggleRow label="Email · daily digest" enabled={false} />
              <ToggleRow label="Teams webhook" enabled={false} />
            </SettingsList>
          </Panel>

          <Panel title="Integrations">
            <SettingsList>
              <SettingRow label="ThingsBoard URL" value="tb.rvf.malinois.io" mono />
              <SettingRow label="Node-RED edge" value="edge-01.rvf.local" mono />
              <SettingRow label="Identity provider" value="rvf-sso-prod" mono />
              <SettingRow label="Object storage" value="s3://rvf-reports-prod" mono />
            </SettingsList>
          </Panel>
        </div>

        <aside className="flex flex-col gap-3 2xl:max-w-[320px]">
          <Panel title="System Status">
            <ul className="flex flex-col">
              <StatusLine label="Console" state="ONLINE" />
              <StatusLine label="Realtime stream" state="ONLINE" />
              <StatusLine label="Historian" state="ONLINE" />
              <StatusLine label="Object storage" state="ONLINE" />
            </ul>
          </Panel>

          <Panel title="Build Info">
            <SettingsList>
              <SettingRow label="Console" value="0.2.0-F1.5.5" mono />
              <SettingRow label="Backend" value="0.2.0-F1.5.5" mono />
              <SettingRow label="Tokens" value="2026-04-30" mono />
              <SettingRow label="Last deploy" value="2026-05-21" mono />
            </SettingsList>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

const SettingsList = ({ children }: { children: ReactNode }) => (
  <ul className="flex flex-col">{children}</ul>
);

const SettingRow = ({
  label,
  value,
  hint,
  mono = false,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
}) => (
  <li className="flex items-center justify-between gap-4 py-2.5 border-b border-border-subtle last:border-b-0">
    <div className="min-w-0">
      <p className="text-xs font-semibold text-text-primary">{label}</p>
      {hint ? (
        <p className="text-micro uppercase tracking-micro text-text-muted mt-0.5">{hint}</p>
      ) : null}
    </div>
    <span
      className={cn(
        'text-xs tabular-nums shrink-0',
        mono ? 'font-mono text-text-primary' : 'text-text-secondary',
      )}
    >
      {value}
    </span>
  </li>
);

const ToggleRow = ({ label, enabled }: { label: string; enabled: boolean }) => (
  <li className="flex items-center justify-between gap-4 py-2.5 border-b border-border-subtle last:border-b-0">
    <span className="text-xs text-text-primary">{label}</span>
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-micro uppercase tracking-micro font-semibold',
        enabled ? 'text-status-normal' : 'text-text-muted',
      )}
    >
      {enabled ? (
        <>
          <Check className="w-3 h-3" aria-hidden="true" />
          Enabled
        </>
      ) : (
        'Off'
      )}
    </span>
  </li>
);

const StatusLine = ({
  label,
  state,
}: {
  label: string;
  state: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
}) => {
  const tone = {
    ONLINE: 'text-status-normal bg-status-normal',
    DEGRADED: 'text-status-warn bg-status-warn',
    OFFLINE: 'text-status-alarm bg-status-alarm',
  }[state];
  const [textCls, bgCls] = tone.split(' ');
  return (
    <li className="flex items-center justify-between py-2 border-b border-border-subtle last:border-b-0">
      <span className="flex items-center gap-2.5 text-xs text-text-primary">
        <span aria-hidden="true" className={cn('inline-block w-1.5 h-1.5 rounded-full', bgCls)} />
        {label}
      </span>
      <span
        className={cn('text-micro uppercase tracking-micro font-semibold tabular-nums', textCls)}
      >
        {state}
      </span>
    </li>
  );
};
