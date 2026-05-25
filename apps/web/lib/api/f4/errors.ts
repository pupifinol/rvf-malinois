/**
 * RvfApiError — readable error class returned by the F4 frontend client.
 *
 * The fetch wrapper never throws a raw `Response` or a bare network error.
 * Every failure surfaces as `RvfApiError` with:
 *   - `status` (`0` for network / abort / parse errors that never produced an HTTP code),
 *   - `url`    (the URL that was actually requested),
 *   - `body`   (the parsed response body when available — usually the F4
 *               `{ statusCode, message, error }` Nest exception envelope, or
 *               the raw text fallback when the body was not JSON).
 *
 * Consumers can do:
 *
 *   catch (err) {
 *     if (err instanceof RvfApiError && err.status === 404) { … }
 *   }
 *
 * The class is plain (no helper methods) on purpose — the surface stays
 * small so F4.5B / F4.5C / etc. can build on a stable shape.
 */
export class RvfApiError extends Error {
  readonly status: number;
  readonly url: string;
  readonly body: unknown;

  constructor(status: number, url: string, body: unknown, message?: string) {
    super(message ?? `Request to ${url} failed with status ${String(status)}.`);
    this.name = 'RvfApiError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}
