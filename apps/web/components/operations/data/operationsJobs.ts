/**
 * Operations demo job set — F2B.
 *
 * The Operations screen shows live data for a curated set of mock active
 * jobs from F2A. Picking the trio here keeps the page, the simulator, and
 * the alarm summary aligned without prop-drilling.
 *
 *   - HP/HF runs the "alarm" simulation profile so a real alarm trips.
 *   - MP    runs a normal profile so a healthy unit is on screen too.
 *   - STALE runs the stale-drill profile so the stale UI is exercised.
 */
import type { ActiveJobSnapshot } from '@/lib/jobs/types';
import type { SimulationProfile } from '@/lib/telemetry/simulator/profiles';

import { JOB_HP_HF, JOB_MP, JOB_STALE } from '@/lib/jobs/snapshots.mock';
import {
  PROFILE_HP_HF_ALARM,
  PROFILE_MP_NORMAL,
  PROFILE_STALE_DRILL,
} from '@/lib/telemetry/simulator/profiles';

export interface OperationsJobBinding {
  /** Stable display index (1, 2, 3...) used in the card header. */
  displayNumber: number;
  /** Free-form display name override; falls back to "Multiphase Unit #N". */
  displayName?: string;
  /** Active job snapshot from the F2A mock layer. */
  job: ActiveJobSnapshot;
  /** Simulation profile to drive this job. */
  profile: SimulationProfile;
  /**
   * F4.5G.2.2.1 — explicit declaration of which backend `MeasurementUnit.code`
   * this simulator job stands in for. Consumed by `useResolveBackendUnitId` to
   * look up the matching `MeasurementUnit.id` (UUID) from the F4.4D units list
   * in api mode.
   *
   * **Hard rule (per F4.5G.2.2-0 §9.3):** this field is a per-binding *explicit
   * declaration*, not a mapping table. The simulator side says, on the line
   * for each job, which backend asset it represents. Do not introduce a
   * shared `Record<string, string>` of catalog codes to UUIDs anywhere; do
   * not coerce / pattern-match simulator catalog ids like `EMMAD-01` to
   * backend asset codes.
   *
   * Omitted when no corresponding backend asset exists (the F4.3 seed mints
   * HP-001 + LP-001 only — the STALE drill job has no third asset). Bindings
   * without this annotation render the simulator path with a
   * `No backend unit match` chip in api mode (per the plan's labeling §12).
   */
  backendUnitCode?: string;
}

/**
 * Typed as a non-empty tuple so destructuring `[b0, b1, b2]` is statically
 * known to yield defined values under `noUncheckedIndexedAccess` — important
 * for components that bind a fixed number of hook positions to this list.
 */
export const OPERATIONS_JOBS: readonly [
  OperationsJobBinding,
  OperationsJobBinding,
  OperationsJobBinding,
] = [
  // HP/HF run impersonates the F4.3 seed's High-Pressure / High-Flow asset.
  {
    displayNumber: 1,
    job: JOB_HP_HF,
    profile: PROFILE_HP_HF_ALARM,
    backendUnitCode: 'HP-001',
  },
  // MP run impersonates the F4.3 seed's Low-Pressure asset (the only other
  // backend asset in the seed). The medium-pressure profile is the closest
  // realistic stand-in for LP-001's range.
  {
    displayNumber: 2,
    job: JOB_MP,
    profile: PROFILE_MP_NORMAL,
    backendUnitCode: 'LP-001',
  },
  // STALE drill is intentionally unbound — the F4.3 seed mints no third
  // asset, so this card honestly shows `No backend unit match` in api mode.
  // Reviewer: do not invent a third `backendUnitCode` until a third asset
  // is seeded.
  { displayNumber: 3, job: JOB_STALE, profile: PROFILE_STALE_DRILL },
];
