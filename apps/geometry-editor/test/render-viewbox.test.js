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
// Run (from apps/geometry-editor/): npm test
//   or directly: node --import ../../alias-loader.mjs test/render-viewbox.test.js
//
// Uses real ES module imports against the actual project files, with a
// minimal DOM stub (Render.init/Render.render only ever call a handful
// of Element/document methods — no browser, no jsdom needed).
// ============================================================================
import '@elements/index.js'; // side-effect: registers every element (Render.init/render don't need this directly, but importing it here keeps this test's own module graph consistent with the rest of the app)
import { EditorState } from '../js/editor-state.js';
import { Transform } from '../js/transform.js';
import { Render } from '../js/render.js';

class FakeClassList {
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
global.document = {
  getElementById: () => null,
  createElement: () => new FakeEl(),
  createElementNS: () => new FakeEl(),
};

function firstPathCoords(html){
  const dMatch = html.match(/d="([^"]+)"/);
  if (!dMatch) return null;
  const m = dMatch[1].match(/M\s*(-?[\d.]+)\s+(-?[\d.]+)/);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
}

function loadTestShape(x, y){
  const entries = [{ layer: 'PHYSICAL', verts: [
    { x: x - 10, y: y, bulge: 0 }, { x: x + 10, y: y, bulge: 0 },
    { x: x + 10, y: y + 20, bulge: 0 }, { x: x - 10, y: y + 20, bulge: 0 },
  ] }];
  EditorState.load({ elementId: null, variantKey: null, kind: 'repeatable', sku: '', label: '', entries, passthrough: {} });
}

const stage = new FakeEl();
const status = { textContent: '', classList: { toggle(){} } };
const info = { textContent: '' };
const centerInfo = { textContent: '' };
Render.init({ svg: stage, status, info, centerInfo });

let failures = 0;
function check(name, cond, detail){
  if (cond) console.log('PASS: ' + name);
  else { console.log('FAIL: ' + name + (detail ? ' -- ' + JSON.stringify(detail) : '')); failures++; }
}

// --- Y-axis case ---
loadTestShape(200, 200);
Render.render();
const yHtml1 = stage.innerHTML, yVb1 = stage.getAttribute('viewBox').split(' ').map(Number);
const yC1 = firstPathCoords(yHtml1);

Transform.offset('all', 0, 100);
Render.render();
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
Render.render();
const xHtml1 = stage.innerHTML, xVb1 = stage.getAttribute('viewBox').split(' ').map(Number);
const xC1 = firstPathCoords(xHtml1);

Transform.offset('all', 100, 0);
Render.render();
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
EditorState.load({ elementId: null, variantKey: null, kind: 'repeatable', sku: '', label: '', entries: [{ layer: 'PHYSICAL', verts: [{ x: 0, y: 0, bulge: 0 }, { x: 10, y: 0, bulge: 0 }, { x: 10, y: 10, bulge: 0 }, { x: 0, y: 10, bulge: 0 }] }], passthrough: {} });
const box1 = Transform.combinedExtents('all');
Transform.offset('all', 5, 5);
const box2 = Transform.combinedExtents('all');
check('Transform.offset actually shifts the geometry (sanity check)', box2.minX === box1.minX + 5 && box2.minY === box1.minY + 5, { box1, box2 });

console.log(failures === 0 ? '\n=== ALL CHECKS PASSED ===' : `\n=== ${failures} CHECK(S) FAILED ===`);
process.exit(failures === 0 ? 0 : 1);
