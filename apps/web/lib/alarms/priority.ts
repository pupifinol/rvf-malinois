/**
 * Alarm-state priority — F2A.
 *
 * `alarm > warning > normal`. Disabled and no_data are terminal labels that
 * mean "do not interpret as either" and rank as low as `normal` for the
 * purpose of "should I escalate?" — they are NOT alarms.
 */
import type { AlarmState } from './types';

const RANK: Record<AlarmState, number> = {
  alarm_high: 5,
  alarm_low: 5,
  warning_high: 3,
  warning_low: 3,
  no_data: 1,
  disabled: 0,
  normal: 0,
};

export const rank = (state: AlarmState): number => RANK[state];

export const isAlarm = (state: AlarmState): boolean =>
  state === 'alarm_high' || state === 'alarm_low';

export const isWarning = (state: AlarmState): boolean =>
  state === 'warning_high' || state === 'warning_low';

/** Returns the higher-priority of two states (used when rolling up per unit). */
export const higher = (a: AlarmState, b: AlarmState): AlarmState => (RANK[a] >= RANK[b] ? a : b);
