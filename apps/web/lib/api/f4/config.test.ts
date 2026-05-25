import { describe, expect, it } from 'vitest';

import { resolveApiBaseUrl, resolveDataSource } from './config';

/**
 * F4.5A — data-source resolution tests.
 *
 * `getDataSource()` / `getApiBaseUrl()` read directly from
 * `process.env.NEXT_PUBLIC_*`. Next.js inlines those at build time, so
 * the runtime test surface is the pure resolver instead. The pure
 * resolvers are exported separately for exactly this reason.
 */

describe('resolveDataSource', () => {
  it('defaults to mock when value is undefined', () => {
    expect(resolveDataSource(undefined)).toBe('mock');
  });

  it('defaults to mock when value is an empty string', () => {
    expect(resolveDataSource('')).toBe('mock');
  });

  it('honors the literal value "mock"', () => {
    expect(resolveDataSource('mock')).toBe('mock');
  });

  it('honors the literal value "api"', () => {
    expect(resolveDataSource('api')).toBe('api');
  });

  it('falls back to mock on unknown / typo values (no throw)', () => {
    expect(resolveDataSource('apii')).toBe('mock');
    expect(resolveDataSource('production')).toBe('mock');
    expect(resolveDataSource('MOCK')).toBe('mock'); // case-sensitive
  });
});

describe('resolveApiBaseUrl', () => {
  it('returns the local-dev default when undefined', () => {
    expect(resolveApiBaseUrl(undefined)).toBe('http://localhost:4000/api/v1');
  });

  it('returns the local-dev default when empty string', () => {
    expect(resolveApiBaseUrl('')).toBe('http://localhost:4000/api/v1');
  });

  it('returns the configured value when set', () => {
    expect(resolveApiBaseUrl('https://api.example.com/api/v1')).toBe(
      'https://api.example.com/api/v1',
    );
  });

  it('strips trailing slashes', () => {
    expect(resolveApiBaseUrl('https://api.example.com/api/v1/')).toBe(
      'https://api.example.com/api/v1',
    );
    expect(resolveApiBaseUrl('https://api.example.com/api/v1///')).toBe(
      'https://api.example.com/api/v1',
    );
  });
});
