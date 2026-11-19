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
  variants: ElementData.variants('wirelessCharger'),
});
