/**
 * Unit catalog domain — F2A.
 *
 * Per ADR-004 + ADR-005:
 *   - The catalog is the reusable EQUIPMENT layer: identity, ratings, sensors
 *     available, design ranges, *suggested* defaults, and telemetry source
 *     metadata that the backend may need to know about.
 *   - It is NOT the operational source of truth for thresholds. The effective
 *     thresholds an alarm evaluator uses live in CommissioningSnapshot
 *     (`lib/jobs/types.ts`). The catalog only carries `suggestedDefaults`
 *     that commissioning may copy as a starting point.
 *
 * If a future contributor is tempted to add `effectiveThresholds` here,
 * STOP — that reopens ADR-005 and destroys historical traceability.
 */
import type { EffectiveThresholdSet } from '../jobs/types';
import type { CanonicalTag, EquipmentId } from '@rvf/types';

export type UnitType = 'EMMAD' | 'EMGAD' | 'PORTABLE_SKID';

export interface NominalRatings {
  /** Maximum allowable working pressure, psi. */
  maxPressurePsi: number;
  /** Maximum sustained liquid throughput, bbl/d. */
  maxLiquidFlowBpd: number;
  /** Maximum sustained gas throughput, MMSCFD. */
  maxGasFlowMmscfd: number;
  /** Maximum process temperature rating, °F. */
  maxTemperatureF: number;
  /** Maximum allowable vibration on rotating equipment, mm/s. */
  maxVibrationMmS: number;
  /** Separator vessel design pressure, psi. */
  separatorDesignPsi: number;
}

export interface DesignRange {
  min: number;
  max: number;
  unit: string;
}

export interface UnitSensorDefinition {
  /** Stable id of the sensor within the catalog (not branded — catalog-local). */
  sensorId: string;
  /**
   * Physical kind for inventory / traceability. Known SignalFire device
   * families up front; free-form so a future device kind doesn't require a
   * frontend release. Tooling can suggest the known values via autocomplete.
   */
  sensorType: string;
  /** Canonical tag this sensor produces. ADR-003 — the canonical dictionary is fixed. */
  canonicalTag: CanonicalTag;
  /** Instrument tag from the P&ID (e.g. 'PIT-003'), for traceability. */
  pidInstrumentTag?: string;
  /** Register on the Gateway Stick. NOT used by the frontend, kept for backend prep. */
  modbusRegister?: string;
  /** Engineering design range — useful for axis defaults and sanity checks. */
  designRange?: DesignRange;
}

/**
 * Hints the backend (and a future commissioning UI) may use to set up the
 * normalized telemetry stream for this unit. Carries NO protocol details
 * the frontend would consume directly — that would violate ADR-005. The
 * frontend only knows the normalized stream's shape.
 */
export interface TelemetrySourceMetadata {
  /** Free-form descriptor of where the unit normally streams from. */
  description: string;
  /** Expected sample rate at the edge, Hz. */
  expectedSampleRateHz: number;
  /** Lifecycle hint surfaced in catalog UIs. F2A is always 'planned'. */
  lifecycle: 'planned' | 'provisioned' | 'streaming';
}

export interface UnitCatalogItem {
  /** Stable identity of the equipment (catalog entry). */
  unitId: EquipmentId;
  unitType: UnitType;
  /** Short profile tag for display layers, e.g. 'HP/HF', 'MP', 'LP/LF'. */
  profileTag: 'HP/HF' | 'MP' | 'LP/LF' | 'CUSTOM';
  serial?: string;
  /** Reference to the engineering drawing (ADR-004). */
  pidRef?: string;
  /** Available sensors on this equipment. */
  sensors: UnitSensorDefinition[];
  /** Equipment-level capabilities. */
  nominalRatings: NominalRatings;
  /**
   * SUGGESTED defaults only. Commissioning may copy these into the snapshot
   * and then ADJUST them per well. The evaluator NEVER reads from here.
   */
  suggestedDefaults?: EffectiveThresholdSet;
  /** Source preparation hints. Not consumed by the frontend. */
  telemetrySource?: TelemetrySourceMetadata;
}
