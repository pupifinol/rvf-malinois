/**
 * ApiError / ApiResponse — F3 standardized HTTP shapes.
 *
 * Every non-2xx response is wrapped in the same envelope so clients
 * (the F2 frontend, the future WebSocket bridge, contract tests) never
 * need to special-case any endpoint:
 *
 *   { "error": { "code": "UNIT_NOT_FOUND", "message": "..." } }
 *
 * Once an error code is shipped, it is stable. New conditions get new
 * codes; existing codes never change meaning.
 */
export type ApiErrorCode =
  | 'INVALID_PAYLOAD'
  | 'UNIT_NOT_FOUND'
  | 'SENSOR_NOT_FOUND'
  | 'SENSOR_UNIT_MISMATCH'
  | 'TELEMETRY_VALIDATION_FAILED'
  | 'METHOD_NOT_ALLOWED'
  | 'INTERNAL_ERROR';

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  /** Optional structured details for `INVALID_PAYLOAD` / validation failures. */
  details?: readonly string[];
}

export interface ApiErrorBody {
  error: ApiError;
}

/**
 * Generic discriminated response wrapper. Used by typed clients that
 * want to handle "envelope" semantics without `try/catch`. Route
 * handlers always emit a concrete shape (an entity or `ApiErrorBody`)
 * directly; this type is the union those handlers populate.
 */
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };
