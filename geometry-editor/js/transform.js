// ============================================================================
// Transform — offset/rotate/mirror/set-origin, built on top of the real
// app's own Geo.translate/Geo.rotate/Geo.mirror (../js/core/geo.js) rather
// than reimplementing that math a second time here, so a fix or convention
// change in Geo (e.g. the mirror/rotate order used everywhere else)
// automatically applies to this editor too.
//
// Every transform can run over either the WHOLE current geometry (all
// groups) or just the currently-selected contour — the old geometry editor
// only ever offered whole-document transforms, which is fine for "this
// entire traced SVG needs shifting to a new origin" but awkward for "this
// one mounting hole is 2mm off, nudge just it".
//
// Hole groups ({ hole: {x,y,kind} }, see Registry's own header comment) 
// carry no `contours` — they're transformed by running the SAME Geo
// functions over a single synthetic point [{x, y, bulge:0}] standing in
// for the hole's center, then writing the result back into hole.x/y.
// bulge is irrelevant for a lone point (nothing consumes it) but Geo's
// functions expect vertex-shaped objects, so a dummy 0 keeps this a
// pass-through of the exact same math every contour transform already
// uses, rather than a hand-rolled second copy of rotate/mirror trig.
// ============================================================================
const Transform = (() => {

  // Every group targeted by `scope`, tagged with enough to write results
  // back to the right place: contour groups carry {contour: verts}, hole
  // groups carry {hole: theHoleObject} (the live object inside
  // EditorState's groups, mutated in place by applyInPlace).
  function targetItems(scope){
    const groups = EditorState.getGroups();
    if (scope === 'selected') {
      const sel = EditorState.getSelection();
      if (!sel) return [];
      const g = groups[sel.groupIndex];
      if (!g) return [];
      return g.hole ? [{ hole: g.hole }] : [{ contour: g.contours[sel.contourIndex] }];
    }
    return groups.flatMap(g => g.hole ? [{ hole: g.hole }] : g.contours.map(contour => ({ contour })));
  }

  function roundVerts(verts){
    return verts.map(v => ({
      x: parseFloat(v.x.toFixed(4)),
      y: parseFloat(v.y.toFixed(4)),
      bulge: parseFloat((v.bulge || 0).toFixed(6)),
    }));
  }

  function applyInPlace(items, fn){
    items.forEach(item => {
      if (item.hole) {
        const [pt] = roundVerts(fn([{ x: item.hole.x, y: item.hole.y, bulge: 0 }]));
        item.hole.x = pt.x;
        item.hole.y = pt.y;
        return;
      }
      const contour = item.contour;
      const rounded = roundVerts(fn(contour));
      contour.length = 0;
      rounded.forEach(v => contour.push(v));
    });
  }

  function offset(scope, dx, dy){
    if (dx === 0 && dy === 0) return;
    applyInPlace(targetItems(scope), c => Geo.translate(c, dx, dy));
    EditorState.setGroups(EditorState.getGroups());
  }

  function rotate(scope, degrees, pivot){
    if (!degrees) return;
    applyInPlace(targetItems(scope), c => Geo.rotate(c, degrees, pivot || { x: 0, y: 0 }));
    EditorState.setGroups(EditorState.getGroups());
  }

  function mirror(scope, axisKind, pivot){
    applyInPlace(targetItems(scope), c => Geo.mirror(c, axisKind, pivot || { x: 0, y: 0 }));
    EditorState.setGroups(EditorState.getGroups());
  }

  // Bulge-aware bounding box for one contour, via tessellation rather than
  // a from-scratch arc-extents formula — this project's own Geo doesn't
  // expose a bbox helper (unlike the older zdsk-editor's Geo.contourExtents,
  // which this codebase's actual geo.js doesn't carry), and tessellating is
  // both simpler and automatically correct for the 2-vertex "full circle"
  // contours mounting holes use, which a naive vertex-only bbox would get
  // badly wrong.
  function contourExtents(verts){
    const closed = verts.length > 2 || (verts.length === 2 && Math.abs(verts[0].bulge || 0) > 1e-6);
    const pts = Geo.tessellateContour(verts, 48, closed);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  }

  // A hole group's extents use its counterbore radius (the larger of the
  // pair — see Holes.KINDS) so bbox/setOrigin/preview framing account for
  // its full visible footprint, not just its center point.
  function holeExtents(hole){
    const kindDef = Holes.KINDS[hole.kind];
    const r = kindDef ? kindDef.csDia / 2 : 0;
    return { minX: hole.x - r, maxX: hole.x + r, minY: hole.y - r, maxY: hole.y + r };
  }

  function combinedExtents(scope){
    const items = targetItems(scope);
    let box = null;
    for (const item of items) {
      const e = item.hole ? holeExtents(item.hole) : (item.contour && item.contour.length >= 1 ? contourExtents(item.contour) : null);
      if (!e || e.minX === Infinity) continue;
      if (!box) box = { ...e };
      else {
        box.minX = Math.min(box.minX, e.minX);
        box.maxX = Math.max(box.maxX, e.maxX);
        box.minY = Math.min(box.minY, e.minY);
        box.maxY = Math.max(box.maxY, e.maxY);
      }
    }
    return box;
  }

  // pos: 'tl'|'t'|'tr'|'l'|'c'|'r'|'bl'|'b'|'br' — same 9-point grid as the
  // old geometry editor's "set origin" tool.
  function setOrigin(scope, pos){
    const box = combinedExtents(scope);
    if (!box) return;
    const midX = (box.minX + box.maxX) / 2, midY = (box.minY + box.maxY) / 2;
    const shifts = {
      tl: [-box.minX, -box.maxY], t: [-midX, -box.maxY], tr: [-box.maxX, -box.maxY],
      l:  [-box.minX, -midY],     c: [-midX, -midY],     r:  [-box.maxX, -midY],
      bl: [-box.minX, -box.minY], b: [-midX, -box.minY], br: [-box.maxX, -box.minY],
    };
    const [dx, dy] = shifts[pos] || [0, 0];
    offset(scope, dx, dy);
  }

  return { offset, rotate, mirror, setOrigin, combinedExtents, contourExtents, holeExtents };
})();
