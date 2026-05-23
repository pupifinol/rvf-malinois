import { cn } from '@rvf/ui';

import type { SettingsSummary } from './data/settings.mock';

/**
 * SettingsStatusStrip — six-cell context strip directly under the page
 * header, matching the ReportStatusStrip / UnitStatusBar rhythm. Tells
 * the operator at-a-glance: how many sections exist, how many edge
 * nodes / integrations are online, whether anything is pending, and
 * how recently the configuration was audited.
 */
export interface SettingsStatusStripProps {
  summary: SettingsSummary;
}

export const SettingsStatusStrip = ({ summary }: SettingsStatusStripProps) => {
  const integrationsTone =
    summary.integrationsOnline === summary.integrationsTotal
      ? 'text-status-normal'
      : 'text-status-warn';
  const edgeTone =
    summary.edgeNodesOnline === summary.edgeNodesTotal ? 'text-status-normal' : 'text-status-warn';
  const pendingTone = summary.pendingChanges === 0 ? 'text-text-secondary' : 'text-status-warn';

  return (
    <div
      className="bg-surface border border-border-subtle rounded-sm grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-5 gap-y-2 p-3"
      aria-label="Configuration summary"
    >
      <Cell label="Sections" value={summary.configuredSections.toString().padStart(2, '0')} />
      <Cell label="Active Operators" value={summary.activeOperators.toString()} />
      <Cell
        label="Integrations"
        value={`${summary.integrationsOnline}/${summary.integrationsTotal}`}
        tone={integrationsTone}
      />
      <Cell
        label="Edge Nodes"
        value={`${summary.edgeNodesOnline}/${summary.edgeNodesTotal}`}
        tone={edgeTone}
      />
      <Cell label="Pending Changes" value={summary.pendingChanges.toString()} tone={pendingTone} />
      <Cell label="Last Audit" value={summary.lastAuditAgo} />
    </div>
  );
};

const Cell = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <div className="min-w-0 flex flex-col gap-0.5 leading-none">
    <span className="text-micro uppercase tracking-micro text-text-muted">{label}</span>
    <span
      className={cn(
        'text-sm font-semibold font-mono tabular-nums truncate',
        tone ?? 'text-text-primary',
      )}
    >
      {value}
    </span>
  </div>
);
