/**
 * Mock active job snapshots — F2A development data.
 *
 * Four scenarios:
 *
 *   1. JOB_HP_HF  — EMMAD-01 on PZ-1023, running normally.
 *   2. JOB_MP     — EMMAD-02 on PZ-2041, mid envelope.
 *   3. JOB_LP     — PSK-03  on PZ-3015, low pressure / low flow.
 *   4. JOB_STALE  — EMMAD-02 on PZ-2099, a stale/offline drill.
 *
 * Important demonstration (ADR-005, regla 1): the EFFECTIVE thresholds below
 * are deliberately DIFFERENT from each catalog item's `suggestedDefaults`.
 * That proves to any reader that commissioning owns the threshold value;
 * the catalog only suggests. Editing the catalog must not change these.
 */
import { brand } from '@rvf/types';

import { EMMAD_01, EMMAD_02, PSK_03 } from '../catalog/units.mock';
import { CANONICAL_TAGS } from '../telemetry/tags';

import type { ActiveJobSnapshot, CommissioningSnapshot } from './types';
import type { CommissioningId, JobId, TenantId, WellId } from '@rvf/types';

const jobId = (s: string): JobId => brand<string, 'JobId'>(s);
const wellId = (s: string): WellId => brand<string, 'WellId'>(s);
const tenantId = (s: string): TenantId => brand<string, 'TenantId'>(s);
const commissioningId = (s: string): CommissioningId => brand<string, 'CommissioningId'>(s);

const TENANT_RVF = tenantId('TN-RVF');

// ---------------------------------------------------------------------------
// JOB 1 — High-Pressure / High-Flow, all sensors enabled
// ---------------------------------------------------------------------------

const SNAPSHOT_HP_HF: CommissioningSnapshot = {
  snapshotId: commissioningId('CS-HPHF-001'),
  jobId: jobId('JOB-HPHF-001'),
  unitId: EMMAD_01.unitId,
  wellId: wellId('PZ-1023'),
  tenantId: TENANT_RVF,
  takenAt: '2026-05-23T08:00:00Z',
  sensors: EMMAD_01.sensors.map((s) => ({
    sensorId: s.sensorId,
    canonicalTag: s.canonicalTag,
    pidInstrumentTag: s.pidInstrumentTag,
    modbusRegister: s.modbusRegister,
    enabled: true,
  })),
  // Thresholds set during commissioning for *this well*. The numbers below
  // are intentionally tighter than EMMAD-01.suggestedDefaults to prove that
  // the snapshot, not the catalog, is the source of truth.
  effectiveThresholds: {
    [CANONICAL_TAGS.PInlet]: {
      warningLow: 700,
      warningHigh: 1900,
      alarmLow: 500,
      alarmHigh: 2100,
      unit: 'psi',
      precision: 0,
    },
    [CANONICAL_TAGS.TInlet]: {
      warningLow: 80,
      warningHigh: 185,
      alarmLow: 50,
      alarmHigh: 210,
      unit: '°F',
      precision: 0,
    },
    [CANONICAL_TAGS.QTotalIn]: {
      warningLow: 1500,
      warningHigh: 4400,
      alarmLow: 1000,
      alarmHigh: 4800,
      unit: 'bbl/d',
      precision: 0,
    },
    [CANONICAL_TAGS.PSep]: {
      warningHigh: 1800,
      alarmHigh: 2200,
      unit: 'psi',
      precision: 0,
    },
    [CANONICAL_TAGS.TSep]: {
      warningHigh: 180,
      alarmHigh: 210,
      unit: '°F',
      precision: 0,
    },
    [CANONICAL_TAGS.DpWeir]: {
      warningHigh: 350,
      alarmHigh: 450,
      unit: 'psi',
      precision: 0,
    },
    [CANONICAL_TAGS.QGas]: {
      warningHigh: 8.5,
      alarmHigh: 9.5,
      unit: 'MMSCFD',
      precision: 1,
    },
    [CANONICAL_TAGS.QLiquid]: {
      warningHigh: 4300,
      alarmHigh: 4700,
      unit: 'bbl/d',
      precision: 0,
    },
    [CANONICAL_TAGS.WaterCut]: {
      warningHigh: 55,
      alarmHigh: 70,
      unit: '%',
      precision: 1,
    },
    [CANONICAL_TAGS.PGasOut]: {
      warningHigh: 1700,
      alarmHigh: 2000,
      unit: 'psi',
      precision: 0,
    },
  },
  // No global override needed for this job — global defaults apply.
};

export const JOB_HP_HF: ActiveJobSnapshot = {
  jobId: SNAPSHOT_HP_HF.jobId,
  tenantId: SNAPSHOT_HP_HF.tenantId,
  wellId: SNAPSHOT_HP_HF.wellId,
  unitId: SNAPSHOT_HP_HF.unitId,
  startedAt: '2026-05-23T08:27:00Z',
  snapshot: SNAPSHOT_HP_HF,
};

// ---------------------------------------------------------------------------
// JOB 2 — Medium-Pressure
// ---------------------------------------------------------------------------

const SNAPSHOT_MP: CommissioningSnapshot = {
  snapshotId: commissioningId('CS-MP-001'),
  jobId: jobId('JOB-MP-001'),
  unitId: EMMAD_02.unitId,
  wellId: wellId('PZ-2041'),
  tenantId: TENANT_RVF,
  takenAt: '2026-05-23T11:00:00Z',
  sensors: EMMAD_02.sensors.map((s) => ({
    sensorId: s.sensorId,
    canonicalTag: s.canonicalTag,
    pidInstrumentTag: s.pidInstrumentTag,
    modbusRegister: s.modbusRegister,
    enabled: true,
  })),
  effectiveThresholds: {
    [CANONICAL_TAGS.PInlet]: {
      warningLow: 450,
      warningHigh: 1500,
      alarmLow: 300,
      alarmHigh: 1700,
      unit: 'psi',
      precision: 0,
    },
    [CANONICAL_TAGS.TInlet]: {
      warningLow: 60,
      warningHigh: 175,
      alarmLow: 40,
      alarmHigh: 195,
      unit: '°F',
      precision: 0,
    },
    [CANONICAL_TAGS.QTotalIn]: {
      warningLow: 800,
      warningHigh: 3100,
      alarmLow: 500,
      alarmHigh: 3400,
      unit: 'bbl/d',
      precision: 0,
    },
    [CANONICAL_TAGS.QGas]: {
      warningHigh: 5.2,
      alarmHigh: 5.8,
      unit: 'MMSCFD',
      precision: 1,
    },
    [CANONICAL_TAGS.WaterCut]: {
      warningHigh: 60,
      alarmHigh: 75,
      unit: '%',
      precision: 1,
    },
  },
};

export const JOB_MP: ActiveJobSnapshot = {
  jobId: SNAPSHOT_MP.jobId,
  tenantId: SNAPSHOT_MP.tenantId,
  wellId: SNAPSHOT_MP.wellId,
  unitId: SNAPSHOT_MP.unitId,
  startedAt: '2026-05-23T11:42:00Z',
  snapshot: SNAPSHOT_MP,
};

// ---------------------------------------------------------------------------
// JOB 3 — Low/Medium-Pressure portable skid
// ---------------------------------------------------------------------------

const SNAPSHOT_LP: CommissioningSnapshot = {
  snapshotId: commissioningId('CS-LP-001'),
  jobId: jobId('JOB-LP-001'),
  unitId: PSK_03.unitId,
  wellId: wellId('PZ-3015'),
  tenantId: TENANT_RVF,
  takenAt: '2026-05-23T13:30:00Z',
  sensors: PSK_03.sensors.map((s) => ({
    sensorId: s.sensorId,
    canonicalTag: s.canonicalTag,
    pidInstrumentTag: s.pidInstrumentTag,
    modbusRegister: s.modbusRegister,
    enabled: true,
  })),
  effectiveThresholds: {
    [CANONICAL_TAGS.PInlet]: {
      warningLow: 150,
      warningHigh: 650,
      alarmLow: 80,
      alarmHigh: 850,
      unit: 'psi',
      precision: 0,
    },
    [CANONICAL_TAGS.TInlet]: {
      warningLow: 50,
      warningHigh: 135,
      alarmLow: 35,
      alarmHigh: 150,
      unit: '°F',
      precision: 0,
    },
    [CANONICAL_TAGS.QTotalIn]: {
      warningLow: 200,
      warningHigh: 950,
      alarmLow: 120,
      alarmHigh: 1100,
      unit: 'bbl/d',
      precision: 0,
    },
    [CANONICAL_TAGS.WaterCut]: {
      warningHigh: 70,
      alarmHigh: 85,
      unit: '%',
      precision: 1,
    },
  },
};

export const JOB_LP: ActiveJobSnapshot = {
  jobId: SNAPSHOT_LP.jobId,
  tenantId: SNAPSHOT_LP.tenantId,
  wellId: SNAPSHOT_LP.wellId,
  unitId: SNAPSHOT_LP.unitId,
  startedAt: '2026-05-23T13:45:00Z',
  snapshot: SNAPSHOT_LP,
};

// ---------------------------------------------------------------------------
// JOB 4 — Stale/offline drill (EMMAD-02 on a different well)
// ---------------------------------------------------------------------------
// One canonical tag has its stale window tightened to 5/15/45 seconds so a
// short drill is enough to drive the detector through all four states.

const SNAPSHOT_STALE: CommissioningSnapshot = {
  snapshotId: commissioningId('CS-STALE-001'),
  jobId: jobId('JOB-STALE-001'),
  unitId: EMMAD_02.unitId,
  wellId: wellId('PZ-2099'),
  tenantId: TENANT_RVF,
  takenAt: '2026-05-23T15:00:00Z',
  sensors: EMMAD_02.sensors.map((s) => ({
    sensorId: s.sensorId,
    canonicalTag: s.canonicalTag,
    pidInstrumentTag: s.pidInstrumentTag,
    modbusRegister: s.modbusRegister,
    // Demonstrate the disabled-sensor path on one tag.
    enabled: s.canonicalTag !== CANONICAL_TAGS.WaterCut,
  })),
  effectiveThresholds: {
    [CANONICAL_TAGS.PInlet]: {
      warningLow: 450,
      warningHigh: 1500,
      alarmLow: 300,
      alarmHigh: 1700,
      unit: 'psi',
      precision: 0,
    },
    [CANONICAL_TAGS.QTotalIn]: {
      warningLow: 800,
      warningHigh: 3100,
      alarmLow: 500,
      alarmHigh: 3400,
      unit: 'bbl/d',
      precision: 0,
    },
  },
  staleTimings: {
    [CANONICAL_TAGS.PInlet]: {
      delayedAfterSec: 5,
      staleAfterSec: 15,
      offlineAfterSec: 45,
    },
  },
};

export const JOB_STALE: ActiveJobSnapshot = {
  jobId: SNAPSHOT_STALE.jobId,
  tenantId: SNAPSHOT_STALE.tenantId,
  wellId: SNAPSHOT_STALE.wellId,
  unitId: SNAPSHOT_STALE.unitId,
  startedAt: '2026-05-23T15:05:00Z',
  snapshot: SNAPSHOT_STALE,
};

export const MOCK_ACTIVE_JOBS: readonly ActiveJobSnapshot[] = [
  JOB_HP_HF,
  JOB_MP,
  JOB_LP,
  JOB_STALE,
];

/**
 * The "default" active job for development scenarios where only one is
 * needed (hooks, demo script, single-unit views). Tests should not depend
 * on this — they should pick the specific job they exercise.
 */
export const DEFAULT_ACTIVE_JOB: ActiveJobSnapshot = JOB_HP_HF;
