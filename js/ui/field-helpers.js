// ============================================================================
// UI field helpers + UI.createEmbeddableManager — shared markup builders
// (anchor grid, inset fields, rotate/mirror row, cable-channel toggle) plus
// the factory built on top of them: every anchor-positioned, repeatable
// element (charger, tray, cable pocket, etc.) is created via
// UI.createEmbeddableManager, which auto-creates its own UI section, wires
// up its instance list (via UI.createInstanceListManager from
// instance-list.js), and resolves per-instance defaults.
// ============================================================================

(function(){
  const el = UI.el;

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

  // Cable-channel TARGET picker, reused by the three element managers
  // that support a channel from a hardcoded node on that element (see
  // the cableChannels element): wireless charger, USB charger, and
  // embeddedUsb pult. Every source offers the SAME target vocabulary
  // ('none' / the T-slot / any small pocket by number / any big pocket
  // by number) — this markup only creates the <select> itself, with just
  // the always-available 'none' option; the actual T-slot/pocket options
  // are filled in (and the previously-chosen value restored) by
  // updateCableTargetOptions below on every render, since which pockets
  // exist can change at any time. `label` names the field itself in the
  // panel, e.g. "Кабель-канал".
  function cableTargetSelectHtml(idx, inst, label){
    return `
      <div class="field">
        <label>${label}</label>
        <select data-field="cableTarget" data-idx="${idx}" data-cable-target-select>
          <option value="none">Нет</option>
        </select>
      </div>`;
  }

  // Rebuilds every cable-target <select>'s own option list to match the
  // CURRENT project's T-slot/pocket instances, and restores whichever
  // value that instance already had selected (falling back to 'none' if
  // the previously-chosen target no longer exists — same "just stop
  // routing there" behavior as buildContours itself, see cableChannels).
  // Called on every render (like updatePlaceholders) since the set of
  // available targets can change on any keystroke (adding/removing a
  // pocket, or toggling the top-notch type).
  function updateCableTargetOptions(containerId, items, p){
    const containerEl = document.getElementById(containerId);
    if (!containerEl) return;
    const smallCount = (p.cablePockets || []).filter(i => i.type === 'small').length;
    const bigCount = (p.cablePockets || []).filter(i => i.type === 'big').length;
    const hasTSlot = p.topNotchType === 'tslot' && p.topNotchWidth > 0;
    let optionsHtml = '<option value="none">Нет</option>';
    if (hasTSlot) optionsHtml += '<option value="tslot">Т-вырез</option>';
    for (let i = 0; i < bigCount; i++) optionsHtml += `<option value="bigPocket:${i}">Большой карман №${i + 1}</option>`;
    for (let i = 0; i < smallCount; i++) optionsHtml += `<option value="smallPocket:${i}">Малый карман №${i + 1}</option>`;

    containerEl.querySelectorAll('select[data-cable-target-select]').forEach(sel => {
      const idx = parseInt(sel.dataset.idx, 10);
      const inst = items[idx];
      if (!inst) return;
      sel.innerHTML = optionsHtml;
      const wanted = inst.cableTarget || 'none';
      sel.value = [...sel.options].some(o => o.value === wanted) ? wanted : 'none';
      if (sel.value !== wanted) inst.cableTarget = 'none';
    });
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
    const { key, label, typeSelector = null, cableTargetLabel = null, cableTargetWhen = null, addLabel, dimensionsDefault = true, typeDefaults = null } = cfg;
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

    const mgr = UI.createInstanceListManager({
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
      onChange: () => UI.render(),
      onFieldChange: () => UI.debouncedRender(),
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
        if (cableTargetLabel && (!cableTargetWhen || cableTargetWhen(inst))) {
          html += cableTargetSelectHtml(idx, inst, cableTargetLabel);
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

      updateCableTargetOptions(container, mgr.items, p);
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

  Object.assign(UI, {
    anchorGridHtml, transformFieldsHtml, cableTargetSelectHtml, updateCableTargetOptions, insetFieldsHtml,
    ensureElementSection, createEmbeddableManager,
  });
})();
