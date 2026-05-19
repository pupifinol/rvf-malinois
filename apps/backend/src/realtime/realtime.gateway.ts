import { Inject, Logger } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import { ENV_TOKEN, type Env } from '../config/env';

import type { ConnectionState } from '@rvf/types';
import type { Server, Socket } from 'socket.io';

/**
 * Realtime WebSocket gateway — FOUNDATION ONLY.
 *
 * Purpose in F0:
 *   - prove the Socket.IO stack boots, accepts a connection, and shuts down
 *     cleanly under Docker;
 *   - establish the path that F2 will extend with telemetry/alarm streaming
 *     and the subscription protocol from packages/types.
 *
 * What F0 INTENTIONALLY does NOT do:
 *   - authenticate the connection (Clerk/Auth0/WorkOS comes in F1).
 *   - accept subscription requests or route messages.
 *   - touch the database or any business module.
 *
 * Engineering doc §13: a single multiplexed connection, scope enforced by
 * the server, catch-up after reconnect. The contract is in
 * `@rvf/types/realtime` (`RealtimeMessage`, `ConnectionState`, ...).
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
}
