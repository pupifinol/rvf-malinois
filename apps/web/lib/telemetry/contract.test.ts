/**
 * Contract tests — F2A.
 *
 * These don't assert anything operational; they pin down the SHAPE of the
 * NormalizedTelemetryMessage. If the simulator stops matching the contract
 * the WebSocket adapter will need to honor in F2D, these will fail loudly.
 */
import { describe, expect, it } from 'vitest';

import { JOB_HP_HF, JOB_MP, JOB_STALE } from '../jobs/snapshots.mock';

import { SimulatedNormalizedTelemetryAdapter } from './adapters/simulated';
import { BackendWebSocketTelemetryAdapter } from './adapters/websocket';
import { PROFILE_HP_HF_NORMAL, PROFILE_MP_NORMAL, PROFILE_STALE_DRILL } from './simulator/profiles';

import type { NormalizedTelemetryAdapter } from './adapter';
import type { NormalizedTelemetryMessage } from './models';

const isValidIso = (s: string): boolean => !Number.isNaN(Date.parse(s));

const assertMessageShape = (msg: NormalizedTelemetryMessage): void => {
  switch (msg.kind) {
    case 'reading':
      expect(typeof msg.reading.jobId).toBe('string');
      expect(typeof msg.reading.tag).toBe('string');
      expect(typeof msg.reading.unit).toBe('string');
      expect(['good', 'estimated', 'uncertain', 'bad']).toContain(msg.reading.quality);
      expect(isValidIso(msg.reading.ts)).toBe(true);
      break;
    case 'frame':
      expect(typeof msg.frame.jobId).toBe('string');
      expect(Array.isArray(msg.frame.readings)).toBe(true);
      expect(isValidIso(msg.frame.ts)).toBe(true);
      for (const r of msg.frame.readings) {
        expect(typeof r.tag).toBe('string');
        expect(typeof r.unit).toBe('string');
        expect(['good', 'estimated', 'uncertain', 'bad']).toContain(r.quality);
      }
      break;
    case 'alarm':
      expect(typeof msg.alarm.jobId).toBe('string');
      expect(msg.alarm.thresholdsSource).toBe('commissioning_snapshot');
      break;
    case 'heartbeat':
      expect(isValidIso(msg.ts)).toBe(true);
      break;
    case 'connection': {
      const s = msg.status;
      expect(['connected', 'reconnecting', 'disconnected']).toContain(s.kind);
      break;
    }
    case 'snapshot-update':
      expect(typeof msg.snapshot.snapshotId).toBe('string');
      break;
  }
};

describe('NormalizedTelemetryMessage contract (simulator emissions)', () => {
  it('emits frames with the canonical reading shape across profiles', () => {
    const captured: NormalizedTelemetryMessage[] = [];
    const adapter = new SimulatedNormalizedTelemetryAdapter({
      bindings: [
        { job: JOB_HP_HF, profile: PROFILE_HP_HF_NORMAL },
        { job: JOB_MP, profile: PROFILE_MP_NORMAL },
        { job: JOB_STALE, profile: PROFILE_STALE_DRILL },
      ],
      seed: 7,
      useTimer: false,
      heartbeatEveryTicks: 2,
    });
    const off = adapter.subscribe((m) => captured.push(m));
    adapter.start();
    for (let i = 0; i < 6; i += 1) adapter.tick();
    adapter.stop();
    off();

    expect(captured.length).toBeGreaterThan(0);
    for (const msg of captured) assertMessageShape(msg);

    // We expect at least one connection (start), at least one heartbeat
    // (heartbeatEveryTicks=2 over 6 ticks), and frames.
    const kinds = new Set(captured.map((m) => m.kind));
    expect(kinds.has('connection')).toBe(true);
    expect(kinds.has('frame')).toBe(true);
    expect(kinds.has('heartbeat')).toBe(true);
  });

  it('omits paused tags from emitted frames', () => {
    const captured: NormalizedTelemetryMessage[] = [];
    const adapter = new SimulatedNormalizedTelemetryAdapter({
      bindings: [{ job: JOB_STALE, profile: PROFILE_STALE_DRILL }],
      seed: 1,
      useTimer: false,
    });
    const off = adapter.subscribe((m) => captured.push(m));
    adapter.start();
    for (let i = 0; i < 4; i += 1) adapter.tick();
    adapter.stop();
    off();

    const tagsSeen = new Set<string>();
    for (const m of captured) {
      if (m.kind === 'frame') for (const r of m.frame.readings) tagsSeen.add(String(r.tag));
    }
    // PROFILE_STALE_DRILL pauses p_inlet, keeps q_total_in flowing.
    expect(tagsSeen.has('p_inlet')).toBe(false);
    expect(tagsSeen.has('q_total_in')).toBe(true);
  });

  it('SimulatedNormalizedTelemetryAdapter conforms to NormalizedTelemetryAdapter', () => {
    const a = new SimulatedNormalizedTelemetryAdapter({
      bindings: [{ job: JOB_HP_HF, profile: PROFILE_HP_HF_NORMAL }],
      useTimer: false,
    });
    expect(typeof a.start).toBe('function');
    expect(typeof a.stop).toBe('function');
    expect(typeof a.subscribe).toBe('function');
  });

  // F2D contract conformance — proves both implementations satisfy the same
  // interface so the factory can pick between them without UI changes.
  it('BackendWebSocketTelemetryAdapter conforms to NormalizedTelemetryAdapter', () => {
    const a: NormalizedTelemetryAdapter = new BackendWebSocketTelemetryAdapter({
      url: 'wss://backend.test/telemetry',
      // Inject no-op timer + socket so construction never reaches the
      // global WebSocket — this test must run in pure Node.
      setTimer: () => 0,
      clearTimer: () => {
        /* test fake */
      },
      createSocket: () => {
        throw new Error('not used in this test');
      },
    });
    expect(typeof a.start).toBe('function');
    expect(typeof a.stop).toBe('function');
    expect(typeof a.subscribe).toBe('function');
  });
});
