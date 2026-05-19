import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { ENV_TOKEN, type Env } from './config/env';

/**
 * Boot the NestJS backend.
 *
 * Order matters here:
 *   1. Create the app with default logger off (we'll use Pino).
 *   2. Swap in Pino so request logs are structured.
 *   3. Apply Helmet for sensible default security headers.
 *   4. Configure CORS using the validated ALLOWED_ORIGINS list.
 *   5. Set the global API prefix.
 *   6. Enable shutdown hooks so Docker stop signals trigger Nest's
 *      onModuleDestroy lifecycle (Prisma disconnects cleanly, etc.).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(PinoLogger));

  const env = app.get<Env>(ENV_TOKEN);

  // Standard security headers.
  app.use(helmet());

  app.enableCors({
    origin: env.ALLOWED_ORIGINS,
    credentials: true,
  });

  // Versioned API surface per telemetry-foundation §15.
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  app.enableShutdownHooks();

  await app.listen(env.BACKEND_PORT, env.BACKEND_HOST);

  console.log(
    `[boot] RVF Malinois backend listening on http://${env.BACKEND_HOST}:${env.BACKEND_PORT}`,
  );
}

bootstrap().catch((err: unknown) => {
  console.error('[boot] Fatal error:', err);
  process.exit(1);
});
