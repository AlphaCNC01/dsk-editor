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
// underneath reaches the through-slot). Returns null if there's no T-slot
// configured. The cable-channel element picks whichever of the two is
// closer to its own source point, per instance.
function tSlotEntryPoints(p){
  const { W, H, topNotchType, topNotchWidth, topNotchOffset } = p;
  if (topNotchType !== 'tslot' || !(topNotchWidth > 0)) return null;
  const cx = W/2 + (topNotchOffset || 0);
  const y = H - T_STEM_H - T_BASE_H/2; // vertical midpoint of the base arm, well inside the slot
  // Exit direction runs along the base arm itself (horizontal), away from
  // center — a channel entering here runs along the slot rather than
  // straight into its side wall.
  return {
    left:  { x: cx - topNotchWidth/2, y, dir: { x: -1, y: 0 } },
    right: { x: cx + topNotchWidth/2, y, dir: { x: 1, y: 0 } },
  };
}

// ============================================================================
// Element: Tabletop outline (rectangle + optional bottom trapezoid notch +
// optional top notch).
// ============================================================================
Elements.register((() => {
  function buildTopNotchCorners(p){
    const { W, H, topNotchType, topNotchWidth, topNotchOffset, rTopNotch } = p;
    if (topNotchType === 'rect' && topNotchWidth > 0) {
      const cx = W/2 + (topNotchOffset || 0);
      const topR = [cx + topNotchWidth/2, H];
      const botR = [cx + topNotchWidth/2, H - RECT_NOTCH_H];
      const botL = [cx - topNotchWidth/2, H - RECT_NOTCH_H];
      const topL = [cx - topNotchWidth/2, H];
      return [
        { pt: topR, r: rTopNotch }, { pt: botR, r: rTopNotch },
        { pt: botL, r: rTopNotch }, { pt: topL, r: rTopNotch },
      ];
    }
    if (topNotchType === 'tslot' && topNotchWidth > 0) {
      const cx = W/2 + (topNotchOffset || 0);
      const stemR_top = [cx + T_STEM_W/2, H];
      const stemR_bot = [cx + T_STEM_W/2, H - T_STEM_H];
      const baseR_top = [cx + topNotchWidth/2, H - T_STEM_H];
      const baseR_bot = [cx + topNotchWidth/2, H - T_STEM_H - T_BASE_H];
      const baseL_bot = [cx - topNotchWidth/2, H - T_STEM_H - T_BASE_H];
      const baseL_top = [cx - topNotchWidth/2, H - T_STEM_H];
      const stemL_bot = [cx - T_STEM_W/2, H - T_STEM_H];
      const stemL_top = [cx - T_STEM_W/2, H];
      return [
        { pt: stemR_top, r: rTopNotch }, { pt: stemR_bot, r: rTopNotch },
        { pt: baseR_top, r: rTopNotch }, { pt: baseR_bot, r: rTopNotch },
        { pt: baseL_bot, r: rTopNotch }, { pt: baseL_top, r: rTopNotch },
        { pt: stemL_bot, r: rTopNotch }, { pt: stemL_top, r: rTopNotch },
      ];
    }
    return [];
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
