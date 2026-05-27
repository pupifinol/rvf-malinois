import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type Env } from '../config/env';

import { RealtimeGateway, tenantRoomName, unitRoomName } from './realtime.gateway';

import type { Socket } from 'socket.io';

/**
 * Mocked-Socket.IO unit tests for RealtimeGateway (F0/F2 scaffold + F4.6E.1
 * subscribe/unsubscribe).
 *
 * Covers:
 *   - existing F0 `connection` greeting + `ping`/`pong` still work
 *   - F4.6E.1 subscribe joins the per-tenant room and any per-unit rooms
 *   - F4.6E.1 unsubscribe leaves the named rooms; bodyless unsubscribe
 *     leaves every fan-out room while preserving the socket-id room
 *   - malformed payloads log and return a typed error ack without
 *     mutating socket rooms
 *   - tenant room naming function is deterministic
 */

const TENANT_A = '00000000-0000-0000-0000-000000000a01';
const TENANT_B = '00000000-0000-0000-0000-000000000b02';
const UNIT_ID_1 = '00000000-0000-0000-0000-000000000d04';
const UNIT_ID_2 = '00000000-0000-0000-0000-000000000d05';
const SOCKET_ID = 'socket-abc-123';

function envFixture(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: 'development',
    BACKEND_HOST: '0.0.0.0',
    BACKEND_PORT: 4000,
    DATABASE_URL: 'postgresql://rvf:rvf_dev_password@localhost:5432/rvf_malinois?schema=public',
    REDIS_URL: 'redis://localhost:6379',
    LOG_LEVEL: 'info',
    ALLOWED_ORIGINS: ['http://localhost:3000'],
    ...overrides,
  };
}

interface FakeSocket {
  id: string;
  rooms: Set<string>;
  emit: ReturnType<typeof vi.fn>;
  join: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
}

function makeFakeSocket(): FakeSocket {
  const rooms = new Set<string>([SOCKET_ID]);
  const emit = vi.fn<(event: string, payload: unknown) => boolean>(() => true);
  const join = vi.fn<(room: string) => void>((room: string) => {
    rooms.add(room);
  });
  const leave = vi.fn<(room: string) => void>((room: string) => {
    rooms.delete(room);
  });
  return { id: SOCKET_ID, rooms, emit, join, leave };
}

function castSocket(s: FakeSocket): Socket {
  return s as unknown as Socket;
}

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;

  beforeEach(() => {
    gateway = new RealtimeGateway(envFixture());
  });

  // --- F0 — connection greeting still fires ---------------------------
  it('handleConnection emits the F0 connection greeting with status=connected', () => {
    const socket = makeFakeSocket();

    gateway.handleConnection(castSocket(socket));

    expect(socket.emit).toHaveBeenCalledTimes(1);
    const call = socket.emit.mock.calls[0];
    expect(call?.[0]).toBe('connection');
    const payload = call?.[1] as { status?: string; since?: string } | undefined;
    expect(payload?.status).toBe('connected');
    expect(typeof payload?.since).toBe('string');
  });

  // --- F0 — ping → pong ----------------------------------------------
  it('handlePing returns a pong with an ISO timestamp', () => {
    const result = gateway.handlePing();

    expect(result.kind).toBe('pong');
    expect(typeof result.ts).toBe('string');
    expect(new Date(result.ts).toString()).not.toBe('Invalid Date');
  });

  // --- F4.6E.1 — subscribe joins per-tenant room only ----------------
  it('subscribe { tenantId } joins the per-tenant room and returns a subscribed ack with no unit rooms', () => {
    const socket = makeFakeSocket();

    const ack = gateway.handleSubscribe({ tenantId: TENANT_A }, castSocket(socket));

    expect(ack).toEqual({
      kind: 'subscribed',
      tenantRoom: tenantRoomName(TENANT_A),
      unitRooms: [],
    });
    expect(socket.join).toHaveBeenCalledTimes(1);
    expect(socket.join).toHaveBeenCalledWith(tenantRoomName(TENANT_A));
    expect(socket.rooms.has(tenantRoomName(TENANT_A))).toBe(true);
  });

  // --- F4.6E.1 — subscribe with unitIds joins per-tenant + per-unit ----
  it('subscribe { tenantId, unitIds } joins the per-tenant room plus a per-unit room for each id', () => {
    const socket = makeFakeSocket();

    const ack = gateway.handleSubscribe(
      { tenantId: TENANT_A, unitIds: [UNIT_ID_1, UNIT_ID_2] },
      castSocket(socket),
    );

    expect(ack).toEqual({
      kind: 'subscribed',
      tenantRoom: tenantRoomName(TENANT_A),
      unitRooms: [unitRoomName(UNIT_ID_1), unitRoomName(UNIT_ID_2)],
    });
    expect(socket.join).toHaveBeenCalledTimes(3);
    expect(socket.rooms.has(tenantRoomName(TENANT_A))).toBe(true);
    expect(socket.rooms.has(unitRoomName(UNIT_ID_1))).toBe(true);
    expect(socket.rooms.has(unitRoomName(UNIT_ID_2))).toBe(true);
  });

  // --- F4.6E.1 — subscribe rejects malformed payloads -----------------
  it('subscribe rejects missing tenantId with a subscribe_error ack and does not join any room', () => {
    const socket = makeFakeSocket();

    const ack = gateway.handleSubscribe({}, castSocket(socket));

    expect(ack.kind).toBe('subscribe_error');
    if (ack.kind === 'subscribe_error') {
      expect(ack.reason).toMatch(/tenantId/);
    }
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('subscribe rejects non-string unitIds entries with a subscribe_error ack and does not join any room', () => {
    const socket = makeFakeSocket();

    const ack = gateway.handleSubscribe(
      { tenantId: TENANT_A, unitIds: [UNIT_ID_1, 42] },
      castSocket(socket),
    );

    expect(ack.kind).toBe('subscribe_error');
    expect(socket.join).not.toHaveBeenCalled();
  });

  // --- F4.6E.1 — unsubscribe leaves named rooms -----------------------
  it('unsubscribe { tenantId } leaves the per-tenant room only', () => {
    const socket = makeFakeSocket();
    socket.rooms.add(tenantRoomName(TENANT_A));
    socket.rooms.add(unitRoomName(UNIT_ID_1));

    const ack = gateway.handleUnsubscribe({ tenantId: TENANT_A }, castSocket(socket));

    expect(ack).toEqual({ kind: 'unsubscribed', rooms: [tenantRoomName(TENANT_A)] });
    expect(socket.leave).toHaveBeenCalledTimes(1);
    expect(socket.leave).toHaveBeenCalledWith(tenantRoomName(TENANT_A));
    // Per-unit room was NOT specified, so it is NOT left.
    expect(socket.rooms.has(unitRoomName(UNIT_ID_1))).toBe(true);
  });

  it('unsubscribe { unitIds } leaves the per-unit rooms only', () => {
    const socket = makeFakeSocket();
    socket.rooms.add(tenantRoomName(TENANT_A));
    socket.rooms.add(unitRoomName(UNIT_ID_1));
    socket.rooms.add(unitRoomName(UNIT_ID_2));

    const ack = gateway.handleUnsubscribe({ unitIds: [UNIT_ID_1, UNIT_ID_2] }, castSocket(socket));

    expect(ack.kind).toBe('unsubscribed');
    if (ack.kind === 'unsubscribed') {
      expect(ack.rooms).toEqual([unitRoomName(UNIT_ID_1), unitRoomName(UNIT_ID_2)]);
    }
    expect(socket.rooms.has(tenantRoomName(TENANT_A))).toBe(true);
    expect(socket.rooms.has(unitRoomName(UNIT_ID_1))).toBe(false);
    expect(socket.rooms.has(unitRoomName(UNIT_ID_2))).toBe(false);
  });

  // --- F4.6E.1 — bodyless unsubscribe leaves every fan-out room -----
  it('unsubscribe with body omitted leaves every fan-out room and preserves the socket-id room', () => {
    const socket = makeFakeSocket();
    socket.rooms.add(tenantRoomName(TENANT_A));
    socket.rooms.add(unitRoomName(UNIT_ID_1));
    socket.rooms.add(unitRoomName(UNIT_ID_2));

    const ack = gateway.handleUnsubscribe(undefined, castSocket(socket));

    expect(ack.kind).toBe('unsubscribed');
    // Every fan-out room was left.
    expect(socket.rooms.has(tenantRoomName(TENANT_A))).toBe(false);
    expect(socket.rooms.has(unitRoomName(UNIT_ID_1))).toBe(false);
    expect(socket.rooms.has(unitRoomName(UNIT_ID_2))).toBe(false);
    // The socket-id room is preserved.
    expect(socket.rooms.has(SOCKET_ID)).toBe(true);
  });

  it('unsubscribe with body of {} also leaves every fan-out room (omitted ≡ no targeting)', () => {
    const socket = makeFakeSocket();
    socket.rooms.add(tenantRoomName(TENANT_B));
    socket.rooms.add(unitRoomName(UNIT_ID_1));

    const ack = gateway.handleUnsubscribe({}, castSocket(socket));

    expect(ack.kind).toBe('unsubscribed');
    expect(socket.rooms.has(tenantRoomName(TENANT_B))).toBe(false);
    expect(socket.rooms.has(unitRoomName(UNIT_ID_1))).toBe(false);
    expect(socket.rooms.has(SOCKET_ID)).toBe(true);
  });

  // --- F4.6E.1 — room naming functions --------------------------------
  it('tenantRoomName and unitRoomName produce the documented deterministic format', () => {
    expect(tenantRoomName(TENANT_A)).toBe(`tenant:${TENANT_A}`);
    expect(unitRoomName(UNIT_ID_1)).toBe(`unit:${UNIT_ID_1}`);
  });
});
