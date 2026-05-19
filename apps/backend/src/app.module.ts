import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';

/**
 * AppModule — top-level wiring.
 *
 * The order of imports below mirrors the dependency direction of the system:
 *
 *   ConfigModule       — env first, everyone depends on it.
 *   LoggerModule       — Pino logger, structured JSON in prod, pretty in dev.
 *   PrismaModule       — database access (global).
 *   HealthModule       — / health endpoint (independent of everything else).
 *   RealtimeModule     — Socket.IO gateway (uses Config).
 *
 * F1 will add: AuthModule, CatalogModule, OperationsModule, TelemetryModule,
 * AlarmsModule, AuditModule, IotPlatformAdapterModule (the ThingsBoard
 * wrapper from §10 of system-architecture).
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
  ],
})
export class AppModule {}
