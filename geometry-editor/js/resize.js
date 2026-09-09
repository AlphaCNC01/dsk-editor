// ============================================================================
// Resize — lets the person drag #resizeHandle to adjust how wide #sideCol
// is, by writing to #app's own --side-col-width CSS variable (see
// styles.css's #app rule) rather than touching grid-template-columns
// directly on every mousemove, which would be more DOM work per frame for
// no benefit.
// ============================================================================
(function(){
  const MIN_WIDTH = 260;
  const MAX_WIDTH = 720;

  function init(){
    const handle = document.getElementById('resizeHandle');
    const app = document.getElementById('app');
    if (!handle || !app) return; // defensive — this module is self-contained and shouldn't break the rest of the page if its own markup is ever missing

    let dragging = false;
    let startX = 0;
    let startWidth = 0;

    function currentWidth(){
      const raw = getComputedStyle(app).getPropertyValue('--side-col-width').trim();
      const n = parseFloat(raw);
      return Number.isFinite(n) ? n : 380;
    }

    function onPointerDown(ev){
      dragging = true;
      startX = ev.clientX;
      startWidth = currentWidth();
      handle.classList.add('dragging');
      // Prevents text selection elsewhere on the page while dragging,
      // and keeps the resize cursor showing even if the pointer briefly
      // leaves the thin handle during a fast drag.
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      ev.preventDefault();
    }

    function onPointerMove(ev){
      if (!dragging) return;
      // Dragging LEFT (negative deltaX) should WIDEN the side column,
      // since the handle sits to the side column's left — hence the
      // subtraction rather than addition here.
      const deltaX = ev.clientX - startX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth - deltaX));
      app.style.setProperty('--side-col-width', next + 'px');
    }

    function onPointerUp(){
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }

    handle.addEventListener('mousedown', onPointerDown);
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('mouseup', onPointerUp);

    // Double-click resets to the default width — a quick way back after
    // over-dragging, without needing a separate reset button in the UI.
    handle.addEventListener('dblclick', () => {
      app.style.setProperty('--side-col-width', '380px');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
