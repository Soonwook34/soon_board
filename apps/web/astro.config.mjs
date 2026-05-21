import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

// Hybrid output: each page individually opts in/out of prerendering via `export const prerender`.
// Plan v2.3 §1.1: shells (index/live/replay) MUST prerender = true so Pages Functions invocations
// stay free for /api/live/* and never for HTML rendering.
export default defineConfig({
  output: 'hybrid',
  adapter: cloudflare({
    mode: 'directory',
    routes: {
      strategy: 'auto',
    },
  }),
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
  vite: {
    ssr: {
      external: ['node:crypto', 'node:fs', 'node:path'],
    },
  },
  build: {
    inlineStylesheets: 'auto',
  },
});
