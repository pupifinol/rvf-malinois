import { Quality } from '@prisma/client';
import { z } from 'zod';

/**
 * Trend-query contracts (F1.5.3).
 *
 * Two return shapes:
 *   - RawSample[]        when bucket === 'raw'
 *   - BucketAggregate[]  for any non-raw bucket size
 *
 * Both shapes report VALUE IN THE CANONICAL UNIT for the requested tag.
 * Conversion from the stored `value_unit` happens at query time inside
 * TrendsService; storage stays untouched (F1.5 guidance #6 — raw fidelity).
 *
 * QualityMix preserves the per-bucket quality histogram. Aggregate
 * min/max/avg/first/last are computed from `good` samples only
 * (domain-model §14: bad data never gets treated as good). They are null
 * when a bucket has no `good` samples.
 */

// ─── Bucket size ────────────────────────────────────────────────────────────

export const BUCKET_SIZES = ['raw', '1m', '15m', '1h'] as const;
export const BucketSizeSchema = z.enum(BUCKET_SIZES);
export type BucketSize = (typeof BUCKET_SIZES)[number];

// ─── Quality mix ────────────────────────────────────────────────────────────

export const QualityMixSchema = z
  .object({
    good: z.number().int().nonnegative(),
    estimated: z.number().int().nonnegative(),
    uncertain: z.number().int().nonnegative(),
    bad: z.number().int().nonnegative(),
    stale: z.number().int().nonnegative(),
  })
  .strict();
export type QualityMix = z.infer<typeof QualityMixSchema>;

// ─── Raw sample (bucket === 'raw') ──────────────────────────────────────────

export const RawSampleSchema = z
  .object({
    ts: z.date(),
    /** Value already converted to the canonical unit. */
    value: z.number().finite(),
    canonicalUnit: z.string(),
    quality: z.nativeEnum(Quality),
    /** Original unit as stored. Useful when a downstream tool needs to
     *  flag converted-from-non-canonical rows. */
    storedUnit: z.string(),
  })
  .strict();
export type RawSample = z.infer<typeof RawSampleSchema>;

// ─── Aggregate row (bucket === '1m' | '15m' | '1h') ─────────────────────────

export const BucketAggregateSchema = z
  .object({
    bucketStart: z.date(),
    bucketSize: BucketSizeSchema,
    sampleCount: z.number().int().nonnegative(),
    qualityMix: QualityMixSchema,
    /** Computed from `good` samples only. Null when no good samples. */
    valueMin: z.number().finite().nullable(),
    valueMax: z.number().finite().nullable(),
    valueAvg: z.number().finite().nullable(),
    valueFirst: z.number().finite().nullable(),
    valueLast: z.number().finite().nullable(),
    /** Canonical unit. The aggregate is always reported in canonical. */
    canonicalUnit: z.string(),
    /** Original stored unit for this bucket. Mid-job unit drift surfaces as
     *  multiple aggregate rows per bucket — one per storedUnit. */
    storedUnit: z.string(),
  })
  .strict();
export type BucketAggregate = z.infer<typeof BucketAggregateSchema>;

// ─── Query request ──────────────────────────────────────────────────────────

export const TrendQuerySchema = z
  .object({
    jobCode: z.string().min(1).max(64),
    canonicalTagName: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9_]*$/),
    fromTs: z.coerce.date(),
    toTs: z.coerce.date(),
    bucket: BucketSizeSchema.default('raw'),
    /** Hard cap; service refuses larger windows to keep memory bounded. */
    limit: z.number().int().min(1).max(50_000).default(5_000),
  })
  .strict()
  .refine((q) => q.fromTs.getTime() < q.toTs.getTime(), {
    message: 'fromTs must be strictly less than toTs',
    path: ['fromTs'],
  });
export type TrendQuery = z.infer<typeof TrendQuerySchema>;
