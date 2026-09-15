import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Vite config for the engineer app. The only project-specific thing here
// is the set of aliases pointing at the shared packages (packages/core,
// packages/elements, packages/render, packages/export) — everything else
// is Vite's own defaults. A future apps/client (or apps/geometry-editor)
// gets its own copy of this same alias block, since each app picks which
// of packages/elements it actually imports (see packages/elements/index.js's
// own comment on curated subsets) rather than sharing one Vite config.
// ============================================================================
export default defineConfig({
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, '../../packages/core'),
      '@elements': path.resolve(__dirname, '../../packages/elements'),
      '@render': path.resolve(__dirname, '../../packages/render'),
      '@export': path.resolve(__dirname, '../../packages/export'),
    },
  },
});
