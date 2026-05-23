import type { BuildField } from './data/settings.mock';

import { Panel } from '@/components/shell/Panel';

/**
 * BuildInfoPanel — release / build manifest displayed in the right
 * rail. Reads as a deployment dossier: console version, backend
 * version, telemetry API surface, schema vintage, last deploy date,
 * build channel. Monospace values throughout to reinforce that these
 * are addressable artifact identifiers, not human-readable labels.
 */
export interface BuildInfoPanelProps {
  fields: readonly BuildField[];
}

export const BuildInfoPanel = ({ fields }: BuildInfoPanelProps) => (
  <Panel
    title="Release / Build"
    density="compact"
    meta={<span className="font-mono">RVF Malinois</span>}
  >
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
      {fields.map((f) => (
        <div key={f.label} className="contents">
          <dt className="text-micro uppercase tracking-micro text-text-muted leading-none self-center">
            {f.label}
          </dt>
          <dd className="text-xs font-semibold font-mono tabular-nums text-text-primary truncate leading-none self-center text-right">
            {f.value}
          </dd>
        </div>
      ))}
    </dl>
  </Panel>
);
