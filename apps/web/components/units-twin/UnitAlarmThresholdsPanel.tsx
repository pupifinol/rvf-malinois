import type { ThresholdBand, UnitTwin } from './data/twin.mock';

import { Panel } from '@/components/shell/Panel';

/**
 * UnitAlarmThresholdsPanel — per-unit alarm + warning setpoints.
 *
 * Renders a 4-row × 4-threshold band table (one row per process
 * variable: pressure, flow, temperature, vibration). The four columns
 * map to the platform-wide four-tier alarm model:
 *
 *   alarmLow  ·  warningLow  ·  warningHigh  ·  alarmHigh
 *
 * Each value is monospace, with the alarm bounds tinted to make them
 * read as the harder limit. Unbounded sides render as an em-dash so
 * the table stays rectangular.
 *
 * This panel is the load-bearing UI artifact for the "alarm thresholds
 * are unit-specific" architectural decision. The mirror panel does not
 * exist on /settings — global defaults are behavioral, not numeric.
 */
const VARIABLES = [
  { key: 'pressure', label: 'Pressure' },
  { key: 'flow', label: 'Flow' },
  { key: 'temperature', label: 'Temperature' },
  { key: 'vibration', label: 'Vibration' },
] as const;

export interface UnitAlarmThresholdsPanelProps {
  twin: UnitTwin;
}

export const UnitAlarmThresholdsPanel = ({ twin }: UnitAlarmThresholdsPanelProps) => (
  <Panel
    title="Unit Alarm Thresholds"
    density="compact"
    meta={<span className="font-mono uppercase tracking-micro">4-tier · per unit</span>}
  >
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border-subtle">
            <Th align="left">Variable</Th>
            <Th tone="text-status-alarm">Alarm Low</Th>
            <Th tone="text-status-warn">Warn Low</Th>
            <Th tone="text-status-warn">Warn High</Th>
            <Th tone="text-status-alarm">Alarm High</Th>
            <Th align="right">Unit</Th>
          </tr>
        </thead>
        <tbody>
          {VARIABLES.map((v) => {
            const band = twin.config.thresholds[v.key];
            return (
              <tr
                key={v.key}
                className="border-b border-border-subtle last:border-b-0 hover:bg-surface-raised/40 transition-colors duration-fast"
              >
                <td className="py-1.5 pr-3 text-micro uppercase tracking-micro font-bold text-text-primary">
                  {v.label}
                </td>
                <Td value={band.alarmLow} tone="text-status-alarm" />
                <Td value={band.warningLow} tone="text-status-warn" />
                <Td value={band.warningHigh} tone="text-status-warn" />
                <Td value={band.alarmHigh} tone="text-status-alarm" />
                <td className="py-1.5 pl-3 text-right font-mono text-micro uppercase tracking-micro text-text-muted">
                  {band.unit}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    <p
      className="px-1 pt-2 mt-1 border-t border-border-subtle text-micro uppercase tracking-micro text-text-muted"
      aria-label="Threshold scope"
    >
      Note · Each unit carries its own thresholds. Global settings only define console-wide alarm
      behavior (ISA-18.2 standard, annunciation, auto-ACK).
    </p>
  </Panel>
);

const Th = ({
  children,
  tone,
  align = 'right',
}: {
  children: React.ReactNode;
  tone?: string;
  align?: 'left' | 'right';
}) => (
  <th
    scope="col"
    className={`py-1.5 ${align === 'right' ? 'pl-3 text-right' : 'pr-3 text-left'} text-micro uppercase tracking-micro font-bold ${tone ?? 'text-text-muted'}`}
  >
    {children}
  </th>
);

const Td = ({ value, tone }: { value: ThresholdBand['alarmLow']; tone: string }) => (
  <td
    className={`py-1.5 pl-3 text-right font-mono tabular-nums font-semibold ${value === null ? 'text-text-muted' : tone}`}
  >
    {value === null ? '—' : value.toLocaleString('en-US')}
  </td>
);
