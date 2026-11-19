// ============================================================================
// ElementData — the single home of every element variant's DATA: sku, label,
// supplier fields, contours (`parts`), and any per-variant extras (cableNode,
// width/height, ...). The data lives in js/data/<element>.js — ONE FILE PER
// ELEMENT TYPE holding all of its variants (plain declarative text, safe to
// hand-edit; the geometry editor rewrites exactly one such file). The files
// are listed in js/data/manifest.js (edited by hand when a new type is added).
// Element files in js/elements/*.js keep only BEHAVIOUR
// (placement, hooks) and pull their variants from here:
//     variants: ElementData.variants('pullout')
//
// Raw shape (what the data files hold, what serializeElement() writes):
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
    if (!raw) throw new Error(`ElementData: no data for element "${id}" (js/data/${fileName(id)}.js — in the list in js/data/manifest.js?)`);
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

  // ---- serialization (data -> source text of js/data/<element>.js) ----

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

  // js/data/<fileName(id)>.js — kebab-case of the element id.
  function fileName(id){ return id.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(); }

  // Source text of one element's data file (all its variants).
  function serializeElement(id, variants){
    const lines = [];
    lines.push(`// ${id} — variants DATA ONLY. Shape and field meanings: js/core/element-data.js.`);
    lines.push('// Hand-editable, and rewritten whole by the geometry editor in exactly this format.');
    lines.push('ElementData.define({');
    lines.push(`  ${key(id)}: {`);
    for (const vk of Object.keys(variants)) {
      const v = variants[vk];
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
    lines.push('});');
    return lines.join('\n') + '\n';
  }

  return { define, variants, raw, fileName, serializeElement, entryText };
})();
