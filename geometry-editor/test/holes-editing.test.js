// ============================================================================
// Regression test for geometry-editor's hole support: recognizing hole+
// counterbore pairs (see Holes.at in js/elements/hole.js) as a single
// editable { hole: {x,y,kind} } entry when loading a real element, round-
// tripping that through the text pane's ...Holes.at(x,y,'kind') syntax
// (which is now EXACTLY the parts:[...] body of a real element file — see
// EditorState's own header comment), transforming a hole via Transform
// (offset/mirror), and generating a parts[] snippet that still reads as
// ...Holes.at(...) rather than raw {verts,layer} contours.
//
// Run: node geometry-editor/test/holes-editing.test.js   (from repo root)
// ============================================================================
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const fakeDocument = {
  getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute(){}, appendChild(){}, addEventListener(){} }),
  createElementNS: () => ({ style: {}, setAttribute(){}, appendChild(){}, addEventListener(){} }),
};
const ctx = { document: fakeDocument, console };
vm.createContext(ctx);

const root = path.join(__dirname, '..', '..'); // repo root
const files = [
  'js/core/geo.js', 'js/core/layers.js', 'js/core/elements.js', 'js/core/drawing.js',
  'js/elements/tabletop.js', 'js/elements/hole.js', 'js/elements/underframe.js', 'js/elements/pult.js',
  'js/elements/wireless-charger.js', 'js/elements/outlet-block.js', 'js/elements/phone-stand.js',
  'js/elements/tray.js', 'js/elements/pullout.js', 'js/elements/usb-charger.js',
  'js/elements/cable-pocket.js', 'js/elements/cable-channels.js', 'js/render/svg.js',
  'geometry-editor/js/registry.js', 'geometry-editor/js/editor-state.js',
  'geometry-editor/js/transform.js', 'geometry-editor/js/save.js',
];
for (const f of files) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}

let failures = 0;
function check(name, cond, detail){
  if (cond) console.log('PASS: ' + name);
  else { console.log('FAIL: ' + name + (detail ? ' -- ' + JSON.stringify(detail) : '')); failures++; }
}

// --- 1. Loading a real element recognizes hole/cs pairs as hole entries ---
const normalized = vm.runInContext(
  `Registry.normalizeVariant(Elements.all().find(e => e.id === 'pult'), 'standard')`, ctx
);
const holeEntries = normalized.entries.filter(e => e.hole);
check('pult/standard: at least one hole entry recognized', holeEntries.length >= 1, { count: holeEntries.length, entries: normalized.entries });
check('pult/standard: no entry still carries raw HOLE_A/HOLE_A_CS contours', normalized.entries.every(e => e.hole || !['HOLE_A', 'HOLE_A_CS', 'HOLE_B', 'HOLE_B_CS'].includes(e.layer)), normalized.entries);
if (holeEntries.length) {
  const h = holeEntries[0].hole;
  check('recognized hole has numeric x/y and a known kind', typeof h.x === 'number' && typeof h.y === 'number' && !!h.kind, h);
}

// --- 2. Text round-trip: toText() emits ...Holes.at(...), fromText() parses it back ---
const loadedEntries = normalized.entries;
ctx.__loadedEntries = loadedEntries;
vm.runInContext(`EditorState.load({ elementId: 'pult', variantKey: 'standard', kind: 'repeatable', sku: '', label: '', entries: __loadedEntries, passthrough: {} })`, ctx);
const text = vm.runInContext(`EditorState.toText()`, ctx);
check('toText() output contains a literal ...Holes.at( call', /\.\.\.Holes\.at\(/.test(text), text.slice(0, 400));
check('toText() output has no editor-only "name" wrapper (matches real parts:[...] syntax)', !/"name"/.test(text), text.slice(0, 400));

const reparsed = vm.runInContext(`EditorState.fromText(EditorState.toText())`, ctx);
const reparsedHoles = reparsed.filter(e => e.hole);
check('fromText(toText()) round-trips the same number of hole entries', reparsedHoles.length === holeEntries.length, { before: holeEntries.length, after: reparsedHoles.length });
if (reparsedHoles.length && holeEntries.length) {
  const a = holeEntries[0].hole, b = reparsedHoles[0].hole;
  check('round-tripped hole keeps the same x/y/kind', a.x === b.x && a.y === b.y && a.kind === b.kind, { a, b });
}

// --- 2b. A line copied verbatim from a real element file (leading `...`,
// trailing comma, single-quoted kind) parses the same as the editor's own
// generated text — this is the whole point of matching the real syntax. ---
const fromRealFileSyntax = vm.runInContext(
  `EditorState.fromText("[\\n  { verts: [{\\"x\\":0,\\"y\\":0,\\"bulge\\":0},{\\"x\\":1,\\"y\\":0,\\"bulge\\":0}], layer: 'PHYSICAL' },\\n  ...Holes.at(255, 191, 'B'),\\n]")`, ctx
);
check('fromText parses a line pasted straight out of an element file (leading ..., single-quoted kind)',
  fromRealFileSyntax.length === 2 && !!fromRealFileSyntax[1].hole && fromRealFileSyntax[1].hole.kind === 'B',
  fromRealFileSyntax);

// --- 3. fromText rejects an unknown hole kind with a clear error ---
const unknownKindError = vm.runInContext(
  `(function(){ try { EditorState.fromText('[...Holes.at(1,2,"Z")]'); return null; } catch(e){ return e.message; } })()`, ctx
);
check('fromText throws a specific error for an unknown hole kind', unknownKindError !== null, unknownKindError);

// --- 3b. lineForSelection points at the correct entry's opening line —
// this backs main.js's click-preview-to-jump-cursor behavior (see
// jumpEditorToSelection), which replaced the old separate contour list. ---
vm.runInContext(`
EditorState.load({elementId:null,variantKey:null,kind:'repeatable',sku:'',label:'',entries:[
  {layer:'PHYSICAL', verts:[{x:0,y:0,bulge:0},{x:1,y:0,bulge:0}]},
  {hole:{x:5,y:5,kind:'A'}},
  {layer:'PHYSICAL', verts:[{x:0,y:0,bulge:0},{x:1,y:0,bulge:0},{x:1,y:1,bulge:0},{x:0,y:1,bulge:0}]},
], passthrough:{}});
`, ctx);
const multiText = vm.runInContext(`EditorState.toText()`, ctx).split('\n');
const expectedStarts = [
  l => l.startsWith('{ verts:'),
  l => l.startsWith('...Holes.at('),
  l => l.startsWith('{ verts:'),
];
[0, 1, 2].forEach(ei => {
  const line = vm.runInContext(`EditorState.lineForSelection(${ei})`, ctx);
  const onExpectedLine = line != null && multiText[line] != null && expectedStarts[ei](multiText[line].trim());
  check(`lineForSelection(${ei}) lands on that entry's opening line`, onExpectedLine, { ei, line, text: multiText[line] });
});
check('lineForSelection(null) returns null rather than throwing', vm.runInContext(`EditorState.lineForSelection(null)`, ctx) === null);

// --- 4. Transform.offset moves a hole entry's x/y (not just verts) ---
vm.runInContext(`EditorState.load({ elementId: null, variantKey: null, kind: 'repeatable', sku: '', label: '', entries: [{ hole: { x: 10, y: 20, kind: 'A' } }], passthrough: {} })`, ctx);
vm.runInContext(`Transform.offset('all', 5, -3)`, ctx);
const movedHole = vm.runInContext(`EditorState.getEntries()[0].hole`, ctx);
check('Transform.offset moves hole.x/hole.y', movedHole.x === 15 && movedHole.y === 17, movedHole);

// --- 5. Transform.combinedExtents accounts for a hole's counterbore radius ---
const box = vm.runInContext(`Transform.combinedExtents('all')`, ctx);
const kindDefs = vm.runInContext(`Holes.KINDS`, ctx);
const expectedR = kindDefs.A.csDia / 2;
check('combinedExtents uses the counterbore radius for a lone hole entry', Math.abs((box.maxX - box.minX) / 2 - expectedR) < 1e-6, { box, expectedR });

// --- 6. Save.buildSnippet emits ...Holes.at(...) for a hole entry, not raw contours ---
vm.runInContext(`EditorState.load({ elementId: 'pult', variantKey: 'standard', kind: 'repeatable', sku: 'SKU', label: 'Label', entries: [{ hole: { x: 12.5, y: -7.25, kind: 'A' } }], passthrough: {} })`, ctx);
const snippet = vm.runInContext(`Save.buildSnippet()`, ctx);
check('generated snippet uses ...Holes.at(x, y, \'kind\') for a hole entry', /\.\.\.Holes\.at\(12\.5, -7\.25, "A"\)/.test(snippet), snippet);
check('generated snippet does not fall back to raw {verts,layer} for a hole entry', !/verts:/.test(snippet), snippet);

// --- 7. The text pane content and Save's parts:[...] body are the SAME
// text (mod indentation) — the whole point of this format: what's on
// screen IS what pastes into an element file. ---
vm.runInContext(`EditorState.load(__loadedEntries ? { elementId: 'pult', variantKey: 'standard', kind: 'repeatable', sku: 'SKU', label: 'Label', entries: __loadedEntries, passthrough: {} } : null)`, ctx);
const paneText = vm.runInContext(`EditorState.toText()`, ctx);
const snippet2 = vm.runInContext(`Save.buildSnippet()`, ctx);
const paneBodyDedented = paneText.split('\n').slice(1, -1).map(l => l.trim()).join('\n');
const snippetPartsBody = snippet2.split('\n').filter(l => l.trim() && !/^(standard:|sku:|label:|parts:|\],?$|\},?$)/.test(l.trim())).map(l => l.trim()).join('\n');
check('Save.buildSnippet\'s parts body matches the text pane content (same lines, just re-indented)', paneBodyDedented === snippetPartsBody, { paneBodyDedented, snippetPartsBody });

console.log(failures === 0 ? '\n=== ALL CHECKS PASSED ===' : `\n=== ${failures} CHECK(S) FAILED ===`);
process.exit(failures === 0 ? 0 : 1);
