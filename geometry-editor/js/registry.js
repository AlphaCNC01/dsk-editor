// ============================================================================
// Registry — bridges this editor to the ACTUAL app's own element files
// (../js/core/elements.js, ../js/elements/*.js, ../js/core/layers.js are
// loaded read-only, exactly like the real dsk-editor loads them; this file
// never mutates Elements/Layers itself). Two element shapes exist in the
// live app and both are normalized here into one common model so the rest
// of the editor (list, transforms, render, save) doesn't need to know which
// one it's looking at:
//
//   - Most elements (registerSimpleEmbeddable): VARIANTS[key] = { sku,
//     label, parts: [{verts, layer}, ...] } — an arbitrary number of named
//     contour groups, each with its own explicit layer.
//   - underframe (singleton, not repeatable): VARIANTS[key] = { sku, label,
//     width, height, frameOutline: [[verts],...], frameHoles: [[verts],...]
//     } — always exactly two contour groups, both with an IMPLICIT layer
//     (PHYSICAL / HOLES) baked into underframe.js's own buildSide(), not
//     stored alongside the geometry.
//
// Normalized shape (what everything downstream sees), per variant:
//   { sku, label, groups: [ { name, layer, contours: [ [ {x,y,bulge}... ] ] } ] }
// `groups` preserves the SOURCE structure (so saving can round-trip back to
// the exact original file shape) — `parts` becomes one group per distinct
// layer value actually used (matching how pult.js etc. read naturally:
// several `parts` entries, each its own {verts,layer}), while underframe
// becomes exactly two fixed groups named 'frameOutline'/'frameHoles'.
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

  function elementKind(element){
    // underframe is the one non-repeatable element (see resolveInset /
    // registerSimpleEmbeddable docs in ../js/core/elements.js) — detected
    // structurally (does a variant have `parts`?) rather than by hardcoding
    // the id 'underframe', so a future singleton-style element (if one is
    // ever added) is picked up automatically instead of silently falling
    // through as if it were a normal repeatable element.
    const firstVariant = Object.values(element.VARIANTS)[0];
    return firstVariant && Array.isArray(firstVariant.parts) ? 'repeatable' : 'singleton';
  }

  // parts: [{verts, layer}] -> groups: one group per array entry, named by
  // its own position (part 1, part 2, ...) plus its layer, since `parts`
  // has no other name of its own to show. Order is preserved so saving can
  // write parts back out in the same sequence.
  function groupsFromParts(parts){
    return parts.map((part, i) => ({
      name: `part ${i + 1}`,
      layer: part.layer || 'PHYSICAL',
      contours: [part.verts],
    }));
  }

  // frameOutline/frameHoles -> two fixed groups. Each group can itself hold
  // several disconnected contours (the underframe's frame is drawn as many
  // separate rectangles, not one shape), which the normalized model already
  // supports via `contours: [...]`.
  function groupsFromUnderframe(variant){
    return [
      { name: 'frameOutline', layer: 'PHYSICAL', contours: variant.frameOutline },
      { name: 'frameHoles', layer: 'HOLES', contours: variant.frameHoles },
    ];
  }

  function normalizeVariant(element, key){
    const kind = elementKind(element);
    const variant = element.VARIANTS[key];
    const groups = kind === 'repeatable'
      ? groupsFromParts(variant.parts)
      : groupsFromUnderframe(variant);
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
        Object.entries(variant).filter(([k]) => !['sku', 'label', 'parts', 'frameOutline', 'frameHoles'].includes(k))
      ),
    };
  }

  // Deep-clones a normalized variant's groups so editing in this app can
  // never mutate the live Elements registry the rest of the page (e.g. any
  // other script sharing this same load) might also be reading.
  function cloneGroups(groups){
    return groups.map(g => ({
      name: g.name,
      layer: g.layer,
      contours: g.contours.map(c => c.map(v => ({ x: v.x, y: v.y, bulge: v.bulge || 0 }))),
    }));
  }

  return { editableElements, elementKind, normalizeVariant, cloneGroups };
})();
