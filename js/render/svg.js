// ============================================================================
// Render.SVG — Drawing -> <svg> markup for the live preview pane. Every
// contour's style comes straight from its own layer's entry in
// Layers.registry (see styleFor below), so a newly registered layer
// renders correctly with zero changes needed here.
// ============================================================================
const RenderSVG = (() => {
  // A layer's own `style` (from Layers.registry) becomes an inline SVG
  // style attribute directly — no separate CSS class to keep in sync
  // with the registry. `vector-effect: non-scaling-stroke` is applied to
  // every layer here (it only matters for the live, zoomable on-screen
  // preview — Export.SVG below does NOT use it, since an exported file's
  // strokes should scale with the drawing like real ink, not stay a
  // fixed screen-pixel width regardless of zoom).
  function styleFor(layer){
    const def = Layers.get(layer);
    if (!def || !def.style) return null; // unknown layer -> caller falls back to layer-unknown
    const { stroke, fillOpacity = 0, strokeWidth = 1.5, dashed = false } = def.style;
    const fill = fillOpacity > 0 ? stroke : 'none';
    return `fill:${fill};fill-opacity:${fillOpacity};stroke:${stroke};stroke-width:${strokeWidth}px;` +
      `vector-effect:non-scaling-stroke;${dashed ? `stroke-dasharray:${strokeWidth*3} ${strokeWidth*2};` : ''}`;
  }

  function build(entries, W, H, texts = []){
    const parts = entries.map(({ contour, layer, closed = true }) => {
      const d = Geo.contourToSvgPath(contour, true, H, closed);
      // A contour naming a layer that isn't in the registry gets flagged
      // visually (layer-unknown, a blinking red outline — see its CSS)
      // instead of silently falling back to layer-outline as this used
      // to — that fallback was hiding the exact mistake this is meant to
      // surface (an element referencing a layer id that doesn't exist).
      const style = styleFor(layer);
      // open lines/arrowheads shouldn't inherit the layer's closed-shape
      // fill, regardless of that layer's own fillOpacity.
      const attrs = style ? ` style="${style}${closed ? '' : ';fill:none'}"` : ' class="layer-unknown"';
      return `<path${attrs} d="${d}"></path>`;
    });
    const dimStroke = (Layers.get('DIMENSIONS') || {}).style?.stroke || '#e05a5a';
    const textParts = texts.map(({ x, y, text, angle = 0 }) => {
      const sy = H - y; // flip to SVG's Y-down space, matching contourToSvgPath's own flip
      const deg = -angle * 180 / Math.PI; // SVG rotation is clockwise-positive in Y-down space, opposite of our CAD angle convention
      return `<text class="dim-text" style="fill:${dimStroke}" x="${x}" y="${sy}" transform="rotate(${deg} ${x} ${sy})" text-anchor="middle" dominant-baseline="central">${text}</text>`;
    });
    return parts.join('\n') + (textParts.length ? '\n' + textParts.join('\n') : '');
  }

  return { build };
})();
