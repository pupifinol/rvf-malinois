import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LiveReadingsProjectionService,
  type AcceptedTelemetryProjectionInput,
} from './live-readings-projection.service';

import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Mocked-Prisma unit tests for LiveReadingsProjectionService (F4.6C.1).
 *
 * Covers the F4.6C-0 §16.1 test plan:
 *   1. Creates `live_readings` row on first good telemetry.
 *   2. Updates existing row when incoming timestamp is newer and quality is good.
 *   3. Does not overwrite when incoming timestamp is older (stale).
 *   4. Does not overwrite when timestamp is equal (no tie-break in F4.6C.1).
 *   5. Does not update for quality 'uncertain' (skipped_quality).
 *   6. Does not update for quality 'bad' (skipped_quality).
 *   7. Idempotent reprocessing of the same accepted reading.
 *   8. Handles create P2002 race by retrying the timestamp-gated update.
 *   9. Preserves the projection key (unit_id, sensor_id, canonical_tag_id).
 *
 * The service accepts a `Prisma.TransactionClient` as its second argument so
 * it can participate in the ingestion service's `$transaction`. Tests pass a
 * client-shaped mock cast to `Prisma.TransactionClient` (project's standard
 * mock pattern, see `trends.service.spec.ts`).
 */

const NOW = new Date('2026-05-26T12:00:00.000Z');
const READING_TS = new Date('2026-05-26T11:59:30.000Z');
const OLDER_TS = new Date('2026-05-26T11:00:00.000Z');
const NEWER_TS = new Date('2026-05-26T11:59:45.000Z');

const TENANT_ID = '00000000-0000-0000-0000-000000000a01';
const UNIT_ID = '00000000-0000-0000-0000-000000000d04';
const SENSOR_ID = '00000000-0000-0000-0000-000000000e05';
const CANONICAL_TAG_ID = '00000000-0000-0000-0000-000000000f06';
const READING_ID = '00000000-0000-0000-0000-000000002008';
const READING_ID_OTHER = '00000000-0000-0000-0000-00000000200a';
const LIVE_READING_ID = '00000000-0000-0000-0000-000000004001';

interface UpdateManyArg {
  where: {
    unitId: string;
    sensorId: string;
    canonicalTagId: string;
    timestamp?: { lt: Date };
  };
  data: {
    latestTelemetryReadingId: string;
    value: Prisma.Decimal;
    engineeringUnit: string;
    quality: string;
    timestamp: Date;
    source: string;
    ingestionTimestamp: Date;
  };
}

interface FindUniqueArg {
  where: {
    unitId_sensorId_canonicalTagId: {
      unitId: string;
      sensorId: string;
      canonicalTagId: string;
    };
  };
  select?: { timestamp: true };
}

interface CreateArg {
  data: {
    tenantId: string;
    unitId: string;
    sensorId: string;
    canonicalTagId: string;
    latestTelemetryReadingId: string;
    value: Prisma.Decimal;
    engineeringUnit: string;
    quality: string;
    timestamp: Date;
    source: string;
    ingestionTimestamp: Date;
  };
  select?: { id: true };
}

function makeMocks() {
  const updateMany = vi.fn<(args: UpdateManyArg) => Promise<{ count: number }>>();
  const findUnique = vi.fn<(args: FindUniqueArg) => Promise<{ timestamp: Date } | null>>();
  const create = vi.fn<(args: CreateArg) => Promise<{ id: string }>>();

  const client = {
    liveReading: { updateMany, findUnique, create },
  } as unknown as Prisma.TransactionClient;

  // The service constructor takes PrismaService; tests pass a shaped object.
  const prisma = client as unknown as PrismaService;

  return {
    client,
    prisma,
    mocks: { updateMany, findUnique, create },
  };
}

function fixtureInput(
  overrides: Partial<AcceptedTelemetryProjectionInput> = {},
): AcceptedTelemetryProjectionInput {
  return {
    telemetryReadingId: READING_ID,
    tenantId: TENANT_ID,
    unitId: UNIT_ID,
    sensorId: SENSOR_ID,
    canonicalTagId: CANONICAL_TAG_ID,
    value: new Prisma.Decimal('4123.4'),
    engineeringUnit: 'psi',
    quality: 'good',
    timestamp: READING_TS,
    source: 'manual',
    ingestionTimestamp: NOW,
    ...overrides,
  };
}

function p2002(target: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`Unique constraint failed on ${target}`, {
    code: 'P2002',
    clientVersion: '5.22.0',
    meta: { target },
  });
}

describe('LiveReadingsProjectionService.updateFromAcceptedTelemetry', () => {
  let service: LiveReadingsProjectionService;
  let prisma: PrismaService;
  let client: Prisma.TransactionClient;
  let mocks: ReturnType<typeof makeMocks>['mocks'];

  beforeEach(() => {
    const made = makeMocks();
    prisma = made.prisma;
    client = made.client;
    mocks = made.mocks;
    service = new LiveReadingsProjectionService(prisma);
  });

  // --- 1. Creates row on first good telemetry --------------------------
  it('1. created: empty projection + new good reading writes one live_readings row', async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    mocks.findUnique.mockResolvedValueOnce(null);
    mocks.create.mockResolvedValueOnce({ id: LIVE_READING_ID });

    const result = await service.updateFromAcceptedTelemetry(fixtureInput(), client);

    expect(result).toEqual({ outcome: 'created', liveReadingId: LIVE_READING_ID });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    const createArg = mocks.create.mock.calls[0]?.[0];
    expect(createArg?.data).toMatchObject({
      tenantId: TENANT_ID,
      unitId: UNIT_ID,
      sensorId: SENSOR_ID,
      canonicalTagId: CANONICAL_TAG_ID,
      latestTelemetryReadingId: READING_ID,
      engineeringUnit: 'psi',
      quality: 'good',
      source: 'manual',
    });
    expect(createArg?.data.timestamp.toISOString()).toBe(READING_TS.toISOString());
  });

  // --- 2. Updates when newer timestamp + good --------------------------
  it('2. updated: existing row + newer good reading triggers timestamp-gated update', async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await service.updateFromAcceptedTelemetry(
      fixtureInput({ timestamp: NEWER_TS }),
      client,
    );

    expect(result).toEqual({ outcome: 'updated' });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
    const updateArg = mocks.updateMany.mock.calls[0]?.[0];
    expect(updateArg?.where).toMatchObject({
      unitId: UNIT_ID,
      sensorId: SENSOR_ID,
      canonicalTagId: CANONICAL_TAG_ID,
    });
    expect(updateArg?.where.timestamp).toEqual({ lt: NEWER_TS });
    expect(updateArg?.data.latestTelemetryReadingId).toBe(READING_ID);
  });

  // --- 3. Skipped stale: incoming timestamp is older -------------------
  it('3. skipped_stale: existing row + older incoming reading does not overwrite', async () => {
    // The watermark-gated updateMany returns count: 0 because incoming
    // timestamp is not strictly older than stored. Then findUnique reveals
    // the row exists with a newer stored timestamp.
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    mocks.findUnique.mockResolvedValueOnce({ timestamp: NEWER_TS });

    const result = await service.updateFromAcceptedTelemetry(
      fixtureInput({ timestamp: OLDER_TS }),
      client,
    );

    expect(result).toEqual({ outcome: 'skipped_stale' });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  // --- 4. Skipped equal: same timestamp does not overwrite -------------
  it('4. skipped_equal_timestamp: existing row + equal-timestamp incoming does not overwrite', async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    mocks.findUnique.mockResolvedValueOnce({ timestamp: READING_TS });

    const result = await service.updateFromAcceptedTelemetry(fixtureInput(), client);

    expect(result).toEqual({ outcome: 'skipped_equal_timestamp' });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  // --- 5. Skipped quality: uncertain ----------------------------------
  it('5. skipped_quality: uncertain reading is rejected before any DB call', async () => {
    const result = await service.updateFromAcceptedTelemetry(
      fixtureInput({ quality: 'uncertain' }),
      client,
    );

    expect(result).toEqual({ outcome: 'skipped_quality' });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  // --- 6. Skipped quality: bad ----------------------------------------
  it('6. skipped_quality: bad reading is rejected before any DB call', async () => {
    const result = await service.updateFromAcceptedTelemetry(
      fixtureInput({ quality: 'bad' }),
      client,
    );

    expect(result).toEqual({ outcome: 'skipped_quality' });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  // --- 7. Idempotent reprocessing -------------------------------------
  it('7. idempotent: reprocessing same reading twice ends in the same state', async () => {
    // First call: empty projection → creates row.
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    mocks.findUnique.mockResolvedValueOnce(null);
    mocks.create.mockResolvedValueOnce({ id: LIVE_READING_ID });
    const first = await service.updateFromAcceptedTelemetry(fixtureInput(), client);
    expect(first).toEqual({ outcome: 'created', liveReadingId: LIVE_READING_ID });

    // Second call with identical input: updateMany returns 0 (row exists
    // with equal timestamp), findUnique returns the existing row at the
    // same timestamp → skipped_equal_timestamp. The canonical and projection
    // states are unchanged.
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    mocks.findUnique.mockResolvedValueOnce({ timestamp: READING_TS });
    const second = await service.updateFromAcceptedTelemetry(fixtureInput(), client);
    expect(second).toEqual({ outcome: 'skipped_equal_timestamp' });

    // No second create — projection has exactly one row.
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  // --- 8. P2002 race: retries timestamp-gated update ------------------
  it('8. race-safe: create P2002 triggers retry via timestamp-gated update', async () => {
    // Step 1: updateMany returns 0 (no row yet).
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    // Step 2: findUnique returns null (no row yet).
    mocks.findUnique.mockResolvedValueOnce(null);
    // Step 3: create races and gets P2002.
    mocks.create.mockRejectedValueOnce(p2002('live_readings_unit_sensor_tag_uk'));
    // Race-recovery: updateMany re-runs against the row the other transaction
    // committed first, and succeeds because incoming timestamp > stored.
    mocks.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await service.updateFromAcceptedTelemetry(fixtureInput(), client);

    expect(result).toEqual({ outcome: 'updated' });
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  // --- 8b. P2002 race where the race-creator's row is newer/equal -----
  it('8b. race-safe: P2002 + race-creator row is newer → skipped_stale', async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    mocks.findUnique.mockResolvedValueOnce(null);
    mocks.create.mockRejectedValueOnce(p2002('live_readings_unit_sensor_tag_uk'));
    // Retry update: still 0 because the race-creator row's timestamp is
    // strictly newer than our incoming.
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    // Final findUnique reveals the race-creator row at a newer timestamp.
    mocks.findUnique.mockResolvedValueOnce({ timestamp: NEWER_TS });

    const result = await service.updateFromAcceptedTelemetry(fixtureInput(), client);

    expect(result).toEqual({ outcome: 'skipped_stale' });
  });

  // --- 9. Preserves projection key -----------------------------------
  it('9. key fidelity: updateMany and create both use (unit_id, sensor_id, canonical_tag_id)', async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    mocks.findUnique.mockResolvedValueOnce(null);
    mocks.create.mockResolvedValueOnce({ id: LIVE_READING_ID });

    await service.updateFromAcceptedTelemetry(
      fixtureInput({ telemetryReadingId: READING_ID_OTHER }),
      client,
    );

    expect(mocks.updateMany.mock.calls[0]?.[0].where).toMatchObject({
      unitId: UNIT_ID,
      sensorId: SENSOR_ID,
      canonicalTagId: CANONICAL_TAG_ID,
    });
    expect(mocks.findUnique.mock.calls[0]?.[0].where).toMatchObject({
      unitId_sensorId_canonicalTagId: {
        unitId: UNIT_ID,
        sensorId: SENSOR_ID,
        canonicalTagId: CANONICAL_TAG_ID,
      },
    });
    expect(mocks.create.mock.calls[0]?.[0].data).toMatchObject({
      unitId: UNIT_ID,
      sensorId: SENSOR_ID,
      canonicalTagId: CANONICAL_TAG_ID,
    });
  });

  // --- Bonus: unexpected DB error propagates --------------------------
  it('unexpected DB error from create propagates so the surrounding transaction can roll back', async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    mocks.findUnique.mockResolvedValueOnce(null);
    mocks.create.mockRejectedValueOnce(new Error('database connection lost'));

    await expect(service.updateFromAcceptedTelemetry(fixtureInput(), client)).rejects.toThrow(
      'database connection lost',
    );
  });
});
