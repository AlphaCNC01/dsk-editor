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

  // Every configured top notch (T-slot or rectangular), concatenated into
  // one flat corner list for the top edge. The top edge is walked right
  // to left (TR -> TL, see buildContours), so notches are sorted by
  // descending center X first — each notch's own corners already run
  // right-arm-to-left-arm (see oneNotchCorners), so simply placing
  // right-to-center notches before left-of-center ones, in that order,
  // keeps the whole top edge's winding consistent with a single physical
  // pass across it. Overlapping notches (the user's own responsibility to
  // avoid — no collision check here) will produce a self-intersecting
  // contour, same as any other invalid geometry this app doesn't guard
  // against elsewhere.
  function buildTopNotchCorners(p){
    const { W, H, topNotches } = p;
    const notches = (topNotches || []).filter(n => n.type !== 'none' && n.width > 0);
    notches.sort((a, b) => (b.offset || 0) - (a.offset || 0));
    const corners = [];
    for (const notch of notches) corners.push(...oneNotchCorners({ ...notch, __H: H }, W));
    return corners;
  }

  function buildContours(p){
    const { W, H, rTop, rBottom, rNotch, notchOn, notchH, notchBottom, notchTop } = p;
    const BL = [0, 0], BR = [W, 0], TR = [W, H], TL = [0, H];
    const topCorners = buildTopNotchCorners(p);

    let corners;
    if (notchOn && notchH > 0 && notchBottom > 0) {
      const cx = W/2;
      const nBL = [cx - notchBottom/2, 0];
      const nBR = [cx + notchBottom/2, 0];
      const nTR = [cx + notchTop/2, notchH];
      const nTL = [cx - notchTop/2, notchH];
      corners = [
        { pt: BL, r: rBottom }, { pt: nBL, r: rNotch }, { pt: nTL, r: rNotch },
        { pt: nTR, r: rNotch }, { pt: nBR, r: rNotch }, { pt: BR, r: rBottom },
        { pt: TR, r: rTop }, ...topCorners, { pt: TL, r: rTop },
      ];
    } else {
      corners = [
        { pt: BL, r: rBottom }, { pt: BR, r: rBottom },
        { pt: TR, r: rTop }, ...topCorners, { pt: TL, r: rTop },
      ];
    }

    const contour = Geo.roundedPolygon(corners);
    return [{ contour, layer: 'OUTLINE' }];
  }

  return { id: 'tabletopOutline', buildContours };
})());
