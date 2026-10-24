import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
  server: {
    port: 5173,
    host: true,
    fs: {
      // Keep Vite's defaults and prevent raw private state bypassing authenticated APIs.
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.world-data/**', '**/.auth-data/**', '**/.tmp/**'],
    },
    proxy: {
      // Keep the browser's Host so the service can validate its same-origin LAN requests.
      '/api/world': { target: 'http://127.0.0.1:8787', changeOrigin: false },
      '/api/auth': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
  base: './',
});
