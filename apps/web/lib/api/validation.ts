/**
 * F3 payload validation — hand-written guards.
 *
 * `zod` is available in the monorepo (the F1 backend already depends on
 * it) but F3 §16 explicitly endorses "plain TypeScript guards" for the
 * web API layer to avoid pulling a new client-bundle dependency into
 * `@rvf/web`. The guards below validate exactly what F3 §13 enumerates
 * for the telemetry ingestion flow.
 *
 * Each guard returns a discriminated result so callers handle the bad
 * case with the standardized `ApiError` shape (no thrown exceptions,
 * no leaked stack traces).
 */
import type { TelemetryPayload, TelemetryReading } from '@/types/api';

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string; details: string[] };

const isObject = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x);

const isFiniteNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

const isNonEmptyString = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;

/**
 * Strict ISO-UTC check. Accepts any string `Date.parse` parses to a
 * finite time. We deliberately do NOT round-trip the string through
 * `Date(...).toISOString()` here — that would be normalization, and
 * F3 §13 step 6 is normalization at storage time. Validation only
 * confirms parseability.
 */
const isValidIso = (x: unknown): x is string => {
  if (typeof x !== 'string' || x.length === 0) return false;
  const ms = Date.parse(x);
  return !Number.isNaN(ms);
};

/** Validate a single inbound reading. Returns the field path of every problem. */
const validateReading = (raw: unknown, idx: number): string[] => {
  const path = `readings[${String(idx)}]`;
  const errs: string[] = [];
  if (!isObject(raw)) {
    return [`${path} must be an object`];
  }
  if (!isNonEmptyString(raw.sensorId)) errs.push(`${path}.sensorId must be a non-empty string`);
  if (!isFiniteNumber(raw.value)) errs.push(`${path}.value must be a finite number`);
  if (!isNonEmptyString(raw.unit)) errs.push(`${path}.unit must be a non-empty string`);
  return errs;
};

/**
 * Validate a TelemetryPayload (shape only — referential checks like
 * "unit exists" / "sensor belongs to unit" live in the route handler
 * because they require adapter access).
 */
export const validateTelemetryPayload = (raw: unknown): ValidationResult<TelemetryPayload> => {
  if (!isObject(raw)) {
    return {
      ok: false,
      message: 'Body must be a JSON object',
      details: ['body must be an object'],
    };
  }
  const details: string[] = [];

  if (!isNonEmptyString(raw.unitId)) details.push('unitId must be a non-empty string');

  if (!isValidIso(raw.timestamp)) {
    details.push('timestamp must be a valid ISO-8601 UTC string');
  }

  if (!Array.isArray(raw.readings)) {
    details.push('readings must be an array');
  } else if (raw.readings.length === 0) {
    details.push('readings must be a non-empty array');
  } else {
    raw.readings.forEach((r, i) => {
      details.push(...validateReading(r, i));
    });
  }

  if (details.length > 0) {
    return { ok: false, message: 'Telemetry payload failed validation', details };
  }

  // After the checks above every field is the right shape, but TS does
  // not know that. Build the typed value explicitly to keep `any` out.
  const readings = (raw.readings as unknown[]).map((r): TelemetryReading => {
    const o = r as Record<string, unknown>;
    return {
      sensorId: o.sensorId as string,
      value: o.value as number,
      unit: o.unit as string,
    };
  });
  return {
    ok: true,
    value: {
      unitId: raw.unitId as string,
      timestamp: raw.timestamp as string,
      readings,
    },
  };
};

/** Validate that a non-empty `unitId` was supplied (used by query filters). */
export const validateUnitIdParam = (raw: string | null): ValidationResult<string> => {
  if (!isNonEmptyString(raw)) {
    return {
      ok: false,
      message: 'unitId query parameter is required',
      details: ['unitId must be a non-empty string'],
    };
  }
  return { ok: true, value: raw };
};
