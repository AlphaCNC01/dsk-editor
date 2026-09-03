// ============================================================================
// Export.SVG — Drawing -> a standalone, downloadable SVG file. Distinct from
// RenderSVG (the live preview pane): an exported file has to carry
// concrete numeric style values baked into each element (fill/stroke/
// stroke-width as plain attributes, not vector-effect:non-scaling-stroke —
// see BASE_STROKE_WIDTH_MM below), since it's opened outside this app and
// can't rely on the app's own CSS or on-screen scaling behavior. Reads the
// same Layers.registry `style` field RenderSVG does, so the exported file
// visually matches what was on screen. Coordinates are written in real
// millimeters with an explicit mm-based viewBox/width/height, and Y is
// flipped to match SVG's native top-down convention (the same flip
// RenderSVG applies for on-screen display) so the file opens right-side-up
// in any SVG viewer.
// ============================================================================
const ExportSVG = (() => {
  const BBOX_MARGIN_MM = 6; // extra breathing room around the computed content bounds, beyond the geometry itself

  // Computes the true bounding box across every entry's contour points and
  // every text label's approximate footprint. Dimension lines/arrows/text
  // routinely extend outside the tabletop's own [0,W]x[0,H] footprint, so
  // sizing the export purely off W/H clips them — this walks the actual
  // geometry instead of assuming any fixed extent.
  function computeBounds(entries, texts, W, H){
    let minX = 0, minY = 0, maxX = W, maxY = H; // tabletop itself is always included
    for (const { contour } of entries){
      for (const v of contour){
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
      }
    }
    // Text labels aren't stored as contour points, so approximate each
    // one's footprint from its position — rotated text can extend in
    // either axis regardless of the label's own orientation, so a
    // generous square margin around the anchor point is simpler and safer
    // than trying to compute exact rotated-text extents.
    const TEXT_FOOTPRINT_MM = 85; // half-width allowance for a realistic label (DIM_TEXT_HEIGHT_MM-tall monospace, ~7-8 characters like "1500 мм") — width dominates over height for these short numeric+unit labels
    for (const { x, y } of texts){
      if (x - TEXT_FOOTPRINT_MM < minX) minX = x - TEXT_FOOTPRINT_MM;
      if (x + TEXT_FOOTPRINT_MM > maxX) maxX = x + TEXT_FOOTPRINT_MM;
      if (y - TEXT_FOOTPRINT_MM < minY) minY = y - TEXT_FOOTPRINT_MM;
      if (y + TEXT_FOOTPRINT_MM > maxY) maxY = y + TEXT_FOOTPRINT_MM;
    }
    return {
      minX: minX - BBOX_MARGIN_MM, minY: minY - BBOX_MARGIN_MM,
      maxX: maxX + BBOX_MARGIN_MM, maxY: maxY + BBOX_MARGIN_MM,
    };
  }

  // Reads styling straight from Layers.registry's own `style` field
  // (same source RenderSVG's live preview uses) rather than a separate
  // hardcoded list — an exported file can't depend on this app's
  // stylesheet, so this still needs to bake concrete stroke/fill values
  // into the file rather than referencing a CSS class, but it no longer
  // needs its OWN copy of what those values are.
  function styleFor(layer){
    const def = Layers.get(layer) || Layers.get('OUTLINE');
    const { stroke, fillOpacity = 0 } = def.style || { stroke: '#ff8a3d' };
    return { stroke, fillOpacity };
  }
  const BASE_STROKE_WIDTH_MM = 1; // stroke width in the drawing's own mm units — deliberately NOT vector-effect:non-scaling-stroke, since that keeps strokes hairline-thin in CSS pixels no matter how large the file is rasterized (e.g. for PNG export); specifying width in mm makes it scale naturally with resolution

  // Dimension label text height, in the drawing's own mm units. The
  // on-screen preview's text (see .dim-text in the stylesheet) is a FIXED
  // number of screen pixels regardless of table size, so it always looks
  // the same relative size on screen. Exported text is real mm on the
  // drawing, so once rasterized to a typically much larger PNG (e.g.
  // 3000px+ wide for a 1500mm table) and then viewed at reduced zoom in an
  // image viewer, the same nominal size reads much smaller than the fixed-
  // px preview. This value is deliberately large (much bigger than a
  // literal drafting-standard text height) to compensate for that —
  // tune it here if exports still look too small or too large relative to
  // the preview.
  const DIM_TEXT_HEIGHT_MM = 21;

  // strokeWidthMultiplier scales BASE_STROKE_WIDTH_MM up or down — exposed
  // as a parameter (rather than hardcoded) so line thickness can be tuned
  // per export without hunting through the function body.
  function build(entries, W, H, texts = [], strokeWidthMultiplier = 1){
    const bounds = computeBounds(entries, texts, W, H);
    const bw = bounds.maxX - bounds.minX, bh = bounds.maxY - bounds.minY;
    // contourToSvgPath's Y-flip is anchored at H (world y=0 -> svg y=H,
    // world y=H -> svg y=0); that formula stays correct for points outside
    // [0,H] too, so only the viewBox's origin/size need to grow to reveal
    // them — the flip math itself doesn't change.
    const svgMinY = H - bounds.maxY;

    const strokeWidth = BASE_STROKE_WIDTH_MM * strokeWidthMultiplier;
    const paths = entries.map(({ contour, layer, closed = true }) => {
      // Round each vertex before it hits the path string, same rationale
      // as the DXF exporter's cleanRound — this is a final-output
      // checkpoint (unlike the live on-screen preview via RenderSVG,
      // which skips this for performance since it re-renders on every
      // keystroke and doesn't need the extra decimal-place cleanup).
      const roundedContour = contour.map(v => ({ x: Geo.cleanRound(v.x), y: Geo.cleanRound(v.y), bulge: v.bulge }));
      const d = Geo.contourToSvgPath(roundedContour, true, H, closed);
      const { stroke, fillOpacity } = styleFor(layer);
      const fill = closed && fillOpacity > 0 ? stroke : 'none';
      const fillOpacityAttr = closed && fillOpacity > 0 ? ` fill-opacity="${fillOpacity}"` : '';
      return `<path d="${d}" fill="${fill}"${fillOpacityAttr} stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
    });
    const textEls = texts.map(({ x, y, text, angle = 0 }) => {
      const sy = H - y;
      const deg = -angle * 180 / Math.PI;
      const { stroke: dimStroke } = styleFor('DIMENSIONS');
      return `<text x="${x}" y="${sy}" transform="rotate(${deg} ${x} ${sy})" text-anchor="middle" dominant-baseline="central" font-family="monospace" font-weight="bold" font-size="${DIM_TEXT_HEIGHT_MM}" fill="${dimStroke}" stroke="none">${text}</text>`;
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="${bw}mm" height="${bh}mm" viewBox="${bounds.minX} ${svgMinY} ${bw} ${bh}">\n` +
      paths.join('\n') + '\n' +
      textEls.join('\n') + '\n' +
      `</svg>\n`;
  }

  function downloadAs(entries, W, H, filename, texts, strokeWidthMultiplier){
    let name = (filename || 'panel').trim();
    if (!name) name = 'panel';
    if (!/\.svg$/i.test(name)) name += '.svg';

    const svgText = build(entries, W, H, texts, strokeWidthMultiplier);
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { build, downloadAs, computeBounds };
})();
