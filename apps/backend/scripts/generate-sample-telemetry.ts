/**
 * F1.5.4 — Sample telemetry generator.
 *
 * Dev-only tool. Reads a job's commissioning snapshot, generates a realistic
 * time-series for each frozen sensor (random walk inside the sensor's range,
 * mostly `good` quality with a sprinkle of `uncertain` and `bad`), validates
 * every generated envelope against TelemetryEnvelopeSchema, and inserts the
 * rows into the `telemetry` hypertable in batches.
 *
 * It is intentionally NOT a NestJS HTTP route (per F1.5 guidance #2 — no dev
 * telemetry endpoints exposed). Runnable only from the host shell:
 *
 *   pnpm --filter @rvf/backend telemetry:sample \
 *        --job JOB-2026-0001 --hours 1 --interval-s 5
 *
 * Flags:
 *   --job          Job code (required). The job must be in_progress.
 *   --hours        Span of synthetic time to generate (default 1).
 *   --interval-s   Sample period in seconds (default 5).
 *   --seq-base     Starting seq value. Generator owns the band
 *                  ≥ 1_000_000 (default). Test fixtures use < 1_000_000.
 *   --source       value_unit override per canonical tag, comma-separated:
 *                  e.g. --alt-units 'p_inlet=kPa,water_cut=ratio'. Useful
 *                  for testing the query-layer unit conversion.
 *
 * Idempotency: each call advances `--seq-base` so re-running the same
 * command never collides with previously-generated rows. The hypertable
 * accepts the new rows alongside any existing data — the adapter layer's
 * job in F2 is to reject duplicates by (unit_id, seq, canonical_tag).
 */

import { parseArgs } from 'node:util';

import { PrismaClient, Quality } from '@prisma/client';

import {
  TELEMETRY_ENVELOPE_SCHEMA,
  type TelemetryEnvelope,
  TelemetryEnvelopeSchema,
} from '../src/telemetry/contracts/envelope';

const BATCH_SIZE = 1000;
const SOURCE_ADAPTER = 'simulator';

// Quality distribution for synthetic data. Mostly good, sometimes flaky,
// rarely outright bad — mirrors what we see in well-test operations.
const QUALITY_WEIGHTS: Array<[Quality, number]> = [
  [Quality.good, 0.94],
  [Quality.estimated, 0.03],
  [Quality.uncertain, 0.02],
  [Quality.bad, 0.01],
];

interface Args {
  job: string;
  hours: number;
  intervalS: number;
  seqBase: number;
  altUnits: Map<string, string>;
}

function parseCliArgs(): Args {
  const { values } = parseArgs({
    options: {
      job: { type: 'string' },
      hours: { type: 'string', default: '1' },
      'interval-s': { type: 'string', default: '5' },
      'seq-base': { type: 'string', default: '1000000' },
      'alt-units': { type: 'string', default: '' },
    },
    strict: true,
  });

  if (!values.job) {
    throw new Error('Missing required --job <code>. Example: --job JOB-2026-0001');
  }

  const altUnits = new Map<string, string>();
  if (values['alt-units']) {
    for (const pair of values['alt-units'].split(',')) {
      const [tag, unit] = pair.split('=').map((s) => s.trim());
      if (tag && unit) altUnits.set(tag, unit);
    }
  }

  return {
    job: values.job,
    hours: Number(values.hours),
    intervalS: Number(values['interval-s']),
    seqBase: Number(values['seq-base']),
    altUnits,
  };
}

function pickQuality(rng: () => number): Quality {
  let acc = 0;
  const r = rng();
  for (const [q, w] of QUALITY_WEIGHTS) {
    acc += w;
    if (r < acc) return q;
  }
  return Quality.good;
}

/** Mulberry32 — small deterministic PRNG so runs are reproducible per seed. */
function rngFromSeed(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random walk inside [low, high] with a soft clamp that bounces off bounds. */
function makeWalker(low: number, high: number, seed: number): () => number {
  const rng = rngFromSeed(seed);
  const range = high - low;
  let v = low + range * (0.3 + rng() * 0.4); // start at 30..70 % of range
  const step = range * 0.005; // 0.5 % of range per tick
  return () => {
    const dir = rng() < 0.5 ? -1 : 1;
    v += dir * step * (0.5 + rng());
    if (v < low) v = low + (low - v);
    if (v > high) v = high - (v - high);
    return v;
  };
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const prisma = new PrismaClient();
  await prisma.$connect();

  try {
    const job = await prisma.job.findUnique({
      where: { code: args.job },
      include: {
        snapshot: {
          include: { sensorSnapshots: { orderBy: { instrumentTag: 'asc' } } },
        },
        equipmentUnit: { select: { code: true } },
      },
    });
    if (!job || !job.snapshot) {
      throw new Error(`Job ${args.job} has no commissioning snapshot.`);
    }
    const sensors = job.snapshot.sensorSnapshots;
    if (sensors.length === 0) {
      throw new Error(`Job ${args.job} snapshot has no sensors.`);
    }

    const startTs = new Date(Date.now() - args.hours * 3_600_000);
    const stepMs = args.intervalS * 1000;
    const totalTicks = Math.floor((args.hours * 3_600_000) / stepMs);

    console.log(
      `Generating ${totalTicks} ticks × ${sensors.length} sensors = ${
        totalTicks * sensors.length
      } samples for ${args.job} (${job.equipmentUnit.code})`,
    );

    // One walker per sensor so each tag has its own smooth random walk.
    const walkers = new Map<string, () => number>();
    for (const s of sensors) {
      const low = s.rangeLow ?? 0;
      const high = s.rangeHigh ?? 100;
      walkers.set(
        s.instrumentTag,
        makeWalker(low, high, hashString(`${args.job}:${s.instrumentTag}`)),
      );
    }
    const qualityRng = rngFromSeed(hashString(`${args.job}:quality`));

    // Stream in batches.
    let batch: Array<{
      ts: Date;
      jobId: string;
      canonicalTagName: string;
      value: number;
      valueUnit: string;
      quality: Quality;
      seq: bigint;
      unitId: string;
      sensorInstrumentTag: string;
      sourceAdapter: string;
    }> = [];
    let inserted = 0;
    let validated = 0;

    for (let tick = 0; tick < totalTicks; tick += 1) {
      const ts = new Date(startTs.getTime() + tick * stepMs);
      const seq = BigInt(args.seqBase + tick);

      // Build the §4 envelope first and validate it. Round-trip catches any
      // schema drift in the generator itself.
      const measurements: TelemetryEnvelope['measurements'] = {};
      for (const s of sensors) {
        const value = walkers.get(s.instrumentTag)!();
        const unit = args.altUnits.get(s.canonicalTagName) ?? s.unit;
        measurements[s.canonicalTagName] = {
          v: roundFloat(value, 3),
          u: unit,
          q: pickQuality(qualityRng),
        };
      }
      const envelope = {
        schema: TELEMETRY_ENVELOPE_SCHEMA,
        unit_id: job.equipmentUnit.code.toLowerCase(),
        well_id: 'CN-014',
        job_id: job.code,
        ts: ts.toISOString(),
        seq: Number(seq),
        measurements,
      };
      const parsed = TelemetryEnvelopeSchema.safeParse(envelope);
      if (!parsed.success) {
        throw new Error(
          `Generator produced an invalid envelope: ${parsed.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')}`,
        );
      }
      validated += 1;

      // Explode envelope → hypertable rows.
      for (const s of sensors) {
        const m = parsed.data.measurements[s.canonicalTagName]!;
        batch.push({
          ts,
          jobId: job.id,
          canonicalTagName: s.canonicalTagName,
          value: m.v,
          valueUnit: m.u,
          quality: m.q,
          seq,
          unitId: job.equipmentUnit.code,
          sensorInstrumentTag: s.instrumentTag,
          sourceAdapter: SOURCE_ADAPTER,
        });
      }

      if (batch.length >= BATCH_SIZE) {
        await prisma.telemetry.createMany({ data: batch, skipDuplicates: true });
        inserted += batch.length;
        process.stdout.write(`  inserted: ${inserted}\r`);
        batch = [];
      }
    }
    if (batch.length > 0) {
      await prisma.telemetry.createMany({ data: batch, skipDuplicates: true });
      inserted += batch.length;
    }

    console.log(
      `\nDone. Envelopes validated: ${validated}. Rows inserted: ${inserted}.\n` +
        `Refresh the continuous aggregates manually if you need populated 1m/15m/1h buckets:\n` +
        `  CALL refresh_continuous_aggregate('telemetry_1m', NULL, NULL);`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function roundFloat(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

main().catch((err: unknown) => {
  console.error('generate-sample-telemetry failed:', err);
  process.exitCode = 1;
});
