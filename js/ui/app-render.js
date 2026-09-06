// ============================================================================
// UI app: render loop — the fixed (non-list) form inputs, readParams
// (collects the full params object, including every element manager's
// resolved instances), render (rebuilds geometry and repaints the SVG
// preview), and the DXF/SVG/PNG export actions. See app-project.js for
// save/load and the final event-wiring + first render() call.
// ============================================================================

(function(){
  const el = UI.el;

  // ---------- Fixed (non-list) inputs ----------
  const inputs = {
    orderNumber: el('orderNumber'),
    rectW: el('rectW'), rectH: el('rectH'), rectThickness: el('rectThickness'),
    rTop: el('rTop'), rBottom: el('rBottom'), rNotch: el('rNotch'),
    notchOn: el('notchOn'),
    notchH: el('notchH'), notchBottom: el('notchBottom'), notchTop: el('notchTop'),
    underframeType: el('underframeType'),
    underframeInsetH: el('underframeInsetH'), underframeInsetV: el('underframeInsetV'),
    dimensionsOn: el('dimensionsOn'),
    schematicOn: el('schematicOn'),
    woodTint: el('woodTint'),
  };
  const notchFieldsWrap = el('notchFields');
  const underframeFieldsWrap = el('underframeFields');
  const woodTintFieldWrap = el('woodTintField');
  const svg = el('stage');

  // The finish-color <select>'s own options come straight from
  // RenderSVG.WOOD_TINTS (the single source of truth for both the list of
  // presets and how each one is rendered — see svg.js), so a new preset
  // added there shows up here with no separate list to keep in sync.
  // Preview-only: never touches geometry/DXF/SVG-export.
  for (const [key, { label }] of Object.entries(RenderSVG.WOOD_TINTS)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = label;
    inputs.woodTint.appendChild(opt);
  }

  // Sanitizes the order number into a filesystem-safe filename — the
  // order number itself can contain characters a filename can't
  // (slashes, quotes, etc), so this only affects what gets written to
  // disk, not what's shown/edited in the field.
  function sanitizeFilename(raw){
    const cleaned = (raw || '').trim().replace(/[\\/:*?"<>|]+/g, '_');
    return cleaned || 'panel';
  }

  function readParams(){
    const underframeInsetH = parseFloat(inputs.underframeInsetH.value) || 0;

    // Collect the plain (non-element) params first — everything an
    // instance's own dynamic defaults (e.g. underframe-relative insets)
    // might need to read.
    const p = {
      W: parseFloat(inputs.rectW.value) || 0,
      H: parseFloat(inputs.rectH.value) || 0,
      thickness: parseFloat(inputs.rectThickness.value) || 0,
      rTop: parseFloat(inputs.rTop.value) || 0,
      rBottom: parseFloat(inputs.rBottom.value) || 0,
      rNotch: parseFloat(inputs.rNotch.value) || 0,
      notchOn: inputs.notchOn.checked,
      notchH: parseFloat(inputs.notchH.value) || 0,
      notchBottom: parseFloat(inputs.notchBottom.value) || 0,
      notchTop: parseFloat(inputs.notchTop.value) || 0,
      underframeType: inputs.underframeType.value,
      underframeInsetH: underframeInsetH,
      underframeInsetV: parseFloat(inputs.underframeInsetV.value) || 0,
      dimensionsOn: inputs.dimensionsOn.checked,
    };

    // Now that `p` has every plain param, resolve each element's own
    // instances against it — this is what turns a function-valued
    // default (e.g. "220mm past the underframe's own edge") into a
    // concrete number, ready for the geometry code to consume directly.
    for (const { key, mgr } of UI.ELEMENT_MANAGERS) p[key] = mgr.resolveItems(p);

    return p;
  }

  function render(){
    // Show/hide the field groups that only make sense when their own
    // toggle is on (the ergo notch, the top notch, the underframe, and
    // the finish-color picker — that one's meaningless in schematic view
    // since schematic mode never paints the wood photo at all).
    notchFieldsWrap.classList.toggle('disabled', !inputs.notchOn.checked);
    underframeFieldsWrap.classList.toggle('disabled', inputs.underframeType.value === 'none');
    const viewMode = inputs.schematicOn.checked ? 'schematic' : 'render';
    woodTintFieldWrap.classList.toggle('disabled', viewMode === 'schematic');

    const p = readParams();
    if (p.W <= 0 || p.H <= 0) return;

    // Refresh every element's own placeholder numbers to match the
    // params just read (an element's default can depend on another
    // field, like the underframe's own inset).
    for (const { mgr } of UI.ELEMENT_MANAGERS) mgr.updatePlaceholders(p);

    // Build the tabletop's own geometry plus its dimension lines.
    const entries = Drawing.build(p);
    const dims = Dimensions.build(p);
    const allEntries = [...entries, ...dims.entries];
    const svgMarkup = RenderSVG.build(allEntries, p.W, p.H, dims.texts, inputs.woodTint.value, viewMode);

    // Pad the viewBox out a little beyond the drawing's own bounds so
    // dimension lines/labels sitting outside the tabletop's own outline
    // (as most of them do) aren't clipped.
    const cosmeticPad = Math.max(p.W, p.H) * 0.08;
    const bounds = ExportSVG.computeBounds(allEntries, dims.texts, p.W, p.H);
    const minX = Math.min(bounds.minX, -cosmeticPad);
    const minY = Math.min(bounds.minY, -cosmeticPad);
    const maxX = Math.max(bounds.maxX, p.W + cosmeticPad);
    const maxY = Math.max(bounds.maxY, p.H + cosmeticPad);
    const vbX = minX, vbW = maxX - minX;
    const svgMinY = p.H - maxY, vbH = maxY - minY;
    svg.setAttribute('viewBox', `${vbX} ${svgMinY} ${vbW} ${vbH}`);
    svg.innerHTML = svgMarkup;
  }

  // debouncedRender — same render(), just delayed by DEBOUNCE_MS after the
  // last call. Every keystroke in a number/text field fires 'input', and
  // render() rebuilds all geometry + re-serializes the whole SVG via
  // innerHTML on every call — fine for a single call, wasteful when 5+
  // keystrokes land within a few dozen milliseconds while someone's
  // actively typing (e.g. widening a field from "50" to "150"). This
  // collapses a fast burst of calls into just the last one. Only wired to
  // user-input-triggered paths (see below); the very first render() call
  // and the one after loading a saved project stay direct/instant, since
  // those aren't bursts and a delay there would just look like lag on
  // page load or after picking a file.
  const DEBOUNCE_MS = 120;
  let debounceTimer = null;
  function debouncedRender(){
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, DEBOUNCE_MS);
  }

  function exportDxf(){
    const p = readParams();
    if (p.W <= 0 || p.H <= 0) { alert('Укажите положительные ширину и высоту.'); return; }
    const entries = Drawing.build(p);
    const dims = Dimensions.build(p);
    ExportDXF.downloadAs([...entries, ...dims.entries], sanitizeFilename(inputs.orderNumber.value), dims.texts);
  }

  function exportSvg(){
    const p = readParams();
    if (p.W <= 0 || p.H <= 0) { alert('Укажите положительные ширину и высоту.'); return; }
    const entries = Drawing.build(p);
    const dims = Dimensions.build(p);
    ExportSVG.downloadAs([...entries, ...dims.entries], p.W, p.H, sanitizeFilename(inputs.orderNumber.value), dims.texts);
  }

  async function exportPng(){
    const p = readParams();
    if (p.W <= 0 || p.H <= 0) { alert('Укажите положительные ширину и высоту.'); return; }
    const entries = Drawing.build(p);
    const dims = Dimensions.build(p);
    const mainBtn = el('exportMainBtn');
    const originalLabel = mainBtn.textContent;
    mainBtn.disabled = true;
    mainBtn.textContent = 'Рендеринг…';
    try {
      await ExportPNG.downloadAs([...entries, ...dims.entries], p.W, p.H, sanitizeFilename(inputs.orderNumber.value), dims.texts);
    } catch (err) {
      alert('Не удалось экспортировать PNG: ' + err.message);
    } finally {
      mainBtn.disabled = false;
      mainBtn.textContent = originalLabel;
    }
  }

  // The split-button's main action always exports PNG (the common case);
  // DXF/SVG live in the dropdown next to it, opened via the chevron.
  // EXPORT_FORMATS keys off data-format so both the main button and each
  // dropdown entry can share one dispatch function instead of three
  // separate listeners repeating the same lookup.
  const EXPORT_FORMATS = { dxf: exportDxf, svg: exportSvg, png: exportPng };

  function runExport(format){
    UI.closeExportMenu();
    const fn = EXPORT_FORMATS[format];
    if (fn) fn();
  }

  function openExportMenu(){
    el('exportMenu').classList.add('open');
    el('exportMenuToggle').setAttribute('aria-expanded', 'true');
  }
  function closeExportMenu(){
    el('exportMenu').classList.remove('open');
    el('exportMenuToggle').setAttribute('aria-expanded', 'false');
  }
  function toggleExportMenu(){
    if (el('exportMenu').classList.contains('open')) closeExportMenu();
    else openExportMenu();
  }

  Object.assign(UI, {
    inputs, sanitizeFilename, readParams, render, debouncedRender,
    runExport, openExportMenu, closeExportMenu, toggleExportMenu,
  });
})();
