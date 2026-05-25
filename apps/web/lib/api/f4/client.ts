/**
 * F4.5A — safe `fetch` wrapper used by the typed endpoint wrappers in
 * `./endpoints.ts`. Foundation-only: no caching, no retries, no auth, no
 * WebSocket. F4.5B+ can layer those on top.
 *
 * Behavior:
 *   - Base URL comes from `config.getApiBaseUrl()` (which reads
 *     `NEXT_PUBLIC_RVF_API_BASE_URL`).
 *   - Query params skip `undefined` and `null`; booleans become `"true"` /
 *     `"false"`; numbers and `Date` instances stringify; everything else
 *     coerces via `String(...)`.
 *   - JSON bodies are parsed when the response has a `Content-Type`
 *     containing `application/json` or when the body parses cleanly. Empty
 *     bodies resolve to `null`.
 *   - Any non-`2xx` status throws `RvfApiError(status, url, body)`; network
 *     / abort / fetch-side errors throw `RvfApiError(0, url, null, message)`.
 *   - Optional `signal: AbortSignal` is forwarded to `fetch` so consumers
 *     can cancel pending requests (React Query / TanStack consumers pass the
 *     query's `signal` straight through).
 */

import { getApiBaseUrl } from './config';
import { RvfApiError } from './errors';

/** Primitive query-parameter value supported by the helper. */
export type QueryValue = string | number | boolean | Date | null | undefined;

/**
 * Loose query-params shape. `unknown` rather than `QueryValue` so any
 * endpoint-wrapper `interface` (e.g. `ListWellsParams`) conforms without
 * needing an explicit index signature. The narrowing inside `buildUrl`
 * keeps the runtime contract honest: only the union of `QueryValue` types
 * survives to the query string.
 */
export type QueryParams = Record<string, unknown>;

/**
 * Compose a full URL from a base + path + optional query params. Used by
 * the GET helper; exported separately for unit testing.
 *
 * Generic over the params shape so that endpoint-wrapper `interface`s
 * (e.g. `ListWellsParams`) satisfy the parameter without an explicit
 * index signature. Iteration is via `Object.entries(...)`, which works on
 * any object regardless of how it was declared.
 */
export const buildUrl = <P extends object>(baseUrl: string, path: string, params?: P): string => {
  const trimmedBase = baseUrl.replace(/\/+$/, '');
  const leadingSlashPath = path.startsWith('/') ? path : `/${path}`;
  const full = `${trimmedBase}${leadingSlashPath}`;
  if (!params) return full;

  const search = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (raw === undefined || raw === null) continue;
    if (raw instanceof Date) {
      search.append(key, raw.toISOString());
      continue;
    }
    if (typeof raw === 'boolean') {
      search.append(key, raw ? 'true' : 'false');
      continue;
    }
    if (typeof raw === 'number' || typeof raw === 'string') {
      search.append(key, String(raw));
      continue;
    }
    // Anything else (object / function / symbol) is silently skipped rather
    // than coerced into a `[object Object]`-style query string.
  }
  const qs = search.toString();
  return qs.length === 0 ? full : `${full}?${qs}`;
};

export interface GetOptions {
  /** Forwarded to `fetch(..., { signal })`. */
  signal?: AbortSignal;
  /** Optional base-URL override (test seam; default reads from config). */
  baseUrl?: string;
}

const looksLikeJson = (contentType: string | null): boolean =>
  contentType?.toLowerCase().includes('application/json') ?? false;

/**
 * Issue a `GET` to `<baseUrl><path>?<params>` and decode the JSON response.
 *
 * Generic over `P extends object` so endpoint wrappers can pass typed
 * `interface` params without an explicit index signature.
 *
 * @throws {RvfApiError} on network / parse / non-2xx response.
 */
export async function getJson<T, P extends object = object>(
  path: string,
  params?: P,
  options?: GetOptions,
): Promise<T> {
  const url = buildUrl(options?.baseUrl ?? getApiBaseUrl(), path, params);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: options?.signal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    throw new RvfApiError(0, url, null, message);
  }

  let body: unknown = null;
  const text = await response.text();
  if (text.length > 0) {
    if (looksLikeJson(response.headers.get('content-type'))) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    } else {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
  }

  if (!response.ok) {
    throw new RvfApiError(response.status, url, body);
  }

  return body as T;
}
