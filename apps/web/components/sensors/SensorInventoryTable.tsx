'use client';

import { cn } from '@rvf/ui';
import { useMemo, useState } from 'react';

import {
  categoryLabel,
  SENSOR_CATEGORIES,
  type SensorCategory,
  type SensorRecord,
  type SensorStatus,
} from './data/sensors.mock';

import { Panel } from '@/components/shell/Panel';

/**
 * SensorInventoryTable — middle-column hero of /sensors.
 *
 * One row per deployed sensor across the fleet. Filters:
 *   - tabs at top: filter by sensor kind (PRESSURE / TEMPERATURE / …)
 *   - dropdowns below the tabs: Unit, Status, Calibration state
 *
 * Row selection promotes the sensor into the bottom detail preview.
 * Visual language matches /units' tabular density: tabular-nums,
 * monospace tags, restrained status pills, thin row dividers.
 */
export interface SensorInventoryTableProps {
  sensors: readonly SensorRecord[];
  category: SensorCategory;
  onCategoryChange: (next: SensorCategory) => void;
  selectedSensorId: string;
  onSelect: (id: string) => void;
}

type UnitFilter = string;
type StatusFilter = 'ALL' | SensorStatus;
type CalFilter = 'ALL' | 'UP_TO_DATE' | 'DUE_SOON' | 'OVERDUE';

const statusStyles: Record<SensorStatus, { dot: string; text: string }> = {
  ONLINE: { dot: 'bg-status-normal', text: 'text-status-normal' },
  DEGRADED: { dot: 'bg-status-warn', text: 'text-status-warn' },
  OFFLINE: { dot: 'bg-status-alarm', text: 'text-status-alarm' },
  STALE: { dot: 'bg-status-stale', text: 'text-status-stale' },
};

/** First location segment is the unit name, e.g. "MU #1 · Inlet" → "MU #1". */
const unitOf = (s: SensorRecord): string => s.location.split('·')[0]?.trim() ?? s.location;

const calStateOf = (s: SensorRecord): CalFilter => {
  if (s.calDueDays < 0) return 'OVERDUE';
  if (s.calDueDays <= 14) return 'DUE_SOON';
  return 'UP_TO_DATE';
};

export const SensorInventoryTable = ({
  sensors,
  category,
  onCategoryChange,
  selectedSensorId,
  onSelect,
}: SensorInventoryTableProps) => {
  const [unit, setUnit] = useState<UnitFilter>('ALL');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [cal, setCal] = useState<CalFilter>('ALL');

  // Unique units, preserving insertion order.
  const units = useMemo(() => {
    const seen = new Set<string>();
    for (const s of sensors) seen.add(unitOf(s));
    return Array.from(seen);
  }, [sensors]);

  const filtered = useMemo(
    () =>
      sensors.filter(
        (s) =>
          (category === 'ALL' || s.kind === category) &&
          (unit === 'ALL' || unitOf(s) === unit) &&
          (status === 'ALL' || s.status === status) &&
          (cal === 'ALL' || calStateOf(s) === cal),
      ),
    [sensors, category, unit, status, cal],
  );

  const anyFilterActive = unit !== 'ALL' || status !== 'ALL' || cal !== 'ALL';

  return (
    <Panel
      title="Sensor Inventory"
      meta={
        <span className="font-mono">
          {filtered.length}/{sensors.length}
        </span>
      }
    >
      {/* Kind tabs */}
      <div
        role="tablist"
        aria-label="Sensor category"
        className="flex items-stretch border border-border-subtle rounded-xs overflow-hidden flex-wrap"
      >
        {SENSOR_CATEGORIES.map((c, i) => {
          const isActive = c === category;
          return (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onCategoryChange(c)}
              className={cn(
                'flex-1 min-w-0 px-3 py-1 text-micro uppercase tracking-micro font-semibold transition-colors duration-fast ease-industrial',
                'focus:outline-none focus-visible:bg-surface-raised',
                i > 0 ? 'border-l border-border-subtle' : '',
                isActive
                  ? 'bg-brand-primary text-text-on-accent'
                  : 'bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-raised',
              )}
            >
              {categoryLabel(c)}
            </button>
          );
        })}
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterSelect
          label="Unit"
          value={unit}
          onChange={(v) => setUnit(v)}
          options={[
            { value: 'ALL', label: 'All units' },
            ...units.map((u) => ({ value: u, label: u })),
          ]}
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
          options={[
            { value: 'ALL', label: 'Any status' },
            { value: 'ONLINE', label: 'Online' },
            { value: 'DEGRADED', label: 'Degraded' },
            { value: 'STALE', label: 'Stale' },
            { value: 'OFFLINE', label: 'Offline' },
          ]}
        />
        <FilterSelect
          label="Calibration"
          value={cal}
          onChange={(v) => setCal(v as CalFilter)}
          options={[
            { value: 'ALL', label: 'Any cal state' },
            { value: 'UP_TO_DATE', label: 'Up to date' },
            { value: 'DUE_SOON', label: 'Due soon' },
            { value: 'OVERDUE', label: 'Overdue' },
          ]}
        />
        {anyFilterActive && (
          <button
            type="button"
            className="text-micro uppercase tracking-micro text-text-muted hover:text-text-primary transition-colors duration-fast"
            onClick={() => {
              setUnit('ALL');
              setStatus('ALL');
              setCal('ALL');
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Scrollable table */}
      <div className="overflow-auto max-h-[340px] -mx-1 px-1">
        <table className="w-full text-xs tabular-nums">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="text-micro uppercase tracking-micro text-text-muted">
              <Th>Tag</Th>
              <Th>Kind</Th>
              <Th>Location</Th>
              <Th>Source</Th>
              <Th align="right">RF Quality</Th>
              <Th align="right">Battery</Th>
              <Th align="right">Status</Th>
              <Th align="right">Health</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-2 py-6 text-center text-text-muted">
                  No sensors match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <SensorRow
                  key={s.id}
                  sensor={s}
                  selected={s.id === selectedSensorId}
                  onSelect={onSelect}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
};

/* ----- Filter select ---------------------------------------------------- */

interface FilterOption {
  value: string;
  label: string;
}

const FilterSelect = ({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly FilterOption[];
}) => (
  <label className="inline-flex items-center gap-1.5 text-micro uppercase tracking-micro text-text-muted">
    <span>{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'bg-surface-raised border border-border-subtle rounded-xs px-2 py-1',
        'text-xs uppercase tracking-micro font-semibold text-text-primary font-mono',
        'focus:outline-none focus-visible:border-border-focus',
        'cursor-pointer hover:border-border-strong transition-colors duration-fast',
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </label>
);

/* ----- Table cells ------------------------------------------------------ */

const Th = ({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) => (
  <th
    className={cn(
      'px-2 py-2 font-semibold border-b border-border-subtle whitespace-nowrap',
      align === 'right' ? 'text-right' : 'text-left',
    )}
  >
    {children}
  </th>
);

const Td = ({
  children,
  align = 'left',
  className,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) => (
  <td
    className={cn(
      'px-2 py-1.5 border-b border-border-subtle last:border-b-0',
      align === 'right' ? 'text-right' : 'text-left',
      className,
    )}
  >
    {children}
  </td>
);

const batteryToneClass = (pct: number): string => {
  if (pct < 0) return 'text-text-muted';
  if (pct < 20) return 'text-status-alarm';
  if (pct < 40) return 'text-status-warn';
  return 'text-text-primary';
};

const rfToneClass = (pct: number | null): string => {
  if (pct === null) return 'text-text-muted';
  if (pct < 40) return 'text-status-alarm';
  if (pct < 65) return 'text-status-warn';
  return 'text-text-primary';
};

const healthBarTone = (pct: number): string => {
  if (pct < 30) return 'bg-status-alarm';
  if (pct < 70) return 'bg-status-warn';
  return 'bg-status-normal';
};

const SensorRow = ({
  sensor,
  selected,
  onSelect,
}: {
  sensor: SensorRecord;
  selected: boolean;
  onSelect: (id: string) => void;
}) => {
  const ss = statusStyles[sensor.status];
  const wired = sensor.batteryPct < 0;
  return (
    <tr
      className={cn(
        'cursor-pointer transition-colors duration-fast',
        selected ? 'bg-brand-primary/15 hover:bg-brand-primary/20' : 'hover:bg-surface-raised/60',
      )}
      onClick={() => onSelect(sensor.id)}
    >
      <Td className="font-mono text-text-primary">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              'inline-block w-1 h-3 rounded-xs',
              selected ? 'bg-brand-accent' : 'bg-transparent',
            )}
          />
          {sensor.tag}
        </span>
      </Td>
      <Td className="text-text-secondary uppercase tracking-micro">
        {sensor.kind === 'WATER_CUT' ? 'WATER CUT' : sensor.kind}
      </Td>
      <Td className="text-text-secondary">{sensor.location}</Td>
      <Td className="text-text-secondary">{sensor.source}</Td>
      <Td align="right" className={cn('font-mono', rfToneClass(sensor.rfQualityPct))}>
        {sensor.rfQualityPct === null ? '—' : `${sensor.rfQualityPct}%`}
      </Td>
      <Td align="right" className={cn('font-mono', batteryToneClass(sensor.batteryPct))}>
        {wired ? 'AC' : `${sensor.batteryPct}%`}
      </Td>
      <Td align="right">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 font-semibold uppercase tracking-micro',
            ss.text,
          )}
        >
          <span
            aria-hidden="true"
            className={cn('inline-block w-1.5 h-1.5 rounded-full', ss.dot)}
          />
          {sensor.status}
        </span>
      </Td>
      <Td align="right">
        <div className="flex items-center justify-end gap-2 min-w-0">
          <span className="font-mono text-text-primary shrink-0">{sensor.healthPct}%</span>
          <div
            aria-hidden="true"
            className="w-12 h-1 bg-surface-raised rounded-xs overflow-hidden border border-border-subtle shrink-0"
          >
            <div
              className={cn(
                'h-full transition-all duration-base ease-industrial',
                healthBarTone(sensor.healthPct),
              )}
              style={{ width: `${Math.max(0, Math.min(100, sensor.healthPct))}%` }}
            />
          </div>
        </div>
      </Td>
    </tr>
  );
};
