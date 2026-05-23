import { cn } from '@rvf/ui';

import type { UnitProfile } from './data/twin.mock';

/**
 * UnitProfileTag — small ISA-style technical chip rendered near the
 * unit title (e.g. "HP/HF", "MP", "LP/LF", "CUSTOM"). Communicates
 * the operational profile class so the operator can tell at a glance
 * which envelope this unit is engineered for. Monospace, bordered,
 * never decorative.
 */
export interface UnitProfileTagProps {
  profile: UnitProfile;
}

const TONE: Record<UnitProfile, string> = {
  'HP/HF': 'text-status-alarm border-status-alarm/40 bg-status-alarm/10',
  MP: 'text-status-warn border-status-warn/40 bg-status-warn/10',
  'LP/LF': 'text-status-info border-status-info/40 bg-status-info/10',
  CUSTOM: 'text-text-secondary border-border-subtle bg-surface-raised',
};

export const UnitProfileTag = ({ profile }: UnitProfileTagProps) => (
  <span
    className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-xs border font-mono',
      'text-micro uppercase tracking-micro font-bold tabular-nums',
      TONE[profile],
    )}
    aria-label={`Operational profile ${profile}`}
  >
    {profile}
  </span>
);
