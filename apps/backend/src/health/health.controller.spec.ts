import { describe, expect, it } from 'vitest';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports an "ok" status payload', () => {
    const controller = new HealthController();
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('rvf-malinois-backend');
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
  });
});
