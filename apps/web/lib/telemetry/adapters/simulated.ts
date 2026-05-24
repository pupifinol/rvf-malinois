/**
 * SimulatedNormalizedTelemetryAdapter — F2A.
 *
 * Emits NormalizedTelemetryMessage objects in the shape the real backend will
 * use. Drives one or more jobs at once: each job is bound to an
 * ActiveJobSnapshot + a SimulationProfile that describes how its tags drift.
 *
 * Deterministic when given a fixed seed (`rng`) and a manual tick (`tick()`).
 * Tests use the manual tick; the demo script uses a real timer.
 */
import { connectedNow, disconnected, heartbeat, reconnecting } from '../simulator/connection';
import { driftedSample, makeRng } from '../simulator/drift';

import type { ActiveJobSnapshot } from '../../jobs/types';
import type { AdapterListener, NormalizedTelemetryAdapter } from '../adapter';
import type {
  DataQuality,
  NormalizedTelemetryMessage,
  TelemetryFrame,
  TelemetryReading,
} from '../models';
import type { SimulationProfile, TagDriftEntry } from '../simulator/profiles';
import type { JobId } from '@rvf/types';

export interface SimulatedJobBinding {
  job: ActiveJobSnapshot;
  profile: SimulationProfile;
}

export interface SimulatedAdapterOptions {
  bindings: SimulatedJobBinding[];
  /** Seed for the deterministic PRNG. Default 1. */
  seed?: number;
  /** Override the wall-clock used to stamp messages. Defaults to Date.now. */
  now?: () => number;
  /**
   * When `true` (default), the adapter installs a setInterval. Set `false`
   * for tests — they drive emissions by calling `tick()` manually.
   */
  useTimer?: boolean;
  /** Interval used by `setInterval`. Default 1000ms. */
  intervalMs?: number;
  /** Emit a heartbeat every N ticks. Default every 5. */
  heartbeatEveryTicks?: number;
  /**
   * Drop the connection every N ticks for one tick — useful in the demo.
   * Default 0 (never).
   */
  connectionGlitchEveryTicks?: number;
  /** Quality-mix override applied to all tags lacking their own. */
  defaultQualityMix?: { good: number; estimated: number; uncertain: number; bad: number };
}

const DEFAULT_QUALITY_MIX = { good: 0.94, estimated: 0.03, uncertain: 0.02, bad: 0.01 };

const pickQuality = (
  rng: () => number,
  mix: { good: number; estimated: number; uncertain: number; bad: number },
): DataQuality => {
  const r = rng();
  let acc = mix.good;
  if (r < acc) return 'good';
  acc += mix.estimated;
  if (r < acc) return 'estimated';
  acc += mix.uncertain;
  if (r < acc) return 'uncertain';
  return 'bad';
};

interface JobState {
  job: ActiveJobSnapshot;
  profile: SimulationProfile;
  /** Per-tag sample counter. */
  steps: Map<string, number>;
}

export class SimulatedNormalizedTelemetryAdapter implements NormalizedTelemetryAdapter {
  private readonly listeners = new Set<AdapterListener>();
  private readonly states: JobState[];
  private readonly rng: () => number;
  private readonly now: () => number;
  private readonly useTimer: boolean;
  private readonly intervalMs: number;
  private readonly heartbeatEveryTicks: number;
  private readonly connectionGlitchEveryTicks: number;
  private readonly defaultQualityMix: {
    good: number;
    estimated: number;
    uncertain: number;
    bad: number;
  };

  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private lastDataTs: string | undefined;
  private startedAt: string | undefined;

  constructor(options: SimulatedAdapterOptions) {
    this.states = options.bindings.map((b) => ({
      job: b.job,
      profile: b.profile,
      steps: new Map(),
    }));
    this.rng = makeRng(options.seed ?? 1);
    this.now = options.now ?? (() => Date.now());
    this.useTimer = options.useTimer ?? true;
    this.intervalMs = options.intervalMs ?? 1000;
    this.heartbeatEveryTicks = options.heartbeatEveryTicks ?? 5;
    this.connectionGlitchEveryTicks = options.connectionGlitchEveryTicks ?? 0;
    this.defaultQualityMix = options.defaultQualityMix ?? DEFAULT_QUALITY_MIX;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startedAt = new Date(this.now()).toISOString();
    this.emit(connectedNow(this.startedAt));

    if (this.useTimer) {
      this.timer = setInterval(() => {
        this.tick();
      }, this.intervalMs);
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.emit(disconnected(this.lastDataTs));
  }

  subscribe(listener: AdapterListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Advance the simulator by one cycle. Public so tests can drive deterministically. */
  tick(): void {
    if (!this.running) return;
    this.tickCount += 1;
    const nowIso = new Date(this.now()).toISOString();

    // Optional connection glitch — one-tick disconnect + reconnect.
    if (
      this.connectionGlitchEveryTicks > 0 &&
      this.tickCount % this.connectionGlitchEveryTicks === 0
    ) {
      this.emit(reconnecting(this.lastDataTs));
      this.emit(connectedNow(nowIso));
    }

    for (const state of this.states) {
      if (state.profile.paused) continue;
      const readings = this.buildReadings(state, nowIso);
      if (readings.length === 0) continue;
      const frame: TelemetryFrame = {
        ts: nowIso,
        jobId: state.job.jobId,
        readings,
      };
      this.emit({ kind: 'frame', frame });
      this.lastDataTs = nowIso;
    }

    if (this.tickCount % this.heartbeatEveryTicks === 0) {
      this.emit(heartbeat(nowIso));
    }
  }

  private buildReadings(state: JobState, nowIso: string): TelemetryReading[] {
    const out: TelemetryReading[] = [];
    const enabledTags = new Set(
      state.job.snapshot.sensors.filter((s) => s.enabled).map((s) => s.canonicalTag),
    );

    for (const entry of state.profile.tags) {
      if (entry.pauseEmissions) continue;
      if (!enabledTags.has(entry.tag)) continue;

      const key = String(entry.tag);
      const step = (state.steps.get(key) ?? 0) + 1;
      state.steps.set(key, step);

      const reading = this.buildReading(state.job.jobId, nowIso, entry, step);
      out.push(reading);
    }
    return out;
  }

  private buildReading(
    jobId: JobId,
    nowIso: string,
    entry: TagDriftEntry,
    step: number,
  ): TelemetryReading {
    const quality = pickQuality(this.rng, entry.qualityMix ?? this.defaultQualityMix);
    const raw = driftedSample(step, entry.drift, this.rng);
    const value = quality === 'bad' ? null : Number(raw.toFixed(3));
    return {
      ts: nowIso,
      jobId,
      tag: entry.tag,
      value,
      unit: entry.unit,
      quality,
      seq: step,
    };
  }

  private emit(msg: NormalizedTelemetryMessage): void {
    for (const listener of this.listeners) listener(msg);
  }
}
