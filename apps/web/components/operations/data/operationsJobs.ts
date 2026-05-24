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
  { displayNumber: 1, job: JOB_HP_HF, profile: PROFILE_HP_HF_ALARM },
  { displayNumber: 2, job: JOB_MP, profile: PROFILE_MP_NORMAL },
  { displayNumber: 3, job: JOB_STALE, profile: PROFILE_STALE_DRILL },
];
