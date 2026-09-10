// ============================================================================
// Regression test for a real bug: typing in the JSON editor hung the tab.
// Root cause: EditorState.notify() had no way to tell listeners WHERE a
// change came from, so every keystroke triggered the SAME full cycle as
// loading a brand new element: pushEditorToState() -> EditorState.setGroups()
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
// Run: node geometry-editor/test/editor-typing-no-hang.test.js
// ============================================================================

const vm = require('vm');
const fs = require('fs');

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
  ['sideCol','div'],['metaFieldset','fieldset'],['skuInput','input'],['labelInput','input'],['contourCount','span'],
  ['contourList','div'],['addContourRow','div'],['newContourLayer','select'],['addContourBtn','button'],
  ['jsonEditor','textarea'],['jsonError','div'],['jsonEditorHost','div'],['mainCol','div'],['resizeHandle','div'],['app','div'],
].forEach(([id,tag])=>makeEl(id,tag));
const originGridButtons = ['tl','t','tr','l','c','r','bl','b','br'].map(pos=>{ const b=new FakeElement('button'); b.dataset.pos=pos; b._attrs['data-pos']=pos; return b; });
const fakeDocument = {
  getElementById: (id)=>elementsById[id]||null, createElement:(t)=>new FakeElement(t), createElementNS:(n,t)=>new FakeElement(t),
  querySelectorAll:(sel)=>sel==='.origin-grid button[data-pos]'?originGridButtons:[], addEventListener:()=>{}, removeEventListener:()=>{},
  body: (()=>{ const b=new FakeElement('body'); b.removeChild=()=>{}; return b; })(),
};

// Fake CodeMirror that COUNTS setValue calls, so we can assert it's NOT
// called while "typing" (source: 'editor'), and IS called for everything
// else.
let setValueCallCount = 0;
function FakeCodeMirror(textarea){ this._value = textarea.value||''; this._listeners = {}; }
FakeCodeMirror.prototype.setValue = function(v){ setValueCallCount++; this._value = v; (this._listeners.change||[]).forEach(fn=>fn()); };
FakeCodeMirror.prototype.getValue = function(){ return this._value; };
FakeCodeMirror.prototype.on = function(type, fn){ (this._listeners[type]=this._listeners[type]||[]).push(fn); };
FakeCodeMirror.prototype.refresh = function(){};
const CodeMirror = { fromTextArea: (ta) => new FakeCodeMirror(ta) };

const ctx = {
  document: fakeDocument, console, window: {}, CodeMirror,
  URL: { createObjectURL:()=>'x', revokeObjectURL:()=>{} }, Blob: class{},
  setTimeout, alert:()=>{}, confirm:()=>true,
  FileReader: class { readAsText(){ this.onload && this.onload(); } },
  DOMParser: class { parseFromString(){ return { querySelector:()=>null, querySelectorAll:()=>[] }; } },
  requestAnimationFrame: (fn) => fn(),
};
vm.createContext(ctx);

const files = [
  'js/core/geo.js','js/core/layers.js','js/core/elements.js','js/core/drawing.js',
  'js/elements/tabletop.js','js/elements/hole.js','js/elements/underframe.js','js/elements/pult.js',
  'js/elements/wireless-charger.js','js/elements/outlet-block.js','js/elements/phone-stand.js',
  'js/elements/tray.js','js/elements/pullout.js','js/elements/usb-charger.js',
  'js/elements/cable-pocket.js','js/elements/cable-channels.js','js/render/svg.js',
  'geometry-editor/js/ui-shim.js','geometry-editor/js/zoom.js',
  'geometry-editor/js/registry.js','geometry-editor/js/editor-state.js','geometry-editor/js/transform.js','geometry-editor/js/render.js',
  'geometry-editor/js/contour-list.js','geometry-editor/js/save.js','geometry-editor/js/svg-import.js','geometry-editor/js/main.js',
];
for (const f of files) vm.runInContext(fs.readFileSync(f,'utf8'), ctx, { filename: f });

console.log('setValueCallCount after page load (blank geometry loaded):', setValueCallCount);
const afterLoad = setValueCallCount;

// Simulate the person LOADING an element -- this SHOULD call setValue
// (the editor's text needs to show the new element's geometry).
elementsById['elemSelect'].value = 'pult';
elementsById['elemSelect'].dispatchEvent('change', {});
console.log('setValueCallCount after selecting an element:', setValueCallCount, '(should have increased)');
const afterElementLoad = setValueCallCount;
if (setValueCallCount <= afterLoad) { console.log('FAIL: loading an element did not push to editor'); process.exit(1); }

// Simulate TYPING in the editor -- get the live CodeMirror instance,
// change its value and fire 'change' the way real typing would, THEN
// verify setValue was NOT called again as a result (that's the actual
// hang mechanism: typing -> setGroups -> notify -> setValue -> possible
// re-loop, or at minimum a full-document replace on every keystroke).
const cm = vm.runInContext('jsonEditor', ctx); // the module-scope `jsonEditor` variable in main.js
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
  console.log('FAIL: typing triggered setValue (the hang mechanism) -- delta:', afterTyping - beforeTyping);
  process.exit(1);
}
console.log('PASS: typing in the editor does not trigger jsonEditor.setValue (no full-document replace / hang loop)');

// Sanity: applying a transform SHOULD still push to the editor (numbers
// must update after offset/rotate/mirror).
const beforeTransform = setValueCallCount;
originGridButtons.find(b => b.dataset.pos === 'c').click();
const afterTransform = setValueCallCount;
console.log('setValueCallCount before/after transform:', beforeTransform, afterTransform, '(should have increased)');
if (afterTransform <= beforeTransform) { console.log('FAIL: transform did not push to editor'); process.exit(1); }
console.log('PASS: transforms still correctly push updated text into the editor');
