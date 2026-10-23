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
  // Anti-aliasing blends produce hundreds of near-identical colors, which
  // blocks the (much smaller) indexed-PNG path. If the exact image has more
  // than 256 colors, each channel is snapped to this many evenly spaced levels
  // (endpoints 0 and 255 stay exact, so white and pure layer colors are
  // untouched), trying the finest first and coarsening until it fits in 256.
  // 64 levels = max error ~2/255 per channel, invisible on thin lines. The PNG
  // is always the schematic view (no wood texture), so this is safe. Set to []
  // for strictly lossless output.
  const QUANTIZE_LEVELS_TO_TRY = [64, 48, 32, 24, 16, 12, 8];
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


  // --------------------------------------------------------------------------
  // Compact PNG encoder. canvas.toBlob('image/png') always writes 32-bit RGBA
  // with no filter search and a fast low-effort deflate, which for a flat
  // drawing of thin lines on white comes out ~2-3x bigger than needed. The
  // canvas is always fully opaque (white is painted first), so alpha is
  // dropped; every row picks whichever PNG filter gives the smallest sum of
  // absolute residuals; and if the image has <= 256 distinct colors it's
  // written as an indexed (palette) PNG at the smallest bit depth that fits.
  // Lossless. zlib comes from the browser's built-in CompressionStream; if
  // that's missing, encodeCompact returns null and the caller falls back to
  // plain canvas.toBlob.
  // --------------------------------------------------------------------------
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++){
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes){
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function makeChunk(type, data){
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  }

  function paeth(a, b, c){
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
  }

  // `rows` = height × rowBytes of raw (unfiltered) scanlines, `bpp` = bytes per
  // pixel (min 1). Returns height × (1 + rowBytes) bytes: filter id + data.
  function filterRows(raw, rowBytes, height, bpp){
    const out = new Uint8Array(height * (rowBytes + 1));
    const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(rowBytes));
    const zero = new Uint8Array(rowBytes);
    for (let y = 0; y < height; y++){
      const cur = raw.subarray(y * rowBytes, (y + 1) * rowBytes);
      const prev = y > 0 ? raw.subarray((y - 1) * rowBytes, y * rowBytes) : zero;
      const sums = [0, 0, 0, 0, 0];
      cand[0].set(cur);
      for (let i = 0; i < rowBytes; i++){
        const a = i >= bpp ? cur[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        const x = cur[i];
        cand[1][i] = (x - a) & 255;
        cand[2][i] = (x - b) & 255;
        cand[3][i] = (x - ((a + b) >> 1)) & 255;
        cand[4][i] = (x - paeth(a, b, c)) & 255;
      }
      let best = 0, bestSum = Infinity;
      for (let f = 0; f < 5; f++){
        const row = cand[f];
        let sum = 0;
        for (let i = 0; i < rowBytes; i++){ const v = row[i]; sum += v < 128 ? v : 256 - v; }
        if (sum < bestSum){ bestSum = sum; best = f; }
      }
      const o = y * (rowBytes + 1);
      out[o] = best;
      out.set(cand[best], o + 1);
    }
    return out;
  }

  async function zlibDeflate(bytes){
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function encodeCompact(canvas){
    if (typeof CompressionStream === 'undefined') return null;
    const w = canvas.width, h = canvas.height;
    const rgba = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const n = w * h;

    // Exact palette first; then progressively coarser per-channel snapping
    // (see QUANTIZE_LEVELS_TO_TRY). Each attempt gives up as soon as a 257th
    // color shows up, so failed attempts are cheap.
    const idx = new Uint8Array(n);
    let palette = null;
    const attempts = [null, ...QUANTIZE_LEVELS_TO_TRY];
    for (const levels of attempts){
      let snap = null;
      if (levels){
        snap = new Uint8Array(256);
        for (let v = 0; v < 256; v++) snap[v] = Math.round(Math.round(v * (levels - 1) / 255) * 255 / (levels - 1));
      }
      const palIndex = new Map();
      const pal = [];
      let ok = true;
      for (let i = 0, j = 0; i < n; i++, j += 4){
        const r = snap ? snap[rgba[j]] : rgba[j];
        const g = snap ? snap[rgba[j + 1]] : rgba[j + 1];
        const b = snap ? snap[rgba[j + 2]] : rgba[j + 2];
        const key = (r << 16) | (g << 8) | b;
        let k = palIndex.get(key);
        if (k === undefined){
          if (pal.length === 256){ ok = false; break; }
          k = pal.length;
          palIndex.set(key, k);
          pal.push(key);
        }
        idx[i] = k;
      }
      if (ok){ palette = pal; break; }
    }
    const paletteOk = palette !== null;

    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, w); dv.setUint32(4, h);
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // deflate, adaptive filtering, no interlace
    const chunks = [];
    let raw, rowBytes, bpp;

    if (paletteOk){
      const depth = palette.length <= 2 ? 1 : palette.length <= 4 ? 2 : palette.length <= 16 ? 4 : 8;
      ihdr[8] = depth; ihdr[9] = 3;
      rowBytes = Math.ceil(w * depth / 8);
      bpp = 1;
      raw = new Uint8Array(rowBytes * h);
      const perByte = 8 / depth;
      for (let y = 0; y < h; y++){
        for (let x = 0; x < w; x++){
          const shift = 8 - depth * ((x % perByte) + 1);
          raw[y * rowBytes + ((x / perByte) | 0)] |= idx[y * w + x] << shift;
        }
      }
      const plte = new Uint8Array(palette.length * 3);
      palette.forEach((c, i) => { plte[i * 3] = c >> 16; plte[i * 3 + 1] = (c >> 8) & 255; plte[i * 3 + 2] = c & 255; });
      chunks.push(makeChunk('IHDR', ihdr), makeChunk('PLTE', plte));
    } else {
      ihdr[8] = 8; ihdr[9] = 2;
      rowBytes = w * 3;
      bpp = 3;
      raw = new Uint8Array(rowBytes * h);
      for (let i = 0, j = 0, o = 0; i < n; i++, j += 4){
        raw[o++] = rgba[j]; raw[o++] = rgba[j + 1]; raw[o++] = rgba[j + 2];
      }
      chunks.push(makeChunk('IHDR', ihdr));
    }

    const idat = await zlibDeflate(filterRows(raw, rowBytes, h, bpp));
    chunks.push(makeChunk('IDAT', idat), makeChunk('IEND', new Uint8Array(0)));
    return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks], { type: 'image/png' });
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
        const nativeFallback = () => canvas.toBlob((blob) => {
          if (blob) resolve(blob); else reject(new Error('canvas.toBlob returned null'));
        }, 'image/png');
        encodeCompact(canvas).then(
          (blob) => blob ? resolve(blob) : nativeFallback(),
          nativeFallback
        );
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
