// ============================================================================
// Element: Cable channels (-). Optional, per-instance grooves
// milled from a hardcoded node on one embeddable element (wirelessCharger,
// usbCharger, pult) to a target the user explicitly PICKS via that
// source's own `cableTarget` field  one of:
//   - 'none'                 no channel (default)
//   - 'tslot:<n>'             the n-th (0-based, counting only among
//     'tslot'-type topNotches instances, in list order) T-slot notch's
//     own two base-arm entry points (whichever, left/right, is closer to
//     the source  see tSlotEntryPoints), on CABLE_CHANNEL_4 (4x4mm)
//   - 'smallPocket:<n>'       the n-th (0-based, in creation order) small
//     cablePocket instance, on CABLE_CHANNEL_5_5 (5.5x5.5mm)
//   - 'bigPocket:<n>'         the n-th big cablePocket instance, on
//     CABLE_CHANNEL_5_5 (5.5x5.5mm)
// The same target vocabulary is offered to every source  there's no
// per-element restriction on which target types it may pick (any source
// can aim at the T-slot or at any pocket, big or small). The channel's
// own WIDTH, however, is fixed per SOURCE element, not per target: the
// wireless charger AND the (end-mounted/"") USB charger both cut
// a 4x4mm channel (CABLE_CHANNEL_4) regardless of what they're aimed at,
// while the pult's channel is always 5.5x5.5mm (CABLE_CHANNEL_5_5)  see
// buildContours' own three routeToChosenTarget calls below, one per
// source, each with its own hardcoded width/layer.
// target no longer exists (its index is out of range for the current
// project  pocket deleted, or its type changed), that source's channel
// is simply skipped rather than silently falling back to some other
// target: the person picked a specific target, so a channel to a
// DIFFERENT target would be a silent surprise, not a reasonable default.
//
// Every cableNode (on both the source element and the target
// cutout/pocket) carries its own local exit direction (`dir`, one of the
// 4 axis directions in that element's own local space  rotates/mirrors
// along with the element itself, same as the point). The path is built
// as: a fixed 50mm straight "stub" leaving the source along its own
// direction, a fixed 50mm straight stub leaving the target along its own
// direction, and a middle run connecting the two stub ends using only
// horizontal, vertical, and 45-diagonal segments (never an arbitrary
// angle)  picked as the shortest of a handful of simple candidate
// routes (axis-then-axis, or axis-then-diagonal-then-axis) rather than a
// full pathfinding search, since with only two stub ends to connect, a
// handful of candidates already covers every qualitatively different
// route. Every interior joint (including where a stub meets the middle
// run) is rounded, with radius the largest that fits the shortest
// segment on either side of that joint, up to a 50mm cap.
// ============================================================================
Elements.register((() => {
  const STUB_LEN = 50;
  const MAX_CORNER_RADIUS = 50;

  function nearestPoint(from, candidates){
    let best = null, bestD = Infinity;
    for (const c of candidates){
      const d = Geo.dist([from.x, from.y], [c.x, c.y]);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  // Resolves every instance of a registerSimpleEmbeddable-style element
  // into a flat list of world-space cableNodes ({x,y,dir}), skipping any
  // instance/variant that has no cableNode of its own. Order matches
  // `instances`'s own order, which is what `cableTarget`'s "<n>" index
  // (see resolveCableTarget) counts against.
  function worldNodes(instances, variantsById, p){
    return (instances || [])
      .map(instance => {
        const variant = variantsById[instance.type] || variantsById.standard;
        if (!variant || !variant.cableNode) return null;
        const pt = embeddableLocalToWorld(variant.cableNode, instance, p);
        const dir = embeddableLocalDirToWorld(variant.cableNode.dir, instance, p);
        return { x: pt.x, y: pt.y, dir };
      })
      .filter(Boolean);
  }

  // Resolves a source's own `cableTarget` string into a concrete
  // world-space target point ({x,y,dir}), given the source's own already-
  // resolved world point (needed only to pick the closer of the T-slot's
  // two entry points  see tSlotEntryPoints). Returns null if the target
  // doesn't exist (no T-slot configured, or the referenced pocket index
  // is out of range for the CURRENT project)  the caller skips the
  // channel entirely in that case, exactly like an unset/'none' target.
  function resolveCableTarget(cableTarget, source, p){
    if (!cableTarget || cableTarget === 'none') return null;
    // 'tslot:<n>' — the n-th T-slot notch (0-based, counting only among
    // topNotches entries of type 'tslot' — see allTSlotEntryPoints in
    // tabletop.js and its matching updateCableTargetOptions counter in
    // field-helpers.js). Whichever of that notch's own two base-arm entry
    // points (left/right) is closer to the source is picked, same as the
    // old single-T-slot behavior.
    const tSlotMatch = /^tslot:(\d+)$/.exec(cableTarget);
    if (tSlotMatch) {
      const idx = parseInt(tSlotMatch[1], 10);
      const tSlot = allTSlotEntryPoints(p)[idx];
      if (!tSlot) return null;
      return nearestPoint(source, [tSlot.left, tSlot.right]);
    }
    const pocketMatch = /^(small|big)Pocket:(\d+)$/.exec(cableTarget);
    if (pocketMatch) {
      const [, size, idxStr] = pocketMatch;
      const idx = parseInt(idxStr, 10);
      const pockets = (p.cablePockets || []).filter(i => i.type === size);
      const nodes = worldNodes(pockets, CABLE_POCKET_VARIANTS, p);
      return nodes[idx] || null;
    }
    return null;
  }

  // The point `len` (defaulting to STUB_LEN) out from a world-space
  // cableNode, along its own world-space exit direction.
  function stubEnd(node, len){
    const l = len == null ? STUB_LEN : len;
    return { x: node.x + node.dir.x * l, y: node.y + node.dir.y * l };
  }

  // Collapses any run of points closer together than `minLen` into a
  // single point, always keeping the true first and last point of the
  // path exactly  mirrors Geo.groovePolyline's own internal merge
  // (short segments there get offset-and-rounded into a shape that's
  // effectively a single joint anyway), duplicated here so the SAME
  // collapse can be checked for fold-backs before it ever reaches
  // groovePolyline: a candidate path can look like a sequence of valid
  // 90 turns while it still has a short segment in it, and then turn
  // into an actual fold-back once that short segment collapses away 
  // this happened in practice (a near-zero-length dogleg between two
  // long segments running in nearly opposite directions), so turn
  // validity always has to be checked on the POST-merge path, not the
  // pre-merge one.
  function mergeShortSegments(points, minLen){
    let pts = [points[0]];
    for (let i = 1; i < points.length; i++){
      const p = points[i];
      const prev = pts[pts.length - 1];
      const d = Geo.dist([p.x,p.y],[prev.x,prev.y]);
      if (d < 1e-6) continue;
      if (i < points.length - 1 && d < minLen) continue;
      pts.push(p);
    }
    while (pts.length > 2) {
      const d = Geo.dist([pts[pts.length-2].x,pts[pts.length-2].y],[pts[pts.length-1].x,pts[pts.length-1].y]);
      if (d >= minLen) break;
      pts.splice(pts.length - 2, 1);
    }
    return pts;
  }

  // True if every turn in `points` (a full path, first/last points
  // included) is 90 or gentler  no two consecutive segments fold back
  // sharper than a right angle.
  function allTurnsValid(points){
    function turnCos(dirA, dirB){
      const la = Math.hypot(dirA.x, dirA.y) || 1, lb = Math.hypot(dirB.x, dirB.y) || 1;
      return (dirA.x*dirB.x + dirA.y*dirB.y) / (la*lb);
    }
    for (let i = 0; i < points.length - 2; i++){
      const segA = { x: points[i+1].x - points[i].x, y: points[i+1].y - points[i].y };
      const segB = { x: points[i+2].x - points[i+1].x, y: points[i+2].y - points[i+1].y };
      if (Math.hypot(segA.x,segA.y) < 1e-9 || Math.hypot(segB.x,segB.y) < 1e-9) continue;
      if (turnCos(segA, segB) < -1e-9) return false;
    }
    return true;
  }

  // True if any two non-adjacent segments of `points` cross  a
  // genuinely self-crossing route, not a rounding artifact. Needed in
  // addition to allTurnsValid: a path can have every individual turn at
  // 90 or gentler and still fold back tightly enough that a LATER
  // segment crosses an EARLIER, non-adjacent one (verified in practice:
  // a short "staircase" jog whose first stub and final approach ended
  // up overlapping in space, each individual turn still exactly 90) 
  // turn angle alone only catches adjacent-pair fold-backs, not this.
  function pathSelfIntersects(points){
    function segIntersect(p1, p2, p3, p4){
      const d1x = p2.x-p1.x, d1y = p2.y-p1.y, d2x = p4.x-p3.x, d2y = p4.y-p3.y;
      const denom = d1x*d2y - d1y*d2x;
      if (Math.abs(denom) < 1e-9) return false;
      const t = ((p3.x-p1.x)*d2y - (p3.y-p1.y)*d2x) / denom;
      const u = ((p3.x-p1.x)*d1y - (p3.y-p1.y)*d1x) / denom;
      return t > 1e-6 && t < 1-1e-6 && u > 1e-6 && u < 1-1e-6;
    }
    const n = points.length;
    for (let i = 0; i < n - 1; i++){
      for (let j = i + 2; j < n - 1; j++){
        if (segIntersect(points[i], points[i+1], points[j], points[j+1])) return true;
      }
    }
    return false;
  }

  // True if a CLOSED contour (as returned by Geo.groovePolyline  the
  // actual milled groove outline, not just its centerline) crosses
  // itself anywhere. Tessellates arcs into short line segments first
  // (same tolerance used throughout this app for tessellation) since
  // the contour's own bulge-arc vertices aren't directly comparable as
  // straight segments. This is the ground-truth safety check used as
  // buildChannelContour's own last resort: pathSelfIntersects on the
  // routed centerline catches most bad routes, but a route can still
  // produce a self-crossing GROOVE despite a clean centerline (a
  // corner's own rounding can overlap a nearby straight run even when
  // the centerline itself never crosses  verified in practice), so the
  // final decision of whether a channel is safe to emit checks the
  // actual output shape, not an upstream approximation of it.
  function contourSelfIntersects(contour){
    function segIntersect(p1, p2, p3, p4){
      const d1x = p2.x-p1.x, d1y = p2.y-p1.y, d2x = p4.x-p3.x, d2y = p4.y-p3.y;
      const denom = d1x*d2y - d1y*d2x;
      if (Math.abs(denom) < 1e-9) return false;
      const t = ((p3.x-p1.x)*d2y - (p3.y-p1.y)*d2x) / denom;
      const u = ((p3.x-p1.x)*d1y - (p3.y-p1.y)*d1x) / denom;
      return t > 1e-6 && t < 1-1e-6 && u > 1e-6 && u < 1-1e-6;
    }
    const pts = Geo.tessellateContour(contour, 32, true);
    const n = pts.length;
    for (let i = 0; i < n; i++){
      for (let j = i + 2; j < n; j++){
        if (i === 0 && j === n - 1) continue; // adjacent through the closing wrap
        if (segIntersect(pts[i], pts[(i+1)%n], pts[j], pts[(j+1)%n])) return true;
      }
    }
    return false;
  }


  // horizontal/vertical/45-diagonal segments, as a handful of candidate
  // routes with the shortest VALID one picked  see the element's own
  // top comment for why a full search isn't needed here. "Valid" means
  // every turn in the resulting path (including where the source's own
  // stub meets the run, and where the run meets the target's own stub)
  // turns by 90 or less: a sharper fold-back turn is exactly the case
  // groovePolyline's own rounded-capsule construction can't offset
  // cleanly (the two rails of a folded-back turn cross near the joint
  // however small the fillet radius), so it's excluded as a candidate
  // rather than produced and then discovered broken. Returns an array of
  // intermediate points (NOT including a or b themselves, since the
  // caller already has those from the stubs).
  function diagonalMiddleRun(a, b, before, after, width){
    const dx = b.x - a.x, dy = b.y - a.y;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    const sx = Math.sign(dx) || 1, sy = Math.sign(dy) || 1;
    const candidates = [];

    // Pure axis-then-axis elbows (also covers the already-axis-aligned
    // and already-diagonal cases, where one candidate collapses to a
    // straight line through the shared corner).
    candidates.push([{ x: b.x, y: a.y }]);
    candidates.push([{ x: a.x, y: b.y }]);

    // Axis-then-diagonal-then-axis, both orderings: strip off the
    // smaller of |dx|/|dy| as a 45 run, covering the leftover on the
    // longer axis as a straight leg either before or after the
    // diagonal. Both orderings are the same total length but turn
    // differently at each end, so both are offered as separate
    // candidates and filtered by turn angle below  only one (or
    // neither) may actually be a valid turn at both of its own joints.
    if (adx > 1e-6 && ady > 1e-6) {
      const straight = Math.abs(adx - ady);
      if (adx >= ady) {
        candidates.push([{ x: a.x + sx * straight, y: a.y }]);           // straight leg first (horizontal)
        candidates.push([{ x: b.x - sx * straight, y: b.y }]);           // diagonal first
      } else {
        candidates.push([{ x: a.x, y: a.y + sy * straight }]);           // straight leg first (vertical)
        candidates.push([{ x: b.x, y: b.y - sy * straight }]);           // diagonal first
      }
    }

    // Picks the best candidate by (length, then sharpest-turn-angle) 
    // length first since a genuinely shorter route is always preferred,
    // but candidates are frequently tied on length (straight-first and
    // diagonal-first cover the same total distance, just in a different
    // order), and a plain "first one that validates wins" tie-break used
    // to pick whichever construction happened to be pushed into
    // `candidates` first  for the common case of dx and dy far apart,
    // that was always the axis-then-diagonal ordering whose stub-facing
    // joint turns a full 90 (the OTHER leftover axis run only shows up
    // at the FAR end, past the diagonal), even though the
    // diagonal-first ordering covers the identical distance while
    // turning at most 45 at every joint, including both stub-facing
    // ones. Comparing candidates by their own worst joint angle (as a
    // turn-COSINE, so "worse" means smaller/more-negative) whenever
    // lengths are tied (within a small epsilon, to allow for floating-
    // point drift between orderings that are mathematically identical
    // distances) picks the gentler-turning route instead, without
    // changing anything when one candidate is actually shorter than the
    // other (length comparison still wins in that case).
    function worstTurnCos(points){
      let worst = 1; // 1 = perfectly straight; smaller = sharper
      for (let i = 0; i < points.length - 2; i++){
        const segA = { x: points[i+1].x - points[i].x, y: points[i+1].y - points[i].y };
        const segB = { x: points[i+2].x - points[i+1].x, y: points[i+2].y - points[i+1].y };
        const la = Math.hypot(segA.x, segA.y), lb = Math.hypot(segB.x, segB.y);
        if (la < 1e-9 || lb < 1e-9) continue;
        const cos = (segA.x*segB.x + segA.y*segB.y) / (la*lb);
        if (cos < worst) worst = cos;
      }
      return worst;
    }

    const LEN_TIE_EPSILON = 1e-6;
    let bestDir = null, bestLen = Infinity, bestWorstCos = -Infinity;
    for (const via of candidates){
      // Validate on the MERGED path, using the REAL points before `a`
      // and after `b` (the source/target themselves, a full stub length
      // away  not a synthetic unit step) so the merge sees the true
      // segment lengths: a candidate can look like a sequence of valid
      // <=90 deg turns as drawn, but still contain a segment shorter
      // than the channel's own width, which groovePolyline then
      // collapses away internally  and that collapse can silently
      // create a genuine fold-back that wasn't visible in the pre-merge
      // path (this happened in practice: a near-zero-length dogleg
      // between two long segments running in nearly opposite
      // directions), so turn validity is always checked on the SAME
      // merged geometry groovePolyline will actually render.
      const rawPts = [before, a, ...via, b, after].filter(Boolean);
      const merged = mergeShortSegments(rawPts, width);
      if (!allTurnsValid(merged)) continue;
      if (pathSelfIntersects(merged)) continue;
      let len = 0;
      const pts = [a, ...via, b];
      for (let i = 0; i < pts.length - 1; i++) len += Geo.dist([pts[i].x,pts[i].y],[pts[i+1].x,pts[i+1].y]);
      // worstTurnCos computed on the same merged path used for
      // validation, so the joint where a stub meets the middle run is
      // judged on its ACTUAL post-merge angle, same reasoning as the
      // turn-validity check just above.
      const worstCos = worstTurnCos(merged);
      const isBetter = len < bestLen - LEN_TIE_EPSILON
        || (len < bestLen + LEN_TIE_EPSILON && worstCos > bestWorstCos);
      if (isBetter) { bestLen = len; bestDir = via; bestWorstCos = worstCos; }
    }
    // Every straight/diagonal candidate above failed the turn-angle test
    //  this happens when the two stub directions point such that no
    // single-corner (or single-diagonal) route can reach from a to b
    // without folding back on one end's own fixed direction (e.g. both
    // stubs point "away" from each other along the same axis). The
    // guaranteed-valid fallback is a jog: step out of `a` along dirIn,
    // sidestep perpendicular to line up with `b`'s own incoming line,
    // then run straight along dirOutReversed into `b`. Every turn in a
    // jog is exactly 90 by construction, so it's always valid.
    if (!bestDir) {
      const dirIn = before ? { x: a.x - before.x, y: a.y - before.y } : null;
      const dirOutReversed = after ? { x: after.x - b.x, y: after.y - b.y } : null;
      const normalize = v => { const len = Math.hypot(v.x,v.y) || 1; return { x: v.x/len, y: v.y/len }; };
      const nDirIn = dirIn ? normalize(dirIn) : null;
      const nDirOutReversed = dirOutReversed ? normalize(dirOutReversed) : null;
      // jogRoute's own construction guarantees every individual turn is
      // valid, but not that the resulting path stays clear of the fixed
      // `before`/`after` stub segments it's connecting  a jog built
      // with the default JOG_LEAD can still route back through the
      // space either stub occupies (verified in practice: a jog whose
      // very first leg exactly re-traced the source's own stub axis,
      // crossing the final approach into the target). Retrying with a
      // larger lead pushes the jog further from both stubs; a handful
      // of escalating multipliers finds a clean route whenever the two
      // fixed stub segments themselves don't already cross (that
      // separate, unfixable-by-the-middle-run case is caught upstream
      // in fullPath, which shortens both stubs until they clear before
      // this function is ever called with them).
      for (const leadMultiplier of [1, 2, 4, 8, 16]){
        const candidate = jogRoute(a, b, nDirIn, nDirOutReversed, width, leadMultiplier);
        const fullCheck = [before, a, ...candidate, b, after].filter(Boolean);
        if (!pathSelfIntersects(fullCheck)) { bestDir = candidate; break; }
      }
      // All multipliers failed (should not happen given the stub area
      // is always bounded)  fall back to the smallest jog anyway
      // rather than returning nothing, since a slightly-imperfect
      // groove is better than no channel at all.
      if (!bestDir) bestDir = jogRoute(a, b, nDirIn, nDirOutReversed, width, 1);
    }
    return bestDir;
  }

  // A guaranteed-valid 90-only detour from a to b, respecting the fixed
  // travel directions at both ends: dirIn is the direction the path is
  // already travelling on arrival at `a` (so its first segment must turn
  // <=90 deg from dirIn), and dirOutReversed is the direction the path
  // must be travelling on arrival at `b` (so its last segment must turn
  // <=90 deg into dirOutReversed). dirIn and dirOutReversed are always
  // one of the 4 axis directions here (cableNode directions only ever
  // are), so exactly one of two constructions applies:
  //   - perpendicular axes (one horizontal, one vertical): the corner
  //     where a's own forward ray meets b's own backward ray is a single
  //     valid 90 turn at both ends, PROVIDED that corner is actually
  //     ahead of `a` along dirIn and ahead of `b` along dirOutReversed
  //     (not behind either)  checked explicitly rather than assumed,
  //     since a corner behind one end would silently create the same
  //     fold-back this function exists to avoid.
  //   - parallel axes (both horizontal, or both vertical), or the
  //     perpendicular corners above didn't pan out: a 3-point jog is
  //     used instead  forward out of a, sidestep on the perpendicular
  //     axis, forward into b.
  function jogRoute(a, b, dirIn, dirOutReversed, width, leadMultiplier){
    const JOG_LEAD = STUB_LEN * (leadMultiplier || 1);
    const cross = dirIn.x*dirOutReversed.y - dirIn.y*dirOutReversed.x;
    if (Math.abs(cross) > 1e-6) {
      // Perpendicular axes: rather than using the raw intersection of
      // a's forward ray and b's backward ray directly (which can land
      // arbitrarily close to `a` or `b`  even a fraction of a
      // millimetre away  and then get silently merged away by
      // groovePolyline's own short-segment collapse, turning what
      // looked like a valid 90 corner into a fold-back once that
      // sliver segment vanishes; this happened in practice), advance
      // from `a` by a full JOG_LEAD along dirIn and from `b` by a full
      // JOG_LEAD backward along dirOutReversed, then use whichever of
      // the two possible corners between those two ADVANCED points is
      // consistent  guaranteeing every leg is at least JOG_LEAD long
      // by construction, never a razor-thin remainder.
      const p1 = { x: a.x + dirIn.x*JOG_LEAD, y: a.y + dirIn.y*JOG_LEAD };
      const p4 = { x: b.x - dirOutReversed.x*JOG_LEAD, y: b.y - dirOutReversed.y*JOG_LEAD };
      for (const corner of [{ x: p4.x, y: p1.y }, { x: p1.x, y: p4.y }]){
        const toCorner = { x: corner.x - p1.x, y: corner.y - p1.y };
        const fromCorner = { x: p4.x - corner.x, y: p4.y - corner.y };
        // The corner just needs to not require p1->corner or
        // corner->p4 to run backward relative to dirIn/dirOutReversed;
        // when it collapses to a single point (already-aligned case)
        // that's fine too (zero-length legs there just mean p1
        // already equals p4 on this path, i.e. a straight line).
        const dIn = toCorner.x*dirIn.x + toCorner.y*dirIn.y;
        const dOut = fromCorner.x*dirOutReversed.x + fromCorner.y*dirOutReversed.y;
        if (dIn >= -1e-6 && dOut >= -1e-6) return [p1, corner, p4];
      }
    }
    // Parallel-axis case (perpendicular axes are always resolved by one
    // of the two corners above  verified exhaustively for all 4x4 axis
    // combinations, so reaching here means dirIn and dirOutReversed
    // share the same axis). Two sub-cases, since they need different
    // jog shapes:
    const alongDirIn = Math.abs(dirIn.x) > 0.5 ? 'x' : 'y';
    const sameSign = (dirIn[alongDirIn] > 0) === (dirOutReversed[alongDirIn] > 0);

    if (!sameSign) {
      // Anti-parallel (e.g. dirIn is +Y, dirOutReversed is -Y): a's own
      // forward region and b's own forward region open up facing each
      // other, so a single shared coordinate strictly beyond both
      // (forward of a by at least JOG_LEAD, AND forward of b by at
      // least JOG_LEAD measured from b backward along dirOutReversed)
      // always exists  a plain 3-point jog (forward, sidestep,
      // forward) works. Taking the further-out of the two per-point
      // minimums guarantees both legs clear JOG_LEAD.
      const aAdvanced = a[alongDirIn] + dirIn[alongDirIn]*JOG_LEAD;
      const bBacked = b[alongDirIn] - dirOutReversed[alongDirIn]*JOG_LEAD;
      const jogCoord = dirIn[alongDirIn] > 0 ? Math.max(aAdvanced, bBacked) : Math.min(aAdvanced, bBacked);
      const p1 = alongDirIn === 'x' ? { x: jogCoord, y: a.y } : { x: a.x, y: jogCoord };
      const p3 = alongDirIn === 'x' ? { x: jogCoord, y: b.y } : { x: b.x, y: jogCoord };
      return [p1, p3];
    }

    // Parallel, same direction (e.g. dirIn and dirOutReversed both +Y,
    // both stubs "facing" the same way): the point just forward of `a`
    // (p1) and the point just before `b` (p5) can end up positioned so
    // NEITHER a single sidestep NOR a same-direction crossing segment
    // reaches from one to the other without a turn sharper than 90 at
    // one end (this is the actual bug an earlier version of this
    // function had  verified by direct construction that a 3-point jog
    // is topologically impossible whenever `a` sits "behind" `b` along
    // their own shared forward direction). The general fix is a proper
    // S-jog: forward out of `a`, sidestep onto a scratch perpendicular
    // coordinate, travel along the shared axis (in EITHER direction 
    // always valid, since both of its neighboring turns are against a
    // purely perpendicular segment and are therefore always exactly
    // 90) out past wherever `b`'s own approach point sits, sidestep
    // again onto `b`'s own line, then straight into `b`. The only real
    // constraint is that this middle axis-travel ends at a coordinate
    // positioned so the FINAL segment into `b` still matches
    // dirOutReversed  guaranteed by picking that endpoint as one
    // further JOG_LEAD step beyond `b`'s own backed-off approach point,
    // in dirOutReversed's own direction.
    const perpAxis = alongDirIn === 'x' ? 'y' : 'x';
    const p1Coord = a[alongDirIn] + dirIn[alongDirIn]*JOG_LEAD;
    const p5Coord = b[alongDirIn] - dirOutReversed[alongDirIn]*JOG_LEAD;
    // One step further BEHIND p5Coord along dirOutReversed's own
    // direction (so p4->p5 also travels in dirOutReversed's direction,
    // not its opposite)  this is where the middle axis-travel segment
    // ends, guaranteeing the turn from p4 into p5 (and from there into
    // b) is a real forward step rather than a fold-back.
    const pivotCoord = p5Coord - dirOutReversed[alongDirIn]*JOG_LEAD;
    // Any perpendicular coordinate different from both endpoints works
    // for the scratch sidestep; the midpoint keeps the detour visually
    // centered between source and target rather than hugging one side.
    // When source and target already share the same perpendicular
    // coordinate (the midpoint would then equal both, collapsing the
    // sidestep to zero width and folding the whole S back onto a single
    // line), offset by JOG_LEAD instead so there's always a real,
    // non-zero sidestep for groovePolyline's own offset rails to clear.
    const perpMidpoint = (a[perpAxis] + b[perpAxis]) / 2;
    const scratchPerp = Math.abs(perpMidpoint - a[perpAxis]) > 1e-6 ? perpMidpoint : a[perpAxis] + JOG_LEAD;
    const p1 = { [alongDirIn]: p1Coord, [perpAxis]: a[perpAxis] };
    const p2 = { [alongDirIn]: p1Coord, [perpAxis]: scratchPerp };
    const p3 = { [alongDirIn]: pivotCoord, [perpAxis]: scratchPerp };
    const p4 = { [alongDirIn]: pivotCoord, [perpAxis]: b[perpAxis] };
    const p5 = { [alongDirIn]: p5Coord, [perpAxis]: b[perpAxis] };
    return [p1, p2, p3, p4, p5];
  }


  // Both diagonal-run orderings (see diagonalMiddleRun's own two
  // candidates above) share one unavoidable geometric fact whenever
  // |adx-ady| is small: the leftover straight leg on the longer axis
  // has length exactly |adx-ady|, and it has to sit adjacent to ONE of
  // the two stubs (whichever side that ordering puts it on) — there's
  // no ordering that avoids a short leftover leg entirely, only a
  // choice of WHICH end it lands next to. A short leg squeezed there,
  // even though every turn is individually <=90°, still starves that
  // joint of enough length to fillet at anything close to
  // MAX_CORNER_RADIUS (groovePolyline's own per-joint radius is capped
  // by half of whichever adjacent segment is shorter — see
  // centerlineFilletRadius) — the exact complaint this function exists
  // to fix: a visually near-sharp corner sitting right next to a
  // properly-rounded one, on what should otherwise be a smooth run.
  //
  // The fix adjusts stub LENGTH, not the middle run's own shape,
  // because a stub's endpoint always sits on the source's/target's own
  // fixed axis — changing how far out it sits never pulls it off that
  // axis, unlike reshaping the middle run itself. Each stub's length
  // moves exactly ONE of stubA/stubB's own x or y coordinate (whichever
  // axis that stub's own direction lies on — a cableNode direction is
  // always a pure axis direction, never a diagonal one), so the target
  // condition |adx| == |ady| (zero leftover leg) is a single linear
  // equation in that one coordinate, solved directly below rather than
  // approximated.
  //
  // Two stub-axis configurations are possible:
  //   - PERPENDICULAR (one stub horizontal, one vertical): each stub's
  //     length controls a DIFFERENT one of adx/ady, so each equation is
  //     independent — solve for whichever stub's adjustment alone
  //     reaches the target within bounds, trying the source stub first
  //     (an arbitrary but deterministic choice, matching this file's
  //     own convention elsewhere of resolving the source side before
  //     the target side), and falling back to adjusting the other stub
  //     for whatever gap remains if the first stub's own clamp
  //     (MIN_STUB_FOR_FILLET..MAX_STUB_FOR_RELIEF) can't fully close it.
  //   - PARALLEL (both stubs horizontal, or both vertical): both
  //     stubs' lengths affect the SAME one of adx/ady — the other is
  //     fixed entirely by source's/target's own positions and can't be
  //     adjusted by stub length at all. Solved the same way: source
  //     stub first, target stub for the remainder.
  //
  // Only engages for the genuinely diagonal case (both adx and ady
  // non-zero) — an already axis-aligned pair has no diagonal leg to
  // begin with, and diagonalMiddleRun's own axis-then-axis candidates
  // handle that case on their own.
  const MIN_STUB_FOR_FILLET = MAX_CORNER_RADIUS / 2;
  const MIN_LEFTOVER_LEG = MAX_CORNER_RADIUS / 2;
  const MAX_STUB_FOR_RELIEF = STUB_LEN * 3; // generous ceiling on how far this may grow a stub

  function relieveShortDiagonalLeg(source, stubA, target, stubB){
    const dx0 = stubB.x - stubA.x, dy0 = stubB.y - stubA.y;
    if (Math.abs(dx0) < 1e-6 || Math.abs(dy0) < 1e-6) return { stubA, stubB }; // no diagonal leg involved
    if (Math.abs(Math.abs(dx0) - Math.abs(dy0)) >= MIN_LEFTOVER_LEG) return { stubA, stubB }; // already long enough

    const aHoriz = Math.abs(source.dir.x) > Math.abs(source.dir.y);
    const bHoriz = Math.abs(target.dir.x) > Math.abs(target.dir.y);

    // Solves for the new length of ONE stub (endpoint = base + dir*len)
    // that makes |adx|=|ady| given the OTHER stub's endpoint fixed at
    // `otherEnd`. `axis` ('x' or 'y') is the axis this stub's own
    // direction lies on — the axis its length adjustment controls.
    // `fixedOtherAxisDiff` is the (untouched-by-this-adjustment) |diff|
    // on the OTHER axis, i.e. the value this stub's own axis must match.
    // Two algebraic solutions exist (±); the one closer to STUB_LEN is
    // preferred, since that's the smallest deviation from the design's
    // own default and this function only runs when the default already
    // produced a too-short leftover leg, not when no valid length
    // exists. Returns the ideal, UNCLAMPED length — clamping happens in
    // the caller, which needs the unclamped value to judge how much
    // gap clamping would leave behind.
    function idealLenFor(base, dir, axis, otherEnd, fixedOtherAxisDiff){
      const c = otherEnd[axis] - base[axis];
      const d = dir[axis]; // ±1
      const lenPlus = (c + fixedOtherAxisDiff) / d;
      const lenMinus = (c - fixedOtherAxisDiff) / d;
      return Math.abs(lenPlus - STUB_LEN) <= Math.abs(lenMinus - STUB_LEN) ? lenPlus : lenMinus;
    }
    function clamp(len){
      return Math.max(MIN_STUB_FOR_FILLET, Math.min(MAX_STUB_FOR_RELIEF, len));
    }

    if (aHoriz !== bHoriz) {
      // PERPENDICULAR: stubA's own axis and stubB's own axis are
      // different, so each can be solved independently.
      const aAxis = aHoriz ? 'x' : 'y';
      const bAxis = bHoriz ? 'x' : 'y';
      const bAxisDiff = Math.abs(stubB[bAxis] - stubA[bAxis]); // fixed by stubB's CURRENT endpoint
      const idealLenA = idealLenFor(source, source.dir, aAxis, stubB, bAxisDiff);
      const candidateStubA = stubEnd(source, clamp(idealLenA));
      const gapAfterA = Math.abs(Math.abs(candidateStubA.x - stubB.x) - Math.abs(candidateStubA.y - stubB.y));
      if (gapAfterA <= 1e-6) return { stubA: candidateStubA, stubB };
      // stubA's own clamp couldn't fully close the gap — resolve the
      // remainder via stubB, holding stubA at its just-adjusted position.
      const aAxisDiff = Math.abs(candidateStubA[aAxis] - stubB[aAxis]);
      const idealLenB = idealLenFor(target, target.dir, bAxis, candidateStubA, aAxisDiff);
      const candidateStubB = stubEnd(target, clamp(idealLenB));
      return { stubA: candidateStubA, stubB: candidateStubB };
    }

    // PARALLEL: both stubs share the same axis (both horizontal or both
    // vertical) — the OTHER axis's |difference| is fixed entirely by
    // source's/target's own positions (neither stub's direction has a
    // component on it) and can't be adjusted by stub length at all, so
    // it's the fixed target both lengths solve toward. Source stub is
    // tried first, holding target's stub at its current endpoint; any
    // remaining gap (source stub's own clamp reached before the target
    // was hit) is made up by the target stub.
    const sharedAxis = aHoriz ? 'x' : 'y';
    const fixedAxis = sharedAxis === 'x' ? 'y' : 'x';
    const fixedDiff = Math.abs(stubB[fixedAxis] - stubA[fixedAxis]);

    const idealLenA = idealLenFor(source, source.dir, sharedAxis, stubB, fixedDiff);
    const candidateStubA = stubEnd(source, clamp(idealLenA));
    const gapAfterA = Math.abs(Math.abs(candidateStubA[sharedAxis] - stubB[sharedAxis]) - fixedDiff);
    if (gapAfterA <= 1e-6) return { stubA: candidateStubA, stubB };
    const idealLenB = idealLenFor(target, target.dir, sharedAxis, candidateStubA, fixedDiff);
    const candidateStubB = stubEnd(target, clamp(idealLenB));
    return { stubA: candidateStubA, stubB: candidateStubB };
  }

  // Full path from a source cableNode to a target cableNode: source point
  // -> source's own 50mm stub -> diagonal middle run -> target's own
  // 50mm stub -> target point. The middle run is constrained to turn by
  // no more than 90° at every joint, including where it meets each
  // stub's own fixed direction, so the whole path only ever bends
  // gently enough for groovePolyline's own rounded-capsule construction
  // to offset cleanly.
  //
  // In rare configurations (source and target close together, with
  // stub directions that happen to send the two fixed 50mm stubs
  // straight through each other's own extent — verified as a real,
  // reproducible case) the two stubs themselves cross before any
  // middle-run routing is even considered; no reshaping of the middle
  // run can fix that; since it lives entirely in the two fixed
  // segments. When that's detected, both stubs are shortened together
  // (in fixed small steps, down to a minimum) until they clear each
  // other — a shorter-but-still-present stub in the node's own
  // direction is a much smaller deviation from the spec than dropping
  // the stub concept entirely for that connection.
  function fullPath(source, target, width){
    let stubLen = STUB_LEN;
    const MIN_STUB_LEN = 10;
    let stubA = stubEnd(source, stubLen);
    let stubB = stubEnd(target, stubLen);
    while (stubLen > MIN_STUB_LEN && pathSelfIntersects([source, stubA, stubB, target])) {
      stubLen -= 5;
      stubA = stubEnd(source, stubLen);
      stubB = stubEnd(target, stubLen);
    }
    // Relieve a too-short leftover diagonal leg (see
    // relieveShortDiagonalLeg's own comment) AFTER the intersection-
    // driven shrink above, using whatever stub length that loop settled
    // on as the new starting point — the two adjustments solve
    // different problems (one keeps the stubs from crossing at all, the
    // other keeps the middle run's own joints properly filletable) and
    // don't need to run in the other order.
    ({ stubA, stubB } = relieveShortDiagonalLeg(source, stubA, target, stubB));
    const middle = diagonalMiddleRun(stubA, stubB, source, target, width);
    return [source, stubA, ...middle, stubB, target];
  }

  // Builds one channel's groove contour, with a final safety net: if the
  // routed path's own groove still self-intersects despite every check
  // already applied while building that path (turn-angle validation,
  // merge-aware re-checking, stub-crossing detection  verified to
  // handle every case found during testing except a small residual tail
  // of configurations rare enough that hunting down each one
  // individually has sharply diminishing returns), fall back to the one
  // construction that's simplest to prove always safe: a straight
  // centerline from source directly to target, no stubs, no jog. It
  // won't exit the source/target along their own hardcoded directions
  // in that fallback case, but a plain, correctly-milled straight
  // channel is strictly better than the alternative of silently
  // emitting self-crossing toolpath geometry.
  //
  // MAX_CORNER_RADIUS is passed straight through as groovePolyline's own
  // ceiling  groovePolyline itself works out each joint's own actual
  // radius (capped by ITS two adjacent segments, not the whole path's
  // shortest one), so there's nothing left for this function to
  // pre-compute; a single short leg anywhere in the route no longer
  // flattens every other corner in the same path to a point.
  function buildChannelContour(source, target, width, layer, entries){
    const path = fullPath(source, target, width);
    const contour = Geo.groovePolyline(path, width, MAX_CORNER_RADIUS);
    if (!contourSelfIntersects(contour)) {
      entries.push({ contour, layer });
      return;
    }
    const straight = [source, target];
    entries.push({ contour: Geo.groovePolyline(straight, width, MAX_CORNER_RADIUS), layer });
  }

  // Routes every instance of one source element to whatever target its
  // own `cableTarget` field names (see resolveCableTarget)  shared by
  // all three source elements below, since none of them differ in how
  // a target is picked once the person has chosen one explicitly.
  // `width`/`layer` are fixed per SOURCE element (not per target), same
  // as before: a wireless charger's channel is always 4x4mm regardless
  // of which target it's aimed at, and usbCharger/pult channels are
  // always 5.5x5.5mm.
  function routeToChosenTarget(sourceInstances, sourceVariantsById, width, layer, p, entries){
    for (const instance of (sourceInstances || [])){
      if (!instance.cableTarget || instance.cableTarget === 'none') continue;
      const variant = sourceVariantsById[instance.type] || sourceVariantsById.standard;
      if (!variant || !variant.cableNode) continue;
      const sourcePt = embeddableLocalToWorld(variant.cableNode, instance, p);
      const sourceDir = embeddableLocalDirToWorld(variant.cableNode.dir, instance, p);
      const source = { x: sourcePt.x, y: sourcePt.y, dir: sourceDir };
      const target = resolveCableTarget(instance.cableTarget, source, p);
      if (!target) continue; // chosen target no longer exists  skip, don't fall back
      buildChannelContour(source, target, width, layer, entries);
    }
  }

  function buildContours(p){
    const entries = [];
    routeToChosenTarget(p.chargers, WIRELESS_CHARGER_VARIANTS, 4, 'CABLE_CHANNEL_4', p, entries);
    routeToChosenTarget(p.usbChargers, USB_CHARGER_VARIANTS, 4, 'CABLE_CHANNEL_4', p, entries);
    routeToChosenTarget(p.pults, PULT_VARIANTS, 5.5, 'CABLE_CHANNEL_5_5', p, entries);
    return entries;
  }

  return { id: 'cableChannels', buildContours };
})());
