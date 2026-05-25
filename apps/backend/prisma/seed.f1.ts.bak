/**
 * RVF Malinois — F1 seed.
 *
 * Idempotent. Populates the dev database with the minimum domain content
 * needed to exercise the read-only REST endpoints and to inspect the model
 * end-to-end in Prisma Studio.
 *
 * Layout follows docs/architecture/domain-model.md:
 *   1. Canonical tag dictionary (telemetry-foundation §9; RVF-global)
 *   2. Tenants                 (rvf-internal + repsol)
 *   3. Equipment types         (EMMAD, EMGAD)
 *   4. Equipment unit          (EMMAD-01) + sensors + SignalFire devices
 *   5. Well                    (CN-014 under repsol)
 *   6. Job + commissioning     (JOB-2026-0001, IN_PROGRESS, snapshot frozen
 *                                in the SAME transaction — a job cannot
 *                                exist without its snapshot)
 */

import {
  AlarmCondition,
  AlarmSeverity,
  EngineeringUnitClass,
  EquipmentCategory,
  JobStatus,
  PrismaClient,
  SensorType,
  TenantKind,
  UserRole,
} from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// 1. Canonical tag dictionary
// ---------------------------------------------------------------------------
// Sourced verbatim from docs/architecture/telemetry-foundation.md §9.
// These are the RVF-governed tags. The MEANING of an existing tag never
// changes; new tags can be added.

interface CanonicalTagSeed {
  name: string;
  displayName: string;
  unit: string;
  unitClass: EngineeringUnitClass;
  decimals?: number;
  expectedRange?: { lo: number; hi: number };
}

const CANONICAL_TAGS: CanonicalTagSeed[] = [
  {
    name: 'p_inlet',
    displayName: 'Inlet Pressure',
    unit: 'psi',
    unitClass: EngineeringUnitClass.pressure,
    expectedRange: { lo: 0, hi: 3000 },
  },
  {
    name: 'p_outlet',
    displayName: 'Outlet Pressure',
    unit: 'psi',
    unitClass: EngineeringUnitClass.pressure,
    expectedRange: { lo: 0, hi: 3000 },
  },
  {
    name: 't_inlet',
    displayName: 'Inlet Temperature',
    unit: 'degC',
    unitClass: EngineeringUnitClass.temperature,
    expectedRange: { lo: -20, hi: 200 },
  },
  {
    name: 't_outlet',
    displayName: 'Outlet Temperature',
    unit: 'degC',
    unitClass: EngineeringUnitClass.temperature,
    expectedRange: { lo: -20, hi: 200 },
  },
  {
    name: 'q_oil',
    displayName: 'Oil Flow',
    unit: 'bbl/d',
    unitClass: EngineeringUnitClass.flow,
    expectedRange: { lo: 0, hi: 5000 },
  },
  {
    name: 'q_gas',
    displayName: 'Gas Flow',
    unit: 'MMscf/d',
    unitClass: EngineeringUnitClass.flow,
    expectedRange: { lo: 0, hi: 50 },
  },
  {
    name: 'q_water',
    displayName: 'Water Flow',
    unit: 'bbl/d',
    unitClass: EngineeringUnitClass.flow,
    expectedRange: { lo: 0, hi: 5000 },
  },
  {
    name: 'oil_prod_day',
    displayName: 'Daily Oil Production',
    unit: 'bbl',
    unitClass: EngineeringUnitClass.production,
  },
  {
    name: 'gas_prod_day',
    displayName: 'Daily Gas Production',
    unit: 'MMscf',
    unitClass: EngineeringUnitClass.production,
  },
  {
    name: 'gor',
    displayName: 'Gas-Oil Ratio',
    unit: 'scf/bbl',
    unitClass: EngineeringUnitClass.ratio,
    decimals: 0,
  },
  {
    name: 'water_cut',
    displayName: 'Water Cut',
    unit: 'pct',
    unitClass: EngineeringUnitClass.composition,
    expectedRange: { lo: 0, hi: 100 },
  },
  {
    name: 'bsw',
    displayName: 'Basic Sediment & Water',
    unit: 'pct',
    unitClass: EngineeringUnitClass.composition,
    expectedRange: { lo: 0, hi: 100 },
  },
  {
    name: 'choke_pos',
    displayName: 'Choke Opening',
    unit: 'pct',
    unitClass: EngineeringUnitClass.dimensionless,
    expectedRange: { lo: 0, hi: 100 },
  },
  {
    name: 'sep_pressure',
    displayName: 'Separator Pressure',
    unit: 'psi',
    unitClass: EngineeringUnitClass.pressure,
    expectedRange: { lo: 0, hi: 3000 },
  },
  {
    name: 'sep_temp',
    displayName: 'Separator Temperature',
    unit: 'degC',
    unitClass: EngineeringUnitClass.temperature,
    expectedRange: { lo: -20, hi: 200 },
  },
];

// ---------------------------------------------------------------------------
// 4. Sensors on EMMAD-01 — mirrors the ADR-004 P&ID example
// ---------------------------------------------------------------------------

interface SensorSeed {
  instrumentTag: string; // P&ID code
  sensorType: SensorType;
  modbusRegister: number;
  canonicalTagName: string; // soft ref to CanonicalTag.name
  serialNumber: string;
  rangeLow: number;
  rangeHigh: number;
  signalFire?: {
    // optional placeholder device
    deviceId: string;
    gatewayId: string;
    radioProfile: string;
  };
}

const EMMAD_01_SENSORS: SensorSeed[] = [
  {
    instrumentTag: 'PIT-003',
    sensorType: SensorType.pressure_scout,
    modbusRegister: 1003,
    canonicalTagName: 'p_inlet',
    serialNumber: 'PS-118',
    rangeLow: 0,
    rangeHigh: 3000,
    signalFire: { deviceId: 'SF-PS-118', gatewayId: 'GW-EMMAD-01', radioProfile: 'fhss-900' },
  },
  {
    instrumentTag: 'TIT-002',
    sensorType: SensorType.sentinel_rtd,
    modbusRegister: 1102,
    canonicalTagName: 't_outlet',
    serialNumber: 'RT-094',
    rangeLow: -20,
    rangeHigh: 200,
    signalFire: { deviceId: 'SF-RT-094', gatewayId: 'GW-EMMAD-01', radioProfile: 'fhss-900' },
  },
  {
    instrumentTag: 'FQI-004',
    sensorType: SensorType.wireless_totalizer,
    modbusRegister: 1204,
    canonicalTagName: 'q_oil',
    serialNumber: 'WT-051',
    rangeLow: 0,
    rangeHigh: 2000,
    signalFire: { deviceId: 'SF-WT-051', gatewayId: 'GW-EMMAD-01', radioProfile: 'fhss-900' },
  },
  {
    instrumentTag: 'AT-004',
    sensorType: SensorType.water_cut_analyzer,
    modbusRegister: 1304,
    canonicalTagName: 'water_cut',
    serialNumber: 'AC-014',
    rangeLow: 0,
    rangeHigh: 100,
    signalFire: { deviceId: 'SF-AC-014', gatewayId: 'GW-EMMAD-01', radioProfile: 'fhss-900' },
  },
];

// ---------------------------------------------------------------------------
// Helpers — idempotent upserts.
// ---------------------------------------------------------------------------

async function seedCanonicalTags(): Promise<void> {
  for (const t of CANONICAL_TAGS) {
    await prisma.canonicalTag.upsert({
      where: { name: t.name },
      create: {
        name: t.name,
        displayName: t.displayName,
        unit: t.unit,
        unitClass: t.unitClass,
        decimals: t.decimals ?? 2,
        expectedRange: t.expectedRange ?? undefined,
      },
      update: {
        displayName: t.displayName,
        unit: t.unit,
        unitClass: t.unitClass,
        decimals: t.decimals ?? 2,
        expectedRange: t.expectedRange ?? undefined,
      },
    });
  }
  console.log(`  ✓ canonical_tags: ${CANONICAL_TAGS.length} rows`);
}

async function seedTenants(): Promise<{ rvfInternalId: string; repsolId: string }> {
  const rvfInternal = await prisma.tenant.upsert({
    where: { code: 'rvf-internal' },
    create: {
      code: 'rvf-internal',
      name: 'RVF Soluciones Energéticas',
      kind: TenantKind.rvf_internal,
    },
    update: { name: 'RVF Soluciones Energéticas', kind: TenantKind.rvf_internal },
  });

  const repsol = await prisma.tenant.upsert({
    where: { code: 'repsol' },
    create: { code: 'repsol', name: 'Repsol', kind: TenantKind.client, dataResidency: 'sa-east-1' },
    update: { name: 'Repsol', kind: TenantKind.client, dataResidency: 'sa-east-1' },
  });

  console.log(
    `  ✓ tenants: rvf-internal (${rvfInternal.id.slice(0, 8)}…), repsol (${repsol.id.slice(0, 8)}…)`,
  );
  return { rvfInternalId: rvfInternal.id, repsolId: repsol.id };
}

async function seedEquipmentTypes(): Promise<{ emmadId: string; emgadId: string }> {
  const emmad = await prisma.equipmentType.upsert({
    where: { code: 'EMMAD' },
    create: {
      code: 'EMMAD',
      name: 'Equipo de Medición Multifásica de Alta Demanda',
      category: EquipmentCategory.emmad,
      expectedSensorChannels: {
        loops: [
          'inlet_pressure',
          'outlet_pressure',
          'inlet_temperature',
          'outlet_temperature',
          'oil_flow',
          'gas_flow',
          'water_cut',
          'separator_pressure',
          'separator_temperature',
        ],
        notes: 'EMMAD includes water-cut analyzer and cyclonic separator (ADR-004).',
      },
      pidReference: 'P&ID EMMAD-01 (RVF, dic. 2020)',
    },
    update: {},
  });

  const emgad = await prisma.equipmentType.upsert({
    where: { code: 'EMGAD' },
    create: {
      code: 'EMGAD',
      name: 'Equipo de Medición Gravitacional de Alta Demanda',
      category: EquipmentCategory.emgad,
      expectedSensorChannels: {
        loops: [
          'inlet_pressure',
          'outlet_pressure',
          'inlet_temperature',
          'outlet_temperature',
          'oil_flow',
          'gas_flow',
        ],
        notes: 'EMGAD does NOT include water-cut analyzer or cyclonic separator (ADR-004).',
      },
    },
    update: {},
  });

  console.log(
    `  ✓ equipment_types: EMMAD (${emmad.id.slice(0, 8)}…), EMGAD (${emgad.id.slice(0, 8)}…)`,
  );
  return { emmadId: emmad.id, emgadId: emgad.id };
}

async function seedEmmad01(emmadTypeId: string): Promise<string> {
  const unit = await prisma.equipmentUnit.upsert({
    where: { code: 'EMMAD-01' },
    create: {
      code: 'EMMAD-01',
      serialNumber: 'RVF-EMMAD-2024-001',
      equipmentTypeId: emmadTypeId,
      pidReference: 'P&ID EMMAD-01 (RVF, dic. 2020)',
    },
    update: { equipmentTypeId: emmadTypeId },
  });

  for (const s of EMMAD_01_SENSORS) {
    const sensor = await prisma.sensor.upsert({
      where: {
        equipmentUnitId_instrumentTag: {
          equipmentUnitId: unit.id,
          instrumentTag: s.instrumentTag,
        },
      },
      create: {
        equipmentUnitId: unit.id,
        instrumentTag: s.instrumentTag,
        sensorType: s.sensorType,
        modbusRegister: s.modbusRegister,
        canonicalTagName: s.canonicalTagName,
        rangeLow: s.rangeLow,
        rangeHigh: s.rangeHigh,
        serialNumber: s.serialNumber,
      },
      update: {
        modbusRegister: s.modbusRegister,
        canonicalTagName: s.canonicalTagName,
        rangeLow: s.rangeLow,
        rangeHigh: s.rangeHigh,
      },
    });

    if (s.signalFire) {
      await prisma.signalFireDevice.upsert({
        where: { sensorId: sensor.id },
        create: {
          sensorId: sensor.id,
          deviceId: s.signalFire.deviceId,
          gatewayId: s.signalFire.gatewayId,
          radioProfile: s.signalFire.radioProfile,
        },
        update: {
          gatewayId: s.signalFire.gatewayId,
          radioProfile: s.signalFire.radioProfile,
        },
      });
    }
  }

  console.log(
    `  ✓ equipment_units: EMMAD-01 + ${EMMAD_01_SENSORS.length} sensors + signalfire devices`,
  );
  return unit.id;
}

async function seedWell(repsolId: string): Promise<string> {
  const well = await prisma.well.upsert({
    where: { tenantId_code: { tenantId: repsolId, code: 'CN-014' } },
    create: {
      tenantId: repsolId,
      code: 'CN-014',
      name: 'Campo Norte 014',
      siteCode: 'campo-norte',
      wellType: 'producer',
      fluid: 'oil',
      designLimits: {
        p_inlet: { lo_lo: 100, lo: 200, hi: 1350, hi_hi: 1500, u: 'psi' },
      },
    },
    update: {},
  });

  console.log(`  ✓ wells: repsol/CN-014 (${well.id.slice(0, 8)}…)`);
  return well.id;
}

async function seedJob(
  repsolId: string,
  wellId: string,
  equipmentUnitId: string,
  emmad01Sensors: SensorSeed[],
): Promise<void> {
  // Idempotency: if the job exists, leave it (and its snapshot) untouched.
  const existing = await prisma.job.findUnique({
    where: { code: 'JOB-2026-0001' },
    include: { snapshot: { include: { sensorSnapshots: true } } },
  });

  if (existing) {
    console.log(`  ✓ jobs: JOB-2026-0001 already present (${existing.id.slice(0, 8)}…) — skipping`);
    return;
  }

  const tagsByName = new Map(
    (
      await prisma.canonicalTag.findMany({
        where: { name: { in: emmad01Sensors.map((s) => s.canonicalTagName) } },
      })
    ).map((t) => [t.name, t]),
  );

  await prisma.$transaction(async (tx) => {
    const job = await tx.job.create({
      data: {
        code: 'JOB-2026-0001',
        tenantId: repsolId,
        wellId,
        equipmentUnitId,
        startedAt: new Date('2026-05-18T00:00:00.000Z'),
        status: JobStatus.in_progress,
        notes: 'Seed job — first commissioning of EMMAD-01 on Campo Norte 014.',
      },
    });

    const snapshot = await tx.commissioningSnapshot.create({
      data: {
        jobId: job.id,
        frozenAt: new Date('2026-05-18T00:00:00.000Z'),
        notes: 'Frozen at job creation per ADR-003/004 (same transaction).',
      },
    });

    for (const s of emmad01Sensors) {
      const tag = tagsByName.get(s.canonicalTagName);
      if (!tag) {
        throw new Error(`Seed inconsistency: canonical tag '${s.canonicalTagName}' is missing.`);
      }

      await tx.jobSensorSnapshot.create({
        data: {
          snapshotId: snapshot.id,
          instrumentTag: s.instrumentTag,
          sensorType: s.sensorType,
          modbusRegister: s.modbusRegister,
          canonicalTagName: s.canonicalTagName,
          unit: tag.unit,
          unitClass: tag.unitClass,
          rangeLow: s.rangeLow,
          rangeHigh: s.rangeHigh,
          sensorSerialNumber: s.serialNumber,
          alarmLimits:
            s.canonicalTagName === 'p_inlet'
              ? { lo_lo: 100, lo: 200, hi: 1350, hi_hi: 1500 }
              : undefined,
        },
      });
    }

    // One sample alarm rule against the snapshot's frozen limits.
    await tx.alarmRule.create({
      data: {
        jobId: job.id,
        canonicalTagName: 'p_inlet',
        condition: AlarmCondition.HI_HI,
        threshold: 1500,
        severity: AlarmSeverity.critical,
      },
    });
  });

  console.log(
    `  ✓ jobs: JOB-2026-0001 + snapshot + ${emmad01Sensors.length} sensor snapshots + 1 alarm rule`,
  );
}

async function seedSampleOperator(rvfInternalId: string): Promise<void> {
  await prisma.user.upsert({
    where: { email: 'ops@rvf.local' },
    create: {
      tenantId: rvfInternalId,
      email: 'ops@rvf.local',
      displayName: 'RVF Operations (Seed)',
      role: UserRole.rvf_operations,
    },
    update: { displayName: 'RVF Operations (Seed)', role: UserRole.rvf_operations },
  });

  console.log('  ✓ users: ops@rvf.local (rvf_operations) — placeholder');
}

async function main(): Promise<void> {
  console.log('Seeding RVF Malinois (F1) …');
  await seedCanonicalTags();
  const { rvfInternalId, repsolId } = await seedTenants();
  await seedSampleOperator(rvfInternalId);
  const { emmadId } = await seedEquipmentTypes();
  const emmad01Id = await seedEmmad01(emmadId);
  const wellId = await seedWell(repsolId);
  await seedJob(repsolId, wellId, emmad01Id, EMMAD_01_SENSORS);
  console.log('Seed complete.');
}

main()
  .catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
