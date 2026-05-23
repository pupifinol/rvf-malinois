import { cn } from '@rvf/ui';
import { ChevronRight } from 'lucide-react';

import type { ReactNode } from 'react';

/**
 * SettingRow — the canonical configuration row used inside every
 * SettingsSection.
 *
 * Layout (label-over-hint on the left, control on the right):
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ THEME                                  Dark · Control Room ›│
 *   │ Default for the RVF console                                 │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Three control shapes:
 *   - `value`  — dropdown-style chip + trailing chevron (editable look)
 *   - `pill`   — status pill (ENABLED / OFF / CONNECTED / PENDING)
 *   - `chip`   — small filled unit-of-measure chip (psi, °F, bpd)
 *
 * Everything is visual only in F2 — no onClick wiring yet. Future
 * persistence will plug in onChange handlers without changing layout.
 */
export type SettingRowControl =
  | { kind: 'value'; value: string; mono?: boolean }
  | { kind: 'pill'; tone: PillTone; label: string }
  | { kind: 'chip'; value: string };

export type PillTone = 'enabled' | 'off' | 'connected' | 'configured' | 'pending' | 'on' | 'warn';

export interface SettingRowProps {
  label: string;
  hint?: string;
  control: SettingRowControl;
  /** Trailing slot — overrides the auto-rendered chevron when set. */
  trailing?: ReactNode;
}

const PILL: Record<PillTone, { text: string; border: string; dot: string }> = {
  enabled: {
    text: 'text-status-normal',
    border: 'border-status-normal/40 bg-status-normal/10',
    dot: 'bg-status-normal',
  },
  on: {
    text: 'text-status-normal',
    border: 'border-status-normal/40 bg-status-normal/10',
    dot: 'bg-status-normal',
  },
  off: {
    text: 'text-text-muted',
    border: 'border-border-subtle bg-canvas',
    dot: 'bg-text-muted',
  },
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
  warn: {
    text: 'text-status-warn',
    border: 'border-status-warn/40 bg-status-warn/10',
    dot: 'bg-status-warn',
  },
};

export const SettingRow = ({ label, hint, control, trailing }: SettingRowProps) => (
  <li className="flex items-center justify-between gap-4 px-3 py-2 border-b border-border-subtle last:border-b-0 hover:bg-surface-raised/40 transition-colors duration-fast ease-industrial">
    <div className="min-w-0 flex flex-col gap-0.5 leading-tight">
      <span className="text-micro uppercase tracking-micro font-bold text-text-primary">
        {label}
      </span>
      {hint ? (
        <span className="text-micro uppercase tracking-micro text-text-muted">{hint}</span>
      ) : null}
    </div>

    <div className="flex items-center gap-2 shrink-0">
      {control.kind === 'value' ? <ValueChip value={control.value} mono={control.mono} /> : null}
      {control.kind === 'pill' ? <Pill tone={control.tone} label={control.label} /> : null}
      {control.kind === 'chip' ? <UnitChip value={control.value} /> : null}
      {trailing !== undefined ? (
        trailing
      ) : control.kind === 'value' ? (
        <ChevronRight className="w-3 h-3 text-text-muted shrink-0" aria-hidden="true" />
      ) : null}
    </div>
  </li>
);

const ValueChip = ({ value, mono }: { value: string; mono?: boolean }) => (
  <span
    className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-xs border border-border-subtle bg-canvas',
      'text-xs text-text-primary tabular-nums',
      mono ? 'font-mono' : '',
    )}
  >
    {value}
  </span>
);

const UnitChip = ({ value }: { value: string }) => (
  <span
    className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-xs border border-brand-accent/30',
      'bg-brand-accent/10 text-brand-accent font-mono tabular-nums',
      'text-micro uppercase tracking-micro font-bold',
    )}
  >
    {value}
  </span>
);

const Pill = ({ tone, label }: { tone: PillTone; label: string }) => {
  const t = PILL[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs border',
        'text-micro uppercase tracking-micro font-bold tabular-nums',
        t.text,
        t.border,
      )}
    >
      <span aria-hidden="true" className={cn('inline-block w-1.5 h-1.5 rounded-full', t.dot)} />
      {label}
    </span>
  );
};
