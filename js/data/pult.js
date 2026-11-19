// pult — variants DATA ONLY. Shape and field meanings: js/core/element-data.js.
// Hand-editable, and rewritten whole by the geometry editor in exactly this format.
ElementData.define({
  pult: {
    standard: {
      sku: 'ST',
      label: 'Пульт ST',
      supplierSku: '',
      supplierMark: '',
      parts: [
        { verts: [{x:-45,y:50,bulge:0}, {x:-45,y:0,bulge:0}, {x:45,y:0,bulge:0}, {x:45,y:50,bulge:0}], layer: 'PHYSICAL' },
        { hole: { x: -30, y: 30, kind: 'B' } },
        { hole: { x: 30, y: 30, kind: 'B' } },
      ],
    },
    sensor: {
      sku: 'сенсорный',
      label: 'Сенсорный пульт',
      supplierSku: '',
      supplierMark: '',
      parts: [
        { hole: { x: -30.799999999999997, y: 33.7, kind: 'B' } },
        { hole: { x: 30.799999999999997, y: 33.7, kind: 'B' } },
        { verts: [{x:-37,y:58.4,bulge:0}, {x:-37,y:0,bulge:0}, {x:37,y:0,bulge:0}, {x:37,y:58.4,bulge:0.414214}, {x:32,y:63.4,bulge:0}, {x:-32,y:63.4,bulge:0.414214}], layer: 'PHYSICAL' },
        { verts: [{x:-37,y:0,bulge:0}, {x:-37,y:-20.9,bulge:0.414214}, {x:-22,y:-35.9,bulge:0}, {x:22,y:-35.9,bulge:0.414214}, {x:37,y:-20.9,bulge:0}, {x:37,y:0,bulge:0}], layer: 'PHYSICAL' },
      ],
    },
    embeddedUsb: {
      sku: 'SST',
      label: 'Встроенный пульт SST',
      supplierSku: '',
      supplierMark: '',
      parts: [
        { verts: [{x:-36,y:41,bulge:-0.414214}, {x:-41,y:36,bulge:0}, {x:-76.5,y:36,bulge:0.414214}, {x:-80.5,y:32,bulge:0}, {x:-80.5,y:22,bulge:0.414214}, {x:-76.5,y:18,bulge:0}, {x:76.5,y:18,bulge:0.414214}, {x:80.5,y:22,bulge:0}, {x:80.5,y:32,bulge:0.414214}, {x:76.5,y:36,bulge:0}, {x:-13,y:36,bulge:-0.414214}, {x:-18,y:41,bulge:0}, {x:-18,y:46,bulge:0.414214}, {x:-23,y:51,bulge:0}, {x:-31,y:51,bulge:0.414214}, {x:-36,y:46,bulge:0}], layer: 'EMBEDED_USB_POCKET' },
        { verts: [{x:-79,y:34,bulge:0}, {x:-79,y:0,bulge:0}, {x:79,y:0,bulge:0}, {x:79,y:34,bulge:0}], layer: 'PHYSICAL' },
      ],
      cableNode: { x: -27, y: 51, dir: { x: 0, y: 1 } },
    },
    moveDeskMax: {
      sku: 'DM70',
      label: 'Пульт DM70',
      supplierSku: '',
      supplierMark: '',
      parts: [
        { verts: [{x:-65,y:-25,bulge:0}, {x:65,y:-25,bulge:0}, {x:65,y:40,bulge:0}, {x:-65,y:40,bulge:0}], layer: 'PHYSICAL' },
        { verts: [{x:-65,y:0,bulge:0}, {x:65,y:0,bulge:0}, {x:65,y:40,bulge:0}, {x:-65,y:40,bulge:0}], layer: 'PHYSICAL' },
        { hole: { x: -48, y: 25, kind: 'B' } },
        { hole: { x: 48, y: 25, kind: 'B' } },
      ],
    },
    rivalHome: {
      sku: 'RH60',
      label: 'Пульт RH60',
      supplierSku: '',
      supplierMark: '',
      parts: [
        { verts: [{x:-67,y:-20,bulge:0}, {x:67,y:-20,bulge:0}, {x:67,y:50,bulge:0}, {x:-67,y:50,bulge:0}], layer: 'PHYSICAL' },
        { verts: [{x:-67,y:0,bulge:0}, {x:67,y:0,bulge:0}, {x:67,y:50,bulge:0}, {x:-67,y:50,bulge:0}], layer: 'PHYSICAL' },
        { hole: { x: -52.5, y: 25, kind: 'B' } },
        { hole: { x: 52.5, y: 25, kind: 'B' } },
      ],
    },
    dmdf: {
      sku: 'DMDF MC-DNELC03',
      label: 'Пульт DMDF',
      supplierSku: '',
      supplierMark: '',
      parts: [
        { verts: [{x:-64,y:0,bulge:0}, {x:64,y:0,bulge:0}, {x:64,y:28,bulge:0}, {x:-64,y:28,bulge:0}], layer: 'PHYSICAL' },
        { verts: [{x:-64,y:-20,bulge:0}, {x:64,y:-20,bulge:1}, {x:64,y:0,bulge:0}, {x:-64,y:0,bulge:1}], layer: 'PHYSICAL' },
        { hole: { x: -48.75, y: 20, kind: 'B' } },
        { hole: { x: 48.75, y: 20, kind: 'B' } },
      ],
    },
  },
});
