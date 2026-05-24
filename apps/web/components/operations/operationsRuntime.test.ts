import { afterEach, describe, expect, it } from 'vitest';

import {
  _resetOperationsTelemetry,
  isOperationsTelemetryRunning,
  startOperationsTelemetry,
  stopOperationsTelemetry,
} from './operationsRuntime';

describe('operationsRuntime (idempotency)', () => {
  afterEach(() => {
    _resetOperationsTelemetry();
  });

  it('starts on first call and reports running', () => {
    expect(isOperationsTelemetryRunning()).toBe(false);
    const started = startOperationsTelemetry();
    expect(started).toBe(true);
    expect(isOperationsTelemetryRunning()).toBe(true);
  });

  it('does not double-start when called twice (ref-counted)', () => {
    startOperationsTelemetry();
    const secondStartActuallyStarted = startOperationsTelemetry();
    expect(secondStartActuallyStarted).toBe(false);
    expect(isOperationsTelemetryRunning()).toBe(true);
  });

  it('survives a single stop when there are two references', () => {
    startOperationsTelemetry();
    startOperationsTelemetry();
    const stoppedFully = stopOperationsTelemetry();
    expect(stoppedFully).toBe(false);
    expect(isOperationsTelemetryRunning()).toBe(true);
  });

  it('tears down on the last stop', () => {
    startOperationsTelemetry();
    stopOperationsTelemetry();
    expect(isOperationsTelemetryRunning()).toBe(false);
  });

  it('stop on a non-running runtime is a no-op', () => {
    const result = stopOperationsTelemetry();
    expect(result).toBe(false);
    expect(isOperationsTelemetryRunning()).toBe(false);
  });
});
