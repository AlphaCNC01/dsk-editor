// ============================================================================
// Regression test for a real bug found during development: Render.render()
// used to derive its SVG viewBox's Y-origin from `H`, where `H` was itself
// computed as `maxY + pad` -- i.e. FROM the geometry's own current position.
// Translating a shape in Y also shifted H by the same amount, which
// silently cancelled out in the viewBox math, so the rendered picture
// never visibly moved even though the underlying coordinates genuinely
// changed (confirmed via Transform.combinedExtents while the on-screen
// viewBox stayed byte-identical across renders).
//
// Run: node geometry-editor/test/render-viewbox.test.js   (from repo root)
//
// This loads the real project files into a vm sandbox (same approach as
// the rest of this project's own Node vm.createContext harness
// convention), with a minimal DOM stub -- no browser, no jsdom.
// ============================================================================
const vm = require('vm');
const fs = require('fs');
const path = require('path');

class FakeClassList {
  constructor(){ this.set = new Set(); }
  add(){} remove(){} toggle(){} contains(){ return false; }
}
class FakeEl {
  constructor(){ this._attrs = {}; this.classList = new FakeClassList(); }
  setAttribute(k, v){ this._attrs[k] = String(v); }
  getAttribute(k){ return this._attrs[k]; }
  appendChild(){}
  addEventListener(){}
  set innerHTML(v){ this._html = v; }
  get innerHTML(){ return this._html || ''; }
  querySelectorAll(){ return (this._html.match(/<path[^>]*>/g) || []).map(() => new FakeEl()); }
}
const fakeDocument = {
  getElementById: () => null,
  createElement: () => new FakeEl(),
  createElementNS: () => new FakeEl(),
};
const ctx = { document: fakeDocument, console };
vm.createContext(ctx);

const root = path.join(__dirname, '..', '..'); // repo root, from geometry-editor/test/
const files = [
  'js/core/geo.js', 'js/core/layers.js', 'js/core/elements.js', 'js/core/drawing.js',
  'js/elements/tabletop.js', 'js/elements/underframe.js', 'js/elements/pult.js',
  'js/elements/wireless-charger.js', 'js/elements/outlet-block.js', 'js/elements/phone-stand.js',
  'js/elements/tray.js', 'js/elements/pullout.js', 'js/elements/usb-charger.js',
  'js/elements/cable-pocket.js', 'js/elements/cable-channels.js', 'js/render/svg.js',
  'geometry-editor/js/registry.js', 'geometry-editor/js/editor-state.js',
  'geometry-editor/js/transform.js', 'geometry-editor/js/render.js',
];
for (const f of files) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}

function firstPathCoords(html){
  const dMatch = html.match(/d="([^"]+)"/);
  if (!dMatch) return null;
  const m = dMatch[1].match(/M\s*(-?[\d.]+)\s+(-?[\d.]+)/);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
}

function loadTestShape(x, y){
  const groups = [{ name: 'p', layer: 'PHYSICAL', contours: [[
    { x: x - 10, y: y, bulge: 0 }, { x: x + 10, y: y, bulge: 0 },
    { x: x + 10, y: y + 20, bulge: 0 }, { x: x - 10, y: y + 20, bulge: 0 },
  ]] }];
  ctx.__groups = groups;
  vm.runInContext(`EditorState.load({ elementId: null, variantKey: null, kind: 'repeatable', sku: '', label: '', groups: __groups, passthrough: {} })`, ctx);
}

const stage = new FakeEl();
ctx.__stage = stage;
ctx.__status = { textContent: '', classList: { toggle(){} } };
ctx.__info = { textContent: '' };
ctx.__centerInfo = { textContent: '' };
vm.runInContext(`Render.init({ svg: __stage, status: __status, info: __info, centerInfo: __centerInfo })`, ctx);

let failures = 0;
function check(name, cond, detail){
  if (cond) console.log('PASS: ' + name);
  else { console.log('FAIL: ' + name + (detail ? ' -- ' + JSON.stringify(detail) : '')); failures++; }
}

// --- Y-axis case ---
loadTestShape(200, 200);
vm.runInContext('Render.render()', ctx);
const yHtml1 = stage.innerHTML, yVb1 = stage.getAttribute('viewBox').split(' ').map(Number);
const yC1 = firstPathCoords(yHtml1);

vm.runInContext(`Transform.offset('all', 0, 100)`, ctx);
vm.runInContext('Render.render()', ctx);
const yHtml2 = stage.innerHTML, yVb2 = stage.getAttribute('viewBox').split(' ').map(Number);
const yC2 = firstPathCoords(yHtml2);

const yRelBefore = (yC1[1] - yVb1[1]) / yVb1[3];
const yRelActual = (yC2[1] - yVb2[1]) / yVb2[3];
const yRelFrozen = (yC2[1] - yVb1[1]) / yVb1[3]; // counterfactual: shape's NEW coords against the OLD viewBox
check(
  'Y translation: real viewBox differs meaningfully from a frozen-viewBox counterfactual',
  Math.abs(yRelActual - yRelFrozen) > 0.15,
  { yRelBefore, yRelActual, yRelFrozen }
);

// --- X-axis case ---
loadTestShape(200, 200);
vm.runInContext('Render.render()', ctx);
const xHtml1 = stage.innerHTML, xVb1 = stage.getAttribute('viewBox').split(' ').map(Number);
const xC1 = firstPathCoords(xHtml1);

vm.runInContext(`Transform.offset('all', 100, 0)`, ctx);
vm.runInContext('Render.render()', ctx);
const xHtml2 = stage.innerHTML, xVb2 = stage.getAttribute('viewBox').split(' ').map(Number);
const xC2 = firstPathCoords(xHtml2);

const xRelActual = (xC2[0] - xVb2[0]) / xVb2[2];
const xRelFrozen = (xC2[0] - xVb1[0]) / xVb1[2];
check(
  'X translation: real viewBox differs meaningfully from a frozen-viewBox counterfactual',
  Math.abs(xRelActual - xRelFrozen) > 0.15,
  { xRelActual, xRelFrozen }
);

// --- Sanity: the underlying geometry itself really did move (Transform correctness) ---
const box1 = vm.runInContext(`(function(){ EditorState.load({elementId:null,variantKey:null,kind:'repeatable',sku:'',label:'',groups:[{name:'p',layer:'PHYSICAL',contours:[[{x:0,y:0,bulge:0},{x:10,y:0,bulge:0},{x:10,y:10,bulge:0},{x:0,y:10,bulge:0}]]}],passthrough:{}}); return Transform.combinedExtents('all'); })()`, ctx);
vm.runInContext(`Transform.offset('all', 5, 5)`, ctx);
const box2 = vm.runInContext(`Transform.combinedExtents('all')`, ctx);
check('Transform.offset actually shifts the geometry (sanity check)', box2.minX === box1.minX + 5 && box2.minY === box1.minY + 5, { box1, box2 });

console.log(failures === 0 ? '\n=== ALL CHECKS PASSED ===' : `\n=== ${failures} CHECK(S) FAILED ===`);
process.exit(failures === 0 ? 0 : 1);
