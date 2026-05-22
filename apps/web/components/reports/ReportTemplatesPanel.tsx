import { cn } from '@rvf/ui';
import { FileText } from 'lucide-react';

import { kindLabel, type ReportTemplate } from './data/reports.mock';
import { KIND_DOT } from './ReportKindChip';

import { Panel } from '@/components/shell/Panel';

/**
 * ReportTemplatesPanel — right-rail list of reusable report templates.
 *
 * Each row shows the template name, version, owner, last edit date,
 * and last-used date. The kind-dot mirrors the archive chip so a
 * Well-Test template visually pairs with its Well-Test outputs.
 *
 * Lower-emphasis than the queue or activity log — templates change
 * infrequently and are reference material, not live operational state.
 */
export interface ReportTemplatesPanelProps {
  templates: readonly ReportTemplate[];
}

export const ReportTemplatesPanel = ({ templates }: ReportTemplatesPanelProps) => (
  <Panel
    title="Report Templates"
    density="compact"
    meta={<span className="font-mono">{templates.length}</span>}
  >
    <ul className="flex flex-col">
      {templates.map((t) => (
        <li
          key={t.id}
          className="flex flex-col gap-0.5 py-1.5 border-b border-border-subtle last:border-b-0"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 min-w-0">
              <span
                aria-hidden="true"
                className={cn('inline-block w-1.5 h-1.5 rounded-full shrink-0', KIND_DOT[t.kind])}
              />
              <FileText className="w-3 h-3 text-text-secondary shrink-0" aria-hidden="true" />
              <span className="text-xs text-text-primary truncate">{t.name}</span>
            </span>
            <span className="font-mono text-micro uppercase tracking-micro font-semibold text-text-primary shrink-0">
              {t.version}
            </span>
          </div>
          <div className="flex items-center justify-between text-micro uppercase tracking-micro font-mono text-text-secondary">
            <span>
              {kindLabel(t.kind)} · <span className="text-text-primary">{t.owner}</span>
            </span>
            <span className="tabular-nums">
              {t.lastUpdated}
              <span className="text-text-muted"> · used {t.lastUsed}</span>
            </span>
          </div>
        </li>
      ))}
    </ul>
  </Panel>
);
