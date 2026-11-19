/**
 * File: vitest.config.ts
 *
 * Frontend unit and component tests: `npm test`. They run in jsdom (a simulated browser),
 * with no backend needed; API calls are replaced by test doubles.
 */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
});
