/**
 * F4.5A — frontend data-source configuration.
 *
 * Centralizes two public env vars that gate the F4 backend integration
 * without touching screen code:
 *
 *   - `NEXT_PUBLIC_RVF_DATA_SOURCE`     — `mock` (default) | `api`.
 *   - `NEXT_PUBLIC_RVF_API_BASE_URL`    — backend base, e.g. `http://localhost:4000/api/v1`.
 *
 * Default `mock` preserves every existing F3 screen's behavior. The
 * `lib/api-data/` flat adapter continues to be the source of truth for
 * Units / Sensors / Alarms / Telemetry until a later F4.5 sub-phase
 * (B → E) intentionally migrates a specific consumer.
 *
 * Resolution is intentionally narrow: unknown values fall back to `mock`
 * rather than throwing, so a typo in `.env.local` cannot break local dev.
 * The runtime-validation seam is documented at the top of each helper.
 */

export const RVF_DATA_SOURCES = ['mock', 'api'] as const;
export type RvfDataSource = (typeof RVF_DATA_SOURCES)[number];

const DEFAULT_DATA_SOURCE: RvfDataSource = 'mock';
const DEFAULT_API_BASE_URL = 'http://localhost:4000/api/v1';

const isRvfDataSource = (value: string): value is RvfDataSource =>
  (RVF_DATA_SOURCES as readonly string[]).includes(value);

/**
 * Resolve the data source from a string (or `undefined`). Unknown values
 * fall back to `mock`. Exported separately so unit tests can drive
 * resolution deterministically.
 */
export const resolveDataSource = (raw: string | undefined): RvfDataSource => {
  if (raw === undefined || raw === '') return DEFAULT_DATA_SOURCE;
  if (isRvfDataSource(raw)) return raw;
  return DEFAULT_DATA_SOURCE;
};

/**
 * Resolve the API base URL from a string (or `undefined`). Empty / missing
 * value falls back to the local-dev default. Trailing slashes are stripped
 * so callers can compose paths without doubled `//`.
 */
export const resolveApiBaseUrl = (raw: string | undefined): string => {
  const value = raw && raw.length > 0 ? raw : DEFAULT_API_BASE_URL;
  return value.replace(/\/+$/, '');
};

/** Current data source. Reads `process.env.NEXT_PUBLIC_RVF_DATA_SOURCE`. */
export const getDataSource = (): RvfDataSource =>
  resolveDataSource(process.env.NEXT_PUBLIC_RVF_DATA_SOURCE);

/** Current API base URL. Reads `process.env.NEXT_PUBLIC_RVF_API_BASE_URL`. */
export const getApiBaseUrl = (): string =>
  resolveApiBaseUrl(process.env.NEXT_PUBLIC_RVF_API_BASE_URL);

export const isMockSource = (): boolean => getDataSource() === 'mock';
export const isApiSource = (): boolean => getDataSource() === 'api';
