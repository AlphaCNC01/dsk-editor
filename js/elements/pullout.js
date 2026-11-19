// ============================================================================
// Element: Выдвижная подставка (pull-out stand). Physical outline is a
// compound two-piece rectangle (housing wall + inner frame) plus 4
// mounting holes, each built via Holes.at() (see js/elements/hole.js) —
// shared hole/counterbore geometry used by every element with mounting
// points. Local coordinates:
// x=0 at horizontal center, y=0 at the shape's own BOTTOM edge — unlike
// most other elements, the configurable inset here measures to that
// bottom edge directly, not to the shape's center (per spec).
//
// When the tabletop's own ergo-notch (bottom trapezoid cutout) is on AND
// its footprint overlaps the stand's horizontal span, the stand is
// automatically shifted up so its bottom edge sits at the notch's own
// flat top (notchH) instead of landing inside the cut-away material —
// confirmed this is the wanted default behavior (auto-shift, not just a
// warning) rather than assuming it. The shift only applies when there's
// an actual horizontal overlap; a narrower/off-center notch that doesn't
// reach the stand's footprint leaves the stand at its configured position.
// The notch-overlap check below uses the final (insetX-shifted) position.
// ============================================================================
const PULLOUT_VARIANTS = registerSimpleEmbeddable({
  id: 'pullout',
  paramsKey: 'pullouts',
  defaultVariant: 'standard',
  variants: ElementData.variants('pullout'),
});
