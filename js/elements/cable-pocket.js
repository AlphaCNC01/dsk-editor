const CABLE_POCKET_VARIANTS = registerSimpleEmbeddable({
  id: 'cablePocket',
  paramsKey: 'cablePockets',
  defaultVariant: 'big',
  variants: {
    big: {
      sku: 'КАРМ-Б',
      label: 'Большая',
      parts: [
      { verts: [{x:-40,y:32,bulge:-0.4142}, {x:-32,y:40,bulge:0}, {x:0,y:40,bulge:0}, {x:32,y:40,bulge:-0.4142}, {x:40,y:32,bulge:0}, {x:40,y:-32,bulge:-0.4142}, {x:32,y:-40,bulge:0}, {x:-32,y:-40,bulge:-0.4142}, {x:-40,y:-32,bulge:0}], layer: 'CABLE_POCKET' },
    ],
    // Hardcoded cable-channel node: offset toward -Y from the pocket's
    // own center (its octagon is symmetric on both axes, so this is a
    // convention rather than a geometrically forced choice) — a channel
    // can terminate anywhere inside a pocket this size, so any point
    // works equally well, this one just keeps it consistent with the
    // small variant below. Exit direction is -Y to match.
    cableNode: { x: 0, y: -40, dir: { x: 0, y: -1 } } },
    small: {
      sku: 'КАРМ-М',
      label: 'Малая',
      parts: [
      { verts: [{x:19,y:25,bulge:-0.4142}, {x:25,y:19,bulge:0}, {x:25,y:0,bulge:0}, {x:25,y:-19,bulge:-0.4142}, {x:19,y:-25,bulge:0}, {x:-19,y:-25,bulge:-0.4142}, {x:-25,y:-19,bulge:0}, {x:-25,y:19,bulge:-0.4142}, {x:-19,y:25,bulge:0}], layer: 'CABLE_POCKET' },
    ],
    cableNode: { x: 0, y: -25, dir: { x: 0, y: -1 } } },
  },
});
