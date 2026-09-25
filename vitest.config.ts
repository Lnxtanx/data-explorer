// =============================================================================
// App-layer test config.
//
// Separate from vitest.engine.config.ts on purpose: src/dashboard-engine is a
// standalone sandbox bundle that must not know about the host app, and it is
// tested with its own config so that boundary stays enforced. This config
// covers the React application layer.
//
// Phase 0 of the refactor adds characterization tests for the PURE modules
// that are about to be moved in Phase 4/5. Every module listed in
// MIGRATION TARGETS below gets a test BEFORE it is moved, so the move is
// provably behaviour-preserving.
// =============================================================================
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/**/__tests__/**/*.test.{ts,tsx}',
      'src/**/*.test.{ts,tsx}',
    ],
    // Explicitly exclude the engine: it has its own config and its own
    // `declare const Chart` global that only the engine bundle provides.
    exclude: ['src/dashboard-engine/**', 'node_modules/**', 'dist/**'],
    globals: false,
  },
});
