import { describe, expect, it } from 'vitest';

import { UnitConverter } from './unit-converter';

const c = new UnitConverter();

describe('UnitConverter (F1.5.2)', () => {
  describe('identity', () => {
    it('returns the value unchanged for matching units', () => {
      expect(c.convert(1245.7, 'psi', 'psi')).toBe(1245.7);
      expect(c.convert(78.4, 'degC', 'degC')).toBe(78.4);
      expect(c.convert(0, 'bbl/d', 'bbl/d')).toBe(0);
    });

    it('normalises aliases to a canonical form', () => {
      expect(c.isIdentity('psig', 'psi')).toBe(true); // calibration aside
      expect(c.isIdentity('PSI', 'psi')).toBe(true);
      expect(c.isIdentity('°C', 'degC')).toBe(true);
      expect(c.isIdentity('%', 'pct')).toBe(true);
    });
  });

  describe('pressure', () => {
    it('converts kPa → psi (NIST conversion factor)', () => {
      expect(c.convert(1000, 'kPa', 'psi')).toBeCloseTo(145.0377, 4);
    });
    it('converts psi → kPa', () => {
      expect(c.convert(100, 'psi', 'kPa')).toBeCloseTo(689.4757, 4);
    });
    it('round-trips psi → kPa → psi within float precision', () => {
      const out = c.convert(c.convert(150, 'psi', 'kPa'), 'kPa', 'psi');
      expect(out).toBeCloseTo(150, 4);
    });
  });

  describe('temperature (linear with offset)', () => {
    it('converts 32 degF to 0 degC', () => {
      expect(c.convert(32, 'degF', 'degC')).toBeCloseTo(0, 6);
    });
    it('converts 212 degF to 100 degC', () => {
      expect(c.convert(212, 'degF', 'degC')).toBeCloseTo(100, 6);
    });
    it('converts 100 degC to 212 degF', () => {
      expect(c.convert(100, 'degC', 'degF')).toBeCloseTo(212, 6);
    });
    it('converts 0 degC to 273.15 K', () => {
      expect(c.convert(0, 'degC', 'K')).toBeCloseTo(273.15, 6);
    });
  });

  describe('flow', () => {
    it('converts m3/d → bbl/d (SPE convention)', () => {
      expect(c.convert(100, 'm3/d', 'bbl/d')).toBeCloseTo(628.9811, 3);
    });
    it('converts bbl/d → m3/d', () => {
      expect(c.convert(1000, 'bbl/d', 'm3/d')).toBeCloseTo(158.987, 3);
    });
  });

  describe('composition', () => {
    it('converts ratio → pct', () => {
      expect(c.convert(0.124, 'ratio', 'pct')).toBeCloseTo(12.4, 6);
    });
    it('converts pct → ratio', () => {
      expect(c.convert(75, 'pct', 'ratio')).toBeCloseTo(0.75, 6);
    });
  });

  describe('failure modes', () => {
    it('throws on unsupported pair', () => {
      expect(() => c.convert(1, 'psi', 'm3/d')).toThrowError(/No conversion known/);
    });
    it('throws on unknown unit names', () => {
      expect(() => c.convert(1, 'frob', 'psi')).toThrowError(/No conversion known/);
    });
    it('throws on non-finite input — never silently propagates NaN', () => {
      expect(() => c.convert(Number.NaN, 'psi', 'kPa')).toThrowError(/non-finite/);
      expect(() => c.convert(Infinity, 'psi', 'kPa')).toThrowError(/non-finite/);
    });
  });
});
