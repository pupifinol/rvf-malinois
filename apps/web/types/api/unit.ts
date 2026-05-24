/**
 * MeasurementUnit — F3 canonical API type.
 *
 * Per the F3 Backend/API Foundation document §8 and ADR-006: the unit is
 * the *physical* measurement asset (well-testing skid, multiphase unit).
 * Each unit owns its operational envelope — `maxPressure`, `maxFlowRate`,
 * and the `operatingProfile` taxonomy that drives commissioning defaults.
 *
 * Alarm thresholds DO NOT live here. They live on `AlarmConfiguration`,
 * scoped to (unit, sensor). This is the F3 domain principle that prevents
 * a high-pressure unit's thresholds from being copied onto a low-pressure
 * unit "by mistake".
 */
export type MeasurementUnitStatus = 'active' | 'inactive' | 'offline' | 'maintenance';

export type MeasurementUnitOperatingProfile =
  | 'high_pressure_high_flow'
  | 'medium_pressure_medium_flow'
  | 'low_pressure_low_flow'
  | 'custom';

export interface MeasurementUnit {
  /** Stable id: `unit-hp-001`, `unit-lp-001`, … */
  id: string;
  name: string;
  /** Short asset code shown on labels and exports. */
  code: string;
  /** Equipment kind, e.g. `well_testing_skid`. */
  type: string;
  location: string;
  status: MeasurementUnitStatus;
  operatingProfile: MeasurementUnitOperatingProfile;
  /** Numeric ceiling in `pressureUnit`. NOT an alarm threshold. */
  maxPressure: number;
  /** Numeric ceiling in `flowUnit`. NOT an alarm threshold. */
  maxFlowRate: number;
  pressureUnit: string;
  flowUnit: string;
  /** Denormalized for list rendering. Kept in sync by the adapter. */
  sensorsCount: number;
  /** Denormalized for list rendering. Kept in sync by the adapter. */
  alarmsCount: number;
  createdAt: string;
  updatedAt: string;
}
