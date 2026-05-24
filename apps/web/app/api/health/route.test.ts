import { describe, expect, it } from 'vitest';

import { DELETE, GET, PATCH, POST, PUT } from './route';

describe('GET /api/health', () => {
  it('returns the F3 service identity payload', async () => {
    const res = GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      service: string;
      version: string;
      timestamp: string;
    };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('rvf-malinois-api');
    expect(body.version).toBe('F3');
    expect(typeof body.timestamp).toBe('string');
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });
});

describe('METHOD_NOT_ALLOWED on /api/health', () => {
  it('rejects POST/PUT/DELETE/PATCH with 405 + Allow: GET', async () => {
    for (const handler of [POST, PUT, DELETE, PATCH]) {
      const res = handler();
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toContain('GET');
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
    }
  });
});
