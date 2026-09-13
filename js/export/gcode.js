// ============================================================================
// Export.GCode — Drawing -> a batch of .tap G-code files, one per (side,
// tool) combination, ready to download and run directly on the shop's CNC
// router.
//
// WHY ONE FILE PER (SIDE, TOOL):
// The router this app targets has no automatic tool changer, so a single
// program can only ever use one bit. Every layer's own `machining.side`
// (top/bottom — see js/core/layers.js) and a depth-based tool pick (see
// pickTool below) partition the whole drawing into a handful of
// independent toolpath files; the operator loads one bit, runs its file(s)
// for the current side, then swaps to the next bit. Naming follows the
// shop's own convention: "<order>-{лиц|тыл} ф<tool>.tap" — see
// buildFilename.
//
// WHY BOTTOM-SIDE GEOMETRY GETS MIRRORED HERE (NOT UPSTREAM):
// The editor always draws in one shared top-down design view, including
// geometry that's actually meant to be cut from the underside — that's
// deliberate (see layers.js's own comment: "most of this app's own
// geometry is drawn from the underside"), and it's what the DXF/SVG/PNG
// exports want too, since those are read by a human referencing a single
// consistent drawing. But the actual production step for the bottom side
// is: mill the top face first, then physically flip the panel over by
// hand (rotating around the panel's own vertical/Y axis, the same way you'd
// turn a page) before milling the bottom. That physical flip mirrors X.
// So a bottom-side layer's design-space contour needs an X-mirror right
// here, at G-code generation time, to match what the cutter will actually
// trace once the panel is really flipped on the table — nowhere else in
// the app needs this, since nowhere else models the physical flip.
//
// WHY VERTICAL-PANEL ORIENTATION IS HANDLED HERE TOO:
// Production normally mounts the panel vertically on the machine (rotated
// 90° counter-clockwise from this app's own design view) rather than flat
// the way it's drawn. That's a second, independent transform layered on
// top of the flip above (see ORIENTATION.vertical below) — hardcoded for
// now since every job today is milled vertically, but written as a single
// swappable transform so horizontal or other 90°-multiple mounts can be
// added later without touching the rest of this file.
//
// TOOLPATH STRATEGY:
// Every milled layer becomes one or more closed toolpaths, radius-
// compensated per its `millType` (contour/outside/inside/pocket — see
// layers.js), cut in successive depth passes (never plunging straight to
// full depth in one go). Each pass enters the material by ramping Z down
// while zigzagging back and forth along the contour's own first stretch,
// then finishes the remainder of that pass's lap at the reached depth —
// the same entry strategy visible in this shop's own reference .tap files
// (a straight plunge would shock a large-diameter cutter; ramping spreads
// the entry over distance instead of a single point). See buildRampedPass.
// ============================================================================
const ExportGCode = (() => {

  // --------------------------------------------------------------------
  // Tool catalog
  // --------------------------------------------------------------------
  // Every bit in shop use, named "<diameter>x<flute length>" per the shop's
  // own convention. Feedrate (mm/min), spindle speed (RPM), depth-per-pass
  // and stepover are starting points only — production numbers to be tuned
  // by the operator; kept as named constants right here so they're easy to
  // find and adjust without hunting through the toolpath logic below.
  const TOOLS = {
    '4x17': {
      id: '4x17', diameter: 4, fluteLength: 17,
      rpm: 24000, feed: 6000, plungeFeed: 6000,
      depthPerPass: 15,   // mm of Z per pass — small bit, shallow bites
      stepover: 2,     // mm between concentric pocket-clearing rings
    },
    '4x22': {
      id: '4x22', diameter: 4, fluteLength: 22,
      rpm: 24000, feed: 6000, plungeFeed: 6000,
      depthPerPass: 15,
      stepover: 2,
    },
    '8x32': {
      id: '8x32', diameter: 8, fluteLength: 32,
      rpm: 18000, feed: 4000, plungeFeed: 4000,
      depthPerPass: 10, // matches the shop's own reference file's own step
      stepover: 2,
    },
    '8x42': {
      id: '8x42', diameter: 8, fluteLength: 42,
      rpm: 18000, feed: 4000, plungeFeed: 4000,
      depthPerPass: 10,
      stepover: 2,
    },
  };

  // Depth (mm of actual cut into the material, from whichever face is
  // currently facing up on the machine — see machiningDepthMM below) at
  // or under which the short 4x17 bit is used; anything deeper needs the
  // longer-reach 8mm bit. Per the shop's own current rule (to be refined
  // later with a richer tool-selection algorithm — see the file-level
  // comment above pickTool).
  const SHALLOW_DEPTH_LIMIT = 15;

  // Picks which bit cuts a given layer, given the board's own thickness.
  // Today's rule (explicitly a placeholder the shop expects to replace
  // with something more elaborate): depth <= 15mm -> the short 4x17;
  // otherwise the 8mm bit, sized by board thickness (30mm boards use the
  // 8x32, 40mm boards the 8x42 — the shorter bit that still reaches).
  function pickTool(depthMM, thickness){
    if (depthMM <= SHALLOW_DEPTH_LIMIT) return TOOLS['4x17'];
    return thickness >= 40 ? TOOLS['8x42'] : TOOLS['8x32'];
  }

  // --------------------------------------------------------------------
  // Machining depth resolution
  // --------------------------------------------------------------------
  // Converts a layer's own `machining` record (side/depth/depthAnchor —
  // see js/core/layers.js for the full field-by-field meaning) plus the
  // board's thickness into two numbers this file actually needs:
  //   cutDepthMM — how far the tool plunges into the material from
  //                whichever face is currently facing up on the machine
  //                (the face named by `side`); this is what pickTool
  //                compares against SHALLOW_DEPTH_LIMIT.
  //   targetZ    — the machine Z coordinate (0 = table surface, since the
  //                board sits directly on the table and Z is never
  //                referenced to the board itself — see the file-level
  //                comment and the person's own current confirmation that
  //                Z-zero-by-board is a later feature, not today's
  //                behavior) the cutter reaches at full depth for this
  //                layer. The currently-up face always sits at
  //                Z = thickness (its distance above the table), so
  //                targetZ = thickness - cutDepthMM.
  function resolveDepth(machining, thickness){
    const { depth, depthAnchor } = machining;
    let cutDepthMM;
    if (depthAnchor === 'top') {
      // depth is measured from the board's TOP face regardless of which
      // face is currently up; convert to "from the up face" by flipping
      // through the thickness when the up face is actually the bottom.
      cutDepthMM = machining.side === 'bottom' ? (thickness - depth) : depth;
    } else if (depthAnchor === 'center') {
      cutDepthMM = thickness / 2 + depth;
    } else { // 'bottom' (i.e. from the up face itself) — the default
      cutDepthMM = depth;
    }
    cutDepthMM = Math.max(0, Math.min(thickness, cutDepthMM));
    const targetZ = Geo.cleanRound(thickness - cutDepthMM, 3);
    return { cutDepthMM, targetZ };
  }

  // --------------------------------------------------------------------
  // Orientation — how the design-space drawing maps onto the machine bed.
  // --------------------------------------------------------------------
  // Only 'vertical' exists today (every job is milled with the panel
  // standing up, rotated 90° counter-clockwise from the design view — see
  // the file-level comment). Written as a lookup so a future horizontal
  // mode, or any other 90°-multiple, is just another entry here plus a
  // UI toggle, without touching the toolpath builder itself.
  const ORIENTATIONS = {
    vertical: {
      // (x, y) in design space (Y-up, origin at the panel's own
      // bottom-left) -> (x, y) in machine space, rotated 90 CCW.
      apply: (x, y) => ({ x: -y, y: x }),
    },
    horizontal: {
      apply: (x, y) => ({ x, y }),
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
  function toMachinePolyline(contour, side, boardWidth){
    let pts = Geo.tessellateContour(contour, ARC_SEGMENTS_PER_CIRCLE, true);
    if (side === 'bottom') {
      pts = pts.map(p => ({ x: boardWidth - p.x, y: p.y }));
    }
    const orient = ORIENTATIONS[ACTIVE_ORIENTATION];
    pts = pts.map(p => orient.apply(p.x, p.y));
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
  // G-code line formatting
  // --------------------------------------------------------------------
  const DEC = 3; // matches the shop's own reference files' own precision
  function fmt(n){ return Geo.cleanRound(n, DEC).toFixed(DEC); }

  // Formats one XY(Z) move, omitting any axis that hasn't changed since
  // the last emitted point — the same "only changed axes" convention the
  // shop's own reference .tap files use throughout (see e.g. how a
  // straight run just says "X123.456" with no repeated Y/Z). `state`
  // tracks the last emitted value per axis across the whole file.
  function moveLine(prefix, x, y, z, state, extra){
    const parts = [];
    if (prefix) parts.push(prefix);
    if (x !== undefined && (state.x === null || Math.abs(x - state.x) > 1e-6)) { parts.push('X' + fmt(x)); state.x = x; }
    if (y !== undefined && (state.y === null || Math.abs(y - state.y) > 1e-6)) { parts.push('Y' + fmt(y)); state.y = y; }
    if (z !== undefined && (state.z === null || Math.abs(z - state.z) > 1e-6)) { parts.push('Z' + fmt(z)); state.z = z; }
    if (extra) parts.push(extra);
    return parts.join('');
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
  // buildRampedPass (see its own comment for why it must always end on a
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

  function buildRampedPass(pts, fromZ, toZ, feed, state, lines){
    const n = pts.length;
    const rampCount = Math.min(RAMP_SEGMENT_COUNT, n - 1);
    const rampIdxSeq = buildRampIndexSequence(rampCount);
    const totalRampSteps = rampIdxSeq.length - 1;
    const dz = (toZ - fromZ) / Math.max(1, totalRampSteps);

    // First point of the ramp: plunge straight down to fromZ at the
    // contour's own start (no XY move yet), matching the reference
    // files' own "G1Z<depth>F<feed>" first line of a pass.
    lines.push('G1' + moveLine(null, undefined, undefined, fromZ, state, 'F' + feed.toFixed(1)));

    let z = fromZ;
    for (let k = 1; k < rampIdxSeq.length; k++){
      const idx = rampIdxSeq[k];
      z = k === rampIdxSeq.length - 1 ? toZ : fromZ + dz * k;
      const p = pts[idx];
      lines.push(moveLine(null, p.x, p.y, z, state));
    }

    // Remainder of the full lap at the reached depth, continuing forward
    // from wherever the ramp left off (pts[rampCount], per
    // buildRampIndexSequence's own comment) back around to the start
    // point. Skips a point that lands exactly on the last emitted
    // position (a duplicate vertex, or a degenerate offset that
    // collapsed two points together) — moveLine would otherwise emit a
    // blank line for it.
    for (let i = rampCount + 1; i <= n; i++){
      const p = pts[i % n];
      const line = moveLine(null, p.x, p.y, undefined, state);
      if (line) lines.push(line);
    }
  }

  // --------------------------------------------------------------------
  // Per-(side,tool) file assembly
  // --------------------------------------------------------------------
  // Builds the full G-code text for one (side, tool) file: header
  // (tool-change stub, spindle start, park-to-start move), one toolpath
  // block per milled entry using that tool on that side, footer (retract,
  // return to origin, program end) — same shape as the shop's own
  // reference .tap files throughout.
  function buildFile(entries, tool, thickness, safeZ){
    const state = { x: null, y: null, z: null };
    const lines = [];
    lines.push('T1M6');
    lines.push('G0Z' + fmt(safeZ));
    lines.push('G0X' + fmt(0) + 'Y' + fmt(0) + 'S' + tool.rpm + 'M3');
    state.x = 0; state.y = 0;

    for (const item of entries){
      emitToolpath(lines, item.pts, thickness, item.targetZ, tool, state, safeZ);
    }

    lines.push('G0Z' + fmt(safeZ));
    lines.push('G0X' + fmt(0) + 'Y' + fmt(0));
    lines.push('G0Z' + fmt(safeZ));
    lines.push('G0X0Y0');
    lines.push('M30');
    return lines.join('\r\n') + '\r\n';
  }

  // Emits every depth pass for one toolpath (already tool-radius
  // compensated, machine-space): rapid to its own start point, then
  // step from the material's own up-face (Z = thickness) down to
  // `targetZ` in `tool.depthPerPass`-sized bites, each an independent
  // ramped-zigzag pass (see buildRampedPass) — same "resume from the
  // previous pass's own depth, ramp a bit further" shape the shop's own
  // reference files use for anything deeper than one bite — then retract
  // to this file's own safe height. Every contour starts fresh from the
  // board's own up-face today (no cross-layer Z-continuity), which is the
  // simple, always-correct choice; only worth revisiting if profiling
  // ever shows the extra retracts matter.
  function emitToolpath(lines, pts, thickness, targetZ, tool, state, safeZ){
    // Minimum 2 vertices: this codebase's own circle convention is
    // exactly two bulge:1 vertices forming a full circle before
    // tessellation (see js/elements/hole.js's own comment); after
    // tessellation a real circle has many more points than this, but the
    // guard is kept at 2 as the absolute floor for "is this a shape at
    // all" rather than assuming any particular tessellated point count.
    if (!pts || pts.length < 2) return;
    const p0 = pts[0];
    lines.push('G0' + moveLine(null, p0.x, p0.y, undefined, state));
    const startZ = thickness;
    const totalDepth = startZ - targetZ;
    if (totalDepth > 1e-6) {
      const passCount = Math.max(1, Math.ceil(totalDepth / tool.depthPerPass));
      let fromZ = startZ;
      for (let pass = 0; pass < passCount; pass++){
        const toZ = pass === passCount - 1 ? targetZ : startZ - (totalDepth * (pass + 1) / passCount);
        buildRampedPass(pts, fromZ, toZ, tool.feed, state, lines);
        fromZ = toZ;
      }
    }
    lines.push('G0' + moveLine(null, undefined, undefined, safeZ, state));
  }

  // --------------------------------------------------------------------
  // Top-level: entries -> grouped files
  // --------------------------------------------------------------------
  // Groups every milled drawing entry (see Drawing.build) by (side, tool),
  // resolves its machine-space, radius-compensated toolpath(s), and
  // returns one { filename, text } per group, ready to download.
  //
  // `entries` — the same { contour, layer, closed } list every other
  //             exporter already consumes (see Drawing.build / dxf.js).
  // `p`       — the full params object from readParams (needs W, thickness).
  // `orderNumber` — raw order-number string, sanitized into the filename.
  function buildFiles(entries, p, orderNumber){
    const { W, thickness } = p;
    const groups = new Map(); // key `${side}|${toolId}` -> { side, tool, items: [{pts,targetZ}] }

    for (const entry of entries){
      const layerId = entry.layer;
      const known = Layers.get(layerId);
      const machining = known && known.machining;
      // Reference-only layers (no `machining`, e.g. DIMENSIONS) and
      // explicitly depth:'none' layers aren't cut at all.
      if (!machining || machining.depth === 'none') continue;
      if (entry.closed === false) continue; // open reference lines only

      const { cutDepthMM, targetZ } = resolveDepth(machining, thickness);
      if (cutDepthMM <= 1e-6) continue; // 0-depth reference contour, nothing to mill

      const tool = pickTool(cutDepthMM, thickness);
      const toolRadius = tool.diameter / 2;
      const millType = machining.millType || 'contour';

      const key = machining.side + '|' + tool.id;
      if (!groups.has(key)) groups.set(key, { side: machining.side, tool, items: [] });
      const group = groups.get(key);

      const machinePts = toMachinePolyline(entry.contour, machining.side, W);
      const toolpaths = buildToolpaths(machinePts, millType, toolRadius, tool.stepover);
      for (const pts of toolpaths) group.items.push({ pts, targetZ });
    }

    const safeZ = Geo.cleanRound(thickness + 10, 3);
    const files = [];
    for (const { side, tool, items } of groups.values()){
      const text = buildFile(items, tool, thickness, safeZ);
      files.push({ filename: buildFilename(orderNumber, side, tool), text });
    }
    // Stable order: side (тыл before лиц matches production order — face
    // first, back second — but files are independent so this is purely
    // for a predictable download order) then tool id.
    files.sort((a, b) => a.filename.localeCompare(b.filename, 'ru'));
    return files;
  }

  // "<order>-{лиц|тыл} ф<tool>.tap" per the shop's own naming convention.
  // side 'top' -> лиц (face), 'bottom' -> тыл (back) — see layers.js for
  // what `side` means for a given layer.
  function buildFilename(orderNumber, side, tool){
    const sideLabel = side === 'top' ? 'лиц' : 'тыл';
    const order = (orderNumber || '').trim() || 'panel';
    return `${order}-${sideLabel} ф${tool.diameter}х${tool.fluteLength}.tap`;
  }

  // --------------------------------------------------------------------
  // Batch download
  // --------------------------------------------------------------------
  // Triggers one browser download per file, staggered slightly since
  // firing several `<a download>` clicks in the same tick makes some
  // browsers silently drop all but the first.
  function downloadAll(files){
    files.forEach(({ filename, text }, i) => {
      setTimeout(() => {
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, i * 250);
    });
  }

  function downloadAs(entries, p, orderNumber){
    const files = buildFiles(entries, p, orderNumber);
    if (files.length === 0) { alert('Нет обрабатываемых контуров для экспорта в G-code.'); return; }
    downloadAll(files);
    return files;
  }

  return { buildFiles, downloadAll, downloadAs, TOOLS, pickTool, resolveDepth, clipperOffset, ringArea, toMachinePolyline, buildToolpaths };
})();
