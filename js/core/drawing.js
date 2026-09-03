// ============================================================================
// Drawing — composes every registered element's contours into one flat list
// of { contour, layer } entries. This is the single artifact that both the
// SVG preview and the DXF exporter consume; neither needs to know how many
// elements exist or how each one builds its geometry.
// ============================================================================
const Drawing = (() => {
  function build(params){
    const entries = [];
    for (const element of Elements.all()){
      const parts = element.buildContours(params) || [];
      for (const part of parts) entries.push(part);
    }
    return entries;
  }
  return { build };
})();
