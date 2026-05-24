/**
 * Mock unit catalog — F2A development data.
 *
 * Three reusable equipment entries seed the catalog, covering the three
 * pressure/flow envelopes we need to exercise in simulation:
 *
 *   - EMMAD-01: High-Pressure / High-Flow (the "EMMAD-style" reference).
 *   - EMMAD-02: Medium-Pressure (mid envelope).
 *   - PSK-03:   Low/Medium-Pressure portable skid.
 *
 * Each item carries SUGGESTED defaults only. Effective thresholds are
 * captured by `lib/jobs/snapshots.mock.ts` — that file is the source of
 * truth for the evaluator. See ADR-005, regla 1.
 */
import { brand } from '@rvf/types';

import { CANONICAL_TAGS } from '../telemetry/tags';

import type { UnitCatalogItem } from './types';
import type { EquipmentId } from '@rvf/types';

const eq = (id: string): EquipmentId => brand<string, 'EquipmentId'>(id);

// ---------------------------------------------------------------------------
// EMMAD-01 — High-Pressure / High-Flow
// ---------------------------------------------------------------------------

export const EMMAD_01: UnitCatalogItem = {
  unitId: eq('EMMAD-01'),
  unitType: 'EMMAD',
  profileTag: 'HP/HF',
  serial: 'RVF-EMMAD-01-2024',
  pidRef: 'P&ID EMMAD-01 (dic. 2020)',
  nominalRatings: {
    maxPressurePsi: 2500,
    maxLiquidFlowBpd: 5000,
    maxGasFlowMmscfd: 10,
    maxTemperatureF: 220,
    maxVibrationMmS: 12,
    separatorDesignPsi: 2500,
  },
  sensors: [
    {
      sensorId: 'PS-118',
      sensorType: 'PressureScout',
      canonicalTag: CANONICAL_TAGS.PInlet,
      pidInstrumentTag: 'PIT-003',
      modbusRegister: '40001',
      designRange: { min: 0, max: 2500, unit: 'psi' },
    },
    {
      sensorId: 'RT-094',
      sensorType: 'SentinelRTD',
      canonicalTag: CANONICAL_TAGS.TInlet,
      pidInstrumentTag: 'TIT-003',
      modbusRegister: '40003',
      designRange: { min: -20, max: 250, unit: '°F' },
    },
    {
      sensorId: 'WT-220',
      sensorType: 'WirelessTotalizer',
      canonicalTag: CANONICAL_TAGS.QTotalIn,
      pidInstrumentTag: 'FIT-300',
      modbusRegister: '40005',
      designRange: { min: 0, max: 5000, unit: 'bbl/d' },
    },
    {
      sensorId: 'PS-201',
      sensorType: 'PressureScout',
      canonicalTag: CANONICAL_TAGS.PSep,
      pidInstrumentTag: 'PIT-201',
      modbusRegister: '40007',
      designRange: { min: 0, max: 2500, unit: 'psi' },
    },
    {
      sensorId: 'RT-200',
      sensorType: 'SentinelRTD',
      canonicalTag: CANONICAL_TAGS.TSep,
      pidInstrumentTag: 'TIT-200',
      modbusRegister: '40009',
      designRange: { min: -20, max: 220, unit: '°F' },
    },
    {
      sensorId: 'DP-400',
      sensorType: 'PressureScout',
      canonicalTag: CANONICAL_TAGS.DpWeir,
      pidInstrumentTag: 'DPIT-400',
      modbusRegister: '40011',
      designRange: { min: 0, max: 500, unit: 'psi' },
    },
    {
      sensorId: 'PS-501',
      sensorType: 'PressureScout',
      canonicalTag: CANONICAL_TAGS.PGasOut,
      pidInstrumentTag: 'PIT-501',
      modbusRegister: '40013',
      designRange: { min: 0, max: 2500, unit: 'psi' },
    },
    {
      sensorId: 'WT-501',
      sensorType: 'WirelessTotalizer',
      canonicalTag: CANONICAL_TAGS.QGas,
      pidInstrumentTag: 'FIT-501',
      modbusRegister: '40015',
      designRange: { min: 0, max: 10, unit: 'MMSCFD' },
    },
    {
      sensorId: 'WT-601',
      sensorType: 'WirelessTotalizer',
      canonicalTag: CANONICAL_TAGS.QLiquid,
      pidInstrumentTag: 'FIT-601',
      modbusRegister: '40017',
      designRange: { min: 0, max: 5000, unit: 'bbl/d' },
    },
    {
      sensorId: 'WC-600',
      sensorType: 'WaterCutAnalyzer',
      canonicalTag: CANONICAL_TAGS.WaterCut,
      pidInstrumentTag: 'AT-004',
      modbusRegister: '40019',
      designRange: { min: 0, max: 100, unit: '%' },
    },
  ],
  suggestedDefaults: {
    [CANONICAL_TAGS.PInlet]: {
      warningLow: 600,
      warningHigh: 1800,
      alarmLow: 400,
      alarmHigh: 2200,
      unit: 'psi',
      precision: 0,
    },
    [CANONICAL_TAGS.TInlet]: {
      warningLow: 60,
      warningHigh: 190,
      alarmLow: 40,
      alarmHigh: 215,
      unit: '°F',
      precision: 0,
    },
    [CANONICAL_TAGS.QTotalIn]: {
      warningLow: 1200,
      warningHigh: 4500,
      alarmLow: 800,
      alarmHigh: 4900,
      unit: 'bbl/d',
      precision: 0,
    },
  },
  telemetrySource: {
    description: 'SignalFire mesh → Gateway Stick → Node-RED → MQTT (backend) → normalized WS',
    expectedSampleRateHz: 1,
    lifecycle: 'planned',
  },
};

// ---------------------------------------------------------------------------
// EMMAD-02 — Medium-Pressure
// ---------------------------------------------------------------------------

export const EMMAD_02: UnitCatalogItem = {
  unitId: eq('EMMAD-02'),
  unitType: 'EMMAD',
  profileTag: 'MP',
  serial: 'RVF-EMMAD-02-2024',
  pidRef: 'P&ID EMMAD-02 (2022)',
  nominalRatings: {
    maxPressurePsi: 1800,
    maxLiquidFlowBpd: 3500,
    maxGasFlowMmscfd: 6,
    maxTemperatureF: 200,
    maxVibrationMmS: 10,
    separatorDesignPsi: 1800,
  },
  sensors: [
    {
      sensorId: 'PS-140',
      sensorType: 'PressureScout',
      canonicalTag: CANONICAL_TAGS.PInlet,
      pidInstrumentTag: 'PIT-003',
      modbusRegister: '40001',
      designRange: { min: 0, max: 1800, unit: 'psi' },
    },
    {
      sensorId: 'RT-110',
      sensorType: 'SentinelRTD',
      canonicalTag: CANONICAL_TAGS.TInlet,
      pidInstrumentTag: 'TIT-003',
      modbusRegister: '40003',
      designRange: { min: -20, max: 220, unit: '°F' },
    },
    {
      sensorId: 'WT-240',
      sensorType: 'WirelessTotalizer',
      canonicalTag: CANONICAL_TAGS.QTotalIn,
      pidInstrumentTag: 'FIT-300',
      modbusRegister: '40005',
      designRange: { min: 0, max: 3500, unit: 'bbl/d' },
    },
    {
      sensorId: 'PS-220',
      sensorType: 'PressureScout',
      canonicalTag: CANONICAL_TAGS.PSep,
      pidInstrumentTag: 'PIT-201',
      modbusRegister: '40007',
      designRange: { min: 0, max: 1800, unit: 'psi' },
    },
    {
      sensorId: 'RT-210',
      sensorType: 'SentinelRTD',
      canonicalTag: CANONICAL_TAGS.TSep,
      pidInstrumentTag: 'TIT-200',
      modbusRegister: '40009',
      designRange: { min: -20, max: 200, unit: '°F' },
    },
    {
      sensorId: 'WT-520',
      sensorType: 'WirelessTotalizer',
      canonicalTag: CANONICAL_TAGS.QGas,
      pidInstrumentTag: 'FIT-501',
      modbusRegister: '40015',
      designRange: { min: 0, max: 6, unit: 'MMSCFD' },
    },
    {
      sensorId: 'WT-620',
      sensorType: 'WirelessTotalizer',
      canonicalTag: CANONICAL_TAGS.QLiquid,
      pidInstrumentTag: 'FIT-601',
      modbusRegister: '40017',
      designRange: { min: 0, max: 3500, unit: 'bbl/d' },
    },
    {
      sensorId: 'WC-620',
      sensorType: 'WaterCutAnalyzer',
      canonicalTag: CANONICAL_TAGS.WaterCut,
      pidInstrumentTag: 'AT-004',
      modbusRegister: '40019',
      designRange: { min: 0, max: 100, unit: '%' },
    },
  ],
  suggestedDefaults: {
    [CANONICAL_TAGS.PInlet]: {
      warningLow: 500,
      warningHigh: 1450,
      alarmLow: 300,
      alarmHigh: 1700,
      unit: 'psi',
      precision: 0,
    },
    [CANONICAL_TAGS.QTotalIn]: {
      warningLow: 900,
      warningHigh: 3200,
      alarmLow: 600,
      alarmHigh: 3450,
      unit: 'bbl/d',
      precision: 0,
    },
  },
  telemetrySource: {
    description: 'SignalFire mesh → Gateway Stick → Node-RED → MQTT (backend) → normalized WS',
    expectedSampleRateHz: 1,
    lifecycle: 'planned',
  },
};

// ---------------------------------------------------------------------------
// PSK-03 — Low/Medium-Pressure portable skid
// ---------------------------------------------------------------------------

export const PSK_03: UnitCatalogItem = {
  unitId: eq('PSK-03'),
  unitType: 'PORTABLE_SKID',
  profileTag: 'LP/LF',
  serial: 'RVF-PSK-03-2025',
  pidRef: 'P&ID PSK-03 (2025)',
  nominalRatings: {
    maxPressurePsi: 1000,
    maxLiquidFlowBpd: 1200,
    maxGasFlowMmscfd: 2,
    maxTemperatureF: 160,
    maxVibrationMmS: 8,
    separatorDesignPsi: 1000,
  },
  sensors: [
    {
      sensorId: 'PS-310',
      sensorType: 'PressureScout',
      canonicalTag: CANONICAL_TAGS.PInlet,
      pidInstrumentTag: 'PIT-003',
      modbusRegister: '40001',
      designRange: { min: 0, max: 1000, unit: 'psi' },
    },
    {
      sensorId: 'RT-310',
      sensorType: 'SentinelRTD',
      canonicalTag: CANONICAL_TAGS.TInlet,
      pidInstrumentTag: 'TIT-003',
      modbusRegister: '40003',
      designRange: { min: -10, max: 160, unit: '°F' },
    },
    {
      sensorId: 'WT-310',
      sensorType: 'WirelessTotalizer',
      canonicalTag: CANONICAL_TAGS.QTotalIn,
      pidInstrumentTag: 'FIT-300',
      modbusRegister: '40005',
      designRange: { min: 0, max: 1200, unit: 'bbl/d' },
    },
    {
      sensorId: 'WC-330',
      sensorType: 'WaterCutAnalyzer',
      canonicalTag: CANONICAL_TAGS.WaterCut,
      pidInstrumentTag: 'AT-004',
      modbusRegister: '40019',
      designRange: { min: 0, max: 100, unit: '%' },
    },
  ],
  suggestedDefaults: {
    [CANONICAL_TAGS.PInlet]: {
      warningLow: 200,
      warningHigh: 700,
      alarmLow: 100,
      alarmHigh: 900,
      unit: 'psi',
      precision: 0,
    },
  },
  telemetrySource: {
    description: 'SignalFire mesh → Gateway Stick → Node-RED → MQTT (backend) → normalized WS',
    expectedSampleRateHz: 1,
    lifecycle: 'planned',
  },
};

export const MOCK_UNIT_CATALOG: readonly UnitCatalogItem[] = [EMMAD_01, EMMAD_02, PSK_03];
