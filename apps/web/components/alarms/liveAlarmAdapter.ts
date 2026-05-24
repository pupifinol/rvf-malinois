/**
 * Live alarm adapter — F2C.
 *
 * Converts the live `LiveAlarmEvent` view-model produced by
 * `useAlarmCenter` into the `AlarmRecord` row-shape the existing alarm
 * screen components consume. Doing this at the page boundary lets us
 * preserve the visual design (Active table, History table, Critical
 * banner, Severity cards, Feed) WITHOUT modifying any of those
 * components — they keep their compact column layout and styling.
 *
 * Mapping notes:
 *   - severity → priority   (URGENT/HIGH/MEDIUM/LOW maps 1:1).
 *   - lifecycle → state     (ACTIVE/ACKED/CLEARED maps 1:1).
 *   - source → kind         (PROCESS/DATA_QUALITY/COMMUNICATION → one of
 *                            the existing AlarmKind values so the icon /
 *                            badge logic in legacy components still
 *                            renders meaningfully).
 *   - raisedUtc / ageLabel  derived from firstSeenAt + lastUpdatedAt.
 *
 * F2C does NOT show internal-only data here. It just renders alarm rows
 * derived from F2A's evaluator on the F2A simulated stream.
 */
import { formatActiveFor, type AlarmKind, type AlarmRecord } from './data/alarms.mock';

import type { LiveAlarmEvent } from '@/lib/alarms';

const kindFromSource = (e: LiveAlarmEvent): AlarmKind => {
  if (e.source === 'COMMUNICATION') return 'COMMS';
  if (e.source === 'DATA_QUALITY') return 'SENSOR';
  return 'PROCESS';
};

const titleFor = (e: LiveAlarmEvent): string => {
  switch (e.evaluatedState) {
    case 'alarm_high':
      return `High Alarm — ${e.tagLabel}`;
    case 'alarm_low':
      return `Low Alarm — ${e.tagLabel}`;
    case 'warning_high':
      return `High Warning — ${e.tagLabel}`;
    case 'warning_low':
      return `Low Warning — ${e.tagLabel}`;
    case 'no_data':
      return `Data Quality Bad — ${e.tagLabel}`;
    case 'stale':
      return `Stale Signal — ${e.tagLabel}`;
    case 'offline':
      return `Offline Signal — ${e.tagLabel}`;
  }
};

const hhmmUtc = (iso: string): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m} UTC`;
};

/**
 * Compose a per-row source descriptor for the table.  We surface the
 * canonical tag (e.g. `q_liquid`) — same shape the existing UI expects
 * for ISA tag / instrumentation source. A future revision could derive
 * `pidInstrumentTag` from the snapshot when present.
 */
const sourceDescriptor = (e: LiveAlarmEvent): string => String(e.tag);

const unitDescriptor = (e: LiveAlarmEvent): string => String(e.wellId);

/**
 * Build an AlarmRecord from a LiveAlarmEvent. `nowMs` is supplied so the
 * age labels stay consistent with the caller's render tick.
 */
export const liveEventToRecord = (e: LiveAlarmEvent, nowMs: number): AlarmRecord => {
  const firstSeenMs = Date.parse(e.firstSeenAt);
  const lastSeenMs = Date.parse(e.lastUpdatedAt);
  const clearedMs = e.clearedAt ? Date.parse(e.clearedAt) : null;
  const isCleared = e.lifecycle === 'CLEARED';

  const activeSec = isCleared
    ? Math.max(0, Math.round(((clearedMs ?? lastSeenMs) - firstSeenMs) / 1000))
    : Math.max(0, Math.round((nowMs - firstSeenMs) / 1000));

  return {
    id: e.id,
    priority: e.severity,
    state: e.lifecycle,
    kind: kindFromSource(e),
    title: titleFor(e),
    source: sourceDescriptor(e),
    unit: unitDescriptor(e),
    raisedUtc: hhmmUtc(e.firstSeenAt),
    ageLabel: formatActiveFor(activeSec),
    activeSec,
    clearedUtc: isCleared ? hhmmUtc(e.clearedAt ?? e.lastUpdatedAt) : null,
    durationSec: isCleared ? activeSec : null,
    ackBy: e.ackedBy ?? null,
  };
};

export const liveEventsToRecords = (
  events: readonly LiveAlarmEvent[],
  nowMs: number,
): AlarmRecord[] => events.map((e) => liveEventToRecord(e, nowMs));
