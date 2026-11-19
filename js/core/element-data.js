// ============================================================================
// ElementData — the single home of every element variant's DATA: sku, label,
// supplier fields, contours (`parts`), and any per-variant extras (cableNode,
// width/height, ...). The data itself lives in js/data/element-variants.js
// (plain declarative text, safe to hand-edit and the file the geometry
// editor rewrites); element files in js/elements/*.js keep only BEHAVIOUR
// (placement, hooks) and pull their variants from here:
//     variants: ElementData.variants('pullout')
//
// Raw shape (what the data file holds, what serialize() writes):
//   { elementId: { variantKey: { sku, label, ..., parts: [ entry, ... ], ...extras } } }
// where entry is either
//   { verts: [{x,y,bulge}...], layer }          — a plain contour, or
//   { hole: { x, y, kind } }                    — a mounting hole (kind 'A'|'B',
//                                                 see Holes.KINDS in hole.js),
//                                                 expanded to its hole +
//                                                 counterbore contours on read.
// variants(id) returns the same variants with every { hole } expanded into
// plain {verts, layer} parts — exactly the shape the rest of the app
// (registerSimpleEmbeddable, underframe, dimensions, ...) has always read.
//
// Deliberately NOT in the data: how an element is placed (anchors, inset
// formulas, auto-shifts). That stays in code.
// ============================================================================
const ElementData = (() => {
  const store = {};

  function define(data){
    for (const id of Object.keys(data)) store[id] = data[id];
  }

  function clone(v){ return JSON.parse(JSON.stringify(v)); }

  function expandParts(parts){
    const out = [];
    for (const e of parts) {
      if (e.hole) out.push(...Holes.at(e.hole.x, e.hole.y, e.hole.kind));
      else out.push({ verts: clone(e.verts), layer: e.layer });
    }
    return out;
  }

  // Expanded variants of one element (fresh copy on every call).
  function variants(id){
    const raw = store[id];
    if (!raw) throw new Error(`ElementData: no data for element "${id}" (js/data/element-variants.js)`);
    const out = {};
    for (const key of Object.keys(raw)) {
      const v = clone(raw[key]);
      v.parts = expandParts(raw[key].parts);
      out[key] = v;
    }
    return out;
  }

  // Raw (hole-collapsed) data, deep-copied — what the geometry editor edits.
  function raw(){ return clone(store); }

  // ---- serialization (data -> source text of js/data/element-variants.js) ----

  const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
  const key = k => IDENT.test(k) ? k : `'${k}'`;
  const str = s => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

  function lit(v){
    if (typeof v === 'string') return str(v);
    if (typeof v === 'number' || typeof v === 'boolean' || v === null) return String(v);
    if (Array.isArray(v)) return '[' + v.map(lit).join(', ') + ']';
    return '{ ' + Object.keys(v).map(k => `${key(k)}: ${lit(v[k])}`).join(', ') + ' }';
  }

  function entryText(e){
    if (e.hole) return `{ hole: { x: ${e.hole.x}, y: ${e.hole.y}, kind: ${str(e.hole.kind)} } }`;
    const verts = e.verts.map(p => `{x:${p.x},y:${p.y},bulge:${p.bulge || 0}}`).join(', ');
    return `{ verts: [${verts}], layer: ${str(e.layer)} }`;
  }

  function serialize(data){
    const lines = [];
    lines.push(HEADER.trimEnd());
    lines.push('ElementData.define({');
    for (const id of Object.keys(data)) {
      lines.push(`  ${key(id)}: {`);
      for (const vk of Object.keys(data[id])) {
        const v = data[id][vk];
        lines.push(`    ${key(vk)}: {`);
        for (const f of Object.keys(v)) {
          if (f === 'parts') {
            lines.push('      parts: [');
            v.parts.forEach(e => lines.push('        ' + entryText(e) + ','));
            lines.push('      ],');
          } else {
            lines.push(`      ${key(f)}: ${lit(v[f])},`);
          }
        }
        lines.push('    },');
      }
      lines.push('  },');
    }
    lines.push('});');
    return lines.join('\n') + '\n';
  }

  const HEADER = `
// ============================================================================
// Element variants — DATA ONLY (see js/core/element-data.js for the shape).
// One entry per element id -> variant key. Edit by hand or via the geometry
// editor (geometry-editor/index.html), which rewrites this whole file in
// exactly this format. Placement logic (insets, anchors, auto-shifts) is NOT
// here — it stays in js/elements/*.js and js/ui/element-managers.js.
//
//   sku / label                 — internal article and display name
//   supplierSku / supplierMark  — supplier's article and marking (collected
//                                 for later; not used by the app yet)
//   parts                       — contours: { verts, layer } or a mounting
//                                 hole { hole: { x, y, kind } }
//   anything else (cableNode, width, height, ...) — per-variant extras read
//                                 by the element's own code
// ============================================================================
`;

  return { define, variants, raw, serialize, entryText };
})();
