// cablePocket — variants DATA ONLY. Shape and field meanings: js/core/element-data.js.
// Hand-editable, and rewritten whole by the geometry editor in exactly this format.
ElementData.define({
  cablePocket: {
    big: {
      sku: 'КАРМ-Б',
      label: 'Большая',
      supplierSku: '',
      supplierMark: '',
      parts: [
        { verts: [{x:-40,y:32,bulge:-0.4142}, {x:-32,y:40,bulge:0}, {x:0,y:40,bulge:0}, {x:32,y:40,bulge:-0.4142}, {x:40,y:32,bulge:0}, {x:40,y:-32,bulge:-0.4142}, {x:32,y:-40,bulge:0}, {x:-32,y:-40,bulge:-0.4142}, {x:-40,y:-32,bulge:0}], layer: 'CABLE_POCKET' },
      ],
      cableNode: { x: 0, y: -40, dir: { x: 0, y: -1 } },
    },
    small: {
      sku: 'КАРМ-М',
      label: 'Малая',
      supplierSku: '',
      supplierMark: '',
      parts: [
        { verts: [{x:19,y:25,bulge:-0.4142}, {x:25,y:19,bulge:0}, {x:25,y:0,bulge:0}, {x:25,y:-19,bulge:-0.4142}, {x:19,y:-25,bulge:0}, {x:-19,y:-25,bulge:-0.4142}, {x:-25,y:-19,bulge:0}, {x:-25,y:19,bulge:-0.4142}, {x:-19,y:25,bulge:0}], layer: 'CABLE_POCKET' },
      ],
      cableNode: { x: 0, y: -25, dir: { x: 0, y: -1 } },
    },
  },
});
