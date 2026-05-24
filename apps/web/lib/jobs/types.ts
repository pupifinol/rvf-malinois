/**
 * Active job + commissioning snapshot — F2A.
 *
 * Per ADR-005, regla 1: the EFFECTIVE thresholds used by alarm evaluation
 * live HERE — frozen at commissioning time as part of the snapshot, never
 * read live from the catalog. The catalog can suggest defaults; the snapshot
 * captures what the operator actually committed to for this job, at this
 * well, on this unit, on this date.
 *
 * The snapshot is intentionally a FROZEN copy: editing the catalog later
 * must not retroactively change how a past job was evaluated (ADR-004 "foto
 * por trabajo").
 */
import type {
  CanonicalTag,
  CommissioningId,
  EquipmentId,
  JobId,
  TenantId,
  WellId,
} from '@rvf/types';

/**
 * Per-variable threshold band as evaluated by the runtime. Any of the four
 * bounds may be `undefined` — meaning "this side of the band is unbounded
 * for this variable on this well". The evaluator treats undefined as
 * "no threshold to compare against".
 */
export interface VariableThresholds {
  warningLow?: number;
  warningHigh?: number;
  alarmLow?: number;
  alarmHigh?: number;
  /** Canonical unit string. Kept on the band so the UI never has to look it up. */
  unit: string;
  /** Display precision (decimals). */
  precision: number;
}

/** Keyed by canonical tag. Frozen at commissioning time. */
export type EffectiveThresholdSet = Partial<Record<CanonicalTag, VariableThresholds>>;

/**
 * Frozen copy of a single sensor mapping at the moment of commissioning.
 * Includes the canonical tag (what the system records) and the enabled flag
 * (disabled sensors are excluded from evaluation; their state is 'disabled').
 */
export interface FrozenSensorMapping {
  sensorId: string;
  canonicalTag: CanonicalTag;
  pidInstrumentTag?: string;
  modbusRegister?: string;
  enabled: boolean;
}

/**
 * Per-tag override for the stale/offline detector's default windows. If a tag
 * is omitted, the global defaults apply. If a field is omitted on a present
 * entry, that boundary falls back to its global default.
 */
export type StaleTimingsOverride = Record<
  string,
  {
    delayedAfterSec?: number;
    staleAfterSec?: number;
    offlineAfterSec?: number;
  }
>;

export interface CommissioningSnapshot {
  /** Stable id of this commissioning record. */
  snapshotId: CommissioningId;
  jobId: JobId;
  /** Catalog reference of the equipment that was deployed. */
  unitId: EquipmentId;
  wellId: WellId;
  tenantId: TenantId;
  /** ISO-8601 UTC — INMUTABLE from here on. */
  takenAt: string;
  /** Frozen mapping of physical sensors to canonical tags. */
  sensors: FrozenSensorMapping[];
  /** THE source of truth for alarm evaluation. */
  effectiveThresholds: EffectiveThresholdSet;
  /** Per-tag overrides for the stale/offline detector. */
  staleTimings?: StaleTimingsOverride;
}

export interface ActiveJobSnapshot {
  jobId: JobId;
  tenantId: TenantId;
  wellId: WellId;
  unitId: EquipmentId;
  startedAt: string;
  /** Present iff the job has been closed; from here it is fully immutable. */
  closedAt?: string;
  /** Foto congelada al comisionar. */
  snapshot: CommissioningSnapshot;
}
