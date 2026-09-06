// ============================================================================
// UI element managers — one UI.createEmbeddableManager call per repeatable
// element, plus UI.ELEMENT_MANAGERS, the registry every other generic loop
// (readParams, render, buildProjectData, applyProjectData) iterates over
// instead of hand-listing every element separately. See the "Adding a new
// element" guide referenced below for the full walkthrough.
// ============================================================================

(function(){
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
      options: [{value:'standard', text:'Стандартный'}, {value:'embeddedUsb', text:'Встраиваемый с USB'}]
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
    typeSelector: { label: 'Тип лотка', options: [{value:'60', text:'Лоток 60 см'}, {value:'80', text:'Лоток 80 см'}] }
  });

  // Pull-out stand: same treatment as the tray — default anchor is the
  // bottom edge, where insetY is the inward distance from the bottom
  // (auto-adjusted for the ergo-notch in the element itself.
  const pulloutMgr = UI.createEmbeddableManager({
    key: 'pullouts', label: 'Выдвижные подставки', addLabel: 'Добавить подставку',
    defaults: {
	  anchor: 'bottom',
	  insetX: 0,
	  insetY: (inst, p) => (p.notchOn ? p.notchH : 0), }
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
      options: [{value:'big', text:'Большая'}, {value:'small', text:'Малая'}]
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
