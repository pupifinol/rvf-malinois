import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    // F4.2B quarantine: specs under the directories below depend on the
    // F1/F1.5 Prisma client (removed in F4.2). They are preserved in git for
    // reference during the F4.4 rewrite but skipped here so `pnpm test` runs
    // green on the F4.2 baseline. See
    // docs/architecture/RVF_Malinois_F4_2B_Insulation_Strategy_Confirmation.md.
    exclude: ['node_modules/**', 'dist/**', 'src/jobs/**', 'src/telemetry/**'],
    // The backend suite shares one PostgreSQL instance with the dev
    // environment. Running files serially keeps shared fixtures consistent
    // without per-test database isolation overhead.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/dist/**', '**/*.module.ts', '**/main.ts'],
    },
  },
});
