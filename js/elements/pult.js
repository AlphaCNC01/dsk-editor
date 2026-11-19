// ============================================================================
// Element: Пульт управления подстольем (control panel). Split out from the
// underframe element into its own registration so additional panel designs
// can be added later as sibling variants — "Стандартный" (Standard) is
// taken from the same source drawing as the underframe (see that
// element's comment for the winding/flip verification, which applied to
// the whole combined drawing including this panel); "Встраиваемый с USB"
// (Embedded, USB) is a single-copy panel traced from its own ArtCAM SVG
// export (one real contour — a grey reference rectangle in that source
// file, flush with the tabletop's own bottom edge, was confirmed with the
// person to be a positioning guide from the original drawing, not real
// milling geometry, and was excluded).
//
// Each variant's own `parts` here is a single copy, drawn once at
// whatever position/mirror its own instance resolves to — same as every
// other embeddable element in this app (see registerSimpleEmbeddable).
// Neither variant auto-duplicates a left+right pair on its own; if a
// left-and-right mounting option is wanted, the person adds two separate
// Standard instances (one on each side, one mirrored) through the UI.
//
// Standard's own default position (before any override): a horizontal
// inset from whichever edge the instance's own anchor is closer to
// (underframeInsetH + 65mm, so it lines up with the underframe's own
// placement by default) and a vertical inset of 0 from the tabletop's
// bottom edge (flush against the bottom).
//
// Embedded's own default position: anchored from the tabletop's
// bottom-right corner, horizontal inset defaulting to underframeInsetH +
// 120mm (same "follow the underframe by default" pattern as the USB
// charger's own inset). There's no vertical inset — confirmed with the
// person that only the horizontal position is configurable; the panel
// always sits flush against the bottom edge, same as in the source
// drawing (the shape's own 18mm gap from the bottom edge is already
// baked into its contour, not applied as a separate inset).
// ============================================================================
const PULT_VARIANTS = registerSimpleEmbeddable({
  id: 'pult',
  paramsKey: 'pults',
  defaultVariant: 'standard',
  variants: ElementData.variants('pult'),
});
