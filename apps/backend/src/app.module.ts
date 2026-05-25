import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';

/**
 * AppModule — F4.2B QUARANTINE STATE.
 *
 * Per the F4.2B insulation strategy
 * (`docs/architecture/RVF_Malinois_F4_2B_Insulation_Strategy_Confirmation.md`,
 * commit a8862e2), the F1/F1.5-dependent feature modules are temporarily
 * removed from application bootstrap while the Prisma client is rebased on
 * the F4 canonical schema. The modules' source files remain in the repo
 * under `src/wells`, `src/tenants`, `src/tags`, `src/equipment`, `src/jobs`,
 * and `src/telemetry`, and are excluded from typecheck / lint / test compile
 * via `tsconfig.json`, `eslint.config.mjs`, and `vitest.config.ts`. They will
 * be reactivated, one at a time, atop the F4 client during phase F4.4 (API
 * adaptation).
 *
 * Quarantined for the F4.2 → F4.4 window:
 *   - CanonicalTagsModule  (was: /api/v1/tags)
 *   - TenantsModule        (was: /api/v1/tenants)
 *   - WellsModule          (was: /api/v1/wells)
 *   - EquipmentModule      (was: /api/v1/equipment)
 *   - JobsModule           (was: /api/v1/jobs + CommissioningService)
 *   - TelemetryModule      (was: /api/v1/telemetry trends + ingest scaffolding)
 *
 * Active during the quarantine window:
 *   - ConfigModule       env-first; required by every other module.
 *   - LoggerModule       Pino structured logging.
 *   - PrismaModule       global Prisma client (F4 schema generated).
 *   - HealthModule       /health endpoint, independent of feature modules.
 *   - RealtimeModule     Socket.IO gateway scaffolding (no telemetry routing yet).
 *
 * Frontend continues to render via the F3 `lib/api-data/` mock adapter (per
 * engineering-architecture §J); no API consumer is impacted by the
 * quarantine. The Prisma client itself is generated successfully against
 * the F4 baseline schema, so `PrismaService` boots; runtime connection to a
 * database is not exercised in F4.2B.
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
