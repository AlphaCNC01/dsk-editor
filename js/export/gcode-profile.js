// ============================================================================
// GCodeProfile — machining profile for G-code export: everything that is
// DATA about how this shop cuts (the tool catalog with spindle speed, feed,
// depth-per-pass and stepover; the rule that picks a bit for a given cut
// depth; how a layer's own `machining` record turns into a Z target) and
// nothing about geometry or output dialect. Kept apart from the toolpath
// builder (gcode-toolpath.js) and the post-processor (gcode-post.js) so
// tuning cutting parameters never means touching either — see
// docs/gcode-rewrite-plan.md for the overall pipeline.
// ============================================================================
const GCodeProfile = (() => {

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
      rpm: 24000, feed: 6000, engraveFeed: 3000,
      depthPerPass: 15,   // mm of Z per pass — small bit, shallow bites
      stepover: 2,     // mm between concentric pocket-clearing rings
    },
    '4x22': {
      id: '4x22', diameter: 4, fluteLength: 22,
      rpm: 24000, feed: 6000, engraveFeed: 3000,
      depthPerPass: 15,
      stepover: 2,
    },
    '8x32': {
      id: '8x32', diameter: 8, fluteLength: 32,
      rpm: 18000, feed: 4000, engraveFeed: 4000,
      depthPerPass: 10, // matches the shop's own reference file's own step
      stepover: 2,
    },
    '8x42': {
      id: '8x42', diameter: 8, fluteLength: 42,
      rpm: 18000, feed: 4000, engraveFeed: 4000,
      depthPerPass: 10,
      stepover: 2,
    },
  };

  // Depth (mm of actual cut into the material, from whichever face is
  // currently facing up on the machine — see resolveDepth below) at
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

  // Height the tool retracts to between cuts and parks at, in machine Z
  // (0 = table surface).
  // Fixed at 50 mm (the shop's own setting); only a board thicker than
  // 40 mm would push it higher, so the tool always clears the stock.
  const SAFE_Z = 50;
  function safeZ(thickness){
    return Geo.cleanRound(Math.max(SAFE_Z, thickness + 10), 3);
  }

  // Layers cut as engraving: the whole contour runs at the slower
  // `engraveFeed` instead of `feed` (plunge uses the same feed as the
  // operation, as in the shop's reference programs).
  const ENGRAVING_LAYERS = new Set(['ENGRAVING']);
  function feedFor(tool, layerId){
    return ENGRAVING_LAYERS.has(layerId) ? tool.engraveFeed : tool.feed;
  }

  return { TOOLS, SHALLOW_DEPTH_LIMIT, pickTool, resolveDepth, safeZ, feedFor, ENGRAVING_LAYERS };
})();
