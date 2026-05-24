/**
 * sim-demo — F2A end-to-end developer smoke test.
 *
 * Starts the simulated telemetry adapter against the mock active jobs, feeds
 * messages into a fresh TelemetryStore, and logs evolving live values, alarm
 * states, and stale/offline status every second. Stops cleanly after a fixed
 * window so it never lingers in CI.
 *
 * How to run (no extra deps needed if you have a TS-capable runner):
 *
 *   pnpm --filter @rvf/web exec tsx scripts/sim-demo.ts
 *
 *   or
 *
 *   node --import tsx scripts/sim-demo.ts   (Node 22+, with `tsx` available)
 *
 * Not wired into package.json on purpose: this is a developer tool, not a
 * product surface. Add a script entry locally if you want to alias it.
 */
import { evaluateReading } from '../lib/alarms/evaluator';
import { JOB_HP_HF, JOB_LP, JOB_MP, JOB_STALE } from '../lib/jobs/snapshots.mock';
import { computeStaleFromSnapshot } from '../lib/quality/stale';
import { connectAdapter, TelemetryStore } from '../lib/realtime/telemetryStore';
import { SimulatedNormalizedTelemetryAdapter } from '../lib/telemetry/adapters/simulated';
import {
  PROFILE_HP_HF_ALARM,
  PROFILE_LP_NORMAL,
  PROFILE_MP_NORMAL,
  PROFILE_STALE_DRILL,
} from '../lib/telemetry/simulator/profiles';
import { CANONICAL_TAGS } from '../lib/telemetry/tags';

import type { ActiveJobSnapshot } from '../lib/jobs/types';
import type { CanonicalTag } from '@rvf/types';

const RUN_FOR_MS = 12_000;
const PRINT_EVERY_MS = 1_000;

const printRow = (
  label: string,
  job: ActiveJobSnapshot,
  store: TelemetryStore,
  tag: CanonicalTag,
): void => {
  const reading = store.getLatestReading(job.jobId, tag);
  const nowMs = Date.now();
  const stale = computeStaleFromSnapshot({
    jobId: job.jobId,
    tag,
    lastTs: reading?.ts,
    nowMs,
    snapshot: job.snapshot,
  });
  const alarm = reading
    ? evaluateReading(reading, job.snapshot, { nowIso: new Date(nowMs).toISOString() }).state
    : 'no_data';
  const value = reading?.value === null ? 'null' : (reading?.value?.toFixed(2) ?? '—');
  const unit = reading?.unit ?? '';
  const q = reading?.quality ?? '—';
  // eslint-disable-next-line no-console
  console.log(
    `[${label}] ${String(tag).padEnd(14)} v=${String(value).padStart(8)} ${unit.padEnd(7)} q=${q.padEnd(9)} alarm=${alarm.padEnd(13)} stale=${stale.status}`,
  );
};

const main = (): void => {
  const store = new TelemetryStore({ capacityPerTag: 64 });

  const adapter = new SimulatedNormalizedTelemetryAdapter({
    bindings: [
      { job: JOB_HP_HF, profile: PROFILE_HP_HF_ALARM },
      { job: JOB_MP, profile: PROFILE_MP_NORMAL },
      { job: JOB_LP, profile: PROFILE_LP_NORMAL },
      { job: JOB_STALE, profile: PROFILE_STALE_DRILL },
    ],
    seed: 42,
    intervalMs: 500,
    connectionGlitchEveryTicks: 12,
  });

  const disconnect = connectAdapter(store, adapter);
  adapter.start();

  // eslint-disable-next-line no-console
  console.log('--- F2A sim-demo started ---');
  // eslint-disable-next-line no-console
  console.log(`Streaming ${RUN_FOR_MS / 1000}s, printing every ${PRINT_EVERY_MS / 1000}s`);

  const printer = setInterval(() => {
    // eslint-disable-next-line no-console
    console.log('');
    printRow('HP/HF', JOB_HP_HF, store, CANONICAL_TAGS.PInlet);
    printRow('HP/HF', JOB_HP_HF, store, CANONICAL_TAGS.QGas);
    printRow(' MP  ', JOB_MP, store, CANONICAL_TAGS.PInlet);
    printRow(' MP  ', JOB_MP, store, CANONICAL_TAGS.WaterCut);
    printRow(' LP  ', JOB_LP, store, CANONICAL_TAGS.PInlet);
    printRow('STALE', JOB_STALE, store, CANONICAL_TAGS.PInlet);
    // eslint-disable-next-line no-console
    console.log(`conn: ${store.getConnectionStatus().kind}`);
  }, PRINT_EVERY_MS);

  setTimeout(() => {
    clearInterval(printer);
    adapter.stop();
    disconnect();
    // eslint-disable-next-line no-console
    console.log('--- F2A sim-demo finished ---');
  }, RUN_FOR_MS);
};

main();
