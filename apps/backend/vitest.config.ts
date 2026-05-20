import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    // The backend suite shares one PostgreSQL/TimescaleDB instance with the
    // dev environment. Multiple test files create/mutate the same fixtures
    // (jobs on EMMAD-01, snapshots, etc.). Running files serially keeps the
    // shared state consistent without per-test database isolation overhead.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/dist/**', '**/*.module.ts', '**/main.ts'],
    },
  },
});
