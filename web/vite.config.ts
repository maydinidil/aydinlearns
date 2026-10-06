// web/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { portFromEnv } from '../server/port.ts';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    // The API server's port follows AYDINLEARNS_PORT (5174 by default), as the server does. changeOrigin sets Host
    // to 127.0.0.1 and that port, which the server's Host check requires; Origin stays the Vite origin.
    proxy: { '/api': { target: `http://127.0.0.1:${portFromEnv()}`, changeOrigin: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
