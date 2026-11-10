import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { resolve } from 'node:path';

const pages = ['index', 'products', 'product', 'checkout', 'account', 'wishlist', 'contact', 'admin'];

/* The same clean URLs netlify.toml serves in production, so `npm run dev`
   and `npm run preview` behave like the live site. */
const CLEAN: [RegExp, string][] = [
  [/^\/products\/?$/, '/products.html'],
  [/^\/product\/[^/]+\/?$/, '/product.html'],
  [/^\/category\/[^/]+\/?$/, '/products.html'],
  [/^\/checkout\/?$/, '/checkout.html'],
  [/^\/account\/?$/, '/account.html'],
  [/^\/wishlist\/?$/, '/wishlist.html'],
  [/^\/contact\/?$/, '/contact.html'],
  [/^\/admin\/?$/, '/admin.html']
];
function cleanUrls(): Plugin {
  const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
    const [path, query = ''] = (req.url || '').split('?');
    const hit = CLEAN.find(([re]) => re.test(path));
    if (hit) req.url = hit[1] + (query ? '?' + query : '');
    next();
  };
  return {
    name: 'rb-clean-urls',
    configureServer(server) { server.middlewares.use(rewrite); },
    configurePreviewServer(server) { server.middlewares.use(rewrite); }
  };
}

export default defineConfig({
  plugins: [cleanUrls()],
  build: {
    target: 'es2022',
    assetsDir: 'static',
    rollupOptions: {
      input: Object.fromEntries(pages.map(p => [p, resolve(import.meta.dirname, `${p}.html`)]))
    }
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] }
});
