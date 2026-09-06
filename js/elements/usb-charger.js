// ============================================================================
// Element: Торцевая USB-зарядка (end-mounted USB charger). Two contours
// from the source file — an outer schematic/mounting outline and an inner
// rounded rectangle (the actual charger body).
//
// The source part data was drawn upside down relative to how it's actually
// installed, so both contours are mirrored vertically (y -> TOTAL_H - y)
// before use. After mirroring, the shape spans local y=[0, 48]. It is then
// translated down by 4mm so it spans y=[-4, 44]. This makes its local
// origin (0,0) sit exactly 4mm above the charger's physical bottom edge.
// Placing the origin at the tabletop's bottom edge (via insetY=0 from a
// bottom anchor) natively creates the 4mm overhang without any special
// adjustPosition hacks.
//
// Only the HORIZONTAL position is configurable — the vertical position is
// fixed by the part's own physical design. Default horizontal inset: the
// underframe's own horizontal inset + 220mm (mirrors the pult's
// "follow the underframe by default" pattern). Default anchor: bottom-right.
// ============================================================================
const USB_CHARGER_VARIANTS = registerSimpleEmbeddable({
  id: 'usbCharger',
  paramsKey: 'usbChargers',
  defaultVariant: 'standard',
  variants: {
    standard: { parts: [
      { verts: [{x:29,y:0,bulge:0}, {x:20,y:0,bulge:0}, {x:20,y:20,bulge:0}, {x:-20,y:20,bulge:0}, {x:-20,y:0,bulge:0}, {x:-29,y:0,bulge:0}, {x:-29,y:-1,bulge:0.4142}, {x:-26,y:-4,bulge:0}, {x:26,y:-4,bulge:0.4142}, {x:29,y:-1,bulge:0}], layer: 'PHYSICAL' },
      { verts: [{x:19.5,y:38,bulge:0.4142}, {x:13.5,y:44,bulge:0}, {x:0,y:44,bulge:0}, {x:-13.5,y:44,bulge:0.4142}, {x:-19.5,y:38,bulge:0}, {x:-19.5,y:20,bulge:0.4142}, {x:-13.5,y:14,bulge:0}, {x:13.5,y:14,bulge:0.4142}, {x:19.5,y:20,bulge:0}], layer: 'USB_CHARGER_POCKET' },
    ],
    // Hardcoded cable-channel node, in this element's own local space:
    // horizontal center of the charger's own cap (the second part
    // above, its rounded/faceted top) — the visible top edge, the
    // natural exit point for a channel running toward the nearest small
    // cable pocket elsewhere on the tabletop. Exit direction is +Y
    // (straight out the top).
    cableNode: { x: 0, y: 44, dir: { x: 0, y: 1 } } },
  },
});
