import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Vite config for the geometry-editor app. Same alias pattern as
// apps/engineer's own vite.config.js (see its own comment) — this app
// only actually imports @core/elements.js, @elements/*, and @render/svg.js
// (no @export at all, since it never generates DXF/SVG/PNG/G-code files
// itself), but the full alias set is kept for consistency and in case a
// future need arises.
// ============================================================================
export default defineConfig({
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
