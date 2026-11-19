import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 20_000,
    projects: [
      {
        // Pure logic (slots, rules, timezones). No database needed.
        test: { name: 'unit', include: ['test/unit/**/*.test.ts'] },
      },
      {
        // API + database behaviour against a real Postgres (constraints, concurrency, worker).
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          globalSetup: ['test/helpers/global-setup.ts'],
          // Files share one database, so they run one at a time.
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
