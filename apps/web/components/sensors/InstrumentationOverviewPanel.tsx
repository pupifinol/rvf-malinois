import { cn } from '@rvf/ui';
import { Droplet, Droplets, Gauge, type LucideIcon, Ruler, Thermometer, Wind } from 'lucide-react';

import type { SensorKind, SensorRecord } from './data/sensors.mock';

import { Panel } from '@/components/shell/Panel';

/**
 * InstrumentationOverviewPanel — left-column panel of /sensors.
 *
 * Operations-grade roll-up of the deployed instrumentation:
 *
 *   1. Category cards — one per ISA instrument family (pressure,
 *      temperature, flow, water cut, level, density). Each card shows
 *      the family's total, the online count, and the degraded count.
 *      Restrained mono icon, no decoration.
 *
 *   2. Health metrics block — telemetry-reliability counters underneath
 *      (calibration overdue, low battery, RF degraded, stale, plus the
 *      averages: RF quality, latency, packet loss).
 *
 * Everything is derived from the same `sensors` array driving the
 * inventory table, so adding a sensor automatically reshapes this panel.
 */
export interface InstrumentationOverviewPanelProps {
  sensors: readonly SensorRecord[];
}

interface CategoryDef {
  label: string;
  kinds: readonly SensorKind[];
  icon: LucideIcon;
}

// Group GAS into the flow family — gas flow meters are still flow meters
// from an instrumentation-personnel point of view.
const categories: readonly CategoryDef[] = [
  { label: 'Pressure', kinds: ['PRESSURE'], icon: Gauge },
  { label: 'Temperature', kinds: ['TEMPERATURE'], icon: Thermometer },
  { label: 'Flow', kinds: ['FLOW', 'GAS'], icon: Wind },
  { label: 'Water Cut', kinds: ['WATER_CUT'], icon: Droplets },
  { label: 'Level', kinds: ['LEVEL'], icon: Ruler },
  { label: 'Density', kinds: ['DENSITY'], icon: Droplet },
];

export const InstrumentationOverviewPanel = ({ sensors }: InstrumentationOverviewPanelProps) => {
  /* ----- category rollup ----- */
  const categoryStats = categories.map((c) => {
    const inFamily = sensors.filter((s) => c.kinds.includes(s.kind));
    const online = inFamily.filter((s) => s.status === 'ONLINE').length;
    const degraded = inFamily.filter((s) => s.status === 'DEGRADED' || s.status === 'STALE').length;
    const offline = inFamily.filter((s) => s.status === 'OFFLINE').length;
    return { ...c, total: inFamily.length, online, degraded, offline };
  });

  /* ----- diagnostics rollup ----- */
  const calOverdue = sensors.filter((s) => s.calDueDays < 0).length;
  const lowBattery = sensors.filter((s) => s.batteryPct >= 0 && s.batteryPct < 25).length;
  const rfDegraded = sensors.filter(
    (s) => s.rfQualityPct !== null && s.rfQualityPct < 60 && s.status !== 'OFFLINE',
  ).length;
  const stale = sensors.filter((s) => s.status === 'STALE').length;

  const wireless = sensors.filter((s) => s.rfQualityPct !== null && s.status !== 'OFFLINE');
  const avgRf =
    wireless.length === 0
      ? 0
      : Math.round(wireless.reduce((acc, s) => acc + (s.rfQualityPct ?? 0), 0) / wireless.length);

  const living = sensors.filter((s) => s.status !== 'OFFLINE' && s.latencyMs > 0);
  const avgLatency =
    living.length === 0
      ? 0
      : Math.round(living.reduce((acc, s) => acc + s.latencyMs, 0) / living.length);

  const reporting = sensors.filter((s) => s.status !== 'OFFLINE');
  const avgPacketLoss =
    reporting.length === 0
      ? 0
      : reporting.reduce((acc, s) => acc + s.packetLossPct, 0) / reporting.length;

  const totalCount = sensors.length;
  const totalOnline = sensors.filter((s) => s.status === 'ONLINE').length;

  return (
    <Panel
      title="Instrumentation Overview"
      meta={
        <span className="font-mono">
          {totalOnline}/{totalCount} online
        </span>
      }
    >
      {/* Category cards — 2 columns × 3 rows */}
      <div className="grid grid-cols-2 gap-2" aria-label="Instrument families">
        {categoryStats.map((c) => (
          <CategoryCard key={c.label} category={c} />
        ))}
      </div>

      {/* Diagnostics sub-section */}
      <section
        aria-label="Health metrics"
        className="flex flex-col gap-1 pt-3 mt-1 border-t border-border-subtle"
      >
        <h3 className="text-micro uppercase tracking-wide font-bold text-text-primary mb-1">
          Health Metrics
        </h3>
        <ul className="flex flex-col text-xs">
          <Metric
            label="Calibration overdue"
            value={calOverdue.toString()}
            tone={calOverdue > 0 ? 'text-status-alarm' : undefined}
          />
          <Metric
            label="Low battery"
            value={lowBattery.toString()}
            tone={lowBattery > 0 ? 'text-status-warn' : undefined}
          />
          <Metric
            label="RF degraded"
            value={rfDegraded.toString()}
            tone={rfDegraded > 0 ? 'text-status-warn' : undefined}
          />
          <Metric
            label="Stale sensors"
            value={stale.toString()}
            tone={stale > 0 ? 'text-status-stale' : undefined}
          />
          <Metric label="Avg RF quality" value={`${avgRf}%`} tone={avgRfTone(avgRf)} />
          <Metric
            label="Avg latency"
            value={`${avgLatency} ms`}
            tone={avgLatencyTone(avgLatency)}
          />
          <Metric
            label="Avg packet loss"
            value={`${avgPacketLoss.toFixed(2)}%`}
            tone={packetLossTone(avgPacketLoss)}
          />
        </ul>
      </section>
    </Panel>
  );
};

/* ----- category card ---------------------------------------------------- */

const CategoryCard = ({
  category,
}: {
  category: {
    label: string;
    icon: LucideIcon;
    total: number;
    online: number;
    degraded: number;
    offline: number;
  };
}) => {
  const Icon = category.icon;
  const allOnline = category.degraded === 0 && category.offline === 0 && category.total > 0;
  return (
    <div className="bg-surface-raised border border-border-subtle rounded-xs px-3 py-2.5 flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-micro uppercase tracking-micro text-text-secondary">
        <Icon className="w-3.5 h-3.5 text-text-muted" aria-hidden="true" />
        <span className="font-semibold truncate">{category.label}</span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono tabular-nums text-2xl font-bold text-text-primary leading-none">
          {category.total}
        </span>
        {allOnline ? (
          <span className="text-micro uppercase tracking-micro font-semibold text-status-normal">
            All OK
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-micro uppercase tracking-micro font-mono pt-0.5 border-t border-border-subtle/60">
        <Stat label="Online" value={category.online} tone="text-status-normal" />
        <Stat
          label="Degraded"
          value={category.degraded + category.offline}
          tone={category.degraded + category.offline > 0 ? 'text-status-warn' : 'text-text-muted'}
        />
      </div>
    </div>
  );
};

const Stat = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
  <div className="flex items-baseline justify-between gap-1">
    <span className="text-text-muted">{label}</span>
    <span className={cn('tabular-nums font-semibold', tone)}>{value}</span>
  </div>
);

/* ----- diagnostics row -------------------------------------------------- */

const Metric = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <li className="flex items-center justify-between py-1.5 border-b border-border-subtle last:border-b-0">
    <span className="text-text-secondary">{label}</span>
    <span
      className={cn(
        'font-mono tabular-nums font-semibold uppercase tracking-micro',
        tone ?? 'text-text-primary',
      )}
    >
      {value}
    </span>
  </li>
);

/* ----- tone helpers ----------------------------------------------------- */

const avgRfTone = (pct: number): string => {
  if (pct === 0) return 'text-text-muted';
  if (pct >= 80) return 'text-status-normal';
  if (pct >= 60) return 'text-status-warn';
  return 'text-status-alarm';
};

const avgLatencyTone = (ms: number): string => {
  if (ms === 0) return 'text-text-muted';
  if (ms < 100) return 'text-status-normal';
  if (ms < 200) return 'text-status-warn';
  return 'text-status-alarm';
};

const packetLossTone = (pct: number): string => {
  if (pct === 0) return 'text-text-muted';
  if (pct < 1) return 'text-status-normal';
  if (pct < 3) return 'text-status-warn';
  return 'text-status-alarm';
};
