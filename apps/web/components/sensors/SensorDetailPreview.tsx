import { cn } from '@rvf/ui';

import { formatLastReport, type SensorRecord, type SensorStatus } from './data/sensors.mock';

import { Sparkline } from '@/components/operations/Sparkline';
import { Panel } from '@/components/shell/Panel';

/**
 * SensorDetailPreview — bottom-left panel of /sensors.
 *
 * Promoted to an operational instrument profile. The reading + sparkline
 * stay as the at-a-glance answer, but the diagnostic grid underneath now
 * carries every field a technician needs before opening a case ticket:
 *
 *   - Source / Gateway / Last Update (provenance + freshness)
 *   - Last Calibration date (audit)
 *   - Signal Health (RF quality, banded normal/warn/alarm)
 *   - Packet Loss (telemetry reliability)
 *   - Drift Status (within-band / soft / out-of-band)
 *   - Telemetry Freshness (live / lagging / stale label)
 *   - Battery / Health / Latency
 *
 * Visual language is unchanged — label-over-value, tabular-nums, ISA-101
 * semantic tones. No sparkles, no extra animation.
 */
export interface SensorDetailPreviewProps {
  sensor: SensorRecord;
}

const statusStyles: Record<SensorStatus, { dot: string; text: string }> = {
  ONLINE: { dot: 'bg-status-normal', text: 'text-status-normal' },
  DEGRADED: { dot: 'bg-status-warn', text: 'text-status-warn' },
  OFFLINE: { dot: 'bg-status-alarm', text: 'text-status-alarm' },
  STALE: { dot: 'bg-status-stale', text: 'text-status-stale' },
};

const healthTone = (pct: number): string => {
  if (pct < 30) return 'text-status-alarm';
  if (pct < 70) return 'text-status-warn';
  return 'text-status-normal';
};

const batteryTone = (pct: number): string => {
  if (pct < 0) return 'text-text-muted';
  if (pct < 20) return 'text-status-alarm';
  if (pct < 40) return 'text-status-warn';
  return 'text-text-primary';
};

const packetLossTone = (pct: number): string => {
  if (pct < 0.5) return 'text-status-normal';
  if (pct < 2) return 'text-status-warn';
  return 'text-status-alarm';
};

const latencyTone = (ms: number, offline: boolean): string => {
  if (offline) return 'text-text-muted';
  if (ms === 0) return 'text-text-muted';
  if (ms < 100) return 'text-status-normal';
  if (ms < 200) return 'text-status-warn';
  return 'text-status-alarm';
};

/** Compute drift status from calibration + health heuristic. */
const driftOf = (s: SensorRecord): { label: string; tone: string } => {
  if (s.status === 'OFFLINE') return { label: 'Unknown', tone: 'text-text-muted' };
  if (s.calDueDays < 0 || s.healthPct < 60) {
    return { label: 'Out of band', tone: 'text-status-alarm' };
  }
  if (s.calDueDays < 14 || s.healthPct < 80) {
    return { label: 'Soft band', tone: 'text-status-warn' };
  }
  return { label: 'Within band', tone: 'text-status-normal' };
};

/** Telemetry freshness label from time-since-last-report. */
const freshnessOf = (s: SensorRecord): { label: string; tone: string } => {
  if (s.status === 'OFFLINE') return { label: 'No telemetry', tone: 'text-status-alarm' };
  if (s.lastReportSec > 60) return { label: 'Stale', tone: 'text-status-stale' };
  if (s.lastReportSec > 10) return { label: 'Lagging', tone: 'text-status-warn' };
  return { label: 'Live', tone: 'text-status-normal' };
};

/** Signal-health label rolled up from RF quality (or "wired" for line sensors). */
const signalOf = (s: SensorRecord): { label: string; tone: string } => {
  if (s.rfQualityPct === null) return { label: 'Wired link', tone: 'text-text-primary' };
  if (s.status === 'OFFLINE') return { label: 'No signal', tone: 'text-status-alarm' };
  if (s.rfQualityPct >= 80)
    return { label: `Strong · ${s.rfQualityPct}%`, tone: 'text-status-normal' };
  if (s.rfQualityPct >= 60) return { label: `OK · ${s.rfQualityPct}%`, tone: 'text-status-warn' };
  if (s.rfQualityPct >= 30) return { label: `Weak · ${s.rfQualityPct}%`, tone: 'text-status-warn' };
  return { label: `Failing · ${s.rfQualityPct}%`, tone: 'text-status-alarm' };
};

export const SensorDetailPreview = ({ sensor }: SensorDetailPreviewProps) => {
  const ss = statusStyles[sensor.status];
  const wired = sensor.batteryPct < 0;
  const drift = driftOf(sensor);
  const freshness = freshnessOf(sensor);
  const signal = signalOf(sensor);
  const offline = sensor.status === 'OFFLINE';

  return (
    <Panel
      title="Sensor Detail Preview"
      meta={
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs font-semibold uppercase tracking-micro',
            ss.text,
          )}
        >
          <span
            aria-hidden="true"
            className={cn('inline-block w-1.5 h-1.5 rounded-full', ss.dot)}
          />
          {sensor.status}
        </span>
      }
    >
      <header className="flex items-baseline gap-3 flex-wrap">
        <h3 className="font-mono text-lg font-bold uppercase tracking-wide text-text-primary leading-none">
          {sensor.tag}
        </h3>
        <span className="text-micro uppercase tracking-micro text-text-muted">
          {sensor.kind === 'WATER_CUT' ? 'Water Cut' : sensor.kind.toLowerCase()} ·{' '}
          {sensor.location}
        </span>
      </header>

      {/* Current reading + trend */}
      <div className="flex items-center justify-between gap-3 bg-surface-raised border border-border-subtle rounded-xs px-3 py-3.5">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-micro uppercase tracking-micro text-text-muted">
            {sensor.reading.label}
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums text-text-primary leading-none">
              {formatValue(sensor.reading.value)}
            </span>
            <span className="text-xs text-text-muted tabular-nums">{sensor.reading.unit}</span>
          </div>
        </div>
        <Sparkline
          data={sensor.reading.history}
          height={36}
          width={160}
          strokeWidth={1.2}
          className="text-series-1 opacity-80 shrink-0"
        />
      </div>

      {/* Diagnostic grid — three logical bands stacked, each a 4-col row.
          Bands group related fields: provenance, calibration & telemetry
          reliability, sensor health. Thin dividers reinforce the ISA-101
          rhythm without adding visual noise. */}
      <dl className="flex flex-col text-xs">
        {/* Band 1 — provenance */}
        <div className="grid grid-cols-4 gap-x-3 gap-y-2.5 pb-3 border-b border-border-subtle">
          <Field label="Source" value={sensor.source} />
          <Field label="Gateway" value={sensor.gateway} mono />
          <Field label="Location" value={sensor.location} />
          <Field label="Last Update" value={formatLastReport(sensor.lastReportSec)} mono />
        </div>

        {/* Band 2 — calibration & telemetry reliability */}
        <div className="grid grid-cols-4 gap-x-3 gap-y-2.5 py-3 border-b border-border-subtle">
          <Field label="Last Calibration" value={sensor.lastCalDate} mono />
          <Field label="Signal Health" value={signal.label} tone={signal.tone} mono />
          <Field
            label="Packet Loss"
            value={`${sensor.packetLossPct.toFixed(2)}%`}
            tone={offline ? 'text-text-muted' : packetLossTone(sensor.packetLossPct)}
            mono
          />
          <Field label="Drift Status" value={drift.label} tone={drift.tone} />
        </div>

        {/* Band 3 — live health */}
        <div className="grid grid-cols-4 gap-x-3 gap-y-2.5 pt-3">
          <Field label="Telemetry" value={freshness.label} tone={freshness.tone} />
          <Field
            label="Battery"
            value={wired ? 'AC line' : `${sensor.batteryPct}%`}
            tone={batteryTone(sensor.batteryPct)}
            mono
          />
          <Field
            label="Health"
            value={`${sensor.healthPct}%`}
            tone={healthTone(sensor.healthPct)}
            mono
          />
          <Field
            label="Latency"
            value={offline ? '—' : `${sensor.latencyMs} ms`}
            tone={latencyTone(sensor.latencyMs, offline)}
            mono
          />
        </div>
      </dl>
    </Panel>
  );
};

const formatValue = (v: number): string => {
  if (v >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(1);
};

const Field = ({
  label,
  value,
  tone,
  mono = false,
}: {
  label: string;
  value: string;
  tone?: string;
  mono?: boolean;
}) => (
  <div className="flex flex-col gap-1 min-w-0">
    <dt className="text-micro uppercase tracking-micro text-text-muted leading-none">{label}</dt>
    <dd
      className={cn(
        'truncate font-semibold leading-none',
        mono ? 'font-mono tabular-nums' : 'uppercase tracking-micro',
        tone ?? 'text-text-primary',
      )}
    >
      {value}
    </dd>
  </div>
);
