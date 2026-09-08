// ============================================================================
// Render.SVG — Drawing -> <svg> markup for the live preview pane. Every
// contour's style comes straight from its own layer's entry in
// Layers.registry (see styleFor below), so a newly registered layer
// renders correctly with zero changes needed here.
//
// Two view modes, picked via build()'s own `viewMode` argument:
//   'render' (default) — the wood-grain preview (see woodTextureLayer and
//     the woodMode branches inside build below).
//   'schematic' — the original flat CAD view: every layer drawn with its
//     own registry stroke/fill, no wood grain, no bevel/vignette/shadow.
//     Useful for actually reading/checking the layer geometry itself
//     (dimensions, cutout placement, overlaps) without the render's own
//     styling in the way.
// Switching modes is purely a preview choice — it never touches
// geometry, DXF, or SVG/PNG export.
// ============================================================================
const RenderSVG = (() => {
  // The wood-grain preview is generated procedurally — a grid of lamella
  // boards, each filled with its own SVG feTurbulence noise standing in
  // for grain — rather than drawn from a photo. This avoids needing an
  // image asset at all (no assets/wood_texture.jpg, no fetch, no
  // cover-fit crop math), scales exactly to any tabletop size with no
  // stretching or tiling seam, and can be re-tinted by swapping two
  // colors per preset instead of re-processing a photo. It's still
  // preview-only decoration: none of this touches geometry, DXF, or
  // Export.SVG/Export.PNG.
  //
  // Board layout, in mm — tunable constants rather than buried in the
  // math below:
  const LAMELLA_HEIGHT_MM = 50;   // width of each board (the panel's own short axis per board)
  const LAMELLA_LENGTH_MM = 350;  // nominal length of each board along its row
  const LAMELLA_LENGTH_VARIATION_MM = 50; // +/- random length jitter per board, for a less mechanical seam pattern

  // Grain noise shape — tuned once, shared by every board (only the seed
  // and base/grain colors vary board-to-board and preset-to-preset).
  // baseFrequency is "fx fy" in SVG's feTurbulence: a LOW fx (long
  // wavelength) is what stretches noise into long streaks along a board's
  // length, and a HIGHER fy packs several separate streaks side by side
  // across the board's narrow width — this is the inverse relationship of
  // what makes grain look like grain, easy to get backwards.
  const GRAIN_STREAK_FREQUENCY = '0.0035 0.07'; // long fiber streaks along the board's length
  const GRAIN_STREAK_OCTAVES = 4;
  const GRAIN_SPECKLE_FREQUENCY = '0.02 0.3';   // finer pore/speckle detail, same orientation
  const GRAIN_SPECKLE_OCTAVES = 2;
  const GRAIN_OPACITY = 0.45; // how strongly the grain color shows through the board's base color

  // Per-board tone jitter: each board is randomly darkened/lightened a
  // little around the preset's own base color, the same way real boards
  // cut from the same log still vary slightly — purely cosmetic variety,
  // not tied to any real per-board data.
  const BOARD_SHADE_VARIATION = 0.10; // +/- 10% brightness

  // Row seams: a real glued panel's seams between boards are barely
  // visible, not a hard line — a single thin, low-opacity stroke between
  // rows is enough to read as "separate boards" without looking like CAD
  // markup.
  const SEAM_STROKE_OPACITY = 0.18;

  // Preview-only wood-tint presets (point 5 of an earlier round): each
  // preset is a base board color plus a grain color the noise darkens
  // toward — swapping these two colors is the entire retint, no
  // image processing involved. 'natural' is the default oak look.
  // Picked in the UI's finish-color <select>; purely cosmetic, never
  // touches geometry/DXF/SVG-export.
  const WOOD_TINTS = {
    natural: { label: 'Дуб натуральный', base: '#c8a87c', grain: '#3b2313' },
    white:   { label: 'Белёный дуб',     base: '#dcd3c2', grain: '#8a7a63' },
    honey:   { label: 'Медовый',         base: '#c98a3f', grain: '#3d2410' },
    walnut:  { label: 'Тёмный орех',     base: '#8a6a4a', grain: '#2c1a0e' },
    wenge:   { label: 'Венге',           base: '#4a3a2c', grain: '#170e08' },
    gray:    { label: 'Серый матовый',   base: '#a8a49c', grain: '#4a4640' },
  };

  // Imitated eased edge (a light roundover/chamfer, not a real geometric
  // fillet on the exported contour — purely a preview shading trick): a
  // fixed-width dark band along every edge, independent of the
  // tabletop's own size, since it's standing in for a specific ~5mm
  // physical edge treatment rather than a proportional stylistic frame.
  const EDGE_SHADOW_MM = 5;

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

  // Wood-texture mode redraws several kinds of entries itself rather than
  // through the normal CAD styleFor() path, so each reads as the physical
  // feature it represents instead of generic bright CAD markup sitting on
  // top of the grain. Which of the treatments below an entry gets is
  // decided entirely by its layer's own `machining` metadata (already the
  // single source of truth for side/depth/millType — see layers.js) or,
  // for PHYSICAL, by the layer name itself — nothing here is otherwise
  // keyed off a layer's name:
  //   - OUTLINE: no bright stroke at all (the eased-edge shading below
  //     already reads as the panel's edge).
  //   - PHYSICAL (a physical part's own reference outline — pult, tray,
  //     USB charger, underframe...): a thin dashed reference line, same
  //     treatment as an underside pocket below, no fill.
  //   - milled from the TOP with millType 'pocket' and depth <= 1mm
  //     (ENGRAVING): a light translucent darkening, no contour stroke —
  //     a shallow engraved mark, not a hole.
  //   - milled from the BOTTOM (any underside pocket/groove — wireless/
  //     USB pockets, cable channels/pockets, CUTOUT): these are
  //     invisible from the top in reality, so on the top-view preview
  //     they get only a thin dashed reference line, no fill at all.
  //   - anything else with real machining (currently: PHONESTAND, milled
  //     from the top but deep enough to be a genuine cutout rather than
  //     a surface mark) gets a solid dark recess fill, no contour stroke.
  const WOOD_MODE_HIDDEN_STROKE_LAYERS = new Set(['OUTLINE']);
  function machiningOf(layer){
    const def = Layers.get(layer);
    return def && def.machining;
  }
  function isTopEngraving(layer){
    const m = machiningOf(layer);
    return !!(m && m.side === 'top' && m.millType === 'pocket' && m.depth <= 1);
  }
  function isBottomMilled(layer){
    const m = machiningOf(layer);
    return !!(m && m.side === 'bottom');
  }

  // Outlet-block cover plate (point 4 of an earlier round): OUTLET_BLOCK_TOP
  // is the block's own visible top face (see layers.js) — solid-filled
  // with a stand-in color for now. Meant to eventually be replaced with an
  // actual photo of the physical unit, so it's kept as its own constant
  // rather than folded into a generic "PHYSICAL" treatment.
  const OUTLET_BLOCK_FILL = '#2c2c2e';

  // Deterministic seed -> [0,1) PRNG (mulberry32). Used instead of
  // Math.random() so the exact same tabletop dimensions always generate
  // the exact same board layout and grain — render() re-runs this on
  // every keystroke/slider tick (debounced), and a fresh random layout
  // each time would make the preview flicker to a different-looking
  // panel on every edit instead of looking like one continuous panel.
  function seededRandom(seed){
    let t = (seed + 0x6D2B79F5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Lightens (amt > 0) or darkens (amt < 0) a "#rrggbb" color by a
  // fraction of its own channel values.
  function shadeColor(hex, amt){
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
    const f = 1 + amt;
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
    return `#${[r,g,b].map(clamp).map(v => v.toString(16).padStart(2,'0')).join('')}`;
  }

  // Lays out one row of lamella boards spanning at least [0, W] (with a
  // little overhang on both sides so a staggered row's first/last board
  // still fully covers the panel edge), returning each board's own x/w
  // and a seed derived purely from its row+column position.
  function layoutRow(row, W){
    const stagger = (row % 2) * (LAMELLA_LENGTH_MM / 2);
    const boards = [];
    let x = -stagger;
    let col = 0;
    while (x < W) {
      const rnd = seededRandom(row * 97 + col * 131);
      const w = Math.max(80, Math.round(LAMELLA_LENGTH_MM + (rnd - 0.5) * 2 * LAMELLA_LENGTH_VARIATION_MM));
      boards.push({ x, w, seed: row * 97 + col * 131 });
      x += w;
      col++;
    }
    return boards;
  }

  // Builds the <defs> wood-grain bits plus the <path>s that paint them,
  // all clipped to the tabletop's own OUTLINE contour(s) — a T-slot notch
  // or the ergo notch is itself part of the OUTLINE contour (see
  // tabletop.js), so it's automatically excluded rather than needing
  // separate handling here. Returns '' if there's no OUTLINE entry to key
  // off (shouldn't normally happen, but render() bails out before this on
  // W/H <= 0 anyway).
  //
  // W/H are the tabletop's own nominal width/height (the rectangle before
  // notches/trapezoid) — the board grid is laid out over exactly that
  // area. `tint` is one of WOOD_TINTS' own keys (defaults to 'natural'
  // for any unrecognized value, same as an unset one).
  function woodTextureLayer(entries, W, H, tint){
    const outlineEntries = entries.filter(e => e.layer === 'OUTLINE');
    if (!outlineEntries.length) return '';
    const clipId = 'woodTextureClip';
    const bevelBlurId = 'woodBevelShadow';
    const vignetteId = 'woodVignette';
    const shadowFilterId = 'woodDropShadow';
    const outlinePaths = outlineEntries
      .map(({ contour, closed = true }) => Geo.contourToSvgPath(contour, true, H, closed))
      .join(' ');

    const tintDef = WOOD_TINTS[tint] || WOOD_TINTS.natural;

    // Board grid: rows run across the panel's own height, each row's own
    // boards run along its width — matches how a real glued panel's
    // lamellas are laid, staggered row to row like brickwork/parquet.
    const rows = Math.ceil(H / LAMELLA_HEIGHT_MM) + 1;
    const boardDefs = [];
    const boardRects = [];
    for (let row = 0; row < rows; row++) {
      const y = row * LAMELLA_HEIGHT_MM;
      for (const board of layoutRow(row, W)) {
        const filterId = `woodGrain${board.seed}`;
        const shadeAmt = (seededRandom(board.seed + 1) - 0.5) * 2 * BOARD_SHADE_VARIATION;
        const boardColor = shadeColor(tintDef.base, shadeAmt);
        // +0.5mm overlap on both axes so adjacent boards don't leave a
        // hairline gap at their shared edge from sub-pixel rounding.
        boardDefs.push(`
          <filter id="${filterId}" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="${GRAIN_STREAK_FREQUENCY}" numOctaves="${GRAIN_STREAK_OCTAVES}" seed="${board.seed}" result="n1"></feTurbulence>
            <feColorMatrix in="n1" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${GRAIN_OPACITY*1.2} ${GRAIN_OPACITY*1.2} ${GRAIN_OPACITY*1.2} 0 ${-GRAIN_OPACITY*0.9}" result="a1"></feColorMatrix>
            <feComponentTransfer in="a1" result="a1s"><feFuncA type="gamma" amplitude="1" exponent="1.6" offset="0"></feFuncA></feComponentTransfer>
            <feTurbulence type="fractalNoise" baseFrequency="${GRAIN_SPECKLE_FREQUENCY}" numOctaves="${GRAIN_SPECKLE_OCTAVES}" seed="${board.seed + 500}" result="n2"></feTurbulence>
            <feColorMatrix in="n2" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${GRAIN_OPACITY*0.9} ${GRAIN_OPACITY*0.9} ${GRAIN_OPACITY*0.9} 0 ${-GRAIN_OPACITY*0.75}" result="a2"></feColorMatrix>
            <feFlood flood-color="${tintDef.grain}" flood-opacity="0.5" result="grainColor"></feFlood>
            <feComposite in="grainColor" in2="a1s" operator="in" result="streaks"></feComposite>
            <feComposite in="grainColor" in2="a2" operator="in" result="speckle"></feComposite>
            <feMerge>
              <feMergeNode in="SourceGraphic"></feMergeNode>
              <feMergeNode in="streaks"></feMergeNode>
              <feMergeNode in="speckle"></feMergeNode>
            </feMerge>
          </filter>`);
        boardRects.push(`<rect x="${board.x}" y="${y}" width="${board.w + 0.5}" height="${LAMELLA_HEIGHT_MM + 0.5}" fill="${boardColor}"></rect>`);
        boardRects.push(`<rect x="${board.x}" y="${y}" width="${board.w + 0.5}" height="${LAMELLA_HEIGHT_MM + 0.5}" fill="${boardColor}" filter="url(#${filterId})"></rect>`);
      }
    }
    const seamLines = [];
    for (let row = 1; row < rows; row++) {
      const y = row * LAMELLA_HEIGHT_MM;
      seamLines.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${tintDef.grain}" stroke-opacity="${SEAM_STROKE_OPACITY}" stroke-width="0.6"></line>`);
    }

    // Imitated eased edge: every edge of the panel (including notch
    // walls — whatever shape OUTLINE traces) gets a soft dark band
    // running along it, fading inward, at a fixed real-world width
    // rather than one that scales with the tabletop (an actual ~5mm
    // edge treatment doesn't get wider just because the panel is
    // bigger). A directional gradient can't do this on an arbitrary
    // contour (it would darken one side and lighten the opposite one
    // instead of framing the whole edge), so instead this draws the
    // outline itself as a wide, solid-color, blurred stroke, then clips
    // that blur to stay inside the panel — the blur is what turns a hard
    // line into a fading-inward band.
    const edgeShadowMm = EDGE_SHADOW_MM;

    return `<defs>
        ${boardDefs.join('')}
        <clipPath id="${clipId}">
          <path d="${outlinePaths}"></path>
        </clipPath>
        <radialGradient id="${vignetteId}" cx="50%" cy="50%" r="75%">
          <stop offset="70%" stop-color="#000000" stop-opacity="0"></stop>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.10"></stop>
        </radialGradient>
        <filter id="${bevelBlurId}" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="${edgeShadowMm * 0.5}"></feGaussianBlur>
        </filter>
        <filter id="${shadowFilterId}" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="${Math.min(W,H) * 0.006}" stdDeviation="${Math.min(W,H) * 0.008}" flood-color="#000000" flood-opacity="0.35"></feDropShadow>
        </filter>
      </defs>
      <g filter="url(#${shadowFilterId})">
        <g clip-path="url(#${clipId})">
          ${boardRects.join('')}
          ${seamLines.join('')}
        </g>
        <path d="${outlinePaths}" fill="url(#${vignetteId})" clip-path="url(#${clipId})"></path>
        <g clip-path="url(#${clipId})">
          <path d="${outlinePaths}" fill="none" stroke="#000000" stroke-opacity="0.28" stroke-width="${edgeShadowMm}"
            filter="url(#${bevelBlurId})" style="vector-effect:non-scaling-stroke"></path>
        </g>
        <path d="${outlinePaths}" fill="none" stroke="#2a1a0f" stroke-opacity="0.4" stroke-width="0.6"
          style="vector-effect:non-scaling-stroke"></path>
      </g>`;
  }

  function build(entries, W, H, texts = [], woodTint = 'natural', viewMode = 'render'){
    const woodMode = viewMode === 'render' && entries.some(e => e.layer === 'OUTLINE');
    const woodLayer = woodMode ? woodTextureLayer(entries, W, H, woodTint) : '';
    const parts = entries.map(({ contour, layer, closed = true }) => {
      const d = Geo.contourToSvgPath(contour, true, H, closed);
      const def = Layers.get(layer);
      // A contour naming a layer that isn't in the registry gets flagged
      // visually (layer-unknown, a blinking red outline — see its CSS)
      // instead of silently falling back to layer-outline as this used
      // to — that fallback was hiding the exact mistake this is meant to
      // surface (an element referencing a layer id that doesn't exist).
      if (!def || !def.style) return `<path class="layer-unknown" d="${d}"></path>`;

      if (woodMode && layer === 'OUTLET_BLOCK_TOP') {
        // The outlet block's own visible top face: a solid stand-in fill
        // rather than any of the wood/machining treatments below — it
        // isn't wood at all, it's the physical unit sitting on top of
        // the panel.
        return `<path d="${d}" fill="${OUTLET_BLOCK_FILL}"></path>`;
      }

      if (woodMode && WOOD_MODE_HIDDEN_STROKE_LAYERS.has(layer)) {
        // OUTLINE's own bright CAD stroke is replaced by the eased-edge
        // shading drawn in woodTextureLayer — nothing further to paint.
        return '';
      }

      const style = styleFor(layer);
      // open lines/arrowheads shouldn't inherit the layer's closed-shape
      // fill, regardless of that layer's own fillOpacity.
      const attrs = ` style="${style}${closed ? '' : ';fill:none'}"`;
      const strokePath = `<path${attrs} d="${d}"></path>`;

      if (woodMode && closed && isBottomMilled(layer)) {
        // A pocket/groove milled from the underside is invisible from
        // this top-down view in reality — shown as a thin dashed
        // reference line only, no fill standing in for a recess that
        // wouldn't actually be visible here.
        return `<path d="${d}" fill="none" stroke="#8a6a3a" stroke-opacity="0.55" stroke-width="0.6"
          stroke-dasharray="3 2" style="vector-effect:non-scaling-stroke"></path>`;
      }
      if (woodMode && closed && layer === 'PHYSICAL') {
        // A physical part's own reference outline (pult, tray, USB
        // charger, underframe...) isn't itself milled into the panel —
        // shown the same way as an underside pocket, a thin dashed
        // reference line, so it doesn't read as bright CAD markup
        // sitting on top of the wood.
        return `<path d="${d}" fill="none" stroke="#808080" stroke-opacity="0.55" stroke-width="0.6"
          stroke-dasharray="3 2" style="vector-effect:non-scaling-stroke"></path>`;
      }
      if (woodMode && closed && isTopEngraving(layer)) {
        // A shallow top-side engraving reads as a light darkening of the
        // wood surface, not a cut recess — no contour stroke on top of
        // it, the darkened fill alone is the whole treatment.
        return `<path d="${d}" fill="#1a0f08" fill-opacity="0.16"></path>`;
      }
      if (woodMode && closed && machiningOf(layer)) {
        // Any other real machining (currently: PHONESTAND — top-side but
        // deep enough to be a genuine cutout) keeps the solid dark
        // recess treatment, also without its own contour stroke — the
        // fill alone reads as a recess in the wood.
        return `<path d="${d}" fill="#1a0f08" fill-opacity="0.38"></path>`;
      }
      return strokePath;
    });
    const dimStroke = (Layers.get('DIMENSIONS') || {}).style?.stroke || '#e05a5a';
    const textParts = texts.map(({ x, y, text, angle = 0 }) => {
      const sy = H - y; // flip to SVG's Y-down space, matching contourToSvgPath's own flip
      const deg = -angle * 180 / Math.PI; // SVG rotation is clockwise-positive in Y-down space, opposite of our CAD angle convention
      return `<text class="dim-text" style="fill:${dimStroke}" x="${x}" y="${sy}" transform="rotate(${deg} ${x} ${sy})" text-anchor="middle" dominant-baseline="central">${text}</text>`;
    });
    // Wood texture is painted first so every real layer (outline, cutouts,
    // element pockets, dimension lines) still draws on top of it.
    return woodLayer + '\n' + parts.join('\n') + (textParts.length ? '\n' + textParts.join('\n') : '');
  }

  return { build, WOOD_TINTS };
})();
