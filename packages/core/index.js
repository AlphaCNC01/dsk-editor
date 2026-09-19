// ============================================================================
// packages/core — barrel re-export. Import from '@core' (or the package
// name once workspaces/publishing enter the picture) to get everything in
// one line, e.g.:
//   import { Geo, Layers, Elements, Drawing } from '@core';
// Individual files can still be imported directly when only one piece is
// needed (e.g. a test that only touches Geo) — this barrel is a
// convenience, not the only way in.
// ============================================================================
export { Geo } from './geo.js';
export { Layers } from './layers.js';
export {
  Elements,
  resolveEmbeddableWorldTransform,
  embeddableLocalToWorld,
  embeddableLocalDirToWorld,
  registerSimpleEmbeddable,
} from './elements.js';
export { Drawing } from './drawing.js';
