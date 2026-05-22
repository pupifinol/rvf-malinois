'use client';

import { cn } from '@rvf/ui';
import {
  BellOff,
  CheckCheck,
  CheckCircle2,
  FileDown,
  type LucideIcon,
  Server,
  Wrench,
} from 'lucide-react';

import { Panel } from '@/components/shell/Panel';

/**
 * AlarmQuickActions — restrained operator-action panel in the right
 * rail. ISA-101 "function key" pattern: one row = one action, one
 * icon-chip, one label.
 *
 * Each button has three layers:
 *   - A tonally tinted icon chip on the left (the only saturated
 *     element on the button — gives the row a clear "kind" cue).
 *   - A neutral surface-raised body with a 1-px top inner highlight.
 *   - An optional 2-px left accent stripe in the action's semantic
 *     tone for the destructive / horn-silencing actions.
 *
 * Buttons are inert in F0 (no backend wired); they look actionable
 * but never flashy.
 */
type ActionId =
  | 'ack-all-active'
  | 'ack-low-priority'
  | 'silence-horn'
  | 'open-unit-view'
  | 'export-incident'
  | 'create-ticket';

interface Action {
  id: ActionId;
  label: string;
  icon: LucideIcon;
  /** Left accent stripe color (only the alarm-relevant actions get one). */
  accent?: string;
  /** Background tint of the icon chip. */
  chip: string;
  /** Icon color inside the chip. */
  iconTone: string;
}

const ACTIONS: readonly Action[] = [
  {
    id: 'ack-all-active',
    label: 'Ack All Active',
    icon: CheckCheck,
    accent: 'border-l-status-warn',
    chip: 'bg-status-warn/15 border border-status-warn/40',
    iconTone: 'text-status-warn',
  },
  {
    id: 'ack-low-priority',
    label: 'Ack Low Priority',
    icon: CheckCircle2,
    accent: 'border-l-alarm-low',
    chip: 'bg-alarm-low/15 border border-alarm-low/40',
    iconTone: 'text-alarm-low',
  },
  {
    id: 'silence-horn',
    label: 'Silence Horn',
    icon: BellOff,
    accent: 'border-l-status-alarm',
    chip: 'bg-status-alarm/15 border border-status-alarm/40',
    iconTone: 'text-status-alarm',
  },
  {
    id: 'open-unit-view',
    label: 'Open Unit View',
    icon: Server,
    chip: 'bg-surface border border-border-subtle',
    iconTone: 'text-text-secondary',
  },
  {
    id: 'export-incident',
    label: 'Export Incident',
    icon: FileDown,
    chip: 'bg-surface border border-border-subtle',
    iconTone: 'text-text-secondary',
  },
  {
    id: 'create-ticket',
    label: 'Create Maintenance Ticket',
    icon: Wrench,
    chip: 'bg-surface border border-border-subtle',
    iconTone: 'text-text-secondary',
  },
];

export interface AlarmQuickActionsProps {
  onAction?: (id: ActionId) => void;
}

export const AlarmQuickActions = ({ onAction }: AlarmQuickActionsProps) => (
  <Panel title="Quick Actions" density="compact">
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
