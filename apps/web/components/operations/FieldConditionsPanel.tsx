import { Droplets, Thermometer, Wind, type LucideIcon } from 'lucide-react';

import { Panel } from '@/components/shell/Panel';

/**
 * FieldConditionsPanel — ambient field conditions at the well pad.
 *
 * Operator context, not control. Drives interpretation of sensor values
 * (e.g. temperature drift on a cold morning) without owning any
 * automation logic.
 */
export interface FieldReading {
  id: string;
  label: string;
  value: string;
  icon: LucideIcon;
}

const defaults: FieldReading[] = [
  { id: 't', label: 'Temperature', value: '28 °C', icon: Thermometer },
  { id: 'w', label: 'Wind', value: '12 km/h', icon: Wind },
  { id: 'h', label: 'Humidity', value: '46 %', icon: Droplets },
];

export interface FieldConditionsPanelProps {
  readings?: readonly FieldReading[];
}

export const FieldConditionsPanel = ({ readings = defaults }: FieldConditionsPanelProps) => (
  <Panel title="Field Conditions">
    <ul className="grid grid-cols-3 gap-2">
      {readings.map((r) => {
        const Icon = r.icon;
        return (
          <li
            key={r.id}
            className="flex flex-col items-center gap-1 bg-surface-raised border border-border-subtle rounded-sm py-2.5 px-2"
          >
            <Icon className="w-4 h-4 text-text-secondary" aria-hidden="true" />
            <span className="text-base font-semibold tabular-nums text-text-primary leading-none">
              {r.value}
            </span>
            <span className="text-micro uppercase tracking-micro text-text-muted">{r.label}</span>
          </li>
        );
      })}
    </ul>
  </Panel>
);
