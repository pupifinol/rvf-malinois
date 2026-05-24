'use client';

import { cn } from '@rvf/ui';
import { useEffect, useMemo, useState } from 'react';

import type { Instrument, InstrumentHealth, UnitTwin } from './data/twin.mock';

import { Panel } from '@/components/shell/Panel';

/**
 * LiveInstrumentReadingsPanel — F3.1 enhancement.
 *
 * Compact, table-style snapshot of every transmitter/instrument attached
 * to the selected measurement unit. Surfaces, per row, the answers an
 * operations engineer needs at a glance: which tag, what kind of
 * measurement, where on the process, what value, what unit, online vs.
 * stale, quality, and how fresh the reading is.
 *
 * Intentionally NOT a trends/production screen: no charts, no sparklines,
 * no historical view. Trends live on /operations.
 *
 * Data source: the local Units twin mock (twin.mock.ts) which is the
 * authoritative runtime state for the screen today. The F3 backend
 * `/api/sensors?unitId=...` + `/api/telemetry/latest?unitId=...` use a
 * different unit-id namespace; a later migration will bridge the two
 * without changing this component's contract.
 */
type ReadingStatus = 'Online' | 'Stale' | 'Offline' | 'Fault';
type ReadingQuality = 'Good' | 'Uncertain' | 'Bad';

interface LiveReadingRow {
  id: string;
  tag: string;
  type: string;
  location: string;
  value: string;
  unit: string;
  status: ReadingStatus;
  quality: ReadingQuality;
  /** Seconds since the synthetic last reading. */
  ageSec: number;
}

const TYPE_BY_KIND: Record<Instrument['kind'], string> = {
  PIT: 'Pressure',
  TIT: 'Temperature',
  FIT: 'Flow',
  DPIT: 'Differential P.',
  LIT: 'Level',
  WCIT: 'Water Cut',
  VIB: 'Vibration',
};

const STATUS_STYLE: Record<ReadingStatus, { text: string; dot: string; border: string }> = {
  Online: {
    text: 'text-status-normal',
    dot: 'bg-status-normal',
    border: 'border-status-normal/40',
  },
  Stale: { text: 'text-status-stale', dot: 'bg-status-stale', border: 'border-status-stale/40' },
  Offline: { text: 'text-text-muted', dot: 'bg-text-muted', border: 'border-border-subtle' },
  Fault: { text: 'text-status-alarm', dot: 'bg-status-alarm', border: 'border-status-alarm/40' },
};

const QUALITY_STYLE: Record<ReadingQuality, string> = {
  Good: 'text-status-normal',
  Uncertain: 'text-status-stale',
  Bad: 'text-status-alarm',
};

const HEALTH_TO_QUALITY: Record<InstrumentHealth, ReadingQuality> = {
  GOOD: 'Good',
  DEGRADED: 'Uncertain',
  BAD: 'Bad',
};

/** Map a free-form instrument description to a coarse process location. */
const deriveLocation = (description: string): string => {
  const d = description.toLowerCase();
  if (d.includes('inlet')) return 'Inlet';
  if (d.includes('gas out')) return 'Gas Outlet';
  if (d.includes('liquid out')) return 'Liquid Outlet';
  if (d.includes('water cut')) return 'Liquid Outlet';
  if (d.includes('separator')) return 'Separator';
  if (d.includes('differential')) return 'Vessel';
  if (d.includes('vessel') || d.includes('level')) return 'Vessel';
  if (d.includes('line')) return 'Line';
  if (d.includes('pump') || d.includes('vibration')) return 'Pump';
  return '—';
};

const deriveStatus = (twin: UnitTwin, instrument: Instrument): ReadingStatus => {
  if (!instrument.enabled) return 'Offline';
  if (twin.comm === 'OFFLINE' || twin.status === 'OFFLINE' || twin.status === 'MAINTENANCE') {
    return 'Offline';
  }
  if (instrument.health === 'BAD') return 'Fault';
  if (instrument.health === 'DEGRADED' || twin.comm === 'DEGRADED') return 'Stale';
  return 'Online';
};

/** Split "1,820 psi" → { value: "1,820", unit: "psi" }. */
const splitReading = (reading: string): { value: string; unit: string } => {
  const trimmed = reading.trim();
  const idx = trimmed.lastIndexOf(' ');
  if (idx === -1) return { value: trimmed, unit: '' };
  return { value: trimmed.slice(0, idx), unit: trimmed.slice(idx + 1) };
};

/**
 * Synthesize a deterministic per-instrument "age" so the panel renders
 * realistic "Xs ago" labels without needing a real upstream timestamp.
 * Online sensors are fresh (0–4s); stale/fault drift further out. The
 * source of truth for "last reading" will be the F3 telemetry adapter.
 */
const baseAgeSec = (status: ReadingStatus, instrumentId: string): number => {
  if (status === 'Offline') return Number.POSITIVE_INFINITY;
  const seed = instrumentId
    .split('')
    .reduce<number>((acc, ch) => (acc + ch.charCodeAt(0)) >>> 0, 0);
  if (status === 'Online') return seed % 5; // 0–4 s
  if (status === 'Stale') return 18 + (seed % 25); // 18–42 s
  return 5 + (seed % 10); // Fault — likely actively sampling but bad value
};

const formatAge = (ageSec: number): string => {
  if (!Number.isFinite(ageSec)) return '—';
  if (ageSec < 1) return 'just now';
  if (ageSec < 60) return `${String(Math.floor(ageSec))}s ago`;
  if (ageSec < 3600) return `${String(Math.floor(ageSec / 60))}m ago`;
  return `${String(Math.floor(ageSec / 3600))}h ago`;
};

const buildRows = (twin: UnitTwin): LiveReadingRow[] =>
  twin.instruments.map((instrument) => {
    const tag = `${instrument.kind}-${instrument.loop}`;
    const status = deriveStatus(twin, instrument);
    const { value, unit } = splitReading(instrument.reading);
    return {
      id: instrument.id,
      tag,
      type: TYPE_BY_KIND[instrument.kind],
      location: deriveLocation(instrument.description),
      value,
      unit,
      status,
      quality: instrument.enabled ? HEALTH_TO_QUALITY[instrument.health] : 'Uncertain',
      ageSec: baseAgeSec(status, instrument.id),
    };
  });

export const LiveInstrumentReadingsPanel = ({ twin }: { twin: UnitTwin }) => {
  const baseRows = useMemo(() => buildRows(twin), [twin]);

  /**
   * Mount-tick: on the client we increment a counter every second so the
   * "Xs ago" column reads as a live clock without re-deriving the rows.
   * Until mounted we render `null` for age to avoid SSR/CSR mismatch.
   */
  const [tick, setTick] = useState<number | null>(null);
  useEffect(() => {
    setTick(0);
    const id = setInterval(() => {
      setTick((t) => (t === null ? 1 : t + 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const onlineCount = baseRows.filter((r) => r.status === 'Online').length;

  return (
    <Panel
      title="Live Instrument Readings"
      density="compact"
      meta={
        <span className="font-mono tabular-nums">
          {onlineCount}/{baseRows.length} online
        </span>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-text-muted text-micro uppercase tracking-micro">
              <th className="text-left font-bold py-1.5 pr-3">Tag</th>
              <th className="text-left font-bold py-1.5 pr-3">Type</th>
              <th className="text-left font-bold py-1.5 pr-3 hidden md:table-cell">Location</th>
              <th className="text-right font-bold py-1.5 pr-2">Value</th>
              <th className="text-left font-bold py-1.5 pr-3">Unit</th>
              <th className="text-left font-bold py-1.5 pr-3">Status</th>
              <th className="text-left font-bold py-1.5 pr-3 hidden lg:table-cell">Quality</th>
              <th className="text-right font-bold py-1.5">Last Reading</th>
            </tr>
          </thead>
          <tbody>
            {baseRows.map((row) => {
              const s = STATUS_STYLE[row.status];
              const isOffline = row.status === 'Offline';
              const liveAge = tick === null ? null : row.ageSec + tick;
              return (
                <tr
                  key={row.id}
                  className={cn(
                    'border-t border-border-subtle align-middle',
                    isOffline ? 'opacity-60' : '',
                  )}
                >
                  <td className="py-1.5 pr-3 font-mono text-text-primary whitespace-nowrap">
                    {row.tag}
                  </td>
                  <td className="py-1.5 pr-3 text-text-secondary whitespace-nowrap">{row.type}</td>
                  <td className="py-1.5 pr-3 text-text-muted whitespace-nowrap hidden md:table-cell">
                    {row.location}
                  </td>
                  <td
                    className={cn(
                      'py-1.5 pr-2 font-mono tabular-nums text-right whitespace-nowrap',
                      isOffline ? 'text-text-muted' : 'text-text-primary',
                    )}
                  >
                    {row.value}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-text-muted whitespace-nowrap">
                    {row.unit}
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-xs border bg-canvas text-micro uppercase tracking-micro font-bold',
                        s.border,
                        s.text,
                      )}
                    >
                      <span aria-hidden="true" className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />
                      {row.status}
                    </span>
                  </td>
                  <td
                    className={cn(
                      'py-1.5 pr-3 font-mono whitespace-nowrap hidden lg:table-cell',
                      QUALITY_STYLE[row.quality],
                    )}
                  >
                    {row.quality}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-text-muted whitespace-nowrap">
                    {liveAge === null ? '—' : formatAge(liveAge)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
};
