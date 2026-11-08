// ============================================================================
// Export.GCode — Drawing -> a batch of .tap G-code files, one per (side,
// tool) combination, ready to download and run directly on the shop's CNC
// router.
//
// WHY ONE FILE PER (SIDE, TOOL):
// The router this app targets has no automatic tool changer, so a single
// program can only ever use one bit. Every layer's own `machining.side`
// (top/bottom — see js/core/layers.js) and a depth-based tool pick (see
// GCodeProfile.pickTool) partition the whole drawing into a handful of
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
// top of the flip above (see ORIENTATIONS.vertical below) — hardcoded for
// now since every job today is milled vertically, but written as a single
// swappable transform so horizontal or other 90°-multiple mounts can be
// added later without touching the rest of this file.
//
// MODULE LAYOUT:
// This file is the facade of a small pipeline — gcode-profile.js (tool
// catalog, cutting data, depth resolution), gcode-toolpath.js (geometry ->
// abstract moves) and gcode-post.js (moves -> controller text). All three
// load before this file; see docs/gcode-rewrite-plan.md.
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
// the entry over distance instead of a single point). See rampedPassMoves in gcode-toolpath.js.
// ============================================================================
const ExportGCode = (() => {
  const { TOOLS, pickTool, resolveDepth, feedFor, safeZ: profileSafeZ } = GCodeProfile;
  const { clipperOffset, ringArea, toMachinePolyline, buildToolpaths, toolpathMoves } = GCodeToolpath;

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
    const { W, H, thickness } = p;
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

      const machinePts = toMachinePolyline(entry.contour, machining.side, W, H);
      const toolpaths = buildToolpaths(machinePts, millType, toolRadius, tool.stepover);
      const feed = feedFor(tool, layerId);
      for (const pts of toolpaths) group.items.push({ pts, targetZ, feed });
    }

    const safeZ = profileSafeZ(thickness);
    const files = [];
    for (const { side, tool, items } of groups.values()){
      const moves = items.flatMap(item => toolpathMoves(item.pts, thickness, item.targetZ, tool, safeZ, item.feed));
      const text = GCodePost.render({ rpm: tool.rpm, safeZ, moves });
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
