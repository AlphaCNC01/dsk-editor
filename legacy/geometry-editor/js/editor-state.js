// ============================================================================
// EditorState — the single source of truth for whatever geometry is
// currently loaded in this session: a flat list of `entries` (see
// Registry's normalized shape — one entry per real `parts` array item,
// either {layer, verts} or {hole: {x,y,kind}}). The text pane and the SVG
// preview are both just views onto this same array; either can trigger a
// re-render, but neither owns the data.
//
// The text pane holds exactly what belongs inside parts: [ ... ] in a real
// element file — a plain contour entry serializes as
// `{ verts: [...], layer: '...' }`, and a hole entry as a literal
// `...Holes.at(x, y, 'kind')` spread (see js/elements/hole.js). There is
// deliberately no extra wrapping (no editor-only "name" field, no grouping)
// — earlier versions of this editor added a friendlier {name, contours:[...]}
// shape on top, but that meant the text on screen was NOT what you could
// paste into an element file; this format is exactly that, so copy-pasting
// straight from the pane (or from Save's output, which is now just this
// text wrapped in the surrounding variant boilerplate) works.
//
// Because of the ...Holes.at(...) spread and the lack of outer {} wrapping
// per line, this is no longer strict JSON — fromText() pre-processes both
// into JSON-safe equivalents before calling JSON.parse, then expands them
// back out afterwards. This is NOT the old editor's `new Function(...)`
// trick: nothing is evaluated as code. Both rewrites use strict regexes
// matching only the exact shapes toText() itself produces; anything else
// is left alone to fail JSON.parse's own parsing with its normal (specific,
// position-pointing) error.
// ============================================================================
const EditorState = (() => {
  let entries = [];         // current working geometry — mirrors `parts`
  let selection = null;     // index into `entries`, or null
  let currentElementId = null;
  let currentVariantKey = null;
  let currentKind = null;   // 'repeatable' | 'singleton'
  let currentSku = '';
  let currentLabel = '';
  let currentPassthrough = {}; // fields this editor doesn't touch (e.g. cableNode) but must round-trip on save
  let listeners = [];

  function onChange(fn){ listeners.push(fn); }
  // `source` tells listeners WHERE this change came from, so main.js can
  // avoid pushing text back into the editor when the edit originated
  // there in the first place. Without this, every keystroke would:
  // fire this notify -> main.js calls jsonEditor.setValue(toText()) ->
  // CodeMirror re-tokenizes/re-lints the ENTIRE document and resets the
  // cursor -> (depending on timing) potentially re-fires its own change
  // event -> loops. That full-document replace-on-every-keystroke is
  // also simply too slow on its own regardless of any loop, and is what
  // actually made the editor tab hang. 'editor' is the only source that
  // skips the editor-push; every other source (loading an element,
  // applying a transform, clicking a contour, sku/label edits) still
  // pushes the regenerated text into the editor as before.
  function notify(source){ listeners.forEach(fn => fn(source || 'state')); }

  function load(normalizedVariant){
    currentElementId = normalizedVariant.elementId;
    currentVariantKey = normalizedVariant.variantKey;
    currentKind = normalizedVariant.kind;
    currentSku = normalizedVariant.sku;
    currentLabel = normalizedVariant.label;
    currentPassthrough = normalizedVariant.passthrough || {};
    entries = normalizedVariant.entries;
    selection = null;
    notify();
  }

  function loadBlank(){
    currentElementId = null;
    currentVariantKey = null;
    currentKind = 'repeatable';
    currentSku = '';
    currentLabel = '';
    currentPassthrough = {};
    entries = [{ layer: 'PHYSICAL', verts: [
      { x: 0, y: 0, bulge: 0 }, { x: 100, y: 0, bulge: 0 },
      { x: 100, y: 60, bulge: 0.4142 }, { x: 0, y: 60, bulge: 0 },
    ] }];
    selection = null;
    notify();
  }

  function getEntries(){ return entries; }
  function getMeta(){
    return {
      elementId: currentElementId, variantKey: currentVariantKey, kind: currentKind,
      sku: currentSku, label: currentLabel, passthrough: currentPassthrough,
    };
  }
  function setSkuLabel(sku, label){
    currentSku = sku;
    currentLabel = label;
    notify();
  }

  function setEntries(newEntries, { select, source } = {}){
    entries = newEntries;
    if (select !== undefined) selection = select;
    notify(source);
  }

  function setSelection(index){
    selection = index;
    notify();
  }
  function getSelection(){ return selection; }

  // ---------- Text <-> state ----------
  // Serializes to readable, one-entry-per-line source (not JSON.stringify's
  // default compact form) so re-serializing after a small edit produces a
  // small diff, matching this project's existing preference for readable
  // multi-line source over minified output — and matching parts: [ ... ]
  // in a real element file line for line.
  function toText(){
    const lines = ['['];
    entries.forEach((e, i) => {
      const comma = i < entries.length - 1 ? ',' : '';
      if (e.hole) {
        lines.push(`  ...Holes.at(${fmtNum(e.hole.x)}, ${fmtNum(e.hole.y)}, ${JSON.stringify(e.hole.kind)})${comma}`);
      } else {
        lines.push(`  { verts: ${vertsToLiteral(e.verts)}, layer: ${JSON.stringify(e.layer)} }${comma}`);
      }
    });
    lines.push(']');
    return lines.join('\n');
  }

  // One line per vertex when there's more than a couple — keeps a simple
  // 2-vertex hole-style contour compact on one line, but spreads a real
  // multi-point outline out so individual points are easy to find/edit by
  // eye, matching this project's own hand-authored element files (see
  // underframe.js etc., which write one {x,y,bulge} per line for anything
  // non-trivial).
  function vertsToLiteral(verts){
    if (verts.length <= 2) {
      return '[' + verts.map(v => `{"x":${fmtNum(v.x)},"y":${fmtNum(v.y)},"bulge":${fmtBulge(v.bulge)}}`).join(',') + ']';
    }
    const inner = verts.map(v => `    {"x":${fmtNum(v.x)},"y":${fmtNum(v.y)},"bulge":${fmtBulge(v.bulge)}}`).join(',\n');
    return '[\n' + inner + '\n  ]';
  }

  // Returns the 0-based CodeMirror line number where a given entry index
  // starts in toText()'s own output. Each entry is exactly one opening
  // line (see toText()/vertsToLiteral — a hole is always one line; a plain
  // entry's OPENING line is what's returned even when its verts span
  // several lines, since that's the more useful place to land: right at
  // "{ verts: [" rather than mid-list). Mirrors toText()'s own line-
  // counting exactly, but stops once it reaches the requested entry rather
  // than emitting the rest of the text — a plain re-walk of the same
  // layout toText() already knows, not a parse of generated text (regexing
  // generated JSON back apart is more fragile than recomputing the same
  // simple counts a second time).
  function lineForSelection(index){
    if (index == null || !entries[index]) return null;
    let line = 1; // line 0 is the opening '[', entry 0 is on line 1
    for (let i = 0; i < index; i++) {
      const e = entries[i];
      line += (e.hole || e.verts.length <= 2) ? 1 : 2 + e.verts.length;
    }
    return line;
  }

  function fmtNum(n){
    const r = parseFloat((n || 0).toFixed(4));
    return Object.is(r, -0) ? 0 : r;
  }
  function fmtBulge(n){
    // Bulge keeps more precision than coordinates — some source data
    // (ArtCAM traces) carries values like 0.62501483 where rounding to 4
    // decimals visibly distorts the arc on re-import.
    const r = parseFloat((n || 0).toFixed(8));
    return Object.is(r, -0) ? 0 : r;
  }

  // Matches Holes.at(x, y, "kind") / Holes.at(x, y, 'kind') — deliberately
  // narrow (three arguments, first two plain numbers, third a quoted
  // identifier-like string, nothing else) so this only ever rewrites
  // exactly the construct toText() itself produces, never anything a
  // person might type that merely mentions "Holes" in passing. The leading
  // `...` (spread, matching how it appears inside parts: [...] in a real
  // element file) is optional here so pasting a line copied straight out
  // of an element file — where it's always preceded by `...` — still
  // parses the same as this editor's own generated text.
  const HOLES_AT_RE = /(?:\.\.\.)?Holes\.at\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*["']([A-Za-z0-9_]+)["']\s*\)/g;

  function preprocessHolesAt(text){
    return text.replace(HOLES_AT_RE, (_, x, y, kind) =>
      `{"__hole__":true,"x":${x},"y":${y},"kind":${JSON.stringify(kind)}}`);
  }

  // { verts: [...], layer: '...' } isn't valid JSON on its own (unquoted
  // keys, single-quoted layer name — matching how it's written in a real
  // element file, e.g. `layer: 'PHYSICAL'`), and neither is a real file's
  // own vertex literal — `{x:242.5,y:0,bulge:0}`, compact and unquoted, the
  // way underframe.js/pullout.js/etc. actually write coordinates — this
  // rewrites all of it to JSON-safe form so JSON.parse can take it from
  // there. Deliberately narrow (only ever touches the exact bare keys used
  // in this format: `verts`, `layer`, `x`, `y`, `bulge`; only a
  // single-quoted value immediately after `"layer":`) rather than a
  // general unquoted-key/single-quote fixer, so anything else malformed
  // still surfaces as a normal JSON.parse error instead of being silently
  // "fixed" into something that parses but isn't what was meant.
  function preprocessBareKeys(text){
    return text
      .replace(/\bverts\s*:/g, '"verts":')
      .replace(/\blayer\s*:/g, '"layer":')
      .replace(/\{\s*x\s*:/g, '{"x":')
      .replace(/,\s*y\s*:/g, ',"y":')
      .replace(/,\s*bulge\s*:/g, ',"bulge":')
      .replace(/"layer"\s*:\s*'([^']*)'/g, '"layer": "$1"');
  }

  // A trailing comma before a closing ] or } is valid, everyday JS syntax
  // (and exactly what pasting a line straight out of an element file, or
  // this editor's own toText(), naturally produces on the last entry) but
  // is a hard JSON.parse error — strips it so both directions round-trip
  // without a person having to hand-delete the last comma.
  function stripTrailingCommas(text){
    return text.replace(/,(\s*[\]}])/g, '$1');
  }

  // Parses text back into entries. Throws with a specific message on
  // failure — callers show this directly rather than swallowing it, since
  // a vague "invalid input" is exactly what made the old editor's parse
  // errors hard to act on.
  function fromText(text){
    let parsed;
    try {
      parsed = JSON.parse(stripTrailingCommas(preprocessBareKeys(preprocessHolesAt(text))));
    } catch (e) {
      throw new Error('Некорректный синтаксис: ' + e.message);
    }
    if (!Array.isArray(parsed)) throw new Error('Ожидается массив записей верхнего уровня (как parts: [...])');
    parsed.forEach((e, i) => {
      if (!e || typeof e !== 'object') throw new Error(`Запись ${i + 1}: ожидается объект`);

      const holeMarker = e.__hole__ ? e : null;
      if (holeMarker) {
        if (typeof holeMarker.x !== 'number' || typeof holeMarker.y !== 'number') {
          throw new Error(`Запись ${i + 1}: Holes.at требует числовые x/y`);
        }
        if (!Holes.KINDS[holeMarker.kind]) {
          throw new Error(`Запись ${i + 1}: неизвестный вид отверстия "${holeMarker.kind}" (доступны: ${Object.keys(Holes.KINDS).join(', ')})`);
        }
        parsed[i] = { hole: { x: holeMarker.x, y: holeMarker.y, kind: holeMarker.kind } };
        return;
      }

      if (!Array.isArray(e.verts) || e.verts.length < 1) throw new Error(`Запись ${i + 1}: нет массива "verts" (и не Holes.at(...))`);
      e.verts.forEach((v, vi) => {
        if (typeof v.x !== 'number' || typeof v.y !== 'number') {
          throw new Error(`Запись ${i + 1}, точка ${vi + 1}: x/y должны быть числами`);
        }
        if (typeof v.bulge !== 'number') v.bulge = 0;
      });
      if (!e.layer) e.layer = 'PHYSICAL';
    });
    return parsed;
  }

  return {
    onChange, load, loadBlank, getEntries, getMeta, setEntries, setSkuLabel,
    setSelection, getSelection, toText, fromText, lineForSelection,
  };
})();
