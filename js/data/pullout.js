// pullout — variants DATA ONLY. Shape and field meanings: js/core/element-data.js.
// Hand-editable, and rewritten whole by the geometry editor in exactly this format.
ElementData.define({
  pullout: {
    standard: {
      sku: 'ВЫДВ-СТ',
      label: 'Выдвижная подставка',
      supplierSku: '',
      supplierMark: '',
      parts: [
        { verts: [{x:242.5,y:0,bulge:0}, {x:242.5,y:281,bulge:0}, {x:-242.5,y:281,bulge:0}, {x:-242.5,y:0,bulge:0}], layer: 'PHYSICAL' },
        { verts: [{x:262.5,y:0,bulge:0}, {x:262.5,y:281,bulge:0}, {x:-262.5,y:281,bulge:0}, {x:-262.5,y:0,bulge:0}], layer: 'PHYSICAL' },
        { hole: { x: -255, y: 71, kind: 'B' } },
        { hole: { x: -255, y: 191, kind: 'B' } },
        { hole: { x: 255, y: 191, kind: 'B' } },
        { hole: { x: 255, y: 71, kind: 'B' } },
      ],
    },
    drawer: {
      sku: 'ВЫДВ-786',
      label: 'Выдвижной ящик',
      supplierSku: '',
      supplierMark: '',
      parts: [
        { verts: [{x:365,y:0,bulge:0}, {x:365,y:265,bulge:0}, {x:-365,y:265,bulge:0}, {x:-365,y:0,bulge:0}], layer: 'PHYSICAL' },
        { verts: [{x:393,y:0,bulge:0}, {x:393,y:265,bulge:0}, {x:-393,y:265,bulge:0}, {x:-393,y:0,bulge:0}], layer: 'PHYSICAL' },
        { hole: { x: -383, y: 75, kind: 'B' } },
        { hole: { x: -383, y: 225, kind: 'B' } },
        { hole: { x: 383, y: 225, kind: 'B' } },
        { hole: { x: 383, y: 75, kind: 'B' } },
      ],
    },
    drawer610: {
      sku: 'FT-DB0B4',
      label: 'Выдвижной ящик 610мм',
      supplierSku: '',
      supplierMark: '',
      parts: [
        { verts: [{x:265,y:0,bulge:0}, {x:265,y:252,bulge:0}, {x:-265,y:252,bulge:0}, {x:-265,y:0,bulge:0}], layer: 'PHYSICAL' },
        { verts: [{x:305,y:0,bulge:0}, {x:305,y:252,bulge:0}, {x:-305,y:252,bulge:0}, {x:-305,y:0,bulge:0}], layer: 'PHYSICAL' },
        { hole: { x: -295, y: 62, kind: 'B' } },
        { hole: { x: -295, y: 142, kind: 'B' } },
        { hole: { x: -295, y: 222, kind: 'B' } },
        { hole: { x: 295, y: 222, kind: 'B' } },
        { hole: { x: 295, y: 142, kind: 'B' } },
        { hole: { x: 295, y: 62, kind: 'B' } },
      ],
    },
  },
});
