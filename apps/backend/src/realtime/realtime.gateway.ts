import { Inject, Logger } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import { ENV_TOKEN, type Env } from '../config/env';

import type {
  ConnectionState,
  SubscribeF4Acknowledgement,
  SubscribeF4Error,
  UnsubscribeF4Acknowledgement,
} from '@rvf/types';
import type { Server, Socket } from 'socket.io';

/**
 * Realtime WebSocket gateway.
 *
 * F0 / F2 foundation, extended by F4.6E.1 with subscribe / unsubscribe
 * handlers for per-tenant fan-out rooms.
 *
 * Boots the Socket.IO stack under Docker and accepts connections. The
 * F4.6E.1 emission path (in `RealtimeEmitterService`) targets the per-tenant
 * rooms managed by this gateway.
 *
 * What this gateway still does NOT do (project-wide posture, not F4.6E.1
 * scope):
 *   - authenticate the connection (deferred to candidate ADR-009 +
 *     dedicated phase; F4.6E.1 inherits the no-auth posture intentionally).
 *   - touch the database or any business module directly.
 *   - emit business events itself — `RealtimeEmitterService` owns emission
 *     and is invoked from `TelemetryIngestionService` AFTER the per-sample
 *     `prisma.$transaction` resolves.
 *
 * Engineering doc §13: a single multiplexed connection, scope enforced by
 * the server, catch-up after reconnect.
 */
@WebSocketGateway({
  // CORS for Socket.IO. Same allowed origins as the HTTP API.
  cors: { origin: true, credentials: true },
  // Tag the namespace so we can introduce others later (e.g. admin).
  namespace: '/realtime',
  // Path stays under /api/v1 to align with the HTTP API versioning.
  path: '/api/v1/stream',
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(@Inject(ENV_TOKEN) private readonly env: Env) {}

  afterInit(): void {
    this.logger.log(
      `Realtime gateway initialised. Allowed origins: ${this.env.ALLOWED_ORIGINS.join(', ')}`,
    );
  }

  handleConnection(client: Socket): void {
    this.logger.log(`Realtime client connected: ${client.id}`);
    const state: ConnectionState = { status: 'connected', since: new Date().toISOString() };
    client.emit('connection', state);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Realtime client disconnected: ${client.id}`);
  }

  /**
   * Echo-style ping. Useful when a developer wants to confirm the socket is
   * alive without spinning up the full subscription protocol.
   */
  @SubscribeMessage('ping')
  handlePing(): { kind: 'pong'; ts: string } {
    return { kind: 'pong', ts: new Date().toISOString() };
  }

  /**
   * F4.6E.1 subscribe — join the per-tenant room and (optionally) per-unit
   * rooms.
   *
   * Body shape: `{ tenantId: string, unitIds?: string[] }`. The acknowledgement
   * returned via the Socket.IO callback names the rooms the socket joined.
   *
   * Scope validation is a forward-compat seam — F4.6E.1 inherits the
   * project-wide no-auth posture and trusts the requested `tenantId`. A
   * future auth phase replaces the trivial validation here without changing
   * the wire shape.
   *
   * Per F4.6E-0 §9.1, F4.6E.1 emits ONLY to the per-tenant room. Per-unit
   * rooms are joined as a forward-compat seam for a future per-unit emit
   * target; today an `unit:...` room receives no events.
   */
  @SubscribeMessage('subscribe')
  handleSubscribe(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ): SubscribeF4Acknowledgement | SubscribeF4Error {
    const parsed = parseSubscribeBody(body);
    if (!parsed.ok) {
      this.logger.warn(
        { socketId: client.id, reason: parsed.reason },
        'realtime_subscribe_malformed',
      );
      return { kind: 'subscribe_error', reason: parsed.reason };
    }

    const tenantRoom = tenantRoomName(parsed.tenantId);
    const unitRooms = parsed.unitIds.map(unitRoomName);

    // Socket.IO `join` / `leave` return `Promise<void>` when the active
    // adapter is async (e.g. Redis). The in-memory adapter is sync. F4.6E.1
    // uses the in-memory adapter; intentionally fire-and-forget on async
    // adapters (the ack returns immediately after issuing the join requests).
    void client.join(tenantRoom);
    for (const room of unitRooms) {
      void client.join(room);
    }

    this.logger.log({ socketId: client.id, tenantRoom, unitRooms }, 'realtime_subscribe');
    return { kind: 'subscribed', tenantRoom, unitRooms };
  }

  /**
   * F4.6E.1 unsubscribe — leave the per-tenant room and (optionally)
   * per-unit rooms. If BOTH `tenantId` and `unitIds` are omitted, leaves
   * every fan-out room the socket has joined.
   *
   * Returns an acknowledgement naming the rooms the socket left.
   */
  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ): UnsubscribeF4Acknowledgement | SubscribeF4Error {
    const parsed = parseUnsubscribeBody(body);
    if (!parsed.ok) {
      this.logger.warn(
        { socketId: client.id, reason: parsed.reason },
        'realtime_unsubscribe_malformed',
      );
      return { kind: 'subscribe_error', reason: parsed.reason };
    }

    let rooms: string[];
    if (parsed.leaveAll) {
      // `client.rooms` always contains the socket id room; leave only
      // fan-out rooms (tenant:* / unit:*) and keep the socket id room.
      rooms = [...client.rooms].filter((r) => r.startsWith('tenant:') || r.startsWith('unit:'));
      for (const room of rooms) {
        void client.leave(room);
      }
    } else {
      rooms = [];
      if (parsed.tenantId !== undefined) {
        const room = tenantRoomName(parsed.tenantId);
        void client.leave(room);
        rooms.push(room);
      }
      for (const unitId of parsed.unitIds) {
        const room = unitRoomName(unitId);
        void client.leave(room);
        rooms.push(room);
      }
    }

    this.logger.log({ socketId: client.id, rooms }, 'realtime_unsubscribe');
    return { kind: 'unsubscribed', rooms };
  }
}

// ---------------------------------------------------------------------------
// Room naming (deterministic; relied on by RealtimeEmitterService and tests)
// ---------------------------------------------------------------------------

export function tenantRoomName(tenantId: string): string {
  return `tenant:${tenantId}`;
}

export function unitRoomName(unitId: string): string {
  return `unit:${unitId}`;
}

// ---------------------------------------------------------------------------
// Body parsing — manual (Zod would be overkill for two endpoints).
// Strict enough to reject obvious malformed input without becoming a contract
// the wire shape leaks.
// ---------------------------------------------------------------------------

type ParseResult<T> = ({ ok: true } & T) | { ok: false; reason: string };

function parseSubscribeBody(body: unknown): ParseResult<{ tenantId: string; unitIds: string[] }> {
  if (body === null || typeof body !== 'object') {
    return { ok: false, reason: 'body must be a non-null object' };
  }
  const obj = body as Record<string, unknown>;
  const tenantId = obj.tenantId;
  if (typeof tenantId !== 'string' || tenantId.length === 0) {
    return { ok: false, reason: 'tenantId must be a non-empty string' };
  }
  const unitIdsRaw = obj.unitIds;
  const unitIds: string[] = [];
  if (unitIdsRaw !== undefined) {
    if (!Array.isArray(unitIdsRaw)) {
      return { ok: false, reason: 'unitIds must be an array of strings when present' };
    }
    for (const u of unitIdsRaw) {
      if (typeof u !== 'string' || u.length === 0) {
        return { ok: false, reason: 'unitIds must contain only non-empty strings' };
      }
      unitIds.push(u);
    }
  }
  return { ok: true, tenantId, unitIds };
}

function parseUnsubscribeBody(
  body: unknown,
): ParseResult<{ tenantId?: string; unitIds: string[]; leaveAll: boolean }> {
  if (body === undefined || body === null) {
    return { ok: true, unitIds: [], leaveAll: true };
  }
  if (typeof body !== 'object') {
    return { ok: false, reason: 'body must be an object or omitted' };
  }
  const obj = body as Record<string, unknown>;
  const tenantIdRaw = obj.tenantId;
  const unitIdsRaw = obj.unitIds;

  if (tenantIdRaw === undefined && unitIdsRaw === undefined) {
    return { ok: true, unitIds: [], leaveAll: true };
  }

  let tenantId: string | undefined;
  if (tenantIdRaw !== undefined) {
    if (typeof tenantIdRaw !== 'string' || tenantIdRaw.length === 0) {
      return { ok: false, reason: 'tenantId must be a non-empty string when present' };
    }
    tenantId = tenantIdRaw;
  }

  const unitIds: string[] = [];
  if (unitIdsRaw !== undefined) {
    if (!Array.isArray(unitIdsRaw)) {
      return { ok: false, reason: 'unitIds must be an array of strings when present' };
    }
    for (const u of unitIdsRaw) {
      if (typeof u !== 'string' || u.length === 0) {
        return { ok: false, reason: 'unitIds must contain only non-empty strings' };
      }
      unitIds.push(u);
    }
  }

  return { ok: true, tenantId, unitIds, leaveAll: false };
}
