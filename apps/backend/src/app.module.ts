import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { TenantsModule } from './tenants/tenants.module';

/**
 * AppModule — F4.4A REACTIVATION STATE.
 *
 * F4.2B (commit `a8862e2` strategy / `e37f7b5` implementation) quarantined
 * every F1/F1.5-dependent feature module while the Prisma client was rebased
 * on the F4 canonical schema. F4.4 (API adaptation) brings the modules back
 * online one at a time, each on top of the F4 client. F4.4A reactivates the
 * first one: `TenantsModule`.
 *
 * Reactivated by F4.4A:
 *   - TenantsModule      /api/v1/tenants  — read-only over F4 `tenants` table.
 *
 * Still quarantined until subsequent F4.4 sub-phases:
 *   - CanonicalTagsModule  (was: /api/v1/tags)         — F4.4C planned
 *   - WellsModule          (was: /api/v1/wells)        — F4.4B planned
 *   - EquipmentModule      (was: /api/v1/equipment)    — F4.4D planned
 *   - JobsModule           (was: /api/v1/jobs)         — F4.4E planned
 *   - TelemetryModule      (was: /api/v1/telemetry)    — F4.4F / F4.6 planned
 *
 * Always-active core:
 *   - ConfigModule       env-first; required by every other module.
 *   - LoggerModule       Pino structured logging.
 *   - PrismaModule       global Prisma client (F4 schema generated).
 *   - HealthModule       /health endpoint, independent of feature modules.
 *   - RealtimeModule     Socket.IO gateway scaffolding (no telemetry routing yet).
 *
 * Frontend continues to render via the F3 `lib/api-data/` mock adapter (per
 * engineering-architecture §J) until F4.5 wires the UI through to live
 * endpoints.
 */
@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l' },
              },
        // Engineering doc §30: never log sensitive data.
        redact: {
          paths: ['req.headers.authorization', 'req.headers.cookie', '*.password'],
          remove: true,
        },
      },
    }),
    PrismaModule,
    HealthModule,
    RealtimeModule,
    TenantsModule,
  ],
})
export class AppModule {}
