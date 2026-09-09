// ============================================================================
// Test for the sideCol drag-to-resize handle (js/resize.js): drag
// direction, min/max width clamping, drag-stop behavior, and the
// double-click reset. Run: node geometry-editor/test/resize.test.js
// ============================================================================

const vm = require('vm');
const fs = require('fs');

class FakeClassList { constructor(){ this.set = new Set(); } add(c){ this.set.add(c); } remove(c){ this.set.delete(c); } contains(c){ return this.set.has(c); } }
class FakeStyle {
  constructor(){ this._props = {}; }
  setProperty(k, v){ this._props[k] = v; }
  getPropertyValue(k){ return this._props[k] || ''; }
}
class FakeElement {
  constructor(){ this.classList = new FakeClassList(); this.style = new FakeStyle(); this._listeners = {}; }
  addEventListener(type, fn){ (this._listeners[type] = this._listeners[type] || []).push(fn); }
  dispatchEvent(type, ev){ (this._listeners[type] || []).forEach(fn => fn(ev)); }
}
const handle = new FakeElement();
const app = new FakeElement();
app.style.setProperty('--side-col-width', '380px');
const body = new FakeElement();

const elementsById = { resizeHandle: handle, app: app };
const fakeDocument = {
  getElementById: (id) => elementsById[id] || null,
  addEventListener: (type, fn) => { (fakeDocument._listeners = fakeDocument._listeners || {})[type] = (fakeDocument._listeners[type]||[]).concat(fn); },
  readyState: 'complete',
  body,
};
const ctx = {
  document: fakeDocument, console,
  getComputedStyle: (el) => ({ getPropertyValue: (k) => el.style.getPropertyValue(k) }),
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('geometry-editor/js/resize.js', 'utf8'), ctx, { filename: 'resize.js' });

function currentWidthPx(){
  return parseFloat(app.style.getPropertyValue('--side-col-width'));
}

console.log('initial width:', currentWidthPx());

// Simulate mousedown on handle at x=500, then move to x=400 (dragged LEFT
// by 100px) -- per the resize.js logic this should WIDEN the side column
// by 100px (handle is to its left).
handle.dispatchEvent('mousedown', { clientX: 500, preventDefault(){} });
fakeDocument.dispatchEvent = undefined; // document doesn't have dispatchEvent in this stub; mousemove/mouseup are registered on `document` itself, not `handle`
// resize.js registers mousemove/mouseup on `document`, so simulate via document's own listener list
function fireDocEvent(type, ev){ (fakeDocument._listeners[type]||[]).forEach(fn => fn(ev)); }
fireDocEvent('mousemove', { clientX: 400 });
console.log('width after dragging left by 100px (should be 480):', currentWidthPx());
if (currentWidthPx() !== 480) { console.log('FAIL: expected 480'); process.exit(1); }

fireDocEvent('mousemove', { clientX: 700 }); // now drag back right, past the start point by 200px total from x=500
console.log('width after dragging right past start (should be 200 -> clamped to MIN 260):', currentWidthPx());
if (currentWidthPx() !== 260) { console.log('FAIL: expected clamped 260'); process.exit(1); }

fireDocEvent('mousemove', { clientX: -1000 }); // drag far left -- should clamp to MAX
console.log('width after dragging far left (should clamp to MAX 720):', currentWidthPx());
if (currentWidthPx() !== 720) { console.log('FAIL: expected clamped 720'); process.exit(1); }

fireDocEvent('mouseup', {});
console.log('dragging class removed after mouseup:', !handle.classList.contains('dragging'));

// After mouseup, further mousemove should NOT change width (dragging stopped)
const widthAfterStop = currentWidthPx();
fireDocEvent('mousemove', { clientX: 100 });
console.log('width unchanged after mouseup + further mousemove:', currentWidthPx() === widthAfterStop);
if (currentWidthPx() !== widthAfterStop) { console.log('FAIL: drag continued after mouseup'); process.exit(1); }

// Double-click resets to default
handle.dispatchEvent('dblclick', {});
console.log('width after double-click reset (should be 380):', currentWidthPx());
if (currentWidthPx() !== 380) { console.log('FAIL: expected reset to 380'); process.exit(1); }

console.log('\n=== ALL RESIZE CHECKS PASSED ===');
