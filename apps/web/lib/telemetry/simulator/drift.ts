/**
 * Drift / noise utilities — F2A.
 *
 * Deterministic when given a seeded PRNG. The simulator combines:
 *
 *   - A slow line baseline (sin component with long period) — represents
 *     real operational drift on a stable well.
 *   - A small gaussian-ish noise component — represents instrument noise.
 *   - Occasional step events — represents operational changes (choke change,
 *     start/stop). Kept separate so consumers can plug them in selectively.
 *
 * All functions are pure: same inputs → same outputs. No global state.
 */

/** Seedable PRNG (Mulberry32). Cheap, good enough for telemetry simulation. */
export const makeRng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Box-Muller-ish gaussian noise from a uniform PRNG. */
export const gaussian = (rng: () => number, mean = 0, stddev = 1): number => {
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
};

export interface DriftSpec {
  /** Baseline value the line drifts around. */
  base: number;
  /** Peak-to-peak amplitude of the long-period drift. */
  amplitude: number;
  /** Standard deviation of the per-sample noise. */
  noise: number;
  /** Period of the slow drift, in samples. Higher = slower. */
  period: number;
}

/**
 * Compute one sample at step `i`, given a drift spec and a PRNG. The PRNG is
 * advanced by exactly two calls per invocation (via `gaussian`), making the
 * sequence deterministic for any (seed, i).
 */
export const driftedSample = (i: number, spec: DriftSpec, rng: () => number): number => {
  const phase = (2 * Math.PI * i) / Math.max(1, spec.period);
  const trend = (Math.sin(phase) * spec.amplitude) / 2;
  const noise = gaussian(rng, 0, spec.noise);
  return spec.base + trend + noise;
};
