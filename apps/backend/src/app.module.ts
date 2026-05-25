import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { ConfigModule } from './config/config.module';
import { EquipmentModule } from './equipment/equipment.module';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { CanonicalTagsModule } from './tags/tags.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { TenantsModule } from './tenants/tenants.module';
import { WellsModule } from './wells/wells.module';

/**
 * AppModule — F4.4 COMPLETE STATE.
 *
 * F4.2B (commit `a8862e2` strategy / `e37f7b5` implementation) quarantined
 * every F1/F1.5-dependent feature module while the Prisma client was rebased
 * on the F4 canonical schema. F4.4 (API adaptation) brought the modules back
 * online one at a time, each on top of the F4 client. F4.4F closes the
 * quarantine: every feature module is now active, and the F4.2B-introduced
 * `exclude` / `ignores` lists in `tsconfig.json`, `eslint.config.mjs`, and
 * `vitest.config.ts` no longer reference any feature directory.
 *
 * Reactivation history (read-only, F4-aligned):
 *   - F4.4A — TenantsModule        /api/v1/tenants    — F4 `tenants`.
 *   - F4.4B — WellsModule          /api/v1/wells      — F4 `wells`.
 *   - F4.4C — CanonicalTagsModule  /api/v1/tags       — F4 `canonical_tags`.
 *   - F4.4D — EquipmentModule      /api/v1/equipment  — F4 `equipment_types` + `measurement_units`.
 *   - F4.4E — JobsModule           /api/v1/jobs       — F4 `jobs` + `commissioning_snapshots`.
 *   - F4.4F — TelemetryModule      /api/v1/telemetry  — read-only `telemetry_readings` range scan.
 *
 * Out of scope for F4.4 (planned for later phases):
 *   - F4.5 — UI connection (phase the frontend off the `lib/api-data/` mock adapter).
 *   - F4.6 — Telemetry ingestion + live-readings projection + WebSocket broadcasting.
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
    WellsModule,
    CanonicalTagsModule,
    EquipmentModule,
    JobsModule,
    TelemetryModule,
  ],
})
export class AppModule {}
