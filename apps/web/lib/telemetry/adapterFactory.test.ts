import { describe, expect, it } from 'vitest';

import { createTelemetryAdapter, getTelemetryAdapterConfig } from './adapterFactory';
import { SimulatedNormalizedTelemetryAdapter } from './adapters/simulated';
import { BackendWebSocketTelemetryAdapter } from './adapters/websocket';

import { JOB_HP_HF } from '@/lib/jobs/snapshots.mock';
import { PROFILE_HP_HF_NORMAL } from '@/lib/telemetry/simulator/profiles';

const bindings = [{ job: JOB_HP_HF, profile: PROFILE_HP_HF_NORMAL }];

describe('adapterFactory — config resolution', () => {
  it('defaults to simulated when env is empty', () => {
    const cfg = getTelemetryAdapterConfig({ telemetrySource: '', telemetryWsUrl: '' });
    expect(cfg.source).toBe('simulated');
    expect(cfg.fellBackToSimulator).toBe(false);
  });

  it('defaults to simulated for unknown sources', () => {
    const cfg = getTelemetryAdapterConfig({
      telemetrySource: 'mqtt',
      telemetryWsUrl: 'wss://example.test',
    });
    expect(cfg.source).toBe('simulated');
  });

  it('selects websocket when source=websocket and URL is set', () => {
    const cfg = getTelemetryAdapterConfig({
      telemetrySource: 'websocket',
      telemetryWsUrl: 'wss://backend.test/telemetry',
    });
    expect(cfg.source).toBe('websocket');
    expect(cfg.wsUrl).toBe('wss://backend.test/telemetry');
    expect(cfg.fellBackToSimulator).toBe(false);
  });

  it('falls back to simulated when source=websocket but URL is missing', () => {
    const cfg = getTelemetryAdapterConfig({
      telemetrySource: 'websocket',
      telemetryWsUrl: '',
    });
    expect(cfg.source).toBe('simulated');
    expect(cfg.fellBackToSimulator).toBe(true);
  });

  it('is case-insensitive on the source label', () => {
    const cfg = getTelemetryAdapterConfig({
      telemetrySource: 'WebSocket',
      telemetryWsUrl: 'wss://example',
    });
    expect(cfg.source).toBe('websocket');
  });
});

describe('adapterFactory — createTelemetryAdapter()', () => {
  it('builds a SimulatedNormalizedTelemetryAdapter by default', () => {
    const { adapter, config } = createTelemetryAdapter({ bindings });
    expect(adapter).toBeInstanceOf(SimulatedNormalizedTelemetryAdapter);
    expect(config.source).toBe('simulated');
  });

  it('builds a BackendWebSocketTelemetryAdapter when config selects websocket', () => {
    const { adapter, config } = createTelemetryAdapter({
      bindings,
      config: {
        source: 'websocket',
        wsUrl: 'wss://backend.test/telemetry',
        fellBackToSimulator: false,
      },
    });
    expect(adapter).toBeInstanceOf(BackendWebSocketTelemetryAdapter);
    expect((adapter as BackendWebSocketTelemetryAdapter).getUrl()).toBe(
      'wss://backend.test/telemetry',
    );
    expect(config.source).toBe('websocket');
  });

  it('produced adapters conform to the NormalizedTelemetryAdapter surface', () => {
    const a = createTelemetryAdapter({ bindings }).adapter;
    expect(typeof a.start).toBe('function');
    expect(typeof a.stop).toBe('function');
    expect(typeof a.subscribe).toBe('function');

    const b = createTelemetryAdapter({
      bindings,
      config: { source: 'websocket', wsUrl: 'wss://x', fellBackToSimulator: false },
    }).adapter;
    expect(typeof b.start).toBe('function');
    expect(typeof b.stop).toBe('function');
    expect(typeof b.subscribe).toBe('function');
  });
});
