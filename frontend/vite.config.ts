/**
 * File: vite.config.ts
 *
 * Vite dev server + build. In development, calls to /api are forwarded to the backend on
 * port 4000, so the browser only ever talks to one origin.
 */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:4000' },
  },
});
