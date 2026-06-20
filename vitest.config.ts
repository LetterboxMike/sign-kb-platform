import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // DB-backed acceptance runs over the network; give it room and run files serially
    // so the shared index is never mutated by two suites at once.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
