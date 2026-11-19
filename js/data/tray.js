// tray — variants DATA ONLY. Shape and field meanings: js/core/element-data.js.
// Hand-editable, and rewritten whole by the geometry editor in exactly this format.
ElementData.define({
  tray: {
    '60': {
      sku: 'ЛОТ-60',
      label: 'Лоток 60 см (старый)',
      supplierSku: '',
      supplierMark: '',
      parts: [
        { verts: [{x:171.5,y:65,bulge:0}, {x:171.5,y:-65,bulge:0}, {x:191.5,y:-65,bulge:0}, {x:191.5,y:65,bulge:0}], layer: 'PHYSICAL' },
        { verts: [{x:-191.5,y:65,bulge:0}, {x:-191.5,y:-65,bulge:0}, {x:-171.5,y:-65,bulge:0}, {x:-171.5,y:65,bulge:0}], layer: 'PHYSICAL' },
        { verts: [{x:-300,y:47.5,bulge:0}, {x:-300,y:-47.5,bulge:0}, {x:300,y:-47.5,bulge:0}, {x:300,y:47.5,bulge:0}], layer: 'PHYSICAL' },
        { hole: { x: -181.5, y: 42.5, kind: 'B' } },
        { hole: { x: -181.5, y: -42.5, kind: 'B' } },
        { hole: { x: 181.5, y: 42.5, kind: 'B' } },
        { hole: { x: 181.5, y: -42.5, kind: 'B' } },
      ],
    },
    '80': {
      sku: 'ЛОТ-80',
      label: 'Лоток 80 см',
      supplierSku: '',
      supplierMark: '',
      parts: [
        { verts: [{x:350,y:-65,bulge:0}, {x:350,y:65,bulge:0}, {x:330,y:65,bulge:0}, {x:330,y:-65,bulge:0}], layer: 'PHYSICAL' },
        { verts: [{x:-330,y:-65,bulge:0}, {x:-330,y:65,bulge:0}, {x:-350,y:65,bulge:0}, {x:-350,y:-65,bulge:0}], layer: 'PHYSICAL' },
        { verts: [{x:400,y:-47.5,bulge:0}, {x:400,y:47.5,bulge:0}, {x:-400,y:47.5,bulge:0}, {x:-400,y:-47.5,bulge:0}], layer: 'PHYSICAL' },
        { hole: { x: -340, y: -31.5, kind: 'B' } },
        { hole: { x: -340, y: 31.5, kind: 'B' } },
        { hole: { x: 340, y: -31.5, kind: 'B' } },
        { hole: { x: 340, y: 31.5, kind: 'B' } },
      ],
    },
    HOOK: {
      sku: 'HOOK',
      label: 'Лоток 60 см',
      supplierSku: '',
      supplierMark: '',
      parts: [
        { verts: [{x:200,y:69,bulge:0}, {x:200,y:-69,bulge:0}, {x:225,y:-69,bulge:0}, {x:225,y:69,bulge:0}], layer: 'PHYSICAL' },
        { verts: [{x:-225,y:69,bulge:0}, {x:-225,y:-69,bulge:0}, {x:-200,y:-69,bulge:0}, {x:-200,y:69,bulge:0}], layer: 'PHYSICAL' },
        { verts: [{x:-300,y:66,bulge:0}, {x:-300,y:-66,bulge:0}, {x:300,y:-66,bulge:0}, {x:300,y:66,bulge:0}], layer: 'PHYSICAL' },
        { hole: { x: -212.5, y: 30, kind: 'B' } },
        { hole: { x: -212.5, y: -30, kind: 'B' } },
        { hole: { x: 212.5, y: 30, kind: 'B' } },
        { hole: { x: 212.5, y: -30, kind: 'B' } },
      ],
    },
  },
});
