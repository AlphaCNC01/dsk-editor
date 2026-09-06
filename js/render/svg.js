// ============================================================================
// Render.SVG — Drawing -> <svg> markup for the live preview pane. Every
// contour's style comes straight from its own layer's entry in
// Layers.registry (see styleFor below), so a newly registered layer
// renders correctly with zero changes needed here.
//
// Two view modes, picked via build()'s own `viewMode` argument:
//   'render' (default) — the photoreal wood-texture preview (see
//     woodTextureLayer and the woodMode branches inside build below).
//   'schematic' — the original flat CAD view: every layer drawn with its
//     own registry stroke/fill, no wood photo, no bevel/vignette/shadow.
//     Useful for actually reading/checking the layer geometry itself
//     (dimensions, cutout placement, overlaps) without the render's own
//     styling in the way.
// Switching modes is purely a preview choice — it never touches
// geometry, DXF, or SVG/PNG export.
// ============================================================================
const RenderSVG = (() => {
  // Photo used as the wood-grain texture in the preview. This is
  // preview-only decoration: it plays no part in geometry, DXF, or any
  // other export, and isn't touched by Export.SVG/Export.PNG.
  //
  // The panel is never bigger than 2m x 1m (Егор: real stock tops out
  // there), so there's no tiling to worry about — one photo, drawn once,
  // covering the tabletop's own W x H like a CSS `background-size: cover`
  // (fills the full area, cropping whichever axis has spare length,
  // rather than stretching either axis non-uniformly). Same photo on
  // every tabletop of a given size is fine; so are the photo's own JPEG
  // artifacts under zoom — neither is worth solving for here.
  const WOOD_TEXTURE_URL = 'assets/wood_texture.jpg';
  // Photo's own pixel aspect ratio (width/height) — 1750x861 — needed to
  // compute the "cover" crop below without distorting grain direction.
  const WOOD_TEXTURE_ASPECT = 1750 / 861;

  // Imitated eased edge (a light roundover/chamfer, not a real geometric
  // fillet on the exported contour — purely a preview shading trick): a
  // fixed-width dark band along every edge, independent of the
  // tabletop's own size, since it's standing in for a specific ~5mm
  // physical edge treatment rather than a proportional stylistic frame.
  const EDGE_SHADOW_MM = 5;

  // Preview-only wood-tint presets (point 5): each is a flat color
  // multiplied over the photo (SVG feBlend "multiply"), which darkens
  // toward that color while letting the grain's own light/dark pattern
  // show through underneath — the same trick as a wood stain or a tinted
  // varnish, not a flat color replacement. 'natural' means no tint at
  // all (the photo as shot). Picked in the UI's finish-color <select>;
  // purely cosmetic, never touches geometry/DXF/SVG-export.
  const WOOD_TINTS = {
    natural:  { label: 'Дуб натуральный', color: null },
    white:    { label: 'Белёный дуб',     color: '#e8e2d8' },
    honey:    { label: 'Медовый',         color: '#c98a3f' },
    walnut:   { label: 'Тёмный орех',     color: '#5a3c28' },
    wenge:    { label: 'Венге',           color: '#2b211c' },
    gray:     { label: 'Серый матовый',   color: '#8a8782' },
  };

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
  // top of a photo. Which of the treatments below an entry gets is
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

  // Outlet-block cover plate (point 4): OUTLET_BLOCK_TOP is the block's
  // own visible top face (see layers.js) — solid-filled with a stand-in
  // color for now. Meant to eventually be replaced with an actual photo
  // of the physical unit the same way the tabletop itself is (a <pattern>
  // swapped in here), so it's kept as its own constant rather than folded
  // into a generic "PHYSICAL" treatment.
  const OUTLET_BLOCK_FILL = '#2c2c2e';

  // Builds the <defs> wood-texture bits plus the <path>s that paint them,
  // all clipped to the tabletop's own OUTLINE contour(s) — a T-slot notch
  // or the ergo notch is itself part of the OUTLINE contour (see
  // tabletop.js), so it's automatically excluded rather than needing
  // separate handling here. Returns '' if there's no OUTLINE entry to key
  // off (shouldn't normally happen, but render() bails out before this on
  // W/H <= 0 anyway).
  //
  // W/H are the tabletop's own nominal width/height (the rectangle before
  // notches/trapezoid), which is exactly the "cover" area the photo
  // should fill. `tint` is one of WOOD_TINTS' own keys (defaults to
  // 'natural' for any unrecognized value, same as an unset one).
  function woodTextureLayer(entries, W, H, tint){
    const outlineEntries = entries.filter(e => e.layer === 'OUTLINE');
    if (!outlineEntries.length) return '';
    const patternId = 'woodTexturePattern';
    const clipId = 'woodTextureClip';
    const bevelBlurId = 'woodBevelShadow';
    const vignetteId = 'woodVignette';
    const shadowFilterId = 'woodDropShadow';
    const tintFilterId = 'woodTintFilter';
    const outlinePaths = outlineEntries
      .map(({ contour, closed = true }) => Geo.contourToSvgPath(contour, true, H, closed))
      .join(' ');

    // "cover" fit: crop whichever axis has spare coverage instead of
    // stretching either axis independently (no more preserveAspectRatio
    // ="none" — that was distorting the grain's own proportions).
    const topAspect = W / H;
    let imgW, imgH, imgX, imgY;
    if (topAspect > WOOD_TEXTURE_ASPECT) {
      // Tabletop is relatively wider than the photo -> match width, crop top/bottom.
      imgW = W;
      imgH = W / WOOD_TEXTURE_ASPECT;
      imgX = 0;
      imgY = (H - imgH) / 2;
    } else {
      // Tabletop is relatively taller than the photo -> match height, crop sides.
      imgH = H;
      imgW = H * WOOD_TEXTURE_ASPECT;
      imgY = 0;
      imgX = (W - imgW) / 2;
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
    // line into a fading-inward band. Kept noticeably lighter/narrower
    // than the first pass at this (which read as too heavy a bevel for
    // an eased 5mm edge).
    const edgeShadowMm = EDGE_SHADOW_MM;

    // Tint (point 5): a flat color multiplied over the photo. feFlood
    // fills the whole filter region with the chosen color; feBlend
    // "multiply" combines it with the source photo (SourceGraphic) —
    // multiply is what makes this a *stain* (darkens toward the color,
    // preserves the grain's own light/dark variation) rather than an
    // opaque tint that would flatten the wood texture away entirely. No
    // filter at all for 'natural'/unrecognized so the untouched photo is
    // the true default with zero extra rendering cost.
    const tintDef = WOOD_TINTS[tint];
    const tintColor = tintDef && tintDef.color;
    const tintFilterAttr = tintColor ? ` filter="url(#${tintFilterId})"` : '';
    const tintDefsBlock = tintColor ? `
        <filter id="${tintFilterId}" x="0" y="0" width="100%" height="100%">
          <feFlood flood-color="${tintColor}" result="tintColor"></feFlood>
          <feBlend in="SourceGraphic" in2="tintColor" mode="multiply"></feBlend>
        </filter>` : '';

    return `<defs>
        <pattern id="${patternId}" patternUnits="userSpaceOnUse" width="${W}" height="${H}">
          <image href="${WOOD_TEXTURE_URL}" x="${imgX}" y="${imgY}" width="${imgW}" height="${imgH}"${tintFilterAttr}></image>
        </pattern>
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
        </filter>${tintDefsBlock}
      </defs>
      <g filter="url(#${shadowFilterId})">
        <path d="${outlinePaths}" fill="url(#${patternId})" clip-path="url(#${clipId})"></path>
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
        // (point 4) rather than any of the wood/machining treatments
        // below — it isn't wood at all, it's the physical unit sitting
        // on top of the panel.
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
        // reference line only (point 3), no fill standing in for a
        // recess that wouldn't actually be visible here.
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
        // wood surface (point 2), not a cut recess — no contour stroke
        // on top of it, the darkened fill alone is the whole treatment.
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
