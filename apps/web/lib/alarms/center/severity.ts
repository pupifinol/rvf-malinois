/**
 * Severity + source classification for Alarm Center rows — F2C pure logic.
 *
 * The Alarm Center surfaces three families of events. Each one maps to one
 * source type and one ISA-18.2 priority chip:
 *
 *   Process band       Source = PROCESS
 *     alarm_high/low       → URGENT
 *     warning_high/low     → HIGH
 *
 *   Data quality       Source = DATA_QUALITY
 *     no_data (bad/null)   → MEDIUM
 *
 *   Communication      Source = COMMUNICATION
 *     stale                → MEDIUM   (short gap)
 *     offline              → HIGH     (long gap — ADR-005 §7 instrumentation)
 *
 * Keeping these separated is deliberate: a stuck sensor or a downed
 * gateway must not show up alongside a process pressure alarm with the
 * same colour, or the operator's mental model breaks down. Process is
 * red; instrumentation is amber/yellow.
 *
 * No process event in F2 currently classifies as LOW — the value is
 * reserved for future battery/RF-quality and similar gentle nuisance
 * alarms once a backend pushes them. We do not synthesise LOWs here.
 */
import type {
  AlarmCenterEvaluatedState,
  AlarmCenterSeverity,
  AlarmCenterSourceType,
} from './types';

export const severityFor = (state: AlarmCenterEvaluatedState): AlarmCenterSeverity => {
  switch (state) {
    case 'alarm_high':
    case 'alarm_low':
      return 'URGENT';
    case 'warning_high':
    case 'warning_low':
    case 'offline':
      return 'HIGH';
    case 'no_data':
    case 'stale':
      return 'MEDIUM';
  }
};

export const sourceFor = (state: AlarmCenterEvaluatedState): AlarmCenterSourceType => {
  switch (state) {
    case 'alarm_high':
    case 'alarm_low':
    case 'warning_high':
    case 'warning_low':
      return 'PROCESS';
    case 'no_data':
      return 'DATA_QUALITY';
    case 'stale':
    case 'offline':
      return 'COMMUNICATION';
  }
};

/** Short, ISA-style copy for the row title. */
export const titleFor = (state: AlarmCenterEvaluatedState, tagLabel: string): string => {
  switch (state) {
    case 'alarm_high':
      return `High Alarm — ${tagLabel}`;
    case 'alarm_low':
      return `Low Alarm — ${tagLabel}`;
    case 'warning_high':
      return `High Warning — ${tagLabel}`;
    case 'warning_low':
      return `Low Warning — ${tagLabel}`;
    case 'no_data':
      return `Data Quality Bad — ${tagLabel}`;
    case 'stale':
      return `Stale Signal — ${tagLabel}`;
    case 'offline':
      return `Offline Signal — ${tagLabel}`;
  }
};
