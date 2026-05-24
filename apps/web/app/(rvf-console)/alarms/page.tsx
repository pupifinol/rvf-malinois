'use client';

import { useMemo, useState } from 'react';

import { ActiveAlarmsTable } from '@/components/alarms/ActiveAlarmsTable';
import { AlarmFilterBar } from '@/components/alarms/AlarmFilterBar';
import { AlarmHistoryTable } from '@/components/alarms/AlarmHistoryTable';
import { AlarmQuickActions, type ActionId } from '@/components/alarms/AlarmQuickActions';
import { AlarmSeverityCards } from '@/components/alarms/AlarmSeverityCards';
import { AlarmTrendCard } from '@/components/alarms/AlarmTrendCard';
import { CriticalAlarmBanner } from '@/components/alarms/CriticalAlarmBanner';
import {
  type AlarmPriority,
  type AlarmRecord,
  type AlarmState,
  type AlarmTab,
} from '@/components/alarms/data/alarms.mock';
import { liveEventsToRecords } from '@/components/alarms/liveAlarmAdapter';
import { buildLiveFeed } from '@/components/alarms/liveFeed';
import { RealtimeAlarmFeed } from '@/components/alarms/RealtimeAlarmFeed';
import { labelForTag } from '@/components/alarms/tagLabels';
import { OPERATIONS_JOBS } from '@/components/operations/data/operationsJobs';
import { PageHeader, StatusChip } from '@/components/shell/PageHeader';
import { SharedTelemetryRuntime } from '@/components/telemetry/SharedTelemetryRuntime';
import { acknowledgeAlarm, acknowledgeManyAlarms } from '@/lib/alarms';
import { useAlarmCenter, useNowTick } from '@/lib/hooks';

/**
 * Alarms — Industrial Alarm Operations Center (ISA-18.2), F2C live.
 *
 * Layout preserved from the F1 baseline (control-room density, two-column
 * grid, severity counters + trend on a single row). What CHANGED in F2C:
 *
 *   1. Mounts `SharedTelemetryRuntime` so this page receives the F2A
 *      simulated normalized stream even when Operations is not also
 *      mounted. The runtime is ref-counted; mounting Operations + Alarms
 *      together still spins up a single adapter.
 *
 *   2. Uses `useAlarmCenter` (F2C) to derive the live `LiveAlarmEvent[]`
 *      from the telemetry store + active job snapshots + ack store. The
 *      events are converted to the legacy `AlarmRecord` shape via
 *      `liveEventsToRecords` so the existing visual components (banner,
 *      tables, severity cards, feed) consume them unchanged.
 *
 *   3. Counts in the header / severity cards come from the derived
 *      summary — never from a static array. Trend card stays static for
 *      now (24 h aggregation is backend territory) and is documented as
 *      F2C tech debt.
 *
 *   4. Acknowledge is local: clicking Ack on a row writes into the
 *      in-memory ack store; the row re-renders as ACKED on the next
 *      tick. No backend call.
 *
 * Critically, per ADR-005 regla 1: every threshold the operator sees was
 * read from the *commissioning snapshot of the active job* — never from
 * Units, never from Settings, never hardcoded here.
 */
const PRIORITY_TABS: ReadonlySet<AlarmTab> = new Set(['URGENT', 'HIGH', 'MEDIUM', 'LOW']);
const STATE_TABS: ReadonlySet<AlarmTab> = new Set(['ACTIVE', 'ACKED', 'CLEARED']);

// Hoisted so the array reference is stable across renders — useSyncExternalStore
// would otherwise re-subscribe on every render of the page.
const ALARM_JOBS = OPERATIONS_JOBS.map((b) => b.job);

export default function AlarmsPage() {
  const [tab, setTab] = useState<AlarmTab>('ACTIVE');
  const [unit, setUnit] = useState('ALL');
  const [source, setSource] = useState('ALL');
  const [state, setState] = useState('ALL');
  const [selectedId, setSelectedId] = useState<string>('');

  const snapshot = useAlarmCenter(ALARM_JOBS, labelForTag);
  const now = useNowTick(5000);

  // ---------------------------------------------------------------------
  // Live data → AlarmRecord rows the existing components understand
  // ---------------------------------------------------------------------
  const liveRecords = useMemo<readonly AlarmRecord[]>(
    () => liveEventsToRecords(snapshot.events, now || Date.now()),
    [snapshot.events, now],
  );

  const activeLive = liveRecords.filter((r) => r.state !== 'CLEARED');
  const clearedLive = liveRecords.filter((r) => r.state === 'CLEARED');

  // ---------------------------------------------------------------------
  // Filter + selection (same semantics as the F1 baseline)
  // ---------------------------------------------------------------------
  const filtered = useMemo(() => {
    const pool: readonly AlarmRecord[] =
      tab === 'CLEARED' ? clearedLive : tab === 'ALL' ? liveRecords : activeLive;

    return pool.filter((a) => {
      if (PRIORITY_TABS.has(tab) && a.priority !== (tab as AlarmPriority)) return false;
      if (STATE_TABS.has(tab) && a.state !== (tab as AlarmState)) return false;
      if (unit !== 'ALL' && a.unit !== unit) return false;
      if (source !== 'ALL' && a.source !== source) return false;
      if (state !== 'ALL' && a.state !== (state as AlarmState)) return false;
      return true;
    });
    // liveRecords drives activeLive/clearedLive; depending on it is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, unit, source, state, liveRecords]);

  const activeRows = filtered.filter((a) => a.state !== 'CLEARED');
  const historyRows = filtered.filter((a) => a.state === 'CLEARED');

  // Highest-priority active row drives the critical banner. We pick the
  // top URGENT/ACTIVE one if present; otherwise null (collapsed state).
  const criticalAlarm = useMemo(
    () => activeLive.find((a) => a.priority === 'URGENT' && a.state === 'ACTIVE') ?? null,
    [activeLive],
  );

  const allUnits = useMemo(() => unique(liveRecords.map((a) => a.unit)), [liveRecords]);
  const allSources = useMemo(() => unique(liveRecords.map((a) => a.source)), [liveRecords]);
  const allStates: readonly string[] = ['ACTIVE', 'ACKED', 'CLEARED'];

  // Header chips derived from the live summary (unfiltered, as before).
  const urgentCount = snapshot.summary.urgent;
  const ackPct = snapshot.summary.ackPct;
  const activeTotal = snapshot.summary.activeTotal;

  const feedEvents = useMemo(
    () => buildLiveFeed(snapshot.events, now || Date.now()),
    [snapshot.events, now],
  );

  // ---------------------------------------------------------------------
  // Quick actions — local-only behaviour
  // ---------------------------------------------------------------------
  const handleAck = (id: string): void => {
    acknowledgeAlarm(id);
  };

  const handleQuickAction = (id: ActionId): void => {
    if (id === 'ack-all-active') {
      acknowledgeManyAlarms(
        snapshot.events.filter((e) => e.lifecycle === 'ACTIVE').map((e) => e.id),
      );
      return;
    }
    if (id === 'ack-low-priority') {
      acknowledgeManyAlarms(
        snapshot.events
          .filter((e) => e.lifecycle === 'ACTIVE' && e.severity === 'LOW')
          .map((e) => e.id),
      );
      return;
    }
    // Other quick actions remain inert in F2C — they imply backend behaviour
    // (export to PDF, create maintenance ticket, silence horn) that lives
    // outside this scope.
  };

  return (
    <div className="flex flex-col gap-2">
      <SharedTelemetryRuntime />

      <PageHeader
        title="Alarm Center"
        subtitle="ISA-18.2 prioritised queue · F2 simulated normalized stream"
        right={
          <>
            <StatusChip tone={urgentCount > 0 ? 'alarm' : 'normal'}>
              {activeTotal} Active
            </StatusChip>
            <StatusChip tone={ackPct >= 80 ? 'normal' : ackPct >= 50 ? 'warn' : 'alarm'}>
              Ack {ackPct}%
            </StatusChip>
          </>
        }
      />

      <CriticalAlarmBanner alarm={criticalAlarm} onAck={handleAck} />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,240px)] gap-2">
        <AlarmSeverityCards alarms={activeLive} />
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
          <RealtimeAlarmFeed events={feedEvents} />
          <AlarmQuickActions onAction={handleQuickAction} />
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
