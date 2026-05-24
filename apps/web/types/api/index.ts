/**
 * F3 canonical API types — barrel export.
 *
 * All consumers import from `@/types/api` rather than reaching into the
 * individual files. New entity types added in future phases (e.g. Jobs,
 * Snapshots, Reports) extend this barrel; the surface is the contract.
 */
export type {
  MeasurementUnit,
  MeasurementUnitOperatingProfile,
  MeasurementUnitStatus,
} from './unit';
export type { Sensor, SensorStatus, SensorType } from './sensor';
export type { AlarmConfiguration, AlarmSeverity, AlarmType } from './alarm';
export type {
  TelemetryAcceptedResponse,
  TelemetryPayload,
  TelemetryQuality,
  TelemetryReading,
  TelemetryRecord,
  TelemetrySource,
} from './telemetry';
export type { ApiError, ApiErrorBody, ApiErrorCode, ApiResponse } from './api';
