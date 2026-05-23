import { BuildInfoPanel } from '@/components/settings/BuildInfoPanel';
import { ConfigAuditPanel } from '@/components/settings/ConfigAuditPanel';
import {
  buildInfo,
  configAudit,
  edgeNodes,
  equipmentProfiles,
  operatorSession,
  platformHealth,
  settingsSummary,
} from '@/components/settings/data/settings.mock';
import { EdgeNodesPanel } from '@/components/settings/EdgeNodesPanel';
import { OperatorSessionPanel } from '@/components/settings/OperatorSessionPanel';
import { PlatformHealthPanel } from '@/components/settings/PlatformHealthPanel';
import { SettingRow } from '@/components/settings/SettingRow';
import { SettingsNav } from '@/components/settings/SettingsNav';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { SettingsStatusStrip } from '@/components/settings/SettingsStatusStrip';
import { PageHeader, StatusChip } from '@/components/shell/PageHeader';

/**
 * Settings — RVF Malinois Platform Configuration Center V1.
 *
 * Reads as an industrial admin console: operator preferences, units of
 * measure, alarm policy, notification routing, integration endpoints,
 * security posture, and platform diagnostics. Layout follows the
 * frozen baseline rhythm (PageHeader + status strip + two-column body
 * + right rail of audit / health panels). Values are display-only in
 * F2; persistence wires in later without changing component contracts.
 */
export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-2.5">
      <PageHeader
        title="Console Configuration"
        subtitle="Operator preferences, telemetry infrastructure, and platform integration controls"
        right={
          <>
            <StatusChip tone="normal">Config Synced</StatusChip>
            <StatusChip tone="stale">Last saved 2 min ago</StatusChip>
          </>
        }
      />

      <SettingsStatusStrip summary={settingsSummary} />

      <p
        className="text-micro uppercase tracking-micro text-text-muted px-0.5"
        aria-label="Scope notice"
      >
        Note · This screen holds global platform preferences only. Per-unit alarm thresholds,
        operational limits, and sensor assignment are configured on the Units screen.
      </p>

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(0,300px)] gap-2.5">
        <div className="flex flex-col gap-2.5 min-w-0">
          <SettingsNav active="display" />

          <SettingsSection
            ordinal="01"
            anchorId="section-display"
            title="Display & Operator Experience"
            subtitle="Theme, density, typography, motion"
            meta="6 settings · synced"
          >
            <SettingRow
              label="Theme"
              hint="Default for the RVF console"
              control={{ kind: 'value', value: 'Dark · Control Room' }}
            />
            <SettingRow
              label="Density"
              hint="Switches to Compact at 5+ active units"
              control={{ kind: 'value', value: 'Comfortable' }}
            />
            <SettingRow
              label="Numeric Font"
              hint="Tabular numerals across telemetry"
              control={{ kind: 'value', value: 'IBM Plex Mono', mono: true }}
            />
            <SettingRow
              label="Reduced Motion"
              hint="Honors prefers-reduced-motion"
              control={{ kind: 'value', value: 'System' }}
            />
            <SettingRow
              label="Time Zone"
              hint="Used by every timestamp in the console"
              control={{ kind: 'value', value: 'UTC', mono: true }}
            />
            <SettingRow
              label="Language"
              hint="English UI · Spanish-ready"
              control={{ kind: 'value', value: 'English' }}
            />
          </SettingsSection>

          <SettingsSection
            ordinal="02"
            anchorId="section-units"
            title="Global Units of Measure"
            subtitle="Process variables across every screen"
            meta="7 units · ISA-aligned"
          >
            <SettingRow
              label="Pressure"
              hint="Wellhead, separator, differential"
              control={{ kind: 'chip', value: 'psi' }}
            />
            <SettingRow
              label="Temperature"
              hint="All thermometric channels"
              control={{ kind: 'chip', value: '°F' }}
            />
            <SettingRow
              label="Liquid Flow"
              hint="Oil rate"
              control={{ kind: 'chip', value: 'bpd' }}
            />
            <SettingRow
              label="Gas Flow"
              hint="Gas rate"
              control={{ kind: 'chip', value: 'MMSCFD' }}
            />
            <SettingRow
              label="Volume"
              hint="Surge tank inventory"
              control={{ kind: 'chip', value: 'bbl' }}
            />
            <SettingRow
              label="Water Cut"
              hint="Inline analyzer reading"
              control={{ kind: 'chip', value: '%' }}
            />
            <SettingRow
              label="Differential Pressure"
              hint="Choke ΔP, vessel ΔP"
              control={{ kind: 'chip', value: 'psi' }}
            />
          </SettingsSection>

          <SettingsSection
            ordinal="03"
            anchorId="section-profiles"
            title="Equipment Profile Catalog"
            subtitle="Unit class templates · reference only"
            description="Catalog of unit class templates. Each deployed unit selects a profile class on the Units screen; alarm setpoints and operational limits are configured per unit."
            meta={`${equipmentProfiles.length} classes · catalog`}
          >
            {equipmentProfiles.map((p) => (
              <SettingRow
                key={p.id}
                label={p.label}
                hint={p.description}
                control={{
                  kind: 'pill',
                  tone: p.kind === 'PER-UNIT' ? 'connected' : 'configured',
                  label: p.kind,
                }}
              />
            ))}
          </SettingsSection>

          <SettingsSection
            ordinal="04"
            anchorId="section-alarms"
            title="Alarm Behavior & Standards"
            subtitle="Console-wide annunciation, standards, behavioral defaults"
            description="Platform-wide alarm behavior, ISA standards, and console annunciation. Per-unit alarm setpoints (pressure, flow, temperature, vibration) are configured on each unit."
            meta="Platform Behavior · ISA-18.2"
          >
            <SettingRow
              label="Alarm Standard"
              hint="Governing rationalization framework"
              control={{ kind: 'value', value: 'ISA-18.2', mono: true }}
            />
            <SettingRow
              label="Auto-ACK at Clear"
              hint="ISA-18.2 §6.4"
              control={{ kind: 'pill', tone: 'on', label: 'On' }}
            />
            <SettingRow
              label="Horn / Console Banner"
              hint="Audible + visual annunciation"
              control={{ kind: 'pill', tone: 'enabled', label: 'Enabled' }}
            />
            <SettingRow
              label="Reannunciation Delay"
              hint="Repeat un-acknowledged alarms"
              control={{ kind: 'value', value: '10 min', mono: true }}
            />
            <SettingRow
              label="Stale Data Window (default)"
              hint="Fallback if a unit has no override"
              control={{ kind: 'value', value: '60 s', mono: true }}
            />
            <SettingRow
              label="Low Battery Threshold"
              hint="Platform-wide minimum across battery-powered sensors"
              control={{ kind: 'value', value: '20 %', mono: true }}
            />
          </SettingsSection>

          <SettingsSection
            ordinal="05"
            anchorId="section-notifications"
            title="Notifications"
            subtitle="Console banner, SMS, email, webhook routing"
            meta="3 channels active"
          >
            <SettingRow
              label="Console Banner"
              hint="Inline above the operations grid"
              control={{ kind: 'pill', tone: 'enabled', label: 'Enabled' }}
            />
            <SettingRow
              label="SMS on Urgent Alarms"
              hint="Routed via on-call rotation"
              control={{ kind: 'pill', tone: 'enabled', label: 'Enabled' }}
            />
            <SettingRow
              label="Email · Daily Digest"
              hint="Sent 06:00 UTC to ops distribution"
              control={{ kind: 'pill', tone: 'off', label: 'Off' }}
            />
            <SettingRow
              label="Teams Webhook"
              hint="Channel: #rvf-ops-alerts"
              control={{ kind: 'pill', tone: 'off', label: 'Off' }}
            />
            <SettingRow
              label="Client Portal Delivery Notice"
              hint="Posted when a report is sealed"
              control={{ kind: 'pill', tone: 'enabled', label: 'Enabled' }}
            />
          </SettingsSection>

          <SettingsSection
            ordinal="06"
            anchorId="section-integrations"
            title="Platform Integrations"
            subtitle="Endpoints, brokers, identity, storage"
            meta="6 services · 6 online"
          >
            <SettingRow
              label="ThingsBoard URL"
              hint="Operator-facing telemetry root"
              control={{ kind: 'value', value: 'tb.rvf.malinois.io', mono: true }}
              trailing={<StatusPill tone="connected" label="Connected" />}
            />
            <SettingRow
              label="Node-RED Edge"
              hint="Flow runtime"
              control={{ kind: 'value', value: 'edge-01.rvf.local', mono: true }}
              trailing={<StatusPill tone="connected" label="Connected" />}
            />
            <SettingRow
              label="Identity Provider"
              hint="SAML / OIDC"
              control={{ kind: 'value', value: 'rvf-sso-prod', mono: true }}
              trailing={<StatusPill tone="configured" label="Configured" />}
            />
            <SettingRow
              label="Object Storage"
              hint="Report archive"
              control={{ kind: 'value', value: 's3://rvf-reports-prod', mono: true }}
              trailing={<StatusPill tone="connected" label="Connected" />}
            />
            <SettingRow
              label="MQTT Broker"
              hint="Pub/sub transport"
              control={{ kind: 'value', value: 'mqtt.rvf.local', mono: true }}
              trailing={<StatusPill tone="connected" label="Connected" />}
            />
            <SettingRow
              label="Historian Database"
              hint="Time-series store"
              control={{ kind: 'value', value: 'TimescaleDB', mono: true }}
              trailing={<StatusPill tone="connected" label="Connected" />}
            />
          </SettingsSection>

          <SettingsSection
            ordinal="07"
            anchorId="section-security"
            title="Security & Access Control"
            subtitle="Authentication, roles, audit posture"
            meta="SSO ready"
          >
            <SettingRow
              label="Authentication"
              hint="Federated identity"
              control={{ kind: 'value', value: 'SSO / SAML ready', mono: true }}
            />
            <SettingRow
              label="Operator Role"
              hint="Read + acknowledge"
              control={{ kind: 'value', value: 'RVF Operator', mono: true }}
            />
            <SettingRow
              label="Admin Role"
              hint="Configuration + integrations"
              control={{ kind: 'value', value: 'Platform Admin', mono: true }}
            />
            <SettingRow
              label="Client Portal"
              hint="External reviewers"
              control={{ kind: 'value', value: 'Read-only', mono: true }}
            />
            <SettingRow
              label="Audit Logging"
              hint="All mutations recorded"
              control={{ kind: 'pill', tone: 'enabled', label: 'Enabled' }}
            />
            <SettingRow
              label="Session Timeout"
              hint="Idle disconnect window"
              control={{ kind: 'value', value: '8 h', mono: true }}
            />
          </SettingsSection>

          <SettingsSection
            ordinal="08"
            anchorId="section-system"
            title="System"
            subtitle="Diagnostics, defaults, configuration export"
            meta="4 controls"
          >
            <SettingRow
              label="Diagnostics Channel"
              hint="Backend log verbosity"
              control={{ kind: 'value', value: 'Info', mono: true }}
            />
            <SettingRow
              label="Configuration Export"
              hint="JSON download · last 30 days retained"
              control={{ kind: 'value', value: 'settings-2026-05-22.json', mono: true }}
            />
            <SettingRow
              label="Reset to Defaults"
              hint="Requires typed confirmation"
              control={{ kind: 'pill', tone: 'warn', label: 'Locked' }}
            />
            <SettingRow
              label="Telemetry Opt-In"
              hint="Anonymous platform metrics"
              control={{ kind: 'pill', tone: 'on', label: 'On' }}
            />
          </SettingsSection>
        </div>

        <aside className="flex flex-col gap-2.5 2xl:max-w-[300px]">
          <OperatorSessionPanel session={operatorSession} />
          <PlatformHealthPanel services={platformHealth} />
          <EdgeNodesPanel nodes={edgeNodes} />
          <BuildInfoPanel fields={buildInfo} />
          <ConfigAuditPanel entries={configAudit} />
        </aside>
      </div>
    </div>
  );
}

/**
 * Local status pill used inline on Integrations rows. Mirrors the
 * SettingRow `pill` control but renders as a trailing element rather
 * than replacing the value chip, so the row reads as "endpoint +
 * health" at the same time.
 */
const PillToneClasses: Record<
  'connected' | 'configured' | 'pending',
  { text: string; border: string; dot: string }
> = {
  connected: {
    text: 'text-status-info',
    border: 'border-status-info/40 bg-status-info/10',
    dot: 'bg-status-info',
  },
  configured: {
    text: 'text-text-secondary',
    border: 'border-border-subtle bg-surface-raised',
    dot: 'bg-text-secondary',
  },
  pending: {
    text: 'text-status-warn',
    border: 'border-status-warn/40 bg-status-warn/10',
    dot: 'bg-status-warn',
  },
};

const StatusPill = ({
  tone,
  label,
}: {
  tone: 'connected' | 'configured' | 'pending';
  label: string;
}) => {
  const t = PillToneClasses[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs border text-micro uppercase tracking-micro font-bold tabular-nums ${t.text} ${t.border}`}
    >
      <span aria-hidden="true" className={`inline-block w-1.5 h-1.5 rounded-full ${t.dot}`} />
      {label}
    </span>
  );
};
