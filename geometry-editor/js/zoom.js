// ============================================================================
// Copied verbatim from ../../js/ui/zoom.js (the real app's own manual
// zoom/pan for the preview pane). NOT modified in any way -- this file
// only needs UI.el and the 5 DOM ids below (preview/stage/zoomOutBtn/
// zoomInBtn/zoomResetBtn), which this editor's own index.html/js/ui-shim.js
// provide with the exact same ids and markup as the main app, so the
// real implementation runs unchanged instead of being re-derived here.
// If the original ever changes, re-copy it rather than hand-patching
// this file out of sync with it.
// ============================================================================

// ============================================================================
// UI.zoom — manual zoom/pan for the live preview pane. Purely a screen-space
// CSS transform on <svg id="stage"> itself (translate+scale in CSS pixels),
// layered on top of the existing fit-to-content viewBox logic in
// app-render.js — it never touches the viewBox, geometry, or any export
// path, so this is strictly a preview convenience.
//
// Three ways to change zoom, all converging on the same setZoom/panBy:
//   - the +/-/reset buttons in #zoomControls
//   - Ctrl+wheel over the preview pane, zooming around the cursor
//   - click-drag on the stage once zoomed in (panning)
// ============================================================================

(function(){
  const el = UI.el;
  const preview = el('preview');
  const stage = el('stage');
  const zoomOutBtn = el('zoomOutBtn');
  const zoomInBtn = el('zoomInBtn');
  const zoomResetBtn = el('zoomResetBtn');

  const MIN_SCALE = 0.5;
  const MAX_SCALE = 8;
  const BUTTON_STEP = 1.25; // multiplicative step per +/- click
  const WHEEL_STEP = 0.0015; // exponential factor per wheel-delta unit

  let scale = 1;
  let panX = 0, panY = 0; // translate, in CSS pixels, applied before scale (transform-origin:0 0)

  function apply(){
    stage.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    preview.classList.toggle('zoomed', scale !== 1 || panX !== 0 || panY !== 0);
    zoomResetBtn.textContent = `${Math.round(scale * 100)}%`;
  }

  function clampScale(s){
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  }

  // Changes scale while keeping the point currently under (originX,originY)
  // — in #preview-relative CSS pixels — visually fixed on screen. Without
  // this, zooming always grows/shrinks around the stage's own top-left
  // corner, which feels wrong for both the +/- buttons (anchored at the
  // stage's current on-screen center) and wheel-zoom (anchored at the
  // cursor).
  function zoomAt(newScale, originX, originY){
    const clamped = clampScale(newScale);
    if (clamped === scale) return;
    // originX/Y must stay fixed: origin = pan + point*scale (pre-transform
    // point), so point = (origin - pan) / scale must be invariant across
    // the scale change.
    const pointX = (originX - panX) / scale;
    const pointY = (originY - panY) / scale;
    panX = originX - pointX * clamped;
    panY = originY - pointY * clamped;
    scale = clamped;
    apply();
  }

  // Buttons zoom around the stage's own current on-screen center, same as
  // most editors' toolbar zoom (as opposed to wheel-zoom, which is always
  // cursor-anchored).
  function zoomByButton(factor){
    const rect = stage.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2 - previewRect.left;
    const centerY = rect.top + rect.height / 2 - previewRect.top;
    zoomAt(scale * factor, centerX, centerY);
  }

  function resetZoom(){
    scale = 1; panX = 0; panY = 0;
    apply();
  }

  zoomInBtn.addEventListener('click', () => zoomByButton(BUTTON_STEP));
  zoomOutBtn.addEventListener('click', () => zoomByButton(1 / BUTTON_STEP));
  zoomResetBtn.addEventListener('click', resetZoom);

  // Ctrl+wheel zooms around the cursor, matching the browser/OS-native
  // "Ctrl+scroll to zoom" convention — a plain wheel is left alone so the
  // rest of the page can still scroll normally when the cursor happens to
  // be over the preview pane.
  preview.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const previewRect = preview.getBoundingClientRect();
    const originX = e.clientX - previewRect.left;
    const originY = e.clientY - previewRect.top;
    const factor = Math.exp(-e.deltaY * WHEEL_STEP);
    zoomAt(scale * factor, originX, originY);
  }, { passive: false });

  // Click-drag pans once zoomed in. Plain (unmodified) drag is used since
  // the preview pane has no other click behavior to conflict with; a
  // listener on `document` (not just the stage) for move/up keeps panning
  // smooth even if the cursor briefly leaves the stage/preview bounds
  // mid-drag.
  let dragging = false;
  let dragStartX = 0, dragStartY = 0, panStartX = 0, panStartY = 0;

  stage.addEventListener('mousedown', (e) => {
    if (scale === 1) return; // nothing to pan at the default fit-to-content scale
    dragging = true;
    dragStartX = e.clientX; dragStartY = e.clientY;
    panStartX = panX; panStartY = panY;
    preview.classList.add('panning');
    e.preventDefault(); // avoid text/image drag-selection artifacts while panning
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    panX = panStartX + (e.clientX - dragStartX);
    panY = panStartY + (e.clientY - dragStartY);
    apply();
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    preview.classList.remove('panning');
  });

  apply();

  UI.resetZoom = resetZoom;
})();
