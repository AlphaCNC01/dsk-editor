// ============================================================================
// Test for js/ui/app-history.js: session-keyed upsert (editing the same
// project updates one entry rather than duplicating it), new-session
// forking on explicit project switches, MAX_HISTORY_ENTRIES capping,
// dropdown open/close, row-click-to-load, and the per-row delete button.
// Run: node js/ui/test/app-history.test.js
// ============================================================================

const vm = require('vm');
const fs = require('fs');
const path = require('path');

// ---------- fake localStorage ----------
class FakeStorage {
  constructor(){ this._data = {}; }
  getItem(k){ return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null; }
  setItem(k, v){ this._data[k] = String(v); }
  removeItem(k){ delete this._data[k]; }
}

// ---------- minimal fake DOM ----------
// Just enough to support: classList.add/remove/contains, setAttribute,
// addEventListener/dispatch, innerHTML assignment (clears children),
// appendChild, querySelector('.history-action-btn.delete'), dataset,
// textContent (with basic HTML-escaping semantics via innerHTML getter).
class FakeClassList {
  constructor(){ this.set = new Set(); }
  add(c){ this.set.add(c); }
  remove(c){ this.set.delete(c); }
  contains(c){ return this.set.has(c); }
}
class FakeEl {
  constructor(tag){
    this.tag = tag;
    this.classList = new FakeClassList();
    this._listeners = {};
    this._attrs = {};
    this._children = [];
    this.dataset = {};
    this._text = '';
  }
  addEventListener(type, fn){ (this._listeners[type] = this._listeners[type] || []).push(fn); }
  fire(type, ev){ (this._listeners[type] || []).slice().forEach(fn => fn(ev || {})); }
  setAttribute(k, v){ this._attrs[k] = v; }
  getAttribute(k){ return this._attrs[k]; }
  appendChild(child){ this._children.push(child); return child; }
  set innerHTML(v){
    if (v === '') { this._children = []; return; }
    // Only used by app-history.js for a single row's inner markup; store
    // it and provide a fake delete-button child via querySelector below.
    this._innerHTMLRaw = v;
    this._deleteBtn = new FakeEl('button');
  }
  get innerHTML(){ return this._innerHTMLRaw || ''; }
  querySelector(sel){
    if (sel === '.history-action-btn.delete') return this._deleteBtn;
    return null;
  }
  set textContent(v){ this._text = v; }
  get textContent(){ return this._text; }
  contains(other){ return other === this || this._children.includes(other); }
}

const orderSplit = new FakeEl('div');
const historyMenu = new FakeEl('div');
const historyMenuToggle = new FakeEl('button');
const historyList = new FakeEl('div');
const historyEmpty = new FakeEl('div');
historyEmpty.style = { display: '' };
const controls = new FakeEl('div');
const orderNumberInput = Object.assign(new FakeEl('input'), { type: 'text', value: 'DSK-001' });

const elementsById = {
  orderSplit, historyMenu, historyMenuToggle, historyList, controls,
};

const fakeDocument = {
  getElementById: (id) => elementsById[id] || null,
  createElement: (tag) => new FakeEl(tag),
  querySelector: (sel) => (sel === '.history-empty' ? historyEmpty : null),
  _listeners: {},
  addEventListener(type, fn){ (this._listeners[type] = this._listeners[type] || []).push(fn); },
  fire(type, ev){ (this._listeners[type] || []).slice().forEach(fn => fn(ev || {})); },
};

// ---------- fake UI namespace (mirrors what app-project.js exposes) ----------
let currentProjectData = {
  fileType: 'tabletop-layout-project',
  version: 1,
  values: { orderNumber: 'DSK-001' },
  instances: {},
};

const UI = {
  el: (id) => elementsById[id],
  inputs: { orderNumber: orderNumberInput }, // minimal; app-history.js only needs Object.values() to iterate
  buildProjectData: () => currentProjectData,
  applyProjectData: (data) => { currentProjectData = data; },
};

const ctx = {
  document: fakeDocument,
  UI,
  console,
  localStorage: new FakeStorage(),
  crypto: { randomUUID: (() => { let n = 0; return () => 'uuid-' + (n++); })() },
  setTimeout, clearTimeout, Date,
};
vm.createContext(ctx);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'app-history.js'), 'utf8'),
  ctx,
  { filename: 'app-history.js' }
);

let failures = 0;
function check(label, cond){
  console.log((cond ? 'PASS' : 'FAIL') + ': ' + label);
  if (!cond) failures++;
}

function historyEntries(){
  const raw = ctx.localStorage.getItem('dskEditor.history.v1');
  return raw ? JSON.parse(raw) : [];
}

// ---------- 1) upsert creates one entry ----------
ctx.UI.upsertHistoryEntry();
check('one entry after first upsert', historyEntries().length === 1);
check('entry carries orderNumber', historyEntries()[0].orderNumber === 'DSK-001');
const firstId = historyEntries()[0].id;
check('entry id matches current session', firstId === ctx.UI.historySessionId);
check('one row rendered in the menu list', historyList._children.length === 1);

// ---------- 2) editing the same session updates in place, not duplicates ----------
currentProjectData = { ...currentProjectData, values: { orderNumber: 'DSK-001-edited' } };
ctx.UI.upsertHistoryEntry();
check('still one entry after editing same session', historyEntries().length === 1);
check('entry reflects the edit', historyEntries()[0].orderNumber === 'DSK-001-edited');

// ---------- 3) starting a new session forks a new entry ----------
ctx.UI.startNewHistorySession();
check('session id changed', ctx.UI.historySessionId !== firstId);
currentProjectData = { ...currentProjectData, values: { orderNumber: 'DSK-002' } };
ctx.UI.upsertHistoryEntry();
check('two entries after new session upsert', historyEntries().length === 2);
check('newest entry is first (most-recent-first)', historyEntries()[0].orderNumber === 'DSK-002');
check('two rows rendered in the menu list', historyList._children.length === 2);

// ---------- 4) dropdown open/close ----------
historyMenuToggle.fire('click', { stopPropagation(){} });
check('menu opens on toggle click', historyMenu.classList.contains('open'));
check('aria-expanded reflects open state', historyMenuToggle.getAttribute('aria-expanded') === 'true');
fakeDocument.fire('click', { target: new FakeEl('body') }); // click outside orderSplit
check('menu closes on outside click', !historyMenu.classList.contains('open'));
historyMenuToggle.fire('click', { stopPropagation(){} });
check('menu re-opens on toggle click', historyMenu.classList.contains('open'));
fakeDocument.fire('click', { target: orderSplit }); // click inside orderSplit doesn't close it
check('menu stays open on click inside orderSplit', historyMenu.classList.contains('open'));

// ---------- 5) MAX_HISTORY_ENTRIES caps the list ----------
for (let i = 0; i < 25; i++) {
  ctx.UI.startNewHistorySession();
  currentProjectData = { ...currentProjectData, values: { orderNumber: 'DSK-bulk-' + i } };
  ctx.UI.upsertHistoryEntry();
}
check('history capped at 20 entries', historyEntries().length === 20);
check('most recent bulk entry is first', historyEntries()[0].orderNumber === 'DSK-bulk-24');

// ---------- 6) clicking a row loads it and resumes its session, and closes the menu ----------
const listBeforePick = historyEntries();
const targetEntry = listBeforePick[listBeforePick.length - 1]; // oldest surviving entry
const targetRow = historyList._children.find(row => row.dataset.id === targetEntry.id);
check('target row exists in rendered menu', !!targetRow);
targetRow.fire('click');
check('applyProjectData was called with the selected entry', JSON.stringify(currentProjectData) === JSON.stringify(targetEntry.data));
check('history session resumes the picked entry (not a new fork)', ctx.UI.historySessionId === targetEntry.id);
check('menu closes after picking an entry', !historyMenu.classList.contains('open'));

// ---------- 7) delete button removes just that entry, without loading it ----------
historyMenuToggle.fire('click', { stopPropagation(){} }); // reopen
const beforeDeleteCount = historyEntries().length;
const rowToDelete = historyList._children[0];
const idBeingDeleted = rowToDelete.dataset.id;
const sessionBeforeDelete = ctx.UI.historySessionId;
rowToDelete._deleteBtn.fire('click', { stopPropagation(){} });
check('one fewer entry after delete', historyEntries().length === beforeDeleteCount - 1);
check('deleted id is gone from history', !historyEntries().some(e => e.id === idBeingDeleted));
check('deleting a row does not load it (session unchanged)', ctx.UI.historySessionId === sessionBeforeDelete);

// ---------- 8) empty state ----------
while (historyEntries().length) {
  const id = historyEntries()[0].id;
  const row = historyList._children.find(r => r.dataset.id === id);
  if (row) row._deleteBtn.fire('click', { stopPropagation(){} });
  else break;
}
check('history empty after deleting everything', historyEntries().length === 0);
check('empty-state element shown', historyEmpty.style.display === 'block');

console.log(failures === 0 ? '\n=== ALL APP-HISTORY CHECKS PASSED ===' : `\n=== ${failures} CHECK(S) FAILED ===`);
process.exit(failures === 0 ? 0 : 1);
