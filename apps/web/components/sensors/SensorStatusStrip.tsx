import { cn } from '@rvf/ui';

import type { SensorRecord } from './data/sensors.mock';

/**
 * SensorStatusStrip — seven-cell metric strip directly under the page
 * header. Same label-over-value rhythm as the /units status bar so the
 * operator's eye already knows where to land.
 *
 * The strip is read-only: it summarizes the inventory. The numbers fall
 * out of the records array so adding a sensor automatically updates
 * every cell here.
 */
export interface SensorStatusStripProps {
  sensors: readonly SensorRecord[];
}

export const SensorStatusStrip = ({ sensors }: SensorStatusStripProps) => {
  const total = sensors.length;
  const online = sensors.filter((s) => s.status === 'ONLINE').length;
  const degraded = sensors.filter((s) => s.status === 'DEGRADED').length;
  const offline = sensors.filter((s) => s.status === 'OFFLINE' || s.status === 'STALE').length;

  const wirelessOnline = sensors.filter((s) => s.rfQualityPct !== null && s.status !== 'OFFLINE');
  const avgRfPct =
    wirelessOnline.length === 0
      ? 0
      : Math.round(
          wirelessOnline.reduce((acc, s) => acc + (s.rfQualityPct ?? 0), 0) / wirelessOnline.length,
        );

  const livingSensors = sensors.filter((s) => s.status !== 'OFFLINE' && s.latencyMs > 0);
  const avgLatency =
    livingSensors.length === 0
      ? 0
      : Math.round(livingSensors.reduce((acc, s) => acc + s.latencyMs, 0) / livingSensors.length);

  const batteryAlerts = sensors.filter((s) => s.batteryPct >= 0 && s.batteryPct < 25).length;

  return (
    <div
      className={cn(
        'bg-surface border border-border-subtle rounded-sm',
        'grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-x-5 gap-y-2 p-4',
      )}
      aria-label="Field instrumentation summary"
    >
      <Cell label="Total Sensors" value={total.toString()} />
      <Cell label="Online" value={online.toString()} tone="text-status-normal" />
      <Cell
        label="Degraded"
        value={degraded.toString()}
        tone={degraded > 0 ? 'text-status-warn' : 'text-text-secondary'}
      />
      <Cell
        label="Offline"
        value={offline.toString()}
        tone={offline > 0 ? 'text-status-alarm' : 'text-text-secondary'}
      />
      <Cell label="Avg Latency" value={`${avgLatency} ms`} tone={avgLatencyTone(avgLatency)} />
      <Cell label="Avg RF Quality" value={`${avgRfPct}%`} tone={avgRfTone(avgRfPct)} />
      <Cell
        label="Battery Alerts"
        value={batteryAlerts.toString()}
        tone={batteryAlerts > 0 ? 'text-status-warn' : 'text-text-secondary'}
      />
    </div>
  );
};

const avgLatencyTone = (ms: number): string => {
  if (ms === 0) return 'text-text-muted';
  if (ms < 100) return 'text-status-normal';
  if (ms < 200) return 'text-status-warn';
  return 'text-status-alarm';
};

const avgRfTone = (pct: number): string => {
  if (pct === 0) return 'text-text-muted';
  if (pct >= 80) return 'text-status-normal';
  if (pct >= 60) return 'text-status-warn';
  return 'text-status-alarm';
};

const Cell = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <div className="min-w-0 flex flex-col gap-0.5">
    <span className="text-micro uppercase tracking-micro text-text-muted">{label}</span>
    <span
      className={cn(
        'text-sm font-semibold font-mono tabular-nums truncate',
        tone ?? 'text-text-primary',
      )}
    >
      {value}
    </span>
  </div>
);
