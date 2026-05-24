/**
 * Live alarm-feed builder — F2C.
 *
 * Turns a sorted list of `LiveAlarmEvent`s into the compact one-line feed
 * rows the right-rail `RealtimeAlarmFeed` already renders. Newest first.
 * Source-type and lifecycle drive the icon tone; the title carries an
 * ISA-style verb so the operator can scan the stream:
 *
 *   - HIGH ALARM raised        (process URGENT, ACTIVE)
 *   - INLET PRESSURE acknowledged (any, ACKED)
 *   - OFFLINE SIGNAL raised    (communication, ACTIVE)
 *   - GAS RATE cleared         (any, CLEARED)
 *
 * Capped at the 12 most recent rows — the feed is a glance widget, not
 * a paginated archive.
 */
import type { AlarmFeedEvent, FeedEventTone } from './data/alarms.mock';
import type { LiveAlarmEvent } from '@/lib/alarms';

const FEED_LIMIT = 12;

const toneFor = (e: LiveAlarmEvent): FeedEventTone => {
  if (e.lifecycle === 'CLEARED') return 'normal';
  if (e.lifecycle === 'ACKED') return 'low';
  switch (e.severity) {
    case 'URGENT':
      return 'urgent';
    case 'HIGH':
      return 'high';
    case 'MEDIUM':
      return 'medium';
    case 'LOW':
      return 'low';
  }
};

const verbFor = (e: LiveAlarmEvent): 'raised' | 'acknowledged' | 'cleared' => {
  if (e.lifecycle === 'CLEARED') return 'cleared';
  if (e.lifecycle === 'ACKED') return 'acknowledged';
  return 'raised';
};

const titleFor = (e: LiveAlarmEvent): string => {
  switch (e.evaluatedState) {
    case 'alarm_high':
      return 'HIGH ALARM';
    case 'alarm_low':
      return 'LOW ALARM';
    case 'warning_high':
      return 'HIGH WARNING';
    case 'warning_low':
      return 'LOW WARNING';
    case 'no_data':
      return 'DATA QUALITY';
    case 'stale':
      return 'STALE SIGNAL';
    case 'offline':
      return 'OFFLINE SIGNAL';
  }
};

const ageLabel = (refMs: number, nowMs: number): string => {
  const sec = Math.max(0, Math.floor((nowMs - refMs) / 1000));
  if (sec < 60) return `${String(sec)}s ago`;
  if (sec < 3600) return `${String(Math.floor(sec / 60)).padStart(2, '0')}m ago`;
  return `${String(Math.floor(sec / 3600))}h ago`;
};

const refMomentMs = (e: LiveAlarmEvent): number => {
  const iso =
    e.lifecycle === 'CLEARED'
      ? (e.clearedAt ?? e.lastUpdatedAt)
      : e.lifecycle === 'ACKED'
        ? (e.ackedAt ?? e.lastUpdatedAt)
        : e.firstSeenAt;
  return Date.parse(iso);
};

export const buildLiveFeed = (
  events: readonly LiveAlarmEvent[],
  nowMs: number,
): AlarmFeedEvent[] => {
  const sorted = [...events].sort((a, b) => refMomentMs(b) - refMomentMs(a));
  return sorted.slice(0, FEED_LIMIT).map((e) => ({
    id: e.id,
    tone: toneFor(e),
    title: `${titleFor(e)} ${verbFor(e)}`,
    unit: String(e.wellId),
    source: `${String(e.tag)}${e.ackedBy ? ` · ${e.ackedBy}` : ''}`,
    at: ageLabel(refMomentMs(e), nowMs),
  }));
};
