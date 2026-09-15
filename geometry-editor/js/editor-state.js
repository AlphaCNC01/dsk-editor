// ============================================================================
// EditorState — the single source of truth for whatever geometry is
// currently loaded in this session: a list of named contour groups (see
// Registry's normalized shape). The text pane and the SVG preview are both
// just views onto this same array; either can trigger a re-render, but
// neither owns the data.
//
// The text pane holds JSON-like source — an array of group objects, each
// either {name, layer, contours} (plain geometry) or {name, layer, hole:
// Holes.at(x, y, "kind")} (a mounting hole, see js/elements/hole.js). The
// `hole` field is deliberately written as a literal call to the real
// Holes.at() rather than a plain {x,y,kind} object, so what's on screen
// reads exactly like what ends up in the actual element source file (see
// Save.buildSnippet) — editing a hole here is editing the same call you'd
// see in underframe.js, not a separate editor-only representation of it.
//
// Because of that one construct this is no longer strict JSON — fromText()
// pre-processes Holes.at(...) calls into an equivalent JSON-safe marker
// before calling JSON.parse, then expands markers back into {x,y,kind}
// afterwards. This is NOT the old editor's `new Function(...)` trick:
// nothing is evaluated as code. Holes.at(...) is matched with a strict
// regex (three numeric-or-quoted arguments only) and rewritten to a plain
// JSON object; JSON.parse never sees the literal call text, and anything
// that doesn't match that exact shape is left alone to fail JSON.parse's
// own parsing with its normal (specific, position-pointing) error.
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
  // Serializes to readable, stable-key-order JSON-like source (not
  // JSON.stringify's default compact form) so re-serializing after a
  // small edit produces a small diff, matching this project's existing
  // preference for readable multi-line source over minified output.
  // Formats each group's contours with ONE POINT PER LINE — this is
  // purely a readability choice for hand-editing coordinates in the JSON
  // pane; it has no effect on the underlying data model (still a plain
  // array of {x,y,bulge} per contour) or on anything downstream of
  // EditorState.getGroups() (Save.buildSnippet, SVG import's own
  // generated contours, etc. all keep working with contours as plain
  // arrays regardless of how this function happens to lay them out as
  // text). fromText()'s own parser only cares about valid syntax, not
  // about how it's laid out across lines, so this format is also freely
  // hand-edited back.
  function toText(){
    const lines = ['['];
    groups.forEach((g, gi) => {
      lines.push(`  {`);
      lines.push(`    "name": ${JSON.stringify(g.name)},`);
      lines.push(`    "layer": ${JSON.stringify(g.layer)},`);
      if (g.hole) {
        lines.push(`    "hole": Holes.at(${fmtNum(g.hole.x)}, ${fmtNum(g.hole.y)}, ${JSON.stringify(g.hole.kind)})`);
      } else {
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
      }
      lines.push(`  }${gi < groups.length - 1 ? ',' : ''}`);
    });
    lines.push(']');
    return lines.join('\n');
  }

  // Returns the 0-based CodeMirror line number where a given
  // {groupIndex, contourIndex} selection starts in toText()'s own output
  // — specifically, the group's opening `{` line, since that's the most
  // useful single line to land on/highlight regardless of whether the
  // group is a hole or a multi-contour part. Mirrors toText()'s own line-
  // counting exactly (same nesting, same one-line-per-vertex layout) but
  // stops once it reaches the requested group rather than emitting the
  // rest of the text — this is a plain re-walk of the same structure
  // toText() already knows how to lay out, not a parse of generated text
  // (regexing generated JSON back apart is more fragile than recomputing
  // the same simple counts a second time).
  function lineForSelection(groupIndex){
    if (groupIndex == null || !groups[groupIndex]) return null;
    let line = 1; // line 0 is the opening '[', group 0's '{' is on line 1
    for (let gi = 0; gi < groupIndex; gi++) {
      const g = groups[gi];
      line += 3; // '{', "name", "layer"
      if (g.hole) {
        line += 1; // the Holes.at(...) line
      } else {
        line += 2; // '"contours": [' + closing ']'
        g.contours.forEach(c => { line += 2 + c.length; }); // '[' + one line per vertex + ']'
      }
      line += 1; // closing '}'
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
  // person might type that merely mentions "Holes" in passing.
  const HOLES_AT_RE = /Holes\.at\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*["']([A-Za-z0-9_]+)["']\s*\)/g;

  function preprocessHolesAt(text){
    return text.replace(HOLES_AT_RE, (_, x, y, kind) =>
      `{"__hole__":true,"x":${x},"y":${y},"kind":${JSON.stringify(kind)}}`);
  }

  // Parses text back into groups. Throws with a specific message on
  // failure — callers show this directly rather than swallowing it, since
  // a vague "invalid input" is exactly what made the old editor's parse
  // errors hard to act on.
  function fromText(text){
    let parsed;
    try {
      parsed = JSON.parse(preprocessHolesAt(text));
    } catch (e) {
      throw new Error('Некорректный JSON: ' + e.message);
    }
    if (!Array.isArray(parsed)) throw new Error('Ожидается массив групп контуров верхнего уровня');
    parsed.forEach((g, gi) => {
      if (!g || typeof g !== 'object') throw new Error(`Группа ${gi + 1}: ожидается объект`);
      if (!g.name) g.name = `part ${gi + 1}`;

      const holeMarker = g.hole && g.hole.__hole__ ? g.hole : null;
      if (holeMarker) {
        if (typeof holeMarker.x !== 'number' || typeof holeMarker.y !== 'number') {
          throw new Error(`Группа ${gi + 1} ("${g.name}"): Holes.at требует числовые x/y`);
        }
        if (!Holes.KINDS[holeMarker.kind]) {
          throw new Error(`Группа ${gi + 1} ("${g.name}"): неизвестный вид отверстия "${holeMarker.kind}" (доступны: ${Object.keys(Holes.KINDS).join(', ')})`);
        }
        g.hole = { x: holeMarker.x, y: holeMarker.y, kind: holeMarker.kind };
        g.layer = Holes.KINDS[holeMarker.kind].holeLayer;
        delete g.contours;
        return;
      }

      if (!Array.isArray(g.contours)) throw new Error(`Группа ${gi + 1} ("${g.name}"): нет массива "contours" (и не Holes.at(...))`);
      g.contours.forEach((c, ci) => {
        if (!Array.isArray(c) || c.length < 1) throw new Error(`Группа ${gi + 1}, контур ${ci + 1}: пустой или некорректный`);
        c.forEach((v, vi) => {
          if (typeof v.x !== 'number' || typeof v.y !== 'number') {
            throw new Error(`Группа ${gi + 1}, контур ${ci + 1}, точка ${vi + 1}: x/y должны быть числами`);
          }
        });
      });
      if (!g.layer) g.layer = 'PHYSICAL';
      g.contours.forEach(c => c.forEach(v => { if (typeof v.bulge !== 'number') v.bulge = 0; }));
    });
    return parsed;
  }

  return {
    onChange, load, loadBlank, getGroups, getMeta, setGroups, setSkuLabel,
    setSelection, getSelection, toText, fromText, lineForSelection,
  };
})();
