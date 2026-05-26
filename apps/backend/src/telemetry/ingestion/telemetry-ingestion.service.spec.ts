import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SystemContext } from '../../common/caller-context';

import { TelemetryIngestionService } from './telemetry-ingestion.service';

import type { IngestTelemetryBatchInput } from './contracts/ingestion';
import type { PrismaService } from '../../prisma/prisma.service';
import type { LiveReadingsProjectionService } from '../projection/live-readings-projection.service';
import type { IntegrationMapping, IntegrationSource } from '@prisma/client';

/**
 * Mocked-Prisma unit tests for TelemetryIngestionService (F4.6B.1).
 *
 * Implements the F4.6B-0 §16 test plan: 22 service-level cases covering each
 * outcome (accepted / duplicate / conflict_quarantined / rejected_quarantined
 * per reason) plus the isolation invariants required by F4.6B-0 §14.2
 * (no live_readings / no alarm_events / no realtime emit / no Jobs reads).
 *
 * Pattern matches `trends.service.spec.ts`: typed `vi.fn()` per Prisma model
 * method, cast as PrismaService, construct the service directly. No live DB.
 *
 * Dedup tests simulate the F4.6A.1 partial unique indexes by throwing
 * `Prisma.PrismaClientKnownRequestError({ code: 'P2002' })` from the mocked
 * `telemetryReading.create`; the boundary's reaction is what we verify.
 */

const NOW = new Date('2026-05-26T12:00:00.000Z');
const RECENT_TS = '2026-05-26T11:59:30.000Z';

const TENANT_ID = '00000000-0000-0000-0000-000000000a01';
const OTHER_TENANT_ID = '00000000-0000-0000-0000-000000000b02';
const SOURCE_ID = '00000000-0000-0000-0000-000000000c03';
const UNIT_ID = '00000000-0000-0000-0000-000000000d04';
const SENSOR_ID = '00000000-0000-0000-0000-000000000e05';
const CANONICAL_TAG_ID = '00000000-0000-0000-0000-000000000f06';
const MAPPING_ID = '00000000-0000-0000-0000-000000001007';
const READING_ID = '00000000-0000-0000-0000-000000002008';
const ERROR_ID = '00000000-0000-0000-0000-000000003009';

// --------------------------------------------------------------------------
// Typed call-shape helpers — keep the inspected fields well-typed so the spec
// stays clear of @typescript-eslint/no-unsafe-* rules.
// --------------------------------------------------------------------------

interface TelemetryReadingCreateArg {
  data: {
    tenantId: string;
    unitId: string;
    sensorId: string;
    canonicalTagId: string;
    integrationSourceId: string;
    timestamp: Date;
    value: Prisma.Decimal;
    engineeringUnit: string;
    quality: string;
    source: string;
    ingestionId: string | null;
    sequence: bigint | null;
    jobId: string | null;
  };
  select?: unknown;
}

interface TelemetryReadingFindFirstArg {
  where: {
    integrationSourceId?: string;
    sensorId?: string;
    canonicalTagId?: string;
    timestamp?: Date;
    sequence?: bigint | null;
  };
}

interface TelemetryIngestionErrorCreateArg {
  data: {
    tenantId: string | null;
    integrationSourceId: string | null;
    integrationMappingId: string | null;
    unitId: string | null;
    sensorId: string | null;
    canonicalTagId: string | null;
    externalIdentifier: string | null;
    timestamp: Date | null;
    reason: string;
    reasonDetail: string | null;
    quality: string | null;
    engineeringUnit: string | null;
    value: Prisma.Decimal | null;
    rawPayload: unknown;
    metadata: unknown;
    correlationId: string | null;
  };
  select?: unknown;
}

interface ExistingTelemetryReading {
  id: string;
  value: Prisma.Decimal;
  engineeringUnit: string;
  quality: string;
  source: string;
  timestamp: Date;
}

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------

function sourceFixture(overrides: Partial<IntegrationSource> = {}): IntegrationSource {
  return {
    id: SOURCE_ID,
    tenantId: TENANT_ID,
    kind: 'manual',
    name: 'RVF Manual Dev Source',
    status: 'active',
    config: {},
    credentialsReference: null,
    createdAt: new Date('2026-05-24T00:00:00.000Z'),
    updatedAt: new Date('2026-05-24T00:00:00.000Z'),
    ...overrides,
  };
}

function mappingFixture(overrides: Partial<IntegrationMapping> = {}): IntegrationMapping {
  return {
    id: MAPPING_ID,
    tenantId: TENANT_ID,
    integrationSourceId: SOURCE_ID,
    externalIdentifier: 'sep-001.pt-inlet',
    unitId: UNIT_ID,
    sensorId: SENSOR_ID,
    canonicalTagId: CANONICAL_TAG_ID,
    engineeringUnitOverride: null,
    transformationReference: null,
    enabled: true,
    createdAt: new Date('2026-05-24T00:00:00.000Z'),
    updatedAt: new Date('2026-05-24T00:00:00.000Z'),
    ...overrides,
  };
}

type SampleInput = IngestTelemetryBatchInput['samples'][number];

function sampleFixture(overrides: Partial<SampleInput> = {}): SampleInput {
  return {
    externalIdentifier: 'sep-001.pt-inlet',
    timestamp: RECENT_TS,
    value: 4123.4,
    engineeringUnit: 'psi',
    quality: 'good',
    sequence: 1001,
    ...overrides,
  };
}

function batchFixture(
  overrides: Partial<IngestTelemetryBatchInput> = {},
): IngestTelemetryBatchInput {
  return {
    integrationSourceId: SOURCE_ID,
    samples: [sampleFixture()],
    ...overrides,
  };
}

// --------------------------------------------------------------------------
// Typed mock harness
// --------------------------------------------------------------------------

function makeMocks() {
  const integrationSourceFindUnique =
    vi.fn<(args: { where: { id: string } }) => Promise<IntegrationSource | null>>();
  const integrationMappingFindUnique = vi.fn<
    (args: {
      where: {
        integrationSourceId_externalIdentifier: {
          integrationSourceId: string;
          externalIdentifier: string;
        };
      };
    }) => Promise<IntegrationMapping | null>
  >();
  const canonicalTagFindUnique = vi.fn<
    (args: { where: { id: string }; select?: unknown }) => Promise<{ canonicalUnit: string } | null>
  >(() => Promise.resolve({ canonicalUnit: 'psi' }));
  const sensorFindMany = vi.fn<(args: unknown) => Promise<{ id: string }[]>>(() =>
    Promise.resolve([]),
  );
  const sensorTagBindingFindFirst = vi.fn<
    (args: unknown) => Promise<{ canonicalTagId: string } | null>
  >(() => Promise.resolve(null));
  const telemetryReadingCreate =
    vi.fn<(args: TelemetryReadingCreateArg) => Promise<{ id: string }>>();
  const telemetryReadingFindFirst =
    vi.fn<(args: TelemetryReadingFindFirstArg) => Promise<ExistingTelemetryReading | null>>();
  const telemetryIngestionErrorCreate = vi.fn<
    (args: TelemetryIngestionErrorCreateArg) => Promise<{ id: string }>
  >(() => Promise.resolve({ id: ERROR_ID }));
  // Isolation guards — must NEVER be called by the ingestion service in
  // F4.6C.1. The projection service is the only authorized writer of
  // `prisma.liveReading.*`; the ingestion service delegates to it via the
  // injected `LiveReadingsProjectionService` mock below, so the ingestion
  // service itself never touches these surfaces.
  const liveReadingCreate = vi.fn<(args: unknown) => Promise<unknown>>();
  const liveReadingUpsert = vi.fn<(args: unknown) => Promise<unknown>>();
  const liveReadingUpdateMany = vi.fn<(args: unknown) => Promise<unknown>>();
  const liveReadingFindUnique = vi.fn<(args: unknown) => Promise<unknown>>();
  const alarmEventCreate = vi.fn<(args: unknown) => Promise<unknown>>();

  const prismaShape = {
    integrationSource: { findUnique: integrationSourceFindUnique },
    integrationMapping: { findUnique: integrationMappingFindUnique },
    canonicalTag: { findUnique: canonicalTagFindUnique },
    sensor: { findMany: sensorFindMany },
    sensorTagBinding: { findFirst: sensorTagBindingFindFirst },
    telemetryReading: {
      create: telemetryReadingCreate,
      findFirst: telemetryReadingFindFirst,
    },
    telemetryIngestionError: { create: telemetryIngestionErrorCreate },
    liveReading: {
      create: liveReadingCreate,
      upsert: liveReadingUpsert,
      updateMany: liveReadingUpdateMany,
      findUnique: liveReadingFindUnique,
    },
    alarmEvent: { create: alarmEventCreate },
  };

  // `$transaction` mock invokes the callback with the same prisma shape so
  // `tx.telemetryReading.create(...)` routes to `telemetryReadingCreate`. The
  // existing F4.6B.1 tests rely on this seam continuing to work — they did
  // not need to know about $transaction; with the mock, they don't need to.
  // The mock also propagates exceptions: if the callback throws, the
  // exception surfaces from `$transaction` so the outer try/catch in the
  // service runs (preserving the dedup classification and the
  // mapping_engine_failure pathway).
  const prismaTransaction = vi.fn(
    async <T>(cb: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> =>
      cb(prismaShape as unknown as Prisma.TransactionClient),
  );

  const prisma = {
    ...prismaShape,
    $transaction: prismaTransaction,
  } as unknown as PrismaService;

  // The injected projection service is mocked so the ingestion service's
  // delegation is observable. F4.6B.1 isolation invariants carry forward:
  // the ingestion service must never call `prisma.liveReading.*` directly.
  const projectionUpdate = vi.fn<(input: unknown, tx?: unknown) => Promise<{ outcome: string }>>(
    () => Promise.resolve({ outcome: 'created' }),
  );
  const projection = {
    updateFromAcceptedTelemetry: projectionUpdate,
  } as unknown as LiveReadingsProjectionService;

  return {
    prisma,
    projection,
    mocks: {
      integrationSourceFindUnique,
      integrationMappingFindUnique,
      canonicalTagFindUnique,
      sensorFindMany,
      sensorTagBindingFindFirst,
      telemetryReadingCreate,
      telemetryReadingFindFirst,
      telemetryIngestionErrorCreate,
      liveReadingCreate,
      liveReadingUpsert,
      liveReadingUpdateMany,
      liveReadingFindUnique,
      alarmEventCreate,
      prismaTransaction,
      projectionUpdate,
    },
  };
}

function p2002(target: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`Unique constraint failed on ${target}`, {
    code: 'P2002',
    clientVersion: '5.22.0',
    meta: { target },
  });
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('TelemetryIngestionService.ingestBatch', () => {
  let prisma: PrismaService;
  let projection: LiveReadingsProjectionService;
  let mocks: ReturnType<typeof makeMocks>['mocks'];
  let service: TelemetryIngestionService;

  beforeEach(() => {
    const made = makeMocks();
    prisma = made.prisma;
    projection = made.projection;
    mocks = made.mocks;
    service = new TelemetryIngestionService(prisma, projection);
  });

  // --- 1. Happy path ------------------------------------------------------
  it('1. accepted: a valid sample inserts one telemetry_readings row with resolved IDs', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(mappingFixture());
    mocks.telemetryReadingCreate.mockResolvedValueOnce({ id: READING_ID });

    const result = await service.ingestBatch(SystemContext, batchFixture(), NOW);

    expect(result.acceptedCount).toBe(1);
    expect(result.results[0]).toEqual({
      sampleIndex: 0,
      outcome: 'accepted',
      telemetryReadingId: READING_ID,
    });
    const createArg = mocks.telemetryReadingCreate.mock.calls[0]?.[0];
    expect(createArg?.data).toMatchObject({
      tenantId: TENANT_ID,
      unitId: UNIT_ID,
      sensorId: SENSOR_ID,
      canonicalTagId: CANONICAL_TAG_ID,
      integrationSourceId: SOURCE_ID,
      engineeringUnit: 'psi',
      quality: 'good',
      source: 'manual',
      ingestionId: 'sep-001.pt-inlet',
      jobId: null,
    });
    expect(createArg?.data.sequence).toBe(BigInt(1001));
  });

  // --- 2. unknown_source --------------------------------------------------
  it('2. rejected_quarantined unknown_source: every sample quarantines with no telemetry insert', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(null);

    const result = await service.ingestBatch(
      SystemContext,
      batchFixture({ samples: [sampleFixture(), sampleFixture()] }),
      NOW,
    );

    expect(result.rejectedQuarantinedCount).toBe(2);
    expect(result.results.every((r) => r.outcome === 'rejected_quarantined')).toBe(true);
    expect(result.results.every((r) => r.reason === 'unknown_source')).toBe(true);
    expect(mocks.telemetryReadingCreate).not.toHaveBeenCalled();
    expect(mocks.telemetryIngestionErrorCreate).toHaveBeenCalledTimes(2);
    const errArg = mocks.telemetryIngestionErrorCreate.mock.calls[0]?.[0];
    expect(errArg?.data).toMatchObject({
      reason: 'unknown_source',
      tenantId: null,
      integrationSourceId: null,
    });
  });

  // --- 3. inactive_context (status !== 'active') --------------------------
  it('3. rejected_quarantined inactive_context: inactive source quarantines every sample', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture({ status: 'inactive' }));

    const result = await service.ingestBatch(SystemContext, batchFixture(), NOW);

    expect(result.rejectedQuarantinedCount).toBe(1);
    expect(result.results[0]?.reason).toBe('inactive_context');
    expect(mocks.telemetryReadingCreate).not.toHaveBeenCalled();
    const errArg = mocks.telemetryIngestionErrorCreate.mock.calls[0]?.[0];
    expect(errArg?.data).toMatchObject({
      reason: 'inactive_context',
      tenantId: TENANT_ID,
      integrationSourceId: SOURCE_ID,
    });
  });

  // --- 4. unknown_mapping -------------------------------------------------
  it('4. rejected_quarantined unknown_mapping: missing IntegrationMapping quarantines per sample', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(null);

    const result = await service.ingestBatch(SystemContext, batchFixture(), NOW);

    expect(result.results[0]?.reason).toBe('unknown_mapping');
    expect(mocks.telemetryReadingCreate).not.toHaveBeenCalled();
  });

  // --- 5. disabled_mapping ------------------------------------------------
  it('5. rejected_quarantined disabled_mapping: enabled=false quarantines without insert', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(mappingFixture({ enabled: false }));

    const result = await service.ingestBatch(SystemContext, batchFixture(), NOW);

    expect(result.results[0]?.reason).toBe('disabled_mapping');
    expect(mocks.telemetryReadingCreate).not.toHaveBeenCalled();
  });

  // --- 6. tenant_mismatch -------------------------------------------------
  it('6. rejected_quarantined tenant_mismatch: mapping tenant != source tenant quarantines', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(
      mappingFixture({ tenantId: OTHER_TENANT_ID }),
    );

    const result = await service.ingestBatch(SystemContext, batchFixture(), NOW);

    expect(result.results[0]?.reason).toBe('tenant_mismatch');
    expect(mocks.telemetryReadingCreate).not.toHaveBeenCalled();
  });

  // --- 7. unresolved_sensor (mapping.sensorId null + no binding match) ---
  it('7. rejected_quarantined unresolved_sensor: zero candidates from active bindings', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(
      mappingFixture({ sensorId: null, canonicalTagId: CANONICAL_TAG_ID }),
    );
    mocks.sensorFindMany.mockResolvedValueOnce([]);

    const result = await service.ingestBatch(SystemContext, batchFixture(), NOW);

    expect(result.results[0]?.reason).toBe('unresolved_sensor');
    expect(mocks.telemetryReadingCreate).not.toHaveBeenCalled();
  });

  // --- 8. unresolved_tag (mapping.canonicalTagId null + no binding) -------
  it('8. rejected_quarantined unresolved_tag: no active SensorTagBinding for the sensor', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(
      mappingFixture({ sensorId: SENSOR_ID, canonicalTagId: null }),
    );
    mocks.sensorTagBindingFindFirst.mockResolvedValueOnce(null);

    const result = await service.ingestBatch(SystemContext, batchFixture(), NOW);

    expect(result.results[0]?.reason).toBe('unresolved_tag');
    expect(mocks.telemetryReadingCreate).not.toHaveBeenCalled();
  });

  // --- 9. mapping_engine_failure (ambiguous sensor resolution) -----------
  it('9. rejected_quarantined mapping_engine_failure: multiple candidate sensors is ambiguous', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(
      mappingFixture({ sensorId: null, canonicalTagId: CANONICAL_TAG_ID }),
    );
    mocks.sensorFindMany.mockResolvedValueOnce([
      { id: SENSOR_ID },
      { id: '00000000-0000-0000-0000-000000099999' },
    ]);

    const result = await service.ingestBatch(SystemContext, batchFixture(), NOW);

    expect(result.results[0]?.reason).toBe('mapping_engine_failure');
    expect(mocks.telemetryReadingCreate).not.toHaveBeenCalled();
  });

  // --- 10. unit_mismatch --------------------------------------------------
  it('10. rejected_quarantined unit_mismatch: sample unit != mapping/canonical unit', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(mappingFixture());
    mocks.canonicalTagFindUnique.mockResolvedValueOnce({ canonicalUnit: 'psi' });

    const result = await service.ingestBatch(
      SystemContext,
      batchFixture({ samples: [sampleFixture({ engineeringUnit: 'kPa' })] }),
      NOW,
    );

    expect(result.results[0]?.reason).toBe('unit_mismatch');
    expect(mocks.telemetryReadingCreate).not.toHaveBeenCalled();
  });

  // --- 11. future_timestamp ----------------------------------------------
  it('11. rejected_quarantined future_timestamp: ts > now + 5 min quarantines', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(mappingFixture());

    const result = await service.ingestBatch(
      SystemContext,
      batchFixture({
        samples: [sampleFixture({ timestamp: '2026-05-26T13:00:00.000Z' })],
      }),
      NOW,
    );

    expect(result.results[0]?.reason).toBe('future_timestamp');
    expect(mocks.telemetryReadingCreate).not.toHaveBeenCalled();
  });

  // --- 12. late_outside_window ------------------------------------------
  it('12. rejected_quarantined late_outside_window: ts older than 7 days quarantines', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(mappingFixture());

    const result = await service.ingestBatch(
      SystemContext,
      batchFixture({
        samples: [sampleFixture({ timestamp: '2026-05-10T12:00:00.000Z' })],
      }),
      NOW,
    );

    expect(result.results[0]?.reason).toBe('late_outside_window');
    expect(mocks.telemetryReadingCreate).not.toHaveBeenCalled();
  });

  // --- 13. duplicate (P2002 + identical existing) -----------------------
  it('13. duplicate: P2002 + identical existing row → outcome duplicate, no quarantine row', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(mappingFixture());
    mocks.telemetryReadingCreate.mockRejectedValueOnce(p2002('telemetry_readings_dedup_seq_uk'));
    mocks.telemetryReadingFindFirst.mockResolvedValueOnce({
      id: READING_ID,
      value: new Prisma.Decimal('4123.4'),
      engineeringUnit: 'psi',
      quality: 'good',
      source: 'manual',
      timestamp: new Date(RECENT_TS),
    });

    const result = await service.ingestBatch(SystemContext, batchFixture(), NOW);

    expect(result.duplicateCount).toBe(1);
    expect(result.results[0]).toEqual({ sampleIndex: 0, outcome: 'duplicate' });
    expect(mocks.telemetryIngestionErrorCreate).not.toHaveBeenCalled();
  });

  // --- 14. conflict_quarantined (P2002 + different value) ----------------
  it('14. conflict_quarantined: P2002 + different value → writes conflict_dedup quarantine row', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(mappingFixture());
    mocks.telemetryReadingCreate.mockRejectedValueOnce(p2002('telemetry_readings_dedup_seq_uk'));
    mocks.telemetryReadingFindFirst.mockResolvedValueOnce({
      id: READING_ID,
      value: new Prisma.Decimal('4000.0'),
      engineeringUnit: 'psi',
      quality: 'good',
      source: 'manual',
      timestamp: new Date(RECENT_TS),
    });

    const result = await service.ingestBatch(SystemContext, batchFixture(), NOW);

    expect(result.conflictQuarantinedCount).toBe(1);
    expect(result.results[0]?.outcome).toBe('conflict_quarantined');
    expect(result.results[0]?.reason).toBe('conflict_dedup');
    expect(mocks.telemetryIngestionErrorCreate).toHaveBeenCalledTimes(1);
    const errArg = mocks.telemetryIngestionErrorCreate.mock.calls[0]?.[0];
    expect(errArg?.data).toMatchObject({ reason: 'conflict_dedup' });
  });

  // --- 15. timestamp dedup path (sequence omitted) ----------------------
  it('15. duplicate via timestamp dedup path: sequence omitted uses ts-based dedup', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(mappingFixture());
    mocks.telemetryReadingCreate.mockRejectedValueOnce(p2002('telemetry_readings_dedup_ts_uk'));
    mocks.telemetryReadingFindFirst.mockResolvedValueOnce({
      id: READING_ID,
      value: new Prisma.Decimal('4123.4'),
      engineeringUnit: 'psi',
      quality: 'good',
      source: 'manual',
      timestamp: new Date(RECENT_TS),
    });

    const noSeq = sampleFixture();
    delete (noSeq as { sequence?: number }).sequence;
    const result = await service.ingestBatch(
      SystemContext,
      batchFixture({ samples: [noSeq] }),
      NOW,
    );

    expect(result.duplicateCount).toBe(1);
    const findFirstArg = mocks.telemetryReadingFindFirst.mock.calls[0]?.[0];
    expect(findFirstArg?.where.sequence).toBeNull();
    expect(findFirstArg?.where.sensorId).toBe(SENSOR_ID);
    expect(findFirstArg?.where.canonicalTagId).toBe(CANONICAL_TAG_ID);
  });

  // --- 16. partial-success batch ------------------------------------------
  it('16. partial success: a batch with mixed outcomes reports per-sample results independently', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique
      .mockResolvedValueOnce(mappingFixture())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mappingFixture());
    mocks.telemetryReadingCreate
      .mockResolvedValueOnce({ id: READING_ID })
      .mockResolvedValueOnce({ id: '00000000-0000-0000-0000-000000099001' });

    const result = await service.ingestBatch(
      SystemContext,
      batchFixture({
        samples: [
          sampleFixture(),
          sampleFixture({ externalIdentifier: 'sep-001.pt-outlet', sequence: 1002 }),
          sampleFixture({ sequence: 1003 }),
        ],
      }),
      NOW,
    );

    expect(result.acceptedCount).toBe(2);
    expect(result.rejectedQuarantinedCount).toBe(1);
    expect(result.results[0]?.outcome).toBe('accepted');
    expect(result.results[1]?.outcome).toBe('rejected_quarantined');
    expect(result.results[1]?.reason).toBe('unknown_mapping');
    expect(result.results[2]?.outcome).toBe('accepted');
  });

  // --- 17. isolation: ingestion service never calls prisma.liveReading.* --
  it('17. isolation: ingestion service does not call prisma.liveReading.* directly (delegates to projection)', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(mappingFixture());
    mocks.telemetryReadingCreate.mockResolvedValueOnce({ id: READING_ID });

    await service.ingestBatch(SystemContext, batchFixture(), NOW);

    // The ingestion service delegates live-readings writes to the injected
    // `LiveReadingsProjectionService` (F4.6C.1). It must never touch
    // `prisma.liveReading.*` directly — that's the projection service's job.
    expect(mocks.liveReadingCreate).not.toHaveBeenCalled();
    expect(mocks.liveReadingUpsert).not.toHaveBeenCalled();
    expect(mocks.liveReadingUpdateMany).not.toHaveBeenCalled();
    expect(mocks.liveReadingFindUnique).not.toHaveBeenCalled();
  });

  // --- 18. isolation: no alarm_events writes ----------------------------
  it('18. isolation: service does not call any alarm_events mutation', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(mappingFixture());
    mocks.telemetryReadingCreate.mockResolvedValueOnce({ id: READING_ID });

    await service.ingestBatch(SystemContext, batchFixture(), NOW);

    expect(mocks.alarmEventCreate).not.toHaveBeenCalled();
  });

  // --- 19. isolation: no realtime/WebSocket dependency ------------------
  it('19. isolation: service does not reference realtime/WebSocket prisma surfaces', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(mappingFixture());
    mocks.telemetryReadingCreate.mockResolvedValueOnce({ id: READING_ID });

    await service.ingestBatch(SystemContext, batchFixture(), NOW);

    // None of the live/alarm guards was touched. Any future regression that
    // wires projection/alarm into the boundary would call these mocks and
    // fail this assertion.
    expect(mocks.liveReadingCreate).not.toHaveBeenCalled();
    expect(mocks.alarmEventCreate).not.toHaveBeenCalled();
  });

  // --- 20. isolation: no Jobs lookup or write ---------------------------
  it('20. isolation: service does not look up or write Jobs / CommissioningSnapshot', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(mappingFixture());
    mocks.telemetryReadingCreate.mockResolvedValueOnce({ id: READING_ID });

    await service.ingestBatch(SystemContext, batchFixture(), NOW);

    const createArg = mocks.telemetryReadingCreate.mock.calls[0]?.[0];
    expect(createArg?.data.jobId).toBeNull();
  });

  // --- 21. CallerContext ignored for tenant resolution ------------------
  it('21. tenant scoping: ctx.tenantId is ignored; tenant comes from IntegrationSource', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(mappingFixture());
    mocks.telemetryReadingCreate.mockResolvedValueOnce({ id: READING_ID });

    await service.ingestBatch({ tenantId: OTHER_TENANT_ID }, batchFixture(), NOW);

    const createArg = mocks.telemetryReadingCreate.mock.calls[0]?.[0];
    expect(createArg?.data.tenantId).toBe(TENANT_ID);
    expect(createArg?.data.tenantId).not.toBe(OTHER_TENANT_ID);
  });

  // --- 22. SensorTagBinding fallback resolution path -------------------
  it('22. mapping with null canonicalTagId → resolves via active SensorTagBinding', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(
      mappingFixture({ canonicalTagId: null }),
    );
    mocks.sensorTagBindingFindFirst.mockResolvedValueOnce({ canonicalTagId: CANONICAL_TAG_ID });
    mocks.telemetryReadingCreate.mockResolvedValueOnce({ id: READING_ID });

    const result = await service.ingestBatch(SystemContext, batchFixture(), NOW);

    expect(result.acceptedCount).toBe(1);
    const createArg = mocks.telemetryReadingCreate.mock.calls[0]?.[0];
    expect(createArg?.data.canonicalTagId).toBe(CANONICAL_TAG_ID);
  });

  // =========================================================================
  // F4.6C.1 — projection integration tests
  // =========================================================================

  // --- 23. accepted + good → projection updater invoked once -----------
  it('23. F4.6C.1: accepted good sample calls the projection updater once with the resolved IDs', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(mappingFixture());
    mocks.telemetryReadingCreate.mockResolvedValueOnce({ id: READING_ID });

    const result = await service.ingestBatch(SystemContext, batchFixture(), NOW);

    expect(result.acceptedCount).toBe(1);
    expect(mocks.projectionUpdate).toHaveBeenCalledTimes(1);
    const projectionArg = mocks.projectionUpdate.mock.calls[0]?.[0] as {
      telemetryReadingId: string;
      tenantId: string;
      unitId: string;
      sensorId: string;
      canonicalTagId: string;
      quality: string;
      source: string;
      engineeringUnit: string;
    };
    expect(projectionArg).toMatchObject({
      telemetryReadingId: READING_ID,
      tenantId: TENANT_ID,
      unitId: UNIT_ID,
      sensorId: SENSOR_ID,
      canonicalTagId: CANONICAL_TAG_ID,
      quality: 'good',
      source: 'manual',
      engineeringUnit: 'psi',
    });
    // The projection update call participates in the same per-sample
    // transaction as the canonical insert: the second argument is the `tx`
    // client the $transaction mock passes through.
    expect(mocks.projectionUpdate.mock.calls[0]?.[1]).toBeDefined();
  });

  // --- 24. accepted + uncertain → projection NOT called ---------------
  it('24. F4.6C.1: accepted uncertain sample does not call the projection updater', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(mappingFixture());
    mocks.telemetryReadingCreate.mockResolvedValueOnce({ id: READING_ID });

    await service.ingestBatch(
      SystemContext,
      batchFixture({ samples: [sampleFixture({ quality: 'uncertain' })] }),
      NOW,
    );

    expect(mocks.projectionUpdate).not.toHaveBeenCalled();
  });

  // --- 25. accepted + bad → projection NOT called ---------------------
  it('25. F4.6C.1: accepted bad sample does not call the projection updater', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(mappingFixture());
    mocks.telemetryReadingCreate.mockResolvedValueOnce({ id: READING_ID });

    await service.ingestBatch(
      SystemContext,
      batchFixture({ samples: [sampleFixture({ quality: 'bad' })] }),
      NOW,
    );

    expect(mocks.projectionUpdate).not.toHaveBeenCalled();
  });

  // --- 26. unknown_source → projection NOT called ---------------------
  it('26. F4.6C.1: unknown source quarantine does not call the projection updater', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(null);

    await service.ingestBatch(SystemContext, batchFixture(), NOW);

    expect(mocks.projectionUpdate).not.toHaveBeenCalled();
  });

  // --- 27. duplicate (P2002) → projection NOT called ------------------
  it('27. F4.6C.1: duplicate outcome does not call the projection updater', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(mappingFixture());
    mocks.telemetryReadingCreate.mockRejectedValueOnce(p2002('telemetry_readings_dedup_seq_uk'));
    mocks.telemetryReadingFindFirst.mockResolvedValueOnce({
      id: READING_ID,
      value: new Prisma.Decimal('4123.4'),
      engineeringUnit: 'psi',
      quality: 'good',
      source: 'manual',
      timestamp: new Date(RECENT_TS),
    });

    const result = await service.ingestBatch(SystemContext, batchFixture(), NOW);

    expect(result.duplicateCount).toBe(1);
    expect(mocks.projectionUpdate).not.toHaveBeenCalled();
  });

  // --- 28. conflict_quarantined → projection NOT called ---------------
  it('28. F4.6C.1: conflict_quarantined outcome does not call the projection updater', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(mappingFixture());
    mocks.telemetryReadingCreate.mockRejectedValueOnce(p2002('telemetry_readings_dedup_seq_uk'));
    mocks.telemetryReadingFindFirst.mockResolvedValueOnce({
      id: READING_ID,
      value: new Prisma.Decimal('4000.0'),
      engineeringUnit: 'psi',
      quality: 'good',
      source: 'manual',
      timestamp: new Date(RECENT_TS),
    });

    const result = await service.ingestBatch(SystemContext, batchFixture(), NOW);

    expect(result.conflictQuarantinedCount).toBe(1);
    expect(mocks.projectionUpdate).not.toHaveBeenCalled();
  });

  // --- 29. rejected_quarantined (unknown_mapping) → projection NOT called
  it('29. F4.6C.1: unknown_mapping quarantine does not call the projection updater', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(null);

    const result = await service.ingestBatch(SystemContext, batchFixture(), NOW);

    expect(result.results[0]?.reason).toBe('unknown_mapping');
    expect(mocks.projectionUpdate).not.toHaveBeenCalled();
  });

  // --- 30. projection failure → rollback + mapping_engine_failure -----
  it('30. F4.6C.1: projection failure inside the transaction rolls back and quarantines as mapping_engine_failure', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(mappingFixture());
    mocks.telemetryReadingCreate.mockResolvedValueOnce({ id: READING_ID });
    mocks.projectionUpdate.mockRejectedValueOnce(
      new Error('projection update failed: simulated DB error'),
    );

    const result = await service.ingestBatch(SystemContext, batchFixture(), NOW);

    // The transaction rolls back (verified by the mock $transaction
    // propagating the rejection from the callback). The outer try/catch in
    // the ingestion service treats a non-P2002 throw as
    // `mapping_engine_failure`. The canonical row counts as "not committed"
    // for batch purposes — outcome is rejected_quarantined.
    expect(result.acceptedCount).toBe(0);
    expect(result.rejectedQuarantinedCount).toBe(1);
    expect(result.results[0]?.outcome).toBe('rejected_quarantined');
    expect(result.results[0]?.reason).toBe('mapping_engine_failure');
    // A quarantine row is written by the outer catch path.
    expect(mocks.telemetryIngestionErrorCreate).toHaveBeenCalledTimes(1);
    expect(mocks.telemetryIngestionErrorCreate.mock.calls[0]?.[0].data.reason).toBe(
      'mapping_engine_failure',
    );
  });

  // --- 31. $transaction wraps create + projection ---------------------
  it('31. F4.6C.1: canonical insert and projection update participate in the same $transaction', async () => {
    mocks.integrationSourceFindUnique.mockResolvedValueOnce(sourceFixture());
    mocks.integrationMappingFindUnique.mockResolvedValueOnce(mappingFixture());
    mocks.telemetryReadingCreate.mockResolvedValueOnce({ id: READING_ID });

    await service.ingestBatch(SystemContext, batchFixture(), NOW);

    // $transaction was invoked exactly once for the single accepted sample.
    expect(mocks.prismaTransaction).toHaveBeenCalledTimes(1);
    // Inside the transaction, both the canonical insert and the projection
    // update happened.
    expect(mocks.telemetryReadingCreate).toHaveBeenCalledTimes(1);
    expect(mocks.projectionUpdate).toHaveBeenCalledTimes(1);
  });
});
