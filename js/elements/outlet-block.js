// ============================================================================
// Element: Блок розеток (outlet block). Vector data imported from an
// ArtCAM-exported SVG the same way as the other inserts — see the
// wireless charger's comment for the winding/flip verification method,
// applied identically here. Two contours: the outer physical top face
// (larger rectangle, on OUTLET_BLOCK_TOP — see layers.js for why this
// gets its own layer instead of the shared PHYSICAL one) and an inner
// cutout (the actual hole the block sits in). Positioned via a single
// anchor + center inset, same contract as every other center-anchored
// element in this app. Default: 300mm right and 115mm down from the
// top-left corner.
// ============================================================================
const OUTLET_BLOCK_VARIANTS = registerSimpleEmbeddable({
  id: 'outletBlock',
  paramsKey: 'outletBlocks',
  defaultVariant: 'standard',
  variants: ElementData.variants('outletBlock'),
});
