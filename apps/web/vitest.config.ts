import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  // Next.js sets jsx="preserve" in tsconfig, so Vitest's esbuild has to apply
  // the automatic JSX runtime itself. Without this, transpiled JSX references
  // a global `React` that isn't imported, and tests fail at render time.
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['{components,lib,app}/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
