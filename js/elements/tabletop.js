// Fixed depths for the top notch shapes, per spec: rectangle is 30mm tall;
// the inverted-T's stem and base are each 20mm tall. Lives at module scope
// (not inside the tabletopOutline element below) because the cable-channel
// element also needs T_STEM_H/T_BASE_H to find the T-slot's own entry
// points, without duplicating these numbers.
const RECT_NOTCH_H = 30;
const T_STEM_H = 20, T_STEM_W = 30, T_BASE_H = 20;

// The T-slot notch's own two candidate cable-channel entry points: the
// midpoint of the base's bottom edge, on the left arm and the right arm
// (baseL_bot–baseL_top / baseR_bot–baseR_top from buildTopNotchCorners
// below, but only the two points a channel would actually enter through —
// the horizontal base's own bottom edge is where a channel milled from
// underneath reaches the through-slot). Returns null if the given notch
// isn't a T-slot. The cable-channel element picks whichever of the two is
// closer to its own source point, per instance.
//
// `topNotches` is a LIST now (see buildTopNotchCorners below) — each
// T-slot instance in the list gets its own independent pair of entry
// points, indexed the same way cablePocket instances are ('tslot:<n>',
// 0-based in the list's own order — see cable-channels.js).
function tSlotEntryPoints(notch, W){
  if (!notch || notch.type !== 'tslot' || !(notch.width > 0)) return null;
  const cx = W/2 + (notch.offset || 0);
  const y = notch.__H - T_STEM_H - T_BASE_H/2; // vertical midpoint of the base arm, well inside the slot
  // Exit direction runs along the base arm itself (horizontal), away from
  // center — a channel entering here runs along the slot rather than
  // straight into its side wall.
  return {
    left:  { x: cx - notch.width/2, y, dir: { x: -1, y: 0 } },
    right: { x: cx + notch.width/2, y, dir: { x: 1, y: 0 } },
  };
}

// Resolves every 'tslot'-type entry in `topNotches` (in list order) into
// its own entry-point pair, skipping any non-T-slot / zero-width entries.
// This is what cable-channels.js indexes into for a 'tslot:<n>' target —
// `n` counts only among T-slot notches, same convention as
// 'bigPocket:<n>'/'smallPocket:<n>' counting only among their own type.
function allTSlotEntryPoints(p){
  const { W, H, topNotches } = p;
  return (topNotches || [])
    .map(notch => tSlotEntryPoints({ ...notch, __H: H }, W))
    .filter(Boolean);
}

// ============================================================================
// Element: Tabletop outline (rectangle + optional bottom trapezoid notch +
// optional top notch).
// ============================================================================
Elements.register((() => {
  // One notch's own corners, in the same right-to-left winding order the
  // old single-notch code used (the top edge itself is walked right to
  // left — from TR toward TL — so each notch's own corners must run
  // right-arm-down, across the bottom, left-arm-up, matching that
  // direction; see buildContours' own corners array below).
  function oneNotchCorners(notch, W){
    const { type, width, offset, r } = notch;
    if (!(width > 0)) return [];
    const cx = W/2 + (offset || 0);
    if (type === 'rect') {
      const topR = [cx + width/2, notch.__H];
      const botR = [cx + width/2, notch.__H - RECT_NOTCH_H];
      const botL = [cx - width/2, notch.__H - RECT_NOTCH_H];
      const topL = [cx - width/2, notch.__H];
      return [
        { pt: topR, r }, { pt: botR, r },
        { pt: botL, r }, { pt: topL, r },
      ];
    }
    if (type === 'tslot') {
      const H = notch.__H;
      const stemR_top = [cx + T_STEM_W/2, H];
      const stemR_bot = [cx + T_STEM_W/2, H - T_STEM_H];
      const baseR_top = [cx + width/2, H - T_STEM_H];
      const baseR_bot = [cx + width/2, H - T_STEM_H - T_BASE_H];
      const baseL_bot = [cx - width/2, H - T_STEM_H - T_BASE_H];
      const baseL_top = [cx - width/2, H - T_STEM_H];
      const stemL_bot = [cx - T_STEM_W/2, H - T_STEM_H];
      const stemL_top = [cx - T_STEM_W/2, H];
      return [
        { pt: stemR_top, r }, { pt: stemR_bot, r },
        { pt: baseR_top, r }, { pt: baseR_bot, r },
        { pt: baseL_bot, r }, { pt: baseL_top, r },
        { pt: stemL_bot, r }, { pt: stemL_top, r },
      ];
    }
    return [];
  }

  // ------------------------------------------------------------------
  // The tabletop is a BASE SHAPE minus a list of CUTOUTS.
  //
  //   base shape — today always the rectangle W x H with its own corner
  //                radii (rBottom at the bottom, rTop at the top); more
  //                shapes can be added here later.
  //   cutouts    — each is a polygon of {pt, r} corners whose "mouth"
  //                vertices lie exactly ON the base shape's edge: the
  //                bottom trapezoid notch, and every top notch (T-slot or
  //                rectangular). `r` is the fillet radius of that corner.
  //
  // The subtraction is done on the SHARP polygons (ClipperLib is exact for
  // straight edges — integers, scale 1000), then every vertex of the result
  // gets the radius it had in its source polygon (found by position), and
  // the whole thing goes through Geo.roundedPolygon as before. So the
  // fillets where a cutout meets the edge come out exactly as when the
  // cutout was part of one hand-built corner list, and overlapping cutouts
  // now simply merge instead of producing a self-intersecting contour.
  // ------------------------------------------------------------------
  function baseShapeCorners(p){
    const { W, H, rTop, rBottom } = p;
    return [
      { pt: [0, 0], r: rBottom }, { pt: [W, 0], r: rBottom },
      { pt: [W, H], r: rTop },    { pt: [0, H], r: rTop },
    ];
  }

  function cutoutPolygons(p){
    const { W, H, topNotches, rNotch, notchOn, notchH, notchBottom, notchTop } = p;
    const out = [];
    if (notchOn && notchH > 0 && notchBottom > 0) {
      const cx = W/2;
      out.push([
        { pt: [cx - notchBottom/2, 0], r: rNotch }, { pt: [cx - notchTop/2, notchH], r: rNotch },
        { pt: [cx + notchTop/2, notchH], r: rNotch }, { pt: [cx + notchBottom/2, 0], r: rNotch },
      ]);
    }
    for (const notch of (topNotches || [])) {
      if (notch.type === 'none' || !(notch.width > 0)) continue;
      const corners = oneNotchCorners({ ...notch, __H: H }, W);
      if (corners.length) out.push(corners);
    }
    return out;
  }

  const CLIP_SCALE = 1000;
  const keyOf = (x, y) => Math.round(x * CLIP_SCALE) + ',' + Math.round(y * CLIP_SCALE);

  // Base minus cutouts, as rounded-polygon corner lists (one per resulting
  // outline; normally exactly one, counter-clockwise).
  function subtractCutouts(base, cutouts){
    const radii = new Map();
    const note = list => list.forEach(c => radii.set(keyOf(c.pt[0], c.pt[1]), c.r));
    note(base);
    cutouts.forEach(note); // a cutout's own corner radius wins on a shared point
    const toPath = list => list.map(c => ({ X: Math.round(c.pt[0] * CLIP_SCALE), Y: Math.round(c.pt[1] * CLIP_SCALE) }));
    const clipper = new ClipperLib.Clipper();
    clipper.AddPath(toPath(base), ClipperLib.PolyType.ptSubject, true);
    cutouts.forEach(c => clipper.AddPath(toPath(c), ClipperLib.PolyType.ptClip, true));
    const solution = [];
    clipper.Execute(ClipperLib.ClipType.ctDifference, solution, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    return solution.map(path => {
      let pts = path.map(q => ({ x: q.X / CLIP_SCALE, y: q.Y / CLIP_SCALE, r: radii.get(q.X + ',' + q.Y) || 0 }));
      let area = 0;
      pts.forEach((q, i) => { const w = pts[(i + 1) % pts.length]; area += q.x * w.y - w.x * q.y; });
      if (area < 0) pts.reverse();                       // counter-clockwise
      // Start at the vertex nearest the origin (bottom-left), like the
      // hand-built list did.
      let start = 0;
      pts.forEach((q, i) => { if (q.x + q.y < pts[start].x + pts[start].y - 1e-9) start = i; });
      pts = pts.slice(start).concat(pts.slice(0, start));
      return pts.map(q => ({ pt: [q.x, q.y], r: q.r }));
    });
  }

  function buildContours(p){
    const outlines = subtractCutouts(baseShapeCorners(p), cutoutPolygons(p));
    return outlines.map(corners => ({ contour: Geo.roundedPolygon(corners), layer: 'OUTLINE' }));
  }

  return { id: 'tabletopOutline', buildContours };
})());
