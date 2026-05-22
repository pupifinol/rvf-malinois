/**
 * Unit Fleet Registry — mock data.
 *
 * The roster of every multiphase well-testing unit on the contract,
 * regardless of whether it's currently active. /operations only renders
 * units in `DEPLOYED` state; this surface shows the full fleet.
 */
export type UnitFleetStatus = 'DEPLOYED' | 'IDLE' | 'MAINTENANCE' | 'DECOMMISSIONED';

export interface UnitFleetEntry {
  id: string;
  unitNumber: number;
  status: UnitFleetStatus;
  /** Asset tag — the durable identifier stamped on the skid. */
  assetTag: string;
  /** Current well (if deployed) or last well tested (otherwise). */
  lastWell: string;
  /** ISO date of last calibration. */
  lastCalibrationDate: string;
  /** Days until next calibration is due. Negative = overdue. */
  calibrationDueDays: number;
  /** Cumulative operating hours since commissioning. */
  operatingHours: number;
  /** Free-text location tag. */
  location: string;
}

export const fleet: UnitFleetEntry[] = [
  {
    id: 'mu-01',
    unitNumber: 1,
    status: 'DEPLOYED',
    assetTag: 'RVF-MU-1042',
    lastWell: 'PZ-1023',
    lastCalibrationDate: '2026-04-22',
    calibrationDueDays: 41,
    operatingHours: 8412,
    location: 'Block 47 · Pad B',
  },
  {
    id: 'mu-02',
    unitNumber: 2,
    status: 'DEPLOYED',
    assetTag: 'RVF-MU-1047',
    lastWell: 'PZ-1045',
    lastCalibrationDate: '2026-03-30',
    calibrationDueDays: 18,
    operatingHours: 6210,
    location: 'Block 47 · Pad B',
  },
  {
    id: 'mu-03',
    unitNumber: 3,
    status: 'IDLE',
    assetTag: 'RVF-MU-1055',
    lastWell: 'PZ-0998',
    lastCalibrationDate: '2026-02-12',
    calibrationDueDays: 5,
    operatingHours: 4988,
    location: 'Shop · Rack 2',
  },
  {
    id: 'mu-04',
    unitNumber: 4,
    status: 'MAINTENANCE',
    assetTag: 'RVF-MU-1061',
    lastWell: 'PZ-1011',
    lastCalibrationDate: '2026-01-08',
    calibrationDueDays: -3,
    operatingHours: 11240,
    location: 'Shop · Bay 1',
  },
  {
    id: 'mu-05',
    unitNumber: 5,
    status: 'DECOMMISSIONED',
    assetTag: 'RVF-MU-0997',
    lastWell: '—',
    lastCalibrationDate: '2025-08-14',
    calibrationDueDays: -281,
    operatingHours: 22107,
    location: 'Yard · Pending audit',
  },
];

export const formatHours = (h: number): string => h.toLocaleString('en-US');
