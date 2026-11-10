import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    // У dev-режимі API проксюється на `wrangler dev` (npm run dev:api).
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});
