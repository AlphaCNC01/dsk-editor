// ============================================================================
// Drawing — composes every registered element's contours into one flat list
// of { contour, layer } entries. This is the single artifact that both the
// SVG preview and the DXF exporter consume; neither needs to know how many
// elements exist or how each one builds its geometry.
// ============================================================================
const Drawing = (() => {
  // `forCnc` true: everything, including the CNC-only layers (cnc: true in
  // Layers) — for G-code. Otherwise those layers are left out, so the
  // preview and every export show only what is drawn.
  function build(params, forCnc = false){
    const entries = [];
    for (const element of Elements.all()){
      const parts = element.buildContours(params) || [];
      for (const part of parts) {
        const def = Layers.get(part.layer);
        if (!forCnc && def && def.cnc) continue;
        entries.push(part);
      }
    }
    return entries;
  }
  return { build };
})();
