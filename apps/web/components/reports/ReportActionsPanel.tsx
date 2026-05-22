'use client';

import { cn } from '@rvf/ui';
import {
  Archive,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  type LucideIcon,
  Plus,
  Send,
} from 'lucide-react';

import { Panel } from '@/components/shell/Panel';

/**
 * ReportActionsPanel — restrained operator actions in the right rail.
 *
 * Mirrors the /alarms quick-actions pattern: row = icon chip + label.
 * The primary action (Generate Report) gets a blue accent stripe in
 * `--brand-accent` — the only emphasized action on this calm screen.
 * Destructive actions (Archive) get the muted stripe.
 *
 * All buttons are inert in F0; wire onAction when the report-mutation
 * service lands.
 */
type ActionId =
  | 'generate-report'
  | 'export-pdf'
  | 'export-csv'
  | 'send-portal'
  | 'archive'
  | 'audit-trail';

interface Action {
  id: ActionId;
  label: string;
  icon: LucideIcon;
  accent?: string;
  chip: string;
  iconTone: string;
}

const ACTIONS: readonly Action[] = [
  {
    id: 'generate-report',
    label: 'Generate Report',
    icon: Plus,
    accent: 'border-l-brand-accent',
    chip: 'bg-brand-accent/15 border border-brand-accent/40',
    iconTone: 'text-brand-accent',
  },
  {
    id: 'export-pdf',
    label: 'Export PDF',
    icon: FileText,
    chip: 'bg-surface border border-border-subtle',
    iconTone: 'text-text-secondary',
  },
  {
    id: 'export-csv',
    label: 'Export CSV',
    icon: FileSpreadsheet,
    chip: 'bg-surface border border-border-subtle',
    iconTone: 'text-text-secondary',
  },
  {
    id: 'send-portal',
    label: 'Send to Client Portal',
    icon: Send,
    accent: 'border-l-status-info',
    chip: 'bg-status-info/15 border border-status-info/40',
    iconTone: 'text-status-info',
  },
  {
    id: 'archive',
    label: 'Archive',
    icon: Archive,
    accent: 'border-l-text-secondary',
    chip: 'bg-surface border border-border-subtle',
    iconTone: 'text-text-secondary',
  },
  {
    id: 'audit-trail',
    label: 'View Audit Trail',
    icon: FileBarChart,
    chip: 'bg-surface border border-border-subtle',
    iconTone: 'text-text-secondary',
  },
];

export interface ReportActionsPanelProps {
  onAction?: (id: ActionId) => void;
}

export const ReportActionsPanel = ({ onAction }: ReportActionsPanelProps) => (
  <Panel title="Actions" density="compact">
    <ul className="flex flex-col gap-1">
      {ACTIONS.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            onClick={() => onAction?.(a.id)}
            className={cn(
              'w-full flex items-center gap-2 px-2 py-1 rounded-xs',
              'bg-surface-raised border border-border-subtle text-text-primary',
              a.accent ? `border-l-2 ${a.accent}` : '',
              'hover:border-border-strong hover:bg-surface',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
              'transition-colors duration-fast ease-industrial',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'inline-flex items-center justify-center w-5 h-5 rounded-xs shrink-0',
                a.chip,
              )}
            >
              <a.icon className={cn('w-3 h-3', a.iconTone)} />
            </span>
            <span className="flex-1 text-left text-micro uppercase tracking-micro font-bold truncate leading-none">
              {a.label}
            </span>
          </button>
        </li>
      ))}
    </ul>
  </Panel>
);
