// ============================================================================
// Element: Лоток для сетевого фильтра (cable/power-strip tray). Variants:
// 'HOOK' (current 60 cm tray, default for new projects), legacy '60' (kept
// so projects saved before PROJECT_FILE_VERSION 2 render unchanged) and
// '80', same VARIANTS pattern as the underframe. Each
// variant has a 3-piece physical outline (two end brackets + the tray
// body) and 4 mounting holes, each built via Holes.at() (see
// js/elements/hole.js) — shared hole/counterbore geometry used by every
// element with mounting points.
// Positioned via a single anchor + insetX/insetY, same as every other
// embeddable element — default anchor is the top edge, where insetY is
// an inward distance (from the top) and insetX is a left/right shift
// from horizontal center (there's no "inward" direction along a
// horizontally-centered edge), both resolved by PHYSICAL.resolveInset.
// ============================================================================
const TRAY_VARIANTS = registerSimpleEmbeddable({
  id: 'tray',
  paramsKey: 'trays',
  defaultVariant: 'HOOK',
  variants: ElementData.variants('tray'),
});
