import { z } from 'zod';

/**
 * DI token used by Nest to inject the parsed Env object.
 * Co-located with the schema / loader so all env wiring lives in one file.
 */
export const ENV_TOKEN = Symbol('RVF_ENV');

/**
 * Environment schema for the backend.
 *
 * Loaded once at boot and validated. If a required variable is missing or
 * the wrong shape, the process exits before the HTTP server starts — better
 * to fail loud than to discover a bad config six requests later.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),

  BACKEND_HOST: z.string().default('0.0.0.0'),
  BACKEND_PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z
    .string()
    .url()
    .describe('PostgreSQL/TimescaleDB connection string used by Prisma.'),

  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /**
   * Comma-separated list of allowed origins for CORS and Socket.IO.
   * Example: "http://localhost:3000,https://malinois.rvf.com.ve"
   */
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
});

export type Env = z.infer<typeof envSchema>;

export const loadEnv = (): Env => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Print the validation errors in a way that survives Docker log capture.
    console.error('[env] Invalid environment configuration:');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
};
