/**
 * F3 standardized HTTP response helpers.
 *
 * Every non-2xx response must follow `{ error: { code, message } }` per
 * F3 §14. These helpers exist so route handlers never hand-roll that
 * shape and never leak stack traces.
 *
 * The helpers return `NextResponse` so they integrate naturally with
 * Next.js App Router route handlers.
 */
import { NextResponse } from 'next/server';

import type { ApiError, ApiErrorBody, ApiErrorCode } from '@/types/api';

/** Success — wraps the body in `NextResponse.json(...)` with status 200 by default. */
export const ok = <T>(body: T, init?: { status?: number }): NextResponse =>
  NextResponse.json(body, { status: init?.status ?? 200 });

/** 202 Accepted — used by POST /api/telemetry. */
export const accepted = <T>(body: T): NextResponse => NextResponse.json(body, { status: 202 });

/**
 * Build the standardized error body. `details` is an optional array of
 * structured strings — useful for `INVALID_PAYLOAD` to surface which
 * fields failed, without exposing internals.
 */
const errorBody = (
  code: ApiErrorCode,
  message: string,
  details?: readonly string[],
): ApiErrorBody => {
  const error: ApiError = { code, message };
  if (details && details.length > 0) error.details = details;
  return { error };
};

/** Generic error builder — prefer the specific helpers below. */
export const err = (
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: readonly string[],
): NextResponse => NextResponse.json(errorBody(code, message, details), { status });

export const invalidPayload = (message: string, details?: readonly string[]): NextResponse =>
  err(400, 'INVALID_PAYLOAD', message, details);

export const unitNotFound = (unitId: string): NextResponse =>
  err(404, 'UNIT_NOT_FOUND', `Measurement unit not found: ${unitId}`);

export const sensorNotFound = (sensorId: string): NextResponse =>
  err(404, 'SENSOR_NOT_FOUND', `Sensor not found: ${sensorId}`);

export const sensorUnitMismatch = (sensorId: string, unitId: string): NextResponse =>
  err(422, 'SENSOR_UNIT_MISMATCH', `Sensor ${sensorId} does not belong to unit ${unitId}`);

export const telemetryValidationFailed = (
  message: string,
  details?: readonly string[],
): NextResponse => err(422, 'TELEMETRY_VALIDATION_FAILED', message, details);

export const methodNotAllowed = (allowed: readonly string[]): NextResponse => {
  const response = err(405, 'METHOD_NOT_ALLOWED', `Method not allowed. Use ${allowed.join(', ')}`);
  response.headers.set('Allow', allowed.join(', '));
  return response;
};

export const internalError = (message: string): NextResponse => err(500, 'INTERNAL_ERROR', message);
