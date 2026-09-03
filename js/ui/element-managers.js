// ============================================================================
// Element Managers — декларация менеджеров для каждого элемента.
// Каждый элемент declared в ORDER его секция должна появляться в controls panel.
// ============================================================================

(function ElementManagersModule(){
  // ---------- Registry of every list-based element manager ----------
  // Каждый simple embeddable element (anything using createEmbeddableManager
  // above) registered здесь ONCE, под тем же key его geometry code reads from
  // `p` (см. registerSimpleEmbeddable's own paramsKey) и тем же key его data
  // is saved/restored under in project files. Adding a new simple element
  // to the whole app — geometry, UI, params wiring, save/load — needs
  // exactly ONE new entry here, вместо hand-editing
  // resolveItems/updatePlaceholders/buildProjectData/setItems separately
  // (those four now just loop over this list). See the "Adding a new
  // element" guide at the top of this file for the full walkthrough.

  const ELEMENT_MANAGERS = [];
  window.ELEMENT_MANAGERS = ELEMENT_MANAGERS;

  // Пульты управления
  const pultMgr = CreateEmbeddableManager({
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
    // Только embeddedUsb variant имеет USB module cutout чтобы route a
    // channel from (см. the pult element's own cableNode, defined only on
    // that variant) — Standard has nothing for a channel to start at.
    cableChannelLabel: 'Кабель-канал до большого кармана',
    cableChannelWhen: (inst) => inst.type === 'embeddedUsb'
  });
  ELEMENT_MANAGERS.push({ key: 'pults', mgr: pultMgr });

  // Беспроводные зарядки
  const chargerMgr = CreateEmbeddableManager({
    key: 'chargers', label: 'Беспроводные зарядки', addLabel: 'Добавить зарядку',
    defaults: { anchor: 'topRight', insetX: 225, insetY: 200 },
    cableChannelLabel: 'Кабель-канал до Т-выреза'
  });
  ELEMENT_MANAGERS.push({ key: 'chargers', mgr: chargerMgr });

  // Блоки розеток
  const outletBlockMgr = CreateEmbeddableManager({
    key: 'outletBlocks', label: 'Блоки розеток', addLabel: 'Добавить блок розеток',
    defaults: { anchor: 'topLeft', insetX: 300, insetY: 115 }
  });
  ELEMENT_MANAGERS.push({ key: 'outletBlocks', mgr: outletBlockMgr });

  // Подставки для телефона
  const phoneStandMgr = CreateEmbeddableManager({
    key: 'phoneStands', label: 'Подставки для телефона', addLabel: 'Добавить подставку',
    defaults: { anchor: 'topRight', insetX: 225, insetY: 105 },
    dimensionsDefault: false
  });
  ELEMENT_MANAGERS.push({ key: 'phoneStands', mgr: phoneStandMgr });

  // Лотки для сетевого фильтра
  const trayMgr = CreateEmbeddableManager({
    key: 'trays', label: 'Лотки для сетевого фильтра', addLabel: 'Добавить лоток',
    defaults: { type: '60', anchor: 'top', insetX: 0, insetY: 115 },
    typeSelector: { label: 'Тип лотка', options: [{value:'60', text:'Лоток 60 см'}, {value:'80', text:'Лоток 80 см'}] }
  });
  ELEMENT_MANAGERS.push({ key: 'trays', mgr: trayMgr });

  // Выдвижные подставки
  const pulloutMgr = CreateEmbeddableManager({
    key: 'pullouts', label: 'Выдвижные подставки', addLabel: 'Добавить подставку',
    defaults: {
      anchor: 'bottom',
      insetX: 0,
      insetY: (inst, p) => (p.notchOn ? p.notchH : 0),
    }
  });
  ELEMENT_MANAGERS.push({ key: 'pullouts', mgr: pulloutMgr });

  // Торцевые USB-зарядки
  const usbChargerMgr = CreateEmbeddableManager({
    key: 'usbChargers', label: 'Торцевые USB-зарядки', addLabel: 'Добавить USB-зарядку',
    defaults: {
      anchor: 'bottomRight',
      insetX: (inst, p) => (p.underframeInsetH || 0) + 220,
      insetY: 0
    },
    cableChannelLabel: 'Кабель-канал до малого кармана'
  });
  ELEMENT_MANAGERS.push({ key: 'usbChargers', mgr: usbChargerMgr });

  // Кабельные выемки
  const cablePocketMgr = CreateEmbeddableManager({
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
  ELEMENT_MANAGERS.push({ key: 'cablePockets', mgr: cablePocketMgr });
})();
