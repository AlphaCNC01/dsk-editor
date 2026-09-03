// ============================================================================
// Element: Лоток для сетевого фильтра (cable/power-strip tray). Two size
// variants (60cm / 80cm), same VARIANTS pattern as the underframe. Each
// variant has a 3-piece physical outline (two end brackets + the tray
// body) and 8 mounting-hole contours (4 physical holes, each drawn as a
// concentric pair — matches the underframe's own hole convention).
// Positioned via a single anchor + insetX/insetY, same as every other
// embeddable element — default anchor is the top edge, where insetY is
// an inward distance (from the top) and insetX is a left/right shift
// from horizontal center (there's no "inward" direction along a
// horizontally-centered edge), both resolved by Elements.resolveInset.
// ============================================================================
const TRAY_VARIANTS = registerSimpleEmbeddable({
  id: 'tray',
  paramsKey: 'trays',
  defaultVariant: '60',
  variants: {
    '60': { parts: [
      { verts: [{x:171.5,y:65.0,bulge:0},{x:171.5,y:-65.0,bulge:0},{x:191.5,y:-65.0,bulge:0},{x:191.5,y:65.0,bulge:0}], layer: 'ELEMENTS' },
      { verts: [{x:-191.5,y:65.0,bulge:0},{x:-191.5,y:-65.0,bulge:0},{x:-171.5,y:-65.0,bulge:0},{x:-171.5,y:65.0,bulge:0}], layer: 'ELEMENTS' },
      { verts: [{x:-300.0,y:47.5,bulge:0},{x:-300.0,y:-47.5,bulge:0},{x:300.0,y:-47.5,bulge:0},{x:300.0,y:47.5,bulge:0}], layer: 'ELEMENTS' },
      { verts: [{x:-177.5,y:42.5,bulge:1.0},{x:-185.5,y:42.5,bulge:1.0}], layer: 'ELEMENTS_BACK' },
      { verts: [{x:-178.5,y:42.5,bulge:1.0},{x:-184.5,y:42.5,bulge:1.0}], layer: 'ELEMENTS_BACK' },
      { verts: [{x:-177.5,y:-42.5,bulge:1.0},{x:-185.5,y:-42.5,bulge:1.0}], layer: 'ELEMENTS_BACK' },
      { verts: [{x:-178.5,y:-42.5,bulge:1.0},{x:-184.5,y:-42.5,bulge:1.0}], layer: 'ELEMENTS_BACK' },
      { verts: [{x:185.5,y:42.5,bulge:1.0},{x:177.5,y:42.5,bulge:1.0}], layer: 'ELEMENTS_BACK' },
      { verts: [{x:184.5,y:42.5,bulge:1.0},{x:178.5,y:42.5,bulge:1.0}], layer: 'ELEMENTS_BACK' },
      { verts: [{x:185.5,y:-42.5,bulge:1.0},{x:177.5,y:-42.5,bulge:1.0}], layer: 'ELEMENTS_BACK' },
      { verts: [{x:184.5,y:-42.5,bulge:1.0},{x:178.5,y:-42.5,bulge:1.0}], layer: 'ELEMENTS_BACK' },
    ] },
    '80': { parts: [
      { verts: [{x:350.0,y:-65.0,bulge:0},{x:350.0,y:65.0,bulge:0},{x:330.0,y:65.0,bulge:0},{x:330.0,y:-65.0,bulge:0}], layer: 'ELEMENTS' },
      { verts: [{x:-330.0,y:-65.0,bulge:0},{x:-330.0,y:65.0,bulge:0},{x:-350.0,y:65.0,bulge:0},{x:-350.0,y:-65.0,bulge:0}], layer: 'ELEMENTS' },
      { verts: [{x:400.0,y:-47.5,bulge:0},{x:400.0,y:47.5,bulge:0},{x:-400.0,y:47.5,bulge:0},{x:-400.0,y:-47.5,bulge:0}], layer: 'ELEMENTS' },
      { verts: [{x:-336.0,y:-31.5,bulge:1.0},{x:-344.0,y:-31.5,bulge:1.0}], layer: 'ELEMENTS_BACK' },
      { verts: [{x:-337.0,y:-31.5,bulge:1.0},{x:-343.0,y:-31.5,bulge:1.0}], layer: 'ELEMENTS_BACK' },
      { verts: [{x:-336.0,y:31.5,bulge:1.0},{x:-344.0,y:31.5,bulge:1.0}], layer: 'ELEMENTS_BACK' },
      { verts: [{x:-337.0,y:31.5,bulge:1.0},{x:-343.0,y:31.5,bulge:1.0}], layer: 'ELEMENTS_BACK' },
      { verts: [{x:344.0,y:-31.5,bulge:1.0},{x:336.0,y:-31.5,bulge:1.0}], layer: 'ELEMENTS_BACK' },
      { verts: [{x:343.0,y:-31.5,bulge:1.0},{x:337.0,y:-31.5,bulge:1.0}], layer: 'ELEMENTS_BACK' },
      { verts: [{x:344.0,y:31.5,bulge:1.0},{x:336.0,y:31.5,bulge:1.0}], layer: 'ELEMENTS_BACK' },
      { verts: [{x:343.0,y:31.5,bulge:1.0},{x:337.0,y:31.5,bulge:1.0}], layer: 'ELEMENTS_BACK' },
    ] },
  },
});
