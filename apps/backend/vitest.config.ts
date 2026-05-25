import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    // F4.4F closes the F4.2B quarantine: every feature directory is now back
    // on the F4 client and its specs run against mocked Prisma. The default
    // node_modules/dist excludes are kept; no feature-directory exclude is
    // needed.
    exclude: ['node_modules/**', 'dist/**'],
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
