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
  variants: {
    standard: {
      sku: 'ПУ-СТ',
      label: 'Стандартный',
      parts: [
        { verts: [{x:-45.0,y:50.0,bulge:0},{x:-45.0,y:0.0,bulge:0},{x:45.0,y:0.0,bulge:0},{x:45.0,y:50.0,bulge:0}], layer: 'PHYSICAL' },
        { verts: [{x:-34.0,y:30.0,bulge:1.0},{x:-26.0,y:30.0,bulge:1.0}], layer: 'HOLES' },
        { verts: [{x:-33.0,y:30.0,bulge:1.0},{x:-27.0,y:30.0,bulge:1.0}], layer: 'HOLES' },
        { verts: [{x:26.0,y:30.0,bulge:1.0},{x:34.0,y:30.0,bulge:1.0}], layer: 'HOLES' },
        { verts: [{x:27.0,y:30.0,bulge:1.0},{x:33.0,y:30.0,bulge:1.0}], layer: 'HOLES' },
      ],
    },
    sensor: {
      sku: 'сенсорный',
      label: 'Сенсорный пульт',
      parts: [
        { verts: [{x:-33.8,y:33.7,bulge:0.414214},{x:-30.8,y:30.7,bulge:0.414214},{x:-27.8,y:33.7,bulge:0.414214},{x:-30.8,y:36.7,bulge:0.414214}], layer: 'HOLES' },
        { verts: [{x:27.8,y:33.7,bulge:0.414214},{x:30.8,y:30.7,bulge:0.414214},{x:33.8,y:33.7,bulge:0.414214},{x:30.8,y:36.7,bulge:0.414214}], layer: 'HOLES' },
        { verts: [{x:26.8,y:33.7,bulge:0.414214},{x:30.8,y:29.7,bulge:0.414214},{x:34.8,y:33.7,bulge:0.414214},{x:30.8,y:37.7,bulge:0.414214}], layer: 'HOLES' },
        { verts: [{x:-34.8,y:33.7,bulge:0.414214},{x:-30.8,y:29.7,bulge:0.414214},{x:-26.8,y:33.7,bulge:0.414214},{x:-30.8,y:37.7,bulge:0.414214}], layer: 'HOLES' },
        { verts: [{x:-37,y:58.4,bulge:0},{x:-37,y:0,bulge:0},{x:37,y:0,bulge:0},{x:37,y:58.4,bulge:0.414214},{x:32,y:63.4,bulge:0},{x:-32,y:63.4,bulge:0.414214}], layer: 'PHYSICAL' },
        { verts: [{x:-37,y:0,bulge:0},{x:-37,y:-20.9,bulge:0.414214},{x:-22,y:-35.9,bulge:0},{x:22,y:-35.9,bulge:0.414214},{x:37,y:-20.9,bulge:0},{x:37,y:0,bulge:0}], layer: 'PHYSICAL' },
      ],
    },
    embeddedUsb: {
      sku: 'ПУ-USB',
      label: 'Встраиваемый с USB',
      parts: [
        { verts: [{x:-36.0,y:41.0,bulge:-0.414214},{x:-41.0,y:36.0,bulge:0},{x:-76.5,y:36.0,bulge:0.414214},{x:-80.5,y:32.0,bulge:0},{x:-80.5,y:22.0,bulge:0.414214},{x:-76.5,y:18.0,bulge:0},{x:76.5,y:18.0,bulge:0.414214},{x:80.5,y:22.0,bulge:0},{x:80.5,y:32.0,bulge:0.414214},{x:76.5,y:36.0,bulge:0},{x:-13.0,y:36.0,bulge:-0.414214},{x:-18.0,y:41.0,bulge:0},{x:-18.0,y:46.0,bulge:0.414214},{x:-23.0,y:51.0,bulge:0},{x:-31.0,y:51.0,bulge:0.414214},{x:-36.0,y:46.0,bulge:0}], layer: 'EMBEDED_USB_POCKET' },
        { verts: [{x:-79.0,y:34.0,bulge:0},{x:-79.0,y:0.0,bulge:0},{x:79.0,y:0.0,bulge:0},{x:79.0,y:34.0,bulge:0}], layer: 'PHYSICAL' },
      ],
      // Hardcoded cable-channel node, in this element's own local space:
      // the top of the small tab on the panel's own UNDERFRAME contour
      // (between its two nearby vertices at (-23,51) and (-31,51)) — the
      // natural exit point for a channel running toward the nearest big
      // cable pocket elsewhere on the tabletop. Exit direction is +Y
      // (straight out the top).
      cableNode: { x: -27, y: 51, dir: { x: 0, y: 1 } },
    },
  },
});
