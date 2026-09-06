// ============================================================================
// Element: Блок розеток (outlet block). Vector data imported from an
// ArtCAM-exported SVG the same way as the other inserts — see the
// wireless charger's comment for the winding/flip verification method,
// applied identically here. Two contours: the outer physical cutout
// (larger rectangle) and an inner reference/marking rectangle.
// Positioned via a single anchor + center inset, same contract as every
// other center-anchored element in this app. Default: 300mm right and
// 115mm down from the top-left corner.
// ============================================================================
const OUTLET_BLOCK_VARIANTS = registerSimpleEmbeddable({
  id: 'outletBlock',
  paramsKey: 'outletBlocks',
  defaultVariant: 'standard',
  variants: {
    standard: { parts: [
      { verts: [{x:-133.5,y:60.0,bulge:0},{x:-133.5,y:-60.0,bulge:0},{x:133.5,y:-60.0,bulge:0},{x:133.5,y:60.0,bulge:0}], layer: 'PHYSICAL' },
      { verts: [{x:118.5,y:-55.0,bulge:0},{x:118.5,y:55.0,bulge:0},{x:-118.5,y:55.0,bulge:0},{x:-118.5,y:-55.0,bulge:0}], layer: 'CUTOUT' },
    ] },
  },
});
