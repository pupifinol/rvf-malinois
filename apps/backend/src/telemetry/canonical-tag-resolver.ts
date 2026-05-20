import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type EngineeringUnitClass, JobStatus, type SensorType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

/**
 * The interpretation context for one inbound measurement.
 *
 * Returned BY VALUE from the frozen JobSensorSnapshot, never from the live
 * catalog (ADR-003/004 / domain-model §28). Same row will resolve the same
 * forever; that's why the cache is safe.
 */
export interface ResolvedTag {
  jobId: string;
  unitId: string;
  instrumentTag: string;
  sensorType: SensorType;
  canonicalTagName: string;
  /** Canonical unit per the frozen snapshot (NOT the live CanonicalTag). */
  canonicalUnit: string;
  unitClass: EngineeringUnitClass;
  rangeLow: number | null;
  rangeHigh: number | null;
  /** Snapshot's alarm envelope for this tag, if commissioning captured one. */
  alarmLimits: Record<string, number> | null;
}

interface CacheEntry {
  value: ResolvedTag;
  /** Used to enforce a max-age TTL — defends against stale entries piling up
   *  if a unit's active job ever changes mid-cache-lifetime. */
  insertedAt: number;
  lastAccessedAt: number;
}

const DEFAULT_CACHE_LIMIT = 4096; // tags × jobs
const IDLE_TTL_MS = 60 * 60 * 1000; // 1 h since last access

/**
 * CanonicalTagResolver — given (unit_id, instrument_tag), returns the
 * frozen interpretation context for that unit's currently-active job.
 *
 * The lookup is exactly the path domain-model §29 calls "the only bridge"
 * between a raw reading and its meaning:
 *   sensor (P&ID tag) → EquipmentUnit
 *      → active Job for that unit (status = in_progress)
 *      → CommissioningSnapshot
 *      → JobSensorSnapshot matching the instrument_tag
 *
 * Cache strategy (F1.5 guidance #4 — start simple, no Redis):
 * In-memory Map keyed by `${jobId}::${instrumentTag}`. Snapshots are
 * immutable, so a hit is *correct forever for that job*. We still bound
 * memory with an LRU cap + an idle-TTL eviction so closed jobs don't pin
 * RAM. The cache is per-process; if the backend is scaled out, each replica
 * warms its own.
 */
@Injectable()
export class CanonicalTagResolver {
  private readonly logger = new Logger(CanonicalTagResolver.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheLimit: number;

  constructor(
    private readonly prisma: PrismaService,
    options?: { cacheLimit?: number },
  ) {
    this.cacheLimit = options?.cacheLimit ?? DEFAULT_CACHE_LIMIT;
  }

  /**
   * Resolve via the active job. Throws if no job is `in_progress` on this
   * unit (per §29 — without job, the reading is orphan; never accept it
   * silently).
   */
  async resolveByUnitAndInstrumentTag(unitId: string, instrumentTag: string): Promise<ResolvedTag> {
    const activeJob = await this.findActiveJob(unitId);
    return this.resolveByJobAndInstrumentTag(activeJob.id, instrumentTag);
  }

  /**
   * Resolve when the caller already knows the job. Idempotent and cacheable.
   * Use this path from ingestion adapters that received the job_id in the
   * envelope — it skips the active-job lookup and is the hot path for trend
   * queries reading from `JobSensorSnapshot`.
   */
  async resolveByJobAndInstrumentTag(jobId: string, instrumentTag: string): Promise<ResolvedTag> {
    const key = cacheKey(jobId, instrumentTag);
    const cached = this.cacheRead(key);
    if (cached) return cached;

    const row = await this.prisma.jobSensorSnapshot.findFirst({
      where: {
        instrumentTag,
        snapshot: { jobId },
      },
      include: { snapshot: { select: { jobId: true } } },
    });
    if (!row) {
      throw new NotFoundException(
        `No commissioning-snapshot entry for instrument tag '${instrumentTag}' on job '${jobId}'.`,
      );
    }

    // Fetch the unit_id once (joined through the job → equipmentUnit).
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { equipmentUnit: { select: { code: true } } },
    });
    if (!job) {
      throw new NotFoundException(`Job '${jobId}' not found.`);
    }

    const resolved: ResolvedTag = {
      jobId,
      unitId: job.equipmentUnit.code,
      instrumentTag: row.instrumentTag,
      sensorType: row.sensorType,
      canonicalTagName: row.canonicalTagName,
      canonicalUnit: row.unit,
      unitClass: row.unitClass,
      rangeLow: row.rangeLow,
      rangeHigh: row.rangeHigh,
      alarmLimits:
        row.alarmLimits && typeof row.alarmLimits === 'object'
          ? (row.alarmLimits as Record<string, number>)
          : null,
    };
    this.cacheWrite(key, resolved);
    return resolved;
  }

  /** Invalidate every cached entry for a job. Call when a job is closed —
   *  reduces idle-TTL noise from never-needed entries. */
  invalidateJob(jobId: string): void {
    const prefix = `${jobId}::`;
    let removed = 0;
    for (const k of this.cache.keys()) {
      if (k.startsWith(prefix)) {
        this.cache.delete(k);
        removed += 1;
      }
    }
    if (removed > 0) {
      this.logger.log(`Resolver cache invalidated for job ${jobId} (${removed} entries).`);
    }
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private async findActiveJob(unitId: string): Promise<{ id: string }> {
    const unit = await this.prisma.equipmentUnit.findUnique({
      where: { code: unitId },
      select: { id: true },
    });
    if (!unit) {
      throw new NotFoundException(`Equipment unit '${unitId}' not found.`);
    }

    const candidates = await this.prisma.job.findMany({
      where: {
        equipmentUnitId: unit.id,
        status: JobStatus.in_progress,
      },
      select: { id: true, code: true },
      orderBy: { startedAt: 'desc' },
    });

    if (candidates.length === 0) {
      throw new NotFoundException(
        `No in_progress job on equipment unit '${unitId}'. A reading without a job is orphan (domain-model §29).`,
      );
    }
    if (candidates.length > 1) {
      throw new ConflictException(
        `Multiple in_progress jobs on equipment unit '${unitId}': ${candidates
          .map((c) => c.code)
          .join(', ')}. Resolution requires manual operator intervention.`,
      );
    }
    const [job] = candidates;
    if (!job) {
      // Unreachable — guarded by the length check above. Defence-in-depth +
      // TypeScript narrowing.
      throw new NotFoundException(`Active-job lookup raced for unit '${unitId}'.`);
    }
    return { id: job.id };
  }

  private cacheRead(key: string): ResolvedTag | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.lastAccessedAt > IDLE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    // Re-insert to move to "most recently used" position (Map preserves
    // insertion order, so this is enough for plain LRU semantics).
    this.cache.delete(key);
    entry.lastAccessedAt = Date.now();
    this.cache.set(key, entry);
    return entry.value;
  }

  private cacheWrite(key: string, value: ResolvedTag): void {
    const now = Date.now();
    if (this.cache.size >= this.cacheLimit) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { value, insertedAt: now, lastAccessedAt: now });
  }
}

const cacheKey = (jobId: string, instrumentTag: string): string => `${jobId}::${instrumentTag}`;
