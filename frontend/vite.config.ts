import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            // Suppress benign client socket disconnects on long-lived SSE streams
            if ((err as any).code === 'ECONNRESET' || (err as any).code === 'EPIPE') {
              return;
            }
            if (res && !res.headersSent && typeof (res as any).writeHead === 'function') {
              (res as any).writeHead(502, { 'Content-Type': 'application/json' });
              (res as any).end(JSON.stringify({ error: 'BACKEND_OFFLINE', message: 'Fastify backend is not reachable at http://127.0.0.1:3000' }));
            }
          });
        },
      },
    },
  },
});
