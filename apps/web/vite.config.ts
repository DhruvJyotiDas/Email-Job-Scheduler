import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const api = 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  // Pure-TS helpers from the shared package, imported from source (the package's CJS build pulls in node:crypto).
  resolve: { alias: { '@shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      '/api': api,
      '/admin': api,
      '/socket.io': { target: api, ws: true },
    },
  },
});
