// ============================================================================
// GCodeToolpath — geometry half of G-code export: drawing contours ->
// machine-space polylines (bottom-side mirror + panel orientation),
// tool-radius compensation via ClipperLib, and the ramped multi-pass entry
// strategy. The output is a list of abstract moves (see the Move shape
// below) — this file knows nothing about G-code text; formatting, modal
// state and the controller's dialect all live in gcode-post.js. The WHY of
// the bottom-side mirror and the vertical-panel orientation is documented
// at the top of gcode.js.
//
// Move shapes (absolute machine coordinates, mm; any axis may be omitted):
//   { t: 'rapid', x?, y?, z? }                    -> G0
//   { t: 'line',  x?, y?, z?, f? }                -> G1  (f = feed, mm/min)
//   { t: 'arc', cw, x, y, i, j, z?, f? }          -> G2 (cw) / G3 (ccw),
//                                                    i/j = centre offset
//                                                    from the arc's start
// ============================================================================
const GCodeToolpath = (() => {

  // --------------------------------------------------------------------
  // Orientation — how the design-space drawing maps onto the machine bed.
  // --------------------------------------------------------------------
  // Only 'vertical' exists today (every job is milled with the panel
  // standing up, rotated 90° counter-clockwise from the design view — see
  // the file-level comment of gcode.js). Written as a lookup so a future horizontal
  // mode, or any other 90°-multiple, is just another entry here plus a
  // UI toggle, without touching the toolpath builder itself.
  const ORIENTATIONS = {
    vertical: {
      // (x, y) in design space (Y-up, origin at the panel's own
      // bottom-left) -> (x, y) in machine space, rotated 90 CCW and
      // shifted by the panel height so the whole panel lands in X >= 0.
      // Without the shift the rotation alone puts the panel at
      // X in [-H, 0], i.e. the XY zero ends up at the bottom-RIGHT of the
      // machine-side view; with it the zero is the bottom-LEFT corner.
      apply: (x, y, W, H) => ({ x: H - y, y: x }),
    },
    horizontal: {
      apply: (x, y, W, H) => ({ x, y }),
    },
  };
  const ACTIVE_ORIENTATION = 'vertical'; // hardcoded for now, see file comment

  // --------------------------------------------------------------------
  // Tool-radius compensation - delegated to ClipperLib
  // --------------------------------------------------------------------
  // Earlier versions of this file hand-rolled contour offsetting
  // (tracking each arc's own center/radius, intersecting neighboring
  // offset primitives, degenerating a collapsed fillet into a miter,
  // etc). That approach kept producing self-intersecting, jagged
  // toolpaths on real production geometry -- most reliably on shapes
  // built from several very differently-sized arcs meeting at genuine
  // (non-tangent) corners, like the wireless-charger pocket -- because
  // hand-written polygon offsetting is a notoriously easy place to get
  // subtly wrong, and every fix here kept uncovering another case it
  // didn't handle.
  //
  // Rather than keep extending a homegrown implementation, tool-radius
  // and pocket-ring offsetting now goes through ClipperLib (Angus
  // Johnson's Clipper, the same offsetting engine behind most browser-
  // based CAM/laser-cutting tools), loaded from a CDN <script> tag in
  // index.html exactly like Decimal.js already is -- see clipperOffset
  // below for the actual call. Clipper only works on plain integer-
  // scaled polylines (no native arc primitive), so every contour is
  // tessellated to a polyline before offsetting (the same tessellation
  // DXF export already relies on -- see Geo.tessellateContour) and the
  // output is plain G1 motion throughout; this drops the earlier G2/G3
  // arc-fitting entirely. Re-fitting arcs onto Clipper's own output is a
  // reasonable follow-up once the underlying offset geometry itself is
  // solid, which is the immediate problem this replaces.
  const ARC_SEGMENTS_PER_CIRCLE = 96;

  // Clipper works in integers; this scales millimeters up before
  // handing coordinates to it and back down on the way out. 1000x gives
  // micron precision, comfortably finer than anything this app or the
  // router needs.
  const CLIPPER_SCALE = 1000;

  function requireClipperLib(){
    if (typeof ClipperLib === 'undefined') {
      throw new Error(
        'ClipperLib is not loaded. G-code export needs the ClipperLib <script> tag ' +
        '(see index.html) for tool-radius offsetting; check that the CDN script tag ' +
        'loaded successfully (network access, ad blocker, etc).'
      );
    }
    return ClipperLib;
  }

  // Offsets a plain, closed {x,y} polyline outward (dist > 0) or inward
  // (dist < 0) by a constant distance using ClipperLib's own polygon
  // offsetter, with round joins -- matching how a real round end mill
  // actually traces a corner (as opposed to miter or square joins, which
  // are for laser/plasma-style zero-diameter cutters). Returns an ARRAY
  // of rings, since offsetting can legitimately split one shape into
  // several disjoint pieces (a pocket pinched thin enough in the middle)
  // or produce zero rings (the shape fully consumed by the offset) --
  // both real, valid outcomes a hand-rolled single-ring offsetter can't
  // represent cleanly, which was itself a source of earlier bugs.
  function clipperOffset(pts, dist){
    const CL = requireClipperLib();
    if (Math.abs(dist) < 1e-6) return [pts.map(p => ({ x: p.x, y: p.y }))];
    const scaledPath = pts.map(p => ({ X: Math.round(p.x * CLIPPER_SCALE), Y: Math.round(p.y * CLIPPER_SCALE) }));

    const co = new CL.ClipperOffset(2, 0.25 * CLIPPER_SCALE);
    co.AddPath(scaledPath, CL.JoinType.jtRound, CL.EndType.etClosedPolygon);
    const solution = new CL.Paths();
    co.Execute(solution, dist * CLIPPER_SCALE);

    return solution
      .filter(path => path.length >= 3)
      .map(path => path.map(pt => ({ x: pt.X / CLIPPER_SCALE, y: pt.Y / CLIPPER_SCALE })));
  }

  // Absolute enclosed area of a plain {x,y} ring, via ClipperLib's own
  // Area function (consistent with whatever winding convention Clipper
  // itself produces, rather than re-deriving the shoelace formula here).
  function ringArea(pts){
    const CL = requireClipperLib();
    const scaled = pts.map(p => ({ X: Math.round(p.x * CLIPPER_SCALE), Y: Math.round(p.y * CLIPPER_SCALE) }));
    return Math.abs(CL.Clipper.Area(scaled)) / (CLIPPER_SCALE * CLIPPER_SCALE);
  }

  // Converts one drawing entry's rounded {x,y,bulge} contour into a
  // plain {x,y} polyline in MACHINE space: tessellate (bulge -> many
  // short line segments, reusing the same tessellation DXF export
  // already relies on), mirror bottom-side geometry (see the file-level
  // comment on why this happens here and nowhere else), then apply the
  // active panel orientation. Winding direction is left to whatever
  // tessellation produces -- Clipper's own offsetter figures out
  // inside/outside from the polygon's own orientation internally, so
  // there's no need to normalize to CCW here the way the old hand-rolled
  // offsetter required.
  function toMachinePolyline(contour, side, boardWidth, boardHeight){
    let pts = Geo.tessellateContour(contour, ARC_SEGMENTS_PER_CIRCLE, true);
    if (side === 'bottom') {
      pts = pts.map(p => ({ x: boardWidth - p.x, y: p.y }));
    }
    const orient = ORIENTATIONS[ACTIVE_ORIENTATION];
    pts = pts.map(p => orient.apply(p.x, p.y, boardWidth, boardHeight));
    return pts;
  }

  // Builds the list of toolpaths (each a plain {x,y} polyline, tool-
  // radius compensated) for one drawing entry, given its layer's own
  // millType (see layers.js):
  //   'outside' - offset OUTWARD by the tool radius (the enclosed shape
  //               must come out full size, e.g. the tabletop's own
  //               silhouette)
  //   'inside'  - offset INWARD by the tool radius (the enclosed opening
  //               must come out full size, e.g. a cutout for an insert)
  //   'contour' - cut exactly on the line, no compensation
  //   'pocket'  - clear the whole enclosed area: concentric rings
  //               walking inward from an initial inward offset (by the
  //               radius) at `stepover` spacing until a ring's own total
  //               area stops shrinking (fully cleared) -- see the loop
  //               below.
  function buildToolpaths(machinePts, millType, toolRadius, stepover){
    if (millType === 'outside') return clipperOffset(machinePts, toolRadius);
    if (millType === 'inside')  return clipperOffset(machinePts, -toolRadius);
    if (millType === 'pocket') {
      const rings = [];
      let currentRings = clipperOffset(machinePts, -toolRadius);
      let currentArea = currentRings.reduce((sum, r) => sum + ringArea(r), 0);
      rings.push(...currentRings);
      for (let guard = 0; guard < 500 && currentRings.length > 0; guard++){
        const nextRings = currentRings.flatMap(r => clipperOffset(r, -stepover));
        const nextArea = nextRings.reduce((sum, r) => sum + ringArea(r), 0);
        if (nextRings.length === 0 || nextArea < 1e-3 || nextArea >= currentArea) break;
        rings.push(...nextRings);
        currentRings = nextRings;
        currentArea = nextArea;
      }
      return rings;
    }
    return [machinePts]; // 'contour' (default)
  }

  // --------------------------------------------------------------------
  // Ramped zigzag entry + full-depth pass
  // --------------------------------------------------------------------
  // How far along the contour (as a fraction of its own total length) one
  // full forward-then-back zigzag lap of the ramp covers, per depth step
  // available to reach target — i.e. how gradual the plunge is. Smaller
  // = steeper ramp over less distance; the shop's own reference files
  // ramp over roughly the first 10-15% of a small contour's own perimeter
  // per lap, so a small closed shape gets several back-and-forth laps
  // while descending.
  const RAMP_SEGMENT_COUNT = 8; // how many polyline points the ramp zigzags across

  // Emits one full depth-pass of a closed toolpath: a ramped zigzag entry
  // from `fromZ` down to `toZ` across the first RAMP_SEGMENT_COUNT points
  // of `pts` (bouncing forward/back along that same short stretch,
  // descending a little more each traversal — the "zigzag" plunge),
  // followed by one full lap of the remaining contour at the reached
  // depth, ending back at the pass's own start point (closing the loop).
  // Returns the array of G-code lines for this one pass; `state` is the
  // shared "last emitted axis value" tracker (see moveLine) so consecutive
  // passes/contours keep omitting unchanged axes correctly across the
  // whole file, and `feed` is the tool's own cutting feedrate.
  // Builds the "zigzag then land forward" ramp index sequence used by
  // rampedPassMoves (see its own comment for why it must always end on a
  // forward leg, at rampCount, rather than back at 0).
  function buildRampIndexSequence(rampCount){
    const oneWay = [];
    for (let i = 0; i <= rampCount; i++) oneWay.push(i);
    const backWay = [...oneWay].reverse().slice(1);
    const roundTrips = 2; // matching "врезание зигзагом" — a genuine back-and-forth entry
    const seq = [];
    for (let t = 0; t < roundTrips; t++) seq.push(...oneWay, ...backWay);
    seq.push(...oneWay);
    return seq;
  }

  // --------------------------------------------------------------------
  // Full circles (holes, round pockets) — handled analytically
  // --------------------------------------------------------------------
  // A circle is authored as two bulge:1 vertices (see js/elements/hole.js).
  // Going through tessellation + Clipper would turn it into a 96-gon whose
  // vertices sit slightly outside the true radius; since offsetting a
  // circle is just changing its radius, circles skip all of that and are
  // cut as real G2/G3 arcs with a helical entry, like the shop's own
  // reference programs.
  function isCircleContour(contour){
    return contour.length === 2
      && Math.abs(contour[0].bulge - 1) < 1e-9
      && Math.abs(contour[1].bulge - 1) < 1e-9;
  }

  // Machine-space shape of one drawing contour: a circle
  // { circle: {cx, cy, r} } when it is one, otherwise { pts } (tessellated
  // polyline, as toMachinePolyline). Same bottom-side mirror and panel
  // orientation as toMachinePolyline.
  function toMachineShape(contour, side, boardWidth, boardHeight){
    if (!isCircleContour(contour)) return { pts: toMachinePolyline(contour, side, boardWidth, boardHeight) };
    let cx = (contour[0].x + contour[1].x) / 2;
    const cy = (contour[0].y + contour[1].y) / 2;
    const r = Math.hypot(contour[1].x - contour[0].x, contour[1].y - contour[0].y) / 2;
    if (side === 'bottom') cx = boardWidth - cx;
    const c = ORIENTATIONS[ACTIVE_ORIENTATION].apply(cx, cy, boardWidth, boardHeight);
    return { circle: { cx: c.x, cy: c.y, r } };
  }

  // Tool paths for one shape, same millType semantics as buildToolpaths.
  // Returns [{ pts }] (polyline) and/or [{ circle: {cx,cy}, radii, ccw }]:
  // one circular path cuts every ring in `radii` (ascending) in one go.
  // Circles are cut climb-style: inside cuts counter-clockwise (G3),
  // outside cuts clockwise (G2) — as in the reference programs.
  function buildShapePaths(shape, millType, toolRadius, stepover){
    if (!shape.circle) return buildToolpaths(shape.pts, millType, toolRadius, stepover).map(pts => ({ pts }));
    const { cx, cy, r } = shape.circle;
    const MIN_R = 1e-3;
    const one = (rr, ccw) => [{ circle: { cx, cy }, radii: [rr], ccw }];
    if (millType === 'outside') return one(r + toolRadius, false);
    if (millType === 'inside')  return r - toolRadius > MIN_R ? one(r - toolRadius, true) : [];
    if (millType === 'pocket') {
      // Concentric rings from the wall inward, until nothing is left —
      // then cut from the centre outward (see circleMoves).
      const radii = [];
      for (let rr = r - toolRadius; rr > MIN_R && radii.length < 500; rr -= stepover) radii.push(rr);
      return radii.length ? [{ circle: { cx, cy }, radii: radii.reverse(), ccw: true }] : [];
    }
    return one(r, true); // 'contour'
  }

  // How steeply the helical entry descends (mm of Z per revolution) and
  // how finely a revolution is cut into straight G1 segments.
  const HELIX_PITCH = 3;
  const HELIX_SEGMENTS = 36;

  // Moves for one circular path over all depth passes. Each pass: helical
  // descent on the innermost ring, then every ring as a full circle of
  // four 90° arcs, innermost to outermost, joined by short straight steps
  // along +X without lifting — the same way the shop's reference programs
  // clear round pockets. Every ring starts and ends at angle 0 (its +X
  // point).
  function circleMoves(path, thickness, targetZ, tool, safeZ, feed){
    const { cx, cy } = path.circle;
    const dir = path.ccw ? 1 : -1;
    const at = (rr, a) => ({ x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) });
    const r0 = path.radii[0];
    const moves = [{ t: 'rapid', x: cx + r0, y: cy }];
    const startZ = thickness;
    const totalDepth = startZ - targetZ;
    if (totalDepth > 1e-6) {
      const passCount = Math.max(1, Math.ceil(totalDepth / tool.depthPerPass));
      let fromZ = startZ;
      for (let pass = 0; pass < passCount; pass++){
        const toZ = pass === passCount - 1 ? targetZ : startZ - (totalDepth * (pass + 1) / passCount);
        // Back to the centre ring at the (already cleared) previous depth.
        if (pass > 0) moves.push({ t: 'line', x: cx + r0, y: cy });
        moves.push({ t: 'line', z: fromZ, f: feed });
        const revs = Math.max(1, Math.ceil((fromZ - toZ) / HELIX_PITCH - 1e-9));
        const steps = revs * HELIX_SEGMENTS;
        for (let m = 1; m <= steps; m++){
          const p = at(r0, dir * 2 * Math.PI * m / HELIX_SEGMENTS);
          moves.push({ t: 'line', x: p.x, y: p.y, z: m === steps ? toZ : fromZ + (toZ - fromZ) * m / steps });
        }
        path.radii.forEach((rr, k) => {
          if (k > 0) moves.push({ t: 'line', x: cx + rr, y: cy });
          for (let q = 1; q <= 4; q++){
            const p0 = at(rr, dir * (q - 1) * Math.PI / 2);
            const p1 = q === 4 ? { x: cx + rr, y: cy } : at(rr, dir * q * Math.PI / 2);
            moves.push({ t: 'arc', cw: !path.ccw, x: p1.x, y: p1.y, i: cx - p0.x, j: cy - p0.y });
          }
        });
        fromZ = toZ;
      }
    }
    moves.push({ t: 'rapid', z: safeZ });
    return moves;
  }

  // --------------------------------------------------------------------
  // Arc fitting — polyline -> lines and arcs
  // --------------------------------------------------------------------
  // Clipper only produces polylines; to cut real G2/G3 arcs, stretches of
  // the polyline that lie on a common circle are replaced by one arc. An
  // arc is accepted only if every vertex of the stretch is within
  // ARC_FIT_TOLERANCE of it, it turns one way throughout, sweeps at most
  // 90° (so the arc is never ambiguous for the controller) and bulges
  // visibly (sagitta over ARC_MIN_SAGITTA — otherwise it is just a
  // straight run and stays G1).
  const ARC_FIT_TOLERANCE = 0.003;  // mm
  const ARC_MIN_SAGITTA = 0.01;     // mm
  const ARC_MAX_SWEEP = Math.PI / 2;
  const ARC_MAX_RADIUS = 20000;     // mm

  // Circle through three points, or null when they are (nearly) collinear.
  function circumcircle(a, b, c){
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (Math.abs(d) < 1e-12) return null;
    const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
    const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
    const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
    return { x, y, r: Math.hypot(a.x - x, a.y - y) };
  }

  // Tries to fit ONE arc to P[i..j]; returns { cw, ctr } or null.
  function tryArc(P, i, j){
    const a = P[i], c = P[j], b = P[(i + j) >> 1];
    const ctr = circumcircle(a, b, c);
    if (!ctr || ctr.r > ARC_MAX_RADIUS) return null;
    const turn = (p, q, s) => (q.x - p.x) * (s.y - q.y) - (q.y - p.y) * (s.x - q.x);
    const sign = Math.sign(turn(a, b, c));
    if (sign === 0) return null;
    for (let m = i; m <= j; m++){
      if (Math.abs(Math.hypot(P[m].x - ctr.x, P[m].y - ctr.y) - ctr.r) > ARC_FIT_TOLERANCE) return null;
      if (m > i && m < j && Math.sign(turn(P[m - 1], P[m], P[m + 1])) !== sign) return null;
      if (m < j) {
        // The arc must also hug each segment BETWEEN vertices: a long
        // segment replaced by an arc bulges by its sagitta.
        const half = Math.hypot(P[m + 1].x - P[m].x, P[m + 1].y - P[m].y) / 2;
        if (half >= ctr.r || ctr.r - Math.sqrt(ctr.r * ctr.r - half * half) > ARC_FIT_TOLERANCE) return null;
      }
    }
    // Sweep a -> c in the turning direction (sign > 0 is counter-clockwise).
    let sweep = Math.atan2(c.y - ctr.y, c.x - ctr.x) - Math.atan2(a.y - ctr.y, a.x - ctr.x);
    if (sign > 0) { while (sweep < 0) sweep += 2 * Math.PI; } else { while (sweep > 0) sweep -= 2 * Math.PI; }
    sweep = Math.abs(sweep);
    if (sweep > ARC_MAX_SWEEP) return null;
    if (ctr.r * (1 - Math.cos(sweep / 2)) < ARC_MIN_SAGITTA) return null;
    return { cw: sign < 0, ctr };
  }

  // Moves that travel P[0] -> P[last] (the tool is already at P[0]),
  // using arcs where the polyline allows it and G1 lines elsewhere.
  function fitArcMoves(P){
    const moves = [];
    let i = 0;
    while (i < P.length - 1){
      let best = null, bestJ = i + 1;
      for (let j = i + 3; j < P.length; j++){
        const arc = tryArc(P, i, j);
        if (!arc) break;
        best = arc; bestJ = j;
      }
      if (best) {
        moves.push({ t: 'arc', cw: best.cw, x: P[bestJ].x, y: P[bestJ].y, i: best.ctr.x - P[i].x, j: best.ctr.y - P[i].y });
      } else {
        moves.push({ t: 'line', x: P[bestJ].x, y: P[bestJ].y });
      }
      i = bestJ;
    }
    return moves;
  }

  // Ramped zigzag entry + full-depth pass of one closed polyline, as moves.
  // See buildRampIndexSequence for why the ramp must end on a forward leg.
  function rampedPassMoves(pts, fromZ, toZ, feed, moves){
    const n = pts.length;
    const rampCount = Math.min(RAMP_SEGMENT_COUNT, n - 1);
    const rampIdxSeq = buildRampIndexSequence(rampCount);
    const totalRampSteps = rampIdxSeq.length - 1;
    const dz = (toZ - fromZ) / Math.max(1, totalRampSteps);

    // First point of the ramp: plunge straight down to fromZ at the
    // contour's own start (no XY move yet), matching the reference
    // files' own "G1Z<depth>F<feed>" first line of a pass.
    moves.push({ t: 'line', z: fromZ, f: feed });

    for (let k = 1; k < rampIdxSeq.length; k++){
      const p = pts[rampIdxSeq[k]];
      const z = k === rampIdxSeq.length - 1 ? toZ : fromZ + dz * k;
      moves.push({ t: 'line', x: p.x, y: p.y, z });
    }

    // Remainder of the full lap at the reached depth, continuing forward
    // from wherever the ramp left off back around to the start point.
    const rest = [];
    for (let i = rampCount; i <= n; i++) rest.push(pts[i % n]);
    moves.push(...fitArcMoves(rest));
  }

  // Every depth pass for one toolpath (already tool-radius compensated,
  // machine-space): rapid to its start point, then step from the
  // material's up-face (Z = thickness) down to `targetZ` in
  // `tool.depthPerPass`-sized bites, each an independent ramped-zigzag
  // pass, then retract to `safeZ`. Every contour starts fresh from the
  // up-face (no cross-layer Z-continuity) — the simple, always-correct
  // choice.
  function toolpathMoves(path, thickness, targetZ, tool, safeZ, feed){
    if (path.circle) return circleMoves(path, thickness, targetZ, tool, safeZ, feed);
    const pts = path.pts;
    // Minimum 2 vertices: a circle is two bulge:1 vertices before
    // tessellation (see js/elements/hole.js); the guard is the absolute
    // floor for "is this a shape at all".
    if (!pts || pts.length < 2) return [];
    const moves = [];
    const p0 = pts[0];
    moves.push({ t: 'rapid', x: p0.x, y: p0.y });
    const startZ = thickness;
    const totalDepth = startZ - targetZ;
    if (totalDepth > 1e-6) {
      const passCount = Math.max(1, Math.ceil(totalDepth / tool.depthPerPass));
      let fromZ = startZ;
      for (let pass = 0; pass < passCount; pass++){
        const toZ = pass === passCount - 1 ? targetZ : startZ - (totalDepth * (pass + 1) / passCount);
        rampedPassMoves(pts, fromZ, toZ, feed, moves);
        fromZ = toZ;
      }
    }
    moves.push({ t: 'rapid', z: safeZ });
    return moves;
  }

  return {
    ORIENTATIONS, ARC_SEGMENTS_PER_CIRCLE, clipperOffset, ringArea,
    toMachinePolyline, toMachineShape, buildToolpaths, buildShapePaths, toolpathMoves,
  };
})();
