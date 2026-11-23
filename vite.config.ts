import { defineConfig } from 'vite';
import { DEV_API_ORIGIN, previewOriginGuard, isQuickTunnel } from './scripts/dev-proxy.mjs';
import { previewDependencies, workspaceDependencies } from './scripts/dev-dependencies.mjs';

export default defineConfig({
  plugins: [{ name: 'preview-origin', apply: 'serve', configureServer(server) { server.middlewares.use(previewOriginGuard); } }],
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    allowedHosts: ['.trycloudflare.com'], cors: false,
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.cache/**', '**/data/**', '**/test-results/**', '**/*.sqlite*'] },
    proxy: {
      '/api': {
        target: process.env.QING_DEV_API_URL ?? 'http://127.0.0.1:3106',
        configure(proxy) {
          proxy.on('proxyReq', (outgoing, incoming) => {
            // Guard above validates browser Origin against this request's Host first.
            if (incoming.headers.origin) outgoing.setHeader('origin', DEV_API_ORIGIN);
          });
          proxy.on('proxyRes', (response, request) => {
            if (isQuickTunnel(request.headers.host) && response.headers['set-cookie']) {
              response.headers['set-cookie'] = response.headers['set-cookie'].map(value => /;\s*Secure(?:;|$)/i.test(value) ? value : value + '; Secure');
            }
          });
        },
      },
    },
  },
  esbuild: { jsx: 'automatic' },
  optimizeDeps: { noDiscovery: true, include: previewDependencies, esbuildOptions: { plugins: [workspaceDependencies()], tsconfigRaw: {} } },
  build: { target: 'es2022' },
});
