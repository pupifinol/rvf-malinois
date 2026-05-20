import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { ConfigModule } from './config/config.module';
import { EquipmentModule } from './equipment/equipment.module';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { CanonicalTagsModule } from './tags/tags.module';
import { TenantsModule } from './tenants/tenants.module';
import { WellsModule } from './wells/wells.module';

/**
 * AppModule — top-level wiring.
 *
 * Dependency direction (top → bottom):
 *
 *   ConfigModule       env first, everyone depends on it.
 *   LoggerModule       Pino logger, structured JSON in prod, pretty in dev.
 *   PrismaModule       database access (global).
 *   HealthModule       /health endpoint (independent of everything else).
 *   RealtimeModule     Socket.IO gateway (uses Config).
 *   --- F1 domain modules (read-only catalog + operations) ---
 *   CanonicalTagsModule   /api/v1/tags
 *   TenantsModule         /api/v1/tenants
 *   WellsModule           /api/v1/wells
 *   EquipmentModule       /api/v1/equipment/types|units
 *   JobsModule            /api/v1/jobs    + CommissioningService
 *
 * Still to land: AuthModule (F1.5), TelemetryModule (F2), AlarmsModule,
 * AuditModule, IotPlatformAdapterModule (the ThingsBoard wrapper from §10
 * of system-architecture).
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
    CanonicalTagsModule,
    TenantsModule,
    WellsModule,
    EquipmentModule,
    JobsModule,
  ],
})
export class AppModule {}
