// ============================================================================
// Geo — pure 2D geometry helpers. No knowledge of "tabletop", "notch", DXF,
// or the DOM. Everything here operates on plain {x,y} points and on
// "rounded contours": arrays of {x, y, bulge} vertices, where `bulge` is the
// DXF-style curvature applying to the segment from that vertex to the next
// (0 = straight line; nonzero = arc, magnitude = tan(sweepAngle/4), sign
// positive for CCW). This convention is shared by DXF's LWPOLYLINE/POLYLINE
// bulge field and is what the rest of the app (SVG preview, DXF export)
// consumes, so every element builder ultimately produces this shape.
// ============================================================================
const Geo = (() => {

  function dist(a, b){ return Math.hypot(a[0]-b[0], a[1]-b[1]); }

  // Rounds a coordinate to `decimals` places using Decimal.js rather than
  // plain Number rounding, specifically for the moment a value is about to
  // be written into an output file (DXF/SVG). Plain floating-point math
  // accumulates small binary-representation errors across the many
  // additions/subtractions involved in placing an element (inset + offset
  // - half-width, etc.), so a value that's conceptually exactly 30 can
  // arrive here as 29.999999999999996; Decimal.js's decimal (not binary)
  // arithmetic cleans that up to a true "30" before export, so CAD/CAM
  // tools reading the file see round millimeter values instead of noise.
  // Falls back to plain rounding if Decimal.js failed to load (e.g. no
  // network on first load with the CDN script) so export still works,
  // just without the extra cleanup.
  function cleanRound(value, decimals = 4){
    if (typeof Decimal === 'undefined') {
      const f = Math.pow(10, decimals);
      return Math.round(value * f) / f;
    }
    return new Decimal(value).toDecimalPlaces(decimals).toNumber();
  }

  // Shifts every vertex of a contour by (dx, dy), keeping each vertex's
  // bulge untouched — bulge describes curvature relative to the segment's
  // own two endpoints, so a plain translation never needs to touch it.
  // Used by every element's buildContours to place its local-coordinate
  // shape at its resolved world position.
  function translate(verts, dx, dy){
    return verts.map(v => ({ x: v.x + dx, y: v.y + dy, bulge: v.bulge }));
  }

  // Rotates a contour counter-clockwise by `degrees` around a given pivot
  // (defaults to the local origin). A pure rotation is a rigid motion —
  // it never changes which side of an edge is "inside" a curve, so bulge
  // (which only encodes curvature relative to the edge's own direction,
  // not any absolute axis) needs no sign correction here, unlike a
  // mirror. Used for the user-facing "Повернуть" control on embeddable
  // elements — applied to local coordinates, before Geo.translate places
  // the shape at its resolved world position, so the pivot is whatever
  // point the caller's local (0,0) represents for that element (its own
  // anchor point, not necessarily its visual center).
  function rotate(verts, degrees, pivot = { x: 0, y: 0 }){
    if (!degrees) return verts;
    const rad = degrees * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    return verts.map(v => {
      const dx = v.x - pivot.x, dy = v.y - pivot.y;
      return {
        x: pivot.x + dx * cos - dy * sin,
        y: pivot.y + dx * sin + dy * cos,
        bulge: v.bulge,
      };
    });
  }

  // Mirrors a contour across a horizontal or vertical line through a
  // given pivot (defaults to the local origin) — 'horizontal' flips
  // vertically (reflects y, i.e. the shape ends up mirrored across a
  // horizontal line, matching how "Отразить: по горизонтали" reads as
  // "flip across the horizontal axis" for other CAD/vector tools), while
  // 'vertical' flips horizontally (reflects x). Any reflection reverses a
  // contour's winding (CW <-> CCW) and each bulge's effective curvature
  // side, so this always runs the result back through reverseContour to
  // restore consistent winding — same correction every other mirroring
  // element in this app already applies (see e.g. the underframe/pult's
  // own mirrorX, or the usbCharger's own mirrorY).
  function mirror(verts, axisKind, pivot = { x: 0, y: 0 }){
    if (!axisKind || axisKind === 'none') return verts;
    const flipped = verts.map(v => {
      if (axisKind === 'horizontal') {
        return { x: v.x, y: 2 * pivot.y - v.y, bulge: -v.bulge };
      }
      return { x: 2 * pivot.x - v.x, y: v.y, bulge: -v.bulge };
    });
    return reverseContour(flipped);
  }

  // Shoelace formula: positive for a counter-clockwise contour, negative
  // for clockwise. Used to check/enforce winding direction before writing
  // a contour out (DXF and the fill-rule-sensitive parts of SVG both care
  // about winding).
  function signedArea(verts){
    let a = 0;
    const n = verts.length;
    for (let i = 0; i < n; i++){
      const p1 = verts[i], p2 = verts[(i + 1) % n];
      a += p1.x * p2.y - p2.x * p1.y;
    }
    return a / 2;
  }

  // Reverses a contour's winding direction (CW <-> CCW). Since `bulge` on
  // vertex i describes the arc for the edge i -> i+1, reversing point
  // order also shifts which vertex each bulge belongs to and flips its
  // sign relative to the new edge direction — both handled here, not just
  // the point order, so the resulting contour still draws the same arcs.
  function reverseContour(verts){
    const n = verts.length;
    const revPoints = [...verts].reverse().map(v => ({ x: v.x, y: v.y }));
    const out = [];
    for (let k = 0; k < n; k++){
      const origIdx = (n - 2 - k + n) % n;
      out.push({ x: revPoints[k].x, y: revPoints[k].y, bulge: -verts[origIdx].bulge });
    }
    return out;
  }

  // Given the corner of a polygon (prev -> corner -> next) and a fillet
  // radius, returns [tangentIn, tangentOut, bulge]:
  //   tangentIn / tangentOut: where the fillet arc touches the two edges
  //   bulge: curvature for the arc FROM tangentIn TO tangentOut
  // If r<=0 or the corner is degenerate, returns the corner itself twice
  // with bulge 0 (no rounding) so callers can treat every corner uniformly.
  function filletCorner(pIn, corner, pOut, r){
    if (r <= 0) return [corner, corner, 0];
    const v1 = [pIn[0]-corner[0], pIn[1]-corner[1]];
    const v2 = [pOut[0]-corner[0], pOut[1]-corner[1]];
    const len1 = Math.hypot(v1[0], v1[1]);
    const len2 = Math.hypot(v2[0], v2[1]);
    if (len1 < 1e-9 || len2 < 1e-9) return [corner, corner, 0];
    const u1 = [v1[0]/len1, v1[1]/len1];
    const u2 = [v2[0]/len2, v2[1]/len2];
    let dot = u1[0]*u2[0] + u1[1]*u2[1];
    dot = Math.max(-1, Math.min(1, dot));
    const theta = Math.acos(dot);
    if (theta < 1e-6) return [corner, corner, 0];
    let tlen = r / Math.tan(theta/2);
    // Clamp so the fillet never overruns the available edge length
    // (prevents self-intersecting geometry on very tight params).
    const maxLen = Math.min(len1, len2) * 0.999;
    tlen = Math.min(tlen, maxLen);
    const t1 = [corner[0]+u1[0]*tlen, corner[1]+u1[1]*tlen];
    const t2 = [corner[0]+u2[0]*tlen, corner[1]+u2[1]*tlen];
    const cross = u1[0]*u2[1] - u1[1]*u2[0];
    const sweep = Math.PI - theta;
    const bmag = Math.tan(sweep/4);
    const bulge = cross < 0 ? bmag : -bmag;
    return [t1, t2, bulge];
  }

  // Turns a list of {pt: [x,y], r: radius} corners (in order, forming a
  // closed polygon) into a rounded contour: an array of {x, y, bulge}
  // vertices, two per corner (tangent-in, tangent-out), ready for SVG
  // rendering or DXF tessellation.
  function roundedPolygon(corners){
    const n = corners.length;
    const verts = [];
    for (let i = 0; i < n; i++){
      const prev = corners[(i - 1 + n) % n].pt;
      const cur = corners[i].pt;
      const next = corners[(i + 1) % n].pt;
      const r = corners[i].r;
      const [tIn, tOut, bulge] = filletCorner(prev, cur, next, r);
      // bulge describes the arc FROM this vertex TO the next one in the
      // list. The arc runs from tIn to tOut (the fillet itself), so the
      // bulge goes on tIn; tOut then starts a straight edge to the next
      // corner's tIn, so it carries bulge 0.
      verts.push({ x: tIn[0], y: tIn[1], bulge: bulge });
      verts.push({ x: tOut[0], y: tOut[1], bulge: 0 });
    }
    return verts;
  }

  // Reconstructs the radius of a bulge arc from its chord length.
  function bulgeRadius(p1, p2, bulge){
    const d = dist(p1, p2);
    return Math.abs(d * (1 + bulge*bulge) / (4 * Math.abs(bulge)));
  }

  // Converts one rounded contour into an SVG path `d` string. `flipY`
  // mirrors CAD (Y-up) coordinates into SVG (Y-down) display space around
  // height H; when flipping, the arc sweep-flag must also flip to keep the
  // visual direction consistent (a CCW arc in Y-up becomes CW on screen).
  function contourToSvgPath(verts, flipY, H, closed = true){
    const y = v => flipY ? (H - v) : v;
    let d = `M ${verts[0].x} ${y(verts[0].y)} `;
    const n = verts.length;
    const segCount = closed ? n : n - 1;
    for (let i = 0; i < segCount; i++){
      const cur = verts[i];
      const next = verts[(i+1) % n];
      if (Math.abs(cur.bulge) < 1e-9){
        d += `L ${next.x} ${y(next.y)} `;
      } else {
        const r = bulgeRadius([cur.x, cur.y], [next.x, next.y], cur.bulge);
        const sweepAngle = Math.abs(4 * Math.atan(cur.bulge));
        const largeArc = sweepAngle > Math.PI ? 1 : 0;
        let sweepFlag = cur.bulge > 0 ? 1 : 0;
        if (flipY) sweepFlag = 1 - sweepFlag;
        d += `A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${next.x} ${y(next.y)} `;
      }
    }
    if (closed) d += 'Z';
    return d;
  }

  // Converts one rounded contour into a plain polyline (list of {x,y}
  // points, no bulge) by sampling each arc into short straight segments.
  // Used only for DXF export: some DXF readers handle bulge on the classic
  // POLYLINE/VERTEX entity inconsistently (a few drop or misread the 42
  // group), which can turn a small fillet into a visible kink. Tessellating
  // before export guarantees the file looks identical in every reader; the
  // on-screen preview still uses true arcs via contourToSvgPath above.
  function tessellateContour(verts, segmentsPerFullCircle, closed = true){
    const out = [];
    const n = verts.length;
    const segCount = closed ? n : n - 1;
    for (let i = 0; i < segCount; i++){
      const cur = verts[i];
      const next = verts[(i + 1) % n];
      out.push({ x: cur.x, y: cur.y });
      if (Math.abs(cur.bulge) < 1e-9) continue; // straight edge, nothing to add

      const bulge = cur.bulge;
      const sweepAngleMag = Math.abs(4 * Math.atan(Math.abs(bulge))); // 0..2*PI
      const isCCW = bulge > 0; // DXF convention: positive bulge = CCW
      const chord = dist([cur.x, cur.y], [next.x, next.y]);
      const r = Math.abs(chord / (2 * Math.sin(sweepAngleMag / 2)));

      const mx = (cur.x + next.x) / 2, my = (cur.y + next.y) / 2;
      const dx = next.x - cur.x, dy = next.y - cur.y;
      const len = Math.hypot(dx, dy) || 1;
      const nxp = -dy / len, nyp = dx / len; // unit perpendicular to the chord
      const h = r * Math.cos(sweepAngleMag / 2); // distance from chord midpoint to center

      // A chord has two possible circle centers (one on each side). Rather
      // than assume which sign matches the bulge convention, try both and
      // keep whichever one actually produces the expected sweep angle when
      // walking from `cur` to `next` — this is the only fully reliable check
      // (confirmed by earlier debugging: trusting the sign convention alone
      // silently breaks on concave/reflex corners).
      const candidates = [
        { x: mx + nxp * h, y: my + nyp * h },
        { x: mx - nxp * h, y: my - nyp * h },
      ];
      let best = null;
      for (const c of candidates){
        const a0 = Math.atan2(cur.y - c.y, cur.x - c.x);
        const a1 = Math.atan2(next.y - c.y, next.x - c.x);
        let diff = a1 - a0;
        while (diff <= -Math.PI * 2) diff += Math.PI * 2;
        while (diff > Math.PI * 2) diff -= Math.PI * 2;
        if (isCCW && diff < 0) diff += Math.PI * 2;
        if (!isCCW && diff > 0) diff -= Math.PI * 2;
        const err = Math.abs(Math.abs(diff) - sweepAngleMag);
        if (!best || err < best.err) best = { center: c, startAngle: a0, sweep: diff, err };
      }

      const { center, startAngle, sweep } = best;
      const steps = Math.max(2, Math.ceil((Math.abs(sweep) / (2 * Math.PI)) * segmentsPerFullCircle));
      for (let s = 1; s < steps; s++){
        const a = startAngle + sweep * (s / steps);
        out.push({ x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a) });
      }
    }
    if (!closed) out.push({ x: verts[n - 1].x, y: verts[n - 1].y });
    return out;
  }

  // Builds a closed "groove" contour (a constant-width channel, capped
  // with a semicircle at each open end) from an open polyline of {x,y}
  // centerline points, at a given width — used for cable channels: a
  // milled slot running along a path from some element's own anchored
  // point to a cutout/pocket's own anchored point.
  //
  // The turn at each interior point is rounded on the CENTERLINE itself
  // (via filletCorner, same primitive used for a polygon's own corners)
  // BEFORE the channel's own width is applied — not by rounding the
  // corners of the two already-offset rails, the way a naive
  // stroke-a-polyline construction would. That distinction is the whole
  // point: rounding the offset rails caps the achievable radius at
  // width/2 (round it any more and the rails would cross), which for a
  // narrow channel (4-5.5mm) means a radius of only 2-2.75mm — visually
  // indistinguishable from a sharp corner at any normal zoom level, even
  // though it IS technically rounded. Rounding the centerline first, at
  // a much larger radius (up to maxCornerRadius, typically 50mm), and
  // THEN offsetting that already-curved line by hw on each side gives a
  // constant-width channel that visibly curves through the turn — the
  // channel's own width can locally read as slightly wider than nominal
  // on the outside of a tight turn (a plain per-side offset of a curve
  // by a constant distance isn't itself a curve of exactly the same
  // radius, but for these dimensions — a large fillet vs. a narrow
  // channel — the difference is negligible and never approaches
  // pinching shut, so it's not worth a more elaborate true-parallel-curve
  // construction here).
  //
  // A rounded centerline segment is either a straight line (bulge 0) or
  // a circular arc (bulge != 0, from filletCorner) — offsetting a
  // straight segment by a constant distance gives another straight
  // segment; offsetting an arc by a constant distance gives a
  // concentric arc (same center, radius R∓hw depending on which side).
  // Both cases are handled uniformly below by tracking, for each
  // centerline vertex, its own arc center/radius when it's part of a
  // fillet (null when it's a straight corner) and offsetting from that
  // center rather than by a fixed perpendicular direction when present.
  function groovePolyline(points, width, maxCornerRadius){
    const hw = width / 2;
    // Drop points that fall within one full width of the previously kept
    // point — always the true first/last point stay (down to a tiny
    // epsilon, to dedupe exact repeats), but an interior point is merged
    // into its neighbor if it's closer than that, since a leg shorter
    // than the channel's own width isn't long enough for the two offset
    // rails to clear each other at both of that short leg's own joints.
    // Collapsing such a point straight through to its neighbor is
    // exactly the "cut the corner, don't chase a minimal path" behavior
    // the channel routing already wants, so this is a safe
    // simplification rather than a lossy one. The true first and true
    // last point of the path are always kept exactly — only interior
    // points collapse — by first deduping forward (drop an interior
    // point too close to what's already kept) and then deduping
    // backward from the true end (drop the point right before the end
    // if it's too close to the end), so a short final leg collapses
    // toward the endpoint rather than leaving a stray close point
    // behind it.
    let pts = [points[0]];
    for (let i = 1; i < points.length; i++){
      const p = points[i];
      const prev = pts[pts.length - 1];
      const d = dist([p.x,p.y],[prev.x,prev.y]);
      if (d < 1e-6) continue; // exact duplicate
      if (i < points.length - 1 && d < width) continue; // short interior hop, collapse
      pts.push(p);
    }
    while (pts.length > 1) {
      const d = dist([pts[pts.length-2].x,pts[pts.length-2].y],[pts[pts.length-1].x,pts[pts.length-1].y]);
      if (d >= width || pts.length <= 2) break;
      pts.splice(pts.length - 2, 1); // drop the point just before the end, keep collapsing backward
    }
    if (pts.length < 2) {
      const c = pts[0] || { x: 0, y: 0 };
      pts.push({ x: c.x + 1e-3, y: c.y });
    }

    // Radius for the fillet at interior point i, capped at
    // maxCornerRadius but never larger than half of either adjacent
    // segment's own length (so two fillets on a short middle leg can
    // never overlap each other) — no dependency on the channel's own
    // width here at all, unlike the old offset-rail approach, since the
    // centerline's own fillet doesn't need to leave the channel's rails
    // room to clear each other (that's handled separately, by the
    // per-side offset below).
    function centerlineFilletRadius(i){
      if (i <= 0 || i >= pts.length - 1) return 0;
      const segIn = dist([pts[i-1].x,pts[i-1].y],[pts[i].x,pts[i].y]);
      const segOut = dist([pts[i].x,pts[i].y],[pts[i+1].x,pts[i+1].y]);
      return Math.min(maxCornerRadius, segIn / 2, segOut / 2);
    }

    // Rounds the centerline itself into a list of {x, y, arc} vertices —
    // `arc` is null for a straight corner, or {cx, cy, r} (the fillet's
    // own circle) for a rounded one — walking each original interior
    // point and either keeping it as-is (straight, no room to fillet:
    // collinear points, or a first/last point) or replacing it with the
    // fillet's own two tangent points plus that arc's center/radius.
    const rounded = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++){
      const r = centerlineFilletRadius(i);
      if (r < 1e-6) { rounded.push(pts[i]); continue; }
      const [tIn, tOut, bulge] = filletCorner(
        [pts[i-1].x, pts[i-1].y], [pts[i].x, pts[i].y], [pts[i+1].x, pts[i+1].y], r
      );
      if (Math.abs(bulge) < 1e-9) { rounded.push(pts[i]); continue; } // collinear, filletCorner declined
      // filletCorner already used radius `r` to build this fillet, so
      // the arc's own radius is exactly `r` — no need to recover it from
      // the bulge. Only the center is unknown: it sits on the chord's
      // own perpendicular bisector, offset by however far a chord of
      // this length needs to reach radius `r` from its midpoint, on
      // whichever side the bulge's own sign indicates. Verified directly
      // against filletCorner's own worked example (a 90° corner at
      // (200,0) turning from (0,0) toward (200,200), fillet radius 50):
      // that call returns bulge > 0, and the fillet's own correct center
      // is (150,50) — which matches perp=(dy,-dx) at bulge>0 below, not
      // the other sign (an earlier version of this code had the two
      // swapped, verified by checking that the "wrong" perp choice
      // placed the center ON the corner's own second edge line, which is
      // geometrically impossible for a genuine tangent circle).
      const mid = { x: (tIn[0]+tOut[0])/2, y: (tIn[1]+tOut[1])/2 };
      const chordLen = dist(tIn, tOut);
      const h = Math.sqrt(Math.max(0, r*r - (chordLen/2)*(chordLen/2)));
      const dx = (tOut[0]-tIn[0])/chordLen, dy = (tOut[1]-tIn[1])/chordLen;
      const perp = bulge > 0 ? { x: -dy, y: dx } : { x: dy, y: -dx };
      const center = { x: mid.x + perp.x*h, y: mid.y + perp.y*h };
      // Both endpoints of this fillet share the SAME arc object (by
      // reference, not just equal values) — buildRail below relies on
      // `a._arc === b._arc` to recognize when two adjacent offset
      // vertices came from one continuous arc (vs. two straight
      // corners that just happen to have identical center/radius,
      // which can't actually happen here, but relying on value equality
      // instead of reference equality would be fragile either way).
      const arc = { cx: center.x, cy: center.y, r, ccw: bulge > 0 };
      rounded.push({ x: tIn[0], y: tIn[1], arc });
      rounded.push({ x: tOut[0], y: tOut[1], arc });
    }
    rounded.push(pts[pts.length - 1]);

    // Builds one offset rail (side = +1 or -1) as a list of {x,y,bulge}
    // vertices, walking `rounded` in order. A straight vertex offsets by
    // hw along its own local perpendicular (averaged from its
    // neighbors, same as the old normal() helper); a vertex that's part
    // of an arc offsets by staying on the SAME arc's own center, at
    // radius r∓hw — the sign (which side gets the smaller radius)
    // depends on the arc's own CCW/CW direction, verified directly
    // against a worked example rather than assumed (see buildRail's own
    // dirSign comment below).
    function buildRail(side){
      const verts = [];
      for (let i = 0; i < rounded.length; i++){
        const v = rounded[i];
        if (v.arc) {
          const dxc = v.x - v.arc.cx, dyc = v.y - v.arc.cy;
          const distFromCenter = Math.hypot(dxc, dyc) || 1;
          // Verified directly against the same worked example as the
          // center-sign fix above: for that CCW turn, the LEFT rail
          // (side=+1) is the turn's own inside, which needs the SMALLER
          // radius (r-hw) — i.e. dirSign=-1 when ccw is true and side=+1.
          const dirSign = v.arc.ccw ? -1 : 1;
          const newR = v.arc.r + side*dirSign*hw;
          const ux = dxc/distFromCenter, uy = dyc/distFromCenter;
          verts.push({ x: v.arc.cx + ux*newR, y: v.arc.cy + uy*newR, _arc: v.arc, _side: side });
        } else {
          const prevPt = rounded[Math.max(i-1,0)], nextPt = rounded[Math.min(i+1,rounded.length-1)];
          const dx = nextPt.x - prevPt.x, dy = nextPt.y - prevPt.y, len = Math.hypot(dx,dy) || 1;
          const nx = -dy/len, ny = dx/len;
          verts.push({ x: v.x + side*hw*nx, y: v.y + side*hw*ny, _arc: null });
        }
      }
      // Assign bulge to each vertex for the segment TO the next vertex:
      // 0 for a straight run, or the arc's own bulge (same center/radius
      // pair shared by both this vertex and the next, when both belong
      // to the same source arc) recomputed for the offset radius.
      const out = [];
      for (let i = 0; i < verts.length; i++){
        const a = verts[i], b = verts[i+1];
        let bulgeVal = 0;
        if (b && a._arc && b._arc && a._arc === b._arc) {
          const r = dist([a.x,a.y],[a._arc.cx,a._arc.cy]);
          const chord = dist([a.x,a.y],[b.x,b.y]);
          const sweepHalf = Math.asin(Math.min(1, chord/(2*r || 1)));
          bulgeVal = Math.tan(sweepHalf/2) * (a._arc.ccw ? 1 : -1);
        }
        out.push({ x: a.x, y: a.y, bulge: bulgeVal });
      }
      return out;
    }

    const leftRail = buildRail(1);
    const rightRail = buildRail(-1);

    // Assemble the closed contour: left rail forward (each vertex
    // already carries the bulge for ITS OWN segment to the next left
    // vertex), a semicircular cap at the far end (bulge tan(90°/2)=1,
    // sweeping from the left rail's own last point directly to the
    // right rail's own last point — no intermediate vertex, the arc
    // itself IS the transition), right rail backward (walking it in
    // reverse means each vertex's own forward-direction bulge belongs
    // to the segment BEHIND it now, i.e. vertex k's bulge moves to
    // vertex k-1 once reversed, with its sign flipped since the
    // direction of travel through that arc is now reversed too), and a
    // matching cap back to the left rail's own start.
    const contour = [];
    for (const v of leftRail) contour.push({ x: v.x, y: v.y, bulge: v.bulge });
    contour[contour.length - 1].bulge = 1; // far-end cap: sweeps from here straight to rightRail's own last point
    for (let i = rightRail.length - 1; i >= 0; i--){
      // Reversed traversal: this vertex's own segment (to the NEXT
      // vertex in reversed order, i.e. rightRail[i-1]) carries whatever
      // bulge rightRail[i-1] originally had for ITS forward segment
      // (rightRail[i-1] -> rightRail[i]) — same arc, opposite direction
      // of travel, so the sign flips.
      const bulge = i > 0 ? -rightRail[i-1].bulge : 1; // the last vertex (i=0) is itself the near-end cap
      contour.push({ x: rightRail[i].x, y: rightRail[i].y, bulge });
    }

    return signedArea(contour) >= 0 ? contour : reverseContour(contour);
  }

  return { dist, filletCorner, roundedPolygon, bulgeRadius, contourToSvgPath, tessellateContour, cleanRound, translate, signedArea, reverseContour, rotate, mirror, groovePolyline };
})();
