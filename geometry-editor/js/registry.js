// ============================================================================
// Registry — bridges this editor to the ACTUAL app's own element files
// (../js/core/elements.js, ../js/elements/*.js, ../js/core/layers.js are
// loaded read-only, exactly like the real dsk-editor loads them; this file
// never mutates Elements/Layers itself).
//
// Every current element (registerSimpleEmbeddable ones, and underframe)
// uses the same VARIANTS[key] = { sku, label, parts: [{verts, layer}, ...] }
// shape — an arbitrary number of named contour groups, each with its own
// explicit layer. elementKind() still checks this structurally rather than
// assuming it (see its own comment), so a genuinely different element shape
// added later is caught explicitly instead of silently mis-read as if it
// were a normal parts-based element.
//
// Normalized shape (what everything downstream sees), per variant:
//   { sku, label, groups: [ { name, layer, contours: [ [ {x,y,bulge}... ] ] }
//     | { name, layer, hole: { x, y, kind } } ] }
// `groups` preserves the SOURCE structure (so saving can round-trip back to
// the exact original file shape) — `parts` becomes one group per distinct
// layer value actually used (matching how pult.js etc. read naturally:
// several `parts` entries, each its own {verts,layer}).
//
// Mounting holes (see js/elements/hole.js's Holes.at(x,y,kind)) are already
// fully expanded into two plain {verts,layer} entries by the time this
// editor sees them — Holes.at() is a normal JS function call evaluated at
// script-load time, inside the element's own VARIANTS object literal, so
// there is no trace of "this came from Holes.at(...)" left in the data by
// the time Elements.all() exposes it. groupsFromParts() reconstructs that
// intent structurally: any adjacent pair of parts landing on a known
// hole/counterbore layer pair (HOLE_A+HOLE_A_CS, HOLE_B+HOLE_B_CS) is
// collapsed back into a single { hole: {x,y,kind} } group, with (x,y) read
// off the actual circle geometry (its first vertex + radius) rather than
// assumed — so this also self-corrects if the two contours were ever
// slightly off-center from each other in the source file.
// ============================================================================
const Registry = (() => {

  // Only elements carrying their own VARIANTS are geometry-editable here —
  // this naturally excludes tabletop and cable-channels, which are pure
  // computed geometry with nothing resembling a parts library, and
  // naturally includes every registerSimpleEmbeddable element plus
  // underframe, exactly matching what got sku/label treatment in the main
  // app. No separate hardcoded list to keep in sync.
  function editableElements(){
    return Elements.all().filter(e => e.VARIANTS && Object.keys(e.VARIANTS).length > 0);
  }

  // Every element currently in the app stores its geometry as `parts`
  // (checked structurally, not by id, so this stays true automatically as
  // elements are added). This editor only knows how to read that shape —
  // normalizeVariant() throws a clear error rather than silently
  // mis-reading anything that doesn't match, so a future element with a
  // genuinely different data shape is caught immediately instead of
  // producing a confusing downstream failure.
  function elementKind(element){
    const firstVariant = Object.values(element.VARIANTS)[0];
    return firstVariant && Array.isArray(firstVariant.parts) ? 'repeatable' : 'unknown';
  }

  // A full circle authored as the standard 2-vertex bulge:1 pair (see
  // Holes.circle in js/elements/hole.js) — returns its center if `verts`
  // matches that exact shape, else null. Deliberately strict (exactly 2
  // verts, both bulge===1, matching radii) rather than a fuzzy geometric
  // bbox-center guess: a hole reconstructed from anything looser risks
  // silently mis-round-tripping non-hole geometry that happens to land on
  // a HOLE_* layer.
  function circleCenter(verts){
    if (!Array.isArray(verts) || verts.length !== 2) return null;
    const [a, b] = verts;
    if (Math.abs((a.bulge || 0) - 1) > 1e-6 || Math.abs((b.bulge || 0) - 1) > 1e-6) return null;
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const r = Math.hypot(b.x - a.x, b.y - a.y) / 2;
    if (!(r > 0)) return null;
    return { x: cx, y: cy, r };
  }

  // Layer name -> hole kind + role, derived from Holes.KINDS itself (see
  // js/elements/hole.js) rather than hardcoded here a second time, so a
  // future third hole kind is picked up automatically.
  function buildHoleLayerMap(){
    const map = {}; // layerName -> { kind, role: 'hole'|'cs' }
    Object.entries(Holes.KINDS).forEach(([kind, k]) => {
      map[k.holeLayer] = { kind, role: 'hole' };
      map[k.csLayer] = { kind, role: 'cs' };
    });
    return map;
  }

  // parts: [{verts, layer}] -> groups: one group per array entry EXCEPT
  // recognized hole/counterbore pairs, which collapse to one { hole }
  // group each. A pair is recognized when two ADJACENT parts are exactly
  // {kind}'s hole layer immediately followed by {kind}'s counterbore
  // layer (matching the order Holes.at() itself always emits: hole, then
  // cs — see js/elements/hole.js), both are clean 2-vertex circles (see
  // circleCenter), and they share the same center. Anything not matching
  // that — a lone HOLE_A contour without its cs pair, mismatched centers,
  // hand-edited geometry — is left as a plain part rather than guessed
  // into a hole, so round-tripping never silently misrepresents geometry
  // this editor can't actually reproduce via Holes.at().
  function groupsFromParts(parts){
    const holeLayers = buildHoleLayerMap();
    const groups = [];
    let i = 0;
    let partNum = 0;
    while (i < parts.length) {
      const part = parts[i];
      const info = holeLayers[part.layer];
      const next = parts[i + 1];
      const nextInfo = next && holeLayers[next.layer];
      if (info && info.role === 'hole' && nextInfo && nextInfo.role === 'cs' && nextInfo.kind === info.kind) {
        const c1 = circleCenter(part.verts);
        const c2 = circleCenter(next.verts);
        const kindDef = Holes.KINDS[info.kind];
        const sameCenter = c1 && c2 && Math.abs(c1.x - c2.x) < 1e-6 && Math.abs(c1.y - c2.y) < 1e-6;
        const radiiMatch = c1 && c2 && kindDef
          && Math.abs(c1.r - kindDef.holeDia / 2) < 1e-6 && Math.abs(c2.r - kindDef.csDia / 2) < 1e-6;
        if (c1 && c2 && sameCenter && radiiMatch) {
          partNum++;
          groups.push({ name: `hole ${info.kind}`, layer: part.layer, hole: { x: c1.x, y: c1.y, kind: info.kind } });
          i += 2;
          continue;
        }
      }
      partNum++;
      groups.push({ name: `part ${partNum}`, layer: part.layer || 'PHYSICAL', contours: [part.verts] });
      i++;
    }
    return groups;
  }

  function normalizeVariant(element, key){
    const kind = elementKind(element);
    const variant = element.VARIANTS[key];
    if (kind !== 'repeatable') {
      throw new Error(`${element.id}/${key}: unrecognized variant shape (no "parts" array) — this editor doesn't know how to read it`);
    }
    const groups = groupsFromParts(variant.parts);
    return {
      elementId: element.id,
      variantKey: key,
      kind,
      sku: variant.sku || '',
      label: variant.label || '',
      groups,
      // Fields this editor never touches but must round-trip verbatim on
      // save (see cable-channels.js reading variant.cableNode) — captured
      // generically as "everything else on the variant object" rather than
      // a hardcoded {cableNode} pick, so a future per-variant field added
      // to any element (the same way cableNode was added after the parts/
      // sku/label shape was established) survives a save here automatically
      // instead of silently being dropped until someone remembers to teach
      // this editor about it too.
      passthrough: Object.fromEntries(
        Object.entries(variant).filter(([k]) => !['sku', 'label', 'parts'].includes(k))
      ),
    };
  }

  // Deep-clones a normalized variant's groups so editing in this app can
  // never mutate the live Elements registry the rest of the page (e.g. any
  // other script sharing this same load) might also be reading.
  function cloneGroups(groups){
    return groups.map(g => g.hole
      ? { name: g.name, layer: g.layer, hole: { ...g.hole } }
      : {
        name: g.name,
        layer: g.layer,
        contours: g.contours.map(c => c.map(v => ({ x: v.x, y: v.y, bulge: v.bulge || 0 }))),
      });
  }

  return { editableElements, elementKind, normalizeVariant, cloneGroups };
})();
