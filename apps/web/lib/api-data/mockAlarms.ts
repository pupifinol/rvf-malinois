/**
 * Mock alarm configurations — F3 seed.
 *
 * Concrete demonstration of the F3 §10 domain principle: HP-001 and
 * LP-001 both have a "pressure high alarm" but their thresholds differ
 * by an order of magnitude:
 *
 *   HP-001  highThreshold = 4 500 psi   highHighThreshold = 5 000 psi
 *   LP-001  highThreshold =   600 psi   highHighThreshold =   750 psi
 *
 * No record here references a "default", "global", or "platform-wide"
 * threshold; every band lives on a specific (unitId, sensorId) pair.
 */
import type { AlarmConfiguration } from '@/types/api';

const ISO_2026_05_24 = '2026-05-24T00:00:00.000Z';

export const MOCK_ALARMS: readonly AlarmConfiguration[] = [
  // ---- HP-001 — high-pressure / high-flow envelope ----------------------
  {
    id: 'alarm-pressure-inlet-hp-001',
    unitId: 'unit-hp-001',
    sensorId: 'sensor-pressure-inlet-hp-001',
    alarmType: 'pressure',
    severity: 'critical',
    enabled: true,
    lowLowThreshold: 50,
    lowThreshold: 200,
    highThreshold: 4500,
    highHighThreshold: 5000,
    deadband: 25,
    delaySeconds: 5,
    message: 'HP-001 inlet pressure outside operating envelope',
    createdAt: ISO_2026_05_24,
    updatedAt: ISO_2026_05_24,
  },
  {
    id: 'alarm-temperature-inlet-hp-001',
    unitId: 'unit-hp-001',
    sensorId: 'sensor-temperature-inlet-hp-001',
    alarmType: 'temperature',
    severity: 'warning',
    enabled: true,
    lowLowThreshold: 0,
    lowThreshold: 5,
    highThreshold: 130,
    highHighThreshold: 145,
    deadband: 2,
    delaySeconds: 10,
    message: 'HP-001 inlet temperature outside operating envelope',
    createdAt: ISO_2026_05_24,
    updatedAt: ISO_2026_05_24,
  },
  {
    id: 'alarm-flow-main-hp-001',
    unitId: 'unit-hp-001',
    sensorId: 'sensor-flow-main-hp-001',
    alarmType: 'flow',
    severity: 'warning',
    enabled: true,
    lowLowThreshold: 100,
    lowThreshold: 250,
    highThreshold: 3500,
    highHighThreshold: 3900,
    deadband: 25,
    delaySeconds: 10,
    message: 'HP-001 main flow outside operating envelope',
    createdAt: ISO_2026_05_24,
    updatedAt: ISO_2026_05_24,
  },

  // ---- MP-001 — medium envelope ----------------------------------------
  {
    id: 'alarm-pressure-inlet-mp-001',
    unitId: 'unit-mp-001',
    sensorId: 'sensor-pressure-inlet-mp-001',
    alarmType: 'pressure',
    severity: 'critical',
    enabled: true,
    lowLowThreshold: 20,
    lowThreshold: 100,
    highThreshold: 2000,
    highHighThreshold: 2300,
    deadband: 10,
    delaySeconds: 5,
    message: 'MP-001 inlet pressure outside operating envelope',
    createdAt: ISO_2026_05_24,
    updatedAt: ISO_2026_05_24,
  },
  {
    id: 'alarm-flow-main-mp-001',
    unitId: 'unit-mp-001',
    sensorId: 'sensor-flow-main-mp-001',
    alarmType: 'flow',
    severity: 'warning',
    enabled: true,
    lowLowThreshold: 50,
    lowThreshold: 150,
    highThreshold: 1800,
    highHighThreshold: 1950,
    deadband: 15,
    delaySeconds: 10,
    message: 'MP-001 main flow outside operating envelope',
    createdAt: ISO_2026_05_24,
    updatedAt: ISO_2026_05_24,
  },

  // ---- LP-001 — low envelope (thresholds intentionally radically lower) -
  {
    id: 'alarm-pressure-inlet-lp-001',
    unitId: 'unit-lp-001',
    sensorId: 'sensor-pressure-inlet-lp-001',
    alarmType: 'pressure',
    severity: 'critical',
    enabled: true,
    lowLowThreshold: 5,
    lowThreshold: 40,
    highThreshold: 600,
    highHighThreshold: 750,
    deadband: 5,
    delaySeconds: 5,
    message: 'LP-001 inlet pressure outside operating envelope',
    createdAt: ISO_2026_05_24,
    updatedAt: ISO_2026_05_24,
  },
  {
    id: 'alarm-flow-main-lp-001',
    unitId: 'unit-lp-001',
    sensorId: 'sensor-flow-main-lp-001',
    alarmType: 'flow',
    severity: 'warning',
    enabled: true,
    lowLowThreshold: 10,
    lowThreshold: 30,
    highThreshold: 500,
    highHighThreshold: 580,
    deadband: 5,
    delaySeconds: 10,
    message: 'LP-001 main flow outside operating envelope',
    createdAt: ISO_2026_05_24,
    updatedAt: ISO_2026_05_24,
  },
];
