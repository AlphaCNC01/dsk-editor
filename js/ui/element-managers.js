// ============================================================================
// UI element managers — one UI.createEmbeddableManager call per repeatable
// element, plus UI.ELEMENT_MANAGERS, the registry every other generic loop
// (readParams, render, buildProjectData, applyProjectData) iterates over
// instead of hand-listing every element separately. See the "Adding a new
// element" guide referenced below for the full walkthrough.
// ============================================================================

(function(){
  // Builds typeSelector.options straight from an element's own VARIANTS
  // object, instead of hand-listing {value,text} pairs a second time —
  // each variant's `sku` (the manufacturer/internal article code) and
  // `label` (a short human description) are combined into the dropdown
  // text as "SKU — label". This is the single place that reads sku/label
  // for display, so adding a new variant (new charger, new pult, new
  // underframe size, etc.) to an element file is enough on its own to
  // make it show up correctly here — no second list to remember to
  // update. Falls back to the bare key if a variant is missing sku/label
  // (shouldn't happen for anything registered properly, but avoids a
  // blank/undefined option text if it ever does).
  function optionsFromVariants(variants){
    return Object.keys(variants).map(key => {
      const v = variants[key];
      const text = v.sku && v.label ? `${v.sku} — ${v.label}` : (v.label || v.sku || key);
      return { value: key, text };
    });
  }

  // ---------- Instance-list managers ----------
  // Each repeatable element gets one manager built on the shared factory
  // (UI.createEmbeddableManager, see field-helpers.js). insetFieldsHtml
  // builds the anchor-picker + X/Y row shared by every anchor-based
  // element; only what genuinely differs between elements (labels,
  // default position, an optional type selector, or — for the USB
  // charger — a completely different one-axis shape) lives in each
  // manager below.

  // ---------- Element managers ----------
  // Every element below is declared in the ORDER its section should
  // appear in the controls panel — with no static HTML for any of them
  // (see UI.ensureElementSection, called internally by
  // UI.createEmbeddableManager) — the panel's own visual order comes
  // purely from this declaration order, top to bottom.
  // Top notches (T-slot / rectangular cutouts milled into the tabletop's
  // own top edge — see tabletop.js's buildTopNotchCorners): a plain
  // instance list, NOT built on createEmbeddableManager, since these
  // aren't anchor-positioned embeddable parts — a notch lives ON the
  // tabletop's own outline, positioned by a center offset along that one
  // edge, with no anchor grid, rotation, or mirror of its own.
  // UI.createInstanceListManager (the same base createEmbeddableManager
  // itself is built on) is used directly instead. Declared FIRST among
  // the managers below (before pultMgr) so its section lands right after
  // the static "Подстолье" fieldset already in index.html and before
  // every other repeatable-element section — see ensureElementSection's
  // own comment: section order is purely call order.
  const topNotchMgr = (() => {
    const { containerId, addBtnId } = UI.ensureElementSection('topNotches', 'Вырезы для проводов', 'Добавить вырез');

    const rowHtml = (inst, idx) => `
      <div class="field">
        <label>Тип выреза</label>
        <select data-field="type" data-idx="${idx}">
          <option value="tslot">Т-образный</option>
          <option value="rect">Прямоугольный</option>
        </select>
      </div>
      <div class="row2">
        <div class="field">
          <label>Ширина выреза <span class="unit">мм</span></label>
          <input type="number" data-field="width" data-idx="${idx}" value="${inst.width}" min="0" step="1">
        </div>
        <div class="field">
          <label>Смещение <span class="unit">мм</span></label>
          <input type="number" data-field="offset" data-idx="${idx}" value="${inst.offset}" step="1">
        </div>
      </div>
      <div class="field">
        <label>Скругление углов <span class="unit">мм</span></label>
        <input type="number" data-field="r" data-idx="${idx}" value="${inst.r}" min="0" step="1">
      </div>`;

    const mgr = UI.createInstanceListManager({
      containerId, addBtnId, itemLabel: 'Вырез',
      dimensionsDefault: true,
      defaults: () => ({ type: 'tslot', width: 300, offset: 0, r: 5 }),
      onChange: () => UI.render(),
      onFieldChange: () => UI.debouncedRender(),
      rowHtml,
    });

    // No anchor-based defaults to resolve (width/offset/r are always
    // concrete, never a placeholder-driven function of other params like
    // insetX/insetY elsewhere) — resolveItems is a pass-through, and
    // updatePlaceholders has nothing to refresh. Both still exist so this
    // manager plugs into the exact same ELEMENT_MANAGERS loop
    // (readParams/render/buildProjectData/applyProjectData) as every
    // anchor-based element, with no special-casing needed there.
    mgr.resolveItems = (p) => mgr.items;
    mgr.updatePlaceholders = () => {};

    return mgr;
  })();

  const pultMgr = UI.createEmbeddableManager({
    key: 'pults', label: 'Пульты управления', addLabel: 'Добавить пульт',
    defaults: {
      type: 'standard',
      anchor: 'bottomRight',
      insetX: (inst, p) => (p.underframeInsetH || 0) + (inst.type === 'embeddedUsb' ? 120 : 110),
      insetY: 0
    },
    typeSelector: {
      label: 'Тип пульта',
      options: optionsFromVariants(PULT_VARIANTS)
    },
    // Only the embeddedUsb variant has a USB module cutout to route a
    // channel from (see the pult element's own cableNode, defined only on
    // that variant) — Standard has nothing for a channel to start at.
    cableTargetLabel: 'Кабель-канал',
    cableTargetWhen: (inst) => inst.type === 'embeddedUsb'
  });

  const chargerMgr = UI.createEmbeddableManager({
    key: 'chargers', label: 'Беспроводные зарядки', addLabel: 'Добавить зарядку',
    defaults: { anchor: 'topRight', insetX: 225, insetY: 200 },
    cableTargetLabel: 'Кабель-канал'
  });

  const outletBlockMgr = UI.createEmbeddableManager({
    key: 'outletBlocks', label: 'Блоки розеток', addLabel: 'Добавить блок розеток',
    defaults: { anchor: 'topLeft', insetX: 300, insetY: 115 }
  });

  const phoneStandMgr = UI.createEmbeddableManager({
    key: 'phoneStands', label: 'Подставки для телефона', addLabel: 'Добавить подставку',
    defaults: { anchor: 'topRight', insetX: 225, insetY: 105 },
    dimensionsDefault: false
  });

  // Tray: same anchor-based insetX/insetY as every other element above —
  // default anchor is the top edge, where insetY is the inward distance
  // from the top and insetX is a left/right shift from horizontal center
  // (see ANCHOR_INSET's own comment for why that's the same field rather
  // than a separate one). Only extra markup here is the type selector.
  const trayMgr = UI.createEmbeddableManager({
    key: 'trays', label: 'Лотки для сетевого фильтра', addLabel: 'Добавить лоток',
    defaults: { type: '60', anchor: 'top', insetX: 0, insetY: 115 },
    typeSelector: { label: 'Тип лотка', options: [{value:'60', text:'Лоток 60 см'}, {value:'80', text:'Лоток 80 см'}] },
    dimensionsDefault: false
  });

  // Pull-out stand: same treatment as the tray — default anchor is the
  // bottom edge, where insetY is the inward distance from the bottom
  // (auto-adjusted for the ergo-notch in the element itself.
  const pulloutMgr = UI.createEmbeddableManager({
    key: 'pullouts', label: 'Выдвижные подставки', addLabel: 'Добавить подставку',
    defaults: {
	  anchor: 'bottom',
	  insetX: 0,
	  insetY: (inst, p) => (p.notchOn ? p.notchH : 0), },
    dimensionsDefault: false
  });

  // USB charger: only the horizontal position is configurable — its
  // vertical position is fixed by the part's own overhang design (see the
  // usbCharger element's own comment), so it doesn't fit insetFieldsHtml's
  // X/Y shape. insetX starts unset (null) so it follows the underframe's
  // own horizontal inset + 220mm by default (see the element's
  // buildContours), same "blank = follow the underframe" pattern as the
  // pult's insets — the placeholder shows the live computed default and
  // the field is only filled in once the user actually overrides it.
  const usbChargerMgr = UI.createEmbeddableManager({
    key: 'usbChargers', label: 'Торцевые USB-зарядки', addLabel: 'Добавить USB-зарядку',
    defaults: {
      anchor: 'bottomRight',
      insetX: (inst, p) => (p.underframeInsetH || 0) + 220,
      insetY: 0
    },
    cableTargetLabel: 'Кабель-канал'
  });

  // Top notches (T-slot / rectangular cutouts milled into the tabletop's
  // own top edge) — see the topNotchMgr declaration near the top of this
  // file, right after the comment block, and its own entry in
  // ELEMENT_MANAGERS below. Moved there so its section appears first in
  // the controls panel (right after "Подстолье"), while still keeping
  // this file's convention of one declaration per manager.

  const cablePocketMgr = UI.createEmbeddableManager({
    key: 'cablePockets', label: 'Кабельные выемки', addLabel: 'Добавить выемку',
    defaults: { type: 'big' },
    // Each type's own position defaults, as a flat object — cleaner than
    // one function per field with a type check baked inside, and reads
    // the same way regardless of how many types this grows to later.
    typeDefaults: {
      big: {
        anchor: 'right',
        insetX: (inst, p) =>
          p.underframeType === "60" ? p.underframeInsetH + 320 :
          p.underframeType === "70" ? p.underframeInsetH + 350 :
          400,
        insetY: (inst, p) => p.underframeInsetV,
      },
      small: { anchor: 'top', insetX: 250, insetY: 115 },
    },
    typeSelector: {
      label: 'Тип выемки',
      options: optionsFromVariants(CABLE_POCKET_VARIANTS)
    },
    dimensionsDefault: false
  });

  // ---------- Registry of every list-based element manager ----------
  // Every simple embeddable element (anything using UI.createEmbeddableManager
  // above) is registered here ONCE, under the same key its geometry code
  // reads from `p` (see registerSimpleEmbeddable's own paramsKey) and the
  // same key its data is saved/restored under in project files. Adding a
  // new simple element to the whole app — geometry, UI, params wiring,
  // save/load — needs exactly ONE new entry here, instead of hand-editing
  // resolveItems/updatePlaceholders/buildProjectData/setItems separately
  // (those four now just loop over this list). See the "Adding a new
  // element" guide at the top of the js/elements/ directory (GUIDE.md)
  // for the full walkthrough.
  UI.ELEMENT_MANAGERS = [
    { key: 'topNotches', mgr: topNotchMgr },
    { key: 'pults', mgr: pultMgr },
    { key: 'chargers', mgr: chargerMgr },
    { key: 'outletBlocks', mgr: outletBlockMgr },
    { key: 'phoneStands', mgr: phoneStandMgr },
    { key: 'trays', mgr: trayMgr },
    { key: 'pullouts', mgr: pulloutMgr },
    { key: 'usbChargers', mgr: usbChargerMgr },
    { key: 'cablePockets', mgr: cablePocketMgr },
  ];
})();
