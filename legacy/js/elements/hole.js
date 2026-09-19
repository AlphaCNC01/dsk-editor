// ============================================================================
// Holes — shared mounting-hole geometry used by several elements
// (underframe, tray, pullout, pult). Not an embeddable element in its own
// right (no UI entry, nothing to place by hand) — just a small geometry
// factory that other elements call while building their own `parts`.
//
// Every mounting hole in this app is drilled as a concentric pair: the
// through-hole itself, plus a counterbore (зенковка) milled with a plain
// end mill (not a countersink bit) so production doesn't need a dedicated
// tool. Two kinds exist today, distinguished by fastener size:
//   A — hole ⌀9mm, counterbore ⌀12mm (most underframe/tray/pullout/pult
//       mounting points)
//   B — hole ⌀6mm, counterbore ⌀8mm (X2DM-PRO underframe's smaller
//       mounting points, and the sensor pult)
// Each kind's hole/counterbore pair has its own DXF layer (see
// Layers.registry: HOLE_A/HOLE_A_CS/HOLE_B/HOLE_B_CS) so a CAM tool can
// isolate cut paths per fastener size without inspecting geometry.
// ============================================================================
const Holes = (() => {
  const KINDS = {
    A: { holeDia: 9, csDia: 12, holeLayer: 'HOLE_A', csLayer: 'HOLE_A_CS' },
    B: { holeDia: 6, csDia: 8,  holeLayer: 'HOLE_B', csLayer: 'HOLE_B_CS' },
  };

  // A full circle as a two-vertex rounded contour (two 180° arcs), the
  // same convention already used for every hand-authored hole pair in
  // this codebase (bulge:1 twice) — see Geo's own file-level comment for
  // what `bulge` means.
  function circle(cx, cy, r){
    return [
      { x: cx - r, y: cy, bulge: 1 },
      { x: cx + r, y: cy, bulge: 1 },
    ];
  }

  // Returns a two-entry parts array (hole + counterbore), in the CALLER's
  // own local coordinate space — just spread this into the caller's own
  // `parts` list, e.g.:
  //   parts: [ ...outline, ...Holes.at(23, -267.5, 'A') ]
  // World placement (translate/mirror/rotate) is handled the same way as
  // the rest of that element's geometry; this function only builds the
  // shape, it doesn't know about instances or anchors.
  function at(x, y, kind){
    const k = KINDS[kind];
    if (!k) throw new Error(`Holes.at: unknown hole kind "${kind}"`);
    return [
      { verts: circle(x, y, k.holeDia / 2), layer: k.holeLayer },
      { verts: circle(x, y, k.csDia / 2),   layer: k.csLayer },
    ];
  }

  return { KINDS, at };
})();
