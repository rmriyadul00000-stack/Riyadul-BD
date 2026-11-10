import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { resolve } from 'node:path';

/* The storefront is one single-page app (index.html, served for every shop URL);
   the admin panel is a second one (admin.html, served for /admin and /admin/*).
   Netlify does the same with the redirects in netlify.toml. */
function adminRoutes(): Plugin {
  const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
    const [path, query = ''] = (req.url || '').split('?');
    if (/^\/admin(\/.*)?$/.test(path)) req.url = '/admin.html' + (query ? '?' + query : '');
    next();
  };
  return {
    name: 'rb-admin-routes',
    configureServer(server) { server.middlewares.use(rewrite); },
    configurePreviewServer(server) { server.middlewares.use(rewrite); }
  };
}

export default defineConfig({
  plugins: [react(), adminRoutes()],
  build: {
    target: 'es2022',
    assetsDir: 'static',
    rolldownOptions: {
      input: {
        shop: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin.html')
      },
      output: {
        /* long-lived vendor chunks that both apps share and the browser can cache across deploys */
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            { name: 'query', test: /node_modules[\\/]@tanstack[\\/]/ }
          ]
        }
      }
    }
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] }
});
