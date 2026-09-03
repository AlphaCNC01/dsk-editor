// ============================================================================
// Dimensions — draws linear dimension lines (extension lines, a dimension
// line, inward-pointing arrowheads, and a centered text label) for the
// tabletop's overall width/height and for each embeddable element's own
// anchor-relative position. Built from the same plain-line contour
// primitives as everything else in this app (open, non-filled contours on
// the DIMENSIONS layer) rather than DXF's native DIMENSION entity — R12
// doesn't support DIMENSION at all, and every other design choice in this
// app already favors plain, universally-compatible primitives over
// format-specific entity types.
// ============================================================================
const Dimensions = (() => {
  const EXT_GAP = 4;        // gap between the dimensioned feature and where its extension line starts
  const EXT_OVERSHOOT = 4;  // how far the extension line extends past the dimension line itself
  const ARROW_LEN = 16;      // distance from an arrowhead's tip back to its tail, along the dimension line
  const ARROW_WIDTH = 6;
  const TEXT_GAP = 18;       // distance from the dimension line to the text's own geometric CENTER (not its baseline/edge — see dominant-baseline="central" in RenderSVG/ExportSVG and DXF group code 73 in ExportDXF), so the visual gap reads the same whether the text ends up above or below the line

  // Auto-stacking: every dimension call below picks a "desired" offset on
  // the general vicinity of what it's measuring, but on a busy drawing
  // several dimensions can legitimately want to sit at roughly the same
  // distance from roughly the same span (e.g. two chargers placed near
  // each other, or a tray next to the underframe), which used to just
  // overlap. STACK_STEP is how far a dimension gets pushed out, on top of
  // its own requested offset, for each already-placed dimension it would
  // otherwise collide with — see placeDimension below for the actual
  // collision search.
  const STACK_STEP = 34; // TEXT_GAP*2-ish: enough for one line + label not to touch the next
  const placedByAxis = { h: [], v: [] }; // reset per build() call, see resetStacking()

  function resetStacking(){
    placedByAxis.h.length = 0;
    placedByAxis.v.length = 0;
  }

  // Finds the smallest offset (same sign and axis as requested, magnitude
  // >= the requested one) whose dimension-line band doesn't overlap any
  // previously placed dimension that shares its span AND its base
  // coordinate. "Span" is the dimension's extent along its own direction
  // (e.g. a horizontal dimension's x-range); "base" is the coordinate the
  // offset is measured from (e.g. a horizontal dimension's own y, before
  // the offset is applied) — two dimensions can only collide if their
  // spans overlap, they're on the same side (same offset sign), AND they
  // share the same base, since dimensions measured from different base
  // lines (e.g. the underframe's own inset vs. the pult's own inset,
  // which sit on different y-coordinates entirely) never visually
  // interfere with each other regardless of offset.
  function placeDimension(axis, base, spanMin, spanMax, desiredOffset){
    const sign = desiredOffset >= 0 ? 1 : -1;
    const placed = placedByAxis[axis];
    let offset = desiredOffset;
    // Re-check from scratch each time offset changes, since pushing past
    // one collision can land inside another's band — a fixed-point loop
    // (rather than a single pass) is what makes this correct for 3+
    // overlapping dimensions stacked on the same side, not just 2.
    let changed = true;
    while (changed) {
      changed = false;
      for (const entry of placed) {
        if (entry.sign !== sign || entry.base !== base) continue;
        const overlaps = spanMin < entry.spanMax && spanMax > entry.spanMin;
        if (!overlaps) continue;
        const tooClose = Math.abs(Math.abs(offset) - Math.abs(entry.offset)) < STACK_STEP;
        if (tooClose) {
          offset = sign * (Math.abs(entry.offset) + STACK_STEP);
          changed = true;
        }
      }
    }
    placed.push({ spanMin, spanMax, offset, sign, base });
    return offset;
  }

  // Builds one linear dimension between p1 and p2, offset perpendicular to
  // the p1->p2 direction by `offset` (signed — sign picks which side the
  // dimension line sits on). Returns entries (open contours for the
  // extension lines, dimension line, and two arrowhead triangles) plus one
  // text label.
  //
  // The requested `offset` is treated as a minimum/preferred distance —
  // placeDimension may push it further out if it would otherwise overlap
  // an already-placed dimension covering the same span on the same side,
  // so two nearby measurements always end up stacked instead of on top of
  // each other. This only works for axis-aligned dimensions (p1.x===p2.x
  // or p1.y===p2.y), which covers every dimension this app draws.
  function buildLinearDimension(p1, p2, offset, formatText){
    const isHorizontal = p1.y === p2.y;
    const isVertical = p1.x === p2.x;
    if (isHorizontal || isVertical) {
      const axis = isHorizontal ? 'h' : 'v';
      const base = isHorizontal ? p1.y : p1.x;
      const spanMin = isHorizontal ? Math.min(p1.x, p2.x) : Math.min(p1.y, p2.y);
      const spanMax = isHorizontal ? Math.max(p1.x, p2.x) : Math.max(p1.y, p2.y);
      offset = placeDimension(axis, base, spanMin, spanMax, offset);
    }
    // A genuinely diagonal dimension (p1.x!==p2.x && p1.y!==p2.y) skips
    // stacking entirely and just uses its requested offset as-is — none
    // of this app's own dimensions are diagonal today, but a future one
    // shouldn't silently misbehave by being forced through the axis-only
    // collision model above.

    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;   // unit vector along the dimension
    const nx = -uy, ny = ux;              // unit vector perpendicular to it
    const sign = offset >= 0 ? 1 : -1;
    const absOffset = Math.abs(offset);

    const d1 = { x: p1.x + nx * offset, y: p1.y + ny * offset };
    const d2 = { x: p2.x + nx * offset, y: p2.y + ny * offset };

    const e1Start = { x: p1.x + nx * EXT_GAP * sign, y: p1.y + ny * EXT_GAP * sign };
    const e1End   = { x: p1.x + nx * (absOffset + EXT_OVERSHOOT) * sign, y: p1.y + ny * (absOffset + EXT_OVERSHOOT) * sign };
    const e2Start = { x: p2.x + nx * EXT_GAP * sign, y: p2.y + ny * EXT_GAP * sign };
    const e2End   = { x: p2.x + nx * (absOffset + EXT_OVERSHOOT) * sign, y: p2.y + ny * (absOffset + EXT_OVERSHOOT) * sign };

    // The arrowhead's tip sits exactly at the dimension line's endpoint
    // (d1 or d2) and points OUTWARD — away from the other endpoint, i.e.
    // toward p1's/p2's own side. The tail (the wide base of the triangle)
    // is ARROW_LEN back from the tip, toward the other endpoint. Passing
    // each arrow its own outward direction (rather than reusing the
    // line's own ux/uy for both ends) is what keeps the tip-vs-tail sides
    // correct without needing a sign trick on ARROW_LEN.
    function arrowTriangle(tip, dirOutward){
      const backX = tip.x - ARROW_LEN * dirOutward.x, backY = tip.y - ARROW_LEN * dirOutward.y;
      const perpX = -dirOutward.y, perpY = dirOutward.x;
      return [
        { x: tip.x, y: tip.y, bulge: 0 },
        { x: backX + perpX * ARROW_WIDTH / 2, y: backY + perpY * ARROW_WIDTH / 2, bulge: 0 },
        { x: backX - perpX * ARROW_WIDTH / 2, y: backY - perpY * ARROW_WIDTH / 2, bulge: 0 },
      ];
    }

    const entries = [
      { contour: [{ x: e1Start.x, y: e1Start.y, bulge: 0 }, { x: e1End.x, y: e1End.y, bulge: 0 }], layer: 'DIMENSIONS', closed: false },
      { contour: [{ x: e2Start.x, y: e2Start.y, bulge: 0 }, { x: e2End.x, y: e2End.y, bulge: 0 }], layer: 'DIMENSIONS', closed: false },
      { contour: [{ x: d1.x, y: d1.y, bulge: 0 }, { x: d2.x, y: d2.y, bulge: 0 }], layer: 'DIMENSIONS', closed: false },
      { contour: arrowTriangle(d1, { x: -ux, y: -uy }), layer: 'DIMENSIONS', closed: true },
      { contour: arrowTriangle(d2, { x: ux, y: uy }), layer: 'DIMENSIONS', closed: true },
    ];

    const midX = (d1.x + d2.x) / 2 + nx * TEXT_GAP * sign;
    const midY = (d1.y + d2.y) / 2 + ny * TEXT_GAP * sign;
    // Constrain the label's rotation to never read upside-down: a
    // dimension can point in any of the 4 directions along its axis
    // (e.g. the charger's inset dimension flips direction depending on
    // which anchor is selected), but the text should always read normally
    // left-to-right — so angles more than 90° from horizontal get flipped
    // by 180°. This preserves intentional choices like the height
    // dimension's bottom-to-top reading (90°) while fixing any dimension
    // that happens to run right-to-left or top-to-bottom.
    let textAngle = Math.atan2(dy, dx);
    if (textAngle > Math.PI / 2 || textAngle <= -Math.PI / 2) {
      textAngle += Math.PI;
      if (textAngle > Math.PI) textAngle -= 2 * Math.PI;
    }
    const texts = [{ x: midX, y: midY, text: formatText(len), angle: textAngle }];

    return { entries, texts };
  }

  function formatMm(len){
    const rounded = Math.round(len * 10) / 10;
    return (Number.isInteger(rounded) ? rounded : rounded.toFixed(1)) + ' мм';
  }

  // Builds the overall width/height dimensions for the tabletop, plus
  // dimension lines for every other configurable measurement (notch
  // widths/heights, element insets) except fillet radii, which the user
  // asked to leave undimensioned. Offsets/insets that default to zero are
  // only dimensioned when the person has actually set them to something
  // else — a zero offset has nothing meaningful to measure.
  function build(params){
    if (!params.dimensionsOn) return { entries: [], texts: [] };
    resetStacking(); // fresh collision state for this build — each call to Dimensions.build lays out an independent drawing
    const { W, H } = params;
    const gap = 30; // distance the overall dimension lines sit from the tabletop's own edge
    const entries = [];
    const texts = [];

    function add(dim){ entries.push(...dim.entries); texts.push(...dim.texts); }

    // Overall width (below) and height (left).
    add(buildLinearDimension({ x: 0, y: 0 }, { x: W, y: 0 }, -gap, formatMm));
    add(buildLinearDimension({ x: 0, y: 0 }, { x: 0, y: H }, gap, formatMm));

    // Bottom trapezoid notch: width at the tabletop's bottom edge, width at
    // the notch's own flat top, and its height.
    if (params.notchOn) {
      const cx = W / 2;
      const nBL = { x: cx - params.notchBottom / 2, y: 0 };
      const nBR = { x: cx + params.notchBottom / 2, y: 0 };
      const nTL = { x: cx - params.notchTop / 2, y: params.notchH };
      const nTR = { x: cx + params.notchTop / 2, y: params.notchH };
      // Stacked further out (gap 60) than the overall width dimension
      // (gap 30), since both sit on the same bottom edge.
      add(buildLinearDimension(nBL, nBR, -60, formatMm));
      // The notch's flat top isn't on the tabletop's own edge, so its
      // width is dimensioned as an internal line just above that edge.
      add(buildLinearDimension(nTL, nTR, 12, formatMm));
      // Height: a local vertical dimension just to the right of the
      // notch, inside the tabletop — the left side is already used by
      // the overall height dimension.
      add(buildLinearDimension({ x: nBR.x, y: 0 }, { x: nBR.x, y: params.notchH }, 15, formatMm));
    }

    // Top notch (T-slot or rectangular): width, and horizontal offset
    // from center only when the person has actually shifted it.
    if (params.topNotchType !== 'none') {
      const cx = W / 2 + params.topNotchOffset;
      const half = params.topNotchWidth / 2;
      // Placed above the tabletop (mirrors the overall-width placement
      // pattern, but on the opposite edge, so it never collides with the
      // bottom-notch stack).
      add(buildLinearDimension({ x: cx - half, y: H }, { x: cx + half, y: H }, gap, formatMm));
      if (params.topNotchOffset !== 0) {
        add(buildLinearDimension({ x: W / 2, y: H }, { x: cx, y: H }, gap + 25, formatMm));
      }
    }

    // Shared per-instance dimensioning for anchor-based embeddable
    // elements: draws a short local line from the resolved anchor point
    // to the element's own center along each axis, skipping zero insets
    // so nothing draws a zero-length "phantom" dimension. Both axes are
    // always dimensioned now — insetX/insetY are always meaningful
    // (directional distance for a corner axis, or a signed left/right or
    // up/down shift for an edge-center/center axis), matching how
    // Elements.resolveInset resolves the same instances' actual position.
    function dimensionInstanceList(instances){
      for (const instance of (instances || [])) {
        if (instance.dimensionsOn === false) continue;
        const bounds = { minX: 0, minY: 0, maxX: W, maxY: H };
        const anchorPt = Elements.resolveAnchor(instance.anchor, { x: 0, y: 0 }, bounds);
        const center = Elements.resolveInset(instance.anchor, instance.insetX, instance.insetY, bounds);
        if (instance.insetX) {
          add(buildLinearDimension({ x: anchorPt.x, y: center.y }, { x: center.x, y: center.y }, 10, formatMm));
        }
        if (instance.insetY) {
          add(buildLinearDimension({ x: center.x, y: anchorPt.y }, { x: center.x, y: center.y }, 10, formatMm));
        }
      }
    }

    // All embeddable elements now share the same instance dimensioning,
    // since resolveItems() in the UI managers already computed any
    // dynamic defaults (e.g. USB/pult following the underframe). Looping
    // over every registered element with a `paramsKey` (rather than
    // listing each params.* field by hand here) means a newly added
    // element is dimensioned automatically the moment it's registered —
    // this used to be a separate hardcoded list and silently missed
    // elements added after it was last updated (bigCablePockets and
    // smallCablePockets had no dimension lines for exactly this reason).
    for (const element of Elements.all()){
      if (element.paramsKey) dimensionInstanceList(params[element.paramsKey]);
    }

    // Underframe: dimension each inset only when nonzero. The horizontal
    // inset measures directly from the tabletop's left edge (its own
    // definition). The vertical inset is a shift away from the frame's
    // centered reference position, so it's dimensioned as that shift, not
    // as the full distance from the tabletop's center.
    if (params.underframeType !== 'none') {
      const data = Elements.all().find(e => e.id === 'underframe').VARIANTS[params.underframeType];
      if (data) {
        const insetH = params.underframeInsetH;
        const insetV = params.underframeInsetV || 0;
        const centeredTopY = H / 2 + data.height / 2;
        const actualTopY = centeredTopY + insetV;
        if (insetH !== 0) {
          add(buildLinearDimension({ x: 0, y: actualTopY + 10 }, { x: insetH, y: actualTopY + 10 }, 0, formatMm));
        }
        if (insetV !== 0) {
          add(buildLinearDimension({ x: -15, y: centeredTopY }, { x: -15, y: actualTopY }, 0, formatMm));
        }
      }
    }

    return { entries, texts };
  }

  return { build, buildLinearDimension, formatMm };
})();
