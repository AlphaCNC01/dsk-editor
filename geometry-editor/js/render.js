// ============================================================================
// Render — SVG preview. Reuses two real pieces of the actual app rather
// than reimplementing them:
//
//   - RenderSVG.build(entries, W, H, texts, woodTint, viewMode) — the SAME
//     function ../js/render/svg.js uses for the live app's own on-screen
//     preview. Passing viewMode:'schematic' skips the wood-grain painting
//     (irrelevant here — none of these entries carry an OUTLINE layer
//     anyway) and draws every layer with its real Layers.registry color.
//     This editor never re-derives stroke colors/widths itself.
//
//   - The viewBox convention from js/ui/app-render.js's own render(): pick
//     a bounding box in plain CAD (Y-up) coordinates, then flip ONCE by
//     setting the SVG's own y-origin to (H - maxY) rather than negating
//     any individual coordinate. Getting this backwards (flipping the
//     path data one way and the viewBox another) is exactly what made an
//     earlier version of this editor center on the wrong point — see the
//     git history / prior round for that bug.
//
// UI chrome (zoom controls, the #preview/#stage/#zoomControls DOM
// structure) also matches index.html's own markup exactly, so js/ui/
// zoom.js — copied in unmodified — works without any changes.
// ============================================================================
const Render = (() => {
  let stageEl, statusEl, infoEl, centerInfoEl;

  // A synthetic "H" for RenderSVG.build's own Y-flip math. The real app
  // uses the tabletop's real height; there's no tabletop here, so H is
  // just picked as the current geometry's own bbox maxY — any H works as
  // long as the SAME H is used for the flip and for the viewBox's own
  // origin (see render() below), since only their DIFFERENCE matters for
  // where things land on screen.
  function init(refs){
    stageEl = refs.svg;
    statusEl = refs.status;
    infoEl = refs.info;
    centerInfoEl = refs.centerInfo;
  }

  function setStatus(msg, isError){
    statusEl.textContent = msg;
    statusEl.classList.toggle('error', !!isError);
  }

  function layerColor(layerName){
    const l = Layers.get(layerName);
    return l ? l.style.stroke : '#ff0000'; // unmatched -> RenderSVG's own .layer-unknown handles the visual, this is just for the contour-list swatch
  }

  function render(){
    const groups = EditorState.getGroups();
    const selection = EditorState.getSelection();

    const entries = [];
    groups.forEach((group, gi) => {
      group.contours.forEach((contour, ci) => {
        if (!contour || contour.length < 1) return;
        const closed = contour.length > 2 || (contour.length === 2 && Math.abs(contour[0].bulge || 0) > 1e-6);
        entries.push({ contour, layer: group.layer, closed, _gi: gi, _ci: ci });
      });
    });

    if (entries.length === 0) {
      stageEl.innerHTML = '';
      setStatus('Нет контуров', true);
      infoEl.textContent = '';
      centerInfoEl.textContent = '';
      return;
    }

    // Bulge-aware bbox (see transform.js's contourExtents — tessellates
    // arcs rather than trusting vertex coordinates alone, unlike the main
    // app's own ExportSVG.computeBounds, which can get away with
    // vertex-only bounds because the tabletop's own always-included W×H
    // rectangle dominates there; nothing plays that role here, so a
    // heavily-arced element could otherwise get clipped).
    let box = null;
    for (const e of entries) {
      const ext = Transform.contourExtents(e.contour);
      if (ext.minX === Infinity) continue;
      box = box ? {
        minX: Math.min(box.minX, ext.minX), maxX: Math.max(box.maxX, ext.maxX),
        minY: Math.min(box.minY, ext.minY), maxY: Math.max(box.maxY, ext.maxY),
      } : ext;
    }
    if (!box) { setStatus('Нет валидной геометрии', true); return; }

    // Origin (0,0) is always kept in view even if all geometry sits to one
    // side of it — this is a coordinate-authoring tool, so seeing where
    // 0,0 is relative to the shape matters even for an off-center shape.
    const minX = Math.min(box.minX, 0), maxX = Math.max(box.maxX, 0);
    const minY = Math.min(box.minY, 0), maxY = Math.max(box.maxY, 0);
    const pad = Math.max(maxX - minX, maxY - minY) * 0.12 || 10;

    // H must be a FIXED constant, independent of the current geometry's
    // own bbox — using maxY+pad (as an earlier version of this file did)
    // makes H track the shape's own position, which silently cancels out
    // any pure Y-translation in the rendered result: moving a shape up by
    // 10mm also moves H up by 10mm, so its SVG path coordinate (H - y) —
    // and therefore the viewBox needed to frame it — comes out identical
    // either way. A translate/rotate/mirror tool is useless if the
    // preview can't show a translation actually happening.
    //
    // 5000mm (5m) is comfortably larger than any real desk element this
    // app deals with (tabletops top out around 2-3m) while staying a
    // small enough number that the generated path/viewBox coordinates
    // stay easy to read in devtools and don't risk floating-point
    // precision artifacts the way a huge constant (e.g. 100000) would.
    const H = 5000;
    const svgMarkup = RenderSVG.build(entries, 0, H, [], 'natural', 'schematic');
    stageEl.innerHTML = svgMarkup;

    // RenderSVG.build maps a CAD point at y=Y to SVG path coordinate
    // (x, H-Y) — so CAD's own visible band [minY-pad, maxY+pad] lands at
    // SVG path-Y band [H-maxY-pad, H-minY+pad]. With H fixed, this
    // genuinely shifts when minY/maxY do, unlike the H=maxY+pad version
    // above's algebra, where H's own dependence on maxY cancelled that
    // shift out.
    const vbMinX = minX - pad;
    const vbMinY = H - maxY - pad;
    const vbW = (maxX - minX) + pad * 2;
    const vbH = (maxY - minY) + pad * 2;
    stageEl.setAttribute('viewBox', `${vbMinX} ${vbMinY} ${vbW} ${vbH}`);

    // Selection highlight + click-to-select are layered on top of
    // RenderSVG's own markup by walking the SAME entries array (identical
    // order to what build() just iterated), rather than re-parsing the
    // returned SVG string.
    const paths = stageEl.querySelectorAll('path');
    paths.forEach((path, i) => {
      const entry = entries[i];
      if (!entry) return;
      path.classList.add('shape-path');
      if (selection && selection.groupIndex === entry._gi && selection.contourIndex === entry._ci) {
        path.classList.add('selected');
      }
      path.addEventListener('click', (ev) => {
        ev.stopPropagation();
        EditorState.setSelection({ groupIndex: entry._gi, contourIndex: entry._ci });
      });
    });

    // Origin marker: CAD (0,0) maps through RenderSVG.build's own flip to
    // SVG path coordinate (0, H) — see the viewBox derivation above.
    const NS = 'http://www.w3.org/2000/svg';
    const origin = document.createElementNS(NS, 'circle');
    origin.setAttribute('cx', 0); origin.setAttribute('cy', H);
    origin.setAttribute('r', Math.max((vbW + vbH) / 2 * 0.008, 1));
    origin.setAttribute('class', 'origin-marker');
    stageEl.appendChild(origin);

    setStatus(`OK: ${entries.length} конт.`);
    infoEl.textContent = `${Math.round(maxX - minX)}×${Math.round(maxY - minY)} мм`;
    centerInfoEl.textContent = `X: ${((box.minX + box.maxX) / 2).toFixed(2)}, Y: ${((box.minY + box.maxY) / 2).toFixed(2)}`;
  }

  return { init, render, setStatus, layerColor };
})();
