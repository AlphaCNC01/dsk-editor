// ============================================================================
// EditorState — the single source of truth for whatever geometry is
// currently loaded in this session: a list of named contour groups (see
// Registry's normalized shape). The text pane and the SVG preview are both
// just views onto this same array; either can trigger a re-render, but
// neither owns the data.
//
// The text pane holds plain JSON (an array of {name, layer, contours}),
// not a JS expression — parsed with JSON.parse rather than the old
// editor's `new Function(...)` trick. This is both safer (no arbitrary
// code execution from pasted/loaded text) and gives exact, useful parse
// errors ("Unexpected token at position 214") instead of a generic
// catch-all, which matters more here than in the old editor since this
// version expects people to hand-edit individual vertices directly in
// the text, not just paste in whole ready-made contours.
// ============================================================================
const EditorState = (() => {
  let groups = [];          // current working geometry
  let selection = null;     // { groupIndex, contourIndex } | null
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
    groups = normalizedVariant.groups;
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
    groups = [{ name: 'part 1', layer: 'PHYSICAL', contours: [[
      { x: 0, y: 0, bulge: 0 }, { x: 100, y: 0, bulge: 0 },
      { x: 100, y: 60, bulge: 0.4142 }, { x: 0, y: 60, bulge: 0 },
    ]] }];
    selection = null;
    notify();
  }

  function getGroups(){ return groups; }
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

  function setGroups(newGroups, { select, source } = {}){
    groups = newGroups;
    if (select !== undefined) selection = select;
    notify(source);
  }

  function setSelection(sel){
    selection = sel;
    notify();
  }
  function getSelection(){ return selection; }

  // ---------- Text <-> state ----------
  // Serializes to readable, stable-key-order JSON (not JSON.stringify's
  // default compact form) so re-serializing after a small edit produces a
  // small diff, matching this project's existing preference for readable
  // multi-line source over minified output.
  // Formats each group's contours with ONE POINT PER LINE — this is
  // purely a readability choice for hand-editing coordinates in the JSON
  // pane; it has no effect on the underlying data model (still a plain
  // array of {x,y,bulge} per contour) or on anything downstream of
  // EditorState.getGroups() (Save.buildSnippet, SVG import's own
  // generated contours, etc. all keep working with contours as plain
  // arrays regardless of how this function happens to lay them out as
  // text). fromText()'s own parser only cares about valid JSON, not
  // about how it's laid out across lines, so this format is also freely
  // hand-edited back.
  function toText(){
    const lines = ['['];
    groups.forEach((g, gi) => {
      lines.push(`  {`);
      lines.push(`    "name": ${JSON.stringify(g.name)},`);
      lines.push(`    "layer": ${JSON.stringify(g.layer)},`);
      lines.push(`    "contours": [`);
      g.contours.forEach((c, ci) => {
        lines.push(`      [`);
        c.forEach((v, vi) => {
          const comma = vi < c.length - 1 ? ',' : '';
          lines.push(`        {"x":${fmtNum(v.x)},"y":${fmtNum(v.y)},"bulge":${fmtBulge(v.bulge)}}${comma}`);
        });
        lines.push(`      ]${ci < g.contours.length - 1 ? ',' : ''}`);
      });
      lines.push(`    ]`);
      lines.push(`  }${gi < groups.length - 1 ? ',' : ''}`);
    });
    lines.push(']');
    return lines.join('\n');
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

  // Parses text back into groups. Throws with a specific message on
  // failure — callers show this directly rather than swallowing it, since
  // a vague "invalid input" is exactly what made the old editor's parse
  // errors hard to act on.
  function fromText(text){
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error('Некорректный JSON: ' + e.message);
    }
    if (!Array.isArray(parsed)) throw new Error('Ожидается массив групп контуров верхнего уровня');
    parsed.forEach((g, gi) => {
      if (!g || typeof g !== 'object') throw new Error(`Группа ${gi + 1}: ожидается объект`);
      if (!Array.isArray(g.contours)) throw new Error(`Группа ${gi + 1} ("${g.name || '?'}"): нет массива "contours"`);
      g.contours.forEach((c, ci) => {
        if (!Array.isArray(c) || c.length < 1) throw new Error(`Группа ${gi + 1}, контур ${ci + 1}: пустой или некорректный`);
        c.forEach((v, vi) => {
          if (typeof v.x !== 'number' || typeof v.y !== 'number') {
            throw new Error(`Группа ${gi + 1}, контур ${ci + 1}, точка ${vi + 1}: x/y должны быть числами`);
          }
        });
      });
      if (!g.layer) g.layer = 'PHYSICAL';
      if (!g.name) g.name = `part ${gi + 1}`;
      g.contours.forEach(c => c.forEach(v => { if (typeof v.bulge !== 'number') v.bulge = 0; }));
    });
    return parsed;
  }

  return {
    onChange, load, loadBlank, getGroups, getMeta, setGroups, setSkuLabel,
    setSelection, getSelection, toText, fromText,
  };
})();
