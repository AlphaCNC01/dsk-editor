// ============================================================================
// Element: Wireless charger. Vector data imported from the manufacturer's
// ArtCAM-exported SVG (circular arcs, converted to our native bulge format).
// SVG uses a Y-DOWN coordinate system; converting to our Y-up CAD space
// needs both a Y negation AND a matching vertex-order reversal (a plain Y
// flip alone leaves the contour's winding backwards relative to every other
// shape in this app, which silently corrupts fill/inside-outside logic even
// though it doesn't show up as a visual mirror by itself) — verified against
// the source file by confirming the signed area comes out positive (CCW,
// matching the tabletop outline's own convention) both before and after the
// transform, same magnitude.
//
// Of the 4 source paths, 3 are the front-side schematic mark (bolt icon,
// two charge-wave arcs) and stay on ELEMENTS. The 4th ("Ring" in the
// source) is actually the charging module's POCKET — the cavity milled
// into the underside of the tabletop that the module sits in — so it's
// back-side geometry, not part of the visible icon. It's placed on
// ELEMENTS_BACK (own color, dashed in the preview) to keep that distinction
// visible now, even though front/back-specific handling (e.g. mirroring for
// back-side toolpaths) isn't built out yet.
//
// Positioned via Elements.resolveInset, so entering a plain non-negative
// distance from whichever anchor is selected always moves the element
// further from that anchor — no need to know which sign means "inward" for
// a given corner or edge. Default position is the spec: 225mm and 200mm in
// from the top-right corner.
// ============================================================================
const WIRELESS_CHARGER_VARIANTS = registerSimpleEmbeddable({
  id: 'wirelessCharger',
  paramsKey: 'chargers',
  defaultVariant: 'standard',
  variants: {
    // Local-space contours (mm), centered at the charger's own geometric
    // center (0,0), in CAD Y-up orientation with CCW winding (see note above).
    // Each sub-shape keeps its own closed contour so the SVG preview and
    // DXF export can draw them as separate entities, matching the source
    // file's 4 separate paths. Only one shape exists for this element, so
    // the UI shows no type selector (see registerSimpleEmbeddable's own
    // comment on single-key variants).
    standard: {
      sku: 'ЗАР-БЛ',
      label: 'Беспроводная зарядка',
      parts: [
      { verts: [{x:-26.4914,y:-1.0651,bulge:0.62501483},{x:-24.4493,y:-5.059,bulge:0},{x:-6.3497,y:-4.9705,bulge:0},{x:-15.9346,y:-39.3432,bulge:0.35646076},{x:-14.5962,y:-42.2547,bulge:0.35646078},{x:-11.4761,y:-41.525,bulge:0},{x:26.4743,y:7.0011,bulge:0.63274294},{x:24.4244,y:11.0183,bulge:0},{x:5.8147,y:10.7397,bulge:0},{x:10.5256,y:39.6092,bulge:0.34255076},{x:8.993,y:42.316,bulge:0.34255076},{x:5.9906,y:41.5029,bulge:0}], layer: 'ENGRAVING' },
      { verts: [{x:-0.0,y:53.1095,bulge:0.40227135},{x:-15.9857,y:37.7647,bulge:0.66241657},{x:-15.9859,y:-37.7653,bulge:0.40225204},{x:-0.0005,y:-53.1095,bulge:0.40225206},{x:15.9863,y:-37.7667,bulge:0.66240831},{x:15.9863,y:37.7654,bulge:0.40227133}], layer: 'WIRELESS_POCKET' },
      { verts: [{x:42.4151,y:42.4374,bulge:0.41355164},{x:38.8835,y:42.4222,bulge:0.41355159},{x:38.8907,y:38.8906,bulge:-0.41446643},{x:38.8907,y:-38.8909,bulge:0.4142134},{x:38.8906,y:-42.4263,bulge:0.4142134},{x:42.426,y:-42.4264,bulge:0.41496756}], layer: 'ENGRAVING' },
      { verts: [{x:-38.8902,y:38.8905,bulge:0.41421365},{x:-38.8903,y:42.4262,bulge:0.41421365},{x:-42.426,y:42.426,bulge:0.4145031},{x:-42.4261,y:-42.4264,bulge:0.41421361},{x:-38.8904,y:-42.4266,bulge:0.41421361},{x:-38.8902,y:-38.8909,bulge:-0.41474487}], layer: 'ENGRAVING' },
    ],
    // Hardcoded cable-channel node, in this element's own local space: the
    // +Y tip of the charging pocket (the WIRELESS_POCKET part above, an
    // elongated hexagon roughly ±16 wide and ±53 tall) — the natural exit
    // point for a channel running toward the tabletop's own top edge,
    // where the T-slot notch lives. Exit direction is +Y (straight out
    // the tip), same axis the point itself sits on.
    cableNode: { x: 0, y: 53.1095, dir: { x: 0, y: 1 } } },
  },
});
