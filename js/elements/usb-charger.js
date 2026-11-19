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
  variants: ElementData.variants('usbCharger'),
});
