// ============================================================================
// ConfiguratorImport — turns a state exported by the deskos.ru tabletop
// configurator (expert mode) into this app's own project format
// ('tabletop-layout-project', see app-project.js), so it can be loaded
// through the normal "Загрузить" path.
//
// Accepted input text (see parseText):
//   - the configurator's JSON itself ({"L":1100,"W":600,"shape":"ergo",...})
//   - the configurator's share link — its state lives in the URL hash as
//     "#c=<base64 of that same JSON>"
//   - the bare base64 string from such a hash
//   - a project file this app saved itself (passed through untouched)
//
// Pure functions, no DOM: loaded before app-project.js, which calls
// ConfiguratorImport.parseText().
//
// What maps and what doesn't:
//   L, W, thickness, rTop/rBottom/rNotch, wood      -> same-named form fields
//   shape 'ergo' + ergoOuter/ergoInner/ergoD         -> ergonomic notch
//   frame* + frameInset                              -> underframe
//   items.cable[]                                    -> top wire notches
//   opts.wireless/usb + pos.wireless/usb             -> charger instances
//   items.outlets[]                                  -> outlet blocks
//   items.hook[]                                     -> 60 cm trays
//   shape 'corner', fit.*                            -> NOT supported here;
//     'corner' aborts the import, fit.* is only the configurator's laptop/monitor
//     preview and has no counterpart in a drawing).
// ============================================================================
const ConfiguratorImport = (() => {
  // Used when the configurator leaves ergoOuter/ergoInner/ergoD as null
  // ("site default"): the sizes the site itself draws and dimensions
  // (45 / 33 / 4 cm) for an untouched ergo notch.
  const ERGO_DEFAULTS = { outer: 450, inner: 330, depth: 40 };

  // Thickness options the form's <select> actually has.
  const THICKNESS_OPTIONS = [30, 40];

  // Radius used for imported wire notches (the configurator has no field
  // for it); same as the notch list's own default in element-managers.js.
  const TOP_NOTCH_RADIUS = 5;

  // Which underframe a configurator frame maps to: the site's regular
  // frame ('std') is our '60', the reinforced one ('pro') is our '70'.
  // (X2DM-PRO is another variant of the regular frame, not used for now —
  // not every article is in the app yet.) Anything non-electric (or
  // unknown) becomes "no underframe".
  const UNDERFRAME_BY_MODEL = { std: '60', pro: '70' };

  // fy of embedded parts is a fraction of the tabletop depth, measured from
  // the ergo-notch edge (bottom edge in this app) — confirmed against the
  // site's own drawing. Set false to measure from the opposite edge.
  const FY_FROM_NOTCH_EDGE = true;

  const TINTS = ['natural', 'white', 'honey', 'walnut', 'wenge', 'gray'];

  function isConfigurator(obj){
    return !!obj && typeof obj === 'object' && typeof obj.shape === 'string'
      && Number.isFinite(obj.L) && Number.isFinite(obj.W);
  }

  function num(v, fallback){
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  }

  function underframeFor(c){
    if (c.frameKind !== 'electric') return 'none';
    return UNDERFRAME_BY_MODEL[c.frameModel] || 'none';
  }

  function convert(c){
    const warnings = [];
    if (c.shape === 'corner') {
      throw new Error('Угловая столешница (shape: "corner") в редакторе не поддерживается.');
    }
    if (c.shape !== 'ergo' && c.shape !== 'rect') {
      warnings.push(`Неизвестная форма «${c.shape}» — импортирована как прямоугольная.`);
    }

    const L = c.L, W = c.W;
    const thickness = THICKNESS_OPTIONS.reduce((best, t) =>
      Math.abs(t - c.thickness) < Math.abs(best - c.thickness) ? t : best, THICKNESS_OPTIONS[0]);
    if (Number.isFinite(c.thickness) && !THICKNESS_OPTIONS.includes(c.thickness)) {
      warnings.push(`Толщина ${c.thickness} мм недоступна — выбрана ${thickness} мм.`);
    }

    const ergo = c.shape === 'ergo';
    const values = {
      rectW: L,
      rectH: W,
      rectThickness: String(thickness),
      notchOn: ergo,
      underframeType: underframeFor(c),
      underframeInsetH: num(c.frameInset, 50),
    };
    if (Number.isFinite(c.rTop)) values.rTop = c.rTop;
    if (Number.isFinite(c.rBottom)) values.rBottom = c.rBottom;
    if (Number.isFinite(c.rNotch)) values.rNotch = c.rNotch;
    if (ergo) {
      values.notchBottom = num(c.ergoOuter, ERGO_DEFAULTS.outer);
      values.notchTop = num(c.ergoInner, ERGO_DEFAULTS.inner);
      values.notchH = num(c.ergoD, ERGO_DEFAULTS.depth);
    }
    if (TINTS.includes(c.wood)) values.woodTint = c.wood;
    else if (c.wood) warnings.push(`Оттенок «${c.wood}» неизвестен — оттенок в превью не изменён.`);

    const items = c.items || {};
    const topNotches = [];
    for (const it of items.cable || []) {
      const type = it.type === 'rect' ? 'rect' : (it.type === 'tslot' || it.type === 't') ? 'tslot' : null;
      if (!type) { warnings.push(`Вырез для проводов типа «${it.type}» пропущен.`); continue; }
      topNotches.push({
        type,
        width: num(it.width, 300),
        offset: Math.round((num(it.fx, 0.5) - 0.5) * L),
        r: TOP_NOTCH_RADIUS,
      });
    }

    // fx/fy are fractions of the tabletop (see FY_FROM_NOTCH_EDGE).
    const place = (p) => ({
      anchor: FY_FROM_NOTCH_EDGE ? 'bottomLeft' : 'topLeft',
      insetX: Math.round(num(p.fx, 0.5) * L),
      insetY: Math.round(num(p.fy, 0.5) * W),
    });
    // The site's "hook" ("подвес" on its drawing) is the 60 cm power-strip
    // tray: 60 cm body with two end brackets, centered on (fx, fy).
    const trays = (items.hook || []).map(h => ({ type: '60', ...place(h) }));
    const outletBlocks = (items.outlets || []).map(place);
    const opts = c.opts || {}, pos = c.pos || {};
    const chargers = [];
    if (opts.wireless) {
      const p = pos.wireless || {};
      chargers.push(place(p));
    }
    const usbChargers = [];
    if (opts.usb) {
      const p = pos.usb || {};
      usbChargers.push({ anchor: 'bottomLeft', insetX: Math.round(num(p.fx, 0.5) * L), insetY: 0 });
    }

    return {
      project: {
        fileType: 'tabletop-layout-project',
        version: 1,
        values,
        instances: { topNotches, chargers, usbChargers, outletBlocks, trays },
      },
      warnings,
    };
  }

  function base64ToText(b64){
    const s = b64.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(s + '==='.slice((s.length + 3) % 4));
    const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  // Returns { data, warnings } where data is ready for UI.applyProjectData.
  function parseText(text){
    const trimmed = String(text).replace(/^﻿/, '').trim();
    let obj;
    if (trimmed.startsWith('{')) {
      obj = JSON.parse(trimmed);
    } else {
      const m = trimmed.match(/[#&?]c=([^&\s]+)/);
      const payload = decodeURIComponent(m ? m[1] : trimmed);
      try { obj = JSON.parse(base64ToText(payload)); }
      catch (err) { throw new Error('не удалось разобрать содержимое как JSON или ссылку конфигуратора'); }
    }
    if (obj && obj.fileType === 'tabletop-layout-project') return { data: obj, warnings: [] };
    if (isConfigurator(obj)) {
      const { project, warnings } = convert(obj);
      return { data: project, warnings };
    }
    throw new Error('Файл не похож ни на проект столешницы, ни на экспорт конфигуратора.');
  }

  return { parseText, convert, isConfigurator };
})();
