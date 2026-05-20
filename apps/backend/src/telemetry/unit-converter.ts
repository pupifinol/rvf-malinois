import { Injectable } from '@nestjs/common';

/**
 * UnitConverter — engineering-unit normalisation at the QUERY layer.
 *
 * Per F1.5 guidance #6, telemetry rows are stored exactly as received with
 * their original `value_unit`. The conversion to the canonical tag's unit
 * happens here, only when a consumer reads. Storage is never modified.
 *
 * Scope is deliberately small: the units that the canonical-tag dictionary
 * (telemetry-foundation §9) actually uses + the alternates the edge most
 * commonly emits. Adding a conversion is a 1-line entry in CONVERSIONS plus
 * a unit test. Unknown unit pairs throw — silently passing through an
 * unrecognised unit is exactly the kind of "lies about the data" §14
 * forbids.
 *
 * Pure function, no Prisma, no I/O. Safe to use inside loops and aggregate
 * reducers.
 */

// ─── Canonical alias normalisation ──────────────────────────────────────────
// Different sources spell the same unit differently. Lower-case + alias map.

const ALIASES: Record<string, string> = {
  // Pressure
  psi: 'psi',
  psig: 'psi', // gauge-vs-abs distinction not tracked here; calibration concern
  psia: 'psi',
  kpa: 'kPa',
  bar: 'bar',
  // Temperature
  degc: 'degC',
  '°c': 'degC',
  c: 'degC',
  degf: 'degF',
  '°f': 'degF',
  f: 'degF',
  k: 'K',
  // Flow
  'bbl/d': 'bbl/d',
  bpd: 'bbl/d',
  'm3/d': 'm3/d',
  'mmscf/d': 'MMscf/d',
  'nm3/h': 'Nm3/h',
  // Composition
  pct: 'pct',
  '%': 'pct',
  ratio: 'ratio',
};

const normalise = (u: string): string => ALIASES[u.trim().toLowerCase()] ?? u;

// ─── Conversion table ───────────────────────────────────────────────────────
// Each entry is a *linear* conversion `to = a * from + b`. Temperature is the
// only one that needs the offset (b ≠ 0).

interface LinearConversion {
  /** Multiplicative factor: `canonical = a * received + b`. */
  a: number;
  b: number;
}

type ConversionKey = `${string}->${string}`;
const key = (from: string, to: string): ConversionKey => `${from}->${to}`;

const CONVERSIONS: Record<ConversionKey, LinearConversion> = {
  // Identity
  [key('psi', 'psi')]: { a: 1, b: 0 },
  [key('kPa', 'kPa')]: { a: 1, b: 0 },
  [key('bar', 'bar')]: { a: 1, b: 0 },
  [key('degC', 'degC')]: { a: 1, b: 0 },
  [key('degF', 'degF')]: { a: 1, b: 0 },
  [key('K', 'K')]: { a: 1, b: 0 },
  [key('bbl/d', 'bbl/d')]: { a: 1, b: 0 },
  [key('m3/d', 'm3/d')]: { a: 1, b: 0 },
  [key('MMscf/d', 'MMscf/d')]: { a: 1, b: 0 },
  [key('Nm3/h', 'Nm3/h')]: { a: 1, b: 0 },
  [key('pct', 'pct')]: { a: 1, b: 0 },
  [key('ratio', 'ratio')]: { a: 1, b: 0 },

  // Pressure
  [key('kPa', 'psi')]: { a: 0.1450377, b: 0 },
  [key('psi', 'kPa')]: { a: 6.894757, b: 0 },
  [key('bar', 'psi')]: { a: 14.50377, b: 0 },
  [key('psi', 'bar')]: { a: 0.06894757, b: 0 },

  // Temperature — linear with offset.
  [key('degF', 'degC')]: { a: 5 / 9, b: -(32 * 5) / 9 },
  [key('degC', 'degF')]: { a: 9 / 5, b: 32 },
  [key('K', 'degC')]: { a: 1, b: -273.15 },
  [key('degC', 'K')]: { a: 1, b: 273.15 },

  // Liquid volumetric flow
  [key('m3/d', 'bbl/d')]: { a: 6.289811, b: 0 },
  [key('bbl/d', 'm3/d')]: { a: 0.158987, b: 0 },

  // Gas flow — Nm3/h ↔ MMscf/d is approximate (depends on reference
  // conditions). Use the SPE convention (Nm3 at 0°C/101.325 kPa, scf at
  // 60°F/14.696 psia) → 1 Nm3/h ≈ 0.000847 MMscf/d.
  [key('Nm3/h', 'MMscf/d')]: { a: 0.000847, b: 0 },
  [key('MMscf/d', 'Nm3/h')]: { a: 1180.5, b: 0 },

  // Composition / dimensionless
  [key('ratio', 'pct')]: { a: 100, b: 0 },
  [key('pct', 'ratio')]: { a: 0.01, b: 0 },
};

@Injectable()
export class UnitConverter {
  /**
   * Convert `value` from `fromUnit` to `toUnit`. Both units are normalised
   * via the alias map first (e.g. 'PSIG', 'psig', 'PSIA' all → 'psi').
   *
   * Throws if the conversion is not in the supported table. Better to fail
   * loud than to silently report a corrupt value (§14 — never treat bad data
   * as good).
   */
  convert(value: number, fromUnit: string, toUnit: string): number {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot convert non-finite value (${String(value)})`);
    }
    const from = normalise(fromUnit);
    const to = normalise(toUnit);
    const conv = CONVERSIONS[key(from, to)];
    if (!conv) {
      throw new Error(
        `No conversion known from '${fromUnit}' (→ ${from}) to '${toUnit}' (→ ${to}). ` +
          `Add the conversion to CONVERSIONS in unit-converter.ts if it's legitimate.`,
      );
    }
    return conv.a * value + conv.b;
  }

  /** Lower-cost check used by callers that want to no-op on identity. */
  isIdentity(fromUnit: string, toUnit: string): boolean {
    return normalise(fromUnit) === normalise(toUnit);
  }

  /** Diagnostic — list every supported `(from, to)` pair. */
  supportedConversions(): { from: string; to: string }[] {
    return Object.keys(CONVERSIONS).map((k) => {
      const [from, to] = k.split('->') as [string, string];
      return { from, to };
    });
  }
}
