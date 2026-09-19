// ============================================================================
// Regression test for a real bug: typing in the JSON editor hung the tab.
// Root cause: EditorState.notify() had no way to tell listeners WHERE a
// change came from, so every keystroke triggered the SAME full cycle as
// loading a brand new element: pushEditorToState() -> EditorState.setEntries()
// -> notify() -> main.js's onChange callback -> pushStateToEditor() ->
// jsonEditor.setValue(EditorState.toText()) -- replacing the ENTIRE
// document and re-tokenizing it on every single character typed. This
// is both far too slow on its own (hence the hang) and, depending on
// CodeMirror's own event timing, risked re-firing 'change' and looping.
//
// The fix: EditorState.notify(source) now tags each change with where it
// came from, and main.js skips pushStateToEditor() specifically when
// source === 'editor' (i.e. the change came from the person typing) while
// still pushing for every other source (loading an element, transforms,
// contour add/delete, sku/label edits).
//
// Run (from apps/geometry-editor/): npm test
//   or directly: node --import ../../alias-loader.mjs test/editor-typing-no-hang.test.js
//
// Uses real ES module imports against the actual project files (main.js
// included, via dynamic import below so it boots only once every DOM/
// CodeMirror stub is in place), with a minimal fake-DOM + fake-CodeMirror
// stub — no browser, no jsdom. The live CodeMirror INSTANCE main.js
// creates (previously reached via vm's shared module scope, accessing
// main.js's own module-private `jsonEditor` variable directly — not
// possible with real ES modules, where that variable is genuinely
// private) is instead captured by the fake CodeMirror.fromTextArea
// itself, since that mock is what constructs it.
// ============================================================================

class FakeClassList { constructor(){ this.set = new Set(); } add(){} remove(){} toggle(){} contains(){return false;} }
class FakeElement {
  constructor(tag){
    this.tagName = (tag||'div').toUpperCase(); this._attrs = {}; this._children = [];
    this._value = ''; this._html = ''; this.classList = new FakeClassList(); this.style = {};
    this._listeners = {}; this.dataset = {};
  }
  setAttribute(k,v){ this._attrs[k]=String(v); }
  getAttribute(k){ return this._attrs[k]; }
  appendChild(c){ this._children.push(c); return c; }
  set innerHTML(v){ this._html = v; this._children = []; }
  get innerHTML(){ return this._html; }
  set textContent(v){ this._text = v; }
  get textContent(){ return this._text || ''; }
  set value(v){ this._value = v; }
  get value(){ return this._value; }
  querySelectorAll(sel){ if (sel==='path') return (this._html.match(/<path[^>]*>/g)||[]).map(()=>new FakeElement('path')); return []; }
  addEventListener(type, fn){ (this._listeners[type]=this._listeners[type]||[]).push(fn); }
  dispatchEvent(type, ev){ (this._listeners[type]||[]).forEach(fn=>fn(ev||{})); }
  click(){ this.dispatchEvent('click', { stopPropagation(){} }); }
}
const elementsById = {};
function makeEl(id, tag){ const el = new FakeElement(tag); if (id) elementsById[id]=el; return el; }
[
  ['elemSelect','select'],['elemVariant','select'],['elemVariantGroup','div'],['kindPill','span'],
  ['fileInput','input'],['saveBtn','button'],['offsetX','input'],['offsetY','input'],['applyOffsetBtn','button'],
  ['rotateAngle','input'],['applyRotateBtn','button'],['mirrorHBtn','button'],['mirrorVBtn','button'],
  ['scopeSelected','input'],['previewMeta','div'],['preview','div'],['stage','svg'],['previewInfoBar','div'],
  ['status','div'],['zoomControls','div'],['zoomOutBtn','button'],['zoomResetBtn','button'],['zoomInBtn','button'],
  ['sideCol','div'],['metaFieldset','fieldset'],['skuInput','input'],['labelInput','input'],
  ['jsonEditor','textarea'],['jsonError','div'],['jsonEditorHost','div'],['mainCol','div'],['resizeHandle','div'],['app','div'],
].forEach(([id,tag])=>makeEl(id,tag));
const originGridButtons = ['tl','t','tr','l','c','r','bl','b','br'].map(pos=>{ const b=new FakeElement('button'); b.dataset.pos=pos; b._attrs['data-pos']=pos; return b; });
global.document = {
  getElementById: (id)=>elementsById[id]||null, createElement:(t)=>new FakeElement(t), createElementNS:(n,t)=>new FakeElement(t),
  querySelectorAll:(sel)=>sel==='.origin-grid button[data-pos]'?originGridButtons:[], addEventListener:()=>{}, removeEventListener:()=>{},
  body: (()=>{ const b=new FakeElement('body'); b.removeChild=()=>{}; return b; })(),
  readyState: 'complete',
};
global.window = global;

// Fake CodeMirror that COUNTS setValue calls, so we can assert it's NOT
// called while "typing" (source: 'editor'), and IS called for everything
// else. `capturedInstance` is how this test reaches the live instance
// main.js creates, WITHOUT needing access to main.js's own module-private
// `jsonEditor` variable (see this file's own header comment).
let setValueCallCount = 0;
let capturedInstance = null;
function FakeCodeMirror(textarea){ this._value = textarea.value||''; this._listeners = {}; }
FakeCodeMirror.prototype.setValue = function(v){ setValueCallCount++; this._value = v; (this._listeners.change||[]).forEach(fn=>fn()); };
FakeCodeMirror.prototype.getValue = function(){ return this._value; };
FakeCodeMirror.prototype.on = function(type, fn){ (this._listeners[type]=this._listeners[type]||[]).push(fn); };
FakeCodeMirror.prototype.refresh = function(){};
FakeCodeMirror.prototype.setCursor = function(){};
FakeCodeMirror.prototype.scrollIntoView = function(){};
FakeCodeMirror.prototype.addLineClass = function(){};
FakeCodeMirror.prototype.removeLineClass = function(){};
global.CodeMirror = { fromTextArea: (ta) => { capturedInstance = new FakeCodeMirror(ta); return capturedInstance; } };

global.URL = { createObjectURL:()=>'x', revokeObjectURL:()=>{} };
global.Blob = class {};
global.alert = ()=>{};
global.confirm = ()=>true;
global.FileReader = class { readAsText(){ this.onload && this.onload(); } };
global.DOMParser = class { parseFromString(){ return { querySelector:()=>null, querySelectorAll:()=>[] }; } };
global.requestAnimationFrame = (fn) => fn();

// main.js runs its own boot() (DOMContentLoaded-guarded, but
// document.readyState is 'complete' above, so it boots immediately on
// import) as a side effect of being imported — dynamic import here so
// every global stub above is in place first. boot() itself is async
// (it awaits the zoom.js dynamic import before calling init()), so the
// module's own top-level evaluation finishing does NOT mean init() has
// run yet — a couple of microtask turns are needed for that inner await
// to settle before this test can rely on CodeMirror.fromTextArea having
// been called.
await import('../js/main.js');
await new Promise(resolve => setTimeout(resolve, 0));
await new Promise(resolve => setTimeout(resolve, 0));

console.log('setValueCallCount after page load (blank geometry loaded):', setValueCallCount);
const afterLoad = setValueCallCount;

let failures = 0;
function fail(msg){ console.log('FAIL: ' + msg); failures++; }
function pass(msg){ console.log('PASS: ' + msg); }

// Simulate the person LOADING an element -- this SHOULD call setValue
// (the editor's text needs to show the new element's geometry).
elementsById['elemSelect'].value = 'pult';
elementsById['elemSelect'].dispatchEvent('change', {});
console.log('setValueCallCount after selecting an element:', setValueCallCount, '(should have increased)');
const afterElementLoad = setValueCallCount;
if (setValueCallCount <= afterLoad) fail('loading an element did not push to editor');
else pass('loading an element pushes the new geometry into the editor');

// Simulate TYPING in the editor -- get the live CodeMirror instance
// (captured above, at construction time), change its value and fire
// 'change' the way real typing would, THEN verify setValue was NOT
// called again as a result (that's the actual hang mechanism: typing ->
// setEntries -> notify -> setValue -> possible re-loop, or at minimum a
// full-document replace on every keystroke).
const cm = capturedInstance;
if (!cm) fail('no CodeMirror instance was captured — main.js never called CodeMirror.fromTextArea');
cm.setValue.call(cm, cm.getValue()); // this call itself increments the counter once, as a real "setValue from outside" would; we need to isolate the CHANGE event's own downstream effect instead
const beforeTyping = setValueCallCount;
// Now fire a 'change' event on the CM instance directly, simulating what
// CodeMirror does internally when a keystroke happens (NOT via our own
// setValue wrapper, which is the programmatic path) -- this exercises
// jsonEditor.on('change', ...) in main.js exactly like real typing would.
cm._listeners.change.forEach(fn => fn());
const afterTyping = setValueCallCount;
console.log('setValueCallCount before simulated typing:', beforeTyping);
console.log('setValueCallCount after simulated typing (should be UNCHANGED):', afterTyping);

if (afterTyping !== beforeTyping) {
  fail('typing triggered setValue (the hang mechanism) -- delta: ' + (afterTyping - beforeTyping));
} else {
  pass('typing in the editor does not trigger jsonEditor.setValue (no full-document replace / hang loop)');
}

// Sanity: applying a transform SHOULD still push to the editor (numbers
// must update after offset/rotate/mirror).
const beforeTransform = setValueCallCount;
originGridButtons.find(b => b.dataset.pos === 'c').click();
const afterTransform = setValueCallCount;
console.log('setValueCallCount before/after transform:', beforeTransform, afterTransform, '(should have increased)');
if (afterTransform <= beforeTransform) fail('transform did not push to editor');
else pass('transforms still correctly push updated text into the editor');

console.log(failures === 0 ? '\n=== ALL CHECKS PASSED ===' : `\n=== ${failures} CHECK(S) FAILED ===`);
process.exit(failures === 0 ? 0 : 1);
