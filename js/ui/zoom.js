// ============================================================================
// UI.zoom — manual zoom/pan for the live preview pane. Purely a screen-space
// CSS transform on <svg id="stage"> itself (translate+scale in CSS pixels),
// layered on top of the existing fit-to-content viewBox logic in
// app-render.js — it never touches the viewBox, geometry, or any export
// path, so this is strictly a preview convenience.
//
// Ways to change zoom, all converging on the same zoomAt/pan state:
//   - the +/-/reset buttons in #zoomControls
//   - Ctrl+wheel over the preview pane, zooming around the cursor
//   - pinch with two fingers (touch), zooming around the pinch center
//   - drag (mouse or one finger) once zoomed in — panning
// Mouse and touch both go through Pointer Events; the preview pane has
// `touch-action:none` in css/mobile.css so the browser doesn't steal gestures.
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
  // — in #preview-relative CSS pixels — visually fixed on screen.
  function zoomAt(newScale, originX, originY){
    const clamped = clampScale(newScale);
    if (clamped === scale) return;
    const pointX = (originX - panX) / scale;
    const pointY = (originY - panY) / scale;
    panX = originX - pointX * clamped;
    panY = originY - pointY * clamped;
    scale = clamped;
    apply();
  }

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

  // Update the button tooltips to mention wheel zooming. The wheel handler
  // below accepts ctrlKey OR metaKey; on macOS the native trackpad pinch
  // arrives as a wheel event with metaKey (and Cmd is the conventional
  // modifier there), so show "Cmd" instead of "Ctrl" on Mac.
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
  const modKey = isMac ? 'Cmd' : 'Ctrl';
  zoomOutBtn.title = `Уменьшить\n${modKey} + колесо мыши вниз`;
  zoomInBtn.title = `Увеличить\n${modKey} + колесо мыши вверх`;

  // Ctrl+wheel zooms around the cursor; a plain wheel is left alone.
  preview.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const previewRect = preview.getBoundingClientRect();
    const originX = e.clientX - previewRect.left;
    const originY = e.clientY - previewRect.top;
    const factor = Math.exp(-e.deltaY * WHEEL_STEP);
    zoomAt(scale * factor, originX, originY);
  }, { passive: false });

  // ---------- Pointer gestures: one-pointer pan, two-pointer pinch ----------
  const pointers = new Map(); // pointerId -> {x, y} in client coords
  let panStart = null;   // { x, y, panX, panY } while a single pointer drags
  let pinchStart = null; // { dist, scale, pointX, pointY } while two pointers pinch

  function previewPoint(x, y){
    const r = preview.getBoundingClientRect();
    return { x: x - r.left, y: y - r.top };
  }

  function pinchMetrics(){
    const [a, b] = [...pointers.values()];
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
    };
  }

  function beginPan(p){
    panStart = { x: p.x, y: p.y, panX, panY };
    preview.classList.add('panning');
  }

  function beginPinch(){
    const m = pinchMetrics();
    const c = previewPoint(m.cx, m.cy);
    pinchStart = {
      dist: m.dist,
      scale,
      pointX: (c.x - panX) / scale, // content point under the pinch center, invariant during the gesture
      pointY: (c.y - panY) / scale,
    };
    panStart = null;
  }

  preview.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#zoomControls, #thicknessBadge')) return; // let buttons behave normally
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { preview.setPointerCapture(e.pointerId); } catch (_) {}
    if (pointers.size === 2) {
      beginPinch();
    } else if (pointers.size === 1 && scale !== 1) {
      beginPan(pointers.get(e.pointerId)); // nothing to pan at the default fit-to-content scale
    }
    if (e.pointerType !== 'mouse' || scale !== 1) e.preventDefault();
  });

  preview.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2 && pinchStart) {
      const m = pinchMetrics();
      const c = previewPoint(m.cx, m.cy);
      const next = clampScale(pinchStart.scale * (m.dist / pinchStart.dist));
      scale = next;
      panX = c.x - pinchStart.pointX * next; // also follows the movement of the pinch center (two-finger pan)
      panY = c.y - pinchStart.pointY * next;
      apply();
    } else if (panStart) {
      const p = pointers.get(e.pointerId);
      panX = panStart.panX + (p.x - panStart.x);
      panY = panStart.panY + (p.y - panStart.y);
      apply();
    }
  });

  function endPointer(e){
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    try { preview.releasePointerCapture(e.pointerId); } catch (_) {}
    pinchStart = null;
    if (pointers.size === 1) {
      // one finger stays down after a pinch: continue as a pan from where it is now
      beginPan([...pointers.values()][0]);
    } else if (pointers.size === 0) {
      panStart = null;
      preview.classList.remove('panning');
    }
  }
  preview.addEventListener('pointerup', endPointer);
  preview.addEventListener('pointercancel', endPointer);

  apply();

  UI.resetZoom = resetZoom;
})();
