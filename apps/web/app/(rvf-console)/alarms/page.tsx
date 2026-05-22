'use client';

import { useMemo, useState } from 'react';

import { ActiveAlarmsTable } from '@/components/alarms/ActiveAlarmsTable';
import { AlarmFilterBar } from '@/components/alarms/AlarmFilterBar';
import { AlarmHistoryTable } from '@/components/alarms/AlarmHistoryTable';
import { AlarmQuickActions } from '@/components/alarms/AlarmQuickActions';
import { AlarmSeverityCards } from '@/components/alarms/AlarmSeverityCards';
import { AlarmTrendCard } from '@/components/alarms/AlarmTrendCard';
import { CriticalAlarmBanner } from '@/components/alarms/CriticalAlarmBanner';
import {
  activeAlarms,
  historyAlarms,
  type AlarmPriority,
  type AlarmRecord,
  type AlarmState,
  type AlarmTab,
} from '@/components/alarms/data/alarms.mock';
import { RealtimeAlarmFeed } from '@/components/alarms/RealtimeAlarmFeed';
import { PageHeader, StatusChip } from '@/components/shell/PageHeader';

/**
 * Alarms — Industrial Alarm Operations Center (ISA-18.2).
 *
 * Layout (tuned for a 16:9 control room monitor):
 *   1. PageHeader + at-a-glance chips
 *   2. CriticalAlarmBanner — single highest-priority active alarm
 *   3. Severity cards (6) + Alarm Trend (last 24 h) on one row
 *   4. Filter bar — tabs (queue + priority) + Unit/Source/State dropdowns
 *   5. Main 2-column grid:
 *        Left:  Active Alarms · Alarm History (stacked)
 *        Right: Realtime Alarm Feed · Quick Actions (stacked)
 *
 * Filter + selection live in client state so the bar and tables stay
 * in sync without a round-trip. The acknowledge handlers are placeholder
 * no-ops until the alarm-mutation service lands.
 */
const PRIORITY_TABS: ReadonlySet<AlarmTab> = new Set(['URGENT', 'HIGH', 'MEDIUM', 'LOW']);
const STATE_TABS: ReadonlySet<AlarmTab> = new Set(['ACTIVE', 'ACKED', 'CLEARED']);

export default function AlarmsPage() {
  const [tab, setTab] = useState<AlarmTab>('ACTIVE');
  const [unit, setUnit] = useState('ALL');
  const [source, setSource] = useState('ALL');
  const [state, setState] = useState('ALL');
  const [selectedId, setSelectedId] = useState<string>(activeAlarms[0]?.id ?? '');

  // Filter source data: ACTIVE/ACKED + the four priorities filter the
  // live queue; CLEARED filters history; ALL covers both.
  const filtered = useMemo(() => {
    const pool: readonly AlarmRecord[] =
      tab === 'CLEARED'
        ? historyAlarms
        : tab === 'ALL'
          ? [...activeAlarms, ...historyAlarms]
          : activeAlarms;

    return pool.filter((a) => {
      if (PRIORITY_TABS.has(tab) && a.priority !== (tab as AlarmPriority)) return false;
      if (STATE_TABS.has(tab) && a.state !== (tab as AlarmState)) return false;
      if (unit !== 'ALL' && a.unit !== unit) return false;
      if (source !== 'ALL' && a.source !== source) return false;
      if (state !== 'ALL' && a.state !== (state as AlarmState)) return false;
      return true;
    });
  }, [tab, unit, source, state]);

  // Split filtered pool into active + history so each table gets its
  // own slice. The bar's tab is the primary intent; the tables enforce
  // that intent for clarity.
  const activeRows = filtered.filter((a) => a.state !== 'CLEARED');
  const historyRows = filtered.filter((a) => a.state === 'CLEARED');

  const criticalAlarm = useMemo(() => {
    const urgentActive = activeAlarms.filter(
      (a) => a.priority === 'URGENT' && a.state === 'ACTIVE',
    );
    return urgentActive[0] ?? null;
  }, []);

  const allUnits = useMemo(
    () => unique([...activeAlarms, ...historyAlarms].map((a) => a.unit)),
    [],
  );
  const allSources = useMemo(
    () => unique([...activeAlarms, ...historyAlarms].map((a) => a.source)),
    [],
  );
  const allStates: readonly string[] = ['ACTIVE', 'ACKED', 'CLEARED'];

  // The total live ack rate stays based on the *un-filtered* queue —
  // the header chip should not change just because the user filtered.
  const liveActive = activeAlarms.filter((a) => a.state !== 'CLEARED');
  const ackPct =
    liveActive.length === 0
      ? 100
      : Math.round(
          (liveActive.filter((a) => a.state === 'ACKED').length / liveActive.length) * 100,
        );
  const urgentCount = liveActive.filter((a) => a.priority === 'URGENT').length;

  const handleAck = (_id: string): void => {
    // Placeholder — wired when the alarm-mutation service lands.
  };

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Alarm Center"
        subtitle="ISA-18.2 prioritised queue across the deployed fleet"
        right={
          <>
            <StatusChip tone={urgentCount > 0 ? 'alarm' : 'normal'}>
              {liveActive.length} Active
            </StatusChip>
            <StatusChip tone={ackPct >= 80 ? 'normal' : ackPct >= 50 ? 'warn' : 'alarm'}>
              Ack {ackPct}%
            </StatusChip>
          </>
        }
      />

      <CriticalAlarmBanner alarm={criticalAlarm} onAck={handleAck} />

      {/* Severity cards + trend on a single row. Trend is narrower than
          the counter row so it always reads as secondary telemetry. */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,240px)] gap-2">
        <AlarmSeverityCards alarms={activeAlarms} />
        <AlarmTrendCard />
      </div>

      <AlarmFilterBar
        tab={tab}
        onTabChange={setTab}
        units={allUnits}
        unit={unit}
        onUnitChange={setUnit}
        sources={allSources}
        source={source}
        onSourceChange={setSource}
        states={allStates}
        state={state}
        onStateChange={setState}
        onClearFilters={() => {
          setUnit('ALL');
          setSource('ALL');
          setState('ALL');
        }}
      />

      {/* Main 2-column grid */}
      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(0,280px)] gap-2">
        <div className="flex flex-col gap-2 min-w-0">
          <ActiveAlarmsTable
            rows={activeRows}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onAck={handleAck}
          />
          <AlarmHistoryTable rows={historyRows} />
        </div>
        <aside className="flex flex-col gap-2 2xl:max-w-[280px]">
          <RealtimeAlarmFeed />
          <AlarmQuickActions />
        </aside>
      </div>
    </div>
  );
}

/** Distinct values, preserving first-seen order. */
const unique = <T,>(xs: readonly T[]): T[] => {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const x of xs) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
};
