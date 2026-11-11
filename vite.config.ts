/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig, type Plugin } from 'vite';

/**
 * Dev-only endpoint: the headset POSTs recorded hand clips (debug mode) to
 * /__clips and they land in recordings/, ready for `npm test`.
 */
function clipRecorder(): Plugin {
  return {
    name: 'shadow-play-clip-recorder',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__clips', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const clip = JSON.parse(body) as { label?: string; recordedAt?: string };
            const safe = (s: string) => s.replace(/[^a-z0-9-]/gi, '-');
            const file = `${safe(clip.label ?? 'clip')}-${safe(clip.recordedAt ?? String(Date.now()))}.json`;
            const dir = join(server.config.root, 'recordings');
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, file), JSON.stringify(clip));
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ file }));
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [iwsdkDev(), clipRecorder()],
  server: { host: '0.0.0.0', port: 8081, open: false },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: { input: './index.html' },
  },
  esbuild: { target: 'esnext' },
  // @drawcall/uikitml otherwise pulls a second three/@pmndrs/uikit graph
  // (its own three vs the app's super-three alias). Duplicate Component classes break
  // instanceof checks → "Only pmndrs/uikit components can be added as children".
  resolve: {
    dedupe: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
    ],
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    include: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
      '@drawcall/uikitml',
    ],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: './',
});
