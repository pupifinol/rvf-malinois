import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService — singleton Prisma client wired into Nest's lifecycle.
 *
 * Nest creates one instance per app, calls `onModuleInit` at boot (we open
 * the DB connection there), and `onModuleDestroy` at shutdown (we close it).
 *
 * F0 keeps this minimal. F1 will add:
 *   - tenant-scoped middleware that injects the current TenantId into every
 *     query (matches the row-level-security policy from the docs);
 *   - soft-delete extension for catalog entities.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma client connected.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma client disconnected.');
  }
}
