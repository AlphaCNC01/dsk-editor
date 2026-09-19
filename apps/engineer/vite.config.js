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
//
// `base` sets every built asset's own root path to '/dsk-editor/' rather
// than '/' — required because this app is served from GitHub Pages at
// https://<user>.github.io/dsk-editor/, a subpath, not the domain root.
// Only affects `vite build` output (index.html's own script/link tags,
// import paths); `vite dev` ignores it and still serves from
// http://localhost:5173/ as normal. If the repo is ever renamed, this
// string has to change to match (see .github/workflows/deploy-engineer.yml,
// which builds with this same config).
// ============================================================================
export default defineConfig({
  base: '/dsk-editor/',
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, '../../packages/core'),
      '@elements': path.resolve(__dirname, '../../packages/elements'),
      '@render': path.resolve(__dirname, '../../packages/render'),
      '@export': path.resolve(__dirname, '../../packages/export'),
      '@ui-preview': path.resolve(__dirname, '../../packages/ui-preview'),
      '@shared-css': path.resolve(__dirname, '../../packages/shared-css'),
    },
  },
});
