import { Global, Module } from '@nestjs/common';

import { ENV_TOKEN, loadEnv, type Env } from './env';

/**
 * ConfigModule
 *
 * Boots the environment validation once and exposes the parsed `Env` object
 * as an injectable provider. Other modules inject it with:
 *
 *   constructor(@Inject(ENV_TOKEN) private readonly env: Env) {}
 *
 * Why not @nestjs/config? Because we want a zod-validated, fully typed
 * result. nestjs/config is fine, but a single zod schema is simpler and
 * more honest about what variables the app needs.
 */
@Global()
@Module({
  providers: [
    {
      provide: ENV_TOKEN,
      useFactory: (): Env => loadEnv(),
    },
  ],
  exports: [ENV_TOKEN],
})
export class ConfigModule {}
