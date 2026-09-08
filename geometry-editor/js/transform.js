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
// ============================================================================
const Transform = (() => {

  function targetContours(scope){
    const groups = EditorState.getGroups();
    if (scope === 'selected') {
      const sel = EditorState.getSelection();
      if (!sel) return [];
      return [groups[sel.groupIndex].contours[sel.contourIndex]];
    }
    return groups.flatMap(g => g.contours);
  }

  function roundVerts(verts){
    return verts.map(v => ({
      x: parseFloat(v.x.toFixed(4)),
      y: parseFloat(v.y.toFixed(4)),
      bulge: parseFloat((v.bulge || 0).toFixed(6)),
    }));
  }

  function applyInPlace(contours, fn){
    contours.forEach(contour => {
      const result = fn(contour);
      const rounded = roundVerts(result);
      contour.length = 0;
      rounded.forEach(v => contour.push(v));
    });
  }

  function offset(scope, dx, dy){
    if (dx === 0 && dy === 0) return;
    applyInPlace(targetContours(scope), c => Geo.translate(c, dx, dy));
    EditorState.setGroups(EditorState.getGroups());
  }

  function rotate(scope, degrees, pivot){
    if (!degrees) return;
    applyInPlace(targetContours(scope), c => Geo.rotate(c, degrees, pivot || { x: 0, y: 0 }));
    EditorState.setGroups(EditorState.getGroups());
  }

  function mirror(scope, axisKind, pivot){
    applyInPlace(targetContours(scope), c => Geo.mirror(c, axisKind, pivot || { x: 0, y: 0 }));
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

  function combinedExtents(scope){
    const contours = targetContours(scope);
    let box = null;
    for (const c of contours) {
      if (!c || c.length < 1) continue;
      const e = contourExtents(c);
      if (e.minX === Infinity) continue;
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

  return { offset, rotate, mirror, setOrigin, combinedExtents, contourExtents };
})();
