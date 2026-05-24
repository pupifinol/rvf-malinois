/**
 * Mock measurement units — F3 seed.
 *
 * Two units intentionally drawn from opposite ends of the operational
 * envelope so per-unit alarm thresholds become obvious in fixtures and
 * tests:
 *
 *   unit-hp-001  high_pressure_high_flow   (pressure ceiling 6 000 psi)
 *   unit-mp-001  medium_pressure_medium_flow
 *   unit-lp-001  low_pressure_low_flow     (pressure ceiling 1 000 psi)
 *
 * `sensorsCount` / `alarmsCount` are denormalized for list views; the
 * adapter keeps them in sync with the seed.
 */
import type { MeasurementUnit } from '@/types/api';

const ISO_2026_05_24 = '2026-05-24T00:00:00.000Z';

export const MOCK_UNITS: readonly MeasurementUnit[] = [
  {
    id: 'unit-hp-001',
    name: 'High-Pressure Well Testing Skid 01',
    code: 'HP-001',
    type: 'well_testing_skid',
    location: 'Field Alpha · Pad 12',
    status: 'active',
    operatingProfile: 'high_pressure_high_flow',
    maxPressure: 6000,
    maxFlowRate: 4000,
    pressureUnit: 'psi',
    flowUnit: 'bpd',
    sensorsCount: 4,
    alarmsCount: 3,
    createdAt: ISO_2026_05_24,
    updatedAt: ISO_2026_05_24,
  },
  {
    id: 'unit-mp-001',
    name: 'Medium-Pressure Well Testing Skid 01',
    code: 'MP-001',
    type: 'well_testing_skid',
    location: 'Field Bravo · Pad 04',
    status: 'active',
    operatingProfile: 'medium_pressure_medium_flow',
    maxPressure: 2500,
    maxFlowRate: 2000,
    pressureUnit: 'psi',
    flowUnit: 'bpd',
    sensorsCount: 3,
    alarmsCount: 2,
    createdAt: ISO_2026_05_24,
    updatedAt: ISO_2026_05_24,
  },
  {
    id: 'unit-lp-001',
    name: 'Low-Pressure Well Testing Skid 01',
    code: 'LP-001',
    type: 'well_testing_skid',
    location: 'Field Charlie · Pad 02',
    status: 'maintenance',
    operatingProfile: 'low_pressure_low_flow',
    maxPressure: 1000,
    maxFlowRate: 600,
    pressureUnit: 'psi',
    flowUnit: 'bpd',
    sensorsCount: 3,
    alarmsCount: 2,
    createdAt: ISO_2026_05_24,
    updatedAt: ISO_2026_05_24,
  },
];
