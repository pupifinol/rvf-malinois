'use client';

import { cn } from '@rvf/ui';
import { ClipboardCheck, FileDown, Plus, Radio, type LucideIcon } from 'lucide-react';

import { Panel } from '@/components/shell/Panel';

/**
 * QuickActionsPanel — restrained utility buttons in the right rail.
 *
 * Mirrors the ISA-101 "function key" pattern: each row is one action,
 * one icon, one short label. Buttons are inert in F0 (no backend wired
 * yet); they are styled to feel actionable but not flashy.
 */
interface Action {
  id: string;
  label: string;
  icon: LucideIcon;
}

const actions: Action[] = [
  { id: 'scan', label: 'Scan Sensor Network', icon: Radio },
  { id: 'discover', label: 'Discover New Sensors', icon: Plus },
  { id: 'calibrate', label: 'Calibrate Sensor', icon: ClipboardCheck },
  { id: 'export', label: 'Export Sensor Report', icon: FileDown },
];

export const QuickActionsPanel = () => (
  <Panel title="Quick Actions">
    <ul className="flex flex-col gap-1.5">
      {actions.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            className={cn(
              'w-full flex items-center gap-2.5 px-2.5 py-2 text-xs uppercase tracking-micro font-semibold',
              'bg-surface-raised border border-border-subtle rounded-xs',
              'text-text-secondary hover:text-text-primary hover:border-border-strong',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
              'transition-colors duration-fast ease-industrial',
            )}
          >
            <a.icon className="w-3.5 h-3.5 text-text-muted" aria-hidden="true" />
            <span className="flex-1 text-left truncate">{a.label}</span>
          </button>
        </li>
      ))}
    </ul>
  </Panel>
);
