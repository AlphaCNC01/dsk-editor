// ============================================================================
// packages/render — barrel re-export for the preview-oriented rendering
// helpers (dimension lines, SVG preview markup). Both are pure functions
// (Drawing entries in, a string/entries out) with zero DOM coupling — an
// app wires the result into an actual <svg> element itself.
// ============================================================================
export { Dimensions } from './dimensions.js';
export { RenderSVG } from './svg.js';
