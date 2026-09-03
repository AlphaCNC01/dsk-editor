// ============================================================================
// UI — wires the parameter form to Drawing / RenderSVG / ExportDXF. Kept
// deliberately thin: it only reads inputs into a plain params object, asks
// Drawing for the current geometry, and hands that to the renderer or
// exporter. No geometry logic lives here.
// ============================================================================

(function UI(){
  const el = id => document.getElementById(id);

  // ---------- Generic instance-list manager ----------
  // Every repeatable element (chargers, outlet blocks, phone stands,
  // trays, pull-out stands, USB chargers) follows the same UI pattern: a
  // JS array is the source of truth, rows are rebuilt into a DOM
  // container whenever the array changes, and each row's inputs mutate
  // their own instance object directly. This factory captures that
  // pattern once instead of repeating it per element — `rowHtml` builds
  // one row's inner markup from an instance + its index, `defaults`
  // supplies a new instance's starting values, and `extraFieldNames`
  // lists any select fields (besides the anchor field every list has)
  // that need special "changing this repaints the whole row" handling,
  // e.g. a variant/type selector.
  function createInstanceListManager({ containerId, addBtnId, itemLabel, defaults, rowHtml, onChange, onFieldChange, dimensionsDefault = true, onTypeChange = null }){
    // A new project starts with none of these instances — the user adds
    // only what they actually need, rather than getting one by default
    // and having to delete it. (Loading a saved project still restores
    // whatever list that project had, via setItems below.)
    let items = [];
    // onFieldChange (defaults to onChange if not given separately) is
    // what fires per keystroke on a row's own text/number field — kept
    // distinguishable from add/remove's onChange so callers can debounce
    // just the keystroke-driven path (see debouncedRender's own comment)
    // without also delaying the instant feedback of clicking + Add or
    // Remove, which aren't bursty and shouldn't feel laggy.
    const fieldChange = onFieldChange || onChange;

    function add(){
      items.push({ ...defaults(), dimensionsOn: dimensionsDefault });
      renderList();
      onChange();
    }

    function remove(idx){
      items.splice(idx, 1);
      renderList();
      onChange();
    }
    function renderList(){
      const container = el(containerId);
      container.innerHTML = '';
      items.forEach((instance, idx) => {
        const row = document.createElement('div');
        row.className = 'instance-row';
        row.innerHTML = `
          <div class="instance-row-header">
            <span class="instance-row-title">${itemLabel} №${idx + 1}</span>
            <button type="button" class="instance-remove-btn" data-idx="${idx}">Удалить</button>
          </div>
          <div class="toggle-row">
            <span>Размерные линии</span>
            <label class="switch">
              <input type="checkbox" data-field="dimensionsOn" data-idx="${idx}">
              <span class="track"></span>
            </label>
          </div>
          ${rowHtml(instance, idx)}
        `;
        // Restore select values explicitly — setting them via the HTML
        // string's `value` attribute doesn't reliably select the right
        // <option> for dynamically-built markup, same as the charger's
        // original list logic. Checkboxes need the same explicit restore
        // treatment, since a `checked` attribute string in rowHtml can't
        // carry boolean state reliably either. Undefined dimensionsOn
        // (an instance saved before this field existed, from any
        // element) reads as ON — old projects keep showing their
        // dimensions on load rather than silently losing them — while a
        // freshly created instance gets an explicit true/false from
        // dimensionsDefault (see createInstanceListManager), which is
        // what lets an element opt OUT of dimensions by default (cable
        // pockets, phone stand) without affecting saved projects.
        row.querySelectorAll('select[data-field]').forEach(sel => {
          sel.value = instance[sel.dataset.field];
        });
        row.querySelectorAll('input[type="checkbox"][data-field="dimensionsOn"]').forEach(cb => {
          cb.checked = instance.dimensionsOn !== false;
        });
        row.querySelectorAll('input[type="checkbox"][data-field]:not([data-field="dimensionsOn"])').forEach(cb => {
          cb.checked = !!instance[cb.dataset.field];
        });
        container.appendChild(row);
      });

      container.querySelectorAll('[data-field]:not(.anchor-grid-btn)').forEach(input => {
        const handler = () => {
          const idx = parseInt(input.dataset.idx, 10);
          const field = input.dataset.field;
          const isNumeric = input.type === 'number';
          const isCheckbox = input.type === 'checkbox';
          // A blank numeric field is kept as null (rather than coerced to
          // 0) so fields with a computed placeholder default — like the
          // USB charger's insetX — can fall back to that live default in
          // buildContours instead of silently becoming a real zero inset.
          items[idx][field] = isCheckbox ? input.checked
            : isNumeric ? (input.value === '' ? null : (parseFloat(input.value) || 0))
            : input.value;
          if (field === 'type' && onTypeChange) onTypeChange(items[idx]);
          if (input.tagName === 'SELECT') {
            renderList(); // a select change may affect which fields this row shows (e.g. anchor axis visibility)
          }
          // Number/text fields fire on every keystroke — debounced, so
          // typing "150" into an inset field re-renders once after the
          // person pauses, not three times for "1", "15", "150". A select
          // or checkbox change is a single discrete click, not a typing
          // burst, so it stays instant.
          if (isNumeric || input.type === 'text') fieldChange();
          else onChange();
        };
        input.addEventListener('input', handler);
        input.addEventListener('change', handler);
      });
      // Anchor-grid buttons aren't <select>/<input> so they don't fire
      // input/change — handled separately via click. Same downstream
      // effect as a select change (anchor affects which X/Y fields this
      // row shows), so it re-renders the list the same way.
      container.querySelectorAll('.anchor-grid-btn[data-field]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx, 10);
          const field = btn.dataset.field;
          items[idx][field] = btn.dataset.value;
          renderList();
          onChange();
        });
      });
      container.querySelectorAll('.instance-remove-btn').forEach(btn => {
        btn.addEventListener('click', () => remove(parseInt(btn.dataset.idx, 10)));
      });
    }

    el(addBtnId).addEventListener('click', add);
    renderList();

    // setItems replaces the whole instance list wholesale (used by
    // project load) — each loaded instance is merged over a fresh
    // defaults() so a saved file from an older version of the app that's
    // missing a newer field still gets that field's current default
    // rather than ending up undefined. An empty saved list is kept
    // empty — the user may have deliberately removed every instance of
    // this element before saving, and that's exactly what a reload
    // should restore, not silently re-add one with default values.
    function setItems(newItems){
      items = (newItems || []).map(it => ({ ...defaults(), ...it }));
      renderList();
    }

    return { get items(){ return items; }, renderList, setItems };
  }

  // 3x3 grid layout order (row-major, matches how the buttons visually
  // read left-to-right/top-to-bottom) mapped to each cell's anchor value
  // and a title tooltip — same 9 anchors as Elements.ANCHOR_INSET, just
  // presented spatially instead of as text. The center cell doubles as
  // the tabletop's overall center reference.
  const ANCHOR_GRID_CELLS = [
    { anchor: 'topLeft',     title: 'Верхний левый угол' },
    { anchor: 'top',         title: 'Центр верхней стороны' },
    { anchor: 'topRight',    title: 'Верхний правый угол' },
    { anchor: 'left',        title: 'Центр левой стороны' },
    { anchor: 'center',      title: 'Центр столешницы' },
    { anchor: 'right',       title: 'Центр правой стороны' },
    { anchor: 'bottomLeft',  title: 'Нижний левый угол' },
    { anchor: 'bottom',      title: 'Центр нижней стороны' },
    { anchor: 'bottomRight', title: 'Нижний правый угол' },
  ];

  // Builds the anchor-grid markup for one instance row. Kept as a
  // function (not a static string like the old ANCHOR_OPTIONS_ALL) since
  // each button needs its own data-idx, and the active cell needs to be
  // marked up-front so it's correct even before renderList's restore step
  // runs (avoids a one-frame flash of no selection).
  function anchorGridHtml(idx, currentAnchor){
    const cells = ANCHOR_GRID_CELLS.map(({ anchor, title }) => `
      <button type="button" class="anchor-grid-btn${anchor === currentAnchor ? ' active' : ''}"
        data-field="anchor" data-idx="${idx}" data-value="${anchor}"
        title="${title}" aria-label="${title}"></button>
    `).join('');
    return `<div class="anchor-grid">${cells}</div>`;
  }

  // Builds the "Повернуть" (rotation, degrees, counter-clockwise) +
  // "Отразить" (mirror: none/horizontal/vertical) row shared by every
  // embeddable element — both fields sit side by side, matching the
  // anchor row's own two-column layout above, and both transforms are
  // applied around the element's own anchor/reference point (see each
  // element's own buildContours), not its visual center, so rotating or
  // mirroring never moves the point the person actually positioned.
  function transformFieldsHtml(idx, inst){
    return `
      <div class="row2">
        <div class="field">
          <label>Повернуть <span class="unit">°, CCW</span></label>
          <input type="number" data-field="rotation" data-idx="${idx}" value="${inst.rotation || 0}" step="1">
        </div>
        <div class="field">
          <label>Отразить</label>
          <select data-field="mirror" data-idx="${idx}">
            <option value="none">Нет</option>
            <option value="vertical">По вертикали</option>
            <option value="horizontal">По горизонтали</option>
          </select>
        </div>
      </div>`;
  }

  // Opt-in cable-channel toggle, reused by the three element managers that
  // support a cable channel to/from a hardcoded node (see the
  // cableChannels element): wireless charger (-> T-slot notch), USB
  // charger and embeddedUsb pult (-> nearest wireless charger pocket).
  // `label` names what the channel connects to, since that differs per
  // element.
  function cableChannelToggleHtml(idx, inst, label){
    return `
      <div class="toggle-row">
        <span>${label}</span>
        <label class="switch">
          <input type="checkbox" data-field="cableChannel" data-idx="${idx}">
          <span class="track"></span>
        </label>
      </div>`;
  }

  // Builds the anchor-picker + insetX/insetY row shared by every anchor-
  // based embeddable element (charger, outlet block, phone stand, tray,
  // pull-out stand). Both fields are always shown with the same "Отступ
  // по X"/"Отступ по Y" labels regardless of anchor — the two fields
  // don't change meaning depending on what they're near, only their
  // allowed range does: for a directional axis (corner-to-corner, or the
  // "inward" axis of an edge-center anchor) a negative value doesn't mean
  // anything so the field enforces min="0"; for a non-directional axis
  // (the along-the-edge axis of an edge-center anchor, or either axis of
  // 'center') the same field is a signed left/right or up/down shift, so
  // negative values are allowed. This mirrors Elements.ANCHOR_INSET's own
  // directionalX/directionalY exactly, so the UI's constraint always
  // matches what resolveInset actually does with the number. Also
  // includes the shared rotate/mirror row (transformFieldsHtml) below the
  // anchor+inset row, since every element using this shares that too.
  function insetFieldsHtml(idx, inst) {
    const info = Elements.ANCHOR_INSET[inst.anchor] || Elements.ANCHOR_INSET.center;
    const minX = info.directionalX ? ' min="0"' : '';
    const minY = info.directionalY ? ' min="0"' : '';
    const xVal = inst.insetX != null ? inst.insetX : '';
    const yVal = inst.insetY != null ? inst.insetY : '';
    return `
      <div class="anchor-row">
        <div class="field">
          <label class="anchor-grid-label">Точка отсчёта</label>
          ${anchorGridHtml(idx, inst.anchor)}
        </div>
        <div class="field-col">
          <div class="field">
            <label>Отступ по X <span class="unit">мм</span></label>
            <input type="number" data-field="insetX" data-idx="${idx}" value="${xVal}"${minX} step="1">
          </div>
          <div class="field">
            <label>Отступ по Y <span class="unit">мм</span></label>
            <input type="number" data-field="insetY" data-idx="${idx}" value="${yVal}"${minY} step="1">
          </div>
        </div>
      </div>
      ${transformFieldsHtml(idx, inst)}`;
  }


  // ---------- Embeddable-element manager factory ----------
  // Shared machinery for every anchor-positioned, repeatable element
  // (charger, tray, cable pocket, etc.): auto-creates its UI section,
  // wires up the instance list, and resolves per-instance defaults —
  // removing the need to hand-roll onChange handling, default
  // transforms, or rowHtml separately for each element.

  // Ensures the given simple element has its own UI section (a fieldset
  // with a title, an empty list container, and an "+ Add" button) inside
  // the controls panel. Every element in this app gets its section this
  // way — none of them have any hand-written HTML for it — so a brand-new
  // element never needs its own HTML block either: passing `key` +
  // `label` to createEmbeddableManager is enough, and this function fills
  // in the container/button ids from `key` and builds the markup on the
  // fly. The existence check just guards against double-creating a
  // section if this is ever accidentally called twice for the same key.
  function ensureElementSection(key, label, addLabel){
    const containerId = `${key}List`;
    const addBtnId = `add${key.charAt(0).toUpperCase()}${key.slice(1)}Btn`;
    if (!document.getElementById(containerId)) {
      const fieldset = document.createElement('fieldset');
      fieldset.innerHTML = `
        <legend>${label}</legend>
        <div id="${containerId}"></div>
        <button type="button" id="${addBtnId}" class="btn-add">+ ${addLabel}</button>
      `;
      document.getElementById('controls').appendChild(fieldset);
    }
    return { containerId, addBtnId };
  }

  function createEmbeddableManager(cfg) {
    const { key, label, typeSelector = null, cableChannelLabel = null, cableChannelWhen = null, addLabel, dimensionsDefault = true, typeDefaults = null } = cfg;
    // Every element's UI section is auto-created from `key`+`label` — see
    // ensureElementSection — so there's no hand-written HTML to keep in
    // sync when adding a new element, and the panel's own visible order
    // is simply the order createEmbeddableManager is called in.
    const { containerId, addBtnId } = ensureElementSection(key, label, addLabel || `Добавить: ${label}`);
    const container = containerId, btn = addBtnId;
    // Defaults are kept as-is (raw) here since a value may be a function
    // (evaluated lazily per-instance, per-render — see evalVal) rather
    // than a plain literal.
    const rawDefaults = { rotation: 0, mirror: 'none', ...cfg.defaults };
    const showTypeSelector = typeSelector && typeSelector.options.length > 1;
    
    // Resolves a default value that may be a plain literal or a function
    // of (inst, p) — insetX/insetY/anchor can all be given either way.
    const evalVal = (val, inst, p) => typeof val === 'function' ? val(inst, p) : val;

    // Resolves the defaults for one instance's own `type`: the shared
    // rawDefaults, with anything present in typeDefaults[type] layered
    // on top — e.g. cablePocket's two sizes each declare their own
    // anchor/insetX/insetY as one flat object per type, instead of a
    // single function per field with a type check baked inside (which
    // gets harder to read the moment a third type shows up). Elements
    // with no typeDefaults at all (most of them) just get rawDefaults
    // back unchanged.
    function defaultsForType(type){
      if (!typeDefaults || !typeDefaults[type]) return rawDefaults;
      return { ...rawDefaults, ...typeDefaults[type] };
    }

    const mgr = createInstanceListManager({
      containerId: container,
      addBtnId: btn,
      itemLabel: label,
      dimensionsDefault,
      // insetX/insetY are always started at null (empty) for a new
      // instance. `anchor` CAN be given as a function (or, via typeDefaults, a
      // different literal per type) too — unlike insetX/insetY, which
      // stay null until the person actually sets them and are evaluated
      // live on every render (so they track a changing default, like the
      // underframe's own position), `anchor` has no "placeholder"
      // concept in the UI, so it's resolved ONCE here at creation time
      // instead, using whatever `type` default is already set.
      defaults: () => {
        const d = defaultsForType(rawDefaults.type);
        return { ...d, anchor: evalVal(d.anchor, d, {}), insetX: null, insetY: null };
      },
      onChange: () => render(),
      onFieldChange: () => debouncedRender(),
      // Called whenever an existing instance's own `type` select changes
      // (see createInstanceListManager's generic field handler) — resets
      // `anchor` to the new type's own default, same one-time resolution
      // as instance creation above, so switching type doesn't leave a
      // stale anchor from the previous type sitting there unexplained.
      // insetX/insetY are deliberately left alone: if the person already
      // has a specific position they care about, changing type shouldn't
      // silently move it — they stay null (still showing this type's own
      // live placeholder default) unless the person had already
      // overridden them, in which case that override is preserved.
      onTypeChange: typeDefaults ? (inst) => {
        const d = defaultsForType(inst.type);
        if (d.anchor !== undefined) inst.anchor = evalVal(d.anchor, d, {});
      } : null,
      rowHtml: (inst, idx) => {
        let html = '';
        if (showTypeSelector) {
          html += `
            <div class="field">
              <label>${typeSelector.label}</label>
              <select data-field="type" data-idx="${idx}">
                ${typeSelector.options.map(o => `<option value="${o.value}">${o.text}</option>`).join('')}
              </select>
            </div>`;
        }
        html += insetFieldsHtml(idx, inst);
        if (cableChannelLabel && (!cableChannelWhen || cableChannelWhen(inst))) {
          html += cableChannelToggleHtml(idx, inst, cableChannelLabel);
        }
        return html;
      }
    });

    // Refreshes every row's placeholder (the greyed-out number shown when
    // insetX/insetY is empty) to that instance's own type's current
    // default — called on every render, since the default itself can
    // depend on other params (e.g. the underframe's own position).
    mgr.updatePlaceholders = (p) => {
      const containerEl = document.getElementById(container);
      if (!containerEl) return;
      
      containerEl.querySelectorAll('.instance-row').forEach((row, idx) => {
        const inst = mgr.items[idx];
        if (!inst) return;
        
        const d = defaultsForType(inst.type);
        const defX = evalVal(d.insetX, inst, p);
        const defY = evalVal(d.insetY, inst, p);
        
        const inpX = row.querySelector('input[data-field="insetX"]');
        if (inpX && defX != null) inpX.placeholder = defX;
        
        const inpY = row.querySelector('input[data-field="insetY"]');
        if (inpY && defY != null) inpY.placeholder = defY;
      });
    };

    // Hands the geometry code a plain array with every instance's own
    // defaults already resolved (insetX/insetY filled in from
    // defaultsForType wherever the person left them empty) — the rest of
    // the app only ever deals in concrete numbers, never null-or-default.
    mgr.resolveItems = (p) => mgr.items.map(it => {
      const d = defaultsForType(it.type);
      return {
        ...it,
        insetX: it.insetX != null ? it.insetX : evalVal(d.insetX, it, p),
        insetY: it.insetY != null ? it.insetY : evalVal(d.insetY, it, p)
      };
    });

    return mgr;
  }


  // ---------- Instance-list managers ----------
  // Each repeatable element gets one manager built on the shared factory
  // above. insetFieldsHtml builds the anchor-picker + X/Y row shared by
  // every anchor-based element; only what genuinely differs between
  // elements (labels, default position, an optional type selector, or —
  // for the USB charger — a completely different one-axis shape) lives
  // in each manager below.

  // ---------- Element managers ----------
  // Every element below is declared in the ORDER its section should
  // appear in the controls panel — with no static HTML for any of them
  // (see ensureElementSection, called internally by
  // createEmbeddableManager) — the panel's own visual order comes purely
  // from this declaration order, top to bottom.
  const pultMgr = createEmbeddableManager({ 
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
    cableChannelLabel: 'Кабель-канал до большого кармана',
    cableChannelWhen: (inst) => inst.type === 'embeddedUsb'
  });

  const chargerMgr = createEmbeddableManager({ 
    key: 'chargers', label: 'Беспроводные зарядки', addLabel: 'Добавить зарядку',
    defaults: { anchor: 'topRight', insetX: 225, insetY: 200 },
    cableChannelLabel: 'Кабель-канал до Т-выреза'
  });

  const outletBlockMgr = createEmbeddableManager({ 
    key: 'outletBlocks', label: 'Блоки розеток', addLabel: 'Добавить блок розеток',
    defaults: { anchor: 'topLeft', insetX: 300, insetY: 115 } 
  });

  const phoneStandMgr = createEmbeddableManager({ 
    key: 'phoneStands', label: 'Подставки для телефона', addLabel: 'Добавить подставку',
    defaults: { anchor: 'topRight', insetX: 225, insetY: 105 },
    dimensionsDefault: false
  });

  // Tray: same anchor-based insetX/insetY as every other element above —
  // default anchor is the top edge, where insetY is the inward distance
  // from the top and insetX is a left/right shift from horizontal center
  // (see ANCHOR_INSET's own comment for why that's the same field rather
  // than a separate one). Only extra markup here is the type selector.
  const trayMgr = createEmbeddableManager({ 
    key: 'trays', label: 'Лотки для сетевого фильтра', addLabel: 'Добавить лоток',
    defaults: { type: '60', anchor: 'top', insetX: 0, insetY: 115 },
    typeSelector: { label: 'Тип лотка', options: [{value:'60', text:'Лоток 60 см'}, {value:'80', text:'Лоток 80 см'}] }
  });

  // Pull-out stand: same treatment as the tray — default anchor is the
  // bottom edge, where insetY is the inward distance from the bottom
  // (auto-adjusted for the ergo-notch in the element itself.
  const pulloutMgr = createEmbeddableManager({ 
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
  const usbChargerMgr = createEmbeddableManager({ 
    key: 'usbChargers', label: 'Торцевые USB-зарядки', addLabel: 'Добавить USB-зарядку',
    defaults: { 
      anchor: 'bottomRight', 
      insetX: (inst, p) => (p.underframeInsetH || 0) + 220, 
      insetY: 0 
    },
    cableChannelLabel: 'Кабель-канал до малого кармана'
  });

  const cablePocketMgr = createEmbeddableManager({
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
  // Every simple embeddable element (anything using createEmbeddableManager
  // above) is registered here ONCE, under the same key its geometry code
  // reads from `p` (see registerSimpleEmbeddable's own paramsKey) and the
  // same key its data is saved/restored under in project files. Adding a
  // new simple element to the whole app — geometry, UI, params wiring,
  // save/load — needs exactly ONE new entry here, instead of hand-editing
  // resolveItems/updatePlaceholders/buildProjectData/setItems separately
  // (those four now just loop over this list). See the "Adding a new
  // element" guide at the top of this file for the full walkthrough.
  const ELEMENT_MANAGERS = [
    { key: 'pults', mgr: pultMgr },
    { key: 'chargers', mgr: chargerMgr },
    { key: 'outletBlocks', mgr: outletBlockMgr },
    { key: 'phoneStands', mgr: phoneStandMgr },
    { key: 'trays', mgr: trayMgr },
    { key: 'pullouts', mgr: pulloutMgr },
    { key: 'usbChargers', mgr: usbChargerMgr },
    { key: 'cablePockets', mgr: cablePocketMgr },
  ];

  // ---------- Fixed (non-list) inputs ----------
  const inputs = {
    orderNumber: el('orderNumber'),
    rectW: el('rectW'), rectH: el('rectH'), rectThickness: el('rectThickness'),
    rTop: el('rTop'), rBottom: el('rBottom'), rNotch: el('rNotch'),
    notchOn: el('notchOn'),
    notchH: el('notchH'), notchBottom: el('notchBottom'), notchTop: el('notchTop'),
    topNotchType: el('topNotchType'),
    topNotchWidth: el('topNotchWidth'), topNotchOffset: el('topNotchOffset'),
    rTopNotch: el('rTopNotch'),
    underframeType: el('underframeType'),
    underframeInsetH: el('underframeInsetH'), underframeInsetV: el('underframeInsetV'),
    dimensionsOn: el('dimensionsOn'),
  };
  const notchFieldsWrap = el('notchFields');
  const topNotchFieldsWrap = el('topNotchFields');
  const underframeFieldsWrap = el('underframeFields');
  const svg = el('stage');

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
      topNotchType: inputs.topNotchType.value,
      topNotchWidth: parseFloat(inputs.topNotchWidth.value) || 0,
      topNotchOffset: parseFloat(inputs.topNotchOffset.value) || 0,
      rTopNotch: parseFloat(inputs.rTopNotch.value) || 0,
      underframeType: inputs.underframeType.value,
      underframeInsetH: underframeInsetH,
      underframeInsetV: parseFloat(inputs.underframeInsetV.value) || 0,
      dimensionsOn: inputs.dimensionsOn.checked,
    };

    // Now that `p` has every plain param, resolve each element's own
    // instances against it — this is what turns a function-valued
    // default (e.g. "220mm past the underframe's own edge") into a
    // concrete number, ready for the geometry code to consume directly.
    for (const { key, mgr } of ELEMENT_MANAGERS) p[key] = mgr.resolveItems(p);

    return p;
  }

  function render(){
    // Show/hide the field groups that only make sense when their own
    // toggle is on (the ergo notch, the top notch, the underframe).
    notchFieldsWrap.classList.toggle('disabled', !inputs.notchOn.checked);
    topNotchFieldsWrap.classList.toggle('disabled', inputs.topNotchType.value === 'none');
    underframeFieldsWrap.classList.toggle('disabled', inputs.underframeType.value === 'none');

    const p = readParams();
    if (p.W <= 0 || p.H <= 0) return;

    // Refresh every element's own placeholder numbers to match the
    // params just read (an element's default can depend on another
    // field, like the underframe's own inset).
    for (const { mgr } of ELEMENT_MANAGERS) mgr.updatePlaceholders(p);

    // Build the tabletop's own geometry plus its dimension lines.
    const entries = Drawing.build(p);
    const dims = Dimensions.build(p);
    const allEntries = [...entries, ...dims.entries];
    const svgMarkup = RenderSVG.build(allEntries, p.W, p.H, dims.texts);

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
    closeExportMenu();
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

  // ---------- Project save/load ----------
  // Serializes every raw form field plus each instance list's raw items —
  // i.e. exactly what the user typed/selected, not the resolved geometry
  // (positions, contours) that's derived from it — so a loaded project
  // re-derives its drawing the same way a freshly-typed one would,
  // including picking up any live defaults (underframe-linked insets etc)
  // that were left blank on purpose.
  const PROJECT_FILE_VERSION = 1;
  const SIMPLE_INPUT_IDS = [
    'orderNumber', 'rectW', 'rectH', 'rectThickness', 'rTop', 'rBottom', 'rNotch',
    'notchOn', 'notchH', 'notchBottom', 'notchTop',
    'topNotchType', 'topNotchWidth', 'topNotchOffset', 'rTopNotch',
    'underframeType', 'underframeInsetH', 'underframeInsetV',
    'dimensionsOn',
  ];

  function buildProjectData(){
    const values = {};
    for (const id of SIMPLE_INPUT_IDS) {
      const input = el(id);
      values[id] = input.type === 'checkbox' ? input.checked : input.value;
    }
    return {
      fileType: 'tabletop-layout-project',
      version: PROJECT_FILE_VERSION,
      values,
      instances: Object.fromEntries(ELEMENT_MANAGERS.map(({ key, mgr }) => [key, mgr.items])),
    };
  }

  function saveProject(){
    const data = buildProjectData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFilename(inputs.orderNumber.value) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function applyProjectData(data){
    if (!data || data.fileType !== 'tabletop-layout-project' || !data.values) {
      throw new Error('Файл не похож на проект столешницы.');
    }
    for (const id of SIMPLE_INPUT_IDS) {
      if (!(id in data.values)) continue;
      const input = el(id);
      const val = data.values[id];
      if (input.type === 'checkbox') input.checked = !!val;
      else input.value = val === null || val === undefined ? '' : val;
    }
    const inst = data.instances || {};
    for (const { key, mgr } of ELEMENT_MANAGERS) mgr.setItems(inst[key]);
    render();
  }

  function loadProject(file){
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        applyProjectData(data);
      } catch (err) {
        alert('Не удалось загрузить проект: ' + err.message);
      }
    };
    reader.onerror = () => alert('Не удалось прочитать файл.');
    reader.readAsText(file);
  }

  Object.values(inputs).forEach(inp => {
    inp.addEventListener('input', debouncedRender);
    inp.addEventListener('change', debouncedRender);
  });
  el('exportMainBtn').addEventListener('click', () => runExport('png'));
  el('exportMenuToggle').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleExportMenu();
  });
  el('exportMenu').querySelectorAll('button[data-format]').forEach(btn => {
    btn.addEventListener('click', () => runExport(btn.dataset.format));
  });
  document.addEventListener('click', (e) => {
    if (!el('exportSplit').contains(e.target)) closeExportMenu();
  });
  el('saveProjectBtn').addEventListener('click', saveProject);
  el('loadProjectBtn').addEventListener('click', () => el('loadProjectInput').click());
  el('loadProjectInput').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) loadProject(file);
    e.target.value = ''; // allow re-selecting the same file later
  });

  render();
})();