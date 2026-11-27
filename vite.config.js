import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
  plugins: [
    {
      name: 'save-promo-video',
      configureServer(server) {
        server.middlewares.use('/__save_promo', (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end();
            return;
          }
          const urlObj = new URL(req.url, 'http://127.0.0.1');
          const safeName = path.basename(urlObj.searchParams.get('file') || 'phantom_blade_promo.webm');
          const outPath = path.resolve(process.cwd(), safeName);
          const ws = fs.createWriteStream(outPath);
          req.pipe(ws);
          ws.on('finish', () => {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: outPath }));
          });
        });
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 2500
  }
});
