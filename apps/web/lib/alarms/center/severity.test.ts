import { describe, expect, it } from 'vitest';

import { severityFor, sourceFor, titleFor } from './severity';

describe('alarm center — severity classification', () => {
  it('maps process alarm bands to URGENT', () => {
    expect(severityFor('alarm_high')).toBe('URGENT');
    expect(severityFor('alarm_low')).toBe('URGENT');
  });

  it('maps process warning bands to HIGH', () => {
    expect(severityFor('warning_high')).toBe('HIGH');
    expect(severityFor('warning_low')).toBe('HIGH');
  });

  it('separates communication issues by duration: stale=MEDIUM, offline=HIGH', () => {
    expect(severityFor('stale')).toBe('MEDIUM');
    expect(severityFor('offline')).toBe('HIGH');
  });

  it('maps no_data (bad/null reading) to MEDIUM', () => {
    expect(severityFor('no_data')).toBe('MEDIUM');
  });

  it('classifies sources correctly — process vs data quality vs communication', () => {
    expect(sourceFor('alarm_high')).toBe('PROCESS');
    expect(sourceFor('warning_low')).toBe('PROCESS');
    expect(sourceFor('no_data')).toBe('DATA_QUALITY');
    expect(sourceFor('stale')).toBe('COMMUNICATION');
    expect(sourceFor('offline')).toBe('COMMUNICATION');
  });

  it('generates ISA-style row titles', () => {
    expect(titleFor('alarm_high', 'Inlet Pressure')).toBe('High Alarm — Inlet Pressure');
    expect(titleFor('offline', 'Gas Rate')).toBe('Offline Signal — Gas Rate');
    expect(titleFor('no_data', 'Water Cut')).toBe('Data Quality Bad — Water Cut');
  });
});
