// ============================================================================
// Export.PNG — rasterizes the same drawing ExportSVG produces into a PNG
// file, entirely in the browser (Image + Canvas, no server or library).
// Since the drawing lives in millimeters with no inherent pixel size, the
// caller supplies a scale in pixels-per-mm; the canvas is sized to
// W*scale × H*scale so the exported bitmap has a predictable, consistent
// resolution regardless of on-screen zoom. A solid white background is
// painted first — the SVG itself has no background, and a transparent PNG
// of thin colored lines is hard to read in most image viewers/printers.
// ============================================================================
const ExportPNG = (() => {
  const DEFAULT_SCALE = 2;               // pixels per mm — the UI no longer exposes this, but it's easy to change here if a different default is ever needed
  const DEFAULT_STROKE_WIDTH_MULTIPLIER = 1.5; // multiplies ExportSVG's base stroke width (see BASE_STROKE_WIDTH_MM there) — raise this if lines are still too thin
  const BORDER_MARGIN_MM = 50;           // gap between the drawing's own edge and the border
  const BORDER_WIDTH_MM = 0;           // border line thickness, in the same mm units as the drawing

  // Order number + thickness caption, baked into the PNG's own pixels
  // (not into the SVG/DXF geometry — this is PNG-export-only, since the
  // PNG is the file that tends to get printed/passed around on its own
  // without the project file alongside it). Drawn in the top-left margin
  // in plain CSS pixels (not scaled by `scale`) so it reads at a
  // consistent physical size regardless of the panel's mm dimensions or
  // chosen export resolution.
  const CAPTION_FONT_PX = 56;
  const CAPTION_PADDING_PX = 20;         // inset from the canvas's own top-left corner
  const CAPTION_LINE_GAP_PX = 10;

  function drawCaption(ctx, orderNumber, thickness){
    const lines = [];
    if (orderNumber) lines.push(`Заказ №${orderNumber}`);
    if (thickness) lines.push(`Толщина: ${thickness} мм`);
    if (lines.length === 0) return;

    ctx.save();
    ctx.font = `bold ${CAPTION_FONT_PX}px monospace`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#000000';
    let y = CAPTION_PADDING_PX;
    for (const line of lines){
      ctx.fillText(line, CAPTION_PADDING_PX, y);
      y += CAPTION_FONT_PX + CAPTION_LINE_GAP_PX;
    }
    ctx.restore();
  }

  function rasterize(entries, W, H, texts, scale = DEFAULT_SCALE, strokeWidthMultiplier = DEFAULT_STROKE_WIDTH_MULTIPLIER, caption = {}){
    return new Promise((resolve, reject) => {
      const svgText = ExportSVG.build(entries, W, H, texts, strokeWidthMultiplier);
      const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);

      // The SVG's own content may extend beyond the tabletop's W×H (e.g.
      // dimension lines) — size the canvas off the same bounding box
      // ExportSVG.build used for its viewBox, not the raw tabletop
      // dimensions, or anything outside W×H gets cropped off the PNG.
      const bounds = ExportSVG.computeBounds(entries, texts, W, H);
      const contentW = bounds.maxX - bounds.minX, contentH = bounds.maxY - bounds.minY;

      const img = new Image();
      img.onload = () => {
        const margin = BORDER_MARGIN_MM * scale;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(contentW * scale + margin * 2));
        canvas.height = Math.max(1, Math.round(contentH * scale + margin * 2));
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, margin, margin, contentW * scale, contentH * scale);

        const borderWidth = BORDER_WIDTH_MM * scale;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = borderWidth;
        ctx.strokeRect(borderWidth / 2, borderWidth / 2, canvas.width - borderWidth, canvas.height - borderWidth);

        drawCaption(ctx, caption.orderNumber, caption.thickness);

        URL.revokeObjectURL(svgUrl);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob); else reject(new Error('canvas.toBlob returned null'));
        }, 'image/png');
      };
      img.onerror = () => {
        URL.revokeObjectURL(svgUrl);
        reject(new Error('Failed to rasterize SVG for PNG export'));
      };
      img.src = svgUrl;
    });
  }

  async function downloadAs(entries, W, H, filename, texts, scale, strokeWidthMultiplier, caption){
    let name = (filename || 'panel').trim();
    if (!name) name = 'panel';
    if (!/\.png$/i.test(name)) name += '.png';

    const blob = await rasterize(entries, W, H, texts, scale, strokeWidthMultiplier, caption);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { rasterize, downloadAs };
})();
